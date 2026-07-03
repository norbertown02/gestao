import { useEffect, useMemo, useState } from 'react'
import { supabaseAdmin } from '../lib/supabase'
import Topbar from '../components/Topbar'
import {
  IconAlertTriangle,
  IconChevronDown,
  IconChevronUp,
  IconClipboardCheck,
  IconDownload,
  IconFilter,
  IconMapPin,
  IconRadar,
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
  RadarChart,
  Radar,
  PolarGrid,
  PolarAngleAxis,
  PolarRadiusAxis,
} from 'recharts'

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

function toISO(d) {
  return d.toISOString().split('T')[0]
}

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

function dataBR(data) {
  if (!data) return '—'

  try {
    const safe = String(data).length === 10 ? `${data}T12:00:00` : data
    return new Date(safe).toLocaleDateString('pt-BR')
  } catch {
    return '—'
  }
}

function scoreCor(n) {
  if (n >= 75) return 'var(--green)'
  if (n >= 50) return 'var(--amber)'
  return 'var(--red)'
}

function scoreBg(n) {
  if (n >= 75) return 'var(--green-bg)'
  if (n >= 50) return 'rgba(217,119,6,.1)'
  return 'var(--red-bg)'
}

function scoreLabel(n) {
  if (n >= 75) return 'Excelente'
  if (n >= 50) return 'Bom'
  if (n >= 25) return 'Atenção'
  return 'Crítico'
}

function labelSegmento(seg) {
  const s = String(seg || '').toLowerCase()

  if (s === 'leite') return 'Leite'
  if (s === 'corte') return 'Corte'
  if (s === 'suinos' || s === 'suínos') return 'Suínos'

  return s ? s.charAt(0).toUpperCase() + s.slice(1) : '—'
}

function etapaLabel(k) {
  return String(k || '')
    .replace(/_/g, ' ')
    .replace(/-/g, ' ')
    .replace(/\b\w/g, l => l.toUpperCase())
}

function getStageScores(c) {
  if (!c?.stage_scores) return {}

  if (typeof c.stage_scores === 'string') {
    try {
      const parsed = JSON.parse(c.stage_scores)
      return parsed && typeof parsed === 'object' ? parsed : {}
    } catch {
      return {}
    }
  }

  return c.stage_scores
}

function VarBadge({ atual, anterior, invert = false }) {
  const diff = pct(atual, anterior)
  const positivo = invert ? diff <= 0 : diff >= 0

  return (
    <span className={`checklists-var ${positivo ? 'up' : 'down'}`}>
      {positivo ? <IconTrendingUp size={12} /> : <IconTrendingDown size={12} />}
      {diff >= 0 ? '+' : ''}
      {diff.toFixed(1)}% vs período ant.
    </span>
  )
}

