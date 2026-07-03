import { useEffect, useMemo, useState } from 'react'
import { supabaseAdmin } from '../lib/supabase'
import Topbar from '../components/Topbar'
import {
  IconAlertTriangle,
  IconBuildingStore,
  IconChartBar,
  IconChevronDown,
  IconChevronUp,
  IconClock,
  IconDownload,
  IconFilter,
  IconMapPin,
  IconTargetArrow,
  IconTrendingDown,
  IconTrendingUp,
  IconUsers,
  IconWallet,
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

function toISO(d) {
  return d.toISOString().split('T')[0]
}

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

function diasAtras(dias) {
  const d = new Date()
  d.setDate(d.getDate() - dias)
  return toISO(d)
}

function diasDesde(data) {
  if (!data) return 999

  try {
    return Math.max(0, Math.floor((new Date() - new Date(`${data}T12:00:00`)) / 86400000))
  } catch {
    return 999
  }
}

function dataBR(data) {
  if (!data) return 'Nunca'

  try {
    return new Date(`${data}T12:00:00`).toLocaleDateString('pt-BR')
  } catch {
    return 'Nunca'
  }
}

const GRUPOS = {
  A: {
    label: 'Estrelas',
    className: 'star',
    desc: 'Alta frequência e alto valor',
    acao: 'Fidelizar e fazer upsell',
  },
  B: {
    label: 'Promissoras',
    className: 'growth',
    desc: 'Ativas com bom potencial',
    acao: 'Aumentar frequência',
  },
  C: {
    label: 'Manter',
    className: 'hold',
    desc: 'Ativas com baixo ticket',
    acao: 'Elevar mix de compra',
  },
  D: {
    label: 'Em risco',
    className: 'risk',
    desc: 'Sem compra há 60 a 90 dias',
    acao: 'Ação comercial urgente',
  },
  E: {
    label: 'Inativas',
    className: 'inactive',
    desc: 'Sem compra há mais de 90 dias',
    acao: 'Campanha de reativação',
  },
  F: {
    label: 'Sem dados',
    className: 'empty',
    desc: 'Cadastradas sem transação',
    acao: 'Primeira visita',
  },
}

function classificarFazenda(farmId, allSales, ticketMedio) {
  const vendas = allSales.filter(s => s.farm_id === farmId)

  if (vendas.length === 0) return 'F'

  const ordenadas = [...vendas].sort((a, b) => String(b.sale_date).localeCompare(String(a.sale_date)))
  const ultima = ordenadas[0]
  const diasSemCompra = diasDesde(ultima.sale_date)
  const totalFazenda = vendas.reduce((a, s) => a + Number(s.total || 0), 0)
  const ticketFazenda = vendas.length ? totalFazenda / vendas.length : 0

  if (diasSemCompra > 90) return 'E'
  if (diasSemCompra > 60) return 'D'
  if (ticketFazenda >= ticketMedio * 1.3 && vendas.length >= 3) return 'A'
  if (ticketFazenda >= ticketMedio * 0.8) return 'B'

  return 'C'
}

function VarBadge({ atual, anterior, invert = false }) {
  const diff = pct(atual, anterior)
  const positivo = invert ? diff <= 0 : diff >= 0

  return (
    <span className={`carteira-var ${positivo ? 'up' : 'down'}`}>
      {positivo ? <IconTrendingUp size={12} /> : <IconTrendingDown size={12} />}
      {diff >= 0 ? '+' : ''}
      {diff.toFixed(1)}% vs período ant.
    </span>
  )
}

function KpiCard({ icon: Icon, label, value, sub, atual, anterior, tone = 'neutral', invert = false }) {
  return (
    <article className={`carteira-kpi ${tone}`}>
      <div className="carteira-kpi-top">
        <div>
          <span>{label}</span>
          <strong>{value}</strong>
        </div>

        <div className="carteira-kpi-icon">
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
    <div className="carteira-ranking-row">
      <span className="carteira-rank">{index + 1}</span>

      <div className="carteira-ranking-main">
        <strong>{title}</strong>
        <small>{subtitle}</small>
      </div>

      <div className="carteira-ranking-bar">
        <span style={{ width: `${percent}%` }} />
      </div>

      <div className="carteira-ranking-foot">
        <strong>{fmtK(value)}</strong>
        {extra && <span>{extra}</span>}
      </div>
    </div>
  )
}

function Empty({ children = 'Sem dados para exibir' }) {
  return <div className="empty">{children}</div>
}

export default function Carteira() {
  const [segmento, setSegmento] = useState('todos')
  const [grupoFiltro, setGrupoFiltro] = useState('todos')
  const [farms, setFarms] = useState([])
  const [allSales, setAllSales] = useState([])
  const [allVisits, setAllVisits] = useState([])
  const [allQuotes, setAllQuotes] = useState([])
  const [allChecks, setAllChecks] = useState([])
  const [loading, setLoading] = useState(true)
  const [grupoAberto, setGrupoAberto] = useState({})

  useEffect(() => {
    carregar()
  }, [])

  async function carregar() {
    setLoading(true)

    try {
      const [fs, sl, vs, qt, ck] = await Promise.all([
        supabaseAdmin.from('farms').select('*').eq('status', 'ativo'),
        supabaseAdmin.from('sales').select('*').order('sale_date', { ascending: false }),
        supabaseAdmin.from('visits').select('*').order('visit_date', { ascending: false }),
        supabaseAdmin.from('quotes').select('*').order('created_at', { ascending: false }),
        supabaseAdmin.from('checklists').select('farm_id,overall_score,applied_at').order('applied_at', { ascending: false }),
      ])

      setFarms(fs.data || [])
      setAllSales(sl.data || [])
      setAllVisits(vs.data || [])
      setAllQuotes(qt.data || [])
      setAllChecks(ck.data || [])
    } catch (err) {
      console.error('Erro ao carregar carteira:', err)
      setFarms([])
      setAllSales([])
      setAllVisits([])
      setAllQuotes([])
      setAllChecks([])
    } finally {
      setLoading(false)
    }
  }

  const dados = useMemo(() => {
    const d12m = diasAtras(365)
    const d30 = diasAtras(30)
    const d60 = diasAtras(60)
    const totalGeral = allSales.reduce((a, s) => a + Number(s.total || 0), 0)
    const ticketMedioGeral = allSales.length ? totalGeral / allSales.length : 0

    const farmsFiltradas = segmento === 'todos'
      ? farms
      : farms.filter(f => String(f.segment || '').toLowerCase() === segmento)

    const fazendas = farmsFiltradas.map(f => {
      const vendas = allSales.filter(s => s.farm_id === f.id)
      const vendas12m = vendas.filter(s => s.sale_date >= d12m)
      const vendas30d = vendas.filter(s => s.sale_date >= d30)
      const total12m = vendas12m.reduce((a, s) => a + Number(s.total || 0), 0)
      const total30d = vendas30d.reduce((a, s) => a + Number(s.total || 0), 0)
      const ultimaCompra = vendas[0]?.sale_date || null
      const diasSemCompra = diasDesde(ultimaCompra)
      const visitas = allVisits.filter(v => v.farm_id === f.id)
      const ultimaVisita = visitas[0]?.visit_date || null
      const diasSemVisita = diasDesde(ultimaVisita)
      const cotacoesAbertas = allQuotes.filter(q => (
        q.farm_id === f.id &&
        ['rascunho', 'enviada'].includes(String(q.status || '').toLowerCase())
      ))
      const valorAberto = cotacoesAbertas.reduce((a, q) => a + Number(q.total || 0), 0)
      const scoreChecklist = allChecks.find(c => c.farm_id === f.id)?.overall_score || null
      const grupo = classificarFazenda(f.id, allSales, ticketMedioGeral)

      return {
        ...f,
        grupo,
        total12m,
        total30d,
        ultimaCompra,
        diasSemCompra,
        ultimaVisita,
        diasSemVisita,
        score: scoreChecklist,
        qtdVendas: vendas.length,
        qtdVendas12m: vendas12m.length,
        ticketMedio: vendas.length ? vendas.reduce((a, s) => a + Number(s.total || 0), 0) / vendas.length : 0,
        cotacoesAbertas: cotacoesAbertas.length,
        valorAberto,
      }
    })

    const lista = fazendas
      .filter(f => grupoFiltro === 'todos' ? true : f.grupo === grupoFiltro)
      .sort((a, b) => b.total12m - a.total12m)

    const grupos = {}
    Object.keys(GRUPOS).forEach(g => {
      const arr = fazendas.filter(f => f.grupo === g)
      grupos[g] = {
        key: g,
        ...GRUPOS[g],
        fazendas: arr,
        quantidade: arr.length,
        receita: arr.reduce((a, f) => a + f.total12m, 0),
      }
    })

    const totalFazendas = fazendas.length
    const receita12m = fazendas.reduce((a, f) => a + f.total12m, 0)
    const receita30d = fazendas.reduce((a, f) => a + f.total30d, 0)
    const clientesComCompra = fazendas.filter(f => f.qtdVendas > 0).length
    const clientesComCompra30d = fazendas.filter(f => f.total30d > 0).length
    const prospects = fazendas.filter(f => f.prospect).length
    const semVisita = fazendas.filter(f => f.diasSemVisita >= 45)
    const semCompra = fazendas.filter(f => f.diasSemCompra >= 60)
    const emRisco = fazendas.filter(f => ['D', 'E'].includes(f.grupo))
    const oportunidades = fazendas.filter(f => f.cotacoesAbertas > 0)
    const valorOportunidades = oportunidades.reduce((a, f) => a + f.valorAberto, 0)

    const topClientes = [...fazendas]
      .filter(f => f.total12m > 0)
      .sort((a, b) => b.total12m - a.total12m)
      .slice(0, 8)

    const clientesRisco = [...fazendas]
      .filter(f => ['D', 'E', 'F'].includes(f.grupo) || f.diasSemVisita >= 60)
      .sort((a, b) => b.total12m - a.total12m || b.diasSemCompra - a.diasSemCompra)
      .slice(0, 8)

    const prospectsQuentes = [...fazendas]
      .filter(f => f.prospect || f.cotacoesAbertas > 0 || f.grupo === 'F')
      .sort((a, b) => b.valorAberto - a.valorAberto || a.diasSemVisita - b.diasSemVisita)
      .slice(0, 8)

    const segmentoMap = {}
    fazendas.forEach(f => {
      const key = f.segment || '—'
      if (!segmentoMap[key]) segmentoMap[key] = { name: key, Clientes: 0, Receita: 0 }
      segmentoMap[key].Clientes += 1
      segmentoMap[key].Receita += f.total12m
    })

    const porSegmento = Object.values(segmentoMap).sort((a, b) => b.Receita - a.Receita)

    const grupoChart = Object.values(grupos).map(g => ({
      name: `${g.key} · ${g.label}`,
      Clientes: g.quantidade,
      Receita: g.receita,
    }))

    const mesMap = {}
    allSales
      .filter(s => s.sale_date >= d12m)
      .forEach(s => {
        const farm = farms.find(f => f.id === s.farm_id)
        if (!farm) return
        if (segmento !== 'todos' && String(farm.segment || '').toLowerCase() !== segmento) return

        const mes = s.sale_date?.slice(0, 7)
        if (!mes) return

        if (!mesMap[mes]) {
          mesMap[mes] = {
            mes,
            label: new Date(`${mes}-01T12:00:00`).toLocaleDateString('pt-BR', {
              month: 'short',
              year: '2-digit',
            }),
            Receita: 0,
            Clientes: new Set(),
          }
        }

        mesMap[mes].Receita += Number(s.total || 0)
        mesMap[mes].Clientes.add(s.farm_id)
      })

    const evolucao = Object.values(mesMap)
      .sort((a, b) => a.mes.localeCompare(b.mes))
      .slice(-6)
      .map(m => ({
        ...m,
        Clientes: m.Clientes.size,
      }))

    return {
      lista,
      grupos,
      totalFazendas,
      receita12m,
      receita30d,
      clientesComCompra,
      clientesComCompra30d,
      prospects,
      semVisita,
      semCompra,
      emRisco,
      oportunidades,
      valorOportunidades,
      topClientes,
      clientesRisco,
      prospectsQuentes,
      porSegmento,
      grupoChart,
      evolucao,
    }
  }, [farms, allSales, allVisits, allQuotes, allChecks, segmento, grupoFiltro])

  const topMax = Math.max(...dados.topClientes.map(f => f.total12m), 1)
  const riscoMax = Math.max(...dados.clientesRisco.map(f => f.total12m), 1)
  const prospectMax = Math.max(...dados.prospectsQuentes.map(f => f.valorAberto || f.total12m || 1), 1)

  function exportCSV(grupo = null) {
    const fazendas = grupo ? dados.grupos[grupo]?.fazendas || [] : dados.lista

    const rows = [
      ['Código', 'Nome', 'Segmento', 'Grupo', 'Última compra', 'Dias sem compra', 'Última visita', 'Dias sem visita', 'Total 12m', 'Cotações abertas', 'Score', 'Ação sugerida'],
      ...fazendas.map(f => [
        f.clientCode || f.client_code || '—',
        f.name,
        f.segment,
        f.grupo,
        f.ultimaCompra || 'Nunca',
        f.diasSemCompra >= 999 ? '—' : f.diasSemCompra,
        f.ultimaVisita || 'Nunca',
        f.diasSemVisita >= 999 ? '—' : f.diasSemVisita,
        f.total12m,
        f.cotacoesAbertas,
        f.score || '—',
        GRUPOS[f.grupo]?.acao || '—',
      ]),
    ]

    const csv = rows.map(r => r.map(c => `"${String(c ?? '').replace(/"/g, '""')}"`).join(';')).join('\n')
    const a = document.createElement('a')

    a.href = `data:text/csv;charset=utf-8,\uFEFF${encodeURIComponent(csv)}`
    a.download = grupo ? `carteira-grupo-${grupo}.csv` : 'carteira-comercial.csv'
    a.click()
  }

  return (
    <div style={{ flex: 1, overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>
      <Topbar title="Gestão da Carteira" subtitle="Clientes, risco comercial, oportunidades e segmentação RFM">
        <button className="btn btn-ghost btn-sm" onClick={() => exportCSV()}>
          <IconDownload size={14} />
          Exportar CSV
        </button>
      </Topbar>

      <div className="page carteira-page" style={{ overflowY: 'auto' }}>
        <section className="carteira-toolbar">
          <div className="carteira-toolbar-left">
            <div className="carteira-filter-icon">
              <IconFilter size={15} />
            </div>

            <select value={segmento} onChange={e => setSegmento(e.target.value)}>
              <option value="todos">Todos os segmentos</option>
              <option value="leite">Leite</option>
              <option value="corte">Corte</option>
              <option value="suinos">Suínos</option>
            </select>

            <select value={grupoFiltro} onChange={e => setGrupoFiltro(e.target.value)}>
              <option value="todos">Todos os grupos</option>
              {Object.entries(GRUPOS).map(([key, g]) => (
                <option key={key} value={key}>{key} · {g.label}</option>
              ))}
            </select>
          </div>

          <div className="carteira-toolbar-count">
            {fmtInt(dados.totalFazendas)} clientes na carteira
          </div>
        </section>

        <section className="carteira-hero">
          <div>
            <span className="carteira-eyebrow">Receita 12 meses</span>
            <h2>{fmtK(dados.receita12m)}</h2>
            <small>{fmtInt(dados.clientesComCompra)} clientes com histórico de compra</small>
          </div>

          <div className="carteira-hero-grid">
            <div>
              <span>Clientes com compra no mês</span>
              <strong>{fmtInt(dados.clientesComCompra30d)}</strong>
            </div>

            <div>
              <span>Oportunidades abertas</span>
              <strong>{fmtK(dados.valorOportunidades)}</strong>
            </div>

            <div>
              <span>Clientes em risco</span>
              <strong>{fmtInt(dados.emRisco.length)}</strong>
            </div>
          </div>
        </section>

        <section className="carteira-kpi-grid">
          <KpiCard
            icon={IconBuildingStore}
            label="Clientes"
            value={fmtInt(dados.totalFazendas)}
            sub={`${fmtInt(dados.prospects)} prospects`}
          />

          <KpiCard
            icon={IconWallet}
            label="Receita 12m"
            value={fmtK(dados.receita12m)}
            sub={`${fmtK(dados.receita30d)} nos últimos 30 dias`}
          />

          <KpiCard
            icon={IconUsers}
            label="Com compra"
            value={fmtInt(dados.clientesComCompra)}
            sub={`${fmtInt(dados.clientesComCompra30d)} compraram no mês`}
          />

          <KpiCard
            icon={IconClock}
            label="Sem visita"
            value={fmtInt(dados.semVisita.length)}
            sub="45+ dias sem acompanhamento"
            tone={dados.semVisita.length ? 'danger' : 'success'}
          />

          <KpiCard
            icon={IconAlertTriangle}
            label="Sem compra"
            value={fmtInt(dados.semCompra.length)}
            sub="60+ dias sem venda"
            tone={dados.semCompra.length ? 'danger' : 'success'}
          />

          <KpiCard
            icon={IconTargetArrow}
            label="Oportunidades"
            value={fmtInt(dados.oportunidades.length)}
            sub={fmtK(dados.valorOportunidades)}
          />
        </section>

        {loading ? (
          <Empty>Carregando carteira...</Empty>
        ) : (
          <>
            {(dados.semVisita.length > 0 || dados.emRisco.length > 0) && (
              <section className="carteira-alerts">
                {dados.semVisita.length > 0 && (
                  <div className="carteira-alert warning">
                    <IconClock size={17} />
                    <span>
                      <strong>{dados.semVisita.length}</strong> cliente{dados.semVisita.length > 1 ? 's' : ''} sem visita recente.
                    </span>
                  </div>
                )}

                {dados.emRisco.length > 0 && (
                  <div className="carteira-alert danger">
                    <IconAlertTriangle size={17} />
                    <span>
                      <strong>{dados.emRisco.length}</strong> cliente{dados.emRisco.length > 1 ? 's' : ''} em risco ou inativo.
                    </span>
                  </div>
                )}
              </section>
            )}

            <section className="carteira-rfm-grid">
              {Object.entries(dados.grupos).map(([key, grupo]) => {
                const pctGrupo = dados.totalFazendas ? Math.round((grupo.quantidade / dados.totalFazendas) * 100) : 0

                return (
                  <button
                    type="button"
                    key={key}
                    className={`carteira-rfm-card ${grupo.className}`}
                    onClick={() => setGrupoFiltro(key)}
                  >
                    <div className="carteira-rfm-head">
                      <strong>{key}</strong>
                      <div>
                        <span>{grupo.label}</span>
                        <small>{grupo.desc}</small>
                      </div>
                    </div>

                    <div className="carteira-rfm-foot">
                      <div>
                        <strong>{fmtInt(grupo.quantidade)}</strong>
                        <small>{pctGrupo}% da carteira</small>
                      </div>

                      <div>
                        <strong>{fmtK(grupo.receita)}</strong>
                        <small>12 meses</small>
                      </div>
                    </div>
                  </button>
                )
              })}
            </section>

            <section className="carteira-main-grid">
              <div className="carteira-card carteira-chart-card">
                <div className="carteira-card-head">
                  <div>
                    <span className="carteira-eyebrow">Evolução</span>
                    <h3>Receita e clientes compradores</h3>
                  </div>
                </div>

                {dados.evolucao.length > 0 ? (
                  <ResponsiveContainer width="100%" height={290}>
                    <AreaChart data={dados.evolucao} margin={{ top: 8, right: 12, left: -18, bottom: 0 }}>
                      <defs>
                        <linearGradient id="carteiraReceita" x1="0" y1="0" x2="0" y2="1">
                          <stop offset="5%" stopColor="var(--orange)" stopOpacity={0.23} />
                          <stop offset="95%" stopColor="var(--orange)" stopOpacity={0.02} />
                        </linearGradient>
                      </defs>

                      <CartesianGrid strokeDasharray="4 6" />
                      <XAxis dataKey="label" tickLine={false} axisLine={false} />
                      <YAxis tickLine={false} axisLine={false} tickFormatter={v => `R$ ${(v / 1000).toFixed(0)}k`} />
                      <Tooltip formatter={(v, n) => [n === 'Receita' ? `R$ ${fmt(v)}` : fmtInt(v), n]} />

                      <Area
                        type="monotone"
                        dataKey="Receita"
                        stroke="var(--orange)"
                        strokeWidth={2.5}
                        fill="url(#carteiraReceita)"
                        dot={{ r: 3 }}
                        activeDot={{ r: 5 }}
                      />
                    </AreaChart>
                  </ResponsiveContainer>
                ) : (
                  <Empty>Sem evolução de vendas</Empty>
                )}
              </div>

              <div className="carteira-card">
                <div className="carteira-card-head">
                  <div>
                    <span className="carteira-eyebrow">Segmento</span>
                    <h3>Receita por segmento</h3>
                  </div>
                </div>

                {dados.porSegmento.length > 0 ? (
                  <ResponsiveContainer width="100%" height={290}>
                    <BarChart data={dados.porSegmento} margin={{ top: 8, right: 12, left: -18, bottom: 0 }}>
                      <CartesianGrid strokeDasharray="4 6" />
                      <XAxis dataKey="name" tickLine={false} axisLine={false} />
                      <YAxis tickLine={false} axisLine={false} tickFormatter={v => `R$ ${(v / 1000).toFixed(0)}k`} />
                      <Tooltip formatter={v => [`R$ ${fmt(v)}`, 'Receita']} />
                      <Bar dataKey="Receita" fill="var(--orange)" radius={[8, 8, 0, 0]} />
                    </BarChart>
                  </ResponsiveContainer>
                ) : (
                  <Empty>Sem dados por segmento</Empty>
                )}
              </div>
            </section>

            <section className="carteira-grid-3">
              <div className="carteira-card">
                <div className="carteira-card-head">
                  <div>
                    <span className="carteira-eyebrow">Valor</span>
                    <h3>Clientes mais importantes</h3>
                  </div>
                </div>

                {dados.topClientes.length > 0 ? (
                  <div className="carteira-ranking">
                    {dados.topClientes.map((f, i) => (
                      <RankingRow
                        key={f.id}
                        index={i}
                        title={f.name}
                        subtitle={`${f.segment || '—'} · ${fmtInt(f.qtdVendas12m)} compras em 12m`}
                        value={f.total12m}
                        max={topMax}
                        extra={GRUPOS[f.grupo]?.label}
                      />
                    ))}
                  </div>
                ) : (
                  <Empty>Sem clientes com venda</Empty>
                )}
              </div>

              <div className="carteira-card">
                <div className="carteira-card-head">
                  <div>
                    <span className="carteira-eyebrow">Risco</span>
                    <h3>Clientes que pedem ação</h3>
                  </div>
                </div>

                {dados.clientesRisco.length > 0 ? (
                  <div className="carteira-ranking">
                    {dados.clientesRisco.map((f, i) => (
                      <RankingRow
                        key={f.id}
                        index={i}
                        title={f.name}
                        subtitle={`${f.segment || '—'} · última compra: ${dataBR(f.ultimaCompra)}`}
                        value={f.total12m || 1}
                        max={riscoMax}
                        extra={f.diasSemCompra >= 999 ? 'sem compra' : `${fmtInt(f.diasSemCompra)} dias`}
                      />
                    ))}
                  </div>
                ) : (
                  <Empty>Sem clientes em risco</Empty>
                )}
              </div>

              <div className="carteira-card">
                <div className="carteira-card-head">
                  <div>
                    <span className="carteira-eyebrow">Prospects</span>
                    <h3>Oportunidades abertas</h3>
                  </div>
                </div>

                {dados.prospectsQuentes.length > 0 ? (
                  <div className="carteira-ranking">
                    {dados.prospectsQuentes.map((f, i) => (
                      <RankingRow
                        key={f.id}
                        index={i}
                        title={f.name}
                        subtitle={`${f.segment || '—'} · ${fmtInt(f.cotacoesAbertas)} cotações abertas`}
                        value={f.valorAberto || f.total12m || 1}
                        max={prospectMax}
                        extra={f.prospect ? 'prospect' : GRUPOS[f.grupo]?.label}
                      />
                    ))}
                  </div>
                ) : (
                  <Empty>Sem prospects ou oportunidades</Empty>
                )}
              </div>
            </section>

            <section className="carteira-card">
              <div className="carteira-card-head">
                <div>
                  <span className="carteira-eyebrow">Segmentação</span>
                  <h3>Grupos da carteira</h3>
                </div>
              </div>

              <div className="carteira-groups">
                {Object.entries(GRUPOS).map(([g, cfg]) => {
                  const fazendas = dados.grupos[g]?.fazendas || []

                  if (fazendas.length === 0) return null

                  return (
                    <div key={g} className="carteira-group-item">
                      <div
                        className="carteira-group-head"
                        onClick={() => setGrupoAberto(p => ({ ...p, [g]: !p[g] }))}
                      >
                        <span className={`carteira-group-letter ${cfg.className}`}>{g}</span>
                        <div>
                          <strong>{cfg.label}</strong>
                          <small>{cfg.acao}</small>
                        </div>

                        <em>{fmtInt(fazendas.length)} clientes · {fmtK(fazendas.reduce((a, f) => a + f.total12m, 0))}</em>

                        <button
                          type="button"
                          className="btn btn-ghost btn-sm"
                          onClick={e => {
                            e.stopPropagation()
                            exportCSV(g)
                          }}
                        >
                          <IconDownload size={12} />
                        </button>

                        {grupoAberto[g] ? <IconChevronUp size={16} /> : <IconChevronDown size={16} />}
                      </div>

                      {grupoAberto[g] && (
                        <div className="table-wrap carteira-table-wrap">
                          <table>
                            <thead>
                              <tr>
                                <th>Cliente</th>
                                <th>Segmento</th>
                                <th>Última compra</th>
                                <th>Dias sem compra</th>
                                <th>Última visita</th>
                                <th style={{ textAlign: 'right' }}>Total 12m</th>
                                <th style={{ textAlign: 'center' }}>Score</th>
                                <th>Ação sugerida</th>
                              </tr>
                            </thead>

                            <tbody>
                              {fazendas.sort((a, b) => b.total12m - a.total12m).map(f => (
                                <tr key={f.id}>
                                  <td>
                                    <strong>{f.name}</strong>
                                  </td>
                                  <td>
                                    <span className="carteira-pill segment">{f.segment || '—'}</span>
                                  </td>
                                  <td>{dataBR(f.ultimaCompra)}</td>
                                  <td className={f.diasSemCompra > 90 ? 'carteira-danger-text' : f.diasSemCompra > 60 ? 'carteira-warning-text' : ''}>
                                    {f.diasSemCompra >= 999 ? '—' : `${fmtInt(f.diasSemCompra)} dias`}
                                  </td>
                                  <td>{dataBR(f.ultimaVisita)}</td>
                                  <td style={{ textAlign: 'right' }}>
                                    <strong>{fmtK(f.total12m)}</strong>
                                  </td>
                                  <td style={{ textAlign: 'center' }}>
                                    {f.score ? (
                                      <span className={`carteira-pill ${f.score >= 75 ? 'positive' : f.score >= 50 ? 'warning' : 'negative'}`}>
                                        {f.score}
                                      </span>
                                    ) : '—'}
                                  </td>
                                  <td>{cfg.acao}</td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        </div>
                      )}
                    </div>
                  )
                })}
              </div>
            </section>
          </>
        )}
      </div>
    </div>
  )
}
