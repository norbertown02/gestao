import { useEffect, useMemo, useState } from 'react'
import { IconAlertTriangle, IconBox, IconChartBar, IconCoins, IconPackage, IconTrendingUp } from '@tabler/icons-react'
import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'
import Topbar from '../components/Topbar'
import { supabaseAdmin } from '../lib/supabase'

const number = value => Number(value || 0).toLocaleString('pt-BR', { maximumFractionDigits: 1 })
const numberInt = value => Number(value || 0).toLocaleString('pt-BR', { maximumFractionDigits: 0 })
const weight = value => Number(value || 0).toLocaleString('pt-BR', { minimumFractionDigits: 0, maximumFractionDigits: 1 })
const money = value => Number(value || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })
const moneyShort = value => {
  const n = Number(value || 0)
  if (Math.abs(n) >= 1000000) return `R$ ${(n / 1000000).toFixed(1)} mi`
  if (Math.abs(n) >= 1000) return `R$ ${(n / 1000).toFixed(0)} mil`
  return money(n)
}
const code = value => String(value || '').split('/')[0]
const daysBetween = value => {
  if (!value) return null
  const today = new Date()
  const base = new Date(`${value}T12:00:00`)
  return Math.max(0, Math.round((today - base) / 86400000))
}

const hasOwn = (obj, key) => Object.prototype.hasOwnProperty.call(obj || {}, key)

function stockKgFromRaw(raw) {
  const stock = Number(raw?.QTD_ESTOQUE || 0)
  const unit = String(raw?.UND_MEDIDA || '').toUpperCase()
  if (unit === 'KG') return stock
  const weightPerUnit = Number(raw?.PESO_PRODUTO || 0)
  return weightPerUnit > 0 ? stock * weightPerUnit : stock
}

function stockRiskLabel({ stockKg, theoreticalBalance, minimumStock }) {
  if (theoreticalBalance === null || minimumStock === null) return 'Sem base'
  if (stockKg <= 0 || theoreticalBalance <= 0) return 'Critico'
  if (minimumStock > 0 && theoreticalBalance <= minimumStock) return 'Alto'
  if (minimumStock > 0 && stockKg <= minimumStock) return 'Atencao'
  return 'Controlado'
}

function stockRiskClass(value) {
  return String(value || '').toLowerCase().replace(/\s+/g, '-')
}

function Metric({ icon: Icon, label, value, note, tone = '' }) {
  return <article className={`stock-metric ${tone}`}><Icon size={18} /><span>{label}</span><strong>{value}</strong><small>{note}</small></article>
}

