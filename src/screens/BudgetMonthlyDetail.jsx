import { useMemo, useState } from 'react'
import { IconCalendarMonth, IconChevronDown, IconChevronRight, IconSearch, IconUsers } from '@tabler/icons-react'
import './BudgetMonthlyDetail.css'

const money = n => Number(n || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })
const kg = n => Number(n || 0).toLocaleString('pt-BR', { maximumFractionDigits: 2 })
const monthLabel = key => {
  if (!/^\d{4}-\d{2}$/.test(key || '')) return key || 'Sem mês'
  return new Date(key + '-01T12:00:00').toLocaleDateString('pt-BR', { month: 'long', year: 'numeric' })
}

export default function BudgetMonthlyDetail({ cycle, assignments = [], budgetItems = [], sellers = [], products = [], farms = [], prospects = [] }) {
  const [month, setMonth] = useState('all')
  const [expandedSeller, setExpandedSeller] = useState(null)
  const [search, setSearch] = useState('')
  const monthList = useMemo(() => [...new Set([...(cycle.months || []), ...budgetItems.map(i => i.month).filter(Boolean)])].sort(), [cycle.months, budgetItems])
  const sellerMap = useMemo(() => new Map(sellers.map(s => [s.id, s.name])), [sellers])
  const productMap = useMemo(() => new Map(products.map(p => [String(p.id), p.name])), [products])
  const farmMap = useMemo(() => new Map(farms.map(f => [String(f.id), f.name])), [farms])
  const prospectMap = useMemo(() => new Map(prospects.map(p => [String(p.id), p.name])), [prospects])
  const relevantItems = useMemo(() => budgetItems.filter(i => month === 'all' || i.month === month), [budgetItems, month])
  const revenue = row => Number(row.quantity_kg || 0) * Number(row.unit_price || 0)
  const selectedTotal = relevantItems.reduce((sum, row) => sum + revenue(row), 0)
  const selectedKg = relevantItems.reduce((sum, row) => sum + Number(row.quantity_kg || 0), 0)

  const monthlyRows = monthList.map(m => {
    const rows = budgetItems.filter(i => i.month === m)
    const perSeller = assignments.map(a => ({
      id: a.seller_id,
      name: sellerMap.get(a.seller_id) || 'Vendedor',
      amount: rows.filter(i => i.seller_id === a.seller_id).reduce((sum, i) => sum + revenue(i), 0),
    }))
    return { month: m, amount: rows.reduce((sum, i) => sum + revenue(i), 0), volume: rows.reduce((sum, i) => sum + Number(i.quantity_kg || 0), 0), perSeller }
  })
  const visibleMonthlyRows = monthlyRows.filter(r => month === 'all' || r.month === month)
  const visibleTotal = visibleMonthlyRows.reduce((sum, r) => sum + r.amount, 0)
  const visibleVolume = visibleMonthlyRows.reduce((sum, r) => sum + r.volume, 0)

  const vendorLines = assignments.map(a => {
    const rows = relevantItems.filter(i => i.seller_id === a.seller_id)
    return { assignment: a, name: sellerMap.get(a.seller_id) || 'Vendedor', rows,
      amount: rows.reduce((sum, i) => sum + revenue(i), 0),
      volume: rows.reduce((sum, i) => sum + Number(i.quantity_kg || 0), 0),
      clientCount: new Set(rows.filter(i => Number(i.quantity_kg) > 0).map(i => i.budget_prospect_id ? 'p:' + i.budget_prospect_id : 'f:' + i.farm_id)).size }
  })
  const detail = vendorLines.find(x => x.assignment.seller_id === expandedSeller)
  const detailRows = detail ? detail.rows.map(row => ({
    ...row,
    productName: productMap.get(String(row.product_id)) || 'Produto não encontrado',
    clientName: row.budget_prospect_id
      ? (prospectMap.get(String(row.budget_prospect_id)) || 'Cliente só do budget')
      : (farmMap.get(String(row.farm_id)) || 'Cliente não encontrado'),
    amount: revenue(row),
  })).filter(row => [row.clientName, row.productName, row.month].join(' ').toLocaleLowerCase('pt-BR').includes(search.toLocaleLowerCase('pt-BR')))
    .sort((a, b) => a.month.localeCompare(b.month) || a.clientName.localeCompare(b.clientName, 'pt-BR') || a.productName.localeCompare(b.productName, 'pt-BR')) : []

  return (
    <div className="bmd-root">
      <section className="bmd-section">
        <div className="bmd-heading">
          <div>
            <span className="bgx-overline">PREVISÃO FINANCEIRA / MENSAL</span>
            <h3>Faturamento previsto por mês</h3>
            <p>Receita projetada no orçamento, calculada por quantidade em kg × preço por kg. Não representa faturamento realizado.</p>
          </div>
          <label className="bmd-filter"><IconCalendarMonth size={17} />
            <span>Mês</span>
            <select aria-label="Filtrar faturamento previsto por mês" value={month} onChange={e => setMonth(e.target.value)}>
              <option value="all">Todos os meses</option>
              {monthList.map(m => <option key={m} value={m}>{monthLabel(m)}</option>)}
            </select>
          </label>
        </div>
        <div className="bmd-kpis">
          <div><small>Receita prevista {month !== 'all' ? 'no mês' : 'no ciclo'}</small><strong>{money(selectedTotal)}</strong></div>
          <div><small>Volume previsto {month !== 'all' ? 'no mês' : 'no ciclo'}</small><strong>{kg(selectedKg / 1000)} t</strong></div>
          <div><small>Período selecionado</small><strong>{month === 'all' ? monthList.length + ' meses' : monthLabel(month)}</strong></div>
        </div>
        <div className="bmd-scroll">
          <table className="bmd-table bmd-month-table">
            <thead><tr><th>Mês</th>{assignments.map(a => <th key={a.seller_id}>{sellerMap.get(a.seller_id) || 'Vendedor'}</th>)}<th>Volume (t)</th><th>Total previsto</th></tr></thead>
            <tbody>
              {visibleMonthlyRows.map(r => <tr key={r.month}>
                <th scope="row">{monthLabel(r.month)}</th>
                {r.perSeller.map(v => <td key={v.id}>{money(v.amount)}</td>)}
                <td>{kg(r.volume / 1000)}</td><td className="bmd-strong">{money(r.amount)}</td>
              </tr>)}
              <tr className="bmd-totals"><th scope="row">Total {month === 'all' ? 'do ciclo' : 'do mês'}</th>
                {assignments.map(a => <td key={a.seller_id}>{money(visibleMonthlyRows.reduce((sum, row) => sum + (row.perSeller.find(p => p.id === a.seller_id)?.amount || 0), 0))}</td>)}
                <td>{kg(visibleVolume / 1000)}</td><td>{money(visibleTotal)}</td>
              </tr>
            </tbody>
          </table>
        </div>
        {!budgetItems.length && <p className="bmd-empty">Ainda não há produtos previstos neste ciclo.</p>}
        <p className="bmd-note">Os valores incluem previsões em preenchimento e enviadas. Consulte a situação de aprovação de cada vendedor na tabela de acompanhamento.</p>
      </section>

      <section className="bmd-section">
        <div className="bmd-heading">
          <div>
            <span className="bgx-overline">ANÁLISE POR VENDEDOR</span>
            <h3>Detalhamento dos budgets individuais</h3>
            <p>Clique em um vendedor para conferir os clientes, produtos, volumes, preços e valores lançados.</p>
          </div>
          <IconUsers size={23} />
        </div>
        <div className="bmd-sellers">
          {vendorLines.map(v => {
            const expanded = expandedSeller === v.assignment.seller_id
            return <button type="button" className={'bmd-seller ' + (expanded ? 'selected' : '')} key={v.assignment.seller_id}
              aria-expanded={expanded} onClick={() => { setExpandedSeller(expanded ? null : v.assignment.seller_id); setSearch('') }}>
              <span className="bmd-seller-name">{expanded ? <IconChevronDown size={17}/> : <IconChevronRight size={17}/>}<strong>{v.name}</strong><small>{v.clientCount} clientes · {v.rows.length} lançamentos</small></span>
              <span className="bmd-seller-num">{kg(v.volume / 1000)} t</span>
              <strong className="bmd-seller-amount">{money(v.amount)}</strong>
            </button>
          })}
          {!vendorLines.length && <p className="bmd-empty">Nenhum vendedor incluído neste ciclo.</p>}
        </div>
        {detail && <div className="bmd-expanded">
          <div className="bmd-expanded-head"><div><span className="bgx-overline">DETALHAMENTO INDIVIDUAL</span><h4>{detail.name}</h4><p>{month === 'all' ? 'Todos os meses' : monthLabel(month)} · {detail.rows.length} lançamentos · {money(detail.amount)}</p></div>
            <label className="bmd-search"><IconSearch size={16}/><input aria-label="Buscar cliente ou produto no budget" value={search} onChange={e => setSearch(e.target.value)} placeholder="Buscar cliente ou produto..."/></label>
          </div>
          <div className="bmd-scroll"><table className="bmd-table bmd-detail-table">
            <thead><tr><th>Mês</th><th>Cliente</th><th>Produto</th><th>Quantidade (kg)</th><th>Preço/kg</th><th>Previsto</th></tr></thead>
            <tbody>
              {detailRows.map(row => <tr key={row.id}><td>{monthLabel(row.month)}</td><td>{row.clientName}{row.budget_prospect_id && <small className="bmd-prospect">Cliente só do budget</small>}</td><td>{row.productName}</td><td>{kg(row.quantity_kg)}</td><td>{money(row.unit_price)}</td><td className="bmd-strong">{money(row.amount)}</td></tr>)}
              {!detailRows.length && <tr><td colSpan={6} className="bmd-empty-cell">Nenhum lançamento encontrado para este filtro.</td></tr>}
              <tr className="bmd-totals"><th colSpan={3}>Total dos lançamentos exibidos</th><td>{kg(detailRows.reduce((sum,r)=>sum + Number(r.quantity_kg || 0),0))}</td><td>—</td><td>{money(detailRows.reduce((sum,r)=>sum + r.amount,0))}</td></tr>
            </tbody>
          </table></div>
        </div>}
      </section>
    </div>
  )
}
