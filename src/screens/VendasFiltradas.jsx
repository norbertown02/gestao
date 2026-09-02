import { Fragment, useEffect, useMemo, useState } from 'react'
import {
  IconArrowDownRight,
  IconArrowUpRight,
  IconCalendar,
  IconCash,
  IconChevronDown,
  IconChevronUp,
  IconDownload,
  IconFileInvoice,
  IconPackage,
  IconRefresh,
  IconRotateClockwise,
  IconShoppingCart,
} from '@tabler/icons-react'
import { supabase } from '../lib/supabase'
import Topbar from '../components/Topbar'
import MultiSelectFilter from '../components/MultiSelectFilter'
import { fiscalDocumentValue, grossOrderValue, hasNetOrderValue, netOrderValue, orderBaseValue } from '../lib/commercialMetrics'
import { useVendedores } from '../lib/sellers'
import { Area, CartesianGrid, ComposedChart, Line, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'

const money = value => Number(value || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })
const integer = value => Number(value || 0).toLocaleString('pt-BR')
const dateBR = value => value ? new Date(`${value}T12:00:00`).toLocaleDateString('pt-BR') : '—'

const currentMonth = () => {
  const now = new Date()
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`
}

function monthRange(month) {
  const [year, value] = month.split('-').map(Number)
  const start = `${year}-${String(value).padStart(2, '0')}-01`
  const end = new Date(year, value, 0).toISOString().slice(0, 10)
  return [start, end]
}

const stageLabel = {
  em_aberto: 'Em aberto',
  faturado: 'Faturado',
  estornado: 'Estornado',
  cancelado: 'Cancelado',
  cancelado_apos_faturamento: 'Cancelado após faturamento',
  sem_faturamento: 'Sem faturamento',
}

function parseItems(items) {
  if (Array.isArray(items)) return items
  if (typeof items === 'string') {
    try {
      const parsed = JSON.parse(items)
      return Array.isArray(parsed) ? parsed : []
    } catch { return [] }
  }
  return []
}

function saleItemValue(item) {
  const direct = Number(item?.subtotal ?? item?.total ?? item?.value)
  if (Number.isFinite(direct) && direct !== 0) return Math.abs(direct)
  return Math.abs(Number(item?.quantity || item?.qty || 0) * Number(item?.unitPrice || item?.unit_price || 0))
}

function fiscalItemValue(item) {
  const direct = Number(item?.product_total)
  if (Number.isFinite(direct) && direct !== 0) return Math.abs(direct)
  return Math.abs(Number(item?.quantity || 0) * Number(item?.unit_value || 0))
}

function Metric({ icon: Icon, label, value, note, tone = 'ink' }) {
  return (
    <article className={`commerce-metric ${tone}`}>
      <div className="commerce-metric-icon"><Icon size={19} /></div>
      <span>{label}</span>
      <strong>{value}</strong>
      <small>{note}</small>
    </article>
  )
}

function Empty({ children }) { return <div className="commerce-empty">{children}</div> }

export default function VendasFiltradas() {
  const [month, setMonth] = useState(currentMonth)
  const [seller, setSeller] = useState('todos')
  const [categoryIds, setCategoryIds] = useState([])
  const [applicationIds, setApplicationIds] = useState([])
  const [categories, setCategories] = useState([])
  const [applications, setApplications] = useState([])
  const [products, setProducts] = useState([])
  const [orders, setOrders] = useState([])
  const [documents, setDocuments] = useState([])
  const [portfolio, setPortfolio] = useState([])
  const [goals, setGoals] = useState([])
  const [orderItems, setOrderItems] = useState({})
  const [expandedOrder, setExpandedOrder] = useState(null)
  const [tableView, setTableView] = useState('pedidos')
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  const hasTaxonomyFilter = categoryIds.length > 0 || applicationIds.length > 0

  function productMaps(list) {
    return {
      byId: new Map(list.map(p => [String(p.id), p])),
      byUltra: new Map(list.filter(p => p.ultra_codproduto != null).map(p => [Number(p.ultra_codproduto), p])),
    }
  }

  function productFromItem(item, maps) {
    const canonical = item?.canonicalProductId || item?.canonical_product_id
    if (canonical && maps.byId.has(String(canonical))) return maps.byId.get(String(canonical))
    const explicitUltra = Number(item?.ultra_codproduto)
    if (Number.isFinite(explicitUltra) && maps.byUltra.has(explicitUltra)) return maps.byUltra.get(explicitUltra)
    const code = String(item?.product_code || item?.productCode || item?.productId || '')
    const first = Number(code.split('/')[0].replace(/\D/g, ''))
    if (Number.isFinite(first) && maps.byUltra.has(first)) return maps.byUltra.get(first)
    return null
  }

  function productMatches(product) {
    if (!hasTaxonomyFilter) return true
    if (!product) return false
    if (applicationIds.length && !applicationIds.includes(product.application_id)) return false
    if (categoryIds.length && !categoryIds.includes(product.category_id)) return false
    return true
  }

  function ratioFromItems(items, maps, valueFn) {
    if (!hasTaxonomyFilter) return { matched: true, ratio: 1 }
    const rows = parseItems(items)
    let all = 0
    let selected = 0
    rows.forEach(item => {
      const value = valueFn(item)
      all += value
      if (productMatches(productFromItem(item, maps))) selected += value
    })
    if (selected <= 0) return { matched: false, ratio: 0 }
    if (all <= 0) return { matched: true, ratio: 1 }
    return { matched: true, ratio: Math.min(selected / all, 1) }
  }

  async function load() {
    setLoading(true)
    setError('')
    const [start, end] = monthRange(month)

    let ordersQuery = supabase.from('management_order_overview').select('*').gte('sale_date', start).lte('sale_date', end).order('sale_date', { ascending: false })
    let fiscalQuery = supabase
      .from('fiscal_documents')
      .select('ultra_document_id,invoice_number,issue_date,partner_name,seller_id,ultra_salesman_id,salesman_name,operation_nature,movement_type,document_total,fiscal_document_items(product_code,product_name,quantity,unit,unit_value,product_total),sales_fiscal_links(sale_id,link_type,confidence,link_method,sales(ultra_order_id,ultra_order_number))')
      .gte('issue_date', start).lte('issue_date', end).order('issue_date', { ascending: false })
    let portfolioQuery = supabase.from('management_open_order_portfolio').select('*').order('sale_date', { ascending: true })

    if (seller !== 'todos') {
      const isUltraSeller = seller.startsWith('ultra:')
      const field = isUltraSeller ? 'ultra_salesman_id' : 'seller_id'
      const value = isUltraSeller ? Number(seller.slice(6)) : seller
      ordersQuery = ordersQuery.eq(field, value)
      fiscalQuery = fiscalQuery.eq(field, value)
      portfolioQuery = portfolioQuery.eq(field, value)
    }

    let goalsQuery = supabase.from('goals').select('meta_fat,seller_id,ultra_salesman_id').eq('ano', Number(month.slice(0,4))).eq('mes', Number(month.slice(5,7)))
    if (seller !== 'todos') {
      const isUltraSeller = seller.startsWith('ultra:')
      goalsQuery = goalsQuery.eq(isUltraSeller ? 'ultra_salesman_id' : 'seller_id', isUltraSeller ? Number(seller.slice(6)) : seller)
    }

    const [ordersResult, fiscalResult, portfolioResult, goalsResult, productsResult, categoriesResult, applicationsResult] = await Promise.all([
      ordersQuery,
      fiscalQuery,
      portfolioQuery,
      goalsQuery,
      supabase.from('products').select('id,name,ultra_codproduto,category_id,application_id').eq('active', true),
      supabase.from('product_categories').select('id,name,sort_order').eq('active', true).order('sort_order'),
      supabase.from('product_applications').select('id,name,sort_order').eq('active', true).order('sort_order'),
    ])

    const failure = ordersResult.error || fiscalResult.error || portfolioResult.error || goalsResult.error || productsResult.error || categoriesResult.error || applicationsResult.error
    if (failure) {
      console.error('Falha ao carregar gestão comercial:', failure)
      setError('Não foi possível atualizar os indicadores. Tente novamente.')
      setOrders([]); setDocuments([]); setPortfolio([]); setGoals([]); setOrderItems({})
      setLoading(false)
      return
    }

    const productList = productsResult.data || []
    setProducts(productList)
    setCategories(categoriesResult.data || [])
    setApplications(applicationsResult.data || [])
    const maps = productMaps(productList)
    const rawOrders = ordersResult.data || []
    const rawPortfolio = portfolioResult.data || []
    const ids = [...new Set([...rawOrders, ...rawPortfolio].map(row => row.id).filter(Boolean))]

    let salesById = new Map()
    if (ids.length) {
      const salesResult = await supabase.from('sales').select('id,items,total').in('id', ids)
      if (!salesResult.error) salesById = new Map((salesResult.data || []).map(row => [String(row.id), row]))
    }

    const filteredOrders = rawOrders.flatMap(row => {
      const sale = salesById.get(String(row.id))
      const filter = ratioFromItems(sale?.items || [], maps, saleItemValue)
      if (!filter.matched) return []
      if (!hasTaxonomyFilter) return [row]
      const ratio = filter.ratio
      return [{
        ...row,
        order_net_value: orderBaseValue(row) * ratio,
        order_value: grossOrderValue(row) * ratio,
        fiscal_returned_value: Number(row.fiscal_returned_value || 0) * ratio,
        fiscal_billed_value: Number(row.fiscal_billed_value || 0) * ratio,
        open_value: Number(row.open_value || 0) * ratio,
        _taxonomyRatio: ratio,
      }]
    })

    const filteredPortfolio = rawPortfolio.flatMap(row => {
      const sale = salesById.get(String(row.id))
      const filter = ratioFromItems(sale?.items || [], maps, saleItemValue)
      if (!filter.matched) return []
      if (!hasTaxonomyFilter) return [row]
      return [{ ...row, open_value: Number(row.open_value || 0) * filter.ratio, quantity_open: Number(row.quantity_open || 0) * filter.ratio, _taxonomyRatio: filter.ratio }]
    })

    const filteredDocuments = (fiscalResult.data || []).flatMap(row => {
      const filter = ratioFromItems(row.fiscal_document_items || [], maps, fiscalItemValue)
      if (!filter.matched) return []
      if (!hasTaxonomyFilter) return [row]
      return [{ ...row, document_total: Number(row.document_total || 0) * filter.ratio, _taxonomyRatio: filter.ratio }]
    })

    setOrders(filteredOrders)
    setDocuments(filteredDocuments)
    setPortfolio(filteredPortfolio)
    setGoals(hasTaxonomyFilter ? [] : (goalsResult.data || []))

    const orderIds = filteredOrders.map(row => row.id).filter(Boolean)
    if (orderIds.length) {
      const linksResult = await supabase
        .from('sales_fiscal_links')
        .select('sale_id,link_type,fiscal_documents(fiscal_document_items(product_code,product_name,quantity,unit,unit_value,product_total))')
        .in('sale_id', orderIds)
        .eq('link_type', 'faturamento')
      const mapped = {}
      ;(linksResult.data || []).forEach(link => {
        const items = (link.fiscal_documents?.fiscal_document_items || []).filter(item => productMatches(productFromItem(item, maps)))
        mapped[link.sale_id] = [...(mapped[link.sale_id] || []), ...items]
      })
      setOrderItems(mapped)
    } else setOrderItems({})

    setLoading(false)
  }

  useEffect(() => { load() }, [month, seller, categoryIds.join('|'), applicationIds.join('|')])

  const { vendedores } = useVendedores()
  const sellers = useMemo(() => vendedores.map(v => [`ultra:${v.id}`, v.name]).sort((a, b) => a[1].localeCompare(b[1])), [vendedores])

  const summary = useMemo(() => {
    const validOrders = orders.filter(hasNetOrderValue)
    const generated = validOrders.reduce((sum, row) => sum + netOrderValue(row), 0)
    const reversedOrders = orders.filter(row => row.order_stage === 'estornado')
    const salesDocs = documents.filter(row => row.movement_type === 'venda')
    const returnDocs = documents.filter(row => row.movement_type === 'devolucao')
    const grossBilling = salesDocs.reduce((sum, row) => sum + Number(row.document_total || 0), 0)
    const returns = returnDocs.reduce((sum, row) => sum + Math.abs(Number(row.document_total || 0)), 0)
    const openValue = portfolio.reduce((sum, row) => sum + Number(row.open_value || 0), 0)
    const goal = goals.reduce((sum,row)=>sum+Number(row.meta_fat||0),0)
    const [selectedYear,selectedMonth]=month.split('-').map(Number)
    const today=new Date(); const daysInMonth=new Date(selectedYear,selectedMonth,0).getDate()
    const isCurrent=selectedYear===today.getFullYear()&&selectedMonth===today.getMonth()+1
    const isFuture=new Date(selectedYear,selectedMonth-1,1)>new Date(today.getFullYear(),today.getMonth(),1)
    const elapsedDays=isCurrent?Math.max(today.getDate(),1):isFuture?0:daysInMonth
    const remainingDays=isCurrent?Math.max(daysInMonth-today.getDate(),0):isFuture?daysInMonth:0
    const dailyPace=elapsedDays?generated/elapsedDays:0
    const projected=isCurrent?dailyPace*daysInMonth:isFuture?0:generated
    const requiredPace=remainingDays?Math.max(goal-generated,0)/remainingDays:0
    return {
      generated, valid: generated, validOrderCount: validOrders.length,
      reversedCount: reversedOrders.length,
      reversedValue: reversedOrders.reduce((sum, row) => sum + orderBaseValue(row), 0),
      invoices: salesDocs.length, grossBilling, returns, netBilling: grossBilling - returns,
      openValue, goal, dailyPace, projected, requiredPace, remainingDays, isCurrent,
    }
  }, [orders, documents, portfolio, goals, month])

  const dailySeries = useMemo(() => {
    const [, end] = monthRange(month)
    const days = Number(end.slice(-2))
    return Array.from({ length: days }, (_, index) => {
      const day = index + 1
      const suffix = `-${String(day).padStart(2, '0')}`
      return {
        dia: String(day).padStart(2, '0'),
        Pedidos: orders.filter(row => row.sale_date?.endsWith(suffix) && hasNetOrderValue(row)).reduce((sum, row) => sum + netOrderValue(row), 0),
        Faturamento: documents.filter(row => row.issue_date?.endsWith(suffix)).reduce((sum, row) => sum + fiscalDocumentValue(row), 0),
      }
    })
  }, [month, orders, documents])

  function exportCSV() {
    const rows = [
      ['Pedido', 'Data', 'Cliente', 'Vendedor', 'Situação', 'Valor líquido do pedido', 'Valor bruto do pedido', 'Faturado', 'Devolvido', 'Saldo em aberto'],
      ...orders.map(row => [row.ultra_order_number,row.sale_date,row.customer_name,row.ultra_salesman_name,stageLabel[row.order_stage] || row.order_stage,orderBaseValue(row),grossOrderValue(row),row.fiscal_billed_value,row.fiscal_returned_value,row.open_value]),
    ]
    const csv = rows.map(row => row.map(value => `"${String(value ?? '').replace(/"/g, '""')}"`).join(';')).join('\n')
    const link = document.createElement('a')
    link.href = `data:text/csv;charset=utf-8,\uFEFF${encodeURIComponent(csv)}`
    link.download = `gestao-comercial-${month}.csv`
    link.click()
  }

  const salesDocuments = documents.filter(row => row.movement_type === 'venda')

  return (
    <div className="commerce-shell">
      <Topbar title="Gestão comercial" subtitle="Pedidos, faturamento fiscal e carteira em aberto">
        <button className="btn btn-ghost btn-sm" onClick={exportCSV}><IconDownload size={15} /> Exportar</button>
      </Topbar>

      <main className="page commerce-page">
        <section className="commerce-toolbar" aria-label="Filtros" style={{ flexWrap: 'wrap', alignItems: 'flex-end' }}>
          <label><IconCalendar size={16} /><span>Competência</span><input type="month" value={month} onChange={event => setMonth(event.target.value)} /></label>
          <label><span>Vendedor</span><select value={seller} onChange={event => setSeller(event.target.value)}><option value="todos">Todos os vendedores</option>{sellers.map(([id, name]) => <option key={id} value={id}>{name}</option>)}</select></label>
          <MultiSelectFilter label="Aplicação" options={applications} values={applicationIds} onChange={setApplicationIds} allLabel="Todas as aplicações" />
          <MultiSelectFilter label="Categoria" options={categories} values={categoryIds} onChange={setCategoryIds} allLabel="Todas as categorias" />
          <button className="btn btn-ghost btn-sm" onClick={load} disabled={loading}><IconRefresh size={15} className={loading ? 'commerce-spin' : ''} />Atualizar</button>
        </section>

        {hasTaxonomyFilter && <div style={{ margin: '0 0 14px', fontSize: 12, color: 'var(--text-dim)' }}>Filtros de produto aplicados item a item. Pedidos com produtos de classificações diferentes entram somente pela parcela correspondente aos filtros selecionados.</div>}
        {error && <div className="commerce-error">{error}</div>}

        <section className="commerce-story">
          <header><span>Leitura do mês</span><h2>Da intenção comercial ao caixa</h2><p>O pedido mede o trabalho vendido. A nota confirma o faturamento. A carteira mostra o que ainda falta realizar.</p></header>
          <div className="commerce-flow" aria-label="Fluxo comercial do mês">
            <div><span>Pedidos válidos</span><strong>{money(summary.generated)}</strong><small>{integer(summary.validOrderCount)} pedidos com itens selecionados</small></div>
            <IconArrowUpRight size={22} />
            <div><span>Faturamento líquido</span><strong>{money(summary.netBilling)}</strong><small>{integer(summary.invoices)} notas de venda</small></div>
            <IconArrowDownRight size={22} />
            <div><span>Carteira aberta</span><strong>{money(summary.openValue)}</strong><small>{integer(portfolio.length)} pedidos aguardando</small></div>
          </div>
        </section>

        <section className="commerce-metrics">
          <Metric icon={IconShoppingCart} label="Pedidos válidos" value={money(summary.valid)} note="Valor líquido correspondente aos produtos filtrados" tone="blue" />
          <Metric icon={IconFileInvoice} label="Faturamento bruto" value={money(summary.grossBilling)} note="Notas emitidas para o mix selecionado" tone="orange" />
          <Metric icon={IconRotateClockwise} label="Devoluções" value={money(summary.returns)} note={`${summary.reversedCount} pedido(s) totalmente estornado(s)`} tone="red" />
          <Metric icon={IconCash} label="Faturamento líquido" value={money(summary.netBilling)} note="Vendas menos devoluções" tone="ink" />
          <Metric icon={IconPackage} label="Carteira em aberto" value={money(summary.openValue)} note={`${portfolio.length} pedido(s) com saldo`} tone="amber" />
        </section>

        <section className="commerce-forecast">
          <div className="commerce-forecast-main"><span>{summary.isCurrent?'Previsão de fechamento':'Fechamento realizado'}</span><strong>{money(summary.projected)}</strong><p>{summary.isCurrent?'Projeção linear pelo ritmo de pedidos líquidos da competência.':'Competência encerrada; valor final de pedidos líquidos.'}</p><i><em style={{width:`${Math.min(summary.goal?summary.projected/summary.goal*100:0,100)}%`}}/></i><small>{hasTaxonomyFilter?'Meta geral não comparada ao filtro de produto':summary.goal?`${(summary.projected/summary.goal*100).toFixed(1)}% da meta ${summary.isCurrent?'projetados':'realizados'}`:'Meta não cadastrada'}</small></div>
          <div><span>Meta de pedidos</span><strong>{hasTaxonomyFilter?'—':summary.goal?money(summary.goal):'—'}</strong><small>{hasTaxonomyFilter?'filtro de produto ativo':'competência selecionada'}</small></div>
          <div><span>Ritmo atual</span><strong>{money(summary.dailyPace)}</strong><small>por dia corrido</small></div>
          <div><span>Ritmo necessário</span><strong>{hasTaxonomyFilter?'—':summary.remainingDays?money(summary.requiredPace):'—'}</strong><small>{hasTaxonomyFilter?'meta não segmentada':summary.remainingDays?`${summary.remainingDays} dias restantes`:'competência encerrada'}</small></div>
        </section>

        <section className="commerce-panel commerce-daily-chart">
          <div className="commerce-panel-head"><div><span>Ritmo da competência</span><h3>Pedidos e faturamento por dia</h3></div><div className="chart-meta"><small>valores diários com os filtros aplicados</small><div className="chart-legend"><i className="billing" />Faturamento<i className="orders" />Pedidos</div></div></div>
          <ResponsiveContainer width="100%" height={300}>
            <ComposedChart data={dailySeries} margin={{ top: 20, right: 24, left: 8, bottom: 2 }}>
              <defs><linearGradient id="dailyBillingArea" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor="#E87722" stopOpacity={0.2} /><stop offset="90%" stopColor="#E87722" stopOpacity={0.01} /></linearGradient></defs>
              <CartesianGrid stroke="#E9E4DE" strokeDasharray="2 7" vertical={false} />
              <XAxis dataKey="dia" tickLine={false} axisLine={false} />
              <YAxis tickLine={false} axisLine={false} tickFormatter={value => `R$ ${Math.round(value / 1000)}k`} width={68} />
              <Tooltip cursor={{ stroke: '#D8D0C8', strokeDasharray: '3 5' }} formatter={(value, name) => [money(value), name]} />
              <Area type="monotone" dataKey="Faturamento" stroke="#E87722" fill="url(#dailyBillingArea)" strokeWidth={3.2} dot={false} activeDot={{ r: 5, fill: '#E87722', stroke: '#fff', strokeWidth: 3 }} />
              <Line type="monotone" dataKey="Pedidos" stroke="#292623" strokeWidth={2.7} dot={false} activeDot={{ r: 5, fill: '#292623', stroke: '#fff', strokeWidth: 3 }} />
            </ComposedChart>
          </ResponsiveContainer>
        </section>

        {loading ? <Empty>Atualizando movimentos comerciais…</Empty> : (
          <section className="commerce-panel commerce-panel-full">
            <div className="commerce-panel-head" style={{ alignItems: 'flex-end', gap: 16 }}><div><span>Detalhamento comercial</span><h3>{tableView === 'pedidos' ? 'Pedidos do mês' : tableView === 'faturados' ? 'Faturados do mês' : 'Pedidos em aberto'}</h3></div><strong>{tableView === 'pedidos' ? money(summary.generated) : tableView === 'faturados' ? money(summary.netBilling) : money(summary.openValue)}</strong></div>
            <div style={{display:'inline-flex',gap:4,padding:4,margin:'0 0 18px',borderRadius:12,background:'var(--surface-2)',border:'1px solid var(--line)'}}>
              {[['pedidos','Pedidos do mês',orders.length],['faturados','Faturados do mês',salesDocuments.length],['abertos','Pedidos em aberto',portfolio.length]].map(([id,label,count]) => <button key={id} type="button" onClick={()=>{setTableView(id);setExpandedOrder(null)}} style={{border:'none',borderRadius:9,padding:'9px 14px',cursor:'pointer',fontFamily:'inherit',fontSize:12,fontWeight:700,background:tableView===id?'var(--surface)':'transparent',color:tableView===id?'var(--text)':'var(--text-dim)',boxShadow:tableView===id?'0 1px 4px rgba(20,18,16,.08)':'none'}}>{label} <span style={{opacity:.55,marginLeft:4}}>{count}</span></button>)}
            </div>

            <div className="commerce-table-wrap">
              {tableView === 'pedidos' && <><table className="commerce-table"><thead><tr><th>Pedido</th><th>Data / cliente</th><th>Vendedor</th><th>Situação</th><th className="num">Valor líquido</th></tr></thead><tbody>{orders.map(row => <Fragment key={row.id}><tr className="commerce-order-row" onClick={()=>setExpandedOrder(current=>current===row.id?null:row.id)}><td><button className="commerce-order-toggle" aria-expanded={expandedOrder===row.id}><strong>#{row.ultra_order_number}</strong>{expandedOrder===row.id?<IconChevronUp size={15}/>:<IconChevronDown size={15}/>}</button></td><td><strong>{row.customer_name||'Cliente não identificado'}</strong><small>{dateBR(row.sale_date)}</small></td><td>{row.ultra_salesman_name||'—'}</td><td><span className={`commerce-status ${row.order_stage}`}>{stageLabel[row.order_stage]||row.order_stage}</span></td><td className="num"><strong>{money(orderBaseValue(row))}</strong></td></tr>{expandedOrder===row.id&&<tr className="commerce-order-items"><td colSpan="5"><div><span>Itens faturados deste pedido</span><p style={{margin:'0 0 12px',color:'var(--text-dim)'}}>Valor líquido considerado: <strong>{money(orderBaseValue(row))}</strong></p>{(orderItems[row.id]||[]).length?<table><thead><tr><th>Produto</th><th className="num">Quantidade</th><th className="num">Valor unitário</th><th className="num">Total</th></tr></thead><tbody>{orderItems[row.id].map((item,index)=><tr key={`${item.product_code}-${index}`}><td><strong>{item.product_name||'Produto'}</strong><small>{item.product_code||'—'}</small></td><td className="num">{integer(item.quantity)} {item.unit||''}</td><td className="num">{money(item.unit_value)}</td><td className="num"><strong>{money(item.product_total)}</strong></td></tr>)}</tbody></table>:<p>Os itens ainda não foram vinculados a uma nota fiscal deste pedido.</p>}</div></td></tr>}</Fragment>)}</tbody></table>{!orders.length&&<Empty>Nenhum pedido para os filtros selecionados.</Empty>}</>}

              {tableView === 'faturados' && <><table className="commerce-table"><thead><tr><th>NF</th><th>Data / cliente</th><th>Pedido vinculado</th><th>Vendedor</th><th className="num">Valor</th></tr></thead><tbody>{salesDocuments.map(row=>{const link=Array.isArray(row.sales_fiscal_links)?row.sales_fiscal_links[0]:row.sales_fiscal_links;const linkedOrder=Array.isArray(link?.sales)?link.sales[0]:link?.sales;const orderNumber=linkedOrder?.ultra_order_number||linkedOrder?.ultra_order_id;return <tr key={row.ultra_document_id}><td><strong>NF {row.invoice_number}</strong></td><td><strong>{row.partner_name||'Cliente'}</strong><small>{dateBR(row.issue_date)}</small></td><td>{orderNumber?<strong>Pedido #{orderNumber}</strong>:<span style={{color:'var(--text-faint)'}}>Sem pedido vinculado</span>}</td><td>{row.salesman_name||'—'}</td><td className="num"><strong>{money(row.document_total)}</strong></td></tr>})}</tbody></table>{!salesDocuments.length&&<Empty>Nenhum faturamento para os filtros selecionados.</Empty>}</>}

              {tableView === 'abertos' && <><table className="commerce-table"><thead><tr><th>Pedido</th><th>Data / cliente</th><th>Vendedor</th><th className="num">Quantidade aberta</th><th className="num">Saldo em aberto</th></tr></thead><tbody>{portfolio.map(row=><tr key={row.id}><td><strong>#{row.ultra_order_number}</strong></td><td><strong>{row.customer_name||'Cliente não identificado'}</strong><small>{dateBR(row.sale_date)}</small></td><td>{row.ultra_salesman_name||'—'}</td><td className="num">{integer(row.quantity_open)}</td><td className="num"><strong>{money(row.open_value)}</strong></td></tr>)}</tbody></table>{!portfolio.length&&<Empty>Nenhum pedido em aberto para os filtros selecionados.</Empty>}</>}
            </div>
          </section>
        )}
      </main>
    </div>
  )
}
