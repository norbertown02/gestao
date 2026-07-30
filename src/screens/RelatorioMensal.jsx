import { useEffect, useRef, useState } from 'react'
import { supabaseAdmin } from '../lib/supabase'
import Topbar from '../components/Topbar'
import {
  IconCalendar,
  IconCheck,
  IconDownload,
  IconFileText,
  IconLoader2,
  IconTrendingDown,
  IconTrendingUp,
} from '@tabler/icons-react'
import jsPDF from 'jspdf'
import html2canvas from 'html2canvas'
import logoNutrialle from '../assets/logo-nutrialle.png'

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

function getMes(offset = 0) {
  const d = new Date()
  d.setMonth(d.getMonth() + offset)
  return {
    ano: d.getFullYear(),
    mes: d.getMonth() + 1,
    label: d.toLocaleDateString('pt-BR', { month: 'long', year: 'numeric' }),
  }
}

function mesRange(ano, mes) {
  const ini = new Date(ano, mes - 1, 1)
  const fim = new Date(ano, mes, 0)
  return [toISO(ini), toISO(fim)]
}

function trimestreRange(ano, trim) {
  const mesIni = (trim - 1) * 3 + 1
  const ini = new Date(ano, mesIni - 1, 1)
  const fim = new Date(ano, mesIni + 2, 0)
  return [toISO(ini), toISO(fim)]
}

function anoRange(ano) {
  return [`${ano}-01-01`, `${ano}-12-31`]
}

function getPeriodoRange(tipo, ano, mes, trim) {
  if (tipo === 'mensal') return mesRange(ano, mes)
  if (tipo === 'trimestral') return trimestreRange(ano, trim)
  return anoRange(ano)
}

function getAnteriorRange(tipo, ano, mes, trim) {
  if (tipo === 'mensal') {
    const d = new Date(ano, mes - 2, 1)
    return [toISO(d), toISO(new Date(ano, mes - 1, 0))]
  }

  if (tipo === 'trimestral') {
    const trimAnt = trim === 1 ? 4 : trim - 1
    const anoAnt = trim === 1 ? ano - 1 : ano
    return trimestreRange(anoAnt, trimAnt)
  }

  return anoRange(ano - 1)
}

function periodoLabel(tipo, ano, mes, trim) {
  if (tipo === 'mensal') {
    const label = new Date(ano, mes - 1, 1).toLocaleDateString('pt-BR', {
      month: 'long',
      year: 'numeric',
    })
    return label.charAt(0).toUpperCase() + label.slice(1)
  }
  if (tipo === 'trimestral') return `${trim}º Trimestre de ${ano}`
  return `Ano de ${ano}`
}

function anteriorLabel(tipo, ano, mes, trim) {
  if (tipo === 'mensal') {
    const d = new Date(ano, mes - 2, 1)
    const label = d.toLocaleDateString('pt-BR', { month: 'long', year: 'numeric' })
    return label.charAt(0).toUpperCase() + label.slice(1)
  }
  if (tipo === 'trimestral') {
    const trimAnt = trim === 1 ? 4 : trim - 1
    const anoAnt = trim === 1 ? ano - 1 : ano
    return `${trimAnt}º Trimestre de ${anoAnt}`
  }
  return `Ano de ${ano - 1}`
}

function labelSegmento(seg) {
  const s = String(seg || '').toLowerCase()
  if (s === 'leite') return 'Leite'
  if (s === 'corte') return 'Corte'
  if (s === 'suinos' || s === 'suínos') return 'Suínos'
  return s ? s.charAt(0).toUpperCase() + s.slice(1) : '—'
}

function parseItems(items) {
  if (Array.isArray(items)) return items
  if (typeof items === 'string') {
    try {
      const parsed = JSON.parse(items)
      return Array.isArray(parsed) ? parsed : []
    } catch {
      return []
    }
  }
  return []
}

function metricTone(v) {
  return Number(v || 0) >= 0 ? 'positive' : 'negative'
}

function MetricPreview({ label, value, variation }) {
  const positive = Number(variation || 0) >= 0
  return (
    <div className="relpremium-metric">
      <span>{label}</span>
      <strong>{value}</strong>
      <small className={positive ? 'positive' : 'negative'}>
        {positive ? <IconTrendingUp size={12} /> : <IconTrendingDown size={12} />}
        {positive ? '+' : ''}
        {variation.toFixed(1)}% vs anterior
      </small>
    </div>
  )
}

function PdfMetric({ label, value, previous, variation, dark = false, subLabel }) {
  const positive = Number(variation || 0) >= 0
  return (
    <div className={`pdf-metric ${dark ? 'dark' : ''}`}>
      <span>{label}</span>
      <strong>{value}</strong>
      <small>{subLabel || `Anterior: ${previous}`}</small>
      <em className={positive ? 'positive' : 'negative'}>
        {positive ? '▲' : '▼'} {positive ? '+' : ''}{variation.toFixed(1)}%
      </em>
    </div>
  )
}

