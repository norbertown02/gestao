import { useEffect, useMemo, useState } from 'react'
import { IconArrowLeft, IconCheck, IconTargetArrow, IconTrendingUp, IconUser } from '@tabler/icons-react'
import { Bar, CartesianGrid, ComposedChart, Line, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'
import { supabaseAdmin } from '../lib/supabase'
import { hasNetOrderValue, netOrderValue } from '../lib/commercialMetrics'
import Topbar from '../components/Topbar'

const money = value => Number(value || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })
const moneyShort = value => {
  const number = Number(value || 0)
  if (Math.abs(number) >= 1000000) return `R$ ${(number / 1000000).toFixed(1)} mi`
  if (Math.abs(number) >= 1000) return `R$ ${(number / 1000).toFixed(0)} mil`
  return money(number)
}
const monthName = month => new Date(2024, month - 1, 1).toLocaleDateString('pt-BR', { month: 'short' }).replace('.', '')
const sellerKey = row => row.seller_id || (row.ultra_salesman_id ? `ultra:${row.ultra_salesman_id}` : null)
const goalKey = goal => goal.seller_id || (goal.ultra_salesman_id ? `ultra:${goal.ultra_salesman_id}` : null)
const CURRENT_YEAR = new Date().getFullYear()
const CURRENT_MONTH = new Date().getMonth() + 1

