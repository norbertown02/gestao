import { useEffect, useMemo, useState } from 'react'
import { IconCheck, IconTargetArrow, IconTrendingUp, IconUser } from '@tabler/icons-react'
import { Bar, CartesianGrid, ComposedChart, Line, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'
import { supabaseAdmin } from '../lib/supabase'
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
const CURRENT_YEAR = new Date().getFullYear()
const CURRENT_MONTH = new Date().getMonth() + 1

export default function Metas() {
  const [year, setYear] = useState(CURRENT_YEAR)
  const [month, setMonth] = useState(CURRENT_MONTH)
  const [selectedSeller, setSelectedSeller] = useState('todos')
  const [sellers, setSellers] = useState([])
  const [goals, setGoals] = useState([])
  const [documents, setDocuments] = useState([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    async function load() {
      setLoading(true)
      const [profilesResult, goalsResult, documentsResult] = await Promise.all([
        supabaseAdmin.from('profiles').select('id,name,email,role').eq('active', true).order('name'),
        supabaseAdmin.from('goals').select('*').eq('ano', year),
        supabaseAdmin.from('fiscal_documents').select('issue_date,document_total,seller_id,ultra_salesman_id,salesman_name').gte('issue_date', `${year}-01-01`).lte('issue_date', `${year}-12-31`),
      ])
      setSellers(profilesResult.data || [])
      setGoals(goalsResult.data || [])
      setDocuments(documentsResult.data || [])
      setLoading(false)
    }
    load()
  }, [year, month])

  const data = useMemo(() => {
    const profileMap = new Map(sellers.map(seller => [seller.id, seller]))
    const sellerMap = new Map(sellers.map(seller => [seller.id, seller.name || seller.email]))
    documents.forEach(doc => {
      const key = sellerKey(doc)
      if (key && !sellerMap.has(key)) sellerMap.set(key, doc.salesman_name || 'Vendedor não vinculado')
    })

    const sellerOptions = [...sellerMap.entries()].sort((a, b) => a[1].localeCompare(b[1]))
    const filteredDocs = selectedSeller === 'todos' ? documents : documents.filter(doc => sellerKey(doc) === selectedSeller)
    const filteredGoals = selectedSeller === 'todos' ? goals : goals.filter(goal => goal.seller_id === selectedSeller)
    const months = Array.from({ length: 12 }, (_, index) => {
      const value = index + 1
      const realized = filteredDocs.filter(doc => Number(doc.issue_date?.slice(5, 7)) === value).reduce((sum, doc) => sum + Number(doc.document_total || 0), 0)
      const goal = filteredGoals.filter(item => item.mes === value).reduce((sum, item) => sum + Number(item.meta_fat || 0), 0)
      return { month: value, label: monthName(value), Realizado: realized, Meta: goal }
    })

    const current = months[month - 1]
    const ytdMonths = months.filter(item => item.month <= (year === CURRENT_YEAR ? CURRENT_MONTH : 12))
    const realizedYtd = ytdMonths.reduce((sum, item) => sum + item.Realizado, 0)
    const goalYtd = ytdMonths.reduce((sum, item) => sum + item.Meta, 0)
    const attainmentYtd = goalYtd ? (realizedYtd / goalYtd) * 100 : 0

    const team = sellerOptions.map(([id, name]) => {
      const realized = documents.filter(doc => sellerKey(doc) === id && Number(doc.issue_date?.slice(5, 7)) === month).reduce((sum, doc) => sum + Number(doc.document_total || 0), 0)
      const goal = goals.filter(item => item.seller_id === id && item.mes === month).reduce((sum, item) => sum + Number(item.meta_fat || 0), 0)
      return { id, name, profile: profileMap.get(id), realized, goal, percent: goal ? (realized / goal) * 100 : 0 }
    }).sort((a, b) => b.realized - a.realized)

    return { sellerOptions, months, current, realizedYtd, goalYtd, attainmentYtd, team }
  }, [documents, goals, sellers, selectedSeller, month, year])

  const years = Array.from({ length: 4 }, (_, index) => CURRENT_YEAR - index)
  const selectedName = selectedSeller === 'todos' ? 'Time comercial' : data.sellerOptions.find(([id]) => id === selectedSeller)?.[1]

  return (
    <div style={{ flex: 1, overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>
      <Topbar title="Metas Comerciais" subtitle="Resultado mensal e acumulado por vendedor" />
      <div className="page goals-page" style={{ overflowY: 'auto' }}>
        <section className="goals-toolbar">
          <div>
            <select value={year} onChange={event => setYear(Number(event.target.value))}>{years.map(value => <option key={value}>{value}</option>)}</select>
            <select value={month} onChange={event => setMonth(Number(event.target.value))}>{Array.from({ length: 12 }, (_, index) => <option key={index + 1} value={index + 1}>{monthName(index + 1)}</option>)}</select>
            <select value={selectedSeller} onChange={event => setSelectedSeller(event.target.value)}>
              <option value="todos">Todo o time</option>
              {data.sellerOptions.map(([id, name]) => <option key={id} value={id}>{name}</option>)}
            </select>
          </div>
          <span className="goals-source">Somente leitura · fonte Ultra</span>
        </section>

        {loading ? <div className="empty">Carregando metas...</div> : <>
          <section className="goals-year-card">
            <div><span className="goals-eyebrow">Acumulado no ano · {selectedName}</span><h2>{moneyShort(data.realizedYtd)}</h2><small>faturamento líquido de janeiro até o período atual</small></div>
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
            <div className="goals-card-head"><div><span className="goals-eyebrow">Linha de safra comercial</span><h3>Vendas versus meta mês a mês</h3></div><small>realizado líquido após devoluções</small></div>
            <ResponsiveContainer width="100%" height={330}>
              <ComposedChart data={data.months} margin={{ top: 20, right: 20, left: 6, bottom: 0 }}>
                <CartesianGrid strokeDasharray="4 6" vertical={false} />
                <XAxis dataKey="label" tickLine={false} axisLine={false} />
                <YAxis tickLine={false} axisLine={false} tickFormatter={value => `${Math.round(value / 1000)}k`} />
                <Tooltip formatter={(value, name) => [money(value), name]} />
                <Bar dataKey="Realizado" fill="var(--orange)" radius={[6, 6, 0, 0]} maxBarSize={34} />
                <Line type="monotone" dataKey="Meta" stroke="#486b5a" strokeWidth={3} dot={{ r: 4 }} />
              </ComposedChart>
            </ResponsiveContainer>
          </section>

          {selectedSeller === 'todos' && <section className="goals-team-grid">{data.team.map(seller => <button key={seller.id} onClick={() => setSelectedSeller(seller.id)}>
            <div className="goals-avatar"><IconUser size={17} /></div><div><strong>{seller.name}</strong><span>{moneyShort(seller.realized)} de {seller.goal ? moneyShort(seller.goal) : 'meta não definida'}</span></div><b>{seller.goal ? `${seller.percent.toFixed(0)}%` : '—'}</b>
          </button>)}</section>}
        </>}
      </div>
    </div>
  )
}