function MiniBarList({ items, valueKey = 'total', labelKey = 'name', valueFormatter = fmtK, limit = 6 }) {
  const rows = (items || []).slice(0, limit)
  const max = Math.max(...rows.map(r => Number(r[valueKey] || 0)), 1)

  return (
    <div className="pdf-bar-list">
      {rows.length === 0 ? (
        <div className="pdf-empty">Sem dados no período</div>
      ) : rows.map((item, index) => (
        <div className="pdf-bar-row" key={`${item[labelKey]}-${index}`}>
          <div className="pdf-bar-label">
            <span>{String(index + 1).padStart(2, '0')}</span>
            <strong>{item[labelKey]}</strong>
            <em>{valueFormatter(item[valueKey])}</em>
          </div>
          <div className="pdf-bar-track">
            <i style={{ width: `${Math.max(6, (Number(item[valueKey] || 0) / max) * 100)}%` }} />
          </div>
        </div>
      ))}
    </div>
  )
}

function EvolutionChart({ data }) {
  const rows = data || []
  const max = Math.max(...rows.flatMap(r => [Number(r.vendas || 0), Number(r.cotacoes || 0)]), 1)
  const width = 700
  const height = 300
  const padL = 72
  const padR = 28
  const padT = 32
  const padB = 54
  const innerW = width - padL - padR
  const innerH = height - padT - padB

  const niceMax = Math.ceil(max / 1000) * 1000 || 1

  const moneyShort = value => {
    const v = Number(value || 0)
    if (v >= 1000000) return `${(v / 1000000).toFixed(1)} mi`
    if (v >= 1000) return `${(v / 1000).toFixed(0)} mil`
    return fmtInt(v)
  }

  const points = key => rows.map((r, i) => {
    const x = padL + (i / Math.max(1, rows.length - 1)) * innerW
    const y = padT + innerH - (Number(r[key] || 0) / niceMax) * innerH
    return { x, y, value: Number(r[key] || 0), label: r.label }
  })

  const smoothPath = pts => {
    if (!pts.length) return ''
    if (pts.length === 1) return `M ${pts[0].x} ${pts[0].y}`

    let d = `M ${pts[0].x} ${pts[0].y}`

    for (let i = 0; i < pts.length - 1; i++) {
      const p0 = pts[i]
      const p1 = pts[i + 1]
      const midX = (p0.x + p1.x) / 2
      d += ` C ${midX} ${p0.y}, ${midX} ${p1.y}, ${p1.x} ${p1.y}`
    }

    return d
  }

  const vendas = points('vendas')
  const cotacoes = points('cotacoes')
  const yTicks = [0, .25, .5, .75, 1].map(t => niceMax * t)

  const areaPath = pts => {
    if (!pts.length) return ''
    return `${smoothPath(pts)} L ${pts[pts.length - 1].x} ${padT + innerH} L ${pts[0].x} ${padT + innerH} Z`
  }

  return (
    <div className="pdf-chart-premium">
      <div className="pdf-chart-topline">
        <div>
          <span>Evolução comercial</span>
          <strong>Vendas realizadas x valor cotado</strong>
        </div>

        <div className="pdf-chart-legend">
          <span><i className="sales" /> Vendas</span>
          <span><i className="quotes" /> Cotações</span>
        </div>
      </div>

      <svg viewBox={`0 0 ${width} ${height}`} className="pdf-line-chart-premium">
        <defs>
          <linearGradient id="salesAreaGradient" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#E87722" stopOpacity="0.22" />
            <stop offset="100%" stopColor="#E87722" stopOpacity="0.02" />
          </linearGradient>

          <filter id="softShadow" x="-10%" y="-10%" width="120%" height="130%">
            <feDropShadow dx="0" dy="5" stdDeviation="5" floodColor="#E87722" floodOpacity="0.16" />
          </filter>
        </defs>

        <rect x={padL} y={padT} width={innerW} height={innerH} rx="18" className="plot-bg" />

        {yTicks.map(tick => {
          const y = padT + innerH - (tick / niceMax) * innerH
          return (
            <g key={tick}>
              <line x1={padL} x2={padL + innerW} y1={y} y2={y} className="grid-line" />
              <text x={padL - 14} y={y + 4} textAnchor="end" className="axis-value">
                {moneyShort(tick)}
              </text>
            </g>
          )
        })}

        {rows.map((r, i) => {
          const x = padL + (i / Math.max(1, rows.length - 1)) * innerW
          return (
            <g key={r.mes}>
              <line x1={x} x2={x} y1={padT} y2={padT + innerH} className="vertical-guide" />
              <text x={x} y={height - 18} textAnchor="middle" className="axis-label">{r.label}</text>
            </g>
          )
        })}

        <path d={areaPath(vendas)} className="sales-area" />

        <path d={smoothPath(cotacoes)} className="quote-path-premium" />
        <path d={smoothPath(vendas)} className="sales-path-premium" filter="url(#softShadow)" />

        {cotacoes.map((p, i) => (
          <g key={`q-${i}`}>
            <circle cx={p.x} cy={p.y} r="4.5" className="quote-dot-premium" />
          </g>
        ))}

        {vendas.map((p, i) => (
          <g key={`v-${i}`}>
            <circle cx={p.x} cy={p.y} r="6" className="sales-dot-premium" />
            {i === vendas.length - 1 && (
              <g>
                <rect x={p.x - 42} y={p.y - 35} width="84" height="22" rx="11" className="last-value-pill" />
                <text x={p.x} y={p.y - 20} textAnchor="middle" className="last-value-text">{moneyShort(p.value)}</text>
              </g>
            )}
          </g>
        ))}
      </svg>
    </div>
  )
}