export default function Metas() {
  const [year, setYear] = useState(CURRENT_YEAR)
  const [month, setMonth] = useState(CURRENT_MONTH)
  const [selectedSeller, setSelectedSeller] = useState('todos')
  const [tab, setTab] = useState('acompanhamento')
  const [sellers, setSellers] = useState([])
  const [goals, setGoals] = useState([])
  const [documents, setDocuments] = useState([])
  const [loading, setLoading] = useState(true)
  const [editGoals, setEditGoals] = useState({})
  const [saving, setSaving] = useState({})

  useEffect(() => {
    async function load() {
      setLoading(true)
      const [profilesResult, goalsResult, documentsResult] = await Promise.all([
        supabaseAdmin.from('profiles').select('id,name,email,role').eq('active', true).order('name'),
        supabaseAdmin.from('goals').select('*,erp_salesmen(name)').eq('ano', year),
        supabaseAdmin.from('management_order_overview').select('sale_date,order_value,order_stage,fiscal_returned_value,seller_id,ultra_salesman_id,ultra_salesman_name').gte('sale_date', `${year}-01-01`).lte('sale_date', `${year}-12-31`),
      ])
      setSellers(profilesResult.data || [])
      setGoals(goalsResult.data || [])
      setDocuments(documentsResult.data || [])
      const values = {}
      ;(goalsResult.data || []).filter(goal => goal.mes === month).forEach(goal => { values[goalKey(goal)] = goal.meta_fat })
      setEditGoals(values)
      setLoading(false)
    }
    load()
  }, [year, month])

  const data = useMemo(() => {
    const profileMap = new Map(sellers.map(seller => [seller.id, seller]))
    const sellerMap = new Map(sellers.map(seller => [seller.id, seller.name || seller.email]))
    goals.forEach(goal => { const key = goalKey(goal); if (key && !sellerMap.has(key)) sellerMap.set(key, goal.erp_salesmen?.name || 'Vendedor ULTRA') })
    documents.forEach(doc => {
      const key = sellerKey(doc)
      if (key && !sellerMap.has(key)) sellerMap.set(key, doc.ultra_salesman_name || 'Vendedor não vinculado')
    })

    const sellerOptions = [...sellerMap.entries()].sort((a, b) => a[1].localeCompare(b[1]))
    const filteredDocs = selectedSeller === 'todos' ? documents : documents.filter(doc => sellerKey(doc) === selectedSeller)
    const filteredGoals = selectedSeller === 'todos' ? goals : goals.filter(goal => goalKey(goal) === selectedSeller)
    const months = Array.from({ length: 12 }, (_, index) => {
      const value = index + 1
      const realized = filteredDocs.filter(doc => Number(doc.sale_date?.slice(5, 7)) === value && hasNetOrderValue(doc)).reduce((sum, doc) => sum + netOrderValue(doc), 0)
      const goal = filteredGoals.filter(item => item.mes === value).reduce((sum, item) => sum + Number(item.meta_fat || 0), 0)
      return { month: value, label: monthName(value), Realizado: realized, Meta: goal }
    })

    const current = months[month - 1]
    const ytdMonths = months.filter(item => item.month <= (year === CURRENT_YEAR ? CURRENT_MONTH : 12))
    const realizedYtd = ytdMonths.reduce((sum, item) => sum + item.Realizado, 0)
    const goalYtd = ytdMonths.reduce((sum, item) => sum + item.Meta, 0)
    const attainmentYtd = goalYtd ? (realizedYtd / goalYtd) * 100 : 0

    const team = sellerOptions.map(([id, name]) => {
      const realized = documents.filter(doc => sellerKey(doc) === id && Number(doc.sale_date?.slice(5, 7)) === month && hasNetOrderValue(doc)).reduce((sum, doc) => sum + netOrderValue(doc), 0)
      const goal = goals.filter(item => goalKey(item) === id && item.mes === month).reduce((sum, item) => sum + Number(item.meta_fat || 0), 0)
      return { id, name, profile: profileMap.get(id), realized, goal, percent: goal ? (realized / goal) * 100 : 0 }
    }).sort((a, b) => b.realized - a.realized)

    return { sellerOptions, months, current, realizedYtd, goalYtd, attainmentYtd, team }
  }, [documents, goals, sellers, selectedSeller, month, year])

  const years = Array.from({ length: 4 }, (_, index) => CURRENT_YEAR - index)
  const selectedName = selectedSeller === 'todos' ? 'Time comercial' : data.sellerOptions.find(([id]) => id === selectedSeller)?.[1]

  async function saveGoal(sellerId) {
    const value = Number(String(editGoals[sellerId] || 0).replace(',', '.'))
    setSaving(current => ({ ...current, [sellerId]: true }))
    const existing = goals.find(goal => goalKey(goal) === sellerId && goal.mes === month)
    const ultraSalesmanId = sellerId.startsWith('ultra:') ? Number(sellerId.slice(6)) : null
    const result = existing
      ? await supabaseAdmin.from('goals').update({ meta_fat: value, updated_at: new Date().toISOString() }).eq('id', existing.id).select().single()
      : await supabaseAdmin.from('goals').insert({ seller_id: ultraSalesmanId ? null : sellerId, ultra_salesman_id: ultraSalesmanId, ano: year, mes: month, meta_fat: value }).select().single()
    if (result.data) setGoals(current => existing ? current.map(goal => goal.id === existing.id ? result.data : goal) : [...current, result.data])
    setSaving(current => ({ ...current, [sellerId]: false }))
  }

  return (
    <div style={{ flex: 1, overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>
      <Topbar title="Metas Comerciais" subtitle="Pedidos mensais e acumulados por vendedor" />
      <div className="page goals-page" style={{ overflowY: 'auto' }}>
        <section className="goals-toolbar">
          <div>
            {selectedSeller !== 'todos' && <button className="goals-back" onClick={() => setSelectedSeller('todos')}><IconArrowLeft size={16} />Voltar ao time</button>}
            <select value={year} onChange={event => setYear(Number(event.target.value))}>{years.map(value => <option key={value}>{value}</option>)}</select>
            <select value={month} onChange={event => setMonth(Number(event.target.value))}>{Array.from({ length: 12 }, (_, index) => <option key={index + 1} value={index + 1}>{monthName(index + 1)}</option>)}</select>
            <select value={selectedSeller} onChange={event => setSelectedSeller(event.target.value)}>
              <option value="todos">Todo o time</option>
              {data.sellerOptions.map(([id, name]) => <option key={id} value={id}>{name}</option>)}
            </select>
          </div>
          <div className="goals-tabs"><button className={tab === 'acompanhamento' ? 'active' : ''} onClick={() => setTab('acompanhamento')}>Acompanhamento</button><button className={tab === 'cadastro' ? 'active' : ''} onClick={() => setTab('cadastro')}>Definir metas</button></div>
        </section>

        {loading ? <div className="empty">Carregando metas...</div> : tab === 'acompanhamento' ? <>
          <section className="goals-year-card">
            <div><span className="goals-eyebrow">Acumulado no ano · {selectedName}</span><h2>{moneyShort(data.realizedYtd)}</h2><small>pedidos líquidos de janeiro até o período atual</small></div>
            <div className="goals-year-stats">
              <div><span>Meta acumulada</span><strong>{data.goalYtd ? moneyShort(data.goalYtd) : '—'}</strong></div>
              <div><span>Atingimento</span><strong>{data.goalYtd ? `${data.attainmentYtd.toFixed(1)}%` : '—'}</strong></div>
              <div><span>Saldo</span><strong>{data.goalYtd ? moneyShort(data.realizedYtd - data.goalYtd) : '—'}</strong></div>
            </div>
            <div className="goals-progress"><span style={{ width: `${Math.min(100, data.attainmentYtd)}%` }} /></div>
          </section>

          <section className="goals-kpis">
            <article><IconTrendingUp /><span>Realizado no mês</span><strong>{moneyShort(data.current.Realizado)}</strong></article>
            <article><IconTargetArrow /><span>Meta do mês</span><strong>{data.current.Meta ? moneyShort(data.current.Meta) : '—'}</strong></article>
            <article><IconCheck /><span>Atingimento mensal</span><strong>{data.current.Meta ? `${((data.current.Realizado / data.current.Meta) * 100).toFixed(1)}%` : '—'}</strong></article>
          </section>

          <section className="goals-chart-card">
            <div className="goals-card-head"><div><span className="goals-eyebrow">Linha de safra comercial</span><h3>Pedidos versus meta mês a mês</h3></div><small>pedidos líquidos após cancelamentos e devoluções</small></div>
            <ResponsiveContainer width="100%" height={330}>
              <ComposedChart data={data.months} margin={{ top: 20, right: 20, left: 6, bottom: 0 }}>
                <CartesianGrid strokeDasharray="4 6" vertical={false} />
                <XAxis dataKey="label" tickLine={false} axisLine={false} />
                <YAxis tickLine={false} axisLine={false} tickFormatter={value => `${Math.round(value / 1000)}k`} />
                <Tooltip formatter={(value, name) => [money(value), name]} />
                <Bar dataKey="Realizado" fill="var(--orange)" radius={[6, 6, 0, 0]} maxBarSize={34} />
                <Line type="monotone" dataKey="Meta" stroke="#393532" strokeWidth={2.5} strokeDasharray="5 6" dot={false} activeDot={{ r: 5, fill: '#393532', stroke: '#fff', strokeWidth: 3 }} />
              </ComposedChart>
            </ResponsiveContainer>
          </section>

          {selectedSeller === 'todos' && <section className="goals-team-grid">{data.team.map(seller => <button key={seller.id} onClick={() => setSelectedSeller(seller.id)}>
            <div className="goals-avatar"><IconUser size={17} /></div><div><strong>{seller.name}</strong><span>{moneyShort(seller.realized)} de {seller.goal ? moneyShort(seller.goal) : 'meta não definida'}</span><i className="goals-seller-progress"><em style={{ width: `${Math.min(100, seller.percent)}%` }} /></i></div><b>{seller.goal ? `${seller.percent.toFixed(0)}%` : '—'}</b>
          </button>)}</section>}
        </> : <section className="goals-editor">
          <div className="goals-card-head"><div><span className="goals-eyebrow">Planejamento interno</span><h3>Metas de {monthName(month)} de {year}</h3></div><small>cadastro centralizado no Gestão</small></div>
          {data.sellerOptions.map(([sellerId, sellerName]) => <div className="goals-editor-row" key={sellerId}>
            <div className="goals-avatar">{(sellerName || 'V').charAt(0)}</div><div><strong>{sellerName}</strong><span>Meta mensal de pedidos</span></div>
            <label>R$ <input type="number" value={editGoals[sellerId] || ''} onChange={event => setEditGoals(current => ({ ...current, [sellerId]: event.target.value }))} placeholder="0,00" /></label>
            <button className="btn btn-primary btn-sm" onClick={() => saveGoal(sellerId)} disabled={saving[sellerId]}><IconCheck size={14} />{saving[sellerId] ? 'Salvando' : 'Salvar'}</button>
          </div>)}
        </section>}
      </div>
    </div>
  )
}
