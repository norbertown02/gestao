import { useEffect, useMemo, useRef, useState } from 'react'
import { Area, AreaChart, Bar, BarChart, CartesianGrid, ComposedChart, LabelList, Line, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'
import * as d3 from 'd3'
import { IconArrowLeft, IconArrowRight, IconCheck, IconDownload, IconEdit, IconFileTypePdf, IconPresentation, IconRefresh } from '@tabler/icons-react'
import html2canvas from 'html2canvas'
import jsPDF from 'jspdf'
import Topbar from '../components/Topbar'
import logo from '../assets/logo-nutrialle.png'
import { supabaseAdmin } from '../lib/supabase'
import { fiscalDocumentValue, hasNetOrderValue, netOrderValue } from '../lib/commercialMetrics'
import './FechamentosFinance.css'

const MONTHS = ['Jan', 'Fev', 'Mar', 'Abr', 'Mai', 'Jun', 'Jul', 'Ago', 'Set', 'Out', 'Nov', 'Dez']
const MONTHS_FULL = ['janeiro', 'fevereiro', 'março', 'abril', 'maio', 'junho', 'julho', 'agosto', 'setembro', 'outubro', 'novembro', 'dezembro']
const COLORS = ['#f47b20', '#ffb067', '#3b3835', '#81776f', '#c8bdb3', '#f3e7dc']

const PERIOD_TYPE_LABEL = { mensal: 'Mês', trimestral: 'Trimestre', semestral: 'Semestre', anual: 'Ano' }
const PERIOD_TYPE_SIZE = { mensal: 1, trimestral: 3, semestral: 6, anual: 12 }
const PERIOD_TYPE_COUNT = { mensal: 12, trimestral: 4, semestral: 2, anual: 1 }
const COMPARISON_NOUN = { mensal: 'mês anterior', trimestral: 'trimestre anterior', semestral: 'semestre anterior', anual: 'ano anterior' }

const number = value => Number(value || 0)
const money = value => number(value).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })
const shortMoney = value => {
  const n = number(value)
  if (Math.abs(n) >= 1000000) return `R$ ${(n / 1000000).toFixed(2).replace('.', ',')} mi`
  if (Math.abs(n) >= 1000) return `R$ ${(n / 1000).toFixed(0)} mil`
  return money(n)
}
const pct = value => `${number(value).toFixed(1).replace('.', ',')}%`
const variation = (current, previous) => previous ? (current - previous) / Math.abs(previous) * 100 : current ? 100 : 0
const sanitizeName = value => String(value).normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-zA-Z0-9_-]+/g, '-').replace(/^-|-$/g, '').toLowerCase()
const iso = date => date.toISOString().slice(0, 10)
const commercialSellerKey = row => row.ultra_salesman_id ? `ultra:${row.ultra_salesman_id}` : row.seller_id

// -- Modelo de período: mensal/trimestral/semestral/anual, cada um sabe calcular seu
// período anterior equivalente (o que vira comparativo em toda a apresentação).
function periodBounds(type, year, index) {
  const size = PERIOD_TYPE_SIZE[type]
  const startMonth = type === 'anual' ? 1 : (index - 1) * size + 1
  return { year, startMonth, endMonth: startMonth + size - 1 }
}
function previousPeriodBounds(type, year, index) {
  if (type === 'anual') return { year: year - 1, startMonth: 1, endMonth: 12 }
  if (index === 1) return periodBounds(type, year - 1, PERIOD_TYPE_COUNT[type])
  return periodBounds(type, year, index - 1)
}
function boundsToRange(bounds) {
  const start = new Date(bounds.year, bounds.startMonth - 1, 1)
  const nominalEnd = new Date(bounds.year, bounds.endMonth, 0)
  const today = new Date()
  const end = today >= start && today <= nominalEnd ? today : nominalEnd
  return { start, end, nominalEnd }
}
function periodLabel(type, bounds) {
  if (type === 'mensal') return `${MONTHS_FULL[bounds.startMonth - 1][0].toUpperCase()}${MONTHS_FULL[bounds.startMonth - 1].slice(1)} ${bounds.year}`
  if (type === 'trimestral') return `${Math.ceil(bounds.startMonth / 3)}º Trimestre ${bounds.year}`
  if (type === 'semestral') return `${bounds.startMonth === 1 ? '1º' : '2º'} Semestre ${bounds.year}`
  return `Ano ${bounds.year}`
}
function indexOptionsFor(type) {
  if (type === 'mensal') return MONTHS_FULL.map((label, i) => ({ value: i + 1, label: label[0].toUpperCase() + label.slice(1) }))
  if (type === 'trimestral') return [1, 2, 3, 4].map(i => ({ value: i, label: `${i}º Trimestre (${MONTHS[(i - 1) * 3]}-${MONTHS[(i - 1) * 3 + 2]})` }))
  if (type === 'semestral') return [1, 2].map(i => ({ value: i, label: `${i}º Semestre (${i === 1 ? 'Jan-Jun' : 'Jul-Dez'})` }))
  return [{ value: 1, label: 'Ano completo' }]
}

function Delta({ current, previous, suffix }) {
  const value = variation(current, previous)
  return <span className={value >= 0 ? 'deck-delta positive' : 'deck-delta negative'}>{value >= 0 ? '↗' : '↘'} {Math.abs(value).toFixed(1).replace('.', ',')}% {suffix}</span>
}

function Brand({ page, total, dark = false }) {
  return <div className={`deck-brand ${dark ? 'dark' : ''}`}><img src={logo} alt="Nutrialle" /><span>{String(page).padStart(2, '0')} / {String(total).padStart(2, '0')}</span></div>
}

function EditableText({ as: Tag = 'span', editKey, value, editor, className = '' }) {
  const text = editor?.copy?.[editKey] ?? value
  return <Tag
    className={`${className} ${editor?.enabled ? 'deck-editable' : ''}`.trim()}
    contentEditable={!!editor?.enabled}
    suppressContentEditableWarning
    onBlur={event => editor?.setCopy?.(current => ({ ...current, [editKey]: event.currentTarget.innerText }))}
  >{text}</Tag>
}

function Cover({ type, period, previousLabel, generatedAt, total, editor }) {
  const commercial = type === 'comercial'
  return <article className="deck-slide deck-cover">
    <div className="deck-cover-glow" />
    <img className="deck-cover-logo" src={logo} alt="Nutrialle" />
    <div className="deck-cover-copy"><span>FECHAMENTO {commercial ? 'COMERCIAL' : 'FINANCEIRO'}</span><h1>{period}</h1><EditableText as="p" editKey={`${type}.cover.subtitle`} value={commercial ? 'Performance, mercado e direção para o próximo ciclo.' : 'Resultado, liquidez e decisões para sustentar o crescimento.'} editor={editor} /><small>Comparado a {previousLabel}</small></div>
    <div className="deck-cover-foot"><i /> Gestão Nutrialle <b>•</b> gerado automaticamente em {generatedAt} <b>•</b> confidencial</div>
    <Brand page={1} total={total} dark />
  </article>
}

function Slide({ children, page, total, tone = 'light', className = '' }) {
  return <article className={`deck-slide deck-${tone} ${className}`}>{children}<Brand page={page} total={total} dark={tone === 'dark'} /></article>
}

function SlideTitle({ eyebrow, children, aside, editKey, editor }) {
  return <header className="deck-title"><div><span>{eyebrow}</span>{editKey ? <EditableText as="h2" editKey={editKey} value={children} editor={editor} /> : <h2>{children}</h2>}</div>{aside && <small>{aside}</small>}</header>
}

function BigNumber({ label, value, note, accent = false }) {
  return <div className={`deck-big-number ${accent ? 'accent' : ''}`}><span>{label}</span><strong>{value}</strong>{note}</div>
}

function MetricStrip({ items, dark = false }) {
  return <div className={`deck-metric-strip ${dark ? 'dark' : ''}`}>{items.map(item => <div key={item.label}><span>{item.label}</span><strong>{item.value}</strong>{item.note && <small>{item.note}</small>}</div>)}</div>
}

function BrazilSalesMap({ regions }) {
  const svgRef = useRef(null)
  const [geo, setGeo] = useState(null)
  useEffect(() => {
    fetch(import.meta.env.BASE_URL + 'brazil.json').then(response => response.json()).then(setGeo).catch(() => setGeo(null))
  }, [])
  useEffect(() => {
    if (!geo || !svgRef.current) return
    const values = new Map(regions.map(item => [item.name, item.value]))
    const max = Math.max(...regions.map(item => item.value), 1)
    const svg = d3.select(svgRef.current)
    svg.selectAll('*').remove()
    const projection = d3.geoMercator().fitSize([430, 380], geo)
    const path = d3.geoPath().projection(projection)
    const state = feature => feature.properties?.sigla || feature.properties?.SIGLA || feature.properties?.UF || feature.id
    svg.attr('viewBox', '0 0 430 380')
    svg.selectAll('path').data(geo.features).join('path').attr('d', path).attr('fill', feature => {
      const value = values.get(state(feature)) || 0
      return value ? d3.interpolateRgb('#f8d6bc', '#e87722')(.25 + .75 * value / max) : '#e9e3dd'
    }).attr('stroke', '#fff').attr('stroke-width', 1.2)
    regions.slice(0, 8).forEach(item => {
      const feature = geo.features.find(entry => state(entry) === item.name)
      if (!feature) return
      const [x, y] = path.centroid(feature)
      if (!Number.isFinite(x) || !Number.isFinite(y)) return
      svg.append('circle').attr('cx', x).attr('cy', y).attr('r', Math.max(5, 8 * Math.sqrt(item.value / max))).attr('fill', '#292623').attr('stroke', '#fff').attr('stroke-width', 1.5)
      svg.append('text').attr('x', x).attr('y', y - 10).attr('text-anchor', 'middle').attr('font-size', 10).attr('font-weight', 900).attr('fill', '#292623').text(item.name)
    })
  }, [geo, regions])
  return <div className="deck-brazil-map">{geo ? <svg ref={svgRef} aria-label="Mapa do faturamento líquido por estado" /> : <span>Mapa indisponível</span>}<div className="deck-map-scale"><i /><span>menor faturamento</span><b>maior faturamento</b></div></div>
}

function IntegratedExecutiveSlide({ page, total, commercial, financial, period, editor }) {
  const uncovered = Math.max(commercial.goal - commercial.projectedOrders, 0)
  const pos = financial.position
  return <Slide key="integrated" page={page} total={total} tone="dark" className="deck-integrated"><span className="deck-kicker">VISÃO EXECUTIVA INTEGRADA · {period}</span><EditableText as="h2" editKey="integrated.title" value={uncovered > 0 ? `A prioridade é cobrir ${shortMoney(uncovered)} da meta sem perder margem e liquidez.` : 'A carteira cobre a meta; a prioridade é converter pedidos com margem e caixa.'} editor={editor}/><div className="deck-integrated-line"><div><span>Pedidos</span><strong>{shortMoney(commercial.ordersValue)}</strong><small>{commercial.goal ? `${pct(commercial.attainment)} da meta` : 'meta não cadastrada'}</small></div><i>→</i><div><span>Carteira aberta</span><strong>{shortMoney(commercial.openPortfolio)}</strong><small>potencial a faturar</small></div><i>→</i><div><span>Margem de contribuição</span><strong>{pct(financial.contributionMargin)}</strong><small>{shortMoney(financial.contribution)} para a estrutura</small></div><i>→</i><div><span>Resultado</span><strong>{shortMoney(financial.result)}</strong><small>{pct(financial.netMargin)} da receita</small></div></div><div className="deck-integrated-decisions"><section><span>COMERCIAL</span><EditableText as="p" editKey="integrated.commercial" value={`${uncovered > 0 ? `Gerar ${shortMoney(uncovered)} além da carteira atual.` : 'Converter a carteira que já cobre a meta.'} Proteger clientes-chave e atuar nas menores coberturas.`} editor={editor}/></section><section><span>MARGEM</span><EditableText as="p" editKey="integrated.margin" value={`Preservar a margem de contribuição em ${pct(financial.contributionMargin)} ou acima, acompanhando mix e negociações fora do padrão.`} editor={editor}/></section><section><span>LIQUIDEZ</span><EditableText as="p" editKey="integrated.cash" value={pos ? `Administrar ${shortMoney(pos.totalReceivable)} a receber contra ${shortMoney(pos.totalPayable)} a pagar, com liquidez de ${pos.currentRatio.toFixed(2).replace('.', ',')}x.` : 'Completar a posição financeira para orientar as decisões de liquidez.'} editor={editor}/></section></div></Slide>
}