function ComparisonBars({ rows }) {
  const max = Math.max(...rows.map(r => Math.max(Number(r.atual || 0), Number(r.anterior || 0))), 1)

  return (
    <div className="pdf-comparison-bars">
      {rows.map(row => (
        <div className="pdf-comparison-row" key={row.label}>
          <div className="pdf-comparison-title">
            <strong>{row.label}</strong>
            <span className={metricTone(row.variacao)}>{row.variacao >= 0 ? '+' : ''}{row.variacao.toFixed(1)}%</span>
          </div>

          <div className="pdf-comparison-line">
            <span>Atual</span>
            <div><i className="current" style={{ width: `${Math.max(5, (Number(row.atual || 0) / max) * 100)}%` }} /></div>
            <strong>{row.atualLabel}</strong>
          </div>

          <div className="pdf-comparison-line">
            <span>Anterior</span>
            <div><i className="previous" style={{ width: `${Math.max(5, (Number(row.anterior || 0) / max) * 100)}%` }} /></div>
            <strong>{row.anteriorLabel}</strong>
          </div>
        </div>
      ))}
    </div>
  )
}

function PdfPage({ children, number }) {
  return (
    <section className="relpremium-pdf-page">
      <div className="pdf-page-bg" />
      {children}
      <footer className="pdf-footer">
        <span>Nutrialle · Relatório executivo confidencial</span>
        <strong>{String(number).padStart(2, '0')}</strong>
      </footer>
    </section>
  )
}

