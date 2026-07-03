import { useEffect, useMemo, useState } from 'react'
import { supabaseAdmin } from '../lib/supabase'
import Topbar from '../components/Topbar'
import {
  IconAlertTriangle,
  IconBuildingStore,
  IconCalendarTime,
  IconChartBar,
  IconChecklist,
  IconClock,
  IconDownload,
  IconFilter,
  IconReceipt,
  IconTargetArrow,
  IconTrendingDown,
  IconTrendingUp,
  IconUsers,
} from '@tabler/icons-react'
import {
  AreaChart,
  Area,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
} from 'recharts'

function fmt(n) {
  return Number(n || 0).toLocaleString('pt-BR', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })
}

function fmtInt(n) {
  return Number(n || 0).toLocaleString('pt-BR', {
    maximumFractionDigits: 0,
  })
}

function fmtK(n) {
  const v = Number(n || 0)

  if (Math.abs(v) >= 1000000) return `R$ ${(v / 1000000).toFixed(1)} mi`
  if (Math.abs(v) >= 1000) return `R$ ${(v / 1000).toFixed(1)} mil`

  return `R$ ${fmt(v)}`
}

function pct(atual, anterior) {
  const a = Number(atual || 0)
  const b = Number(anterior || 0)

  if (a === 0 && b === 0) return 0
  if (b === 0) return 100

  return ((a - b) / b) * 100
}

function toISO(d) {
  return d.toISOString().split('T')[0]
}

function periodoRange(periodo) {
  const hoje = new Date()
  const ano = hoje.getFullYear()
  const mes = hoje.getMonth()

  if (periodo === 'mes') return [new Date(ano, mes, 1), hoje]
  if (periodo === 'trimestre') return [new Date(ano, mes - 2, 1), hoje]
  if (periodo === 'semestre') return [new Date(ano, mes - 5, 1), hoje]

  return [new Date(ano, 0, 1), hoje]
}

function periodoAnterior(periodo) {
  const [ini, fim] = periodoRange(periodo)
  const diff = fim.getTime() - ini.getTime()
  const fimAnt = new Date(ini)
  fimAnt.setDate(fimAnt.getDate() - 1)
  const iniAnt = new Date(fimAnt.getTime() - diff)

  return [iniAnt, fimAnt]
}

function dataCurta(data) {
  if (!data) return '—'

  try {
    return new Date(data).toLocaleDateString('pt-BR', {
      day: '2-digit',
      month: 'short',
    })
  } catch {
    return '—'
  }
}

function dataBR(data) {
  if (!data) return '—'

  try {
    const safe = String(data).length === 10 ? `${data}T12:00:00` : data
    return new Date(safe).toLocaleDateString('pt-BR')
  } catch {
    return '—'
  }
}

function diasDesde(data) {
  if (!data) return 0

  try {
    const d = new Date(data)
    const hoje = new Date()

    return Math.max(0, Math.floor((hoje - d) / 86400000))
  } catch {
    return 0
  }
}

function getTotal(row) {
  return Number(row?.total || row?.amount || row?.value || 0)
}

function getCreatedDate(row) {
  return row?.created_at?.slice(0, 10) || row?.quote_date || row?.date || ''
}

function normalizarStatus(status) {
  const s = String(status || '').toLowerCase()

  if (['rascunho', 'draft'].includes(s)) return 'rascunho'
  if (['enviada', 'enviado', 'sent'].includes(s)) return 'enviada'
  if (['convertida', 'convertido', 'aprovada', 'aprovado', 'won'].includes(s)) return 'convertida'
  if (['cancelada', 'cancelado', 'perdida', 'perdido', 'lost'].includes(s)) return 'cancelada'

  return s || 'rascunho'
}

const STATUS = {
  rascunho: { label: 'Rascunho', className: 'draft' },
  enviada: { label: 'Enviada', className: 'sent' },
  convertida: { label: 'Convertida', className: 'won' },
  cancelada: { label: 'Cancelada', className: 'lost' },
}