function CommercialSlides({ data, financial, period, previousLabel, generatedAt, comparisonNoun, editor }) {
  const total = 13
  const { current: cur, previous: prev, trajectory, trajectoryDaily } = data
  const maxSeller = Math.max(...cur.sellers.map(item => item.orders), 1)
  const maxProduct = Math.max(...cur.products.map(item => item.value), 1)
  const maxClient = Math.max(...cur.clients.map(item => item.value), 1)
  const maxSegment = Math.max(...cur.segments.map(item => item.value), 1)
  const leaderChanged = cur.regions[0]?.name && prev.regions[0]?.name && cur.regions[0].name !== prev.regions[0].name
  const currentClientIds = new Set(cur.clientIds)
  const previousClientIds = new Set(prev.clientIds)
  const retainedClients = cur.clientIds.filter(id => previousClientIds.has(id)).length
  const enteredClients = cur.newClientCount
  const newClientIds = new Set(cur.newClientIds)
  const reactivatedClients = cur.clientIds.filter(id => !previousClientIds.has(id) && !newClientIds.has(id)).length
  const inactiveClients = prev.clientIds.filter(id => !currentClientIds.has(id)).length
  return [
    <Cover key="cover" type="comercial" period={period} previousLabel={previousLabel} generatedAt={generatedAt} total={total} editor={editor} />,
    <Slide key="summary" page={2} total={total} tone="dark" className="deck-thesis">
      <span className="deck-kicker">RESUMO EXECUTIVO</span>
      <EditableText as="h2" editKey="comercial.summary.title" value={cur.ordersValue >= prev.ordersValue ? `Pedidos cresceram ${pct(Math.abs(variation(cur.ordersValue, prev.ordersValue)))} frente ao ${comparisonNoun}, para ${shortMoney(cur.ordersValue)}.` : `Pedidos recuaram ${pct(Math.abs(variation(cur.ordersValue, prev.ordersValue)))} frente ao ${comparisonNoun}, para ${shortMoney(cur.ordersValue)}.`} editor={editor} />
      <div className="deck-thesis-metrics"><BigNumber label="Pedidos líquidos" value={shortMoney(cur.ordersValue)} note={<Delta current={cur.ordersValue} previous={prev.ordersValue} suffix={`vs. ${comparisonNoun}`} />} /><BigNumber label="Faturamento líquido" value={shortMoney(cur.billing)} note={<Delta current={cur.billing} previous={prev.billing} suffix={`vs. ${comparisonNoun}`} />} accent /><BigNumber label="Carteira aberta" value={shortMoney(cur.openPortfolio)} note={<small>potencial aguardando faturamento</small>} /></div>
      <MetricStrip dark items={[
        { label: 'Ticket médio', value: shortMoney(cur.averageTicket), note: `${comparisonNoun}: ${shortMoney(prev.averageTicket)}` },
        { label: 'Clientes faturados', value: cur.billedClients, note: `${comparisonNoun}: ${prev.billedClients}` },
        { label: 'Maior cliente', value: pct(cur.topClientShare), note: 'participação no faturamento' },
        { label: 'Atingimento da meta', value: cur.goal ? pct(cur.attainment) : '—', note: prev.goal ? `${comparisonNoun}: ${pct(prev.attainment)}` : 'sem meta comparável' },
      ]} />
    </Slide>,
    <Slide key="rhythm" page={3} total={total}>
      <SlideTitle eyebrow="RITMO DO PERÍODO" aside={`vs. ${comparisonNoun}`} editKey="comercial.rhythm.title" editor={editor}>{cur.ordersValue >= prev.ordersValue ? 'O ritmo de pedidos está acima do período anterior.' : 'O ritmo de pedidos está abaixo do período anterior.'}</SlideTitle>
      <MetricStrip items={[{ label: 'Pedidos do período', value: shortMoney(cur.ordersValue) }, { label: `Pedidos — ${comparisonNoun}`, value: shortMoney(prev.ordersValue) }, { label: 'Variação', value: `${variation(cur.ordersValue, prev.ordersValue) >= 0 ? '+' : ''}${pct(variation(cur.ordersValue, prev.ordersValue))}` }]} />
      <div className="deck-chart-stage"><ResponsiveContainer width="100%" height="100%"><AreaChart data={trajectory} margin={{ top: 18, right: 18, left: 8, bottom: 0 }}><defs><linearGradient id="deckBilling" x1="0" x2="0" y1="0" y2="1"><stop offset="0" stopColor="#f47b20" stopOpacity=".28" /><stop offset="1" stopColor="#f47b20" stopOpacity="0" /></linearGradient></defs><CartesianGrid vertical={false} stroke="#e9e1da" strokeDasharray="3 7" /><XAxis dataKey="label" axisLine={false} tickLine={false} /><YAxis axisLine={false} tickLine={false} tickFormatter={v => `${Math.round(v / 1000)}k`} /><Tooltip formatter={v => money(v)} /><Area type="monotone" dataKey="Período atual" stroke="#f47b20" strokeWidth={4} fill="url(#deckBilling)" /><Line type="monotone" dataKey="Período anterior" stroke="#292623" strokeWidth={2.5} strokeDasharray="5 5" dot={false} /></AreaChart></ResponsiveContainer></div>
      <div className="deck-chart-legend"><i className="orange" /> {trajectoryDaily ? 'Pedidos acumulados no mês' : 'Pedidos por mês'} <i className="ink" /> {comparisonNoun[0].toUpperCase() + comparisonNoun.slice(1)}</div>
    </Slide>,
    <Slide key="goal" page={4} total={total} className="deck-goal-slide">
      <SlideTitle eyebrow="META DE PEDIDOS" aside={period} editKey="comercial.goal.title" editor={editor}>Pedidos gerados atingiram {cur.goal ? pct(cur.attainment) : '—'} da meta do período.</SlideTitle>
      <div className="deck-goal-main"><div><span>ATINGIMENTO DO PERÍODO</span><strong>{cur.goal ? pct(cur.attainment) : '—'}</strong><EditableText as="p" editKey="comercial.goal.body" value={cur.goal ? `${shortMoney(Math.max(cur.goal - cur.ordersValue, 0))} ainda separam os pedidos realizados da meta deste período.` : 'Meta ainda não cadastrada para o período.'} editor={editor} /></div><div className="deck-goal-ring" style={{ '--progress': `${Math.min(cur.goal ? cur.attainment : 0, 100)}%` }}><span>{shortMoney(cur.ordersValue)}</span><small>em pedidos</small></div></div>
      <div className="deck-goal-track"><i style={{ width: `${Math.min(cur.goal ? cur.attainment : 0, 100)}%` }} /><span>0</span><b>Meta {shortMoney(cur.goal)}</b></div>
      <MetricStrip items={[{ label: 'Atingimento do período', value: cur.goal ? pct(cur.attainment) : '—' }, { label: `Atingimento — ${comparisonNoun}`, value: prev.goal ? pct(prev.attainment) : '—' }, { label: 'Meta do período', value: shortMoney(cur.goal) }, { label: 'Saldo até a meta', value: shortMoney(Math.max(cur.goal - cur.ordersValue, 0)) }]} />
    </Slide>,
    <Slide key="forecast" page={5} total={total} className="deck-commercial-forecast">
      <SlideTitle eyebrow="PREVISÃO COMERCIAL" aside="projeção pelo ritmo de pedidos" editKey="comercial.forecast.title" editor={editor}>No ritmo atual, o período tende a fechar em {shortMoney(cur.projectedOrders)}.</SlideTitle>
      <div className="deck-forecast-hero"><div><span>PROJEÇÃO DE FECHAMENTO</span><strong>{shortMoney(cur.projectedOrders)}</strong><small className={cur.projectedOrders >= cur.goal ? 'positive' : 'negative'}>{cur.goal ? `${cur.projectedOrders >= cur.goal ? 'acima' : 'abaixo'} da meta em ${shortMoney(Math.abs(cur.projectedOrders-cur.goal))}` : 'sem meta para comparar'}</small></div><div><BigNumber label="Ritmo realizado" value={shortMoney(cur.dailyPace)} note={<small>pedidos por dia corrido</small>}/><BigNumber label="Ritmo necessário" value={shortMoney(cur.requiredDailyPace)} note={<small>para alcançar a meta</small>}/><BigNumber label="Dias restantes" value={cur.remainingDays} note={<small>até o encerramento</small>}/><BigNumber label="Carteira a faturar" value={shortMoney(cur.openPortfolio)} note={<small>não somada à meta de pedidos</small>}/></div></div>
      <div className="deck-fin-note"><b>Metodologia:</b> projeção linear baseada nos pedidos líquidos gerados por dia no período; a carteira aberta aparece separadamente porque seus pedidos já podem estar incluídos no realizado.</div>
    </Slide>,
    <Slide key="portfolio" page={6} total={total} tone="dark">
      <SlideTitle eyebrow="CARTEIRA A FATURAR" aside={`${cur.openOrderCount} pedidos em aberto`} editKey="comercial.portfolio.title" editor={editor}>{cur.openPortfolio ? `${shortMoney(cur.openPortfolio)} aguardam faturamento, com idade média de ${cur.openAverageAge.toFixed(0)} dias.` : 'Não há pedidos pendentes de faturamento.'}</SlideTitle>
      <MetricStrip dark items={[{ label: 'Carteira aberta', value: shortMoney(cur.openPortfolio) }, { label: 'Pedidos em aberto', value: cur.openOrderCount }, { label: 'Idade média', value: `${cur.openAverageAge.toFixed(0)} dias` }, { label: 'Acima de 30 dias', value: shortMoney(cur.openOver30) }]} />
      <div className="deck-portfolio-list">{cur.openOrders.slice(0, 6).map((order, index) => <div key={order.id}><b>{String(index + 1).padStart(2, '0')}</b><span><strong>{order.customer}</strong><small>{order.seller} · pedido {order.number}</small></span><strong>{shortMoney(order.value)}</strong><small>{order.age} dias</small></div>)}</div>
    </Slide>,
    <Slide key="sellers" page={7} total={total}>
      <SlideTitle eyebrow="COBERTURA DA META POR VENDEDOR" aside="projeção pelo ritmo · carteira informativa" editKey="comercial.sellers.title" editor={editor}>Quem tende a alcançar a meta — e onde o ritmo precisa acelerar.</SlideTitle>
      <div className="deck-ranking-head deck-coverage-head"><span>Vendedor</span><span>Pedidos</span><span>Carteira</span><span>Cobertura</span><span>Descoberto</span></div>
      <div className="deck-ranking">{cur.sellers.slice(0, 6).map((seller, index) => {
        const coverage = seller.goal ? seller.projectedOrders / seller.goal * 100 : 0
        return <div className="deck-coverage-row" key={seller.key}><b>{String(index + 1).padStart(2, '0')}</b><span><strong>{seller.name}</strong><i><em style={{ width: `${seller.orders / maxSeller * 100}%` }} /></i></span><strong>{shortMoney(seller.orders)}</strong><small>{shortMoney(seller.openPortfolio)}</small><small className="deck-seller-goal">{seller.goal ? pct(coverage) : 'Sem meta'}</small><small className={seller.goal && seller.projectedOrders < seller.goal ? 'negative' : 'positive'}>{seller.goal ? shortMoney(Math.max(seller.goal - seller.projectedOrders, 0)) : '—'}</small></div>
      })}</div>
    </Slide>,
    <Slide key="clients" page={8} total={total}>
      <SlideTitle eyebrow="CARTEIRA DE CLIENTES" aside={`${cur.billedClients} clientes faturados`} editKey="comercial.clients.title" editor={editor}>{cur.clients.length ? `Os cinco maiores clientes representam ${pct(cur.top5ClientShare)} do faturamento.` : 'Ainda não há clientes faturados no período.'}</SlideTitle>
      <MetricStrip items={[{ label: 'Clientes novos', value: enteredClients, note: 'primeira venda no histórico' }, { label: 'Reativados', value: reactivatedClients, note: `voltaram após não faturar no ${comparisonNoun}` }, { label: 'Retidos', value: retainedClients, note: 'faturaram nos dois períodos' }, { label: 'Deixaram de faturar', value: inactiveClients, note: 'exigem atuação comercial' }, { label: 'Top 5', value: pct(cur.top5ClientShare), note: 'concentração da receita' }]} />
      <div className="deck-client-bars">{cur.clients.slice(0, 7).map((client, index) => <div key={client.name}><b>{String(index + 1).padStart(2, '0')}</b><span>{client.name}</span><i><em style={{ width: `${client.value / maxClient * 100}%` }} /></i><strong>{shortMoney(client.value)}</strong><small>{pct(client.share)}</small></div>)}</div>
    </Slide>,
    <Slide key="products" page={9} total={total} tone="dark">
      <SlideTitle eyebrow="MIX DE PRODUTOS" aside="faturamento líquido" editKey="comercial.products.title" editor={editor}>Produtos que formaram o faturamento líquido do período.</SlideTitle>
      <div className="deck-products"><div className="deck-product-hero"><span>PRODUTO LÍDER</span><h3>{cur.products[0]?.name || 'Sem faturamento'}</h3><strong>{shortMoney(cur.products[0]?.value)}</strong><small>{cur.billing ? pct((cur.products[0]?.value || 0) / cur.billing * 100) : '0%'} do faturamento{prev.products[0]?.name === cur.products[0]?.name ? ' · mesmo líder do período anterior' : ''}</small></div><div className="deck-product-bars">{cur.products.slice(1, 6).map(product => <div key={product.name}><span>{product.name}</span><i><em style={{ width: `${product.value / maxProduct * 100}%`, background: '#F1D58A' }} /></i><strong>{shortMoney(product.value)}</strong></div>)}</div></div>
    </Slide>,
    <Slide key="segments" page={10} total={total} tone="dark">
      <SlideTitle eyebrow="SEGMENTOS" aside="faturamento líquido" editKey="comercial.segments.title" editor={editor}>{cur.segments.some(item => item.name !== 'Sem segmento') ? 'Distribuição do faturamento por segmento de cliente.' : 'A visão por segmento será preenchida conforme a classificação da carteira for concluída.'}</SlideTitle>
      <div className="deck-segment-layout"><div><span>SEGMENTO LÍDER</span><strong>{cur.segments[0]?.name || 'Sem dados'}</strong><p>{cur.segments[0] && cur.billing ? `${shortMoney(cur.segments[0].value)} · ${pct(cur.segments[0].value / cur.billing * 100)} do faturamento.` : 'O conteúdo será atualizado automaticamente quando os clientes receberem sua classificação.'}</p></div><div className="deck-segment-bars">{cur.segments.slice(0, 7).map((segment, index) => <div key={segment.name}><span>{segment.name}</span><i><em style={{ width: `${segment.value / maxSegment * 100}%`, background: COLORS[index % COLORS.length] }} /></i><strong>{shortMoney(segment.value)}</strong><small>{segment.clients} clientes</small></div>)}</div></div>
    </Slide>,
    <Slide key="regions" page={11} total={total}>
      <SlideTitle eyebrow="PRESENÇA DE MERCADO" aside={`${cur.activeClients} clientes ativos`} editKey="comercial.regions.title" editor={editor}>Distribuição do faturamento líquido por estado{leaderChanged ? ' — liderança mudou no período' : ''}.</SlideTitle>
      <MetricStrip items={[{ label: 'Estado líder', value: cur.regions[0]?.name || '—', note: shortMoney(cur.regions[0]?.value) }, { label: 'Participação do líder', value: cur.billing ? pct((cur.regions[0]?.value || 0) / cur.billing * 100) : '—' }, { label: `Líder — ${comparisonNoun}`, value: prev.regions[0]?.name || '—' }, { label: 'Estados faturados', value: cur.regions.length }]} />
      <div className="deck-region-layout map"><BrazilSalesMap regions={cur.regions} /><div className="deck-region-list">{cur.regions.slice(0, 6).map((region, index) => <div key={region.name}><i style={{ background: COLORS[index % COLORS.length] }} /><strong>{region.name}</strong><span>{shortMoney(region.value)}</span><small>{cur.billing ? pct(region.value / cur.billing * 100) : '0%'}</small></div>)}</div></div>
    </Slide>,
    <Slide key="close" page={12} total={total} tone="dark" className="deck-close">
      <span>RECOMENDAÇÕES COMERCIAIS</span><EditableText as="h2" editKey="comercial.close.title" value={cur.ordersValue < prev.ordersValue ? `Recuperar o ritmo: pedidos ${pct(Math.abs(variation(cur.ordersValue, prev.ordersValue)))} abaixo do ${comparisonNoun}.` : cur.openPortfolio > 0 ? `Converter a carteira de ${shortMoney(cur.openPortfolio)} e sustentar a geração de pedidos.` : 'Recompor a carteira de pedidos do próximo período.'} editor={editor} /><EditableText as="p" editKey="comercial.close.body" value={`1. Atacar o saldo de ${shortMoney(Math.max(cur.goal - cur.ordersValue, 0))} da meta de pedidos. 2. Proteger a receita dos principais clientes e ampliar a diversificação. 3. Replicar o mix e a execução dos vendedores líderes. 4. Completar a segmentação da carteira para orientar a prospecção.`} editor={editor} /><div><i /> direcionamento para o próximo ciclo</div>
    </Slide>,
    <IntegratedExecutiveSlide key="integrated" page={13} total={total} commercial={cur} financial={financial.current} period={period} editor={editor}/>,
  ]
}

