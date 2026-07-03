import { useEffect, useMemo, useState } from 'react'
import { supabaseAdmin } from '../lib/supabase'
import Topbar from '../components/Topbar'
import {
  IconAlertTriangle,
  IconBuildingStore,
  IconCalendarEvent,
  IconChartBar,
  IconClock,
  IconDownload,
  IconFilter,
  IconMapPin,
  IconRoute,
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

function fmtInt(n) {
  return Number(n || 0).toLocaleString('pt-BR', {
    maximumFractionDigits: 0,
  })
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

function dataBR(data) {
  if (!data) return '—'

  try {
    return new Date(`${data}T12:00:00`).toLocaleDateString('pt-BR')
  } catch {
    return '—'
  }
}

function dataCurta(data) {
  if (!data) return '—'

  try {
    return new Date(`${data}T12:00:00`).toLocaleDateString('pt-BR', {
      day: '2-digit',
      month: 'short',
    })
  } catch {
    return '—'
  }
}

function diasDesde(data) {
  if (!data) return 0

  try {
    const d = new Date(`${data}T12:00:00`)
    const hoje = new Date()

    return Math.max(0, Math.floor((hoje - d) / 86400000))
  } catch {
    return 0
  }
}

function normalizarOutcome(outcome) {
  const o = String(outcome || '').toLowerCase()

  if (['positiva', 'positivo', 'boa', 'bom', 'success'].includes(o)) return 'positiva'
  if (['negativa', 'negativo', 'ruim', 'problema'].includes(o)) return 'negativa'

  return 'neutra'
}

const OUTCOME = {
  positiva: { label: 'Positiva', className: 'positive' },
  neutra: { label: 'Neutra', className: 'neutral' },
  negativa: { label: 'Negativa', className: 'negative' },
}

function VarBadge({ atual, anterior, invert = false }) {
  const diff = pct(atual, anterior)
  const positivo = invert ? diff <= 0 : diff >= 0

  return (
    <span className={`visitas-var ${positivo ? 'up' : 'down'}`}>
      {positivo ? <IconTrendingUp size={12} /> : <IconTrendingDown size={12} />}
      {diff >= 0 ? '+' : ''}
      {diff.toFixed(1)}% vs período ant.
    </span>
  )
}

function KpiCard({ icon: Icon, label, value, sub, atual, anterior, tone = 'neutral', invert = false }) {
  return (
    <article className={`visitas-kpi ${tone}`}>
      <div className="visitas-kpi-top">
        <div>
          <span>{label}</span>
          <strong>{value}</strong>
        </div>

        <div className="visitas-kpi-icon">
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
    <div className="visitas-ranking-row">
      <span className="visitas-rank">{index + 1}</span>

      <div className="visitas-ranking-main">
        <strong>{title}</strong>
        <small>{subtitle}</small>
      </div>

      <div className="visitas-ranking-bar">
        <span style={{ width: `${percent}%` }} />
      </div>

      <div className="visitas-ranking-foot">
        <strong>{fmtInt(value)}</strong>
        {extra && <span>{extra}</span>}
      </div>
    </div>
  )
}

function Empty({ children = 'Sem dados para exibir' }) {
  return <div className="empty">{children}</div>
}

export default function Visitas() {
  const [periodo, setPeriodo] = useState('mes')
  const [segmento, setSegmento] = useState('todos')
  const [resultado, setResultado] = useState('todos')
  const [farms, setFarms] = useState([])
  const [profiles, setProfiles] = useState([])
  const [visits, setVisits] = useState([])
  const [visitsAnt, setVisitsAnt] = useState([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    carregarBase()
  }, [])

  useEffect(() => {
    carregarVisitas()
  }, [periodo])

  async function carregarBase() {
    const [rFarms, rProfiles] = await Promise.all([
      supabaseAdmin.from('farms').select('*'),
      supabaseAdmin.from('profiles').select('id,name,email').eq('active', true),
    ])

    setFarms(rFarms.data || [])
    setProfiles(rProfiles.data || [])
  }

  async function carregarVisitas() {
    setLoading(true)

    try {
      const [ini, fim] = periodoRange(periodo)
      const [iniAnt, fimAnt] = periodoAnterior(periodo)

      const [rAtual, rAnt] = await Promise.all([
        supabaseAdmin
          .from('visits')
          .select('*')
          .gte('visit_date', toISO(ini))
          .lte('visit_date', toISO(fim))
          .order('visit_date', { ascending: false }),

        supabaseAdmin
          .from('visits')
          .select('*')
          .gte('visit_date', toISO(iniAnt))
          .lte('visit_date', toISO(fimAnt)),
      ])

      setVisits(rAtual.data || [])
      setVisitsAnt(rAnt.data || [])
    } catch (err) {
      console.error('Erro ao carregar visitas:', err)
      setVisits([])
      setVisitsAnt([])
    } finally {
      setLoading(false)
    }
  }

  const dados = useMemo(() => {
    const farmById = new Map(farms.map(f => [f.id, f]))
    const sellerById = new Map(profiles.map(p => [p.id, p]))
    const sellerByEmail = new Map(profiles.map(p => [p.email, p]))

    let vs = visits.map(v => {
      const farm = farmById.get(v.farm_id)
      const seller = sellerById.get(v.seller_id || v.user_id || v.created_by) || sellerByEmail.get(v.seller_id)

      return {
        ...v,
        farmName: farm?.name || '—',
        farmSegment: farm?.segment || '—',
        farmProspect: Boolean(farm?.prospect),
        sellerName: seller?.name || seller?.email || '—',
        outcomeNorm: normalizarOutcome(v.outcome),
        dias: diasDesde(v.visit_date),
      }
    })

    let ant = visitsAnt.map(v => {
      const farm = farmById.get(v.farm_id)

      return {
        ...v,
        farmSegment: farm?.segment || '—',
        outcomeNorm: normalizarOutcome(v.outcome),
      }
    })

    if (segmento !== 'todos') {
      vs = vs.filter(v => String(v.farmSegment || '').toLowerCase() === segmento)
      ant = ant.filter(v => String(v.farmSegment || '').toLowerCase() === segmento)
    }

    const baseParaKpi = vs

    const lista = vs
      .filter(v => resultado === 'todos' ? true : v.outcomeNorm === resultado)
      .sort((a, b) => String(b.visit_date).localeCompare(String(a.visit_date)))

    const total = baseParaKpi.length
    const totalAnt = ant.length
    const positivas = baseParaKpi.filter(v => v.outcomeNorm === 'positiva').length
    const positivasAnt = ant.filter(v => v.outcomeNorm === 'positiva').length
    const negativas = baseParaKpi.filter(v => v.outcomeNorm === 'negativa').length
    const negativasAnt = ant.filter(v => v.outcomeNorm === 'negativa').length
    const neutras = baseParaKpi.filter(v => v.outcomeNorm === 'neutra').length

    const farmsVisitadas = new Set(baseParaKpi.map(v => v.farm_id).filter(Boolean)).size
    const farmsVisitadasAnt = new Set(ant.map(v => v.farm_id).filter(Boolean)).size
    const vendedoresAtivos = new Set(baseParaKpi.map(v => v.seller_id || v.user_id || v.created_by).filter(Boolean)).size
    const mediaPorVendedor = vendedoresAtivos ? total / vendedoresAtivos : 0

    const carteiraFiltrada = segmento === 'todos'
      ? farms
      : farms.filter(f => String(f.segment || '').toLowerCase() === segmento)

    const visitadasIds = new Set(baseParaKpi.map(v => v.farm_id))
    const esquecidas = carteiraFiltrada
      .map(f => {
        const ultimas = visits
          .filter(v => v.farm_id === f.id)
          .map(v => v.visit_date)
          .sort()
        const ultima = ultimas[ultimas.length - 1]

        return {
          ...f,
          ultima,
          diasSemVisita: ultima ? diasDesde(ultima) : 999,
        }
      })
      .filter(f => !visitadasIds.has(f.id) || f.diasSemVisita >= 30)
      .sort((a, b) => b.diasSemVisita - a.diasSemVisita)
      .slice(0, 8)

    const futuras = visits
      .filter(v => v.next_visit_date && v.next_visit_date >= toISO(new Date()))
      .sort((a, b) => String(a.next_visit_date).localeCompare(String(b.next_visit_date)))
      .slice(0, 8)

    const mesMap = {}
    baseParaKpi.forEach(v => {
      const mes = v.visit_date?.slice(0, 7)
      if (!mes) return

      if (!mesMap[mes]) {
        mesMap[mes] = {
          mes,
          label: new Date(`${mes}-01T12:00:00`).toLocaleDateString('pt-BR', {
            month: 'short',
            year: '2-digit',
          }),
          Visitas: 0,
          Positivas: 0,
          Negativas: 0,
        }
      }

      mesMap[mes].Visitas += 1
      if (v.outcomeNorm === 'positiva') mesMap[mes].Positivas += 1
      if (v.outcomeNorm === 'negativa') mesMap[mes].Negativas += 1
    })

    const evolucao = Object.values(mesMap)
      .sort((a, b) => a.mes.localeCompare(b.mes))
      .slice(-6)

    const vendedorMap = {}
    baseParaKpi.forEach(v => {
      const key = v.seller_id || v.user_id || v.created_by || 'sem_vendedor'

      if (!vendedorMap[key]) {
        vendedorMap[key] = {
          id: key,
          name: v.sellerName || 'Desconhecido',
          total: 0,
          positivas: 0,
          negativas: 0,
          fazendas: new Set(),
        }
      }

      vendedorMap[key].total += 1
      vendedorMap[key].fazendas.add(v.farm_id)

      if (v.outcomeNorm === 'positiva') vendedorMap[key].positivas += 1
      if (v.outcomeNorm === 'negativa') vendedorMap[key].negativas += 1
    })

    const porVendedor = Object.values(vendedorMap)
      .map(v => ({
        ...v,
        fazendasCount: v.fazendas.size,
        qualidade: v.total ? Math.round((v.positivas / v.total) * 100) : 0,
      }))
      .sort((a, b) => b.total - a.total)
      .slice(0, 8)

    const fazendaMap = {}
    baseParaKpi.forEach(v => {
      if (!fazendaMap[v.farm_id]) {
        fazendaMap[v.farm_id] = {
          id: v.farm_id,
          name: v.farmName,
          segment: v.farmSegment,
          total: 0,
          positivas: 0,
          negativas: 0,
        }
      }

      fazendaMap[v.farm_id].total += 1
      if (v.outcomeNorm === 'positiva') fazendaMap[v.farm_id].positivas += 1
      if (v.outcomeNorm === 'negativa') fazendaMap[v.farm_id].negativas += 1
    })

    const porFazenda = Object.values(fazendaMap)
      .sort((a, b) => b.total - a.total)
      .slice(0, 8)

    const segmentoMap = {}
    baseParaKpi.forEach(v => {
      const key = v.farmSegment || '—'
      if (!segmentoMap[key]) segmentoMap[key] = { name: key, Visitas: 0 }
      segmentoMap[key].Visitas += 1
    })

    const porSegmento = Object.values(segmentoMap).sort((a, b) => b.Visitas - a.Visitas)

    const problemáticas = Object.values(fazendaMap)
      .filter(f => f.negativas >= 2)
      .sort((a, b) => b.negativas - a.negativas)

    return {
      total,
      totalAnt,
      positivas,
      positivasAnt,
      negativas,
      negativasAnt,
      neutras,
      pctPositivas: total ? Math.round((positivas / total) * 100) : 0,
      farmsVisitadas,
      farmsVisitadasAnt,
      mediaPorVendedor,
      vendedoresAtivos,
      esquecidas,
      futuras,
      evolucao,
      porVendedor,
      porFazenda,
      porSegmento,
      problemáticas,
      lista,
    }
  }, [visits, visitsAnt, farms, profiles, segmento, resultado])

  const vendedorMax = Math.max(...dados.porVendedor.map(v => v.total), 1)
  const fazendaMax = Math.max(...dados.porFazenda.map(f => f.total), 1)

  function exportCSV() {
    const rows = [
      ['Data', 'Fazenda', 'Segmento', 'Vendedor', 'Resultado', 'Anotações', 'Próxima visita'],
      ...dados.lista.map(v => [
        v.visit_date,
        v.farmName,
        v.farmSegment,
        v.sellerName,
        OUTCOME[v.outcomeNorm]?.label || v.outcomeNorm,
        v.notes || '',
        v.next_visit_date || '',
      ]),
    ]

    const csv = rows.map(r => r.map(c => `"${String(c ?? '').replace(/"/g, '""')}"`).join(';')).join('\n')
    const a = document.createElement('a')

    a.href = `data:text/csv;charset=utf-8,\uFEFF${encodeURIComponent(csv)}`
    a.download = 'visitas-execucao-campo.csv'
    a.click()
  }

  return (
    <div style={{ flex: 1, overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>
      <Topbar title="Execução de Campo" subtitle="Visitas, cobertura da carteira e acompanhamento comercial">
        <button className="btn btn-ghost btn-sm" onClick={exportCSV}>
          <IconDownload size={14} />
          Exportar CSV
        </button>
      </Topbar>

      <div className="page visitas-page" style={{ overflowY: 'auto' }}>
        <section className="visitas-toolbar">
          <div className="visitas-toolbar-left">
            <div className="visitas-filter-icon">
              <IconFilter size={15} />
            </div>

            <select value={periodo} onChange={e => setPeriodo(e.target.value)}>
              <option value="mes">Mês atual</option>
              <option value="trimestre">Trimestre</option>
              <option value="semestre">Semestre</option>
              <option value="ano">Ano</option>
            </select>

            <select value={segmento} onChange={e => setSegmento(e.target.value)}>
              <option value="todos">Todos os segmentos</option>
              <option value="leite">Leite</option>
              <option value="corte">Corte</option>
              <option value="suinos">Suínos</option>
            </select>

            <select value={resultado} onChange={e => setResultado(e.target.value)}>
              <option value="todos">Todos os resultados</option>
              <option value="positiva">Positivas</option>
              <option value="neutra">Neutras</option>
              <option value="negativa">Negativas</option>
            </select>
          </div>

          <div className="visitas-toolbar-count">
            {fmtInt(dados.total)} visitas no período
          </div>
        </section>

        <section className="visitas-hero">
          <div>
            <span className="visitas-eyebrow">Visitas realizadas</span>
            <h2>{fmtInt(dados.total)}</h2>
            <VarBadge atual={dados.total} anterior={dados.totalAnt} />
          </div>

          <div className="visitas-hero-grid">
            <div>
              <span>Fazendas visitadas</span>
              <strong>{fmtInt(dados.farmsVisitadas)}</strong>
            </div>

            <div>
              <span>Resultado positivo</span>
              <strong>{dados.pctPositivas}%</strong>
            </div>

            <div>
              <span>Fazendas esquecidas</span>
              <strong>{fmtInt(dados.esquecidas.length)}</strong>
            </div>
          </div>
        </section>

        <section className="visitas-kpi-grid">
          <KpiCard
            icon={IconRoute}
            label="Visitas"
            value={fmtInt(dados.total)}
            atual={dados.total}
            anterior={dados.totalAnt}
          />

          <KpiCard
            icon={IconBuildingStore}
            label="Fazendas visitadas"
            value={fmtInt(dados.farmsVisitadas)}
            atual={dados.farmsVisitadas}
            anterior={dados.farmsVisitadasAnt}
          />

          <KpiCard
            icon={IconTargetArrow}
            label="Positivas"
            value={`${fmtInt(dados.positivas)} (${dados.pctPositivas}%)`}
            atual={dados.positivas}
            anterior={dados.positivasAnt}
            tone="success"
          />

          <KpiCard
            icon={IconUsers}
            label="Média por vendedor"
            value={dados.mediaPorVendedor.toFixed(1)}
            sub={`${fmtInt(dados.vendedoresAtivos)} vendedores ativos`}
          />

          <KpiCard
            icon={IconAlertTriangle}
            label="Negativas"
            value={fmtInt(dados.negativas)}
            atual={dados.negativas}
            anterior={dados.negativasAnt}
            invert
            tone={dados.negativas ? 'danger' : 'success'}
          />

          <KpiCard
            icon={IconClock}
            label="Sem visita"
            value={fmtInt(dados.esquecidas.length)}
            sub="clientes que precisam de atenção"
            tone={dados.esquecidas.length ? 'danger' : 'success'}
          />
        </section>

        {loading ? (
          <Empty>Carregando visitas...</Empty>
        ) : (
          <>
            {(dados.esquecidas.length > 0 || dados.problemáticas.length > 0) && (
              <section className="visitas-alerts">
                {dados.esquecidas.length > 0 && (
                  <div className="visitas-alert warning">
                    <IconClock size={17} />
                    <span>
                      <strong>{dados.esquecidas.length}</strong> fazenda{dados.esquecidas.length > 1 ? 's' : ''} sem visita recente no filtro atual.
                    </span>
                  </div>
                )}

                {dados.problemáticas.length > 0 && (
                  <div className="visitas-alert danger">
                    <IconAlertTriangle size={17} />
                    <span>
                      <strong>{dados.problemáticas.length}</strong> fazenda{dados.problemáticas.length > 1 ? 's' : ''} com visitas negativas recorrentes.
                    </span>
                  </div>
                )}
              </section>
            )}

            <section className="visitas-main-grid">
              <div className="visitas-card visitas-chart-card">
                <div className="visitas-card-head">
                  <div>
                    <span className="visitas-eyebrow">Evolução</span>
                    <h3>Visitas e qualidade do atendimento</h3>
                  </div>
                </div>

                {dados.evolucao.length > 0 ? (
                  <ResponsiveContainer width="100%" height={290}>
                    <AreaChart data={dados.evolucao} margin={{ top: 8, right: 12, left: -18, bottom: 0 }}>
                      <defs>
                        <linearGradient id="visitasTotal" x1="0" y1="0" x2="0" y2="1">
                          <stop offset="5%" stopColor="var(--orange)" stopOpacity={0.23} />
                          <stop offset="95%" stopColor="var(--orange)" stopOpacity={0.02} />
                        </linearGradient>

                        <linearGradient id="visitasPositivas" x1="0" y1="0" x2="0" y2="1">
                          <stop offset="5%" stopColor="#23864A" stopOpacity={0.18} />
                          <stop offset="95%" stopColor="#23864A" stopOpacity={0.01} />
                        </linearGradient>
                      </defs>

                      <CartesianGrid strokeDasharray="4 6" />
                      <XAxis dataKey="label" tickLine={false} axisLine={false} />
                      <YAxis tickLine={false} axisLine={false} />
                      <Tooltip />

                      <Area
                        type="monotone"
                        dataKey="Visitas"
                        stroke="var(--orange)"
                        strokeWidth={2.5}
                        fill="url(#visitasTotal)"
                        dot={{ r: 3 }}
                        activeDot={{ r: 5 }}
                      />

                      <Area
                        type="monotone"
                        dataKey="Positivas"
                        stroke="#23864A"
                        strokeWidth={2.3}
                        fill="url(#visitasPositivas)"
                        dot={{ r: 3 }}
                      />
                    </AreaChart>
                  </ResponsiveContainer>
                ) : (
                  <Empty>Sem evolução no período</Empty>
                )}
              </div>

              <div className="visitas-card">
                <div className="visitas-card-head">
                  <div>
                    <span className="visitas-eyebrow">Segmentos</span>
                    <h3>Distribuição das visitas</h3>
                  </div>
                </div>

                {dados.porSegmento.length > 0 ? (
                  <ResponsiveContainer width="100%" height={290}>
                    <BarChart data={dados.porSegmento} margin={{ top: 8, right: 12, left: -18, bottom: 0 }}>
                      <CartesianGrid strokeDasharray="4 6" />
                      <XAxis dataKey="name" tickLine={false} axisLine={false} />
                      <YAxis tickLine={false} axisLine={false} />
                      <Tooltip />
                      <Bar dataKey="Visitas" fill="var(--orange)" radius={[8, 8, 0, 0]} />
                    </BarChart>
                  </ResponsiveContainer>
                ) : (
                  <Empty>Sem dados por segmento</Empty>
                )}
              </div>
            </section>

            <section className="visitas-grid-2">
              <div className="visitas-card">
                <div className="visitas-card-head">
                  <div>
                    <span className="visitas-eyebrow">Equipe</span>
                    <h3>Ranking por vendedor</h3>
                  </div>
                </div>

                {dados.porVendedor.length > 0 ? (
                  <div className="visitas-ranking">
                    {dados.porVendedor.map((v, i) => (
                      <RankingRow
                        key={v.id}
                        index={i}
                        title={v.name}
                        subtitle={`${fmtInt(v.fazendasCount)} fazendas · ${fmtInt(v.positivas)} positivas`}
                        value={v.total}
                        max={vendedorMax}
                        extra={`${v.qualidade}% positivas`}
                      />
                    ))}
                  </div>
                ) : (
                  <Empty>Sem dados por vendedor</Empty>
                )}
              </div>

              <div className="visitas-card">
                <div className="visitas-card-head">
                  <div>
                    <span className="visitas-eyebrow">Carteira</span>
                    <h3>Fazendas mais visitadas</h3>
                  </div>
                </div>

                {dados.porFazenda.length > 0 ? (
                  <div className="visitas-ranking">
                    {dados.porFazenda.map((f, i) => (
                      <RankingRow
                        key={f.id || f.name}
                        index={i}
                        title={f.name}
                        subtitle={`${f.segment} · ${fmtInt(f.positivas)} positivas · ${fmtInt(f.negativas)} negativas`}
                        value={f.total}
                        max={fazendaMax}
                        extra="visitas"
                      />
                    ))}
                  </div>
                ) : (
                  <Empty>Sem fazendas visitadas</Empty>
                )}
              </div>
            </section>

            <section className="visitas-grid-2">
              <div className="visitas-card">
                <div className="visitas-card-head">
                  <div>
                    <span className="visitas-eyebrow">Atenção</span>
                    <h3>Fazendas esquecidas</h3>
                  </div>
                </div>

                {dados.esquecidas.length > 0 ? (
                  <div className="visitas-list">
                    {dados.esquecidas.map(f => (
                      <div key={f.id} className="visitas-list-row">
                        <div>
                          <strong>{f.name}</strong>
                          <span>{f.segment || '—'} · última visita: {f.ultima ? dataBR(f.ultima) : 'sem registro no período'}</span>
                        </div>

                        <em>{f.diasSemVisita >= 999 ? 'sem visita' : `${fmtInt(f.diasSemVisita)} dias`}</em>
                      </div>
                    ))}
                  </div>
                ) : (
                  <Empty>Nenhuma fazenda esquecida</Empty>
                )}
              </div>

              <div className="visitas-card">
                <div className="visitas-card-head">
                  <div>
                    <span className="visitas-eyebrow">Agenda</span>
                    <h3>Próximas visitas</h3>
                  </div>
                </div>

                {dados.futuras.length > 0 ? (
                  <div className="visitas-list">
                    {dados.futuras.map(v => (
                      <div key={v.id} className="visitas-list-row">
                        <div>
                          <strong>{v.farmName}</strong>
                          <span>{v.sellerName} · visita em {dataBR(v.next_visit_date)}</span>
                        </div>

                        <em>{dataCurta(v.next_visit_date)}</em>
                      </div>
                    ))}
                  </div>
                ) : (
                  <Empty>Sem próximas visitas agendadas</Empty>
                )}
              </div>
            </section>

            <section className="visitas-card">
              <div className="visitas-card-head">
                <div>
                  <span className="visitas-eyebrow">Histórico</span>
                  <h3>Lista completa de visitas</h3>
                </div>

                <small>{fmtInt(dados.lista.length)} registros</small>
              </div>

              <div className="table-wrap visitas-table-wrap">
                <table>
                  <thead>
                    <tr>
                      <th>Data</th>
                      <th>Fazenda</th>
                      <th>Segmento</th>
                      <th>Vendedor</th>
                      <th>Resultado</th>
                      <th>Anotações</th>
                      <th>Próxima visita</th>
                    </tr>
                  </thead>

                  <tbody>
                    {dados.lista.length === 0 ? (
                      <tr>
                        <td colSpan={7} style={{ textAlign: 'center', color: 'var(--text-faint)' }}>
                          Nenhuma visita encontrada
                        </td>
                      </tr>
                    ) : (
                      dados.lista.map(v => {
                        const outcome = OUTCOME[v.outcomeNorm] || OUTCOME.neutra

                        return (
                          <tr key={v.id}>
                            <td>{dataBR(v.visit_date)}</td>
                            <td>
                              <strong>{v.farmName}</strong>
                            </td>
                            <td>
                              <span className="visitas-pill segment">{v.farmSegment}</span>
                            </td>
                            <td>{v.sellerName}</td>
                            <td>
                              <span className={`visitas-pill ${outcome.className}`}>
                                {outcome.label}
                              </span>
                            </td>
                            <td className="visitas-notes">{v.notes || '—'}</td>
                            <td>{dataBR(v.next_visit_date)}</td>
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
