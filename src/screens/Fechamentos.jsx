import { useEffect, useMemo, useRef, useState } from 'react'
import { Area, AreaChart, Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'
import * as d3 from 'd3'
import { IconArrowLeft, IconArrowRight, IconDownload, IconFileTypePdf, IconPresentation, IconRefresh } from '@tabler/icons-react'
import html2canvas from 'html2canvas'
import jsPDF from 'jspdf'
import Topbar from '../components/Topbar'
import logo from '../assets/logo-nutrialle.png'
import { supabaseAdmin } from '../lib/supabase'
import { fiscalDocumentValue, hasNetOrderValue, netOrderValue } from '../lib/commercialMetrics'

const MONTHS = ['Jan', 'Fev', 'Mar', 'Abr', 'Mai', 'Jun', 'Jul', 'Ago', 'Set', 'Out', 'Nov', 'Dez']
const MONTHS_FULL = ['janeiro', 'fevereiro', 'março', 'abril', 'maio', 'junho', 'julho', 'agosto', 'setembro', 'outubro', 'novembro', 'dezembro']
const COLORS = ['#f47b20', '#ffb067', '#3b3835', '#81776f', '#c8bdb3', '#f3e7dc']

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
const monthKey = (year, month) => `${year}-${String(month).padStart(2, '0')}`
const monthRange = (year, month) => ({ start: `${monthKey(year, month)}-01`, end: new Date(year, month, 0).toISOString().slice(0, 10) })
const previousPeriod = (year, month) => month === 1 ? { year: year - 1, month: 12 } : { year, month: month - 1 }
const sanitizeName = value => String(value).normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-zA-Z0-9_-]+/g, '-').replace(/^-|-$/g, '').toLowerCase()

function Delta({ current, previous, suffix = 'vs. mês anterior' }) {
  const value = variation(current, previous)
  return <span className={value >= 0 ? 'deck-delta positive' : 'deck-delta negative'}>{value >= 0 ? '↗' : '↘'} {Math.abs(value).toFixed(1).replace('.', ',')}% {suffix}</span>
}

function Brand({ page, total, dark = false }) {
  return <div className={`deck-brand ${dark ? 'dark' : ''}`}><img src={logo} alt="Nutrialle" /><span>{String(page).padStart(2, '0')} / {String(total).padStart(2, '0')}</span></div>
}

function Cover({ type, period, total }) {
  const commercial = type === 'comercial'
  return <article className="deck-slide deck-cover">
    <div className="deck-cover-glow" />
    <img className="deck-cover-logo" src={logo} alt="Nutrialle" />
    <div className="deck-cover-copy"><span>FECHAMENTO {commercial ? 'COMERCIAL' : 'FINANCEIRO'}</span><h1>{period}</h1><p>{commercial ? 'Performance, mercado e direção para o próximo ciclo.' : 'Resultado, liquidez e decisões para sustentar o crescimento.'}</p></div>
    <div className="deck-cover-foot"><i /> Gestão Nutrialle <b>•</b> confidencial</div>
    <Brand page={1} total={total} dark />
  </article>
}

function Slide({ children, page, total, tone = 'light', className = '' }) {
  return <article className={`deck-slide deck-${tone} ${className}`}>{children}<Brand page={page} total={total} dark={tone === 'dark'} /></article>
}