// Mantida temporariamente como referência da versão anterior durante a migração do fechamento.
// eslint-disable-next-line no-unused-vars
function FinancialSlides({ data, period, previousLabel, generatedAt, comparisonNoun, editor }) {
  const total = 9
  const { current: cur, previous: prev, series, hasData, previousHasData } = data
  const maxCost = Math.max(...cur.costs.map(item => item.value), 1)
  const pos = cur.position
  const prevPos = prev.position && prev.position.date !== cur.position?.date ? prev.position : null
  return [
    <Cover key="cover" type="financeiro" period={period} previousLabel={previousLabel} generatedAt={generatedAt} total={total} editor={editor} />,
    <Slide key="result" page={2} total={total} tone="dark" className="deck-thesis">
      <span className="deck-kicker">RESUMO EXECUTIVO</span>
      <EditableText as="h2" editKey="financeiro.summary.title" value={!hasData ? 'Fechamento contábil do período ainda não carregado.' : cur.result >= 0 ? `Resultado positivo de ${shortMoney(cur.result)}, ${previousHasData ? (cur.result >= prev.result ? 'melhor' : 'abaixo') : ''} ${previousHasData ? `que ${comparisonNoun}` : ''}.` : `Prejuízo de ${shortMoney(Math.abs(cur.result))} no período${previousHasData ? `, ${cur.result >= prev.result ? 'melhor' : 'pior'} que ${comparisonNoun}` : ''}.`} editor={editor} />
      <div className="deck-thesis-metrics"><BigNumber label="Receita" value={shortMoney(cur.revenue)} note={<Delta current={cur.revenue} previous={prev.revenue} suffix={`vs. ${comparisonNoun}`} />} /><BigNumber label="Resultado líquido" value={shortMoney(cur.result)} note={<span className={cur.result >= 0 ? 'deck-delta positive' : 'deck-delta negative'}>{pct(cur.netMargin)} de margem líquida</span>} accent /><BigNumber label="Ponto de equilíbrio" value={shortMoney(cur.breakEven)} note={<small>{cur.revenue >= cur.breakEven ? 'receita acima do mínimo operacional' : 'receita abaixo do mínimo operacional'}</small>} /></div>
      <MetricStrip dark items={[
        { label: 'Margem de contribuição', value: pct(cur.contributionMargin), note: `${comparisonNoun}: ${pct(prev.contributionMargin)}` },
        { label: 'Margem líquida', value: pct(cur.netMargin), note: `${comparisonNoun}: ${pct(prev.netMargin)}` },
        { label: 'Custos fixos', value: shortMoney(cur.fixedCosts), note: `${comparisonNoun}: ${shortMoney(prev.fixedCosts)}` },
        { label: 'Custos variáveis', value: shortMoney(cur.variableCosts), note: `${comparisonNoun}: ${shortMoney(prev.variableCosts)}` },
      ]} />
    </Slide>,
    <Slide key="dre" page={3} total={total}>
      <SlideTitle eyebrow="DRE DO PERÍODO" aside="regime de competência">Receita, custos, margens e resultado — comparado ao {comparisonNoun}.</SlideTitle>
      <div className="deck-dre-flow">{[
        ['Receita', cur.revenue, 100, prev.revenue],
        ['Custos variáveis', -Math.abs(cur.variableCosts), cur.revenue ? cur.variableCosts / cur.revenue * 100 : 0, -Math.abs(prev.variableCosts)],
        ['Margem de contribuição', cur.contribution, cur.revenue ? cur.contribution / cur.revenue * 100 : 0, prev.contribution],
        ['Custos fixos', -Math.abs(cur.fixedCosts), cur.revenue ? cur.fixedCosts / cur.revenue * 100 : 0, -Math.abs(prev.fixedCosts)],
        ['Resultado líquido', cur.result, cur.netMargin, prev.result],
      ].map(([label, value, share, previousValue], index) => <div key={label} className={index === 4 ? (value >= 0 ? 'result positive' : 'result negative') : ''}><span>{label}</span><i><em style={{ width: `${Math.min(Math.abs(share), 100)}%` }} /></i><strong>{shortMoney(value)}</strong><small>{previousHasData ? `${comparisonNoun}: ${shortMoney(previousValue)}` : pct(share)}</small></div>)}</div>
    </Slide>,
    <Slide key="evolution" page={4} total={total}>
      <SlideTitle eyebrow="TRAJETÓRIA" aside={`${cur.monthsAboveBreakEven} de ${cur.monthCount || 1} meses acima do equilíbrio`}>Evolução mensal de receita e resultado líquido no período comparativo.</SlideTitle>
      <MetricStrip items={[{ label: 'Receita do período', value: shortMoney(cur.revenue) }, { label: `Receita — ${comparisonNoun}`, value: shortMoney(prev.revenue) }, { label: 'Resultado do período', value: shortMoney(cur.result) }, { label: `Resultado — ${comparisonNoun}`, value: shortMoney(prev.result) }]} />
      <div className="deck-chart-stage"><ResponsiveContainer width="100%" height="100%"><BarChart data={series} margin={{ top: 18, right: 18, left: 8, bottom: 0 }}><CartesianGrid vertical={false} stroke="#e9e1da" strokeDasharray="3 7" /><XAxis dataKey="label" axisLine={false} tickLine={false} /><YAxis axisLine={false} tickLine={false} tickFormatter={v => `${Math.round(v / 1000)}k`} /><Tooltip formatter={v => money(v)} /><Bar dataKey="Receita" fill="#292623" radius={[7, 7, 0, 0]} /><Bar dataKey="Resultado" fill="#f47b20" radius={[7, 7, 0, 0]} /></BarChart></ResponsiveContainer></div><div className="deck-chart-legend"><i className="ink" /> Receita <i className="orange" /> Resultado líquido</div>
    </Slide>,
    <Slide key="costs" page={5} total={total} tone="dark">
      <SlideTitle eyebrow="ESTRUTURA DE CUSTOS" aside="acumulado no período">Composição dos custos e participação sobre a receita.</SlideTitle>
      <div className="deck-cost-layout"><div><span>CUSTOS TOTAIS DO PERÍODO</span><strong>{shortMoney(cur.variableCosts + cur.fixedCosts)}</strong><p>{cur.revenue ? pct((cur.variableCosts + cur.fixedCosts) / cur.revenue * 100) : '0%'} da receita do período{previousHasData ? ` (${comparisonNoun}: ${shortMoney(prev.variableCosts + prev.fixedCosts)})` : ''}.</p></div><div className="deck-cost-bars">{cur.costs.slice(0, 6).map((cost, index) => <div key={cost.name}><span>{cost.name}</span><i><em style={{ width: `${cost.value / maxCost * 100}%`, background: COLORS[index % COLORS.length] }} /></i><strong>{shortMoney(cost.value)}</strong></div>)}</div></div>
    </Slide>,
    <Slide key="efficiency" page={6} total={total}>
      <SlideTitle eyebrow="EFICIÊNCIA OPERACIONAL" aside="índices reais do ERP, ponderados no período">Prazos de recebimento, pagamento e ciclo de caixa.</SlideTitle>
      <MetricStrip items={[
        { label: 'Prazo médio de recebimento', value: `${cur.pmrv.toFixed(0)} dias`, note: `${comparisonNoun}: ${prev.pmrv.toFixed(0)} dias` },
        { label: 'Prazo médio de estoque', value: `${cur.pmre.toFixed(0)} dias`, note: `${comparisonNoun}: ${prev.pmre.toFixed(0)} dias` },
        { label: 'Prazo médio de pagamento', value: `${cur.pmpf.toFixed(0)} dias`, note: `${comparisonNoun}: ${prev.pmpf.toFixed(0)} dias` },
        { label: 'Ciclo de caixa', value: `${cur.cicloCaixa.toFixed(0)} dias`, note: `${comparisonNoun}: ${prev.cicloCaixa.toFixed(0)} dias` },
      ]} />
      <div className="deck-cost-layout"><div><span>LEITURA DO CICLO</span><strong>{cur.cicloCaixa < 0 ? 'Financiado por fornecedores' : 'Financia a própria operação'}</strong><p>{cur.cicloCaixa < 0 ? `Recebe de clientes e gira estoque ${Math.abs(cur.cicloCaixa).toFixed(0)} dias mais rápido do que paga fornecedores — alivia caixa no curto prazo.` : `A operação precisa financiar ${cur.cicloCaixa.toFixed(0)} dias de atividade com capital próprio ou de terceiros antes de recuperar em caixa.`}</p></div><div className="deck-cost-bars">{[{ name: 'Recebimento (PMRV)', value: cur.pmrv }, { name: 'Estoque (PMRE)', value: cur.pmre }, { name: 'Pagamento (PMPF)', value: cur.pmpf }].map((row, index) => <div key={row.name}><span>{row.name}</span><i><em style={{ width: `${Math.min(row.value / Math.max(cur.pmrv, cur.pmre, cur.pmpf, 1) * 100, 100)}%`, background: COLORS[index % COLORS.length] }} /></i><strong>{row.value.toFixed(0)}d</strong></div>)}</div></div>
    </Slide>,
    <Slide key="liquidity" page={7} total={total}>
      <SlideTitle eyebrow="SAÚDE FINANCEIRA" aside={pos ? `posição em ${new Date(`${pos.date}T12:00:00`).toLocaleDateString('pt-BR')}` : 'posição não carregada'}>Capacidade de pagar obrigações e financiar a operação.</SlideTitle>
      <div className="deck-liquidity"><div className="deck-liquidity-main"><span>LIQUIDEZ CORRENTE</span><strong>{pos?.currentRatio ? `${pos.currentRatio.toFixed(2).replace('.', ',')}x` : '—'}</strong><p>{!pos ? 'Nenhuma posição financeira carregada ainda.' : pos.currentRatio >= 1 ? 'O ativo circulante cobre as obrigações operacionais.' : 'As obrigações operacionais superam os recursos circulantes.'} {prevPos ? `${comparisonNoun === 'ano anterior' ? 'No' : 'No'} ${comparisonNoun}: ${prevPos.currentRatio.toFixed(2).replace('.', ',')}x.` : 'Comparação com o período anterior ainda não disponível — depende de um novo fechamento.'}</p></div><div><BigNumber label="Capital de giro" value={shortMoney(pos?.workingCapital)} note={<small>ativo circulante − passivo operacional</small>} /><BigNumber label="Disponibilidades" value={shortMoney(pos?.cash)} note={<small>caixa e bancos</small>} /><BigNumber label="Endividamento" value={pct(pos?.debtRatio)} note={<small>contas a pagar ajustadas ÷ ativo</small>} /></div></div>
    </Slide>,
    <Slide key="maturity" page={8} total={total} tone="dark">
      <SlideTitle eyebrow="PRESSÃO DE CAIXA" aside="posição por vencimento">Onde o caixa aperta primeiro — contas a receber vs. a pagar, faixa a faixa.</SlideTitle>
      <MetricStrip dark items={[{ label: 'Total a receber', value: shortMoney(pos?.totalReceivable) }, { label: 'Total a pagar ajustado', value: shortMoney(pos?.totalPayable) }, { label: 'Saldo financeiro', value: shortMoney(pos ? pos.totalReceivable - pos.totalPayable : 0), note: pos && pos.totalReceivable >= pos.totalPayable ? 'sobra de recebíveis' : 'falta de recebíveis' }, { label: 'Pressão vencida', value: shortMoney(pos ? pos.overdueReceivable - pos.overduePayable : 0), note: pos && pos.overdueReceivable >= pos.overduePayable ? 'saldo vencido favorável' : 'déficit vencido' }]} />
      <div className="deck-chart-stage"><ResponsiveContainer width="100%" height="100%"><BarChart data={pos?.maturity || []} margin={{ top: 18, right: 18, left: 8, bottom: 0 }}><CartesianGrid vertical={false} stroke="rgba(255,255,255,.12)" strokeDasharray="3 7" /><XAxis dataKey="label" axisLine={false} tickLine={false} stroke="#aaa199" /><YAxis axisLine={false} tickLine={false} tickFormatter={v => `${Math.round(v / 1000)}k`} stroke="#aaa199" /><Tooltip formatter={v => money(v)} /><Bar dataKey="A receber" fill="#f47b20" radius={[7, 7, 0, 0]} /><Bar dataKey="A pagar" fill="#e4ddd6" radius={[7, 7, 0, 0]} /></BarChart></ResponsiveContainer></div><div className="deck-chart-legend"><i className="orange" /> A receber <i style={{ background: '#e4ddd6' }} /> A pagar</div>
    </Slide>,
    <Slide key="close" page={9} total={total} tone="dark" className="deck-close">
      <span>RECOMENDAÇÕES FINANCEIRAS</span><EditableText as="h2" editKey="financeiro.close.title" value={pos && pos.currentRatio < 1 ? `Cobrir o déficit de capital de giro de ${shortMoney(Math.abs(pos.workingCapital))}.` : pos ? `Preservar a liquidez de ${pos.currentRatio.toFixed(2).replace('.', ',')}x e a margem operacional.` : 'Carregar o próximo fechamento contábil para acompanhar a posição.'} editor={editor} /><EditableText as="p" editKey="financeiro.close.body" value={cur.result < 0 ? `1. Gerar ${shortMoney(Math.abs(cur.breakEvenGap))} adicionais para alcançar o equilíbrio. 2. Reduzir os grupos de custo com maior peso. 3. Reprogramar pagamentos onde os recebíveis não cobrem os vencimentos.` : `1. Converter resultado em caixa. 2. Monitorar a faixa de vencimento com maior descoberto. 3. Manter custos fixos abaixo de ${shortMoney(cur.fixedCosts)} por período.`} editor={editor} /><div><i /> direcionamento para o próximo ciclo</div>
    </Slide>,
  ]
}