function VarBadge({ atual, anterior, invert = false }) {
  const diff = pct(atual, anterior)
  const positivo = invert ? diff <= 0 : diff >= 0

  return (
    <span className={`pipeline-var ${positivo ? 'up' : 'down'}`}>
      {positivo ? <IconTrendingUp size={12} /> : <IconTrendingDown size={12} />}
      {diff >= 0 ? '+' : ''}
      {diff.toFixed(1)}% vs período ant.
    </span>
  )
}

function KpiCard({ icon: Icon, label, value, sub, atual, anterior, tone = 'neutral', invert = false }) {
  return (
    <article className={`pipeline-kpi ${tone}`}>
      <div className="pipeline-kpi-top">
        <div>
          <span>{label}</span>
          <strong>{value}</strong>
        </div>

        <div className="pipeline-kpi-icon">
          <Icon size={18} />
        </div>
      </div>

      {anterior !== undefined ? (
        <VarBadge atual={atual} anterior={anterior} invert={invert} />
      ) : (
        <small>{sub}</small>
      )}
    </article>
  )
}

function RankingRow({ index, title, subtitle, value, max, extra }) {
  const percent = max ? Math.max(5, (Number(value || 0) / max) * 100) : 0

  return (
    <div className="pipeline-ranking-row">
      <span className="pipeline-rank">{index + 1}</span>

      <div className="pipeline-ranking-main">
        <strong>{title}</strong>
        <small>{subtitle}</small>
      </div>

      <div className="pipeline-ranking-bar">
        <span style={{ width: `${percent}%` }} />
      </div>

      <div className="pipeline-ranking-foot">
        <strong>{fmtK(value)}</strong>
        {extra && <span>{extra}</span>}
      </div>
    </div>
  )
}

function Empty({ children = 'Sem dados para exibir' }) {
  return <div className="empty">{children}</div>
}