function SlideTitle({ eyebrow, children, aside }) {
  return <header className="deck-title"><div><span>{eyebrow}</span><h2>{children}</h2></div>{aside && <small>{aside}</small>}</header>
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

function CommercialSlides({ data, period }) {
  const total = 8
  const maxSeller = Math.max(...data.sellers.map(item => item.orders), 1)
  const maxProduct = Math.max(...data.products.map(item => item.value), 1)
  return [
    <Cover key="cover" type="comercial" period={period} total={total} />,
    <Slide key="month" page={2} total={total} tone="dark" className="deck-thesis">
      <span className="deck-kicker">RESUMO EXECUTIVO</span>
      <h2>{data.monthBilling >= data.previousBilling ? `Faturamento cresceu ${pct(Math.abs(variation(data.monthBilling, data.previousBilling)))} frente ao mês anterior.` : `Faturamento caiu ${pct(Math.abs(variation(data.monthBilling, data.previousBilling)))} frente ao mês anterior.`}</h2>
      <div className="deck-thesis-metrics"><BigNumber label="Pedidos líquidos" value={shortMoney(data.monthOrders)} note={<Delta current={data.monthOrders} previous={data.previousOrders} />} /><BigNumber label="Faturamento líquido" value={shortMoney(data.monthBilling)} note={<Delta current={data.monthBilling} previous={data.previousBilling} />} accent /><BigNumber label="Carteira aberta" value={shortMoney(data.openPortfolio)} note={<small>potencial aguardando faturamento</small>} /></div>
      <MetricStrip dark items={[{ label: 'Pedidos no mês', value: data.monthOrderCount, note: 'pedidos líquidos válidos' }, { label: 'Ticket médio', value: shortMoney(data.averageTicket), note: 'por pedido gerado' }, { label: 'Clientes faturados', value: data.billedClients, note: 'clientes únicos no mês' }, { label: 'Devoluções', value: shortMoney(data.returns), note: 'abatidas do faturamento' }]} />
    </Slide>,
    <Slide key="rhythm" page={3} total={total}>
      <SlideTitle eyebrow="RITMO DO ANO" aside={`${data.validOrders} pedidos válidos no acumulado`}>Pedidos e faturamento acumulados até {MONTHS[data.month - 1]}.</SlideTitle>
      <MetricStrip items={[{ label: 'Pedidos acumulados', value: shortMoney(data.ytdOrders) }, { label: 'Faturamento acumulado', value: shortMoney(data.ytdBilling) }, { label: 'Conversão do período', value: data.ytdOrders ? pct(data.ytdBilling / data.ytdOrders * 100) : '—', note: 'faturamento ÷ pedidos' }]} />
      <div className="deck-chart-stage"><ResponsiveContainer width="100%" height="100%"><AreaChart data={data.series} margin={{ top: 18, right: 18, left: 8, bottom: 0 }}><defs><linearGradient id="deckBilling" x1="0" x2="0" y1="0" y2="1"><stop offset="0" stopColor="#f47b20" stopOpacity=".28" /><stop offset="1" stopColor="#f47b20" stopOpacity="0" /></linearGradient></defs><CartesianGrid vertical={false} stroke="#e9e1da" strokeDasharray="3 7" /><XAxis dataKey="label" axisLine={false} tickLine={false} /><YAxis axisLine={false} tickLine={false} tickFormatter={v => `${Math.round(v / 1000)}k`} /><Tooltip formatter={v => money(v)} /><Area type="monotone" dataKey="Faturamento" stroke="#f47b20" strokeWidth={4} fill="url(#deckBilling)" /><Area type="monotone" dataKey="Pedidos" stroke="#292623" strokeWidth={3} fill="transparent" /></AreaChart></ResponsiveContainer></div>
      <div className="deck-chart-legend"><i className="orange" /> Faturamento líquido <i className="ink" /> Pedidos líquidos</div>
    </Slide>,
    <Slide key="goal" page={4} total={total} className="deck-goal-slide">
      <SlideTitle eyebrow="EXECUÇÃO CONTRA META" aside={`${MONTHS[data.month - 1]} / ${data.year}`}>Vendas geradas atingiram {data.ytdGoal ? pct(data.ytdOrders / data.ytdGoal * 100) : '—'} da meta acumulada.</SlideTitle>
      <div className="deck-goal-main"><div><span>ATINGIMENTO ACUMULADO</span><strong>{data.ytdGoal ? pct(data.ytdOrders / data.ytdGoal * 100) : '—'}</strong><p>{data.ytdGoal ? `${shortMoney(Math.max(data.ytdGoal - data.ytdOrders, 0))} ainda separam o realizado da meta do ano até aqui.` : 'Metas ainda não cadastradas para o período.'}</p></div><div className="deck-goal-ring" style={{ '--progress': `${Math.min(data.ytdGoal ? data.ytdOrders / data.ytdGoal * 100 : 0, 100)}%` }}><span>{shortMoney(data.ytdOrders)}</span><small>vendidos</small></div></div>
      <div className="deck-goal-track"><i style={{ width: `${Math.min(data.ytdGoal ? data.ytdOrders / data.ytdGoal * 100 : 0, 100)}%` }} /><span>0</span><b>Meta {shortMoney(data.ytdGoal)}</b></div>
      <MetricStrip items={[{ label: 'Venda no mês', value: shortMoney(data.monthOrders) }, { label: 'Meta do mês', value: shortMoney(data.monthGoal) }, { label: 'Saldo do mês', value: shortMoney(data.monthOrders - data.monthGoal), note: data.monthOrders >= data.monthGoal ? 'acima da meta' : 'abaixo da meta' }]} />
    </Slide>,
    <Slide key="sellers" page={5} total={total}>
      <SlideTitle eyebrow="EQUIPE COMERCIAL" aside="pedidos líquidos do mês">Ranking de vendas geradas e atingimento da meta mensal.</SlideTitle>
      <div className="deck-ranking-head"><span>Vendedor</span><span>Venda gerada</span><span>Meta / faturamento</span></div>
      <div className="deck-ranking">{data.sellers.slice(0, 6).map((seller, index) => <div key={seller.key}><b>{String(index + 1).padStart(2, '0')}</b><span><strong>{seller.name}</strong><i><em style={{ width: `${seller.orders / maxSeller * 100}%` }} /></i></span><strong>{shortMoney(seller.orders)}</strong><small>{seller.goal ? `${pct(seller.orders / seller.goal * 100)} da meta` : shortMoney(seller.billing) + ' faturados'}</small></div>)}</div>
    </Slide>,
    <Slide key="products" page={6} total={total} tone="dark">
      <SlideTitle eyebrow="MIX DE PRODUTOS" aside="faturamento líquido" >Produtos que formaram o faturamento líquido do mês.</SlideTitle>
      <div className="deck-products"><div className="deck-product-hero"><span>PRODUTO LÍDER</span><h3>{data.products[0]?.name || 'Sem faturamento'}</h3><strong>{shortMoney(data.products[0]?.value)}</strong><small>{data.monthBilling ? pct((data.products[0]?.value || 0) / data.monthBilling * 100) : '0%'} do faturamento</small></div><div className="deck-product-bars">{data.products.slice(1, 6).map((product, index) => <div key={product.name}><span>{product.name}</span><i><em style={{ width: `${product.value / maxProduct * 100}%`, background: COLORS[index + 1] }} /></i><strong>{shortMoney(product.value)}</strong></div>)}</div></div>
    </Slide>,
    <Slide key="regions" page={7} total={total}>
      <SlideTitle eyebrow="PRESENÇA DE MERCADO" aside={`${data.activeClients} clientes ativos`}>Distribuição do faturamento líquido por estado.</SlideTitle>
      <MetricStrip items={[{ label: 'Estado líder', value: data.regions[0]?.name || '—', note: shortMoney(data.regions[0]?.value) }, { label: 'Participação do líder', value: data.monthBilling ? pct((data.regions[0]?.value || 0) / data.monthBilling * 100) : '—' }, { label: 'Estados faturados', value: data.regions.length }]} />
      <div className="deck-region-layout map"><BrazilSalesMap regions={data.regions} /><div className="deck-region-list">{data.regions.slice(0, 6).map((region, index) => <div key={region.name}><i style={{ background: COLORS[index % COLORS.length] }} /><strong>{region.name}</strong><span>{shortMoney(region.value)}</span><small>{data.monthBilling ? pct(region.value / data.monthBilling * 100) : '0%'}</small></div>)}</div></div>
    </Slide>,
    <Slide key="close" page={8} total={total} tone="dark" className="deck-close">
      <span>PRIORIDADES COMERCIAIS</span><h2>{data.openPortfolio > 0 ? `Faturar a carteira de ${shortMoney(data.openPortfolio)} e recuperar o saldo de meta.` : 'Recompor a carteira de pedidos do próximo mês.'}</h2><p>1. Priorizar pedidos liberados e próximos do faturamento. 2. Atacar o saldo de {shortMoney(Math.max(data.ytdGoal - data.ytdOrders, 0))} da meta acumulada. 3. Replicar o mix e a execução dos vendedores líderes.</p><div><i /> decisão requerida da gestão</div>
    </Slide>,
  ]
}

function FinancialSlides({ data, period }) {
  const total = 8
  const maxCost = Math.max(...data.costs.map(item => item.value), 1)
  return [
    <Cover key="cover" type="financeiro" period={period} total={total} />,
    <Slide key="result" page={2} total={total} tone="dark" className="deck-thesis">
      <span className="deck-kicker">RESUMO EXECUTIVO</span>
      <h2>{data.result >= 0 ? `Resultado positivo de ${shortMoney(data.result)}, com margem líquida de ${pct(data.netMargin)}.` : `Prejuízo de ${shortMoney(Math.abs(data.result))}, com receita abaixo da estrutura de custos.`}</h2>
      <div className="deck-thesis-metrics"><BigNumber label="Receita" value={shortMoney(data.revenue)} note={<Delta current={data.revenue} previous={data.previousRevenue} />} /><BigNumber label="Resultado líquido" value={shortMoney(data.result)} note={<span className={data.result >= 0 ? 'deck-delta positive' : 'deck-delta negative'}>{pct(data.netMargin)} de margem líquida</span>} accent /><BigNumber label="Ponto de equilíbrio" value={shortMoney(data.breakEven)} note={<small>{data.revenue >= data.breakEven ? 'receita acima do mínimo operacional' : 'receita abaixo do mínimo operacional'}</small>} /></div>
      <MetricStrip dark items={[{ label: 'Margem de contribuição', value: pct(data.contributionMargin), note: shortMoney(data.contribution) }, { label: 'Distância do equilíbrio', value: shortMoney(data.breakEvenGap), note: data.breakEvenGap >= 0 ? 'acima do ponto de equilíbrio' : 'abaixo do ponto de equilíbrio' }, { label: 'Custos fixos', value: shortMoney(data.fixedCosts) }, { label: 'Custos variáveis', value: shortMoney(data.variableCosts) }]} />
    </Slide>,
    <Slide key="dre" page={3} total={total}>
      <SlideTitle eyebrow="DRE DO MÊS" aside="regime de competência">Receita, custos, margens e resultado do período.</SlideTitle>
      <MetricStrip items={[{ label: 'Margem de contribuição', value: pct(data.contributionMargin) }, { label: 'Margem líquida', value: pct(data.netMargin) }, { label: 'Ponto de equilíbrio', value: shortMoney(data.breakEven) }, { label: 'Folga / falta de receita', value: shortMoney(data.breakEvenGap) }]} />
      <div className="deck-dre-flow">{[
        ['Receita', data.revenue, 100],
        ['Custos variáveis', -Math.abs(data.variableCosts), data.revenue ? data.variableCosts / data.revenue * 100 : 0],
        ['Margem de contribuição', data.contribution, data.revenue ? data.contribution / data.revenue * 100 : 0],
        ['Custos fixos', -Math.abs(data.fixedCosts), data.revenue ? data.fixedCosts / data.revenue * 100 : 0],
        ['Resultado líquido', data.result, data.netMargin],
      ].map(([label, value, share], index) => <div key={label} className={index === 4 ? (value >= 0 ? 'result positive' : 'result negative') : ''}><span>{label}</span><i><em style={{ width: `${Math.min(Math.abs(share), 100)}%` }} /></i><strong>{shortMoney(value)}</strong><small>{pct(share)}</small></div>)}</div>
    </Slide>,
    <Slide key="evolution" page={4} total={total}>
      <SlideTitle eyebrow="TRAJETÓRIA DO ANO" aside={`${data.monthsAboveBreakEven} meses acima do equilíbrio`}>Evolução mensal de receita e resultado líquido.</SlideTitle>
      <MetricStrip items={[{ label: 'Receita acumulada', value: shortMoney(data.ytdRevenue) }, { label: 'Resultado acumulado', value: shortMoney(data.ytdResult) }, { label: 'Margem líquida acumulada', value: data.ytdRevenue ? pct(data.ytdResult / data.ytdRevenue * 100) : '—' }]} />
      <div className="deck-chart-stage"><ResponsiveContainer width="100%" height="100%"><BarChart data={data.series} margin={{ top: 18, right: 18, left: 8, bottom: 0 }}><CartesianGrid vertical={false} stroke="#e9e1da" strokeDasharray="3 7" /><XAxis dataKey="label" axisLine={false} tickLine={false} /><YAxis axisLine={false} tickLine={false} tickFormatter={v => `${Math.round(v / 1000)}k`} /><Tooltip formatter={v => money(v)} /><Bar dataKey="Receita" fill="#292623" radius={[7, 7, 0, 0]} /><Bar dataKey="Resultado" fill="#f47b20" radius={[7, 7, 0, 0]} /></BarChart></ResponsiveContainer></div><div className="deck-chart-legend"><i className="ink" /> Receita <i className="orange" /> Resultado líquido</div>
    </Slide>,
    <Slide key="costs" page={5} total={total} tone="dark">
      <SlideTitle eyebrow="ESTRUTURA DE CUSTOS" aside="acumulado até o mês">Composição dos custos acumulados e participação sobre a receita.</SlideTitle>
      <div className="deck-cost-layout"><div><span>CUSTOS TOTAIS ACUMULADOS</span><strong>{shortMoney(data.ytdCosts)}</strong><p>{data.ytdRevenue ? pct(data.ytdCosts / data.ytdRevenue * 100) : '0%'} da receita acumulada.</p></div><div className="deck-cost-bars">{data.costs.slice(0, 6).map((cost, index) => <div key={cost.name}><span>{cost.name}</span><i><em style={{ width: `${cost.value / maxCost * 100}%`, background: COLORS[index % COLORS.length] }} /></i><strong>{shortMoney(cost.value)}</strong></div>)}</div></div>
    </Slide>,
    <Slide key="liquidity" page={6} total={total}>
      <SlideTitle eyebrow="SAÚDE FINANCEIRA" aside={data.balanceDate ? `posição em ${new Date(`${data.balanceDate}T12:00:00`).toLocaleDateString('pt-BR')}` : 'posição não carregada'}>Capacidade de pagar obrigações e financiar a operação.</SlideTitle>
      <div className="deck-liquidity"><div className="deck-liquidity-main"><span>LIQUIDEZ CORRENTE</span><strong>{data.currentRatio ? `${data.currentRatio.toFixed(2).replace('.', ',')}x` : '—'}</strong><p>{data.currentRatio >= 1 ? 'O ativo circulante cobre os compromissos operacionais.' : 'Os compromissos de curto prazo superam os recursos circulantes.'}</p></div><div><BigNumber label="Capital de giro" value={shortMoney(data.workingCapital)} note={<small>ativo circulante − passivo circulante</small>} /><BigNumber label="Disponibilidades" value={shortMoney(data.cash)} note={<small>caixa e bancos</small>} /><BigNumber label="Endividamento" value={pct(data.debtRatio)} note={<small>contas a pagar ajustadas ÷ ativo</small>} /></div></div>
    </Slide>,
    <Slide key="maturity" page={7} total={total}>
      <SlideTitle eyebrow="PRESSÃO DE CAIXA" aside="posição por vencimento">Contas a receber, contas a pagar e déficit por faixa de prazo.</SlideTitle>
      <MetricStrip items={[{ label: 'Total a receber', value: shortMoney(data.totalReceivable) }, { label: 'Total a pagar ajustado', value: shortMoney(data.totalPayable) }, { label: 'Saldo financeiro', value: shortMoney(data.cashGap), note: data.cashGap >= 0 ? 'sobra de recebíveis' : 'falta de recebíveis' }, { label: 'Pressão vencida', value: shortMoney(data.overdueGap), note: data.overdueGap >= 0 ? 'saldo vencido favorável' : 'déficit vencido' }]} />
      <div className="deck-maturity-chart"><ResponsiveContainer width="100%" height="100%"><BarChart data={data.maturity} margin={{ top: 18, right: 18, left: 8, bottom: 0 }}><CartesianGrid vertical={false} stroke="#e9e1da" strokeDasharray="3 7" /><XAxis dataKey="label" axisLine={false} tickLine={false} /><YAxis axisLine={false} tickLine={false} tickFormatter={v => `${Math.round(v / 1000)}k`} /><Tooltip formatter={v => money(v)} /><Bar dataKey="A receber" fill="#f47b20" radius={[7, 7, 0, 0]} /><Bar dataKey="A pagar" fill="#292623" radius={[7, 7, 0, 0]} /></BarChart></ResponsiveContainer></div><div className="deck-chart-legend"><i className="orange" /> A receber <i className="ink" /> A pagar</div>
    </Slide>,
    <Slide key="close" page={8} total={total} tone="dark" className="deck-close">
      <span>PRIORIDADES FINANCEIRAS</span><h2>{data.currentRatio < 1 ? `Cobrir o déficit de capital de giro de ${shortMoney(Math.abs(data.workingCapital))}.` : `Preservar a liquidez de ${data.currentRatio.toFixed(2).replace('.', ',')}x e a margem operacional.`}</h2><p>{data.result < 0 ? `1. Gerar ${shortMoney(Math.abs(data.breakEvenGap))} adicionais para alcançar o equilíbrio. 2. Reduzir os grupos de custo com maior peso. 3. Reprogramar pagamentos onde os recebíveis não cobrem os vencimentos.` : `1. Converter resultado em caixa. 2. Cobrir o saldo financeiro de ${shortMoney(Math.abs(Math.min(data.cashGap, 0)))}. 3. Manter custos fixos abaixo de ${shortMoney(data.fixedCosts)} por mês.`}</p><div><i /> decisão requerida da gestão</div>
    </Slide>,
  ]
}

function useClosingData(year, month) {
  const [state, setState] = useState({ loading: true, error: '', commercial: null, financial: null })

  useEffect(() => {
    let active = true
    async function load() {
      setState(prev => ({ ...prev, loading: true, error: '' }))
      const range = monthRange(year, month)
      const previous = previousPeriod(year, month)
      const previousRange = monthRange(previous.year, previous.month)
      const yearStart = `${year}-01-01`
      try {
        const [ordersRes, previousOrdersRes, docsRes, previousDocsRes, goalsRes, portfolioRes, farmsRes, profilesRes, dreRes, dreAccountsRes, balanceRes, managerialRes] = await Promise.all([
          supabaseAdmin.from('management_order_overview').select('*').gte('sale_date', yearStart).lte('sale_date', range.end),
          supabaseAdmin.from('management_order_overview').select('*').gte('sale_date', previousRange.start).lte('sale_date', previousRange.end),
          supabaseAdmin.from('fiscal_documents').select('ultra_document_id,issue_date,document_total,movement_type,partner_id,partner_name,seller_id,ultra_salesman_id,salesman_name,fiscal_document_items(product_name,product_total)').gte('issue_date', yearStart).lte('issue_date', range.end),
          supabaseAdmin.from('fiscal_documents').select('issue_date,document_total,movement_type').gte('issue_date', previousRange.start).lte('issue_date', previousRange.end),
          supabaseAdmin.from('goals').select('*').eq('ano', year).lte('mes', month),
          supabaseAdmin.from('management_open_order_portfolio').select('open_value'),
          supabaseAdmin.from('farms').select('id,state,ultra_partner_id,status'),
          supabaseAdmin.from('profiles').select('id,name,ultra_salesman_id'),
          supabaseAdmin.from('finance_dre_monthly').select('*').eq('ano', year).lte('mes', month).order('mes'),
          supabaseAdmin.from('finance_dre_accounts').select('*').eq('ano', year).lte('mes', month),
          supabaseAdmin.from('finance_balanco').select('*').lte('competencia_date', range.end).order('competencia_date', { ascending: false }).limit(1),
          supabaseAdmin.from('finance_managerial_monthly').select('*').eq('ano', year).lte('mes', month).order('mes'),
        ])
        const failure = [ordersRes, previousOrdersRes, docsRes, previousDocsRes, goalsRes, portfolioRes, farmsRes, profilesRes, dreRes, dreAccountsRes, balanceRes, managerialRes].find(result => result.error)
        if (failure?.error) throw failure.error

        const orders = ordersRes.data || []
        const previousOrders = previousOrdersRes.data || []
        const docs = docsRes.data || []
        const previousDocs = previousDocsRes.data || []
        const goals = goalsRes.data || []
        const farms = farmsRes.data || []
        const profiles = profilesRes.data || []
        const monthPrefix = monthKey(year, month)
        const monthOrdersRows = orders.filter(row => row.sale_date?.startsWith(monthPrefix) && hasNetOrderValue(row))
        const monthDocs = docs.filter(row => row.issue_date?.startsWith(monthPrefix))
        const monthOrders = monthOrdersRows.reduce((sum, row) => sum + netOrderValue(row), 0)
        const previousOrdersValue = previousOrders.filter(hasNetOrderValue).reduce((sum, row) => sum + netOrderValue(row), 0)
        const monthBilling = monthDocs.reduce((sum, row) => sum + fiscalDocumentValue(row), 0)
        const previousBilling = previousDocs.reduce((sum, row) => sum + fiscalDocumentValue(row), 0)
        const ytdOrders = orders.filter(hasNetOrderValue).reduce((sum, row) => sum + netOrderValue(row), 0)
        const ytdBilling = docs.reduce((sum, row) => sum + fiscalDocumentValue(row), 0)
        const ytdGoal = goals.reduce((sum, row) => sum + number(row.meta_fat), 0)
        const monthGoal = goals.filter(row => row.mes === month).reduce((sum, row) => sum + number(row.meta_fat), 0)
        const profileById = new Map(profiles.map(row => [row.id, row]))
        const profileByUltra = new Map(profiles.filter(row => row.ultra_salesman_id).map(row => [number(row.ultra_salesman_id), row]))
        const sellerMap = new Map()
        monthOrdersRows.forEach(row => {
          const key = row.seller_id || `ultra:${row.ultra_salesman_id || 0}`
          const profile = profileById.get(row.seller_id) || profileByUltra.get(number(row.ultra_salesman_id))
          const current = sellerMap.get(key) || { key, name: profile?.name || row.ultra_salesman_name || 'Sem vendedor', orders: 0, billing: 0, goal: 0 }
          current.orders += netOrderValue(row)
          sellerMap.set(key, current)
        })
        monthDocs.forEach(row => {
          const key = row.seller_id || `ultra:${row.ultra_salesman_id || 0}`
          const profile = profileById.get(row.seller_id) || profileByUltra.get(number(row.ultra_salesman_id))
          const current = sellerMap.get(key) || { key, name: profile?.name || row.salesman_name || 'Sem vendedor', orders: 0, billing: 0, goal: 0 }
          current.billing += fiscalDocumentValue(row)
          sellerMap.set(key, current)
        })
        goals.filter(row => row.mes === month).forEach(goal => {
          const key = goal.seller_id
          const current = sellerMap.get(key) || { key, name: profileById.get(key)?.name || 'Vendedor', orders: 0, billing: 0, goal: 0 }
          current.goal += number(goal.meta_fat)
          sellerMap.set(key, current)
        })
        const productMap = new Map()
        monthDocs.forEach(doc => (doc.fiscal_document_items || []).forEach(item => {
          const name = item.product_name || 'Produto não identificado'
          const sign = Math.sign(fiscalDocumentValue(doc))
          productMap.set(name, (productMap.get(name) || 0) + Math.abs(number(item.product_total)) * sign)
        }))
        const farmByPartner = new Map(farms.filter(row => row.ultra_partner_id).map(row => [number(row.ultra_partner_id), row]))
        const regionMap = new Map()
        monthDocs.forEach(doc => {
          const stateName = farmByPartner.get(number(doc.partner_id))?.state || 'Sem UF'
          regionMap.set(stateName, (regionMap.get(stateName) || 0) + fiscalDocumentValue(doc))
        })
        const commercialSeries = Array.from({ length: month }, (_, index) => {
          const key = monthKey(year, index + 1)
          return { label: MONTHS[index], Pedidos: orders.filter(row => row.sale_date?.startsWith(key) && hasNetOrderValue(row)).reduce((sum, row) => sum + netOrderValue(row), 0), Faturamento: docs.filter(row => row.issue_date?.startsWith(key)).reduce((sum, row) => sum + fiscalDocumentValue(row), 0) }
        })
        const commercial = {
          year, month, monthOrders, previousOrders: previousOrdersValue, monthBilling, previousBilling, ytdOrders, ytdGoal,
          ytdBilling, monthGoal, monthOrderCount: monthOrdersRows.length,
          averageTicket: monthOrdersRows.length ? monthOrders / monthOrdersRows.length : 0,
          billedClients: new Set(monthDocs.filter(row => fiscalDocumentValue(row) > 0).map(row => row.partner_id).filter(Boolean)).size,
          returns: Math.abs(monthDocs.filter(row => fiscalDocumentValue(row) < 0).reduce((sum, row) => sum + fiscalDocumentValue(row), 0)),
          openPortfolio: (portfolioRes.data || []).reduce((sum, row) => sum + number(row.open_value), 0),
          validOrders: orders.filter(hasNetOrderValue).length,
          activeClients: farms.filter(row => row.status === 'ativo').length,
          series: commercialSeries,
          sellers: [...sellerMap.values()].sort((a, b) => b.orders - a.orders),
          products: [...productMap.entries()].map(([name, value]) => ({ name, value })).filter(row => row.value > 0).sort((a, b) => b.value - a.value),
          regions: [...regionMap.entries()].map(([name, value]) => ({ name, value })).filter(row => row.value > 0).sort((a, b) => b.value - a.value),
        }

        const dreRows = dreRes.data || []
        const currentDre = dreRows.find(row => row.mes === month) || dreRows.at(-1) || {}
        const previousDre = dreRows.find(row => row.mes === month - 1) || {}
        const balance = (balanceRes.data || [])[0] || {}
        const accounts = dreAccountsRes.data || []
        const costMap = new Map()
        accounts.forEach(row => {
          if (!['custos_variaveis', 'custos_fixos'].includes(String(row.secao).toLowerCase())) return
          const name = row.grupo || row.conta || 'Outros'
          costMap.set(name, (costMap.get(name) || 0) + Math.abs(number(row.valor)))
        })
        const cpAdjusted = number(balance.contas_pagar_total) - number(balance.contas_pagar_aporte_a_devolver)
        const cpMediumAdjusted = number(balance.contas_pagar_a_vencer_medio) - number(balance.contas_pagar_aporte_a_devolver)
        const currentAssets = number(balance.disponibilidades) + number(balance.contas_receber_total) + number(balance.estoque)
        const currentLiabilities = number(balance.contas_pagar_vencido_curto) + number(balance.contas_pagar_vencido_medio) + number(balance.contas_pagar_a_vencer_curto) + cpMediumAdjusted
        const financialSeries = dreRows.map(row => ({ label: MONTHS[row.mes - 1], Receita: number(row.receitas), Resultado: number(row.resultado_liquido) }))
        const totalReceivable = number(balance.contas_receber_total)
        const totalPayable = Math.max(cpAdjusted, 0)
        const overdueReceivable = number(balance.contas_receber_vencido)
        const overduePayable = number(balance.contas_pagar_vencido_curto) + number(balance.contas_pagar_vencido_medio)
        const financial = {
          revenue: number(currentDre.receitas), previousRevenue: number(previousDre.receitas), result: number(currentDre.resultado_liquido),
          variableCosts: number(currentDre.custos_variaveis), contribution: number(currentDre.margem_contribuicao), fixedCosts: number(currentDre.custos_fixos), breakEven: number(currentDre.ponto_equilibrio),
          netMargin: number(currentDre.receitas) ? number(currentDre.resultado_liquido) / number(currentDre.receitas) * 100 : 0,
          contributionMargin: number(currentDre.receitas) ? number(currentDre.margem_contribuicao) / number(currentDre.receitas) * 100 : 0,
          breakEvenGap: number(currentDre.receitas) - number(currentDre.ponto_equilibrio),
          ytdRevenue: dreRows.reduce((sum, row) => sum + number(row.receitas), 0),
          ytdResult: dreRows.reduce((sum, row) => sum + number(row.resultado_liquido), 0),
          ytdCosts: dreRows.reduce((sum, row) => sum + Math.abs(number(row.custos_variaveis)) + Math.abs(number(row.custos_fixos)), 0),
          monthsAboveBreakEven: dreRows.filter(row => number(row.receitas) >= number(row.ponto_equilibrio)).length,
          series: financialSeries,
          costs: [...costMap.entries()].map(([name, value]) => ({ name, value })).sort((a, b) => b.value - a.value),
          balanceDate: balance.competencia_date,
          cash: number(balance.disponibilidades), workingCapital: currentAssets - currentLiabilities,
          currentRatio: currentLiabilities ? currentAssets / currentLiabilities : 0,
          debtRatio: number(balance.ativo_total) ? cpAdjusted / number(balance.ativo_total) * 100 : 0,
          totalReceivable, totalPayable, cashGap: totalReceivable - totalPayable,
          overdueGap: overdueReceivable - overduePayable,
          maturity: [
            { label: 'Vencido', 'A receber': number(balance.contas_receber_vencido), 'A pagar': number(balance.contas_pagar_vencido_curto) + number(balance.contas_pagar_vencido_medio) },
            { label: 'Até 90 dias', 'A receber': number(balance.contas_receber_a_vencer_curto), 'A pagar': number(balance.contas_pagar_a_vencer_curto) },
            { label: 'Até 360 dias', 'A receber': number(balance.contas_receber_a_vencer_medio), 'A pagar': Math.max(cpMediumAdjusted, 0) },
            { label: 'Longo prazo', 'A receber': 0, 'A pagar': number(balance.contas_pagar_a_vencer_longo) },
          ],
          managerial: managerialRes.data || [],
        }
        if (active) setState({ loading: false, error: '', commercial, financial })
      } catch (error) {
        console.error('Erro ao preparar apresentações:', error)
        if (active) setState({ loading: false, error: error.message || 'Não foi possível carregar os dados.', commercial: null, financial: null })
      }
    }
    load()
    return () => { active = false }
  }, [year, month])

  return state
}

export default function Fechamentos() {
  const now = new Date()
  const [year, setYear] = useState(now.getFullYear())
  const [month, setMonth] = useState(now.getMonth() + 1)
  const [type, setType] = useState(() => new URLSearchParams(window.location.search).get('type') === 'financeiro' ? 'financeiro' : 'comercial')
  const [activeSlide, setActiveSlide] = useState(0)
  const [exporting, setExporting] = useState('')
  const slideRefs = useRef([])
  const stageRef = useRef(null)
  const [slideScale, setSlideScale] = useState(1)
  const data = useClosingData(year, month)
  const period = `${MONTHS_FULL[month - 1][0].toUpperCase()}${MONTHS_FULL[month - 1].slice(1)} ${year}`
  const slides = useMemo(() => {
    if (!data.commercial || !data.financial) return []
    return type === 'comercial' ? CommercialSlides({ data: data.commercial, period }) : FinancialSlides({ data: data.financial, period })
  }, [data.commercial, data.financial, type, period])

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
      images.forEach((image, index) => { if (index) pdf.addPage([338.667, 190.5], 'landscape'); pdf.addImage(image, 'PNG', 0, 0, 338.667, 190.5, undefined, 'FAST') })
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

  return <div className="closing-shell">
    <Topbar title="Fechamento mensal" subtitle="Apresentações comerciais e financeiras geradas com dados do Gestão" />
    <main className="closing-page">
      <section className="closing-command">
        <div className="closing-type-switch"><button className={type === 'comercial' ? 'active' : ''} onClick={() => { setType('comercial'); setActiveSlide(0) }}>Comercial</button><button className={type === 'financeiro' ? 'active' : ''} onClick={() => { setType('financeiro'); setActiveSlide(0) }}>Financeira</button></div>
        <div className="closing-period"><select value={month} onChange={event => { setMonth(Number(event.target.value)); setActiveSlide(0) }}>{MONTHS_FULL.map((label, index) => <option key={label} value={index + 1}>{label[0].toUpperCase() + label.slice(1)}</option>)}</select><select value={year} onChange={event => { setYear(Number(event.target.value)); setActiveSlide(0) }}>{[year - 1, year, year + 1].map(value => <option key={value}>{value}</option>)}</select></div>
        <div className="closing-actions"><button className="btn btn-ghost" onClick={() => window.location.reload()}><IconRefresh size={17} /> Atualizar dados</button><button className="btn btn-ghost" disabled={data.loading || !!exporting} onClick={exportPDF}><IconFileTypePdf size={17} /> {exporting === 'pdf' ? 'Gerando…' : 'Baixar PDF'}</button><button className="btn btn-primary" disabled={data.loading || !!exporting} onClick={exportPPTX}><IconDownload size={17} /> {exporting === 'pptx' ? 'Gerando…' : 'Baixar PowerPoint'}</button></div>
      </section>
      {data.loading ? <div className="closing-state"><IconPresentation size={30} /><strong>Preparando o fechamento…</strong><span>Cruzando pedidos, faturamento, metas e dados financeiros.</span></div> : data.error ? <div className="closing-state error"><strong>Não foi possível montar a apresentação</strong><span>{data.error}</span></div> : <>
        <section className="closing-viewer"><div className="closing-stage" ref={stageRef}>{slides.map((slide, index) => <div key={index} className={`closing-slide-frame ${activeSlide === index ? 'active' : ''}`} style={{ transform: `scale(${slideScale})` }} ref={node => { slideRefs.current[index] = node }}>{slide}</div>)}</div><div className="closing-nav"><button disabled={!activeSlide} onClick={() => setActiveSlide(value => value - 1)}><IconArrowLeft size={18} /></button><span>{activeSlide + 1} de {slides.length}</span><button disabled={activeSlide === slides.length - 1} onClick={() => setActiveSlide(value => value + 1)}><IconArrowRight size={18} /></button></div></section>
        <section className="closing-filmstrip">{slides.map((slide, index) => <button key={index} className={activeSlide === index ? 'active' : ''} onClick={() => setActiveSlide(index)}><span>{slide}</span><b>{String(index + 1).padStart(2, '0')}</b></button>)}</section>
      </>}
    </main>
  </div>
}
