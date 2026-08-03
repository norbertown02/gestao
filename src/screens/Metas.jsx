import { useEffect, useMemo, useState } from 'react'
import { IconArrowLeft, IconCheck, IconClock, IconTargetArrow, IconTrendingUp } from '@tabler/icons-react'
import { Bar, CartesianGrid, ComposedChart, Line, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'
import { supabaseAdmin } from '../lib/supabase'
import { hasNetOrderValue, netOrderValue } from '../lib/commercialMetrics'
import { useVendedores } from '../lib/sellers'
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
const buildUltraToProfileId = profiles => new Map(profiles.filter(p => p.ultra_salesman_id).map(p => [p.ultra_salesman_id, p.id]))
// Uma linha com só ultra_salesman_id (sem seller_id) precisa resolver pra
// mesma chave do perfil já vinculado àquele vendedor, senão a mesma pessoa
// aparece "duplicada" -- uma vez pelo uuid do perfil, outra pelo "ultra:<id>".
const resolveKey = (rawKey, ultraToProfileId) => {
  if (typeof rawKey === 'string' && rawKey.startsWith('ultra:')) {
    return ultraToProfileId.get(Number(rawKey.slice(6))) || rawKey
  }
  return rawKey
}
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
  const { vendedores } = useVendedores()

  useEffect(() => {
    async function load() {
      setLoading(true)
      const [profilesResult, goalsResult, documentsResult] = await Promise.all([
        supabaseAdmin.from('profiles').select('id,name,email,role,ultra_salesman_id').eq('active', true).order('name'),
        supabaseAdmin.from('goals').select('*').eq('ano', year),
        supabaseAdmin.from('management_order_overview').select('sale_date,order_value,order_stage,fiscal_returned_value,seller_id,ultra_salesman_id,ultra_salesman_name').gte('sale_date', `${year}-01-01`).lte('sale_date', `${year}-12-31`),
      ])
      setSellers(profilesResult.data || [])
      setGoals(goalsResult.data || [])
      setDocuments(documentsResult.data || [])
      const ultraToProfileId = buildUltraToProfileId(profilesResult.data || [])
      const values = {}
      ;(goalsResult.data || []).filter(goal => goal.mes === month).forEach(goal => { values[resolveKey(goalKey(goal), ultraToProfileId)] = goal.meta_fat })
      setEditGoals(values)
      setLoading(false)
    }
    load()
  }, [year, month])

  const data = useMemo(() => {
    const profileMap = new Map(sellers.map(seller => [seller.id, seller]))
    // Só existe vendedor que vem do Ultra: a lista de opções (e quem aparece
    // pra definir/acompanhar meta) é sempre a lista canônica -- não emerge
    // mais de quem já tem meta ou pedido lançado, então um vendedor novo já
    // aparece pra receber meta antes da primeira venda.
    const ultraToProfileId = new Map(sellers.filter(s => s.ultra_salesman_id).map(s => [s.ultra_salesman_id, s.id]))
    const sellerOptions = vendedores
      .map(v => [ultraToProfileId.get(v.id) || `ultra:${v.id}`, v.name])
      .sort((a, b) => a[1].localeCompare(b[1]))
    const docKey = doc => resolveKey(sellerKey(doc), ultraToProfileId)
    const goalRowKey = goal => resolveKey(goalKey(goal), ultraToProfileId)
    const filteredDocs = selectedSeller === 'todos' ? documents : documents.filter(doc => docKey(doc) === selectedSeller)
    const filteredGoals = selectedSeller === 'todos' ? goals : goals.filter(goal => goalRowKey(goal) === selectedSeller)
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
      const realized = documents.filter(doc => docKey(doc) === id && Number(doc.sale_date?.slice(5, 7)) === month && hasNetOrderValue(doc)).reduce((sum, doc) => sum + netOrderValue(doc), 0)
      const goal = goals.filter(item => goalRowKey(item) === id && item.mes === month).reduce((sum, item) => sum + Number(item.meta_fat || 0), 0)
      const remaining = Math.max(0, goal - realized)
      return { id, name, profile: profileMap.get(id), realized, goal, remaining, percent: goal ? (realized / goal) * 100 : 0 }
    }).sort((a, b) => b.percent - a.percent || b.realized - a.realized)

    const now = new Date()
    const daysInMonth = new Date(year, month, 0).getDate()
    const isPast = new Date(year, month, 0) < new Date(now.getFullYear(), now.getMonth(), 1)
    const isFuture = new Date(year, month - 1, 1) > new Date(now.getFullYear(), now.getMonth(), 1)
    const elapsedDays = isPast ? daysInMonth : isFuture ? 0 : Math.max(1, now.getDate())
    const remainingDays = isPast ? 0 : isFuture ? daysInMonth : Math.max(0, daysInMonth - now.getDate())
    const actualPace = elapsedDays ? current.Realizado / elapsedDays : 0
    const requiredPace = remainingDays ? Math.max(0, current.Meta - current.Realizado) / remainingDays : 0
    const projected = isPast ? current.Realizado : isFuture ? 0 : actualPace * daysInMonth

    return { sellerOptions, months, current, realizedYtd, goalYtd, attainmentYtd, team, elapsedDays, remainingDays, actualPace, requiredPace, projected }
  }, [documents, goals, sellers, vendedores, selectedSeller, month, year])

  const years = Array.from({ length: 4 }, (_, index) => CURRENT_YEAR - index)
  const selectedName = selectedSeller === 'todos' ? 'Time comercial' : data.sellerOptions.find(([id]) => id === selectedSeller)?.[1]

  async function saveGoal(sellerId) {
    const value = Number(String(editGoals[sellerId] || 0).replace(',', '.'))
    setSaving(current => ({ ...current, [sellerId]: true }))
    const ultraToProfileId = buildUltraToProfileId(sellers)
    const existing = goals.find(goal => resolveKey(goalKey(goal), ultraToProfileId) === sellerId && goal.mes === month)
    // Sempre grava o id do Ultra quando dá pra saber (mesmo pra vendedor com
    // login vinculado), pra meta ficar rastreável ao vendedor canônico.
    const ultraSalesmanId = sellerId.startsWith('ultra:') ? Number(sellerId.slice(6)) : sellers.find(s => s.id === sellerId)?.ultra_salesman_id || null
    const result = existing
      ? await supabaseAdmin.from('goals').update({ meta_fat: value, updated_at: new Date().toISOString() }).eq('id', existing.id).select().single()
      : await supabaseAdmin.from('goals').insert({ seller_id: sellerId.startsWith('ultra:') ? null : sellerId, ultra_salesman_id: ultraSalesmanId, ano: year, mes: month, meta_fat: value }).select().single()
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
          <section className="goals-command">
            <div className="goals-command-main">
              <span className="goals-eyebrow">Meta de pedidos · {monthName(month)} de {year} · {selectedName}</span>
              <div className="goals-command-values"><div><small>Realizado</small><h2>{moneyShort(data.current.Realizado)}</h2></div><div><small>Meta</small><strong>{data.current.Meta ? moneyShort(data.current.Meta) : '—'}</strong></div></div>
              <div className="goals-command-progress"><span style={{ width: `${Math.min(100, data.current.Meta ? (data.current.Realizado / data.current.Meta) * 100 : 0)}%` }} /></div>
              <div className="goals-command-foot"><strong>{data.current.Meta ? `${((data.current.Realizado / data.current.Meta) * 100).toFixed(1)}% atingido` : 'Meta não definida'}</strong><span>{data.current.Meta ? `${moneyShort(Math.max(0, data.current.Meta - data.current.Realizado))} para alcançar a meta` : 'Cadastre a meta para acompanhar o ritmo'}</span></div>
            </div>
            <div className="goals-command-side">
              <span className="goals-eyebrow">Projeção no ritmo atual</span><strong>{moneyShort(data.projected)}</strong>
              <small className={data.current.Meta && data.projected >= data.current.Meta ? 'on-track' : 'attention'}>{!data.current.Meta ? 'Sem meta para comparar' : data.projected >= data.current.Meta ? `Projeção ${moneyShort(data.projected - data.current.Meta)} acima da meta` : `Projeção ${moneyShort(data.current.Meta - data.projected)} abaixo da meta`}</small>
            </div>
          </section>

          <section className="goals-kpis goals-kpis-four">
            <article><IconTrendingUp /><span>Ritmo realizado/dia</span><strong>{moneyShort(data.actualPace)}</strong></article>
            <article><IconTargetArrow /><span>Ritmo necessário/dia</span><strong>{data.current.Meta && data.remainingDays ? moneyShort(data.requiredPace) : '—'}</strong></article>
            <article><IconClock /><span>Dias restantes</span><strong>{data.remainingDays}</strong></article>
            <article><IconCheck /><span>Acumulado no ano</span><strong>{moneyShort(data.realizedYtd)}</strong></article>
          </section>

          {selectedSeller === 'todos' && <section className="goals-team-table-card">
            <div className="goals-card-head"><div><span className="goals-eyebrow">Execução por vendedor</span><h3>Quem está puxando a meta — e onde agir</h3></div><small>ordenado por atingimento</small></div>
            <div className="goals-team-table">
              <div className="goals-team-head"><span>Vendedor</span><span>Meta</span><span>Pedidos</span><span>Saldo</span><span>Atingimento</span></div>
              {data.team.map(seller => <button key={seller.id} onClick={() => setSelectedSeller(seller.id)}>
                <span className="goals-team-name"><i>{seller.name.charAt(0)}</i><strong>{seller.name}</strong></span><span>{seller.goal ? moneyShort(seller.goal) : '—'}</span><span>{moneyShort(seller.realized)}</span><span>{seller.goal ? moneyShort(seller.remaining) : '—'}</span><span className="goals-team-attainment"><em><i style={{ width: `${Math.min(100, seller.percent)}%` }} /></em><b>{seller.goal ? `${seller.percent.toFixed(0)}%` : '—'}</b></span>
              </button>)}
            </div>
          </section>}

          <section className="goals-chart-card">
            <div className="goals-card-head"><div><span className="goals-eyebrow">Trajetória anual</span><h3>Pedidos versus meta mês a mês</h3></div><small>pedidos líquidos após cancelamentos e devoluções</small></div>
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