// eslint-disable-next-line no-unused-vars
function ExecutiveFinancialSlides({ data, period, previousLabel, generatedAt, comparisonNoun, editor }) {
  const total = 14
  const { current: cur, previous: prev, series, hasData, previousHasData } = data
  const pos = cur.position
  const maxCost = Math.max(...cur.costs.map(item => item.value), 1)
  const gap = cur.revenue - cur.breakEven
  const title = (page, key, eyebrow, text, aside) => <SlideTitle eyebrow={eyebrow} aside={aside} editKey={`financeiro.${key}.title`} editor={editor}>{text}</SlideTitle>
  return [
    <Cover key="cover" type="financeiro" period={period} previousLabel={previousLabel} generatedAt={generatedAt} total={total} editor={editor} />,
    <Slide key="summary" page={2} total={total} tone="dark" className="deck-thesis"><span className="deck-kicker">RESUMO EXECUTIVO</span><EditableText as="h2" editKey="financeiro.summary.title" value={!hasData ? 'Fechamento contábil ainda não carregado.' : `A empresa registrou ${cur.result >= 0 ? 'lucro' : 'prejuízo'} de ${shortMoney(Math.abs(cur.result))} e ${cur.cashDifference >= 0 ? 'gerou' : 'consumiu'} ${shortMoney(Math.abs(cur.cashDifference))} de caixa.`} editor={editor} /><div className="deck-thesis-metrics"><BigNumber label="Receita" value={shortMoney(cur.revenue)} note={previousHasData ? <Delta current={cur.revenue} previous={prev.revenue} suffix={`vs. ${comparisonNoun}`} /> : <small>vendas reconhecidas</small>} /><BigNumber label="Resultado líquido" value={shortMoney(cur.result)} note={<span className={cur.result >= 0 ? 'deck-delta positive' : 'deck-delta negative'}>{pct(cur.netMargin)} da receita</span>} accent /><BigNumber label="Geração de caixa" value={shortMoney(cur.cashDifference)} note={<small>entradas menos saídas</small>} /></div><MetricStrip dark items={[{ label: 'Margem de contribuição', value: pct(cur.contributionMargin), note: 'sobra após custos variáveis' }, { label: 'Ponto de equilíbrio', value: shortMoney(cur.breakEven), note: gap >= 0 ? 'receita acima do mínimo' : 'receita abaixo do mínimo' }, { label: 'Liquidez corrente', value: pos ? `${pos.currentRatio.toFixed(2).replace('.', ',')}x` : '—', note: 'cobertura do curto prazo' }, { label: 'Ciclo de caixa', value: `${cur.cicloCaixa.toFixed(0)} dias`, note: 'tempo financiado' }]} /></Slide>,
    <Slide key="reading" page={3} total={total}>{title(3, 'reading', 'COMO LER ESTE FECHAMENTO', 'Resultado não é a mesma coisa que caixa.', 'conceitos diferentes, decisões diferentes')}<div className="deck-fin-steps">{[['1','Receita','Tudo o que foi vendido e reconhecido no período.'],['2','Margem','O que sobra das vendas após os custos diretamente ligados a elas.'],['3','Resultado','O lucro ou prejuízo depois da estrutura e demais efeitos.'],['4','Caixa','O dinheiro que efetivamente entrou menos o que saiu.']].map(([n,t,b]) => <div key={t}><b>{n}</b><strong>{t}</strong><p>{b}</p></div>)}</div><div className="deck-fin-note"><b>Por que separar?</b> Uma empresa pode apresentar lucro e ainda consumir caixa quando vende a prazo, compra estoque ou antecipa pagamentos.</div></Slide>,
    <Slide key="dre" page={4} total={total}>{title(4, 'dre', 'DRE EM LINGUAGEM DIRETA', 'Como a receita se transforma em resultado.', 'regime de competência')}<div className="deck-dre-flow">{[['Receita',cur.revenue,100],['Custos variáveis',-Math.abs(cur.variableCosts),cur.variableCostPct],['Margem de contribuição',cur.contribution,cur.contributionMargin],['Custos fixos',-Math.abs(cur.fixedCosts),cur.fixedCostPct],['Resultado operacional',cur.operatingResult,cur.revenue ? cur.operatingResult / cur.revenue * 100 : 0],['Resultado líquido',cur.result,cur.netMargin]].map(([label,value,share],i) => <div key={label} className={i === 5 ? (value >= 0 ? 'result positive' : 'result negative') : ''}><span>{label}</span><i><em style={{ width: `${Math.min(Math.abs(share),100)}%` }} /></i><strong>{shortMoney(value)}</strong><small>{pct(share)}</small></div>)}</div></Slide>,
    <Slide key="breakeven" page={5} total={total} tone="dark">{title(5, 'breakeven', 'PONTO DE EQUILÍBRIO', `A operação ${gap >= 0 ? 'superou' : 'não alcançou'} o nível mínimo de receita.`, 'receita mínima para não ter prejuízo')}<div className="deck-fin-breakeven"><div><span>RECEITA REALIZADA</span><strong>{shortMoney(cur.revenue)}</strong><i><em style={{ width: `${Math.min(cur.breakEven ? cur.revenue / cur.breakEven * 100 : 0,100)}%` }} /></i></div><div><span>PONTO DE EQUILÍBRIO</span><strong>{shortMoney(cur.breakEven)}</strong><i><em className="muted" style={{ width:'100%' }} /></i></div><aside className={gap >= 0 ? 'positive' : 'negative'}><span>{gap >= 0 ? 'MARGEM DE SEGURANÇA' : 'RECEITA QUE FALTOU'}</span><b>{shortMoney(Math.abs(gap))}</b><p>{gap >= 0 ? 'Valor vendido acima do mínimo necessário para cobrir a estrutura.' : 'Receita adicional estimada para chegar ao zero a zero.'}</p></aside></div></Slide>,
    <Slide key="margins" page={6} total={total}>{title(6, 'margins', 'MARGENS', 'Quanto cada R$ 100 de receita deixa para a empresa.', 'leitura para cada R$ 100 vendidos')}<div className="deck-fin-hundred">{[['RECEITA','R$ 100','ponto de partida',''],['CUSTOS VARIÁVEIS',`− R$ ${cur.variableCostPct.toFixed(0)}`,'produto, impostos e despesas da venda',''],['SOBRA PARA A ESTRUTURA',`R$ ${cur.contributionMargin.toFixed(0)}`,'margem de contribuição','accent'],['RESULTADO FINAL',`R$ ${cur.netMargin.toFixed(1).replace('.',',')}`,'lucro ou prejuízo líquido',cur.netMargin >= 0 ? 'positive' : 'negative']].map(([l,v,n,c]) => <div key={l} className={c}><span>{l}</span><strong>{v}</strong><p>{n}</p></div>)}</div><div className="deck-fin-note"><b>Leitura executiva:</b> quanto maior a margem de contribuição, maior a capacidade de pagar a estrutura fixa e formar lucro.</div></Slide>,
    <Slide key="costs" page={7} total={total} tone="dark">{title(7, 'costs', 'ESTRUTURA DE CUSTOS', 'Quais grupos mais consomem a receita.', 'acumulado no período')}<div className="deck-cost-layout"><div><span>CUSTOS TOTAIS</span><strong>{shortMoney(cur.variableCosts + cur.fixedCosts)}</strong><p>{cur.revenue ? pct((cur.variableCosts + cur.fixedCosts) / cur.revenue * 100) : '0%'} da receita. Custos variáveis acompanham vendas; fixos permanecem mesmo com menor volume.</p></div><div className="deck-cost-bars">{cur.costs.slice(0,6).map((cost,index) => <div key={cost.name}><span>{cost.name}</span><i><em style={{ width:`${cost.value / maxCost * 100}%`, background:COLORS[index % COLORS.length] }} /></i><strong>{shortMoney(cost.value)}</strong></div>)}</div></div></Slide>,
    <Slide key="evolution" page={8} total={total}>{title(8, 'evolution', 'TRAJETÓRIA DO RESULTADO', 'Receita e resultado ao longo dos meses.', `${cur.monthsAboveBreakEven} de ${cur.monthCount || 1} meses acima do equilíbrio`)}<MetricStrip items={[{label:'Receita',value:shortMoney(cur.revenue)},{label:'Resultado operacional',value:shortMoney(cur.operatingResult)},{label:'Efeito não operacional',value:shortMoney(cur.extraOperational)},{label:'Resultado líquido',value:shortMoney(cur.result)}]} /><div className="deck-chart-stage"><ResponsiveContainer width="100%" height="100%"><BarChart data={series} margin={{top:18,right:18,left:8,bottom:0}}><CartesianGrid vertical={false} stroke="#e9e1da" strokeDasharray="3 7" /><XAxis dataKey="label" axisLine={false} tickLine={false}/><YAxis axisLine={false} tickLine={false} tickFormatter={v => `${Math.round(v/1000)}k`}/><Tooltip formatter={v => money(v)}/><Bar dataKey="Receita" fill="#292623" radius={[7,7,0,0]}/><Bar dataKey="Resultado" fill="#f47b20" radius={[7,7,0,0]}/></BarChart></ResponsiveContainer></div><div className="deck-chart-legend"><i className="ink"/> Receita <i className="orange"/> Resultado líquido</div></Slide>,
    <Slide key="cash" page={10} total={total} tone="dark">{title(9, 'cash', 'GERAÇÃO DE CAIXA', 'O resultado virou dinheiro disponível?', 'dinheiro que entrou e saiu')}<MetricStrip dark items={[{label:'Recebimentos',value:shortMoney(cur.cashReceipts),note:'entradas efetivas'},{label:'Pagamentos',value:shortMoney(cur.cashPayments),note:'saídas efetivas'},{label:'Geração líquida',value:shortMoney(cur.cashDifference),note:cur.cashDifference >= 0 ? 'caixa positivo' : 'caixa consumido'},{label:'Disponibilidades',value:shortMoney(pos?.cash),note:'posição de caixa e bancos'}]} /><div className="deck-fin-cash"><div><span>ENTRADAS</span><strong>{shortMoney(cur.cashReceipts)}</strong><i><em style={{width:'100%'}}/></i></div><div><span>SAÍDAS</span><strong>{shortMoney(cur.cashPayments)}</strong><i><em style={{width:`${Math.min(cur.cashReceipts ? cur.cashPayments / cur.cashReceipts * 100 : 0,100)}%`}}/></i></div><aside><b>{shortMoney(cur.cashDifference)}</b><p>{cur.cashDifference >= 0 ? 'A movimentação do período acrescentou recursos ao caixa.' : 'A operação precisou consumir caixa existente ou buscar financiamento.'}</p></aside></div></Slide>,
    <Slide key="working" page={11} total={total}>{title(10, 'working', 'CAPITAL DE GIRO', 'Onde o dinheiro fica aplicado antes de voltar ao caixa.', 'recursos da operação diária')}<div className="deck-fin-working"><div><span>CONTAS A RECEBER</span><strong>{shortMoney(pos?.totalReceivable)}</strong><p>vendas realizadas ainda não recebidas</p></div><div><span>ESTOQUE</span><strong>{shortMoney(pos?.inventory)}</strong><p>capital aplicado em produtos</p></div><div><span>OBRIGAÇÕES OPERACIONAIS</span><strong>{shortMoney(pos?.totalPayable)}</strong><p>compromissos da operação</p></div><aside className={pos?.workingCapital >= 0 ? 'positive' : 'negative'}><span>CAPITAL DE GIRO LÍQUIDO</span><b>{shortMoney(pos?.workingCapital)}</b><p>recursos circulantes menos compromissos de curto prazo</p></aside></div><div className="deck-fin-note"><b>Nota gerencial:</b> {shortMoney(pos?.aporteADevolver)} em aberto com os sócios foi desconsiderado de liquidez, capital de giro, endividamento, passivo operacional e pressão de caixa.</div></Slide>,
    <Slide key="cycle" page={11} total={total}>{title(11, 'cycle', 'CICLO FINANCEIRO', 'Quantos dias a empresa precisa financiar a operação.', 'prazos ponderados do ERP')}<MetricStrip items={[{label:'Recebe em',value:`${cur.pmrv.toFixed(0)} dias`,note:'prazo dos clientes'},{label:'Estoque por',value:`${cur.pmre.toFixed(0)} dias`,note:'tempo até a venda'},{label:'Paga em',value:`${cur.pmpf.toFixed(0)} dias`,note:'prazo dos fornecedores'},{label:'Ciclo de caixa',value:`${cur.cicloCaixa.toFixed(0)} dias`,note:'receber + estoque − pagar'}]} /><div className="deck-fin-cycle"><span>COMPRA</span><i/><span>VENDE</span><i/><span>RECEBE</span><aside><b>{cur.cicloCaixa.toFixed(0)} dias</b><p>{cur.cicloCaixa > 0 ? 'período financiado com caixa próprio ou de terceiros' : 'fornecedores financiam o ciclo operacional'}</p></aside></div></Slide>,
    <Slide key="liquidity" page={12} total={total}>{title(12, 'liquidity', 'LIQUIDEZ E BALANÇO', 'A empresa consegue honrar o curto prazo?', pos ? `posição em ${new Date(`${pos.date}T12:00:00`).toLocaleDateString('pt-BR')}` : 'posição não carregada')}<div className="deck-liquidity"><div className="deck-liquidity-main"><span>LIQUIDEZ CORRENTE</span><strong>{pos ? `${pos.currentRatio.toFixed(2).replace('.',',')}x` : '—'}</strong><p>{pos?.currentRatio >= 1 ? 'Os recursos circulantes cobrem os compromissos operacionais de curto prazo.' : 'Os compromissos de curto prazo superam os recursos circulantes.'}</p></div><div><BigNumber label="Capital de giro" value={shortMoney(pos?.workingCapital)} note={<small>ativo circulante − passivo circulante</small>}/><BigNumber label="Disponibilidades" value={shortMoney(pos?.cash)} note={<small>caixa e bancos</small>}/><BigNumber label="Endividamento operacional" value={pct(pos?.debtRatio)} note={<small>obrigações ajustadas ÷ ativos</small>}/></div></div></Slide>,
    <Slide key="maturity" page={13} total={total} tone="dark">{title(13, 'maturity', 'PRESSÃO DE CAIXA', 'Em quais vencimentos o caixa pode apertar primeiro.', 'contas a receber versus contas a pagar')}<MetricStrip dark items={[{label:'Total a receber',value:shortMoney(pos?.totalReceivable)},{label:'Total a pagar ajustado',value:shortMoney(pos?.totalPayable)},{label:'Cobertura total',value:shortMoney(pos ? pos.totalReceivable-pos.totalPayable : 0),note:'recebíveis menos obrigações'},{label:'Saldo vencido',value:shortMoney(pos ? pos.overdueReceivable-pos.overduePayable : 0),note:'receber vencido menos pagar vencido'}]} /><div className="deck-chart-stage"><ResponsiveContainer width="100%" height="100%"><BarChart data={pos?.maturity || []} margin={{top:18,right:18,left:8,bottom:0}}><CartesianGrid vertical={false} stroke="rgba(255,255,255,.12)" strokeDasharray="3 7"/><XAxis dataKey="label" axisLine={false} tickLine={false} stroke="#aaa199"/><YAxis axisLine={false} tickLine={false} tickFormatter={v=>`${Math.round(v/1000)}k`} stroke="#aaa199"/><Tooltip formatter={v=>money(v)}/><Bar dataKey="A receber" fill="#f47b20" radius={[7,7,0,0]}/><Bar dataKey="A pagar" fill="#e4ddd6" radius={[7,7,0,0]}/></BarChart></ResponsiveContainer></div><div className="deck-chart-legend"><i className="orange"/> A receber <i style={{background:'#e4ddd6'}}/> A pagar</div></Slide>,
    <Slide key="close" page={14} total={total} tone="dark" className="deck-close"><span>RECOMENDAÇÕES FINANCEIRAS</span><EditableText as="h2" editKey="financeiro.close.title" value={cur.result < 0 ? 'Recuperar resultado sem perder o controle do caixa.' : 'Preservar margem e transformar resultado em caixa recorrente.'} editor={editor}/><EditableText as="p" editKey="financeiro.close.body" value={cur.result < 0 ? '1. Reaproximar a receita do ponto de equilíbrio, protegendo margem e mix. 2. Atuar sobre os maiores grupos de custo sem comprometer a operação. 3. Compatibilizar pagamentos com recebimentos. 4. Reduzir o tempo em que o caixa fica preso em clientes e estoque.' : '1. Proteger a margem de contribuição e a disciplina de custos fixos. 2. Converter o resultado contábil em caixa recorrente. 3. Monitorar vencimentos e concentração de recebíveis. 4. Preservar capital de giro para sustentar o crescimento.'} editor={editor}/><div><i/> direcionamento para o próximo ciclo</div></Slide>,
  ]
}

