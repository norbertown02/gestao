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
import { fiscalDocumentValue, hasNetOrderValue, netOrderValue } from '../lib/commercialMetrics'
import { Area, CartesianGrid, ComposedChart, Line, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'

const money = value => Number(value || 0).toLocaleString('pt-BR', {
  style: 'currency',
  currency: 'BRL',
})

const integer = value => Number(value || 0).toLocaleString('pt-BR')

const dateBR = value => value
  ? new Date(`${value}T12:00:00`).toLocaleDateString('pt-BR')
  : '—'

const sellerKey = row => row.seller_id || (row.ultra_salesman_id ? `ultra:${row.ultra_salesman_id}` : null)

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

function Empty({ children }) {
  return <div className="commerce-empty">{children}</div>
}

export default function Vendas() {
  const [month, setMonth] = useState(currentMonth)
  const [seller, setSeller] = useState('todos')
  const [orders, setOrders] = useState([])
  const [documents, setDocuments] = useState([])
  const [portfolio, setPortfolio] = useState([])
  const [orderItems, setOrderItems] = useState({})
  const [expandedOrder, setExpandedOrder] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  async function load() {
    setLoading(true)
    setError('')
    const [start, end] = monthRange(month)

    let ordersQuery = supabase
      .from('management_order_overview')
      .select('*')
      .gte('sale_date', start)
      .lte('sale_date', end)
      .order('sale_date', { ascending: false })

    let fiscalQuery = supabase
      .from('fiscal_documents')
      .select('ultra_document_id,invoice_number,issue_date,partner_name,seller_id,ultra_salesman_id,salesman_name,operation_nature,movement_type,document_total')
      .gte('issue_date', start)
      .lte('issue_date', end)
      .order('issue_date', { ascending: false })

    let portfolioQuery = supabase
      .from('management_open_order_portfolio')
      .select('*')
      .order('sale_date', { ascending: true })

    if (seller !== 'todos') {
      const isUltraSeller = seller.startsWith('ultra:')
      const field = isUltraSeller ? 'ultra_salesman_id' : 'seller_id'
      const value = isUltraSeller ? Number(seller.slice(6)) : seller
      ordersQuery = ordersQuery.eq(field, value)
      fiscalQuery = fiscalQuery.eq(field, value)
      portfolioQuery = portfolioQuery.eq(field, value)
    }

    const [ordersResult, fiscalResult, portfolioResult] = await Promise.all([
      ordersQuery,
      fiscalQuery,
      portfolioQuery,
    ])

    const failure = ordersResult.error || fiscalResult.error || portfolioResult.error
    if (failure) {
      console.error('Falha ao carregar gestão comercial:', failure)
      setError('Não foi possível atualizar os indicadores. Tente novamente.')
      setOrders([])
      setDocuments([])
      setPortfolio([])
      setOrderItems({})
    } else {
      setOrders(ordersResult.data || [])
      setDocuments(fiscalResult.data || [])
      setPortfolio(portfolioResult.data || [])
      const orderIds = (ordersResult.data || []).map(row => row.id).filter(Boolean)
      if (orderIds.length) {
        const linksResult = await supabase
          .from('sales_fiscal_links')
          .select('sale_id,link_type,fiscal_documents(fiscal_document_items(product_code,product_name,quantity,unit,unit_value,product_total))')
          .in('sale_id', orderIds)
          .eq('link_type', 'faturamento')
        const mapped = {}
        ;(linksResult.data || []).forEach(link => {
          const items = link.fiscal_documents?.fiscal_document_items || []
          mapped[link.sale_id] = [...(mapped[link.sale_id] || []), ...items]
        })
        setOrderItems(mapped)
      } else setOrderItems({})
    }
    setLoading(false)
  }

  useEffect(() => {
    // Recarrega a competência quando os filtros mudam.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    load()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [month, seller])

  const sellers = useMemo(() => {
    const map = new Map()
    ;[...orders, ...documents, ...portfolio].forEach(row => {
      const key = sellerKey(row)
      if (key) map.set(key, row.ultra_salesman_name || row.salesman_name || 'Vendedor')
    })
    return [...map.entries()].sort((a, b) => a[1].localeCompare(b[1]))
  }, [orders, documents, portfolio])

  const summary = useMemo(() => {
    const validOrders = orders.filter(hasNetOrderValue)
    const generated = validOrders.reduce((sum, row) => sum + netOrderValue(row), 0)
    const reversedOrders = orders.filter(row => row.order_stage === 'estornado')
    const valid = generated
    const salesDocs = documents.filter(row => row.movement_type === 'venda')
    const returnDocs = documents.filter(row => row.movement_type === 'devolucao')
    const grossBilling = salesDocs.reduce((sum, row) => sum + Number(row.document_total || 0), 0)
    const returns = returnDocs.reduce((sum, row) => sum + Math.abs(Number(row.document_total || 0)), 0)
    const openValue = portfolio.reduce((sum, row) => sum + Number(row.open_value || 0), 0)

    return {
      generated,
      valid,
      validOrderCount: validOrders.length,
      reversedCount: reversedOrders.length,
      reversedValue: reversedOrders.reduce((sum, row) => sum + Number(row.order_value || 0), 0),
      invoices: salesDocs.length,
      grossBilling,
      returns,
      netBilling: grossBilling - returns,
      openValue,
    }
  }, [orders, documents, portfolio])

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
      ['Pedido', 'Data', 'Cliente', 'Vendedor', 'Situação', 'Valor gerado', 'Faturado', 'Devolvido', 'Saldo em aberto'],
      ...orders.map(row => [
        row.ultra_order_number,
        row.sale_date,
        row.customer_name,
        row.ultra_salesman_name,
        stageLabel[row.order_stage] || row.order_stage,
        row.order_value,
        row.fiscal_billed_value,
        row.fiscal_returned_value,
        row.open_value,
      ]),
    ]
    const csv = rows.map(row => row.map(value => `"${String(value ?? '').replace(/"/g, '""')}"`).join(';')).join('\n')
    const link = document.createElement('a')
    link.href = `data:text/csv;charset=utf-8,\uFEFF${encodeURIComponent(csv)}`
    link.download = `gestao-comercial-${month}.csv`
    link.click()
  }

  return (
    <div className="commerce-shell">
      <Topbar title="Gestão comercial" subtitle="Pedidos, faturamento fiscal e carteira em aberto">
        <button className="btn btn-ghost btn-sm" onClick={exportCSV}>
          <IconDownload size={15} /> Exportar
        </button>
      </Topbar>

      <main className="page commerce-page">
        <section className="commerce-toolbar" aria-label="Filtros">
          <label>
            <IconCalendar size={16} />
            <span>Competência</span>
            <input type="month" value={month} onChange={event => setMonth(event.target.value)} />
          </label>
          <label>
            <span>Vendedor</span>
            <select value={seller} onChange={event => setSeller(event.target.value)}>
              <option value="todos">Todos os vendedores</option>
              {sellers.map(([id, name]) => <option key={id} value={id}>{name}</option>)}
            </select>
          </label>
          <button className="btn btn-ghost btn-sm" onClick={load} disabled={loading}>
            <IconRefresh size={15} className={loading ? 'commerce-spin' : ''} />
            Atualizar
          </button>
        </section>

        {error && <div className="commerce-error">{error}</div>}

        <section className="commerce-story">
          <header>
            <span>Leitura do mês</span>
            <h2>Da intenção comercial ao caixa</h2>
            <p>O pedido mede o trabalho vendido. A nota confirma o faturamento. A carteira mostra o que ainda falta realizar.</p>
          </header>
          <div className="commerce-flow" aria-label="Fluxo comercial do mês">
            <div><span>Pedidos válidos</span><strong>{money(summary.generated)}</strong><small>{integer(summary.validOrderCount)} pedidos sem devolução</small></div>
            <IconArrowUpRight size={22} />
            <div><span>Faturamento líquido</span><strong>{money(summary.netBilling)}</strong><small>{integer(summary.invoices)} notas de venda</small></div>
            <IconArrowDownRight size={22} />
            <div><span>Carteira aberta</span><strong>{money(summary.openValue)}</strong><small>{integer(portfolio.length)} pedidos aguardando</small></div>
          </div>
        </section>

        <section className="commerce-metrics">
          <Metric icon={IconShoppingCart} label="Pedidos válidos" value={money(summary.valid)} note="Exclui cancelados, estornados e devolvidos" tone="blue" />
          <Metric icon={IconFileInvoice} label="Faturamento bruto" value={money(summary.grossBilling)} note="Notas emitidas no mês" tone="orange" />
          <Metric icon={IconRotateClockwise} label="Devoluções" value={money(summary.returns)} note={`${summary.reversedCount} pedido(s) totalmente estornado(s)`} tone="red" />
          <Metric icon={IconCash} label="Faturamento líquido" value={money(summary.netBilling)} note="Vendas menos devoluções" tone="ink" />
          <Metric icon={IconPackage} label="Carteira em aberto" value={money(summary.openValue)} note={`${portfolio.length} pedido(s) com saldo`} tone="amber" />
        </section>

        <section className="commerce-panel commerce-daily-chart">
          <div className="commerce-panel-head"><div><span>Ritmo da competência</span><h3>Pedidos e faturamento por dia</h3></div><div className="chart-meta"><small>valores diários, incluindo devoluções</small><div className="chart-legend"><i className="billing" />Faturamento<i className="orders" />Pedidos</div></div></div>
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
          <div className="commerce-columns">
            <section className="commerce-panel commerce-panel-wide">
              <div className="commerce-panel-head">
                <div><span>Pedidos do mês</span><h3>Valor líquido de pedidos válidos</h3></div>
                <strong>{money(summary.generated)}</strong>
              </div>
              <div className="commerce-table-wrap">
                <table className="commerce-table">
                  <thead><tr><th>Pedido</th><th>Data / cliente</th><th>Vendedor</th><th>Situação</th><th className="num">Valor</th></tr></thead>
                  <tbody>
                    {orders.map(row => (
                      <Fragment key={row.id}>
                      <tr className="commerce-order-row" onClick={() => setExpandedOrder(current => current === row.id ? null : row.id)}>
                        <td><button className="commerce-order-toggle" aria-expanded={expandedOrder === row.id}><strong>#{row.ultra_order_number}</strong>{expandedOrder === row.id ? <IconChevronUp size={15} /> : <IconChevronDown size={15} />}</button></td>
                        <td><strong>{row.customer_name || 'Cliente não identificado'}</strong><small>{dateBR(row.sale_date)}</small></td>
                        <td>{row.ultra_salesman_name || '—'}</td>
                        <td><span className={`commerce-status ${row.order_stage}`}>{stageLabel[row.order_stage] || row.order_stage}</span></td>
                        <td className="num"><strong>{money(row.order_value)}</strong></td>
                      </tr>
                      {expandedOrder === row.id && <tr className="commerce-order-items"><td colSpan="5"><div><span>Itens faturados deste pedido</span>{(orderItems[row.id] || []).length ? <table><thead><tr><th>Produto</th><th className="num">Quantidade</th><th className="num">Valor unitário</th><th className="num">Total</th></tr></thead><tbody>{orderItems[row.id].map((item, index) => <tr key={`${item.product_code}-${index}`}><td><strong>{item.product_name || 'Produto'}</strong><small>{item.product_code || '—'}</small></td><td className="num">{integer(item.quantity)} {item.unit || ''}</td><td className="num">{money(item.unit_value)}</td><td className="num"><strong>{money(item.product_total)}</strong></td></tr>)}</tbody></table> : <p>Os itens ainda não foram vinculados a uma nota fiscal deste pedido.</p>}</div></td></tr>}
                      </Fragment>
                    ))}
                  </tbody>
                </table>
                {!orders.length && <Empty>Nenhum pedido gerado nesta competência.</Empty>}
              </div>
            </section>

            <section className="commerce-panel">
              <div className="commerce-panel-head">
                <div><span>Movimento fiscal</span><h3>Notas e devoluções</h3></div>
                <strong>{money(summary.netBilling)}</strong>
              </div>
              <div className="commerce-ledger">
                {documents.map(row => (
                  <div className={`commerce-ledger-row ${row.movement_type}`} key={row.ultra_document_id}>
                    <div className="commerce-ledger-mark">{row.movement_type === 'devolucao' ? '↩' : 'NF'}</div>
                    <div><strong>Nota {row.invoice_number}</strong><span>{row.partner_name || 'Cliente'} · {dateBR(row.issue_date)}</span></div>
                    <strong>{money(row.document_total)}</strong>
                  </div>
                ))}
                {!documents.length && <Empty>Nenhum movimento fiscal nesta competência.</Empty>}
              </div>
            </section>

            <section className="commerce-panel commerce-panel-full">
              <div className="commerce-panel-head">
                <div><span>Carteira atual</span><h3>Pedidos aguardando faturamento</h3></div>
                <strong>{money(summary.openValue)}</strong>
              </div>
              <div className="commerce-portfolio">
                {portfolio.map(row => {
                  const progress = row.quantity_ordered > 0
                    ? Math.min(100, Math.max(0, (Number(row.quantity_invoiced) / Number(row.quantity_ordered)) * 100))
                    : 0
                  return (
                    <article key={row.id}>
                      <div><span>Pedido #{row.ultra_order_number}</span><strong>{row.customer_name || 'Cliente não identificado'}</strong><small>{row.ultra_salesman_name || 'Sem vendedor'} · gerado em {dateBR(row.sale_date)}</small></div>
                      <div className="commerce-progress"><span style={{ width: `${progress}%` }} /></div>
                      <div className="commerce-portfolio-value"><strong>{money(row.open_value)}</strong><small>{integer(row.quantity_open)} em aberto</small></div>
                    </article>
                  )
                })}
                {!portfolio.length && <Empty>A carteira está totalmente faturada.</Empty>}
              </div>
            </section>
          </div>
        )}
      </main>
    </div>
  )
}
