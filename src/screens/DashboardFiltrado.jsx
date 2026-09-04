import { useEffect, useMemo, useState } from 'react'
import { IconArrowDownRight, IconArrowRight, IconArrowUpRight, IconChartBar, IconChecklist, IconFileInvoice, IconPackage, IconReceipt, IconTargetArrow, IconTrendingUp, IconWallet } from '@tabler/icons-react'
import { Area, CartesianGrid, ComposedChart, Line, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'
import Topbar from '../components/Topbar'
import MultiSelectFilter from '../components/MultiSelectFilter'
import { supabaseAdmin } from '../lib/supabase'
import { fiscalDocumentValue, hasNetOrderValue, netOrderValue } from '../lib/commercialMetrics'
import { useVendedores } from '../lib/sellers'

const money = value => Number(value || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })
const shortMoney = value => {
  const number = Number(value || 0)
  if (Math.abs(number) >= 1000000) return `R$ ${(number / 1000000).toFixed(2)} mi`
  if (Math.abs(number) >= 1000) return `R$ ${(number / 1000).toFixed(0)} mil`
  return money(number)
}
const integer = value => Number(value || 0).toLocaleString('pt-BR', { maximumFractionDigits: 0 })
const iso = date => date.toISOString().slice(0, 10)

function rangeFor(year, type, index) {
  const sizes = { mes: 1, bimestre: 2, trimestre: 3, semestre: 6, ano: 12 }
  const size = sizes[type]
  const startMonth = type === 'ano' ? 0 : (index - 1) * size
  const start = new Date(year, startMonth, 1)
  const nominalEnd = new Date(year, startMonth + size, 0)
  const today = new Date()
  const end = today >= start && today <= nominalEnd ? today : nominalEnd
  const previousStart = new Date(year, startMonth - size, 1)
  const elapsedDays = Math.floor((end.getTime() - start.getTime()) / 86400000)
  const previousEnd = new Date(previousStart)
  previousEnd.setDate(previousEnd.getDate() + elapsedDays)
  return { start, end, previousStart, previousEnd, size }
}

function variation(current, previous) {
  if (!previous) return current ? 100 : 0
  return ((Number(current || 0) - Number(previous)) / Math.abs(Number(previous))) * 100
}

function Comparison({ current, previous }) {
  const value = variation(current, previous)
  const positive = value >= 0
  const Icon = positive ? IconArrowUpRight : IconArrowDownRight
  return <small className={positive ? 'macro-up' : 'macro-down'}><Icon size={13} />{value >= 0 ? '+' : ''}{value.toFixed(1)}% vs. anterior</small>
}

function Metric({ icon: Icon, label, value, note, current, previous, tone = '' }) {
  return <article className={`macro-metric ${tone}`}><Icon size={18} /><span>{label}</span><strong>{value}</strong>{previous !== undefined ? <Comparison current={current} previous={previous} /> : <small>{note}</small>}</article>
}

function normalizeName(value) {
  return String(value || '').toUpperCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^A-Z0-9]+/g, ' ').trim()
}

function saleItemValue(item) {
  const qty = Number(item?.quantity ?? item?.qty)
  const unit = Number(item?.unitPrice ?? item?.unit_price)
  if (Number.isFinite(qty) && Number.isFinite(unit) && qty !== 0 && unit !== 0) return Math.abs(qty * unit)
  const fallback = Number(item?.subtotal ?? item?.total ?? item?.value)
  return Number.isFinite(fallback) ? Math.abs(fallback) : 0
}

function fiscalItemValue(item) {
  const qty = Number(item?.quantity)
  const unit = Number(item?.unit_value)
  if (Number.isFinite(qty) && Number.isFinite(unit) && qty !== 0 && unit !== 0) return Math.abs(qty * unit)
  const fallback = Number(item?.product_total)
  return Number.isFinite(fallback) ? Math.abs(fallback) : 0
}