function PdfTemplate({ dados }) {
  if (!dados) return null

  return (
    <div className="relpremium-template" aria-hidden="true">
      <PdfPage number={1}>
        <div className="pdf-cover">
          <div className="pdf-cover-brand">
            <img src={logoNutrialle} alt="Nutrialle" />
          </div>

          <div className="pdf-cover-lines">
            <i />
            <i />
            <i />
          </div>

          <div className="pdf-cover-content">
            <span>RELATÓRIO EXECUTIVO COMERCIAL</span>
            <h1>{dados.periodoAtual}</h1>
            <p>Resultado comercial, evolução da carteira, desempenho da equipe e prioridades para o próximo período.</p>
          </div>

          <div className="pdf-cover-highlight">
            <span>Faturamento do período</span>
            <strong>{fmtK(dados.fatAtual)}</strong>
            <em className={metricTone(dados.variacoes.faturamento)}>
              {dados.variacoes.faturamento >= 0 ? '+' : ''}{dados.variacoes.faturamento.toFixed(1)}% vs período anterior
            </em>
          </div>

          <div className="pdf-cover-date">
            <strong>Nutrialle Gestão</strong>
            <span>Gerado em {new Date().toLocaleDateString('pt-BR')}</span>
          </div>
        </div>
      </PdfPage>

      <PdfPage number={2}>
        <div className="pdf-page-head">
          <span>01 · Resumo executivo</span>
          <h2>Resultado do período</h2>
          <p>{dados.periodoAtual} comparado com {dados.periodoAnterior}</p>
        </div>

        <div className="pdf-metric-grid">
          <PdfMetric label="Faturamento" value={fmtK(dados.fatAtual)} previous={fmtK(dados.fatAnt)} variation={dados.variacoes.faturamento} />
          <PdfMetric label="Pedidos" value={fmtInt(dados.pedidosAtual)} previous={fmtInt(dados.pedidosAnt)} variation={dados.variacoes.pedidos} />
          <PdfMetric label="Ticket médio" value={fmtK(dados.ticketAtual)} previous={fmtK(dados.ticketAnt)} variation={dados.variacoes.ticket} />
          <PdfMetric label="Visitas" value={fmtInt(dados.visitasAtual)} previous={fmtInt(dados.visitasAnt)} variation={dados.variacoes.visitas} />
          <PdfMetric label="Comissões pagas" value={fmtK(dados.comissaoAtual)} subLabel={`${dados.comissaoPctFat.toFixed(1)}% do faturamento`} variation={dados.variacoes.comissao} />
        </div>

        <div className="pdf-summary-grid">
          <div className="pdf-summary-card large">
            <span>Destaque do período</span>
            <h3>{dados.destaque}</h3>
            <p>
              O resultado do período foi impactado pelo desempenho da equipe comercial, evolução das cotações e movimentação da carteira ativa.
            </p>
          </div>

          <div className="pdf-summary-card attention">
            <span>Ponto de atenção</span>
            <h3>{dados.atencao}</h3>
            <p>Prioridade para atuação comercial e acompanhamento gerencial no próximo ciclo.</p>
          </div>
        </div>

        <div className="pdf-kpi-strip">
          <div>
            <span>Carteira ativa</span>
            <strong>{fmtInt(dados.carteiraAtiva)}</strong>
          </div>
          <div>
            <span>Cotações abertas</span>
            <strong>{fmtInt(dados.cotacoesAbertas)}</strong>
          </div>
          <div>
            <span>Pipeline aberto</span>
            <strong>{fmtK(dados.valorCotacoesAbertas)}</strong>
          </div>
          <div>
            <span>Score técnico</span>
            <strong>{dados.scoreMedia || '—'}</strong>
          </div>
        </div>
      </PdfPage>

      <PdfPage number={3}>
        <div className="pdf-page-head">
          <span>02 · Evolução e comparativo</span>
          <h2>Tendência comercial</h2>
          <p>Vendas realizadas, cotações e comparação com o período anterior.</p>
        </div>

        <EvolutionChart data={dados.evolucao} />

        <div className="pdf-section-title">
          <span>Atual vs anterior</span>
          <strong>Comparativo das métricas principais</strong>
        </div>

        <ComparisonBars rows={dados.comparativo} />
      </PdfPage>

      <PdfPage number={4}>
        <div className="pdf-page-head">
          <span>03 · Rankings comerciais</span>
          <h2>Equipe e clientes</h2>
          <p>Principais vendedores e fazendas do período selecionado.</p>
        </div>

        <div className="pdf-two-columns">
          <div className="pdf-panel">
            <div className="pdf-panel-title">
              <span>Equipe comercial</span>
              <strong>Top vendedores</strong>
            </div>
            <MiniBarList
              items={dados.topVendedores}
              labelKey="nome"
              valueKey="total"
              valueFormatter={fmtK}
              limit={6}
            />
          </div>

          <div className="pdf-panel">
            <div className="pdf-panel-title">
              <span>Clientes</span>
              <strong>Top fazendas</strong>
            </div>
            <MiniBarList
              items={dados.topFazendas}
              labelKey="name"
              valueKey="total"
              valueFormatter={fmtK}
              limit={6}
            />
          </div>
        </div>

        <div className="pdf-mini-table-title">Detalhamento dos principais vendedores</div>
        <table className="pdf-table">
          <thead>
            <tr>
              <th>Vendedor</th>
              <th>Faturamento</th>
              <th>Pedidos</th>
              <th>Ticket médio</th>
            </tr>
          </thead>
          <tbody>
            {dados.topVendedores.slice(0, 6).map(v => (
              <tr key={v.id}>
                <td>{v.nome}</td>
                <td>{fmtK(v.total)}</td>
                <td>{fmtInt(v.pedidos)}</td>
                <td>{fmtK(v.ticket)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </PdfPage>

      <PdfPage number={5}>
        <div className="pdf-page-head">
          <span>04 · Mix comercial</span>
          <h2>Produtos e segmentos</h2>
          <p>Leitura do mix de vendas e concentração de receita.</p>
        </div>

        <div className="pdf-two-columns">
          <div className="pdf-panel">
            <div className="pdf-panel-title">
              <span>Produtos</span>
              <strong>Top produtos</strong>
            </div>
            <MiniBarList
              items={dados.topProdutos}
              labelKey="name"
              valueKey="total"
              valueFormatter={fmtK}
              limit={8}
            />
          </div>

          <div className="pdf-panel">
            <div className="pdf-panel-title">
              <span>Segmentos</span>
              <strong>Receita por segmento</strong>
            </div>
            <MiniBarList
              items={dados.porSegmento}
              labelKey="name"
              valueKey="total"
              valueFormatter={fmtK}
              limit={6}
            />
          </div>
        </div>

        <div className="pdf-insight-card">
          <span>Leitura executiva</span>
          <p>
            O mix de produtos e segmentos ajuda a identificar onde a Nutrialle ganhou mais tração comercial e onde existe espaço para reforço de abordagem técnica ou negociação.
          </p>
        </div>
      </PdfPage>

      <PdfPage number={6}>
        <div className="pdf-page-head">
          <span>05 · Prioridades</span>
          <h2>Pontos de atenção e plano de ação</h2>
          <p>Clientes em queda, fazendas sem visita e recomendações para o próximo ciclo.</p>
        </div>

        <div className="pdf-two-columns">
          <div className="pdf-panel risk">
            <div className="pdf-panel-title">
              <span>Atenção comercial</span>
              <strong>Fazendas em queda</strong>
            </div>
            {(dados.fazendasEmQueda || []).slice(0, 8).length === 0 ? (
              <div className="pdf-empty">Sem quedas críticas acima de 40%.</div>
            ) : (
              (dados.fazendasEmQueda || []).slice(0, 8).map(f => (
                <div className="pdf-risk-row" key={f.id}>
                  <strong>{f.name}</strong>
                  <span>{labelSegmento(f.segment)} · {fmtK(f.anterior)} → {fmtK(f.atual)}</span>
                  <em>-{f.queda.toFixed(1)}%</em>
                </div>
              ))
            )}
          </div>

          <div className="pdf-panel risk">
            <div className="pdf-panel-title">
              <span>Cobertura de campo</span>
              <strong>Sem visita recente</strong>
            </div>
            {(dados.esquecidas || []).slice(0, 8).length === 0 ? (
              <div className="pdf-empty">Sem fazendas esquecidas.</div>
            ) : (
              (dados.esquecidas || []).slice(0, 8).map(f => (
                <div className="pdf-risk-row" key={f.id}>
                  <strong>{f.name}</strong>
                  <span>{labelSegmento(f.segment)} · {f.city || f.cidade || '—'}</span>
                </div>
              ))
            )}
          </div>
        </div>

        <div className="pdf-action-plan">
          <span>Recomendações executivas</span>
          {[
            'Converter cotações abertas de maior valor antes de ampliar novas prospecções.',
            'Priorizar visita técnica nas fazendas sem acompanhamento recente.',
            'Criar plano de recuperação para fazendas com queda relevante de faturamento.',
            'Replicar estratégia dos vendedores e produtos líderes nas carteiras com baixa performance.',
            'Acompanhar semanalmente faturamento, visitas e conversão até o próximo fechamento.',
          ].map((item, index) => (
            <div key={item}>
              <strong>{String(index + 1).padStart(2, '0')}</strong>
              <p>{item}</p>
            </div>
          ))}
        </div>
      </PdfPage>
    </div>
  )
}

export default function RelatorioMensal() {
  const printRef = useRef(null)

  const [mesSel, setMesSel] = useState(getMes(0))
  const [tipoPeriodo, setTipoPeriodo] = useState('mensal')
  const [anoSel, setAnoSel] = useState(new Date().getFullYear())
  const [trimSel, setTrimSel] = useState(Math.ceil((new Date().getMonth() + 1) / 3))
  const [dados, setDados] = useState(null)
  const [loading, setLoading] = useState(false)
  const [gerandoPDF, setGerandoPDF] = useState(false)

  const mesesOpcoes = Array.from({ length: 13 }, (_, i) => getMes(-i))
  const anosOpcoes = Array.from({ length: 5 }, (_, i) => new Date().getFullYear() - i)

  useEffect(() => {
    // eslint-disable-next-line react-hooks/immutability
    carregar()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mesSel, tipoPeriodo, anoSel, trimSel])

  async function carregar() {
    setLoading(true)

    try {
      const [ini, fim] = getPeriodoRange(tipoPeriodo, anoSel, mesSel.mes, trimSel)
      const [iniAnt, fimAnt] = getAnteriorRange(tipoPeriodo, anoSel, mesSel.mes, trimSel)
      const periodoAtual = periodoLabel(tipoPeriodo, anoSel, mesSel.mes, trimSel)
      const periodoAnterior = anteriorLabel(tipoPeriodo, anoSel, mesSel.mes, trimSel)

      const d6m = new Date()
      d6m.setMonth(d6m.getMonth() - 5)
      d6m.setDate(1)
      const ini6m = toISO(d6m)

      const [
        salesAtualRes,
        salesAntRes,
        visitsAtualRes,
        visitsAntRes,
        farmsRes,
        checklistsRes,
        sellersRes,
        appointmentsRes,
        quotesRes,
        salesEvolRes,
        quotesEvolRes,
        allSalesRes,
        allVisitsRes,
      ] = await Promise.all([
        supabaseAdmin.from('sales').select('*').gte('sale_date', ini).lte('sale_date', fim),
        supabaseAdmin.from('sales').select('*').gte('sale_date', iniAnt).lte('sale_date', fimAnt),
        supabaseAdmin.from('visits').select('*').gte('visit_date', ini).lte('visit_date', fim),
        supabaseAdmin.from('visits').select('*').gte('visit_date', iniAnt).lte('visit_date', fimAnt),
        supabaseAdmin.from('farms').select('*').eq('status', 'ativo'),
        supabaseAdmin.from('checklists').select('*').gte('applied_at', ini).lte('applied_at', fim),
        supabaseAdmin.from('profiles').select('*').eq('active', true),
        supabaseAdmin.from('appointments').select('*').gte('appointment_date', toISO(new Date())).lte('appointment_date', toISO(new Date(new Date().setDate(new Date().getDate() + 30)))),
        supabaseAdmin.from('quotes').select('*'),
        supabaseAdmin.from('sales').select('sale_date,total').gte('sale_date', ini6m),
        supabaseAdmin.from('quotes').select('created_at,total').gte('created_at', `${ini6m}T00:00:00`),
        supabaseAdmin.from('sales').select('farm_id,sale_date'),
        supabaseAdmin.from('visits').select('farm_id,visit_date').order('visit_date', { ascending: false }),
      ])

      const salesAtual = salesAtualRes.data || []
      const salesAnt = salesAntRes.data || []
      const visitsAtual = visitsAtualRes.data || []
      const visitsAnt = visitsAntRes.data || []
      const farms = farmsRes.data || []
      const checklists = checklistsRes.data || []
      const sellers = sellersRes.data || []
      const appointments = appointmentsRes.data || []
      const quotes = quotesRes.data || []
      const salesEvol = salesEvolRes.data || []
      const quotesEvol = quotesEvolRes.data || []
      const allSales = allSalesRes.data || []
      const allVisits = allVisitsRes.data || []

      const sellerById = new Map(sellers.map(s => [s.id, s]))
      const farmById = new Map(farms.map(f => [f.id, f]))

      const fatAtual = salesAtual.reduce((a, s) => a + Number(s.total || 0), 0)
      const fatAnt = salesAnt.reduce((a, s) => a + Number(s.total || 0), 0)
      const comissaoAtual = salesAtual.reduce((a, s) => a + Number(s.total || 0) * (Number(s.comissao_pct || 0) / 100), 0)
      const comissaoAnt = salesAnt.reduce((a, s) => a + Number(s.total || 0) * (Number(s.comissao_pct || 0) / 100), 0)
      const comissaoPctFat = fatAtual > 0 ? (comissaoAtual / fatAtual) * 100 : 0
      const pedidosAtual = salesAtual.length
      const pedidosAnt = salesAnt.length
      const ticketAtual = pedidosAtual ? fatAtual / pedidosAtual : 0
      const ticketAnt = pedidosAnt ? fatAnt / pedidosAnt : 0
      const visitasAtual = visitsAtual.length
      const visitasAnt = visitsAnt.length
      const scoreMedia = checklists.length
        ? Math.round(checklists.reduce((a, c) => a + Number(c.overall_score || 0), 0) / checklists.length)
        : 0

      const quotesAbertas = quotes.filter(q => ['rascunho', 'enviada'].includes(String(q.status || '').toLowerCase()))
      const quotesConvertidas = quotes.filter(q => String(q.status || '').toLowerCase() === 'convertida')
      const valorQuotesAbertas = quotesAbertas.reduce((a, q) => a + Number(q.total || 0), 0)

      const d90 = new Date()
      d90.setDate(d90.getDate() - 90)
      const carteiraAtiva = new Set(allSales.filter(s => new Date(s.sale_date) >= d90).map(s => s.farm_id)).size

      const ultimaVisita = {}
      allVisits.forEach(v => {
        if (!ultimaVisita[v.farm_id]) ultimaVisita[v.farm_id] = v.visit_date
      })

      const hoje = new Date()
      const esquecidas = farms.filter(f => {
        const uv = ultimaVisita[f.id]
        return !uv || (hoje - new Date(`${uv}T12:00:00`)) / 86400000 > 45
      })

      const vendedorMap = {}
      salesAtual.forEach(s => {
        const key = s.seller_id || (s.ultra_salesman_id ? `ultra:${s.ultra_salesman_id}` : 'geral')
        if (!vendedorMap[key]) vendedorMap[key] = {
          id: key,
          nome: s.ultra_salesman_name || 'Vendedor não vinculado',
          total: 0,
          pedidos: 0,
        }
        vendedorMap[key].total += Number(s.total || 0)
        vendedorMap[key].pedidos += 1
      })

      const topVendedores = Object.values(vendedorMap)
        .map(v => {
          const profile = sellerById.get(v.id)
          return {
            ...v,
            nome: profile?.name || profile?.full_name || profile?.display_name || profile?.email || v.nome,
            ticket: v.pedidos ? v.total / v.pedidos : 0,
          }
        })
        .sort((a, b) => b.total - a.total)
        .slice(0, 6)

      const fazendaMap = {}
      salesAtual.forEach(s => {
        if (!fazendaMap[s.farm_id]) fazendaMap[s.farm_id] = { id: s.farm_id, total: 0, pedidos: 0 }
        fazendaMap[s.farm_id].total += Number(s.total || 0)
        fazendaMap[s.farm_id].pedidos += 1
      })

      const topFazendas = Object.values(fazendaMap)
        .map(f => {
          const farm = farmById.get(f.id)
          return {
            ...f,
            name: farm?.name || '—',
            segment: farm?.segment || '—',
          }
        })
        .sort((a, b) => b.total - a.total)
        .slice(0, 6)

      const produtoMap = {}
      salesAtual.forEach(s => {
        parseItems(s.items).forEach(item => {
          const name = item?.productName || item?.product_name || item?.name || item?.product || 'Produto'
          const total = Number(item?.subtotal || item?.total || item?.value || 0)
          if (!produtoMap[name]) produtoMap[name] = { name, total: 0 }
          produtoMap[name].total += total
        })
      })

      const topProdutos = Object.values(produtoMap)
        .sort((a, b) => b.total - a.total)
        .slice(0, 8)

      const segMap = {}
      salesAtual.forEach(s => {
        const seg = farmById.get(s.farm_id)?.segment || 'outros'
        if (!segMap[seg]) segMap[seg] = { name: labelSegmento(seg), total: 0 }
        segMap[seg].total += Number(s.total || 0)
      })
      const porSegmento = Object.values(segMap).sort((a, b) => b.total - a.total)

      const evolMap = {}
      for (let i = 5; i >= 0; i--) {
        const d = new Date()
        d.setMonth(d.getMonth() - i)
        d.setDate(1)
        const k = d.toISOString().slice(0, 7)
        evolMap[k] = {
          mes: k,
          label: d.toLocaleDateString('pt-BR', { month: 'short', year: '2-digit' }),
          vendas: 0,
          cotacoes: 0,
        }
      }

      salesEvol.forEach(s => {
        const k = s.sale_date?.slice(0, 7)
        if (evolMap[k]) evolMap[k].vendas += Number(s.total || 0)
      })

      quotesEvol.forEach(q => {
        const k = q.created_at?.slice(0, 7)
        if (evolMap[k]) evolMap[k].cotacoes += Number(q.total || 0)
      })

      const evolucao = Object.values(evolMap)

      const fAtual = {}
      const fAnt = {}
      salesAtual.forEach(s => { fAtual[s.farm_id] = (fAtual[s.farm_id] || 0) + Number(s.total || 0) })
      salesAnt.forEach(s => { fAnt[s.farm_id] = (fAnt[s.farm_id] || 0) + Number(s.total || 0) })

      const fazendasEmQueda = farms
        .filter(f => {
          const atual = fAtual[f.id] || 0
          const ant = fAnt[f.id] || 0
          return ant > 0 && atual < ant && ((ant - atual) / ant) * 100 > 40
        })
        .map(f => ({
          ...f,
          atual: fAtual[f.id] || 0,
          anterior: fAnt[f.id] || 0,
          queda: ((fAnt[f.id] - (fAtual[f.id] || 0)) / fAnt[f.id]) * 100,
        }))
        .sort((a, b) => b.queda - a.queda)
        .slice(0, 10)

      const comparativo = [
        {
          label: 'Faturamento',
          atual: fatAtual,
          anterior: fatAnt,
          atualLabel: fmtK(fatAtual),
          anteriorLabel: fmtK(fatAnt),
          variacao: pct(fatAtual, fatAnt),
        },
        {
          label: 'Pedidos',
          atual: pedidosAtual,
          anterior: pedidosAnt,
          atualLabel: fmtInt(pedidosAtual),
          anteriorLabel: fmtInt(pedidosAnt),
          variacao: pct(pedidosAtual, pedidosAnt),
        },
        {
          label: 'Ticket médio',
          atual: ticketAtual,
          anterior: ticketAnt,
          atualLabel: fmtK(ticketAtual),
          anteriorLabel: fmtK(ticketAnt),
          variacao: pct(ticketAtual, ticketAnt),
        },
        {
          label: 'Visitas',
          atual: visitasAtual,
          anterior: visitasAnt,
          atualLabel: fmtInt(visitasAtual),
          anteriorLabel: fmtInt(visitasAnt),
          variacao: pct(visitasAtual, visitasAnt),
        },
      ]

      const destaque = topVendedores[0]
        ? `${topVendedores[0].nome} liderou o período com ${fmtK(topVendedores[0].total)} em vendas.`
        : 'Sem vendas por vendedor no período selecionado.'

      const atencao = fazendasEmQueda[0]
        ? `${fazendasEmQueda[0].name} caiu ${fazendasEmQueda[0].queda.toFixed(1)}% em faturamento versus o período anterior.`
        : `${esquecidas.length} fazendas estão sem visita há mais de 45 dias.`

      setDados({
        periodoAtual,
        periodoAnterior,
        ini,
        fim,
        iniAnt,
        fimAnt,
        fatAtual,
        fatAnt,
        pedidosAtual,
        pedidosAnt,
        ticketAtual,
        ticketAnt,
        visitasAtual,
        visitasAnt,
        variacoes: {
          faturamento: pct(fatAtual, fatAnt),
          pedidos: pct(pedidosAtual, pedidosAnt),
          ticket: pct(ticketAtual, ticketAnt),
          visitas: pct(visitasAtual, visitasAnt),
          comissao: pct(comissaoAtual, comissaoAnt),
        },
        comissaoAtual,
        comissaoAnt,
        comissaoPctFat,
        scoreMedia,
        checklists: checklists.length,
        carteiraAtiva,
        carteiraTotal: farms.length,
        cotacoesAbertas: quotesAbertas.length,
        valorCotacoesAbertas: valorQuotesAbertas,
        cotacoesConvertidas: quotesConvertidas.length,
        conversaoCotacoes: quotes.length ? (quotesConvertidas.length / quotes.length) * 100 : 0,
        esquecidas,
        appointments,
        topVendedores,
        topFazendas,
        topProdutos,
        porSegmento,
        evolucao,
        fazendasEmQueda,
        comparativo,
        destaque,
        atencao,
      })
    } catch (err) {
      console.error('Erro ao carregar relatório:', err)
      setDados(null)
    } finally {
      setLoading(false)
    }
  }

  async function gerarPDF() {
    if (!dados || !printRef.current) return

    setGerandoPDF(true)

    try {
      await document.fonts?.ready

      const pages = Array.from(printRef.current.querySelectorAll('.relpremium-pdf-page'))
      const pdf = new jsPDF('p', 'mm', 'a4')

      for (let i = 0; i < pages.length; i++) {
        const canvas = await html2canvas(pages[i], {
          scale: 2.2,
          useCORS: true,
          allowTaint: true,
          backgroundColor: '#ffffff',
          logging: false,
          windowWidth: 794,
          windowHeight: 1123,
        })

        const img = canvas.toDataURL('image/jpeg', 0.96)

        if (i > 0) pdf.addPage()
        pdf.addImage(img, 'JPEG', 0, 0, 210, 297)
      }

      pdf.save(`Nutrialle_Relatorio_Executivo_${dados.periodoAtual.replace(/\s+/g, '_')}.pdf`)
    } catch (err) {
      console.error('Erro ao gerar PDF premium:', err)
    } finally {
      setGerandoPDF(false)
    }
  }

  const periodoAtualTexto = dados?.periodoAtual || periodoLabel(tipoPeriodo, anoSel, mesSel.mes, trimSel)

  return (
    <div style={{ flex: 1, overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>
      <Topbar title="Exportar Relatório Executivo" subtitle="Selecione o período e gere um PDF premium com identidade Nutrialle" />

      <div className="page relpremium-page" style={{ overflowY: 'auto' }}>
        <section className="relpremium-hero">
          <div>
            <span className="relpremium-eyebrow">Relatório executivo Nutrialle</span>
            <h2>Gerador de PDF premium</h2>
            <p>
              A página serve para selecionar o período e exportar. O conteúdo visual completo é montado em um template A4 premium e renderizado no PDF.
            </p>
          </div>

          <div className="relpremium-period-card">
            <IconFileText size={28} />
            <strong>{periodoAtualTexto}</strong>
            <span>Período selecionado</span>
          </div>
        </section>

        <section className="relpremium-generator">
          <div className="relpremium-panel">
            <div className="relpremium-panel-head">
              <div>
                <span className="relpremium-eyebrow">Configuração</span>
                <h3>Selecionar período</h3>
              </div>
              <IconCalendar size={20} />
            </div>

            <div className="relpremium-tabs">
              {[
                ['mensal', 'Mensal'],
                ['trimestral', 'Trimestral'],
                ['anual', 'Anual'],
              ].map(([value, label]) => (
                <button
                  key={value}
                  type="button"
                  className={tipoPeriodo === value ? 'active' : ''}
                  onClick={() => setTipoPeriodo(value)}
                >
                  {label}
                </button>
              ))}
            </div>

            <div className="relpremium-form-grid">
              {tipoPeriodo === 'mensal' && (
                <label>
                  <span>Mês de referência</span>
                  <select
                    value={`${mesSel.ano}-${mesSel.mes}`}
                    onChange={e => {
                      const [ano, mes] = e.target.value.split('-').map(Number)
                      setAnoSel(ano)
                      setMesSel({
                        ano,
                        mes,
                        label: new Date(ano, mes - 1, 1).toLocaleDateString('pt-BR', {
                          month: 'long',
                          year: 'numeric',
                        }),
                      })
                    }}
                  >
                    {mesesOpcoes.map(m => (
                      <option key={`${m.ano}-${m.mes}`} value={`${m.ano}-${m.mes}`}>
                        {m.label.charAt(0).toUpperCase() + m.label.slice(1)}
                      </option>
                    ))}
                  </select>
                </label>
              )}

              {tipoPeriodo === 'trimestral' && (
                <>
                  <label>
                    <span>Trimestre</span>
                    <select value={trimSel} onChange={e => setTrimSel(Number(e.target.value))}>
                      <option value={1}>1º Trimestre</option>
                      <option value={2}>2º Trimestre</option>
                      <option value={3}>3º Trimestre</option>
                      <option value={4}>4º Trimestre</option>
                    </select>
                  </label>

                  <label>
                    <span>Ano</span>
                    <select value={anoSel} onChange={e => setAnoSel(Number(e.target.value))}>
                      {anosOpcoes.map(ano => (
                        <option key={ano} value={ano}>{ano}</option>
                      ))}
                    </select>
                  </label>
                </>
              )}

              {tipoPeriodo === 'anual' && (
                <label>
                  <span>Ano</span>
                  <select value={anoSel} onChange={e => setAnoSel(Number(e.target.value))}>
                    {anosOpcoes.map(ano => (
                      <option key={ano} value={ano}>{ano}</option>
                    ))}
                  </select>
                </label>
              )}
            </div>

            <button className="relpremium-download" onClick={gerarPDF} disabled={loading || gerandoPDF || !dados}>
              {gerandoPDF ? <IconLoader2 size={17} className="relpremium-spin" /> : <IconDownload size={17} />}
              {gerandoPDF ? 'Renderizando PDF premium...' : 'Exportar PDF premium'}
            </button>
          </div>

          <div className="relpremium-panel">
            <div className="relpremium-panel-head">
              <div>
                <span className="relpremium-eyebrow">Prévia rápida</span>
                <h3>Dados que entrarão no PDF</h3>
              </div>
              {loading ? <IconLoader2 size={20} className="relpremium-spin" /> : <IconCheck size={20} />}
            </div>

            {loading ? (
              <div className="relpremium-loading">Carregando dados do período...</div>
            ) : dados ? (
              <>
                <div className="relpremium-metrics">
                  <MetricPreview label="Faturamento" value={fmtK(dados.fatAtual)} variation={dados.variacoes.faturamento} />
                  <MetricPreview label="Pedidos" value={fmtInt(dados.pedidosAtual)} variation={dados.variacoes.pedidos} />
                  <MetricPreview label="Ticket médio" value={fmtK(dados.ticketAtual)} variation={dados.variacoes.ticket} />
                  <MetricPreview label="Visitas" value={fmtInt(dados.visitasAtual)} variation={dados.variacoes.visitas} />
                  <MetricPreview label="Comissões" value={`${fmtK(dados.comissaoAtual)} · ${dados.comissaoPctFat.toFixed(1)}%`} variation={dados.variacoes.comissao} />
                </div>

                <div className="relpremium-included">
                  {[
                    'Capa premium institucional',
                    'Resumo executivo visual',
                    'Comparativo com período anterior',
                    'Gráfico de evolução em SVG',
                    'Rankings comerciais',
                    'Mix de produtos e segmentos',
                    'Pontos de atenção',
                    'Plano de ação executivo',
                  ].map(item => (
                    <div key={item}>
                      <IconCheck size={14} />
                      <span>{item}</span>
                    </div>
                  ))}
                </div>
              </>
            ) : (
              <div className="relpremium-loading">Não foi possível carregar os dados.</div>
            )}
          </div>
        </section>
      </div>

      <div ref={printRef}>
        <PdfTemplate dados={dados} />
      </div>
    </div>
  )
}