export default function Estoque() {
  const [products, setProducts] = useState([])
  const [items, setItems] = useState([])
  const [category, setCategory] = useState('todas')
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    async function load() {
      const start = new Date()
      start.setDate(start.getDate() - 90)
      const [productsResult, itemsResult] = await Promise.all([
        supabaseAdmin.from('erp_products').select('id,name,codproduto,codproduto_clas,updated_at,raw'),
        supabaseAdmin.from('fiscal_document_items').select('product_code,quantity,fiscal_documents!inner(issue_date,movement_type)').gte('fiscal_documents.issue_date', start.toISOString().slice(0, 10)),
      ])
      setProducts((productsResult.data || []).map(product => ({
        ...product,
        ultra_codproduto: product.codproduto,
        ultra_codproduto_clas: product.codproduto_clas,
        ultra_last_sync_at: product.updated_at,
        ultra_raw: product.raw,
      })))
      setItems(itemsResult.data || [])
      setLoading(false)
    }
    load()
  }, [])

  const data = useMemo(() => {
    const sold90 = new Map()
    const lastMovement = new Map()
    items.forEach(item => {
      const productCode = code(item.product_code)
      const quantity = Number(item.quantity || 0)
      sold90.set(productCode, (sold90.get(productCode) || 0) + quantity)
      const issueDate = item.fiscal_documents?.issue_date || null
      const current = lastMovement.get(productCode)
      if (issueDate && (!current || issueDate > current)) lastMovement.set(productCode, issueDate)
    })
    const rows = products.map(product => {
      const raw = product.ultra_raw || {}
      const stock = Number(raw.QTD_ESTOQUE || 0)
      const stockKg = stockKgFromRaw(raw)
      const pendingOrders = hasOwn(raw, 'QTD_PEDIDO') ? Number(raw.QTD_PEDIDO || 0) : null
      const theoreticalBalance = hasOwn(raw, 'QTD_SALDO_TEORICO') ? Number(raw.QTD_SALDO_TEORICO || 0) : null
      const minimumStock = hasOwn(raw, 'ESTOQUE_MINIMO') ? Number(raw.ESTOQUE_MINIMO || 0) : null
      const cost = Number(raw.CUSTO || 0)
      const price = Number(raw.PRECO || product.price || 0)
      const sold = sold90.get(String(product.ultra_codproduto)) || 0
      const daily = Math.max(0, sold / 90)
      const days = daily > 0 ? Math.max(0, stockKg) / daily : null
      const monthlyAverageSold = sold / 3
      const lastSaleDate = lastMovement.get(String(product.ultra_codproduto)) || null
      const idleDays = daysBetween(lastSaleDate)
      const stockRisk = stockRiskLabel({ stockKg, theoreticalBalance, minimumStock })
      return {
        ...product,
        category: raw.DSCGRUPO || raw.DSCGRUPO_NIVEL1 || 'Outros',
        unit: raw.UND_MEDIDA || 'UN', stock, stockKg, pendingOrders, theoreticalBalance, minimumStock, cost, price, sold,
        costValue: Math.max(0, stockKg) * cost,
        billingCapacity: Math.max(0, stockKg) * price,
        potentialMargin: Math.max(0, stockKg) * Math.max(0, price - cost),
        marginPct: price > 0 ? ((price - cost) / price) * 100 : 0,
        days,
        monthlyAverageSold,
        lastSaleDate,
        idleDays,
        stockRisk,
      }
    })
    const filtered = category === 'todas' ? rows : rows.filter(row => row.category === category)
    const positive = filtered.filter(row => row.stockKg > 0)
    const stock = positive.reduce((sum, row) => sum + row.stockKg, 0)
    const costValue = positive.reduce((sum, row) => sum + row.costValue, 0)
    const billingCapacity = positive.reduce((sum, row) => sum + row.billingCapacity, 0)
    const potentialMargin = positive.reduce((sum, row) => sum + row.potentialMargin, 0)
    const withoutStock = filtered.filter(row => row.stockKg <= 0).length
    const slow = filtered.filter(row => row.stockKg > 0 && (row.days === null || row.days > 90)).length
    const sold90Total = filtered.reduce((sum, row) => sum + row.sold, 0)
    const annualizedTurnover = stock > 0 ? (sold90Total / stock) * 4 : 0
    return {
      rows: filtered.sort((a, b) => b.costValue - a.costValue), stock, costValue, billingCapacity, potentialMargin, withoutStock, slow, sold90: sold90Total, annualizedTurnover,
      categories: [...new Set(rows.map(row => row.category))].sort(),
      topValue: [...filtered].sort((a, b) => b.costValue - a.costValue).slice(0, 10),
      updatedAt: products.map(product => product.ultra_last_sync_at).filter(Boolean).sort().at(-1),
    }
  }, [products, items, category])

  return <div style={{ flex: 1, overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>
    <Topbar title="Estoque" subtitle="Saldo, giro, valor imobilizado e capacidade de faturamento" />
    <div className="page stock-page" style={{ overflowY: 'auto' }}>
      <section className="stock-toolbar"><select value={category} onChange={event => setCategory(event.target.value)}><option value="todas">Todas as categorias</option>{data.categories.map(value => <option key={value}>{value}</option>)}</select><span>{data.updatedAt ? `Ultra atualizado em ${new Date(data.updatedAt).toLocaleString('pt-BR')}` : 'Aguardando sincronização do Ultra'}</span></section>
      {loading ? <div className="empty">Carregando estoque do Ultra...</div> : <>
        <section className="stock-hero"><div><span>Capacidade comercial do estoque</span><h2>{moneyShort(data.billingCapacity)}</h2><small>potencial de faturamento pelo preço atual do Ultra</small></div><div><span>Margem bruta potencial</span><strong>{moneyShort(data.potentialMargin)}</strong><small>antes de impostos, frete e despesas</small></div></section>
        <section className="stock-metrics stock-metrics-expanded">
          <Metric icon={IconPackage} label="Saldo em estoque" value={`${weight(data.stock)} kg`} note="quantidade disponível" />
          <Metric icon={IconCoins} label="Valor pelo custo" value={moneyShort(data.costValue)} note="capital imobilizado" />
          <Metric icon={IconTrendingUp} label="Capacidade de venda" value={moneyShort(data.billingCapacity)} note="saldo multiplicado pelo preço" />
          <Metric icon={IconAlertTriangle} label="Sem estoque" value={data.withoutStock} note="produtos zerados ou negativos" tone="danger" />
          <Metric icon={IconChartBar} label="Baixo giro" value={data.slow} note="mais de 90 dias ou sem saída" tone="warning" />
          <Metric icon={IconChartBar} label="Giro anualizado" value={`${data.annualizedTurnover.toFixed(2)}x`} note="saídas de 90 dias sobre saldo atual" />
        </section>
        <section className="stock-grid">
          <div className="stock-card"><div className="stock-card-head"><div><span>Capital imobilizado</span><h3>Produtos com maior valor em estoque</h3></div></div><ResponsiveContainer width="100%" height={330}><BarChart data={data.topValue} layout="vertical" margin={{ left: 18, right: 26 }}><defs><linearGradient id="stockBar" x1="0" y1="0" x2="1" y2="0"><stop offset="0%" stopColor="#C85F18" /><stop offset="100%" stopColor="#F39A55" /></linearGradient></defs><CartesianGrid stroke="#E9E4DE" strokeDasharray="2 7" horizontal={false} /><XAxis type="number" tickFormatter={value => `R$ ${Math.round(value / 1000)}k`} /><YAxis type="category" dataKey="name" width={150} tick={{ fontSize: 11 }} /><Tooltip formatter={value => money(value)} /><Bar dataKey="costValue" name="Valor pelo custo" fill="url(#stockBar)" radius={[0, 7, 7, 0]} /></BarChart></ResponsiveContainer></div>
          <div className="stock-card stock-alert-list"><div className="stock-card-head"><div><span>Reposição</span><h3>Rupturas e saldos negativos</h3></div></div>{data.rows.filter(row => row.stock <= 0).slice(0, 12).map(row => <div key={row.id}><IconBox size={15} /><span><strong>{row.name}</strong><small>{row.category}</small></span><b>{number(row.stock)} {row.unit}</b></div>)}</div>
        </section>
        <section className="stock-card stock-inventory-card">
          <div className="stock-card-head">
            <div className="stock-inventory-head-copy">
              <span>Inventário gerencial</span>
              <h3>Estoque em kg, custo, giro e permanência por produto</h3>
            </div>
            <small>{data.rows.filter(row => row.stockKg > 0).length} produtos com saldo</small>
          </div>
          <p className="stock-table-note">Esta visão usa o saldo atual do Ultra e o histórico de saídas fiscais para mostrar estoque, pedidos pendentes, saldo teórico, estoque mínimo e dias desde a última saída.</p>
          {data.rows.filter(row => row.stockKg > 0).length > 0 ? (
            <div className="table-wrap stock-table-wrap">
              <table className="stock-table">
                <thead>
                  <tr>
                    <th>Produto</th>
                    <th>Categoria</th>
                    <th style={{ textAlign: 'right' }}>Estoque (kg)</th>
                    <th style={{ textAlign: 'right' }}>Pendente pedido</th>
                    <th style={{ textAlign: 'right' }}>Saldo teórico</th>
                    <th style={{ textAlign: 'right' }}>Estoque mínimo</th>
                    <th style={{ textAlign: 'right' }}>Custo/kg</th>
                    <th style={{ textAlign: 'right' }}>Total custo</th>
                    <th style={{ textAlign: 'right' }}>Media mensal vendida</th>
                    <th style={{ textAlign: 'right' }}>Cobertura em dias</th>
                    <th style={{ textAlign: 'right' }}>Risco de ruptura</th>
                    <th style={{ textAlign: 'right' }}>Dias desde a última saída</th>
                  </tr>
                </thead>
                <tbody>
                  {data.rows.filter(row => row.stockKg > 0).map(row => (
                    <tr key={row.id}>
                      <td><strong>{row.name}</strong></td>
                      <td>{row.category}</td>
                      <td style={{ textAlign: 'right' }}>{weight(row.stockKg)} kg</td>
                      <td style={{ textAlign: 'right' }}>{row.pendingOrders === null ? '—' : weight(row.pendingOrders)}</td>
                      <td style={{ textAlign: 'right' }}>{row.theoreticalBalance === null ? '—' : weight(row.theoreticalBalance)}</td>
                      <td style={{ textAlign: 'right' }}>{row.minimumStock === null ? '—' : weight(row.minimumStock)}</td>
                      <td style={{ textAlign: 'right' }}>{money(row.cost)}</td>
                      <td style={{ textAlign: 'right' }}>{moneyShort(row.costValue)}</td>
                      <td style={{ textAlign: 'right' }}>{row.monthlyAverageSold > 0 ? `${weight(row.monthlyAverageSold)} kg` : 'Sem venda'}</td>
                      <td style={{ textAlign: 'right' }}>{row.days === null ? 'Sem giro' : `${numberInt(row.days)} dias`}</td>
                      <td style={{ textAlign: 'right' }}><span className={`stock-risk ${stockRiskClass(row.stockRisk)}`}>{row.stockRisk}</span></td>
                      <td style={{ textAlign: 'right' }}>{row.idleDays === null ? 'Sem saída' : `${numberInt(row.idleDays)} dias`}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <div className="stock-table-empty">Nenhum produto com saldo disponível no Ultra para exibir nesta visão.</div>
          )}
        </section>
      </>}
    </div>
  </div>
}