export default function DashboardFiltrado() {
  const now = new Date()
  const [year, setYear] = useState(now.getFullYear())
  const [type, setType] = useState('ano')
  const [index, setIndex] = useState(1)
  const [categoryIds, setCategoryIds] = useState([])
  const [applicationIds, setApplicationIds] = useState([])
  const [categories, setCategories] = useState([])
  const [applications, setApplications] = useState([])
  const [products, setProducts] = useState([])
  const [sales, setSales] = useState([])
  const [documents, setDocuments] = useState([])
  const [goals, setGoals] = useState([])
  const [portfolio, setPortfolio] = useState([])
  const [loading, setLoading] = useState(true)
  const { vendedoresById } = useVendedores()

  const range = useMemo(() => rangeFor(year, type, index), [year, type, index])
  const applicationFilter = applicationIds.length > 0 && applicationIds.length < applications.length
  const categoryFilter = categoryIds.length > 0 && categoryIds.length < categories.length
  const hasTaxonomyFilter = applicationFilter || categoryFilter

  const maps = useMemo(() => ({
    byId: new Map(products.map(p => [String(p.id), p])),
    byUltra: new Map(products.filter(p => p.ultra_codproduto != null).map(p => [Number(p.ultra_codproduto), p])),
    byName: new Map(products.map(p => [normalizeName(p.name), p])),
  }), [products])

  function productFromItem(item) {
    const canonical = item?.canonicalProductId || item?.canonical_product_id
    if (canonical && maps.byId.has(String(canonical))) return maps.byId.get(String(canonical))
    const explicitUltra = Number(item?.ultra_codproduto)
    if (Number.isFinite(explicitUltra) && maps.byUltra.has(explicitUltra)) return maps.byUltra.get(explicitUltra)
    const code = String(item?.product_code || item?.productCode || item?.productId || '')
    const first = Number(code.split('/')[0].replace(/\D/g, ''))
    if (Number.isFinite(first) && maps.byUltra.has(first)) return maps.byUltra.get(first)
    const name = normalizeName(item?.product_name || item?.productName || item?.name)
    if (name && maps.byName.has(name)) return maps.byName.get(name)
    if (name) {
      for (const [key, product] of maps.byName) {
        if (name.startsWith(key) || key.startsWith(name)) return product
      }
    }
    return null
  }

  function productMatches(product) {
    if (!hasTaxonomyFilter) return true
    if (!product) return false
    if (applicationFilter && !applicationIds.includes(product.application_id)) return false
    if (categoryFilter && !categoryIds.includes(product.category_id)) return false
    return true
  }

  function filterItems(items, valueFn) {
    const rows = Array.isArray(items) ? items : []
    if (!hasTaxonomyFilter) return { matched: true, ratio: 1, quantity: rows.reduce((sum, item) => sum + Number(item.quantity || item.qty || 0), 0) }
    let all = 0
    let selected = 0
    let quantity = 0
    for (const item of rows) {
      const value = valueFn(item)
      all += value
      if (productMatches(productFromItem(item))) {
        selected += value
        quantity += Number(item.quantity || item.qty || 0)
      }
    }
    if (selected <= 0) return { matched: false, ratio: 0, quantity: 0 }
    return { matched: true, ratio: all > 0 ? Math.min(selected / all, 1) : 1, quantity }
  }

  useEffect(() => {
    async function load() {
      setLoading(true)
      const [salesResult, docsResult, goalsResult, portfolioResult, productsResult, categoriesResult, applicationsResult] = await Promise.all([
        supabaseAdmin.from('management_order_overview').select('id,sale_date,order_value,order_stage,fiscal_returned_value,seller_id,ultra_salesman_id,ultra_salesman_name,quantity_ordered').gte('sale_date', iso(range.previousStart)).lte('sale_date', iso(range.end)),
        supabaseAdmin.from('fiscal_documents').select('issue_date,document_total,movement_type,seller_id,ultra_salesman_id,salesman_name,fiscal_document_items(product_code,product_name,quantity,unit_value,product_total)').gte('issue_date', iso(range.previousStart)).lte('issue_date', iso(range.end)),
        supabaseAdmin.from('goals').select('ano,mes,meta_fat,seller_id').gte('ano', range.previousStart.getFullYear()).lte('ano', range.end.getFullYear()),
        supabaseAdmin.from('management_open_order_portfolio').select('id,open_value,quantity_open'),
        supabaseAdmin.from('products').select('id,name,ultra_codproduto,category_id,application_id').eq('active', true),
        supabaseAdmin.from('product_categories').select('id,name,sort_order').eq('active', true).order('sort_order'),
        supabaseAdmin.from('product_applications').select('id,name,sort_order').eq('active', true).order('sort_order'),
      ])
      const productList = productsResult.data || []
      setProducts(productList)
      setCategories(categoriesResult.data || [])
      setApplications(applicationsResult.data || [])

      const rawSales = salesResult.data || []
      const rawPortfolio = portfolioResult.data || []
      const ids = [...new Set([...rawSales, ...rawPortfolio].map(row => row.id).filter(Boolean))]
      let salesItems = new Map()
      if (ids.length) {
        const result = await supabaseAdmin.from('sales').select('id,items').in('id', ids)
        if (!result.error) salesItems = new Map((result.data || []).map(row => [String(row.id), Array.isArray(row.items) ? row.items : []]))
      }

      const localMaps = {
        byId: new Map(productList.map(p => [String(p.id), p])),
        byUltra: new Map(productList.filter(p => p.ultra_codproduto != null).map(p => [Number(p.ultra_codproduto), p])),
        byName: new Map(productList.map(p => [normalizeName(p.name), p])),
      }
      const localProduct = item => {
        const canonical = item?.canonicalProductId || item?.canonical_product_id
        if (canonical && localMaps.byId.has(String(canonical))) return localMaps.byId.get(String(canonical))
        const explicitUltra = Number(item?.ultra_codproduto)
        if (Number.isFinite(explicitUltra) && localMaps.byUltra.has(explicitUltra)) return localMaps.byUltra.get(explicitUltra)
        const code = String(item?.product_code || item?.productCode || item?.productId || '')
        const first = Number(code.split('/')[0].replace(/\D/g, ''))
        if (Number.isFinite(first) && localMaps.byUltra.has(first)) return localMaps.byUltra.get(first)
        const name = normalizeName(item?.product_name || item?.productName || item?.name)
        if (name && localMaps.byName.has(name)) return localMaps.byName.get(name)
        if (name) for (const [key, product] of localMaps.byName) if (name.startsWith(key) || key.startsWith(name)) return product
        return null
      }
      const localMatches = product => {
        const appActive = applicationIds.length > 0 && applicationIds.length < (applicationsResult.data || []).length
        const catActive = categoryIds.length > 0 && categoryIds.length < (categoriesResult.data || []).length
        if (!appActive && !catActive) return true
        if (!product) return false
        if (appActive && !applicationIds.includes(product.application_id)) return false
        if (catActive && !categoryIds.includes(product.category_id)) return false
        return true
      }
      const localFilter = (items, valueFn) => {
        const rows = Array.isArray(items) ? items : []
        const active = (applicationIds.length > 0 && applicationIds.length < (applicationsResult.data || []).length) || (categoryIds.length > 0 && categoryIds.length < (categoriesResult.data || []).length)
        if (!active) return { matched: true, ratio: 1, quantity: rows.reduce((sum, item) => sum + Number(item.quantity || item.qty || 0), 0) }
        let all = 0, selected = 0, quantity = 0
        rows.forEach(item => {
          const value = valueFn(item)
          all += value
          if (localMatches(localProduct(item))) {
            selected += value
            quantity += Number(item.quantity || item.qty || 0)
          }
        })
        if (selected <= 0) return { matched: false, ratio: 0, quantity: 0 }
        return { matched: true, ratio: all > 0 ? Math.min(selected / all, 1) : 1, quantity }
      }

      const filteredSales = rawSales.flatMap(row => {
        const f = localFilter(salesItems.get(String(row.id)) || [], saleItemValue)
        if (!f.matched) return []
        if (f.ratio === 1) return [row]
        return [{ ...row, order_value: Number(row.order_value || 0) * f.ratio, fiscal_returned_value: Number(row.fiscal_returned_value || 0) * f.ratio, quantity_ordered: Number(row.quantity_ordered || 0) * f.ratio }]
      })
      const filteredDocs = (docsResult.data || []).flatMap(row => {
        const f = localFilter(row.fiscal_document_items || [], fiscalItemValue)
        if (!f.matched) return []
        if (f.ratio === 1) return [{ ...row, _filteredQuantity: (row.fiscal_document_items || []).reduce((sum, item) => sum + Number(item.quantity || 0), 0) }]
        return [{ ...row, document_total: Number(row.document_total || 0) * f.ratio, _filteredQuantity: f.quantity }]
      })
      const filteredPortfolio = rawPortfolio.flatMap(row => {
        const f = localFilter(salesItems.get(String(row.id)) || [], saleItemValue)
        if (!f.matched) return []
        if (f.ratio === 1) return [row]
        return [{ ...row, open_value: Number(row.open_value || 0) * f.ratio, quantity_open: Number(row.quantity_open || 0) * f.ratio }]
      })

      setSales(filteredSales)
      setDocuments(filteredDocs)
      setGoals(hasTaxonomyFilter ? [] : (goalsResult.data || []))
      setPortfolio(filteredPortfolio)
      setLoading(false)
    }
    load()
  }, [range, categoryIds.join('|'), applicationIds.join('|')])

  const data = useMemo(() => {
    const between = (value, start, end) => value >= iso(start) && value <= iso(end)
    const currentSales = sales.filter(row => between(row.sale_date, range.start, range.end) && hasNetOrderValue(row))
    const previousSales = sales.filter(row => between(row.sale_date, range.previousStart, range.previousEnd) && hasNetOrderValue(row))
    const currentDocs = documents.filter(row => between(row.issue_date, range.start, range.end))
    const previousDocs = documents.filter(row => between(row.issue_date, range.previousStart, range.previousEnd))
    const currentGoals = goals.filter(goal => between(`${goal.ano}-${String(goal.mes).padStart(2, '0')}-01`, range.start, range.end))
    const previousGoals = goals.filter(goal => between(`${goal.ano}-${String(goal.mes).padStart(2, '0')}-01`, range.previousStart, range.previousEnd))
    const orderValue = currentSales.reduce((sum, row) => sum + netOrderValue(row), 0)
    const previousOrderValue = previousSales.reduce((sum, row) => sum + netOrderValue(row), 0)
    const billing = currentDocs.reduce((sum, row) => sum + fiscalDocumentValue(row), 0)
    const previousBilling = previousDocs.reduce((sum, row) => sum + fiscalDocumentValue(row), 0)
    const goal = currentGoals.reduce((sum, row) => sum + Number(row.meta_fat || 0), 0)
    const previousGoal = previousGoals.reduce((sum, row) => sum + Number(row.meta_fat || 0), 0)
    const quantity = currentDocs.reduce((sum, doc) => sum + Number(doc._filteredQuantity || 0) * Math.sign(fiscalDocumentValue(doc)), 0)
    const previousQuantity = previousDocs.reduce((sum, doc) => sum + Number(doc._filteredQuantity || 0) * Math.sign(fiscalDocumentValue(doc)), 0)
    const series = []
    for (let cursor = new Date(range.start); cursor <= range.end; cursor.setMonth(cursor.getMonth() + 1)) {
      const key = `${cursor.getFullYear()}-${String(cursor.getMonth() + 1).padStart(2, '0')}`
      series.push({ key, label: cursor.toLocaleDateString('pt-BR', { month: 'short', year: range.size === 12 ? '2-digit' : undefined }).replace('.', ''), Pedidos: currentSales.filter(row => row.sale_date?.startsWith(key)).reduce((sum, row) => sum + netOrderValue(row), 0), Faturamento: currentDocs.filter(row => row.issue_date?.startsWith(key)).reduce((sum, row) => sum + fiscalDocumentValue(row), 0), Meta: currentGoals.filter(row => row.ano === cursor.getFullYear() && row.mes === cursor.getMonth() + 1).reduce((sum, row) => sum + Number(row.meta_fat || 0), 0) })
    }
    const sellerMap = new Map()
    currentDocs.forEach(doc => {
      const key = doc.seller_id || `ultra:${doc.ultra_salesman_id || 0}`
      const canonico = vendedoresById.get(Number(doc.ultra_salesman_id))
      const current = sellerMap.get(key) || { name: canonico?.name || 'Sem vendedor', total: 0 }
      current.total += fiscalDocumentValue(doc)
      sellerMap.set(key, current)
    })
    const topSellers = [...sellerMap.values()].sort((a, b) => b.total - a.total).slice(0, 6)
    const openValue = portfolio.reduce((sum, row) => sum + Number(row.open_value || 0), 0)
    const ticket = currentSales.length ? orderValue / currentSales.length : 0
    const previousTicket = previousSales.length ? previousOrderValue / previousSales.length : 0
    const billingRate = orderValue ? billing / orderValue * 100 : 0
    const previousBillingRate = previousOrderValue ? previousBilling / previousOrderValue * 100 : 0
    return { orderValue, previousOrderValue, billing, previousBilling, goal, previousGoal, quantity, previousQuantity, orders: currentSales.length, previousOrders: previousSales.length, attainment: goal ? billing / goal * 100 : 0, salesAttainment: goal ? orderValue / goal * 100 : 0, invoices: currentDocs.length, previousInvoices: previousDocs.length, ticket, previousTicket, averageInvoice: currentDocs.length ? billing / currentDocs.length : 0, series, topSellers, openValue, billingRate, previousBillingRate, goalGap: goal ? Math.max(0, goal - orderValue) : 0, sellerCount: sellerMap.size }
  }, [sales, documents, goals, portfolio, range, vendedoresById])

  const counts = { ano: 1, semestre: 2, trimestre: 4, bimestre: 6, mes: 12 }
  const labels = { ano: 'Ano completo', semestre: 'Semestre', trimestre: 'Trimestre', bimestre: 'Bimestre', mes: 'Mês' }
  const years = Array.from({ length: 5 }, (_, offset) => now.getFullYear() - offset)
  const maxSeller = Math.max(...data.topSellers.map(item => item.total), 1)

  return <div style={{ flex: 1, overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>
    <Topbar title="Dashboard" subtitle="Visão macro de vendas, faturamento e metas" />
    <div className="page macro-page" style={{ overflowY: 'auto' }}>
      <section className="macro-toolbar" style={{ alignItems: 'flex-end', gap: 12, flexWrap: 'wrap' }}>
        <div style={{ display: 'flex', gap: 8, alignItems: 'flex-end', flexWrap: 'wrap' }}>
          <select value={year} onChange={event => setYear(Number(event.target.value))}>{years.map(value => <option key={value}>{value}</option>)}</select>
          <select value={type} onChange={event => { setType(event.target.value); setIndex(1) }}><option value="ano">Ano</option><option value="semestre">Semestre</option><option value="trimestre">Trimestre</option><option value="bimestre">Bimestre</option><option value="mes">Mês</option></select>
          {type !== 'ano' && <select value={index} onChange={event => setIndex(Number(event.target.value))}>{Array.from({ length: counts[type] }, (_, value) => <option value={value + 1} key={value + 1}>{value + 1}º {labels[type].toLowerCase()}</option>)}</select>}
        </div>
        <span>{iso(range.start).split('-').reverse().join('/')} — {iso(range.end).split('-').reverse().join('/')}</span>
      </section>
      {hasTaxonomyFilter && <div style={{ margin: '0 0 14px', fontSize: 12, color: 'var(--text-dim)' }}>Aplicação e categoria filtram os valores no nível dos itens. A meta permanece oculta porque hoje é cadastrada apenas como meta geral.</div>}
      {loading ? <div className="empty">Preparando visão executiva...</div> : <>
        <section className="macro-hero"><header><span>Visão executiva do período</span><h2>Do pedido ao faturamento</h2><p>Acompanhe o valor vendido, o que já virou receita e a distância para a meta.</p></header><div className="macro-hero-flow"><div><span>Vendas geradas</span><strong>{shortMoney(data.orderValue)}</strong><Comparison current={data.orderValue} previous={data.previousOrderValue} /></div><IconArrowRight size={19} /><div><span>Faturamento líquido</span><strong>{shortMoney(data.billing)}</strong><Comparison current={data.billing} previous={data.previousBilling} /></div><IconArrowRight size={19} /><div><span>Atingimento da meta</span><strong>{data.goal ? `${data.salesAttainment.toFixed(1)}%` : '—'}</strong><small>{hasTaxonomyFilter ? 'Meta geral não comparada ao filtro' : data.goal ? `${shortMoney(data.goalGap)} em vendas para a meta` : 'Meta não cadastrada'}</small></div></div></section>
        <div className="macro-section-title"><div><span>Resultado financeiro</span><h3>O tamanho do negócio no período</h3></div><small>comparações usam o período anterior equivalente</small></div>
        <section className="macro-metrics macro-metrics-primary"><Metric icon={IconReceipt} label="Vendas geradas" value={shortMoney(data.orderValue)} current={data.orderValue} previous={data.previousOrderValue} tone="featured" /><Metric icon={IconTargetArrow} label="Meta acumulada" value={data.goal ? shortMoney(data.goal) : '—'} note={hasTaxonomyFilter ? 'meta geral não rateada' : data.goal ? `${data.salesAttainment.toFixed(1)}% vendido` : 'meta ainda não cadastrada'} tone="goal" /><Metric icon={IconWallet} label="Saldo para a meta" value={data.goal ? shortMoney(data.goalGap) : '—'} note={hasTaxonomyFilter ? 'indisponível com filtro de produto' : data.goal ? (data.goalGap ? 'vendas necessárias' : 'meta de vendas superada') : 'depende da meta cadastrada'} tone={data.goalGap ? 'attention' : 'goal'} /><Metric icon={IconPackage} label="Carteira em aberto" value={shortMoney(data.openValue)} note="posição atual a faturar" tone="portfolio" /></section>
        <div className="macro-section-title macro-section-title-compact"><div><span>Eficiência comercial</span><h3>Como o resultado está sendo construído</h3></div></div>
        <section className="macro-metrics macro-metrics-operational"><Metric icon={IconChartBar} label="Pedidos gerados" value={integer(data.orders)} current={data.orders} previous={data.previousOrders} /><Metric icon={IconFileInvoice} label="Notas emitidas" value={integer(data.invoices)} current={data.invoices} previous={data.previousInvoices} /><Metric icon={IconChecklist} label="Taxa de faturamento" value={`${data.billingRate.toFixed(1)}%`} current={data.billingRate} previous={data.previousBillingRate} /><Metric icon={IconTrendingUp} label="Ticket por pedido" value={shortMoney(data.ticket)} current={data.ticket} previous={data.previousTicket} /><Metric icon={IconReceipt} label="Média por nota" value={shortMoney(data.averageInvoice)} note="valor médio faturado" /><Metric icon={IconPackage} label="Volume faturado" value={integer(data.quantity)} current={data.quantity} previous={data.previousQuantity} /></section>
        <section className="macro-chart"><div className="macro-card-head"><div><span>Ritmo comercial</span><h3>Pedidos, faturamento e meta</h3></div><div className="chart-meta"><small>{data.billingRate.toFixed(1)}% do valor vendido já faturado</small><div className="chart-legend"><i className="billing" />Faturamento<i className="orders" />Pedidos{!hasTaxonomyFilter && <><i className="goal" />Meta</>}</div></div></div><ResponsiveContainer width="100%" height={390}><ComposedChart data={data.series} margin={{ top: 22, right: 24, left: 8, bottom: 4 }}><defs><linearGradient id="billingArea" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor="#E87722" stopOpacity={0.22} /><stop offset="90%" stopColor="#E87722" stopOpacity={0.015} /></linearGradient></defs><CartesianGrid stroke="#E9E4DE" strokeDasharray="2 7" vertical={false} /><XAxis dataKey="label" tickLine={false} axisLine={false} /><YAxis tickLine={false} axisLine={false} tickFormatter={value => `R$ ${Math.round(value / 1000)}k`} width={68} /><Tooltip cursor={{ stroke: '#D8D0C8', strokeDasharray: '3 5' }} formatter={(value, name) => [money(value), name]} /><Area type="monotone" dataKey="Faturamento" stroke="#E87722" fill="url(#billingArea)" strokeWidth={3.5} dot={false} activeDot={{ r: 5, fill: '#E87722', stroke: '#fff', strokeWidth: 3 }} /><Line type="monotone" dataKey="Pedidos" stroke="#292623" strokeWidth={2.8} dot={false} activeDot={{ r: 5, fill: '#292623', stroke: '#fff', strokeWidth: 3 }} />{!hasTaxonomyFilter && <Line type="monotone" dataKey="Meta" stroke="#A79C92" strokeWidth={2} strokeDasharray="5 7" dot={false} activeDot={{ r: 4, fill: '#A79C92', stroke: '#fff', strokeWidth: 2 }} />}</ComposedChart></ResponsiveContainer></section>
        <section className="macro-bottom"><div className="macro-ranking"><div className="macro-card-head"><div><span>Contribuição</span><h3>Faturamento por vendedor</h3></div><small>{data.sellerCount} vendedor(es) com faturamento</small></div>{data.topSellers.map((seller, position) => <div key={seller.name}><b>{position + 1}</b><span><strong>{seller.name}</strong><i><em style={{ width: `${Math.max(5, seller.total / maxSeller * 100)}%` }} /></i></span><strong>{shortMoney(seller.total)}</strong></div>)}</div><div className="macro-reading"><span>Leitura do período</span><h3>{hasTaxonomyFilter ? 'Visão segmentada' : data.attainment >= 100 ? 'Meta superada' : data.goal ? 'Meta ainda em construção' : 'Planejamento pendente'}</h3><p>{hasTaxonomyFilter ? `O painel está mostrando somente os produtos das aplicações e categorias selecionadas. ${data.billingRate.toFixed(1)}% do valor dos pedidos filtrados já foi faturado.` : data.goal ? `O faturamento representa ${data.attainment.toFixed(1)}% da meta e ${data.billingRate.toFixed(1)}% do valor dos pedidos gerados no período.` : 'Cadastre as metas mensais para comparar execução, ritmo e saldo acumulado.'}</p></div></section>
      </>}
    </div>
  </div>
}