function DreComparison({ current: cur, previous: prev, previousHasData, comparisonNoun }) {
  const rows = [
    { label: 'Receita', value: cur.revenue, previous: prev.revenue, nature: 'gain' },
    { label: 'Custos variáveis', value: -Math.abs(cur.variableCosts), previous: -Math.abs(prev.variableCosts), nature: 'cost' },
    { label: 'Margem de contribuição', value: cur.contribution, previous: prev.contribution, nature: 'gain' },
    { label: 'Custos fixos', value: -Math.abs(cur.fixedCosts), previous: -Math.abs(prev.fixedCosts), nature: 'cost' },
    { label: 'Resultado operacional', value: cur.operatingResult, previous: prev.operatingResult, nature: 'gain' },
    { label: 'Resultado líquido', value: cur.result, previous: prev.result, nature: 'gain', result: true },
  ]
  const scale = Math.max(...rows.flatMap(row => [Math.abs(row.value), Math.abs(row.previous)]), 1)
  return <div className="deck-dre-professional">
    <div className="deck-dre-header"><span>LINHA DA DRE</span><span>FORMAÇÃO DO RESULTADO</span><span>PERÍODO ATUAL</span><span>{comparisonNoun.toUpperCase()}</span></div>
    {rows.map(row => {
      const improved = row.nature === 'cost' ? Math.abs(row.value) <= Math.abs(row.previous) : row.value >= row.previous
      const arrow = row.nature === 'cost' ? (Math.abs(row.value) <= Math.abs(row.previous) ? '▼' : '▲') : (row.value >= row.previous ? '▲' : '▼')
      const width = Math.max(Math.abs(row.value) / scale * 50, row.value ? 1.2 : 0)
      return <div key={row.label} className={`deck-dre-row ${row.result ? 'result' : ''}`}>
        <span>{row.label}</span>
        <i className="deck-dre-axis"><em className={row.value >= 0 ? 'right' : 'left'} style={{ width: `${width}%` }} /></i>
        <strong>{shortMoney(row.value)}</strong>
        <small className={previousHasData ? (improved ? 'positive' : 'negative') : ''}>{previousHasData ? <><b>{arrow}</b> {shortMoney(row.previous)}</> : '—'}</small>
      </div>
    })}
  </div>
}