function KpiCard({ icon: Icon, label, value, sub, atual, anterior, tone = 'neutral', invert = false }) {
  return (
    <article className={`checklists-kpi ${tone}`}>
      <div className="checklists-kpi-top">
        <div>
          <span>{label}</span>
          <strong>{value}</strong>
        </div>

        <div className="checklists-kpi-icon">
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

function RankingRow({ index, title, subtitle, value, max, extra, score = false, onClick }) {
  const percent = max ? Math.max(5, (Number(value || 0) / max) * 100) : 0

  return (
    <button type="button" className="checklists-ranking-row" onClick={onClick}>
      <span className="checklists-rank">{index + 1}</span>

      <div className="checklists-ranking-main">
        <strong>{title}</strong>
        <small>{subtitle}</small>
      </div>

      <div className="checklists-ranking-bar">
        <span style={{ width: `${percent}%`, background: score ? scoreCor(value) : undefined }} />
      </div>

      <div className="checklists-ranking-foot">
        <strong style={score ? { color: scoreCor(value) } : undefined}>{score ? value : fmtInt(value)}</strong>
        {extra && <span>{extra}</span>}
      </div>
    </button>
  )
}

function Empty({ children = 'Sem dados para exibir' }) {
  return <div className="empty">{children}</div>
}

export default function Checklists() {
  const [periodo, setPeriodo] = useState('ano')
  const [segmento, setSegmento] = useState('todos')
  const [farms, setFarms] = useState([])
  const [checks, setChecks] = useState([])
  const [checksAnt, setChecksAnt] = useState([])
  const [loading, setLoading] = useState(true)
  const [detalheId, setDetalheId] = useState(null)

  useEffect(() => {
    carregarBase()
  }, [])

  useEffect(() => {
    carregarChecks()
  }, [periodo])

  async function carregarBase() {
    const { data } = await supabaseAdmin.from('farms').select('*')
    setFarms(data || [])
  }

  async function carregarChecks() {
    setLoading(true)

    try {
      const [ini, fim] = periodoRange(periodo)
      const [iniAnt, fimAnt] = periodoAnterior(periodo)

      const [rAtual, rAnt] = await Promise.all([
        supabaseAdmin
          .from('checklists')
          .select('*')
          .gte('applied_at', toISO(ini))
          .lte('applied_at', toISO(fim))
          .order('applied_at', { ascending: false }),

        supabaseAdmin
          .from('checklists')
          .select('*')
          .gte('applied_at', toISO(iniAnt))
          .lte('applied_at', toISO(fimAnt)),
      ])

      setChecks(rAtual.data || [])
      setChecksAnt(rAnt.data || [])
    } catch (err) {
      console.error('Erro ao carregar checklists:', err)
      setChecks([])
      setChecksAnt([])
    } finally {
      setLoading(false)
    }
  }

  const dados = useMemo(() => {
    const farmById = new Map(farms.map(f => [f.id, f]))

    const enriquecer = base => base.map(c => {
      const farm = farmById.get(c.farm_id)
      return {
        ...c,
        farmName: farm?.name || '—',
        segment: farm?.segment || '—',
        state: farm?.state || farm?.uf || '—',
        score: Number(c.overall_score || 0),
        stages: getStageScores(c),
      }
    })

    const todos = enriquecer(checks)
    const todosAnt = enriquecer(checksAnt)

    const filtrados = segmento === 'todos'
      ? todos
      : todos.filter(c => String(c.segment || '').toLowerCase() === segmento)

    const filtradosAnt = segmento === 'todos'
      ? todosAnt
      : todosAnt.filter(c => String(c.segment || '').toLowerCase() === segmento)

    const farmsFiltradas = segmento === 'todos'
      ? farms
      : farms.filter(f => String(f.segment || '').toLowerCase() === segmento)

    const total = filtrados.length
    const totalAnt = filtradosAnt.length
    const scoreMedia = total ? Math.round(filtrados.reduce((a, c) => a + c.score, 0) / total) : 0
    const scoreMediaAnt = filtradosAnt.length ? Math.round(filtradosAnt.reduce((a, c) => a + Number(c.overall_score || 0), 0) / filtradosAnt.length) : 0
    const fazendasComCheck = new Set(filtrados.map(c => c.farm_id).filter(Boolean)).size
    const cobertura = farmsFiltradas.length ? Math.round((fazendasComCheck / farmsFiltradas.length) * 100) : 0

    const faixas = [
      { label: 'Crítico', desc: '0 a 24', min: 0, max: 24, tone: 'critical' },
      { label: 'Atenção', desc: '25 a 49', min: 25, max: 49, tone: 'warning' },
      { label: 'Bom', desc: '50 a 74', min: 50, max: 74, tone: 'good' },
      { label: 'Excelente', desc: '75+', min: 75, max: 100, tone: 'excellent' },
    ].map(f => ({
      ...f,
      count: filtrados.filter(c => c.score >= f.min && c.score <= f.max).length,
    }))

    const criticos = filtrados.filter(c => c.score < 50)
    const excelentes = filtrados.filter(c => c.score >= 75)

    const segMap = {}
    todos.forEach(c => {
      const seg = String(c.segment || 'outros').toLowerCase()
      if (!segMap[seg]) segMap[seg] = { name: labelSegmento(seg), scores: [], total: 0, criticos: 0 }
      segMap[seg].scores.push(c.score)
      segMap[seg].total += 1
      if (c.score < 50) segMap[seg].criticos += 1
    })

    const porSegmento = Object.values(segMap).map(s => ({
      name: s.name,
      Score: s.scores.length ? Math.round(s.scores.reduce((a, b) => a + b, 0) / s.scores.length) : 0,
      Checklists: s.total,
      Criticos: s.criticos,
    }))

    const etapaMap = {}
    filtrados.forEach(c => {
      Object.entries(c.stages || {}).forEach(([k, v]) => {
        if (!etapaMap[k]) etapaMap[k] = []
        etapaMap[k].push(Number(v || 0))
      })
    })

    const radarData = Object.entries(etapaMap).map(([k, arr]) => ({
      etapa: etapaLabel(k),
      key: k,
      Score: Math.round(arr.reduce((a, b) => a + b, 0) / arr.length),
      count: arr.length,
    }))

    const pontosCriticos = radarData
      .filter(e => e.count > 0)
      .sort((a, b) => a.Score - b.Score)
      .slice(0, 8)

    const evolMap = {}
    filtrados.forEach(c => {
      const mes = c.applied_at?.slice(0, 7)
      if (!mes) return

      if (!evolMap[mes]) {
        evolMap[mes] = {
          mes,
          label: new Date(`${mes}-01T12:00:00`).toLocaleDateString('pt-BR', {
            month: 'short',
            year: '2-digit',
          }),
          scores: [],
          checklists: 0,
        }
      }

      evolMap[mes].scores.push(c.score)
      evolMap[mes].checklists += 1
    })

    const evolucao = Object.values(evolMap)
      .sort((a, b) => a.mes.localeCompare(b.mes))
      .map(m => ({
        label: m.label,
        Score: Math.round(m.scores.reduce((a, b) => a + b, 0) / m.scores.length),
        Checklists: m.checklists,
      }))

    const tabela = [...filtrados].sort((a, b) => String(b.applied_at).localeCompare(String(a.applied_at)))
    const criticas = [...filtrados].sort((a, b) => a.score - b.score).slice(0, 8)
    const melhores = [...filtrados].sort((a, b) => b.score - a.score).slice(0, 8)

    const principalPonto = segmento === 'todos'
      ? porSegmento.sort((a, b) => a.Score - b.Score)[0]?.name
      : pontosCriticos[0]?.etapa

    return {
      total,
      totalAnt,
      scoreMedia,
      scoreMediaAnt,
      fazendasComCheck,
      cobertura,
      farmsFiltradas,
      faixas,
      criticos,
      excelentes,
      porSegmento,
      radarData,
      pontosCriticos,
      evolucao,
      tabela,
      criticas,
      melhores,
      principalPonto,
    }
  }, [farms, checks, checksAnt, segmento])

  const analiseTecnicaSegmentada = segmento !== 'todos'
  const scoreMax = 100
  const criticosMax = Math.max(...dados.porSegmento.map(s => s.Criticos), 1)

  function exportCSV() {
    const stageKeys = [...new Set(dados.tabela.flatMap(c => Object.keys(c.stages || {})))]

    const rows = [
      ['Data', 'Fazenda', 'Segmento', 'Estado', 'Score geral', ...stageKeys.map(etapaLabel)],
      ...dados.tabela.map(c => [
        c.applied_at,
        c.farmName,
        c.segment,
        c.state,
        c.score,
        ...stageKeys.map(k => c.stages?.[k] ?? ''),
      ]),
    ]

    const csv = rows.map(r => r.map(c => `"${String(c ?? '').replace(/"/g, '""')}"`).join(';')).join('\n')
    const a = document.createElement('a')

    a.href = `data:text/csv;charset=utf-8,\uFEFF${encodeURIComponent(csv)}`
    a.download = 'diagnostico-tecnico-checklists.csv'
    a.click()
  }

  return (
    <div style={{ flex: 1, overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>
      <Topbar title="Diagnóstico Técnico de Campo" subtitle="Checklists por segmento, score técnico e fazendas prioritárias">
        <button className="btn btn-ghost btn-sm" onClick={exportCSV}>
          <IconDownload size={14} />
          Exportar CSV
        </button>
      </Topbar>

      <div className="page checklists-page" style={{ overflowY: 'auto' }}>
        <section className="checklists-toolbar">
          <div className="checklists-toolbar-left">
            <div className="checklists-filter-icon">
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
          </div>

          <div className="checklists-toolbar-count">
            {fmtInt(dados.total)} checklists no filtro
          </div>
        </section>

        <section className="checklists-hero">
          <div>
            <span className="checklists-eyebrow">
              {analiseTecnicaSegmentada ? `Análise técnica · ${labelSegmento(segmento)}` : 'Visão executiva consolidada'}
            </span>
            <h2>{dados.scoreMedia || 0}</h2>
            <small>
              {analiseTecnicaSegmentada
                ? `${scoreLabel(dados.scoreMedia)} · ponto mais sensível: ${dados.principalPonto || '—'}`
                : `${scoreLabel(dados.scoreMedia)} · análise técnica detalhada exige filtro por segmento`}
            </small>
          </div>

          <div className="checklists-hero-grid">
            <div>
              <span>Checklists</span>
              <strong>{fmtInt(dados.total)}</strong>
            </div>

            <div>
              <span>Fazendas cobertas</span>
              <strong>{fmtInt(dados.fazendasComCheck)}</strong>
            </div>

            <div>
              <span>Críticos</span>
              <strong>{fmtInt(dados.criticos.length)}</strong>
            </div>
          </div>
        </section>

        {!analiseTecnicaSegmentada && (
          <section className="checklists-segment-warning">
            <IconAlertTriangle size={18} />
            <div>
              <strong>Análise consolidada com cuidado técnico</strong>
              <span>
                Leite, corte e suínos podem ter perguntas diferentes. Por isso, o painel geral mostra volume, cobertura, score e comparação por segmento. Radar e pontos críticos técnicos aparecem quando um segmento específico é selecionado.
              </span>
            </div>
          </section>
        )}

        <section className="checklists-kpi-grid">
          <KpiCard
            icon={IconRadar}
            label="Score médio"
            value={dados.scoreMedia || 0}
            atual={dados.scoreMedia}
            anterior={dados.scoreMediaAnt}
          />

          <KpiCard
            icon={IconClipboardCheck}
            label="Checklists"
            value={fmtInt(dados.total)}
            atual={dados.total}
            anterior={dados.totalAnt}
          />

          <KpiCard
            icon={IconUsers}
            label="Fazendas cobertas"
            value={fmtInt(dados.fazendasComCheck)}
            sub={`${dados.cobertura}% da carteira filtrada`}
          />

          <KpiCard
            icon={IconAlertTriangle}
            label="Críticos"
            value={fmtInt(dados.criticos.length)}
            sub="score abaixo de 50"
            tone={dados.criticos.length ? 'danger' : 'success'}
            invert
          />

          <KpiCard
            icon={IconTargetArrow}
            label="Excelentes"
            value={fmtInt(dados.excelentes.length)}
            sub="score acima de 75"
          />

          <KpiCard
            icon={IconMapPin}
            label="Cobertura"
            value={`${dados.cobertura}%`}
            sub={`${fmtInt(dados.farmsFiltradas.length)} fazendas no filtro`}
          />
        </section>

        {loading ? (
          <Empty>Carregando checklists...</Empty>
        ) : (
          <>
            <section className="checklists-main-grid">
              <div className="checklists-card">
                <div className="checklists-card-head">
                  <div>
                    <span className="checklists-eyebrow">Evolução</span>
                    <h3>Score médio técnico</h3>
                  </div>
                </div>

                {dados.evolucao.length > 1 ? (
                  <ResponsiveContainer width="100%" height={290}>
                    <AreaChart data={dados.evolucao} margin={{ top: 8, right: 12, left: -18, bottom: 0 }}>
                      <defs>
                        <linearGradient id="checkScore" x1="0" y1="0" x2="0" y2="1">
                          <stop offset="5%" stopColor="var(--orange)" stopOpacity={0.23} />
                          <stop offset="95%" stopColor="var(--orange)" stopOpacity={0.02} />
                        </linearGradient>
                      </defs>

                      <CartesianGrid strokeDasharray="4 6" />
                      <XAxis dataKey="label" tickLine={false} axisLine={false} />
                      <YAxis domain={[0, 100]} tickLine={false} axisLine={false} />
                      <Tooltip />
                      <Area
                        type="monotone"
                        dataKey="Score"
                        stroke="var(--orange)"
                        strokeWidth={2.5}
                        fill="url(#checkScore)"
                        dot={{ r: 3 }}
                        activeDot={{ r: 5 }}
                      />
                    </AreaChart>
                  </ResponsiveContainer>
                ) : (
                  <Empty>Sem histórico suficiente</Empty>
                )}
              </div>

              <div className="checklists-card">
                <div className="checklists-card-head">
                  <div>
                    <span className="checklists-eyebrow">Faixas</span>
                    <h3>Distribuição dos scores</h3>
                  </div>
                </div>

                <div className="checklists-faixas">
                  {dados.faixas.map(f => (
                    <div className={`checklists-faixa ${f.tone}`} key={f.label}>
                      <div>
                        <strong>{f.label}</strong>
                        <small>{f.desc}</small>
                      </div>

                      <span>{fmtInt(f.count)}</span>

                      <div className="checklists-faixa-bar">
                        <i style={{ width: `${dados.total ? (f.count / dados.total) * 100 : 0}%` }} />
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </section>

            <section className={analiseTecnicaSegmentada ? 'checklists-technical-grid' : 'checklists-main-grid'}>
              {!analiseTecnicaSegmentada ? (
                <>
                  <div className="checklists-card">
                    <div className="checklists-card-head">
                      <div>
                        <span className="checklists-eyebrow">Comparativo seguro</span>
                        <h3>Score médio por segmento</h3>
                      </div>
                    </div>

                    {dados.porSegmento.length > 0 ? (
                      <ResponsiveContainer width="100%" height={300}>
                        <BarChart data={dados.porSegmento} margin={{ top: 8, right: 12, left: -18, bottom: 0 }}>
                          <CartesianGrid strokeDasharray="4 6" />
                          <XAxis dataKey="name" tickLine={false} axisLine={false} />
                          <YAxis domain={[0, 100]} tickLine={false} axisLine={false} />
                          <Tooltip />
                          <Bar dataKey="Score" fill="var(--orange)" radius={[8, 8, 0, 0]} />
                        </BarChart>
                      </ResponsiveContainer>
                    ) : (
                      <Empty>Sem segmentos avaliados</Empty>
                    )}
                  </div>

                  <div className="checklists-card">
                    <div className="checklists-card-head">
                      <div>
                        <span className="checklists-eyebrow">Risco</span>
                        <h3>Críticos por segmento</h3>
                      </div>
                    </div>

                    <div className="checklists-ranking">
                      {dados.porSegmento.length > 0 ? dados.porSegmento
                        .sort((a, b) => b.Criticos - a.Criticos)
                        .map((s, i) => (
                          <RankingRow
                            key={s.name}
                            index={i}
                            title={s.name}
                            subtitle={`${fmtInt(s.Checklists)} checklists`}
                            value={s.Criticos}
                            max={criticosMax}
                            extra="críticos"
                          />
                        )) : <Empty>Sem dados</Empty>}
                    </div>
                  </div>
                </>
              ) : (
                <>
                  <div className="checklists-card">
                    <div className="checklists-card-head">
                      <div>
                        <span className="checklists-eyebrow">Etapas técnicas</span>
                        <h3>Radar do checklist de {labelSegmento(segmento)}</h3>
                      </div>
                    </div>

                    {dados.radarData.length > 0 ? (
                      <ResponsiveContainer width="100%" height={330}>
                        <RadarChart data={dados.radarData}>
                          <PolarGrid />
                          <PolarAngleAxis dataKey="etapa" tick={{ fontSize: 11 }} />
                          <PolarRadiusAxis angle={90} domain={[0, 100]} tick={{ fontSize: 10 }} />
                          <Radar
                            name="Score"
                            dataKey="Score"
                            stroke="var(--orange)"
                            fill="var(--orange)"
                            fillOpacity={0.22}
                          />
                          <Tooltip />
                        </RadarChart>
                      </ResponsiveContainer>
                    ) : (
                      <Empty>Sem etapas técnicas registradas</Empty>
                    )}
                  </div>

                  <div className="checklists-card">
                    <div className="checklists-card-head">
                      <div>
                        <span className="checklists-eyebrow">Prioridade técnica</span>
                        <h3>Pontos críticos recorrentes</h3>
                      </div>
                    </div>

                    <div className="checklists-ranking">
                      {dados.pontosCriticos.length > 0 ? dados.pontosCriticos.map((p, i) => (
                        <RankingRow
                          key={p.key}
                          index={i}
                          title={p.etapa}
                          subtitle={`${fmtInt(p.count)} avaliações`}
                          value={p.Score}
                          max={scoreMax}
                          extra={scoreLabel(p.Score)}
                          score
                        />
                      )) : <Empty>Sem pontos técnicos</Empty>}
                    </div>
                  </div>
                </>
              )}
            </section>

            <section className="checklists-grid-3">
              <div className="checklists-card">
                <div className="checklists-card-head">
                  <div>
                    <span className="checklists-eyebrow">Prioridade</span>
                    <h3>Fazendas críticas</h3>
                  </div>
                </div>

                <div className="checklists-ranking">
                  {dados.criticas.length > 0 ? dados.criticas.map((c, i) => (
                    <RankingRow
                      key={c.id}
                      index={i}
                      title={c.farmName}
                      subtitle={`${labelSegmento(c.segment)} · ${dataBR(c.applied_at)}`}
                      value={c.score}
                      max={scoreMax}
                      extra={scoreLabel(c.score)}
                      score
                      onClick={() => setDetalheId(c.id)}
                    />
                  )) : <Empty>Sem fazendas críticas</Empty>}
                </div>
              </div>

              <div className="checklists-card">
                <div className="checklists-card-head">
                  <div>
                    <span className="checklists-eyebrow">Referência</span>
                    <h3>Melhores fazendas</h3>
                  </div>
                </div>

                <div className="checklists-ranking">
                  {dados.melhores.length > 0 ? dados.melhores.map((c, i) => (
                    <RankingRow
                      key={c.id}
                      index={i}
                      title={c.farmName}
                      subtitle={`${labelSegmento(c.segment)} · ${dataBR(c.applied_at)}`}
                      value={c.score}
                      max={scoreMax}
                      extra={scoreLabel(c.score)}
                      score
                      onClick={() => setDetalheId(c.id)}
                    />
                  )) : <Empty>Sem avaliações excelentes</Empty>}
                </div>
              </div>

              <div className="checklists-card checklists-note-card">
                <span className="checklists-eyebrow">Regra de leitura</span>
                <h3>{analiseTecnicaSegmentada ? 'Análise técnica ativa' : 'Análise geral segura'}</h3>
                <p>
                  {analiseTecnicaSegmentada
                    ? `Como o filtro está em ${labelSegmento(segmento)}, o radar e os pontos críticos usam apenas perguntas desse segmento.`
                    : 'No modo Todos, não misturamos perguntas técnicas diferentes. Use Leite, Corte ou Suínos para abrir radar e pontos críticos específicos.'}
                </p>
              </div>
            </section>

            <section className="checklists-card">
              <div className="checklists-card-head">
                <div>
                  <span className="checklists-eyebrow">Histórico</span>
                  <h3>Checklists detalhados</h3>
                </div>

                <small>{fmtInt(dados.tabela.length)} registros</small>
              </div>

              <div className="table-wrap checklists-table-wrap">
                <table>
                  <thead>
                    <tr>
                      <th>Data</th>
                      <th>Fazenda</th>
                      <th>Segmento</th>
                      <th>Estado</th>
                      <th style={{ textAlign: 'center' }}>Score</th>
                      <th>Etapas</th>
                      <th />
                    </tr>
                  </thead>

                  <tbody>
                    {dados.tabela.length === 0 ? (
                      <tr>
                        <td colSpan={7} style={{ textAlign: 'center', color: 'var(--text-faint)' }}>
                          Nenhum checklist no período
                        </td>
                      </tr>
                    ) : (
                      dados.tabela.map(c => (
                        <>
                          <tr
                            key={c.id}
                            onClick={() => setDetalheId(detalheId === c.id ? null : c.id)}
                            className={detalheId === c.id ? 'checklists-row-active' : ''}
                          >
                            <td>{dataBR(c.applied_at)}</td>
                            <td>
                              <strong>{c.farmName}</strong>
                            </td>
                            <td>
                              <span className="checklists-pill category">{labelSegmento(c.segment)}</span>
                            </td>
                            <td>{c.state}</td>
                            <td style={{ textAlign: 'center' }}>
                              <span
                                className="checklists-pill score"
                                style={{
                                  background: scoreBg(c.score),
                                  color: scoreCor(c.score),
                                }}
                              >
                                {c.score}
                              </span>
                            </td>
                            <td>
                              <div className="checklists-stage-tags">
                                {Object.entries(c.stages || {}).slice(0, 5).map(([k, v]) => (
                                  <span key={k} style={{ background: scoreBg(v), color: scoreCor(v) }}>
                                    {etapaLabel(k)}: {v}
                                  </span>
                                ))}
                                {Object.keys(c.stages || {}).length > 5 && <em>+{Object.keys(c.stages || {}).length - 5}</em>}
                              </div>
                            </td>
                            <td>
                              {detalheId === c.id ? <IconChevronUp size={15} /> : <IconChevronDown size={15} />}
                            </td>
                          </tr>

                          {detalheId === c.id && (
                            <tr key={`${c.id}_detalhe`}>
                              <td colSpan={7} className="checklists-detail-cell">
                                <div className="checklists-detail-grid">
                                  {Object.entries(c.stages || {}).map(([k, v]) => (
                                    <div key={k} className="checklists-detail-box">
                                      <span>{etapaLabel(k)}</span>
                                      <strong style={{ color: scoreCor(v) }}>{v}</strong>
                                      <div className="checklists-detail-bar">
                                        <i style={{ width: `${Number(v || 0)}%`, background: scoreCor(v) }} />
                                      </div>
                                    </div>
                                  ))}
                                </div>
                              </td>
                            </tr>
                          )}
                        </>
                      ))
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
