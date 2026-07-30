import { useEffect, useMemo, useState } from 'react'
import { IconArrowDownRight, IconArrowUpRight, IconChartBar, IconPackage, IconReceipt, IconTargetArrow, IconTrendingUp } from '@tabler/icons-react'
import { CartesianGrid, Legend, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'
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

function Metric({ icon: Icon, label, value, note, current, previous }) {
  return <article className="macro-metric"><Icon size={18} /><span>{label}</span><strong>{value}</strong>{previous !== undefined ? <Comparison current={current} previous={previous} /> : <small>{note}</small>}</article>
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
    return {
      orderValue, previousOrderValue, billing, previousBilling, goal, previousGoal, quantity, previousQuantity,
      orders: currentSales.length, previousOrders: previousSales.length, attainment: goal ? billing / goal * 100 : 0,
      ticket: currentSales.length ? orderValue / currentSales.length : 0, series, topSellers, openValue,
      billingRate: orderValue ? billing / orderValue * 100 : 0,
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
        <section className="macro-hero"><div><span>Faturamento líquido no período</span><h2>{shortMoney(data.billing)}</h2><Comparison current={data.billing} previous={data.previousBilling} /></div><div className="macro-hero-goal"><span>Meta acumulada</span><strong>{data.goal ? shortMoney(data.goal) : '—'}</strong><small>{data.goal ? `${data.attainment.toFixed(1)}% atingido · saldo ${shortMoney(data.billing - data.goal)}` : 'Cadastre as metas para ativar o comparativo'}</small><div><i style={{ width: `${Math.min(100, data.attainment)}%` }} /></div></div></section>
        <section className="macro-metrics"><Metric icon={IconReceipt} label="Vendas geradas" value={shortMoney(data.orderValue)} current={data.orderValue} previous={data.previousOrderValue} /><Metric icon={IconChartBar} label="Pedidos" value={integer(data.orders)} current={data.orders} previous={data.previousOrders} /><Metric icon={IconPackage} label="Volume faturado" value={integer(data.quantity)} current={data.quantity} previous={data.previousQuantity} /><Metric icon={IconTrendingUp} label="Ticket médio" value={shortMoney(data.ticket)} note="valor médio por pedido" /><Metric icon={IconTargetArrow} label="Carteira aberta" value={shortMoney(data.openValue)} note="pedidos aguardando faturamento" /></section>
        <section className="macro-chart"><div className="macro-card-head"><div><span>Ritmo comercial</span><h3>Pedidos, faturamento e meta</h3></div><small>{data.billingRate.toFixed(1)}% do valor vendido já faturado</small></div><ResponsiveContainer width="100%" height={390}><LineChart data={data.series} margin={{ top: 18, right: 24, left: 8, bottom: 4 }}><CartesianGrid strokeDasharray="4 7" vertical={false} /><XAxis dataKey="label" tickLine={false} axisLine={false} /><YAxis tickLine={false} axisLine={false} tickFormatter={value => `${Math.round(value / 1000)}k`} /><Tooltip formatter={(value, name) => [money(value), name]} /><Legend /><Line type="monotone" dataKey="Pedidos" stroke="#d96d21" strokeWidth={3} dot={{ r: 4 }} /><Line type="monotone" dataKey="Faturamento" stroke="#355f4b" strokeWidth={3} dot={{ r: 4 }} /><Line type="monotone" dataKey="Meta" stroke="#8b97a0" strokeWidth={2.5} strokeDasharray="7 6" dot={false} /></LineChart></ResponsiveContainer></section>
        <section className="macro-bottom"><div className="macro-ranking"><div className="macro-card-head"><div><span>Contribuição</span><h3>Faturamento por vendedor</h3></div></div>{data.topSellers.map((seller, position) => <div key={seller.name}><b>{position + 1}</b><span><strong>{seller.name}</strong><i><em style={{ width: `${Math.max(5, seller.total / maxSeller * 100)}%` }} /></i></span><strong>{shortMoney(seller.total)}</strong></div>)}</div><div className="macro-reading"><span>Leitura do período</span><h3>{data.attainment >= 100 ? 'Meta superada' : data.goal ? 'Meta ainda em construção' : 'Planejamento pendente'}</h3><p>{data.goal ? `O faturamento representa ${data.attainment.toFixed(1)}% da meta e ${data.billingRate.toFixed(1)}% do valor dos pedidos gerados no período.` : 'Cadastre as metas mensais para comparar execução, ritmo e saldo acumulado.'}</p></div></section>
      </>}
    </div>
  </div>
}