function CFOFinancialSlides({ data, commercial, period, previousLabel, generatedAt, comparisonNoun, editor }) {
  const total = 17
  const { current: cur, previous: prev, series, hasData, previousHasData } = data
  const pos = cur.position
  const gap = cur.revenue - cur.breakEven
  const prevCostByName = new Map(prev.costs.map(item => [item.name, item.value]))
  const costRows = cur.costs.map(item => ({ ...item, previous: prevCostByName.get(item.name) || 0, change: item.value - (prevCostByName.get(item.name) || 0) }))
  const prevAccountByName = new Map(prev.costAccounts.map(item => [item.name, item.value]))
  const accountRows = cur.costAccounts.map(item => ({ ...item, previous: prevAccountByName.get(item.name) || 0, change: item.value - (prevAccountByName.get(item.name) || 0) }))
  const fixedAccountRows = accountRows.filter(item => item.name.endsWith('· fixo'))
  const increases = [...fixedAccountRows].filter(item => item.change > 0).sort((a, b) => b.change - a.change).slice(0, 4)
  const reductions = [...fixedAccountRows].filter(item => item.change < 0).sort((a, b) => a.change - b.change).slice(0, 4)
  const inventoryVariation = variation(cur.inventoryEnd, prev.inventoryEnd)
  const resultEffects = [
    { label: 'Volume de receita', value: (cur.revenue - prev.revenue) * (prev.contributionMargin / 100) },
    { label: 'Mudança de margem', value: cur.revenue * ((cur.contributionMargin - prev.contributionMargin) / 100) },
    { label: 'Custos fixos', value: -(cur.fixedCosts - prev.fixedCosts) },
    { label: 'Não operacional', value: cur.extraOperational - prev.extraOperational },
  ]
  const explainedResult = resultEffects.reduce((sum,item)=>sum+item.value,0)
  resultEffects.push({ label: 'Demais efeitos', value: (cur.result-prev.result)-explainedResult })
  const bridgeMax = Math.max(Math.abs(prev.result),Math.abs(cur.result),...resultEffects.map(item=>Math.abs(item.value)),1)
  const title = (key, eyebrow, text, aside) => <SlideTitle eyebrow={eyebrow} aside={aside} editKey={`financeiro.${key}.title`} editor={editor}>{text}</SlideTitle>
  const chartLabel = value => Math.abs(number(value)) >= 1000 ? shortMoney(value) : money(value)
  return [
    <Cover key="cover" type="financeiro" period={period} previousLabel={previousLabel} generatedAt={generatedAt} total={total} editor={editor} />,
    <Slide key="summary" page={2} total={total} tone="dark" className="deck-thesis"><span className="deck-kicker">RESUMO EXECUTIVO</span><EditableText as="h2" editKey="financeiro.summary.title" value={!hasData ? 'Fechamento contábil ainda não carregado.' : `O período encerrou com ${cur.result >= 0 ? 'lucro' : 'prejuízo'} de ${shortMoney(Math.abs(cur.result))} e ${cur.cashDifference >= 0 ? 'geração' : 'consumo'} de caixa de ${shortMoney(Math.abs(cur.cashDifference))}.`} editor={editor}/><div className="deck-thesis-metrics"><BigNumber label="Receita" value={shortMoney(cur.revenue)} note={previousHasData ? <Delta current={cur.revenue} previous={prev.revenue} suffix={`vs. ${comparisonNoun}`}/> : <small>vendas reconhecidas</small>}/><BigNumber label="Resultado líquido" value={shortMoney(cur.result)} note={<span className={cur.result >= 0 ? 'deck-delta positive' : 'deck-delta negative'}>{pct(cur.netMargin)} de margem</span>} accent/><BigNumber label="Geração de caixa" value={shortMoney(cur.cashDifference)} note={<small>recebimentos menos pagamentos</small>}/></div><MetricStrip dark items={[{label:'Margem de contribuição',value:pct(cur.contributionMargin),note:`${comparisonNoun}: ${pct(prev.contributionMargin)}`},{label:'Ponto de equilíbrio',value:shortMoney(cur.breakEven),note:gap >= 0 ? 'acima do mínimo' : 'abaixo do mínimo'},{label:'Liquidez corrente',value:pos ? `${pos.currentRatio.toFixed(2).replace('.',',')}x` : '—',note:'cobertura do curto prazo'},{label:'Ciclo de caixa',value:`${cur.cicloCaixa.toFixed(0)} dias`,note:`${comparisonNoun}: ${prev.cicloCaixa.toFixed(0)} dias`}]} /></Slide>,
    <Slide key="dre" page={3} total={total}>{title('dre','DEMONSTRAÇÃO DO RESULTADO','A receita se converteu em resultado com esta estrutura.','regime de competência')}<DreComparison current={cur} previous={prev} previousHasData={previousHasData} comparisonNoun={comparisonNoun}/></Slide>,
    <Slide key="breakeven" page={4} total={total} tone="dark">{title('breakeven','PONTO DE EQUILÍBRIO',`A operação ${gap >= 0 ? 'superou' : 'não alcançou'} o nível mínimo de receita.`,'receita necessária para cobrir a estrutura')}<div className="deck-fin-breakeven"><div><span>RECEITA REALIZADA</span><strong>{shortMoney(cur.revenue)}</strong><i><em style={{width:`${Math.min(cur.breakEven ? cur.revenue/cur.breakEven*100:0,100)}%`}}/></i></div><div><span>PONTO DE EQUILÍBRIO</span><strong>{shortMoney(cur.breakEven)}</strong><i><em className="muted" style={{width:'100%'}}/></i></div><aside className={gap>=0?'positive':'negative'}><span>{gap>=0?'MARGEM DE SEGURANÇA':'RECEITA QUE FALTOU'}</span><b>{shortMoney(Math.abs(gap))}</b><p>{gap>=0?'Receita excedente após cobrir o nível mínimo da estrutura.':'Receita adicional estimada para alcançar o equilíbrio.'}</p></aside></div></Slide>,
    <Slide key="margins" page={5} total={total}>{title('margins','ANÁLISE DE MARGENS','A qualidade do resultado depende da margem preservada em cada etapa.',`comparativo com ${comparisonNoun}`)}<div className="deck-margin-pro"><div className="deck-margin-hero"><span>MARGEM DE CONTRIBUIÇÃO</span><strong>{pct(cur.contributionMargin)}</strong><Delta current={cur.contributionMargin} previous={prev.contributionMargin} suffix={`vs. ${comparisonNoun}`}/><p>{shortMoney(cur.contribution)} disponíveis para absorver custos fixos e formar resultado.</p></div><div className="deck-margin-table">{[['Margem bruta gerencial',cur.grossMargin,prev.grossMargin],['Margem de contribuição',cur.contributionMargin,prev.contributionMargin],['Margem operacional',cur.revenue ? cur.operatingResult/cur.revenue*100 : 0,prev.revenue ? prev.operatingResult/prev.revenue*100 : 0],['Margem líquida',cur.netMargin,prev.netMargin]].map(([label,current,previous])=><div key={label}><span>{label}</span><strong>{pct(current)}</strong><small className={current>=previous?'positive':'negative'}>{current>=previous?'▲':'▼'} {Math.abs(current-previous).toFixed(1).replace('.',',')} p.p.</small></div>)}</div></div></Slide>,
    <Slide key="costs" page={6} total={total} tone="dark">{title('costs','ESTRUTURA DE CUSTOS','Os principais grupos devem ser lidos em valor e variação.',`comparativo com ${comparisonNoun}`)}<MetricStrip dark items={[{label:'Custos variáveis',value:shortMoney(cur.variableCosts),note:`${variation(cur.variableCosts,prev.variableCosts)>=0?'alta':'queda'} de ${pct(Math.abs(variation(cur.variableCosts,prev.variableCosts)))}`},{label:'Custos fixos',value:shortMoney(cur.fixedCosts),note:`${variation(cur.fixedCosts,prev.fixedCosts)>=0?'alta':'queda'} de ${pct(Math.abs(variation(cur.fixedCosts,prev.fixedCosts)))}`},{label:'Custos totais',value:shortMoney(cur.variableCosts+cur.fixedCosts),note:`${comparisonNoun}: ${shortMoney(prev.variableCosts+prev.fixedCosts)}`},{label:'Peso na receita',value:pct(cur.revenue ? (cur.variableCosts+cur.fixedCosts)/cur.revenue*100:0),note:`${comparisonNoun}: ${pct(prev.revenue ? (prev.variableCosts+prev.fixedCosts)/prev.revenue*100:0)}`}]} /><div className="deck-cost-compare">{costRows.slice(0,6).map(item=><div key={item.name}><span>{item.name}</span><strong>{shortMoney(item.value)}</strong><small>{comparisonNoun}: {shortMoney(item.previous)}</small><b className={item.change<=0?'positive':'negative'}>{item.change>=0?'▲':'▼'} {shortMoney(Math.abs(item.change))}</b></div>)}</div></Slide>,
    <Slide key="cost-change" page={7} total={total}>{title('cost_change','VARIAÇÕES DE CUSTOS FIXOS','Quais contas pressionaram e quais aliviaram a estrutura.',`variação absoluta contra ${comparisonNoun}`)}<div className="deck-fixed-disclaimer"><i/> Análise restrita a custos fixos; contas variáveis foram excluídas para neutralizar o efeito do volume vendido.</div><div className="deck-cost-change"><section><header><span>IMPACTO NEGATIVO · AUMENTOS</span><b>{shortMoney(increases.reduce((s,i)=>s+i.change,0))}</b></header>{increases.map(item=><div key={item.name}><span>{item.name.replace(' · fixo','')}</span><i><em style={{width:`${item.change/Math.max(increases[0]?.change||1,1)*100}%`}}/></i><strong>+ {shortMoney(item.change)}</strong></div>)}</section><section><header><span>IMPACTO POSITIVO · REDUÇÕES</span><b>{shortMoney(Math.abs(reductions.reduce((s,i)=>s+i.change,0)))}</b></header>{reductions.map(item=><div key={item.name}><span>{item.name.replace(' · fixo','')}</span><i><em style={{width:`${Math.abs(item.change)/Math.max(Math.abs(reductions[0]?.change||1),1)*100}%`}}/></i><strong>− {shortMoney(Math.abs(item.change))}</strong></div>)}</section></div></Slide>,
    <Slide key="evolution" page={8} total={total}>{title('evolution','TRAJETÓRIA DO RESULTADO','Receita e resultado evidenciam a volatilidade mensal.',`${cur.monthsAboveBreakEven} de ${cur.monthCount||1} meses acima do equilíbrio`)}<MetricStrip items={[{label:'Receita',value:shortMoney(cur.revenue)},{label:'Resultado operacional',value:shortMoney(cur.operatingResult)},{label:'Efeito não operacional',value:shortMoney(cur.extraOperational)},{label:'Resultado líquido',value:shortMoney(cur.result)}]} /><div className="deck-chart-stage"><ResponsiveContainer width="100%" height="100%"><BarChart data={series} margin={{top:35,right:18,left:8,bottom:0}}><CartesianGrid vertical={false} stroke="#e9e1da" strokeDasharray="3 7"/><XAxis dataKey="label" axisLine={false} tickLine={false}/><YAxis axisLine={false} tickLine={false} tickFormatter={v=>`${Math.round(v/1000)}k`}/><Tooltip formatter={v=>money(v)}/><Bar dataKey="Receita" fill="#292623" radius={[7,7,0,0]}><LabelList dataKey="Receita" position="top" formatter={chartLabel} className="deck-bar-label"/></Bar><Bar dataKey="Resultado" fill="#f47b20" radius={[7,7,0,0]}><LabelList dataKey="Resultado" position="top" formatter={chartLabel} className="deck-bar-label orange"/></Bar></BarChart></ResponsiveContainer></div><div className="deck-chart-legend"><i className="ink"/> Receita <i className="orange"/> Resultado líquido</div></Slide>,
    <Slide key="bridge" page={9} total={total}>{title('bridge','PONTE DE VARIAÇÃO DO RESULTADO','Os fatores abaixo explicam a passagem do resultado anterior ao atual.',`comparativo com ${comparisonNoun}`)}<div className="deck-result-bridge"><div className="total"><span>Resultado anterior</span><i><em style={{height:`${Math.max(8,Math.abs(prev.result)/bridgeMax*100)}%`}}/></i><strong>{shortMoney(prev.result)}</strong></div>{resultEffects.map(item=><div key={item.label} className={item.value>=0?'positive':'negative'}><span>{item.label}</span><i><em style={{height:`${Math.max(8,Math.abs(item.value)/bridgeMax*100)}%`}}/></i><strong>{item.value>=0?'+ ':'− '}{shortMoney(Math.abs(item.value))}</strong></div>)}<div className="total current"><span>Resultado atual</span><i><em style={{height:`${Math.max(8,Math.abs(cur.result)/bridgeMax*100)}%`}}/></i><strong>{shortMoney(cur.result)}</strong></div></div><div className="deck-fin-note"><b>Leitura gerencial:</b> volume usa a margem anterior; margem captura a mudança da eficiência; custos fixos e efeitos não operacionais completam a reconciliação.</div></Slide>,
    <Slide key="cash" page={10} total={total} tone="dark">{title('cash','GERAÇÃO DE CAIXA','Entradas e saídas mostram a conversão financeira do período.','regime de caixa')}<MetricStrip dark items={[{label:'Recebimentos',value:shortMoney(cur.cashReceipts),note:`${comparisonNoun}: ${shortMoney(prev.cashReceipts)}`},{label:'Pagamentos',value:shortMoney(cur.cashPayments),note:`${comparisonNoun}: ${shortMoney(prev.cashPayments)}`},{label:'Geração líquida',value:shortMoney(cur.cashDifference),note:cur.cashDifference>=0?'caixa positivo':'caixa consumido'},{label:'Disponibilidades',value:shortMoney(pos?.cash),note:'caixa e bancos'}]} /><div className="deck-fin-cash"><div><span>ENTRADAS</span><strong>{shortMoney(cur.cashReceipts)}</strong><i><em style={{width:'100%'}}/></i></div><div><span>SAÍDAS</span><strong>{shortMoney(cur.cashPayments)}</strong><i><em style={{width:`${Math.min(cur.cashReceipts?cur.cashPayments/cur.cashReceipts*100:0,100)}%`}}/></i></div><aside><b>{shortMoney(cur.cashDifference)}</b><p>{cur.cashDifference>=0?'O período acrescentou recursos ao caixa.':'O período consumiu recursos disponíveis ou exigiu financiamento.'}</p></aside></div></Slide>,
    <Slide key="working" page={11} total={total}>{title('working','CAPITAL DE GIRO','A posição circulante mostra a capacidade de sustentar a operação.','posição operacional ajustada')}<div className="deck-working-pro"><div className="deck-working-balance"><span>ATIVO CIRCULANTE</span><strong>{shortMoney(pos?.currentAssets)}</strong><div><i style={{width:`${pos?.currentAssets ? pos.cash/pos.currentAssets*100:0}%`}}/><i style={{width:`${pos?.currentAssets ? pos.totalReceivable/pos.currentAssets*100:0}%`}}/><i style={{width:`${pos?.currentAssets ? pos.inventory/pos.currentAssets*100:0}%`}}/></div><small>Disponibilidades • Recebíveis • Estoque</small></div><div className="deck-working-balance"><span>PASSIVO OPERACIONAL</span><strong>{shortMoney(pos?.currentLiabilities)}</strong><div className="liability"><i style={{width:'100%'}}/></div><small>Saldo total do Resumo de Contas a Pagar</small></div><aside className={pos?.workingCapital>=0?'positive':'negative'}><span>CAPITAL DE GIRO LÍQUIDO</span><b>{shortMoney(pos?.workingCapital)}</b><p>Liquidez corrente de {pos ? pos.currentRatio.toFixed(2).replace('.',',') : '—'}x após os ajustes gerenciais.</p></aside></div><div className="deck-fin-note"><b>Nota gerencial:</b> {shortMoney(pos?.aporteADevolver)} em aberto com os sócios foi desconsiderado de liquidez, capital de giro, endividamento, passivo operacional e pressão de caixa.</div></Slide>,
    <Slide key="inventory" page={12} total={total}>{title('inventory','ESTOQUE','O capital aplicado em estoque deve acompanhar venda e giro.',`comparativo com ${comparisonNoun}`)}<div className="deck-inventory"><div className="deck-inventory-hero"><span>ESTOQUE FINAL</span><strong>{shortMoney(cur.inventoryEnd || pos?.inventory)}</strong><b className={inventoryVariation<=0?'positive':'negative'}>{inventoryVariation>=0?'▲':'▼'} {pct(Math.abs(inventoryVariation))} vs. {comparisonNoun}</b><p>{inventoryVariation>0?'O estoque cresceu e passou a exigir mais capital de giro.':'O estoque foi reduzido, liberando capital para a operação.'}</p></div><div className="deck-inventory-metrics"><BigNumber label="Estoque médio" value={shortMoney(cur.inventoryAverage)} note={<small>média do período</small>}/><BigNumber label="Giro no período" value={`${cur.inventoryTurnover.toFixed(2).replace('.',',')}x`} note={<small>custo variável ÷ estoque médio</small>}/><BigNumber label="Prazo médio" value={`${cur.pmre.toFixed(0)} dias`} note={<small>{comparisonNoun}: {prev.pmre.toFixed(0)} dias</small>}/><BigNumber label="Compras" value={shortMoney(cur.purchases)} note={<small>{comparisonNoun}: {shortMoney(prev.purchases)}</small>}/></div></div></Slide>,
    <Slide key="cycle" page={13} total={total}>{title('cycle','CICLO FINANCEIRO','O ciclo determina por quanto tempo a operação consome capital.','prazos ponderados do ERP')}<MetricStrip items={[{label:'Recebe em',value:`${cur.pmrv.toFixed(0)} dias`,note:`${comparisonNoun}: ${prev.pmrv.toFixed(0)}`},{label:'Estoque por',value:`${cur.pmre.toFixed(0)} dias`,note:`${comparisonNoun}: ${prev.pmre.toFixed(0)}`},{label:'Paga em',value:`${cur.pmpf.toFixed(0)} dias`,note:`${comparisonNoun}: ${prev.pmpf.toFixed(0)}`},{label:'Ciclo de caixa',value:`${cur.cicloCaixa.toFixed(0)} dias`,note:`${comparisonNoun}: ${prev.cicloCaixa.toFixed(0)}`}]} /><div className="deck-fin-cycle"><span>COMPRA</span><i/><span>VENDE</span><i/><span>RECEBE</span><aside><b>{cur.cicloCaixa.toFixed(0)} dias</b><p>{cur.cicloCaixa>0?'período financiado com caixa próprio ou de terceiros':'fornecedores financiam o ciclo operacional'}</p></aside></div></Slide>,
    <Slide key="liquidity" page={14} total={total}>{title('liquidity','LIQUIDEZ E BALANÇO','A cobertura das obrigações operacionais permanece sob controle?',pos?`posição em ${new Date(`${pos.date}T12:00:00`).toLocaleDateString('pt-BR')}`:'posição não carregada')}<div className="deck-liquidity"><div className="deck-liquidity-main"><span>LIQUIDEZ CORRENTE</span><strong>{pos?`${pos.currentRatio.toFixed(2).replace('.',',')}x`:'—'}</strong><p>{pos?.currentRatio>=1?'Os recursos circulantes cobrem as obrigações operacionais.':'As obrigações operacionais superam os recursos circulantes.'}</p></div><div><BigNumber label="Capital de giro" value={shortMoney(pos?.workingCapital)} note={<small>ativo circulante − passivo operacional</small>}/><BigNumber label="Disponibilidades" value={shortMoney(pos?.cash)} note={<small>caixa e bancos</small>}/><BigNumber label="Endividamento operacional" value={pct(pos?.debtRatio)} note={<small>obrigações ajustadas ÷ ativos</small>}/></div></div></Slide>,
    <Slide key="maturity" page={15} total={total} tone="dark">{title('maturity','PRESSÃO DE CAIXA','A curva acumulada revela quando os vencimentos passam a consumir liquidez.','faixas mensais disponíveis no ULTRA')}<MetricStrip dark items={[{label:'Caixa inicial',value:shortMoney(pos?.cash),note:'disponibilidades'},{label:'Saldo em 60 dias',value:shortMoney(pos?.cashAt60),note:'caixa após receber e pagar'},{label:'Primeiro aperto',value:pos?.firstNegative||'Não projetado',note:'primeira faixa com saldo negativo'},{label:'Necessidade máxima',value:shortMoney(Math.max(0,-number(pos?.minimumCash))),note:'pior saldo acumulado'}]} /><div className="deck-chart-stage deck-cash-pressure"><ResponsiveContainer width="100%" height="100%"><ComposedChart data={pos?.maturity||[]} margin={{top:35,right:18,left:8,bottom:0}}><CartesianGrid vertical={false} stroke="rgba(255,255,255,.12)" strokeDasharray="3 7"/><XAxis dataKey="label" axisLine={false} tickLine={false} stroke="#aaa199"/><YAxis axisLine={false} tickLine={false} tickFormatter={v=>`${Math.round(v/1000)}k`} stroke="#aaa199"/><Tooltip formatter={v=>money(v)}/><Bar dataKey="A receber" fill="#f47b20" radius={[7,7,0,0]}><LabelList dataKey="A receber" position="top" formatter={chartLabel} className="deck-bar-label light"/></Bar><Bar dataKey="A pagar" fill="#e4ddd6" radius={[7,7,0,0]}><LabelList dataKey="A pagar" position="top" formatter={chartLabel} className="deck-bar-label light"/></Bar><Line type="monotone" dataKey="Saldo acumulado" stroke="#68c998" strokeWidth={3} dot={{r:4,fill:'#68c998',stroke:'#1e1b19',strokeWidth:2}}/></ComposedChart></ResponsiveContainer></div><div className="deck-chart-legend"><i className="orange"/> A receber <i style={{background:'#e4ddd6'}}/> A pagar <i className="cash-line"/> Saldo acumulado</div><div className="deck-maturity-method">Faixas calculadas pela competência mensal disponível no relatório do ULTRA. * Valor anual consolidado, sem abertura mensal.</div></Slide>,
    <Slide key="close" page={16} total={total} tone="dark" className="deck-close"><span>RECOMENDAÇÕES FINANCEIRAS</span><EditableText as="h2" editKey="financeiro.close.title" value={cur.result<0?'Recuperar resultado sem perder o controle do caixa.':'Preservar margem e transformar resultado em caixa recorrente.'} editor={editor}/><EditableText as="p" editKey="financeiro.close.body" value={cur.result<0?'1. Reaproximar a receita do ponto de equilíbrio, protegendo margem e mix. 2. Atuar sobre os custos que mais cresceram. 3. Compatibilizar pagamentos com recebimentos. 4. Reduzir capital imobilizado em estoque e clientes.':'1. Proteger margem e disciplina de custos fixos. 2. Converter resultado em caixa recorrente. 3. Monitorar vencimentos e concentração de recebíveis. 4. Preservar giro de estoque e capital de giro.'} editor={editor}/><div><i/> direcionamento para o próximo ciclo</div></Slide>,
    <IntegratedExecutiveSlide key="integrated" page={17} total={total} commercial={commercial.current} financial={cur} period={period} editor={editor}/>,
  ]
}

