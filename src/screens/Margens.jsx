import { useEffect, useMemo, useState } from 'react'
import { IconChartDonut, IconCoins, IconPlus, IconReceipt, IconScale, IconTargetArrow, IconTrash } from '@tabler/icons-react'
import { Bar, CartesianGrid, ComposedChart, Line, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'
import Topbar from '../components/Topbar'
import { supabaseAdmin } from '../lib/supabase'

const money = value => Number(value || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })
const shortMoney = value => {
  const number = Number(value || 0)
  if (Math.abs(number) >= 1000000) return `R$ ${(number / 1000000).toFixed(2)} mi`
  if (Math.abs(number) >= 1000) return `R$ ${(number / 1000).toFixed(0)} mil`
  return money(number)
}
const monthLabel = value => new Date(`${value}-02T12:00:00`).toLocaleDateString('pt-BR', { month: 'short' }).replace('.', '')
const productCode = value => String(value || '').split('/')[0]

function Kpi({ icon: Icon, label, value, note, tone = '' }) {
  return <article className={`margin-kpi ${tone}`}><Icon size={19} /><span>{label}</span><strong>{value}</strong><small>{note}</small></article>
}

export default function Margens() {
  const now = new Date()
  const [year, setYear] = useState(now.getFullYear())
  const [month, setMonth] = useState(now.getMonth() + 1)
  const [documents, setDocuments] = useState([])
  const [products, setProducts] = useState([])
  const [costs, setCosts] = useState([])
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [form, setForm] = useState({ category: 'Administrativo', description: '', cost_type: 'fixo', amount: '' })

  useEffect(() => {
    async function load() {
      setLoading(true)
      const [docsResult, productsResult, costsResult] = await Promise.all([
        supabaseAdmin.from('fiscal_documents').select('ultra_document_id,issue_date,document_total,movement_type,fiscal_document_items(product_code,product_name,quantity,product_total)').gte('issue_date', `${year}-01-01`).lte('issue_date', `${year}-12-31`),
        supabaseAdmin.from('erp_products').select('codproduto,name,raw'),
        supabaseAdmin.from('company_costs').select('*').gte('competence', `${year}-01-01`).lte('competence', `${year}-12-01`).order('competence').order('category'),
      ])
      setDocuments(docsResult.data || [])
      setProducts(productsResult.data || [])
      setCosts(costsResult.data || [])
      setLoading(false)
    }
    load()
  }, [year])

  const data = useMemo(() => {
    const costMap = new Map(products.map(product => [String(product.codproduto), Number(product.raw?.CUSTO || 0)]))
    const months = Array.from({ length: 12 }, (_, index) => {
      const value = index + 1
      const docs = documents.filter(doc => Number(doc.issue_date?.slice(5, 7)) === value)
      const revenue = docs.reduce((sum, doc) => sum + Number(doc.document_total || 0), 0)
      const productCost = docs.reduce((sum, doc) => {
        const sign = doc.movement_type === 'devolucao' ? -1 : 1
        return sum + (doc.fiscal_document_items || []).reduce((itemSum, item) => itemSum + sign * Number(item.quantity || 0) * (costMap.get(productCode(item.product_code)) || 0), 0)
      }, 0)
      const monthCosts = costs.filter(cost => Number(cost.competence?.slice(5, 7)) === value)
      const fixed = monthCosts.filter(cost => cost.cost_type === 'fixo').reduce((sum, cost) => sum + Number(cost.amount || 0), 0)
      const variable = monthCosts.filter(cost => cost.cost_type === 'variavel').reduce((sum, cost) => sum + Number(cost.amount || 0), 0)
      const grossMargin = revenue - productCost
      const contribution = grossMargin - variable
      return { month: value, label: monthLabel(`${year}-${String(value).padStart(2, '0')}`), Receita: revenue, CMV: productCost, Margem: grossMargin, Resultado: contribution - fixed, fixed, variable, contribution }
    })
    const current = months[month - 1]
    const grossPct = current.Receita ? current.Margem / current.Receita * 100 : 0
    const contributionPct = current.Receita ? current.contribution / current.Receita * 100 : 0
    const breakEven = contributionPct > 0 ? current.fixed / (contributionPct / 100) : 0
    const productRows = new Map()
    documents.filter(doc => Number(doc.issue_date?.slice(5, 7)) === month).forEach(doc => {
      const sign = doc.movement_type === 'devolucao' ? -1 : 1
      ;(doc.fiscal_document_items || []).forEach(item => {
        const code = productCode(item.product_code)
        const row = productRows.get(code) || { code, name: item.product_name || code, revenue: 0, cost: 0, quantity: 0 }
        row.revenue += sign * Number(item.product_total || 0)
        row.cost += sign * Number(item.quantity || 0) * (costMap.get(code) || 0)
        row.quantity += sign * Number(item.quantity || 0)
        productRows.set(code, row)
      })
    })
    const byProduct = [...productRows.values()].map(row => ({ ...row, margin: row.revenue - row.cost, percent: row.revenue ? (row.revenue - row.cost) / row.revenue * 100 : 0 })).sort((a, b) => b.margin - a.margin)
    return { months, current, grossPct, contributionPct, breakEven, byProduct }
  }, [documents, products, costs, month, year])

  async function addCost(event) {
    event.preventDefault()
    if (!form.description.trim() || Number(form.amount) <= 0) return
    setSaving(true)
    const result = await supabaseAdmin.from('company_costs').insert({ ...form, amount: Number(form.amount), competence: `${year}-${String(month).padStart(2, '0')}-01` }).select().single()
    if (result.data) setCosts(current => [...current, result.data])
    setForm(current => ({ ...current, description: '', amount: '' }))
    setSaving(false)
  }

  async function removeCost(id) {
    const result = await supabaseAdmin.from('company_costs').delete().eq('id', id)
    if (!result.error) setCosts(current => current.filter(cost => cost.id !== id))
  }

  const selectedCosts = costs.filter(cost => Number(cost.competence?.slice(5, 7)) === month)
  const years = Array.from({ length: 5 }, (_, offset) => now.getFullYear() - offset)

  return <div style={{ flex: 1, overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>
    <Topbar title="Custos e Margens" subtitle="Rentabilidade, estrutura de custos e ponto de equilíbrio" />
    <div className="page margin-page" style={{ overflowY: 'auto' }}>
      <section className="margin-toolbar"><div><select value={year} onChange={event => setYear(Number(event.target.value))}>{years.map(value => <option key={value}>{value}</option>)}</select><select value={month} onChange={event => setMonth(Number(event.target.value))}>{Array.from({ length: 12 }, (_, index) => <option key={index + 1} value={index + 1}>{monthLabel(`${year}-${String(index + 1).padStart(2, '0')}`)}</option>)}</select></div><span>CMV estimado pelo custo atual cadastrado no Ultra</span></section>
      {loading ? <div className="empty">Calculando estrutura de margens...</div> : <>
        <section className="margin-hero"><div><span>Resultado operacional estimado</span><h2>{shortMoney(data.current.Resultado)}</h2><small>margem de contribuição menos custos fixos cadastrados</small></div><div><span>Ponto de equilíbrio mensal</span><strong>{data.breakEven ? shortMoney(data.breakEven) : '—'}</strong><small>{data.contributionPct ? `margem de contribuição de ${data.contributionPct.toFixed(1)}%` : 'cadastre custos e aguarde faturamento'}</small></div></section>
        <section className="margin-kpis"><Kpi icon={IconReceipt} label="Receita líquida" value={shortMoney(data.current.Receita)} note="faturamento menos devoluções" /><Kpi icon={IconCoins} label="Custo dos produtos" value={shortMoney(data.current.CMV)} note="estimativa pelo custo Ultra" /><Kpi icon={IconChartDonut} label="Margem bruta" value={`${data.grossPct.toFixed(1)}%`} note={shortMoney(data.current.Margem)} tone="accent" /><Kpi icon={IconScale} label="Custos fixos" value={shortMoney(data.current.fixed)} note="despesas mensais cadastradas" /><Kpi icon={IconTargetArrow} label="Custos variáveis" value={shortMoney(data.current.variable)} note="fora do custo dos produtos" /></section>
        <section className="margin-grid"><div className="margin-card margin-chart"><div className="margin-card-head"><div><span>Evolução anual</span><h3>Receita, margem e resultado operacional</h3></div></div><ResponsiveContainer width="100%" height={340}><ComposedChart data={data.months} margin={{ top: 18, right: 20, left: 8 }}><CartesianGrid stroke="#E9E4DE" strokeDasharray="2 7" vertical={false} /><XAxis dataKey="label" tickLine={false} axisLine={false} /><YAxis tickLine={false} axisLine={false} width={68} tickFormatter={value => `R$ ${Math.round(value / 1000)}k`} /><Tooltip formatter={(value, name) => [money(value), name]} /><Bar dataKey="Margem" fill="#E87722" radius={[6, 6, 0, 0]} maxBarSize={30} /><Line type="monotone" dataKey="Receita" stroke="#292623" strokeWidth={2.5} dot={false} /><Line type="monotone" dataKey="Resultado" stroke="#A79C92" strokeWidth={2} strokeDasharray="5 6" dot={false} /></ComposedChart></ResponsiveContainer></div>
          <div className="margin-card"><div className="margin-card-head"><div><span>Estrutura mensal</span><h3>Custos gerais da empresa</h3></div><small>{selectedCosts.length} lançamento(s)</small></div><form className="cost-form" onSubmit={addCost}><select value={form.cost_type} onChange={event => setForm(current => ({ ...current, cost_type: event.target.value }))}><option value="fixo">Fixo</option><option value="variavel">Variável</option></select><select value={form.category} onChange={event => setForm(current => ({ ...current, category: event.target.value }))}><option>Administrativo</option><option>Folha e encargos</option><option>Estrutura</option><option>Logística</option><option>Marketing</option><option>Financeiro</option><option>Outros</option></select><input value={form.description} onChange={event => setForm(current => ({ ...current, description: event.target.value }))} placeholder="Descrição do custo" /><input type="number" min="0" step="0.01" value={form.amount} onChange={event => setForm(current => ({ ...current, amount: event.target.value }))} placeholder="R$ 0,00" /><button className="btn btn-primary btn-sm" disabled={saving}><IconPlus size={15} />Adicionar</button></form><div className="cost-list">{selectedCosts.map(cost => <div key={cost.id}><i className={cost.cost_type} /><span><strong>{cost.description}</strong><small>{cost.category} · {cost.cost_type}</small></span><b>{money(cost.amount)}</b><button onClick={() => removeCost(cost.id)} aria-label={`Excluir ${cost.description}`}><IconTrash size={15} /></button></div>)}{!selectedCosts.length && <p>Cadastre os custos gerais desta competência para calcular o ponto de equilíbrio.</p>}</div></div></section>
        <section className="margin-card"><div className="margin-card-head"><div><span>Rentabilidade por produto</span><h3>Produtos que mais contribuem para a margem</h3></div><small>{data.byProduct.length} produto(s) faturado(s)</small></div><div className="table-wrap"><table><thead><tr><th>Produto</th><th style={{ textAlign: 'right' }}>Quantidade</th><th style={{ textAlign: 'right' }}>Receita</th><th style={{ textAlign: 'right' }}>Custo estimado</th><th style={{ textAlign: 'right' }}>Margem bruta</th><th style={{ textAlign: 'right' }}>Margem %</th></tr></thead><tbody>{data.byProduct.map(row => <tr key={row.code}><td><strong>{row.name}</strong><small>{row.code}</small></td><td style={{ textAlign: 'right' }}>{row.quantity.toLocaleString('pt-BR')}</td><td style={{ textAlign: 'right' }}>{money(row.revenue)}</td><td style={{ textAlign: 'right' }}>{money(row.cost)}</td><td style={{ textAlign: 'right' }}>{money(row.margin)}</td><td style={{ textAlign: 'right' }}><b className={row.percent < 20 ? 'margin-low' : ''}>{row.percent.toFixed(1)}%</b></td></tr>)}</tbody></table></div></section>
      </>}
    </div>
  </div>
}
