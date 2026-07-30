import { useEffect, useMemo, useState } from 'react'
import { IconArrowDownRight, IconArrowRight, IconArrowUpRight, IconChartBar, IconChecklist, IconFileInvoice, IconPackage, IconReceipt, IconTargetArrow, IconTrendingUp, IconWallet } from '@tabler/icons-react'
import { Area, CartesianGrid, ComposedChart, Line, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'
import Topbar from '../components/Topbar'
import { supabaseAdmin } from '../lib/supabase'

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
  const sizes = { bimestre: 2, trimestre: 3, semestre: 6, ano: 12 }
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

export default function Dashboard() {
  const now = new Date()
  const [year, setYear] = useState(now.getFullYear())
  const [type, setType] = useState('ano')
  const [index, setIndex] = useState(1)
  const [sales, setSales] = useState([])
  const [documents, setDocuments] = useState([])
  const [goals, setGoals] = useState([])
  const [portfolio, setPortfolio] = useState([])
  const [loading, setLoading] = useState(true)

  const range = useMemo(() => rangeFor(year, type, index), [year, type, index])

  useEffect(() => {
    async function load() {
      setLoading(true)
      const [salesResult, docsResult, goalsResult, portfolioResult] = await Promise.all([
        supabaseAdmin.from('sales').select('id,sale_date,total,seller_id,ultra_salesman_id,ultra_salesman_name,quantity_ordered').gte('sale_date', iso(range.previousStart)).lte('sale_date', iso(range.end)),
        supabaseAdmin.from('fiscal_documents').select('issue_date,document_total,seller_id,ultra_salesman_id,salesman_name,fiscal_document_items(quantity)').gte('issue_date', iso(range.previousStart)).lte('issue_date', iso(range.end)),
        supabaseAdmin.from('goals').select('ano,mes,meta_fat,seller_id').gte('ano', range.previousStart.getFullYear()).lte('ano', range.end.getFullYear()),
        supabaseAdmin.from('management_open_order_portfolio').select('open_value,quantity_open'),
      ])
      setSales(salesResult.data || [])
      setDocuments(docsResult.data || [])
      setGoals(goalsResult.data || [])
      setPortfolio(portfolioResult.data || [])
      setLoading(false)
    }
    load()
  }, [range])

  const data = useMemo(() => {
    const between = (value, start, end) => value >= iso(start) && value <= iso(end)
    const currentSales = sales.filter(row => between(row.sale_date, range.start, range.end))
    const previousSales = sales.filter(row => between(row.sale_date, range.previousStart, range.previousEnd))
    const currentDocs = documents.filter(row => between(row.issue_date, range.start, range.end))
    const previousDocs = documents.filter(row => between(row.issue_date, range.previousStart, range.previousEnd))
    const currentGoals = goals.filter(goal => {
      const date = `${goal.ano}-${String(goal.mes).padStart(2, '0')}-01`
      return between(date, range.start, range.end)
    })
    const previousGoals = goals.filter(goal => {
      const date = `${goal.ano}-${String(goal.mes).padStart(2, '0')}-01`
      return between(date, range.previousStart, range.previousEnd)
    })
    const orderValue = currentSales.reduce((sum, row) => sum + Number(row.total || 0), 0)
    const previousOrderValue = previousSales.reduce((sum, row) => sum + Number(row.total || 0), 0)
    const billing = currentDocs.reduce((sum, row) => sum + Number(row.document_total || 0), 0)
    const previousBilling = previousDocs.reduce((sum, row) => sum + Number(row.document_total || 0), 0)
    const goal = currentGoals.reduce((sum, row) => sum + Number(row.meta_fat || 0), 0)
    const previousGoal = previousGoals.reduce((sum, row) => sum + Number(row.meta_fat || 0), 0)
    const quantity = currentDocs.reduce((sum, doc) => sum + (doc.fiscal_document_items || []).reduce((itemSum, item) => itemSum + Number(item.quantity || 0), 0), 0)
    const previousQuantity = previousDocs.reduce((sum, doc) => sum + (doc.fiscal_document_items || []).reduce((itemSum, item) => itemSum + Number(item.quantity || 0), 0), 0)
    const series = []
    for (let cursor = new Date(range.start); cursor <= range.end; cursor.setMonth(cursor.getMonth() + 1)) {
      const key = `${cursor.getFullYear()}-${String(cursor.getMonth() + 1).padStart(2, '0')}`
      series.push({
        key,
        label: cursor.toLocaleDateString('pt-BR', { month: 'short', year: range.size === 12 ? '2-digit' : undefined }).replace('.', ''),
        Pedidos: currentSales.filter(row => row.sale_date?.startsWith(key)).reduce((sum, row) => sum + Number(row.total || 0), 0),
        Faturamento: currentDocs.filter(row => row.issue_date?.startsWith(key)).reduce((sum, row) => sum + Number(row.document_total || 0), 0),
        Meta: currentGoals.filter(row => row.ano === cursor.getFullYear() && row.mes === cursor.getMonth() + 1).reduce((sum, row) => sum + Number(row.meta_fat || 0), 0),
      })
    }
    const sellerMap = new Map()
    currentDocs.forEach(doc => {
      const key = doc.seller_id || `ultra:${doc.ultra_salesman_id || 0}`
      const current = sellerMap.get(key) || { name: doc.salesman_name || 'Sem vendedor', total: 0 }
      current.total += Number(doc.document_total || 0)
      sellerMap.set(key, current)
    })
    const topSellers = [...sellerMap.values()].sort((a, b) => b.total - a.total).slice(0, 6)
    const openValue = portfolio.reduce((sum, row) => sum + Number(row.open_value || 0), 0)
    const ticket = currentSales.length ? orderValue / currentSales.length : 0
    const previousTicket = previousSales.length ? previousOrderValue / previousSales.length : 0
    const billingRate = orderValue ? billing / orderValue * 100 : 0
    const previousBillingRate = previousOrderValue ? previousBilling / previousOrderValue * 100 : 0
    return {
      orderValue, previousOrderValue, billing, previousBilling, goal, previousGoal, quantity, previousQuantity,
      orders: currentSales.length, previousOrders: previousSales.length, attainment: goal ? billing / goal * 100 : 0,
      invoices: currentDocs.length, previousInvoices: previousDocs.length,
      ticket, previousTicket, averageInvoice: currentDocs.length ? billing / currentDocs.length : 0,
      series, topSellers, openValue, billingRate, previousBillingRate,
      goalGap: goal ? Math.max(0, goal - billing) : 0,
      sellerCount: sellerMap.size,
    }
  }, [sales, documents, goals, portfolio, range])

  const counts = { ano: 1, semestre: 2, trimestre: 4, bimestre: 6 }
  const labels = { ano: 'Ano completo', semestre: 'Semestre', trimestre: 'Trimestre', bimestre: 'Bimestre' }
  const years = Array.from({ length: 5 }, (_, offset) => now.getFullYear() - offset)
  const maxSeller = Math.max(...data.topSellers.map(item => item.total), 1)

  return <div style={{ flex: 1, overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>
    <Topbar title="Dashboard" subtitle="Visão macro de vendas, faturamento e metas" />
    <div className="page macro-page" style={{ overflowY: 'auto' }}>
      <section className="macro-toolbar"><div><select value={year} onChange={event => setYear(Number(event.target.value))}>{years.map(value => <option key={value}>{value}</option>)}</select><select value={type} onChange={event => { setType(event.target.value); setIndex(1) }}><option value="ano">Ano</option><option value="semestre">Semestre</option><option value="trimestre">Trimestre</option><option value="bimestre">Bimestre</option></select>{type !== 'ano' && <select value={index} onChange={event => setIndex(Number(event.target.value))}>{Array.from({ length: counts[type] }, (_, value) => <option value={value + 1} key={value + 1}>{value + 1}º {labels[type].toLowerCase()}</option>)}</select>}</div><span>{iso(range.start).split('-').reverse().join('/')} — {iso(range.end).split('-').reverse().join('/')}</span></section>
      {loading ? <div className="empty">Preparando visão executiva...</div> : <>
        <section className="macro-hero"><header><span>Visão executiva do período</span><h2>Do pedido ao faturamento</h2><p>Acompanhe o valor vendido, o que já virou receita e a distância para a meta.</p></header><div className="macro-hero-flow"><div><span>Vendas geradas</span><strong>{shortMoney(data.orderValue)}</strong><Comparison current={data.orderValue} previous={data.previousOrderValue} /></div><IconArrowRight size={19} /><div><span>Faturamento líquido</span><strong>{shortMoney(data.billing)}</strong><Comparison current={data.billing} previous={data.previousBilling} /></div><IconArrowRight size={19} /><div><span>Atingimento da meta</span><strong>{data.goal ? `${data.attainment.toFixed(1)}%` : '—'}</strong><small>{data.goal ? `${shortMoney(data.goalGap)} para a meta` : 'Meta não cadastrada'}</small></div></div></section>
        <div className="macro-section-title"><div><span>Resultado financeiro</span><h3>O tamanho do negócio no período</h3></div><small>comparações usam o período anterior equivalente</small></div>
        <section className="macro-metrics macro-metrics-primary"><Metric icon={IconReceipt} label="Vendas geradas" value={shortMoney(data.orderValue)} current={data.orderValue} previous={data.previousOrderValue} tone="featured" /><Metric icon={IconTargetArrow} label="Meta acumulada" value={data.goal ? shortMoney(data.goal) : '—'} note={data.goal ? `${data.attainment.toFixed(1)}% já realizado` : 'meta ainda não cadastrada'} tone="goal" /><Metric icon={IconWallet} label="Saldo para a meta" value={data.goal ? shortMoney(data.goalGap) : '—'} note={data.goal ? (data.goalGap ? 'faturamento necessário' : 'meta do período superada') : 'depende da meta cadastrada'} tone={data.goalGap ? 'attention' : 'goal'} /><Metric icon={IconPackage} label="Carteira em aberto" value={shortMoney(data.openValue)} note="posição atual a faturar" tone="portfolio" /></section>
        <div className="macro-section-title macro-section-title-compact"><div><span>Eficiência comercial</span><h3>Como o resultado está sendo construído</h3></div></div>
        <section className="macro-metrics macro-metrics-operational"><Metric icon={IconChartBar} label="Pedidos gerados" value={integer(data.orders)} current={data.orders} previous={data.previousOrders} /><Metric icon={IconFileInvoice} label="Notas emitidas" value={integer(data.invoices)} current={data.invoices} previous={data.previousInvoices} /><Metric icon={IconChecklist} label="Taxa de faturamento" value={`${data.billingRate.toFixed(1)}%`} current={data.billingRate} previous={data.previousBillingRate} /><Metric icon={IconTrendingUp} label="Ticket por pedido" value={shortMoney(data.ticket)} current={data.ticket} previous={data.previousTicket} /><Metric icon={IconReceipt} label="Média por nota" value={shortMoney(data.averageInvoice)} note="valor médio faturado" /><Metric icon={IconPackage} label="Volume faturado" value={integer(data.quantity)} current={data.quantity} previous={data.previousQuantity} /></section>
        <section className="macro-chart"><div className="macro-card-head"><div><span>Ritmo comercial</span><h3>Pedidos, faturamento e meta</h3></div><div className="chart-meta"><small>{data.billingRate.toFixed(1)}% do valor vendido já faturado</small><div className="chart-legend"><i className="billing" />Faturamento<i className="orders" />Pedidos<i className="goal" />Meta</div></div></div><ResponsiveContainer width="100%" height={390}><ComposedChart data={data.series} margin={{ top: 22, right: 24, left: 8, bottom: 4 }}><defs><linearGradient id="billingArea" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor="#E87722" stopOpacity={0.22} /><stop offset="90%" stopColor="#E87722" stopOpacity={0.015} /></linearGradient></defs><CartesianGrid stroke="#E9E4DE" strokeDasharray="2 7" vertical={false} /><XAxis dataKey="label" tickLine={false} axisLine={false} /><YAxis tickLine={false} axisLine={false} tickFormatter={value => `R$ ${Math.round(value / 1000)}k`} width={68} /><Tooltip cursor={{ stroke: '#D8D0C8', strokeDasharray: '3 5' }} formatter={(value, name) => [money(value), name]} /><Area type="monotone" dataKey="Faturamento" stroke="#E87722" fill="url(#billingArea)" strokeWidth={3.5} dot={false} activeDot={{ r: 5, fill: '#E87722', stroke: '#fff', strokeWidth: 3 }} /><Line type="monotone" dataKey="Pedidos" stroke="#292623" strokeWidth={2.8} dot={false} activeDot={{ r: 5, fill: '#292623', stroke: '#fff', strokeWidth: 3 }} /><Line type="monotone" dataKey="Meta" stroke="#A79C92" strokeWidth={2} strokeDasharray="5 7" dot={false} activeDot={{ r: 4, fill: '#A79C92', stroke: '#fff', strokeWidth: 2 }} /></ComposedChart></ResponsiveContainer></section>
        <section className="macro-bottom"><div className="macro-ranking"><div className="macro-card-head"><div><span>Contribuição</span><h3>Faturamento por vendedor</h3></div><small>{data.sellerCount} vendedor(es) com faturamento</small></div>{data.topSellers.map((seller, position) => <div key={seller.name}><b>{position + 1}</b><span><strong>{seller.name}</strong><i><em style={{ width: `${Math.max(5, seller.total / maxSeller * 100)}%` }} /></i></span><strong>{shortMoney(seller.total)}</strong></div>)}</div><div className="macro-reading"><span>Leitura do período</span><h3>{data.attainment >= 100 ? 'Meta superada' : data.goal ? 'Meta ainda em construção' : 'Planejamento pendente'}</h3><p>{data.goal ? `O faturamento representa ${data.attainment.toFixed(1)}% da meta e ${data.billingRate.toFixed(1)}% do valor dos pedidos gerados no período.` : 'Cadastre as metas mensais para comparar execução, ritmo e saldo acumulado.'}</p></div></section>
      </>}
    </div>
  </div>
}