function aggregateCommercialPeriod(bounds, range, ctx) {
  const startIso = iso(range.start)
  const endIso = iso(range.end)
  const periodOrders = ctx.orders.filter(row => row.sale_date && row.sale_date >= startIso && row.sale_date <= endIso && hasNetOrderValue(row))
  const periodDocs = ctx.docs.filter(row => row.issue_date && row.issue_date >= startIso && row.issue_date <= endIso)
  const periodGoals = ctx.goals.filter(row => row.ano === bounds.year && row.mes >= bounds.startMonth && row.mes <= bounds.endMonth)
  const ordersValue = periodOrders.reduce((sum, row) => sum + netOrderValue(row), 0)
  const billing = periodDocs.reduce((sum, row) => sum + fiscalDocumentValue(row), 0)
  const goal = periodGoals.reduce((sum, row) => sum + number(row.meta_fat), 0)
  const returns = Math.abs(periodDocs.filter(row => fiscalDocumentValue(row) < 0).reduce((sum, row) => sum + fiscalDocumentValue(row), 0))
  const billedClients = new Set(periodDocs.filter(row => fiscalDocumentValue(row) > 0).map(row => row.partner_id).filter(Boolean)).size
  const totalDays = Math.max(1, Math.floor((range.nominalEnd - range.start) / 86400000) + 1)
  const elapsedDays = Math.max(1, Math.floor((range.end - range.start) / 86400000) + 1)
  const remainingDays = Math.max(0, totalDays - elapsedDays)
  const projectionFactor = remainingDays ? totalDays / elapsedDays : 1

  const sellerMap = new Map()
  periodOrders.forEach(row => {
    const key = commercialSellerKey(row)
    const profile = ctx.profileById.get(row.seller_id) || ctx.profileByUltra.get(number(row.ultra_salesman_id))
    const entry = sellerMap.get(key) || { key, name: profile?.name || row.ultra_salesman_name || 'Sem vendedor', orders: 0, billing: 0, goal: 0 }
    entry.orders += netOrderValue(row)
    sellerMap.set(key, entry)
  })
  periodDocs.forEach(row => {
    const key = commercialSellerKey(row)
    const profile = ctx.profileById.get(row.seller_id) || ctx.profileByUltra.get(number(row.ultra_salesman_id))
    const entry = sellerMap.get(key) || { key, name: profile?.name || row.salesman_name || 'Sem vendedor', orders: 0, billing: 0, goal: 0 }
    entry.billing += fiscalDocumentValue(row)
    sellerMap.set(key, entry)
  })
  periodGoals.forEach(goalRow => {
    const key = commercialSellerKey(goalRow)
    const profile = ctx.profileById.get(goalRow.seller_id) || ctx.profileByUltra.get(number(goalRow.ultra_salesman_id))
    const entry = sellerMap.get(key) || { key, name: profile?.name || goalRow.erp_salesmen?.name || 'Vendedor', orders: 0, billing: 0, goal: 0 }
    entry.goal += number(goalRow.meta_fat)
    sellerMap.set(key, entry)
  })

  const productMap = new Map()
  periodDocs.forEach(doc => (doc.fiscal_document_items || []).forEach(item => {
    const name = item.product_name || 'Produto não identificado'
    const sign = Math.sign(fiscalDocumentValue(doc))
    productMap.set(name, (productMap.get(name) || 0) + Math.abs(number(item.product_total)) * sign)
  }))

  const regionMap = new Map()
  const clientMap = new Map()
  const segmentMap = new Map()
  periodDocs.forEach(doc => {
    const farm = ctx.farmByPartner.get(number(doc.partner_id))
    const stateName = farm?.state || 'Sem UF'
    const clientName = doc.partner_name || 'Cliente não identificado'
    const segmentName = farm?.segment || 'Sem segmento'
    const value = fiscalDocumentValue(doc)
    regionMap.set(stateName, (regionMap.get(stateName) || 0) + fiscalDocumentValue(doc))
    clientMap.set(clientName, (clientMap.get(clientName) || 0) + value)
    const segment = segmentMap.get(segmentName) || { name: segmentName, value: 0, clients: new Set() }
    segment.value += value
    if (doc.partner_id) segment.clients.add(doc.partner_id)
    segmentMap.set(segmentName, segment)
  })

  const clients = [...clientMap.entries()].map(([name, value]) => ({ name, value })).filter(row => row.value > 0).sort((a, b) => b.value - a.value)
  const clientTotal = clients.reduce((sum, row) => sum + row.value, 0)
  clients.forEach(row => { row.share = clientTotal ? row.value / clientTotal * 100 : 0 })
  const openOrders = ctx.portfolio.map(row => ({
    id: row.id,
    number: row.ultra_order_number || '—',
    customer: row.customer_name || 'Cliente não identificado',
    seller: row.ultra_salesman_name || 'Sem vendedor',
    sellerKey: commercialSellerKey(row),
    value: number(row.open_value),
    age: Math.max(0, Math.floor((Date.now() - new Date(`${row.sale_date}T12:00:00`).getTime()) / 86400000)),
  })).sort((a, b) => b.value - a.value)
  const openPortfolio = openOrders.reduce((sum, row) => sum + row.value, 0)
  const openBySeller = new Map()
  openOrders.forEach(order => {
    openBySeller.set(order.sellerKey, (openBySeller.get(order.sellerKey) || 0) + order.value)
  })
  sellerMap.forEach(seller => { seller.openPortfolio = openBySeller.get(seller.key) || 0 })
  sellerMap.forEach(seller => { seller.projectedOrders = seller.orders * projectionFactor })
  const clientIds = [...new Set(periodDocs.filter(row => fiscalDocumentValue(row) > 0).map(row => row.partner_id).filter(Boolean))]
  const firstBillingByClient = new Map()
  ctx.docs.filter(row => row.partner_id && fiscalDocumentValue(row) > 0).forEach(row => {
    if (!firstBillingByClient.has(row.partner_id) || row.issue_date < firstBillingByClient.get(row.partner_id)) firstBillingByClient.set(row.partner_id, row.issue_date)
  })
  const newClientIds = clientIds.filter(id => firstBillingByClient.get(id) >= startIso && firstBillingByClient.get(id) <= endIso)

  return {
    ordersValue, billing, goal, returns, billedClients, clientIds, newClientIds, newClientCount: newClientIds.length,
    projectedOrders: ordersValue * projectionFactor,
    dailyPace: ordersValue / elapsedDays,
    requiredDailyPace: remainingDays ? Math.max(goal - ordersValue, 0) / remainingDays : 0,
    remainingDays,
    orderCount: periodOrders.length,
    averageTicket: periodOrders.length ? ordersValue / periodOrders.length : 0,
    attainment: goal ? ordersValue / goal * 100 : 0,
    openPortfolio,
    openOrderCount: openOrders.length,
    openAverageAge: openPortfolio ? openOrders.reduce((sum, row) => sum + row.age * row.value, 0) / openPortfolio : 0,
    openOver30: openOrders.filter(row => row.age > 30).reduce((sum, row) => sum + row.value, 0),
    openOrders,
    activeClients: ctx.activeClients,
    sellers: [...sellerMap.values()].sort((a, b) => b.orders - a.orders),
    products: [...productMap.entries()].map(([name, value]) => ({ name, value })).filter(row => row.value > 0).sort((a, b) => b.value - a.value),
    regions: [...regionMap.entries()].map(([name, value]) => ({ name, value })).filter(row => row.value > 0).sort((a, b) => b.value - a.value),
    clients,
    topClientShare: clients[0]?.share || 0,
    top3ClientShare: clients.slice(0, 3).reduce((sum, row) => sum + row.share, 0),
    top5ClientShare: clients.slice(0, 5).reduce((sum, row) => sum + row.share, 0),
    segments: [...segmentMap.values()].map(row => ({ name: row.name, value: row.value, clients: row.clients.size })).filter(row => row.value > 0).sort((a, b) => b.value - a.value),
  }
}

function buildCommercialTrajectory(type, currentBounds, currentRange, previousBounds, orders) {
  if (type === 'mensal') {
    const daysInMonth = currentRange.nominalEnd.getDate()
    const prevDaysInMonth = new Date(previousBounds.year, previousBounds.startMonth, 0).getDate()
    let curAcc = 0
    let prevAcc = 0
    const series = []
    for (let day = 1; day <= daysInMonth; day++) {
      const curDate = `${currentBounds.year}-${String(currentBounds.startMonth).padStart(2, '0')}-${String(day).padStart(2, '0')}`
      curAcc += orders.filter(row => row.sale_date === curDate && hasNetOrderValue(row)).reduce((sum, row) => sum + netOrderValue(row), 0)
      let prevValue = null
      if (day <= prevDaysInMonth) {
        const prevDate = `${previousBounds.year}-${String(previousBounds.startMonth).padStart(2, '0')}-${String(day).padStart(2, '0')}`
        prevAcc += orders.filter(row => row.sale_date === prevDate && hasNetOrderValue(row)).reduce((sum, row) => sum + netOrderValue(row), 0)
        prevValue = prevAcc
      }
      series.push({ label: String(day), 'Período atual': curAcc, 'Período anterior': prevValue })
    }
    return { series, daily: true }
  }
  const size = currentBounds.endMonth - currentBounds.startMonth + 1
  const series = Array.from({ length: size }, (_, i) => {
    const curMonth = currentBounds.startMonth + i
    const prevMonth = previousBounds.startMonth + i
    const curKey = `${currentBounds.year}-${String(curMonth).padStart(2, '0')}`
    const prevKey = `${previousBounds.year}-${String(prevMonth).padStart(2, '0')}`
    return {
      label: MONTHS[curMonth - 1],
      'Período atual': orders.filter(row => row.sale_date?.startsWith(curKey) && hasNetOrderValue(row)).reduce((sum, row) => sum + netOrderValue(row), 0),
      'Período anterior': orders.filter(row => row.sale_date?.startsWith(prevKey) && hasNetOrderValue(row)).reduce((sum, row) => sum + netOrderValue(row), 0),
    }
  })
  return { series, daily: false }
}

function aggregateFinancialPeriod(bounds, range, ctx) {
  const periodDre = ctx.dreRows.filter(row => row.ano === bounds.year && row.mes >= bounds.startMonth && row.mes <= bounds.endMonth)
  const revenue = periodDre.reduce((sum, row) => sum + number(row.receitas), 0)
  const variableCosts = periodDre.reduce((sum, row) => sum + number(row.custos_variaveis), 0)
  const contribution = periodDre.reduce((sum, row) => sum + number(row.margem_contribuicao), 0)
  const fixedCosts = periodDre.reduce((sum, row) => sum + number(row.custos_fixos), 0)
  const operatingResult = periodDre.reduce((sum, row) => sum + number(row.resultado_operacional), 0)
  const extraOperational = periodDre.reduce((sum, row) => sum + number(row.extra_operacional), 0)
  const result = periodDre.reduce((sum, row) => sum + number(row.resultado_liquido), 0)
  const contributionMargin = revenue ? contribution / revenue * 100 : 0
  const netMargin = revenue ? result / revenue * 100 : 0
  const breakEven = contributionMargin ? fixedCosts / (contributionMargin / 100) : 0

  const periodAccounts = ctx.dreAccounts.filter(row => row.ano === bounds.year && row.mes >= bounds.startMonth && row.mes <= bounds.endMonth)
  const costMap = new Map()
  const costAccountMap = new Map()
  periodAccounts.forEach(row => {
    if (!['custos_variaveis', 'custos_fixos'].includes(String(row.secao).toLowerCase())) return
    const section = String(row.secao).toLowerCase()
    const nature = section === 'custos_variaveis' ? 'variável' : 'fixo'
    const group = row.grupo || 'Outros'
    const groupName = `${group} · ${nature}`
    const accountName = `${row.conta || group} · ${nature}`
    costMap.set(groupName, (costMap.get(groupName) || 0) + Math.abs(number(row.valor)))
    costAccountMap.set(accountName, (costAccountMap.get(accountName) || 0) + Math.abs(number(row.valor)))
  })

  const periodManagerial = ctx.managerialRows.filter(row => row.ano === bounds.year && row.mes >= bounds.startMonth && row.mes <= bounds.endMonth)
  const weightedAvg = (valueKey, weightKey) => {
    const totalWeight = periodManagerial.reduce((sum, row) => sum + number(row[weightKey]), 0)
    if (!totalWeight) return 0
    return periodManagerial.reduce((sum, row) => sum + number(row[valueKey]) * number(row[weightKey]), 0) / totalWeight
  }
  const pmrv = weightedAvg('pmrv', 'vendas_total')
  const pmpf = weightedAvg('pmpf', 'ap_geradas_mes')
  const pmre = weightedAvg('pmre', 'compras_valor')
  const salesTotal = periodManagerial.reduce((sum, row) => sum + number(row.vendas_total), 0)
  const grossProfit = periodManagerial.reduce((sum, row) => sum + number(row.lucro_bruto), 0)
  const grossMargin = salesTotal ? grossProfit / salesTotal * 100 : 0
  const salesCash = periodManagerial.reduce((sum, row) => sum + number(row.vendas_a_vista), 0)
  const salesCredit = periodManagerial.reduce((sum, row) => sum + number(row.vendas_a_prazo), 0)
  const purchases = periodManagerial.reduce((sum, row) => sum + number(row.compras_valor), 0)
  const cashReceipts = periodManagerial.reduce((sum, row) => sum + number(row.caixa_recebimentos), 0)
  const cashPayments = periodManagerial.reduce((sum, row) => sum + number(row.caixa_pagamentos), 0)
  const cashDifference = periodManagerial.reduce((sum, row) => sum + number(row.caixa_diferenca), 0)
  const managerialOrdered = [...periodManagerial].sort((a, b) => a.ano - b.ano || a.mes - b.mes)
  const inventoryEnd = number(managerialOrdered.at(-1)?.estoque_valor)
  const inventoryAverage = managerialOrdered.length ? managerialOrdered.reduce((sum, row) => sum + number(row.estoque_valor), 0) / managerialOrdered.length : 0
  const inventoryTurnover = inventoryAverage ? variableCosts / inventoryAverage : 0

  const endIso = iso(range.end)
  const targetCompetence = `${bounds.year}-${String(bounds.endMonth).padStart(2,'0')}-01`
  const balance = ctx.balanceRows.find(row=>row.competencia_date===targetCompetence) || [...ctx.balanceRows].filter(row => row.competencia_date <= endIso).sort((a, b) => b.competencia_date.localeCompare(a.competencia_date))[0] || null
  let position = null
  if (balance) {
    const aporteADevolver = number(balance.contas_pagar_aporte_a_devolver || [...ctx.balanceRows].filter(row=>row.competencia_date<=endIso&&number(row.contas_pagar_aporte_a_devolver)>0).sort((a,b)=>b.competencia_date.localeCompare(a.competencia_date))[0]?.contas_pagar_aporte_a_devolver)
    const cpTotalAjustado = number(balance.contas_pagar_total) - aporteADevolver
    const cpMedioAjustado = number(balance.contas_pagar_a_vencer_medio) - aporteADevolver
    const currentAssets = number(balance.disponibilidades) + number(balance.contas_receber_total) + number(balance.estoque)
    const currentLiabilities = Math.max(cpTotalAjustado, 0)
    const maturityLabels={vencido:'Vencido',m1:'30 dias',m2:'31–60',m3:'61–90',m4_6:'91–180',rest_year:'Restante ano',next_years:'Anos seguintes'}
    const detailedMaturities=ctx.maturityRows.filter(row=>row.competencia_date===targetCompetence)
    let maturity=detailedMaturities.length?['vencido','m1','m2','m3','m4_6','rest_year','next_years'].map(key=>{const estimated=detailedMaturities.some(row=>row.bucket_key===key&&row.estimated);return {key,label:`${maturityLabels[key]}${estimated?'*':''}`,'A receber':detailedMaturities.filter(row=>row.bucket_key===key&&row.nature==='receber').reduce((s,row)=>s+number(row.amount),0),'A pagar':detailedMaturities.filter(row=>row.bucket_key===key&&row.nature==='pagar').reduce((s,row)=>s+number(row.amount),0),estimated}}).filter(row=>row['A receber']||row['A pagar']):[
      { label: 'Vencido', 'A receber': number(balance.contas_receber_vencido), 'A pagar': number(balance.contas_pagar_vencido_curto) + number(balance.contas_pagar_vencido_medio) },
      { label: 'Até 90 dias', 'A receber': number(balance.contas_receber_a_vencer_curto), 'A pagar': number(balance.contas_pagar_a_vencer_curto) },
      { label: 'Até 360 dias', 'A receber': number(balance.contas_receber_a_vencer_medio), 'A pagar': Math.max(cpMedioAjustado, 0) },
      { label: 'Longo prazo', 'A receber': 0, 'A pagar': number(balance.contas_pagar_a_vencer_longo) },
    ]
    if(detailedMaturities.length&&aporteADevolver>0){let remaining=aporteADevolver;['m4_6','rest_year','next_years','m3','m2','m1'].forEach(key=>{if(!remaining)return;const row=maturity.find(item=>item.key===key),deduction=Math.min(row?.['A pagar']||0,remaining);if(row)row['A pagar']-=deduction;remaining-=deduction});maturity=maturity.filter(row=>row['A receber']||row['A pagar'])}
    let accumulatedCash=number(balance.disponibilidades)
    maturity.forEach(row=>{accumulatedCash+=row['A receber']-row['A pagar'];row['Saldo acumulado']=accumulatedCash})
    const cashAt60=maturity.find(row=>row.label==='31–60')?.['Saldo acumulado'] ?? accumulatedCash
    const firstNegative=maturity.find(row=>row['Saldo acumulado']<0)?.label
    const minimumCash=Math.min(number(balance.disponibilidades),...maturity.map(row=>row['Saldo acumulado']))
    position = {
      date: balance.competencia_date,
      cash: number(balance.disponibilidades),
      assets: number(balance.ativo_total),
      inventory: number(balance.estoque),
      currentAssets,
      currentLiabilities,
      aporteADevolver,
      accumulatedResult: number(balance.lucro_prejuizo_acumulado),
      workingCapital: currentAssets - currentLiabilities,
      currentRatio: currentLiabilities ? currentAssets / currentLiabilities : 0,
      debtRatio: number(balance.ativo_total) ? cpTotalAjustado / number(balance.ativo_total) * 100 : 0,
      totalReceivable: number(balance.contas_receber_total),
      totalPayable: Math.max(cpTotalAjustado, 0),
      overdueReceivable: number(balance.contas_receber_vencido),
      overduePayable: number(balance.contas_pagar_vencido_curto) + number(balance.contas_pagar_vencido_medio),
      maturity, cashAt60, firstNegative, minimumCash,
    }
  }

  return {
    revenue, variableCosts, contribution, fixedCosts, operatingResult, extraOperational, result,
    contributionMargin, netMargin, breakEven, breakEvenGap: revenue - breakEven,
    variableCostPct: revenue ? variableCosts / revenue * 100 : 0,
    fixedCostPct: revenue ? fixedCosts / revenue * 100 : 0,
    salesTotal, grossProfit, grossMargin, salesCash, salesCredit, purchases, cashReceipts, cashPayments, cashDifference,
    inventoryEnd, inventoryAverage, inventoryTurnover,
    costs: [...costMap.entries()].map(([name, value]) => ({ name, value })).sort((a, b) => b.value - a.value),
    costAccounts: [...costAccountMap.entries()].map(([name, value]) => ({ name, value })).sort((a, b) => b.value - a.value),
    pmrv, pmpf, pmre, cicloCaixa: pmrv + pmre - pmpf,
    monthsAboveBreakEven: periodDre.filter(row => number(row.receitas) >= number(row.ponto_equilibrio)).length,
    monthCount: periodDre.length,
    hasData: periodDre.length > 0,
    position,
  }
}