export default function Cotacoes() {
  const [loading, setLoading] = useState(true)
  const [quotes, setQuotes] = useState([])
  const [quotesAnt, setQuotesAnt] = useState([])
  const [sellers, setSellers] = useState([])
  const [farms, setFarms] = useState([])
  const [periodo, setPeriodo] = useState('semestre')
  const [filtroStatus, setFiltroStatus] = useState('todos')
  const [filtroSegmento, setFiltroSegmento] = useState('todos')

  useEffect(() => {
    carregarBase()
  }, [])

  useEffect(() => {
    carregarCotacoes()
  }, [periodo])

  async function carregarBase() {
    const [sellersRes, farmsRes] = await Promise.all([
      supabaseAdmin.from('profiles').select('id,name,email').eq('active', true),
      supabaseAdmin.from('farms').select('id,name,segment,prospect'),
    ])

    setSellers(sellersRes.data || [])
    setFarms(farmsRes.data || [])
  }

  async function carregarCotacoes() {
    setLoading(true)

    try {
      const [ini, fim] = periodoRange(periodo)
      const [iniAnt, fimAnt] = periodoAnterior(periodo)

      const [rQuotes, rQuotesAnt] = await Promise.all([
        supabaseAdmin
          .from('quotes')
          .select('*')
          .gte('created_at', `${toISO(ini)}T00:00:00`)
          .lte('created_at', `${toISO(fim)}T23:59:59`)
          .order('created_at', { ascending: false }),

        supabaseAdmin
          .from('quotes')
          .select('*')
          .gte('created_at', `${toISO(iniAnt)}T00:00:00`)
          .lte('created_at', `${toISO(fimAnt)}T23:59:59`),
      ])

      setQuotes(rQuotes.data || [])
      setQuotesAnt(rQuotesAnt.data || [])
    } catch (err) {
      console.error('Erro ao carregar cotações:', err)
      setQuotes([])
      setQuotesAnt([])
    } finally {
      setLoading(false)
    }
  }

  const dados = useMemo(() => {
    const sellerById = new Map(sellers.map(s => [s.id, s]))
    const sellerByEmail = new Map(sellers.map(s => [s.email, s]))
    const farmById = new Map(farms.map(f => [f.id, f]))

    let qs = quotes.map(q => {
      const farm = farmById.get(q.farm_id)
      const seller = sellerById.get(q.seller_id) || sellerByEmail.get(q.seller_id)

      return {
        ...q,
        statusNorm: normalizarStatus(q.status),
        totalNumber: getTotal(q),
        createdDate: getCreatedDate(q),
        farmName: farm?.name || '—',
        farmSegment: farm?.segment || '—',
        farmProspect: Boolean(farm?.prospect),
        sellerName: seller?.name || seller?.email || '—',
        diasAberta: diasDesde(q.created_at || q.createdDate),
      }
    })

    let ant = quotesAnt.map(q => ({
      ...q,
      statusNorm: normalizarStatus(q.status),
      totalNumber: getTotal(q),
    }))

    if (filtroSegmento !== 'todos') {
      qs = qs.filter(q => String(q.farmSegment || '').toLowerCase() === filtroSegmento)
      const ids = farms
        .filter(f => String(f.segment || '').toLowerCase() === filtroSegmento)
        .map(f => f.id)

      ant = ant.filter(q => ids.includes(q.farm_id))
    }

    const abertas = qs.filter(q => q.statusNorm === 'rascunho' || q.statusNorm === 'enviada')
    const abertasAnt = ant.filter(q => q.statusNorm === 'rascunho' || q.statusNorm === 'enviada')
    const convertidas = qs.filter(q => q.statusNorm === 'convertida')
    const convertidasAnt = ant.filter(q => q.statusNorm === 'convertida')
    const perdidas = qs.filter(q => q.statusNorm === 'cancelada')
    const perdidasAnt = ant.filter(q => q.statusNorm === 'cancelada')

    const totalCotado = qs.reduce((a, q) => a + q.totalNumber, 0)
    const totalCotadoAnt = ant.reduce((a, q) => a + q.totalNumber, 0)
    const valorAberto = abertas.reduce((a, q) => a + q.totalNumber, 0)
    const valorAbertoAnt = abertasAnt.reduce((a, q) => a + q.totalNumber, 0)
    const valorConvertido = convertidas.reduce((a, q) => a + q.totalNumber, 0)

    const taxaConversao = qs.length ? Math.round((convertidas.length / qs.length) * 100) : 0
    const taxaConversaoAnt = ant.length ? Math.round((convertidasAnt.length / ant.length) * 100) : 0

    const ticketMedio = qs.length ? totalCotado / qs.length : 0
    const ticketMedioAnt = ant.length ? totalCotadoAnt / ant.length : 0

    const hoje = new Date().toISOString().split('T')[0]
    const d7 = new Date(Date.now() - 7 * 86400000).toISOString().split('T')[0]

    const expiradas = qs.filter(q => (
      (q.statusNorm === 'rascunho' || q.statusNorm === 'enviada') &&
      q.valid_until &&
      q.valid_until < hoje
    ))

    const semRetorno = qs.filter(q => q.statusNorm === 'enviada' && q.createdDate && q.createdDate < d7)
    const paradas = [...new Map([...expiradas, ...semRetorno].map(q => [q.id, q])).values()]

    const statusMap = {
      rascunho: { label: 'Rascunho', value: 0, valor: 0 },
      enviada: { label: 'Enviada', value: 0, valor: 0 },
      convertida: { label: 'Convertida', value: 0, valor: 0 },
      cancelada: { label: 'Cancelada', value: 0, valor: 0 },
    }

    qs.forEach(q => {
      if (!statusMap[q.statusNorm]) {
        statusMap[q.statusNorm] = { label: q.statusNorm, value: 0, valor: 0 }
      }

      statusMap[q.statusNorm].value += 1
      statusMap[q.statusNorm].valor += q.totalNumber
    })

    const funil = Object.entries(statusMap).map(([key, item]) => ({
      key,
      ...item,
      percent: qs.length ? Math.round((item.value / qs.length) * 100) : 0,
    }))

    const mesMap = {}

    qs.forEach(q => {
      const mes = q.created_at?.slice(0, 7)
      if (!mes) return

      if (!mesMap[mes]) {
        mesMap[mes] = {
          mes,
          label: new Date(`${mes}-01T12:00:00`).toLocaleDateString('pt-BR', {
            month: 'short',
            year: '2-digit',
          }),
          Cotado: 0,
          Convertido: 0,
          Cotas: 0,
        }
      }

      mesMap[mes].Cotado += q.totalNumber
      mesMap[mes].Cotas += 1

      if (q.statusNorm === 'convertida') {
        mesMap[mes].Convertido += q.totalNumber
      }
    })

    const evolucao = Object.values(mesMap)
      .sort((a, b) => a.mes.localeCompare(b.mes))
      .slice(-6)

    const sellerMap = {}

    qs.forEach(q => {
      const key = q.seller_id || 'sem_vendedor'
      const seller = sellerById.get(key) || sellerByEmail.get(key)

      if (!sellerMap[key]) {
        sellerMap[key] = {
          id: key,
          name: seller?.name || seller?.email || 'Desconhecido',
          total: 0,
          convertidas: 0,
          abertas: 0,
          valor: 0,
          valorConvertido: 0,
        }
      }

      sellerMap[key].total += 1
      sellerMap[key].valor += q.totalNumber

      if (q.statusNorm === 'convertida') {
        sellerMap[key].convertidas += 1
        sellerMap[key].valorConvertido += q.totalNumber
      }

      if (q.statusNorm === 'rascunho' || q.statusNorm === 'enviada') {
        sellerMap[key].abertas += 1
      }
    })

    const porVendedor = Object.values(sellerMap)
      .map(v => ({
        ...v,
        taxa: v.total ? Math.round((v.convertidas / v.total) * 100) : 0,
      }))
      .sort((a, b) => b.valor - a.valor)
      .slice(0, 6)

    const topAbertas = abertas
      .sort((a, b) => b.totalNumber - a.totalNumber)
      .slice(0, 6)

    const lista = qs
      .filter(q => filtroStatus === 'todos' ? true : q.statusNorm === filtroStatus)
      .sort((a, b) => String(b.created_at).localeCompare(String(a.created_at)))

    return {
      qs,
      ant,
      total: qs.length,
      totalAnt: ant.length,
      totalCotado,
      totalCotadoAnt,
      valorAberto,
      valorAbertoAnt,
      valorConvertido,
      convertidas: convertidas.length,
      convertidasAnt: convertidasAnt.length,
      perdidas: perdidas.length,
      perdidasAnt: perdidasAnt.length,
      abertas: abertas.length,
      taxaConversao,
      taxaConversaoAnt,
      ticketMedio,
      ticketMedioAnt,
      paradas,
      expiradas,
      semRetorno,
      funil,
      evolucao,
      porVendedor,
      topAbertas,
      lista,
    }
  }, [quotes, quotesAnt, sellers, farms, filtroStatus, filtroSegmento])

  const funilMax = Math.max(...dados.funil.map(f => f.value), 1)
  const vendedorMax = Math.max(...dados.porVendedor.map(v => v.valor), 1)
  const abertasMax = Math.max(...dados.topAbertas.map(q => q.totalNumber), 1)

  function exportCSV() {
    const rows = [
      ['Cliente', 'Vendedor', 'Criada em', 'Status', 'Validade', 'Dias aberta', 'Valor'],
      ...dados.lista.map(q => [
        q.farmName,
        q.sellerName,
        q.createdDate,
        STATUS[q.statusNorm]?.label || q.statusNorm,
        q.valid_until || '—',
        q.diasAberta,
        q.totalNumber,
      ]),
    ]

    const csv = rows.map(r => r.map(c => `"${String(c ?? '').replace(/"/g, '""')}"`).join(';')).join('\n')
    const a = document.createElement('a')

    a.href = `data:text/csv;charset=utf-8,\uFEFF${encodeURIComponent(csv)}`
    a.download = 'cotacoes-pipeline.csv'
    a.click()
  }

  return (
    <div style={{ flex: 1, overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>
      <Topbar title="Pipeline Comercial" subtitle="Cotações, oportunidades e conversão">
        <button className="btn btn-ghost btn-sm" onClick={exportCSV}>
          <IconDownload size={14} />
          Exportar CSV
        </button>
      </Topbar>

      <div className="page pipeline-page" style={{ overflowY: 'auto' }}>
        <section className="pipeline-toolbar">
          <div className="pipeline-toolbar-left">
            <div className="pipeline-filter-icon">
              <IconFilter size={15} />
            </div>

            <select value={periodo} onChange={e => setPeriodo(e.target.value)}>
              <option value="mes">Mês atual</option>
              <option value="trimestre">Trimestre</option>
              <option value="semestre">Semestre</option>
              <option value="ano">Ano</option>
            </select>

            <select value={filtroSegmento} onChange={e => setFiltroSegmento(e.target.value)}>
              <option value="todos">Todos os segmentos</option>
              <option value="leite">Leite</option>
              <option value="corte">Corte</option>
              <option value="suinos">Suínos</option>
            </select>

            <select value={filtroStatus} onChange={e => setFiltroStatus(e.target.value)}>
              <option value="todos">Todos os status</option>
              <option value="rascunho">Rascunho</option>
              <option value="enviada">Enviadas</option>
              <option value="convertida">Convertidas</option>
              <option value="cancelada">Canceladas</option>
            </select>
          </div>

          <div className="pipeline-toolbar-count">
            {fmtInt(dados.total)} cotações no período
          </div>
        </section>

        <section className="pipeline-hero">
          <div>
            <span className="pipeline-eyebrow">Pipeline aberto</span>
            <h2>{fmtK(dados.valorAberto)}</h2>
            <VarBadge atual={dados.valorAberto} anterior={dados.valorAbertoAnt} />
          </div>

          <div className="pipeline-hero-grid">
            <div>
              <span>Valor cotado</span>
              <strong>{fmtK(dados.totalCotado)}</strong>
            </div>

            <div>
              <span>Valor convertido</span>
              <strong>{fmtK(dados.valorConvertido)}</strong>
            </div>

            <div>
              <span>Conversão</span>
              <strong>{dados.taxaConversao}%</strong>
            </div>
          </div>
        </section>

        <section className="pipeline-kpi-grid">
          <KpiCard
            icon={IconTargetArrow}
            label="Pipeline aberto"
            value={fmtK(dados.valorAberto)}
            atual={dados.valorAberto}
            anterior={dados.valorAbertoAnt}
          />

          <KpiCard
            icon={IconReceipt}
            label="Cotações"
            value={fmtInt(dados.total)}
            atual={dados.total}
            anterior={dados.totalAnt}
          />

          <KpiCard
            icon={IconChecklist}
            label="Convertidas"
            value={fmtInt(dados.convertidas)}
            atual={dados.convertidas}
            anterior={dados.convertidasAnt}
          />

          <KpiCard
            icon={IconChartBar}
            label="Conversão"
            value={`${dados.taxaConversao}%`}
            atual={dados.taxaConversao}
            anterior={dados.taxaConversaoAnt}
          />

          <KpiCard
            icon={IconCalendarTime}
            label="Ticket cotado"
            value={fmtK(dados.ticketMedio)}
            atual={dados.ticketMedio}
            anterior={dados.ticketMedioAnt}
          />

          <KpiCard
            icon={IconAlertTriangle}
            label="Paradas"
            value={fmtInt(dados.paradas.length)}
            sub={`${dados.expiradas.length} expiradas · ${dados.semRetorno.length} sem retorno`}
            tone={dados.paradas.length ? 'danger' : 'success'}
          />
        </section>

        {loading ? (
          <Empty>Carregando pipeline...</Empty>
        ) : (
          <>
            {dados.paradas.length > 0 && (
              <section className="pipeline-alerts">
                {dados.expiradas.length > 0 && (
                  <div className="pipeline-alert danger">
                    <IconAlertTriangle size={17} />
                    <span>
                      <strong>{dados.expiradas.length}</strong> cotação{dados.expiradas.length > 1 ? 'ões' : ''} expirada{dados.expiradas.length > 1 ? 's' : ''} ainda em aberto.
                    </span>
                  </div>
                )}

                {dados.semRetorno.length > 0 && (
                  <div className="pipeline-alert warning">
                    <IconClock size={17} />
                    <span>
                      <strong>{dados.semRetorno.length}</strong> cotação{dados.semRetorno.length > 1 ? 'ões' : ''} enviada{dados.semRetorno.length > 1 ? 's' : ''} há mais de 7 dias sem retorno.
                    </span>
                  </div>
                )}
              </section>
            )}

            <section className="pipeline-main-grid">
              <div className="pipeline-card pipeline-chart-card">
                <div className="pipeline-card-head">
                  <div>
                    <span className="pipeline-eyebrow">Evolução</span>
                    <h3>Valor cotado x convertido</h3>
                  </div>
                </div>

                {dados.evolucao.length > 0 ? (
                  <ResponsiveContainer width="100%" height={290}>
                    <AreaChart data={dados.evolucao} margin={{ top: 8, right: 12, left: -18, bottom: 0 }}>
                      <defs>
                        <linearGradient id="pipelineCotado" x1="0" y1="0" x2="0" y2="1">
                          <stop offset="5%" stopColor="var(--orange)" stopOpacity={0.23} />
                          <stop offset="95%" stopColor="var(--orange)" stopOpacity={0.02} />
                        </linearGradient>

                        <linearGradient id="pipelineConvertido" x1="0" y1="0" x2="0" y2="1">
                          <stop offset="5%" stopColor="#23864A" stopOpacity={0.18} />
                          <stop offset="95%" stopColor="#23864A" stopOpacity={0.01} />
                        </linearGradient>
                      </defs>

                      <CartesianGrid strokeDasharray="4 6" />
                      <XAxis dataKey="label" tickLine={false} axisLine={false} />
                      <YAxis tickLine={false} axisLine={false} tickFormatter={v => `R$ ${(v / 1000).toFixed(0)}k`} />
                      <Tooltip formatter={(v, n) => [`R$ ${fmt(v)}`, n]} />

                      <Area
                        type="monotone"
                        dataKey="Cotado"
                        stroke="var(--orange)"
                        strokeWidth={2.5}
                        fill="url(#pipelineCotado)"
                        dot={{ r: 3 }}
                        activeDot={{ r: 5 }}
                      />

                      <Area
                        type="monotone"
                        dataKey="Convertido"
                        stroke="#23864A"
                        strokeWidth={2.3}
                        fill="url(#pipelineConvertido)"
                        dot={{ r: 3 }}
                      />
                    </AreaChart>
                  </ResponsiveContainer>
                ) : (
                  <Empty>Sem evolução no período</Empty>
                )}
              </div>

              <div className="pipeline-card">
                <div className="pipeline-card-head">
                  <div>
                    <span className="pipeline-eyebrow">Funil</span>
                    <h3>Status das cotações</h3>
                  </div>
                </div>

                <div className="pipeline-funnel">
                  {dados.funil.map(item => (
                    <div key={item.key} className={`pipeline-funnel-row ${STATUS[item.key]?.className || ''}`}>
                      <div>
                        <strong>{item.label}</strong>
                        <span>{fmtK(item.valor)}</span>
                      </div>

                      <div className="pipeline-funnel-mid">
                        <div className="pipeline-funnel-bar">
                          <span style={{ width: `${Math.max(4, (item.value / funilMax) * 100)}%` }} />
                        </div>

                        <small>{item.percent}% do total</small>
                      </div>

                      <strong className="pipeline-funnel-count">{fmtInt(item.value)}</strong>
                    </div>
                  ))}
                </div>
              </div>
            </section>

            <section className="pipeline-grid-3">
              <div className="pipeline-card">
                <div className="pipeline-card-head">
                  <div>
                    <span className="pipeline-eyebrow">Equipe</span>
                    <h3>Conversão por vendedor</h3>
                  </div>
                </div>

                {dados.porVendedor.length > 0 ? (
                  <div className="pipeline-ranking">
                    {dados.porVendedor.map((v, i) => (
                      <RankingRow
                        key={v.id}
                        index={i}
                        title={v.name}
                        subtitle={`${fmtInt(v.total)} cotações · ${fmtInt(v.convertidas)} convertidas`}
                        value={v.valor}
                        max={vendedorMax}
                        extra={`${v.taxa}% conversão`}
                      />
                    ))}
                  </div>
                ) : (
                  <Empty>Sem dados por vendedor</Empty>
                )}
              </div>

              <div className="pipeline-card">
                <div className="pipeline-card-head">
                  <div>
                    <span className="pipeline-eyebrow">Oportunidades</span>
                    <h3>Maiores abertas</h3>
                  </div>
                </div>

                {dados.topAbertas.length > 0 ? (
                  <div className="pipeline-ranking">
                    {dados.topAbertas.map((q, i) => (
                      <RankingRow
                        key={q.id}
                        index={i}
                        title={q.farmName}
                        subtitle={`${q.sellerName} · ${STATUS[q.statusNorm]?.label || q.statusNorm}`}
                        value={q.totalNumber}
                        max={abertasMax}
                        extra={`${q.diasAberta} dias`}
                      />
                    ))}
                  </div>
                ) : (
                  <Empty>Sem oportunidades abertas</Empty>
                )}
              </div>

              <div className="pipeline-card">
                <div className="pipeline-card-head">
                  <div>
                    <span className="pipeline-eyebrow">Atividade</span>
                    <h3>Cotações criadas</h3>
                  </div>
                </div>

                {dados.evolucao.length > 0 ? (
                  <ResponsiveContainer width="100%" height={235}>
                    <BarChart data={dados.evolucao} margin={{ top: 6, right: 10, left: -18, bottom: 0 }}>
                      <CartesianGrid strokeDasharray="4 6" />
                      <XAxis dataKey="label" tickLine={false} axisLine={false} />
                      <YAxis tickLine={false} axisLine={false} />
                      <Tooltip />
                      <Bar dataKey="Cotas" name="Cotações" fill="var(--orange)" radius={[8, 8, 0, 0]} />
                    </BarChart>
                  </ResponsiveContainer>
                ) : (
                  <Empty>Sem histórico</Empty>
                )}
              </div>
            </section>

            <section className="pipeline-card">
              <div className="pipeline-card-head">
                <div>
                  <span className="pipeline-eyebrow">Lista</span>
                  <h3>Todas as cotações</h3>
                </div>

                <small>{fmtInt(dados.lista.length)} registros</small>
              </div>

              <div className="table-wrap pipeline-table-wrap">
                <table>
                  <thead>
                    <tr>
                      <th>Cliente</th>
                      <th>Vendedor</th>
                      <th>Criada em</th>
                      <th>Status</th>
                      <th>Validade</th>
                      <th>Dias</th>
                      <th style={{ textAlign: 'right' }}>Valor</th>
                    </tr>
                  </thead>

                  <tbody>
                    {dados.lista.length === 0 ? (
                      <tr>
                        <td colSpan={7} style={{ textAlign: 'center', color: 'var(--text-faint)' }}>
                          Nenhuma cotação encontrada
                        </td>
                      </tr>
                    ) : (
                      dados.lista.map(q => {
                        const st = STATUS[q.statusNorm] || STATUS.rascunho
                        const expirou = q.valid_until && q.valid_until < new Date().toISOString().split('T')[0]

                        return (
                          <tr key={q.id}>
                            <td>
                              <strong>{q.farmName}</strong>
                              {q.farmProspect && <span className="pipeline-prospect">prospecto</span>}
                            </td>
                            <td>{q.sellerName}</td>
                            <td>{dataCurta(q.created_at)}</td>
                            <td>
                              <span className={`pipeline-status ${st.className}`}>
                                {st.label}
                              </span>
                            </td>
                            <td className={expirou ? 'pipeline-expired' : ''}>
                              {dataBR(q.valid_until)}
                              {expirou && ' ⚠️'}
                            </td>
                            <td>{fmtInt(q.diasAberta)}</td>
                            <td style={{ textAlign: 'right' }}>
                              <strong className="pipeline-total">{fmtK(q.totalNumber)}</strong>
                            </td>
                          </tr>
                        )
                      })
                    )}
                  </tbody>
                </table>
              </div>
            </section>
          </>
        )}
      </div>
    </div>
  )
}