function useClosingData(type, year, index) {
  const [state, setState] = useState({ loading: true, error: '', commercial: null, financial: null })

  useEffect(() => {
    let active = true
    async function load() {
      setState(prev => ({ ...prev, loading: true, error: '' }))
      const currentBounds = periodBounds(type, year, index)
      const previousBounds = previousPeriodBounds(type, year, index)
      const currentRange = boundsToRange(currentBounds)
      const previousRange = boundsToRange(previousBounds)
      const fetchStartIso = iso(previousRange.start)
      const fetchEndIso = iso(currentRange.end)
      const years = [...new Set([currentBounds.year, previousBounds.year])]
      try {
        const [ordersRes, docsRes, goalsRes, portfolioRes, farmsRes, profilesRes, dreRes, dreAccountsRes, balanceRes, managerialRes, maturityRes] = await Promise.all([
          supabaseAdmin.from('management_order_overview').select('*').gte('sale_date', fetchStartIso).lte('sale_date', fetchEndIso),
          supabaseAdmin.from('fiscal_documents').select('ultra_document_id,issue_date,document_total,movement_type,partner_id,partner_name,seller_id,ultra_salesman_id,salesman_name,fiscal_document_items(product_name,product_total)').gte('issue_date', '2026-01-01').lte('issue_date', fetchEndIso),
          supabaseAdmin.from('goals').select('*,erp_salesmen(name)').in('ano', years),
          supabaseAdmin.from('management_open_order_portfolio').select('id,ultra_order_number,sale_date,customer_name,seller_id,ultra_salesman_id,ultra_salesman_name,open_value'),
          supabaseAdmin.from('farms').select('id,state,segment,ultra_partner_id,status'),
          supabaseAdmin.from('profiles').select('id,name,ultra_salesman_id'),
          supabaseAdmin.from('finance_dre_monthly').select('*').in('ano', years).order('ano').order('mes'),
          supabaseAdmin.from('finance_dre_accounts').select('*').in('ano', years),
          supabaseAdmin.from('finance_balanco').select('*').order('competencia_date', { ascending: false }),
          supabaseAdmin.from('finance_managerial_monthly').select('*').in('ano', years),
          supabaseAdmin.from('finance_cash_maturities').select('*').gte('competencia_date',fetchStartIso).lte('competencia_date',fetchEndIso),
        ])
        const failure = [ordersRes, docsRes, goalsRes, portfolioRes, farmsRes, profilesRes, dreRes, dreAccountsRes, balanceRes, managerialRes, maturityRes].find(result => result.error)
        if (failure?.error) throw failure.error

        const orders = ordersRes.data || []
        const docs = docsRes.data || []
        const goals = goalsRes.data || []
        const farms = farmsRes.data || []
        const profiles = profilesRes.data || []
        const profileById = new Map(profiles.map(row => [row.id, row]))
        const profileByUltra = new Map(profiles.filter(row => row.ultra_salesman_id).map(row => [number(row.ultra_salesman_id), row]))
        const farmByPartner = new Map(farms.filter(row => row.ultra_partner_id).map(row => [number(row.ultra_partner_id), row]))
        const ctx = {
          orders, docs, goals, profileById, profileByUltra, farmByPartner,
          portfolio: portfolioRes.data || [],
          activeClients: farms.filter(row => row.status === 'ativo').length,
        }
        const commercialCurrent = aggregateCommercialPeriod(currentBounds, currentRange, ctx)
        const commercialPrevious = aggregateCommercialPeriod(previousBounds, previousRange, ctx)
        const trajectory = buildCommercialTrajectory(type, currentBounds, currentRange, previousBounds, orders)
        const commercial = {
          current: commercialCurrent, previous: commercialPrevious,
          trajectory: trajectory.series, trajectoryDaily: trajectory.daily,
        }

        const finCtx = {
          dreRows: dreRes.data || [], dreAccounts: dreAccountsRes.data || [],
          balanceRows: balanceRes.data || [], managerialRows: managerialRes.data || [],
          maturityRows: maturityRes.data || [],
        }
        const financialCurrent = aggregateFinancialPeriod(currentBounds, currentRange, finCtx)
        const financialPrevious = aggregateFinancialPeriod(previousBounds, previousRange, finCtx)
        const managerialByMonth = new Map(finCtx.managerialRows.map(row => [`${row.ano}-${row.mes}`, row]))
        const series = [...finCtx.dreRows].sort((a, b) => a.ano - b.ano || a.mes - b.mes).map(row => ({
          label: `${MONTHS[row.mes - 1]}/${String(row.ano).slice(2)}`,
          Receita: number(row.receitas),
          Resultado: number(row.resultado_liquido),
          Equilíbrio: number(row.ponto_equilibrio),
          Caixa: number(managerialByMonth.get(`${row.ano}-${row.mes}`)?.caixa_diferenca),
        }))
        const financial = {
          current: financialCurrent, previous: financialPrevious, series,
          hasData: financialCurrent.hasData, previousHasData: financialPrevious.hasData,
        }

        if (active) setState({ loading: false, error: '', commercial, financial })
      } catch (error) {
        console.error('Erro ao preparar apresentações:', error)
        if (active) setState({ loading: false, error: error.message || 'Não foi possível carregar os dados.', commercial: null, financial: null })
      }
    }
    load()
    return () => { active = false }
  }, [type, year, index])

  return state
}

export default function Fechamentos() {
  const now = new Date()
  const [periodType, setPeriodType] = useState('mensal')
  const [year, setYear] = useState(now.getFullYear())
  const [index, setIndex] = useState(now.getMonth() + 1)
  const [type, setType] = useState(() => new URLSearchParams(window.location.search).get('type') === 'financeiro' ? 'financeiro' : 'comercial')
  const [activeSlide, setActiveSlide] = useState(0)
  const [exporting, setExporting] = useState('')
  const [editing, setEditing] = useState(false)
  const [copy, setCopy] = useState({})
  const slideRefs = useRef([])
  const stageRef = useRef(null)
  const [slideScale, setSlideScale] = useState(1)
  const data = useClosingData(periodType, year, index)

  const currentBounds = useMemo(() => periodBounds(periodType, year, index), [periodType, year, index])
  const previousBounds = useMemo(() => previousPeriodBounds(periodType, year, index), [periodType, year, index])
  const period = periodLabel(periodType, currentBounds)
  const previousLabelText = periodLabel(periodType, previousBounds)
  const comparisonNoun = COMPARISON_NOUN[periodType]
  const generatedAt = now.toLocaleDateString('pt-BR', { day: '2-digit', month: 'long', year: 'numeric' })
  const editor = useMemo(() => ({ enabled: editing, copy, setCopy }), [editing, copy, setCopy])

  const slides = useMemo(() => {
    if (!data.commercial || !data.financial) return []
    return type === 'comercial'
      ? CommercialSlides({ data: data.commercial, financial: data.financial, period, previousLabel: previousLabelText, generatedAt, comparisonNoun, editor })
      : CFOFinancialSlides({ data: data.financial, commercial: data.commercial, period, previousLabel: previousLabelText, generatedAt, comparisonNoun, editor })
  }, [data.commercial, data.financial, type, period, previousLabelText, generatedAt, comparisonNoun, editor])

  useEffect(() => {
    if (!stageRef.current) return undefined
    const resize = () => setSlideScale(stageRef.current ? stageRef.current.clientWidth / 1200 : 1)
    resize()
    const observer = new ResizeObserver(resize)
    observer.observe(stageRef.current)
    return () => observer.disconnect()
  }, [data.loading])

  async function renderSlides() {
    const images = []
    for (const node of slideRefs.current.slice(0, slides.length)) {
      node.classList.add('capture')
      await new Promise(resolve => requestAnimationFrame(resolve))
      const canvas = await html2canvas(node, { scale: 2, useCORS: true, backgroundColor: '#f7f3ef', logging: false })
      images.push(canvas.toDataURL('image/png', 1))
      node.classList.remove('capture')
    }
    return images
  }

  async function exportPDF() {
    setExporting('pdf')
    try {
      const images = await renderSlides()
      const pdf = new jsPDF({ orientation: 'landscape', unit: 'mm', format: [338.667, 190.5], compress: true })
      images.forEach((image, i) => { if (i) pdf.addPage([338.667, 190.5], 'landscape'); pdf.addImage(image, 'PNG', 0, 0, 338.667, 190.5, undefined, 'FAST') })
      pdf.save(`nutrialle-fechamento-${type}-${sanitizeName(period)}.pdf`)
    } finally { setExporting('') }
  }

  async function exportPPTX() {
    setExporting('pptx')
    try {
      const images = await renderSlides()
      const { default: PptxGenJS } = await import('pptxgenjs')
      const pptx = new PptxGenJS()
      pptx.layout = 'LAYOUT_WIDE'
      pptx.author = 'Nutrialle Nutrição Animal'
      pptx.subject = `Fechamento ${type} — ${period}`
      pptx.title = `Nutrialle | Fechamento ${type} | ${period}`
      pptx.company = 'Nutrialle Nutrição Animal'
      images.forEach(image => { const slide = pptx.addSlide(); slide.background = { color: 'F7F3EF' }; slide.addImage({ data: image, x: 0, y: 0, w: 13.333, h: 7.5 }) })
      await pptx.writeFile({ fileName: `nutrialle-fechamento-${type}-${sanitizeName(period)}.pptx` })
    } finally { setExporting('') }
  }

  const financialMissing = type === 'financeiro' && !data.loading && data.financial && !data.financial.hasData

  return <div className="closing-shell">
    <Topbar title="Fechamento mensal" subtitle="Apresentações comerciais e financeiras geradas com dados do Gestão" />
    <main className="closing-page">
      <section className="closing-command">
        <div className="closing-type-switch"><button className={type === 'comercial' ? 'active' : ''} onClick={() => { setType('comercial'); setActiveSlide(0) }}>Comercial</button><button className={type === 'financeiro' ? 'active' : ''} onClick={() => { setType('financeiro'); setActiveSlide(0) }}>Financeira</button></div>
        <div className="closing-period">
          <select value={periodType} onChange={event => { setPeriodType(event.target.value); setIndex(1); setActiveSlide(0) }}>{Object.entries(PERIOD_TYPE_LABEL).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select>
          {periodType !== 'anual' && <select value={index} onChange={event => { setIndex(Number(event.target.value)); setActiveSlide(0) }}>{indexOptionsFor(periodType).map(opt => <option key={opt.value} value={opt.value}>{opt.label}</option>)}</select>}
          <select value={year} onChange={event => { setYear(Number(event.target.value)); setActiveSlide(0) }}>{[year - 1, year, year + 1].map(value => <option key={value}>{value}</option>)}</select>
        </div>
        <div className="closing-actions"><button className={`btn btn-ghost ${editing ? 'active' : ''}`} disabled={data.loading || !!exporting} onClick={() => setEditing(value => !value)}>{editing ? <IconCheck size={17} /> : <IconEdit size={17} />} {editing ? 'Concluir edição' : 'Editar textos'}</button><button className="btn btn-ghost" onClick={() => window.location.reload()}><IconRefresh size={17} /> Atualizar dados</button><button className="btn btn-ghost" disabled={data.loading || !!exporting} onClick={exportPDF}><IconFileTypePdf size={17} /> {exporting === 'pdf' ? 'Gerando…' : 'Baixar PDF'}</button><button className="btn btn-primary" disabled={data.loading || !!exporting} onClick={exportPPTX}><IconDownload size={17} /> {exporting === 'pptx' ? 'Gerando…' : 'Baixar PowerPoint'}</button></div>
      </section>
      {financialMissing && <div className="closing-warning">Nenhum fechamento contábil carregado para <b>{period}</b> ainda — a apresentação financeira vai mostrar zeros até o próximo fechamento ser lançado no Financeiro.</div>}
      {data.loading ? <div className="closing-state"><IconPresentation size={30} /><strong>Preparando o fechamento…</strong><span>Cruzando pedidos, faturamento, metas e dados financeiros.</span></div> : data.error ? <div className="closing-state error"><strong>Não foi possível montar a apresentação</strong><span>{data.error}</span></div> : <>
        <section className="closing-viewer"><div className="closing-stage" ref={stageRef}>{slides.map((slide, i) => <div key={i} className={`closing-slide-frame ${activeSlide === i ? 'active' : ''}`} style={{ transform: `scale(${slideScale})` }} ref={node => { slideRefs.current[i] = node }}>{slide}</div>)}</div><div className="closing-nav"><button disabled={!activeSlide} onClick={() => setActiveSlide(value => value - 1)}><IconArrowLeft size={18} /></button><span>{activeSlide + 1} de {slides.length}</span><button disabled={activeSlide === slides.length - 1} onClick={() => setActiveSlide(value => value + 1)}><IconArrowRight size={18} /></button></div></section>
        <section className="closing-filmstrip">{slides.map((slide, i) => <button key={i} className={activeSlide === i ? 'active' : ''} onClick={() => setActiveSlide(i)}><span>{slide}</span><b>{String(i + 1).padStart(2, '0')}</b></button>)}</section>
      </>}
    </main>
  </div>
}
