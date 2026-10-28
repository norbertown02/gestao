import { useEffect, useMemo, useState } from 'react'
import { IconArrowLeft, IconCheck, IconClock, IconTargetArrow, IconTrendingUp } from '@tabler/icons-react'
import { Bar, CartesianGrid, ComposedChart, Line, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'
import { supabaseAdmin } from '../lib/supabase'
import { hasNetOrderValue, netOrderValue } from '../lib/commercialMetrics'
import { useVendedores } from '../lib/sellers'
import Topbar from '../components/Topbar'
import './CommercialClarity.css'

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

export default function Metas({ embedded = false, activeTab, onTabChange, initialYear = CURRENT_YEAR, initialMonth = CURRENT_MONTH, onGoalSaved }) {
  const [year, setYear] = useState(initialYear)
  const [month, setMonth] = useState(initialMonth)
  const [selectedSeller, setSelectedSeller] = useState('todos')
  const [internalTab, setInternalTab] = useState('acompanhamento')
  const tab = activeTab ?? internalTab
  const setTab = onTabChange || setInternalTab
  const [sellers, setSellers] = useState([])
  const [goals, setGoals] = useState([])
  const [documents, setDocuments] = useState([])
  const [loading, setLoading] = useState(true)
  const [editGoals, setEditGoals] = useState({})
  const [saving, setSaving] = useState({})
  const [saveNotice, setSaveNotice] = useState('')
  const { vendedores } = useVendedores()

  useEffect(() => {
    setYear(initialYear)
    setMonth(initialMonth)
  }, [initialYear, initialMonth])

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
    // A lista canônica do Ultra também precisa incluir os vendedores ativos
    // que ainda não têm código Ultra mas participam de um Budget aprovado.
    const ultraToProfileId = new Map(sellers.filter(s => s.ultra_salesman_id).map(s => [s.ultra_salesman_id, s.id]))
    const ultraOptions = vendedores.map(v => [ultraToProfileId.get(v.id) || `ultra:${v.id}`, v.name])
    const ultraCodes = new Set(vendedores.map(v => Number(v.id)))
    const additionalProfiles = sellers
      .filter(p => ['vendedor','gestor_comercial'].includes(p.role))
      .filter(p => !p.ultra_salesman_id || !ultraCodes.has(Number(p.ultra_salesman_id)))
      .filter(p => !ultraOptions.some(([id]) => id === p.id))
      .map(p => [p.id, p.name || 'Vendedor sem nome'])
    const sellerOptions = [...ultraOptions, ...additionalProfiles]
      .sort((a, b) => a[1].localeCompare(b[1], 'pt-BR'))
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

  const years = Array.from({ length: 6 }, (_, index) => CURRENT_YEAR + 1 - index)
  const selectedName = selectedSeller === 'todos' ? 'Time comercial' : data.sellerOptions.find(([id]) => id === selectedSeller)?.[1]

  async function saveGoal(sellerId) {
    const value = Number(String(editGoals[sellerId] || 0).replace(',', '.'))
    setSaving(current => ({ ...current, [sellerId]: true }))
    const ultraToProfileId = buildUltraToProfileId(sellers)
    const existing = goals.find(goal => resolveKey(goalKey(goal), ultraToProfileId) === sellerId && goal.mes === month)
    if (existing?.budget_cycle_id) {
      setSaveNotice('Esta meta foi gerada por um Budget aprovado. Solicite a revisão do Budget para alterá-la.')
      setSaving(current => ({ ...current, [sellerId]: false }))
      return
    }
    setSaveNotice('')
    // Sempre grava o id do Ultra quando dá pra saber (mesmo pra vendedor com
    // login vinculado), pra meta ficar rastreável ao vendedor canônico.
    const ultraSalesmanId = sellerId.startsWith('ultra:') ? Number(sellerId.slice(6)) : sellers.find(s => s.id === sellerId)?.ultra_salesman_id || null
    const result = existing
      ? await supabaseAdmin.from('goals').update({ meta_fat: value, updated_at: new Date().toISOString() }).eq('id', existing.id).select().single()
      : await supabaseAdmin.from('goals').insert({ seller_id: ultraSalesmanId ? null : sellerId.startsWith('ultra:') ? null : sellerId, ultra_salesman_id: ultraSalesmanId, ano: year, mes: month, meta_fat: value }).select().single()
    if (result.error) setSaveNotice('Não foi possível salvar a meta: ' + result.error.message)
    if (result.data) {
      setGoals(current => existing ? current.map(goal => goal.id === existing.id ? result.data : goal) : [...current, result.data])
      setSaveNotice('Meta manual atualizada com sucesso.')
      onGoalSaved?.()
    }
    setSaving(current => ({ ...current, [sellerId]: false }))
  }

  return (
    <div style={{ flex: embedded ? 'none' : 1, overflow: embedded ? 'visible' : 'hidden', display: 'flex', flexDirection: 'column', minWidth: 0 }}>
      {!embedded && <Topbar title="Metas Comerciais" subtitle="Pedidos mensais e acumulados por vendedor" />}
      <div className="page goals-page cc-page" style={{ overflowY: embedded ? 'visible' : 'auto', padding: embedded ? '0' : undefined }}>
        {!embedded && 
        <div className="cc-intro"><span className="cc-kicker">Acompanhamento de objetivos</span>
          <h2>Quanto já atingimos da meta?</h2>
          <p>Escolha o mês e o vendedor. Veja o valor realizado, a meta e quanto falta. Clique em um vendedor para consultar seu desempenho individual.</p>
        </div>}
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
          {!embedded && <div className="goals-tabs"><button className={tab === 'acompanhamento' ? 'active' : ''} onClick={() => setTab('acompanhamento')}>Acompanhamento</button><button className={tab === 'cadastro' ? 'active' : ''} onClick={() => setTab('cadastro')}>Definir metas</button></div>}
        </section>

        {!embedded && <p className="cc-toolbar-help">Acompanhamento mostra resultados. Definir metas é a área de cadastro e não altera pedidos já realizados.</p>}
        {loading ? <div className="empty">Carregando metas...</div> : tab === 'acompanhamento' ? <>
          <section className="goals-command">
            <div className="goals-command-main">
              <span className="goals-eyebrow">Meta de vendas · {monthName(month)} de {year} · {selectedName}</span>
              <div className="goals-command-values"><div><small>Realizado</small><h2>{moneyShort(data.current.Realizado)}</h2></div><div><small>Meta</small><strong>{data.current.Meta ? moneyShort(data.current.Meta) : '—'}</strong></div></div>
              <div className="goals-command-progress"><span style={{ width: `${Math.min(100, data.current.Meta ? (data.current.Realizado / data.current.Meta) * 100 : 0)}%` }} /></div>
              <div className="goals-command-foot"><strong>{data.current.Meta ? `${((data.current.Realizado / data.current.Meta) * 100).toFixed(1)}% atingido` : 'Meta não definida'}</strong><span>{data.current.Meta ? `${moneyShort(Math.max(0, data.current.Meta - data.current.Realizado))} para alcançar a meta` : 'Cadastre a meta para acompanhar o ritmo'}</span></div>
            </div>
            <div className="goals-command-side">
              <span className="goals-eyebrow">{year < CURRENT_YEAR || (year === CURRENT_YEAR && month < CURRENT_MONTH) ? 'Valor ao encerrar o mês' : year > CURRENT_YEAR || (year === CURRENT_YEAR && month > CURRENT_MONTH) ? 'Mês ainda não iniciado' : 'Projeção até o fim do mês'}</span><strong>{year > CURRENT_YEAR || (year === CURRENT_YEAR && month > CURRENT_MONTH) ? '—' : moneyShort(data.projected)}</strong>
              <small className={data.current.Meta && data.projected >= data.current.Meta ? 'on-track' : 'attention'}>{!data.current.Meta ? 'Sem meta para comparar' : year > CURRENT_YEAR || (year === CURRENT_YEAR && month > CURRENT_MONTH) ? 'Aguardando início do mês' : year < CURRENT_YEAR || (year === CURRENT_YEAR && month < CURRENT_MONTH) ? data.projected >= data.current.Meta ? `Meta superada em ${moneyShort(data.projected - data.current.Meta)}` : `Ficou ${moneyShort(data.current.Meta - data.projected)} abaixo da meta` : data.projected >= data.current.Meta ? `Ritmo aponta ${moneyShort(data.projected - data.current.Meta)} acima da meta` : `Ritmo aponta ${moneyShort(data.current.Meta - data.projected)} abaixo da meta`}</small>
            </div>
          </section>

          {selectedSeller === 'todos' && <section className="goals-team-table-card">
            <div className="goals-card-head"><div><span className="goals-eyebrow">Execução por vendedor</span><h3>Como está a meta de cada vendedor</h3></div><small>ordenado por atingimento</small></div>
            <div className="goals-team-table">
              <div className="goals-team-head"><span>Vendedor</span><span>Meta</span><span>Pedidos</span><span>Saldo</span><span>Atingimento</span></div>
              {data.team.map(seller => <button key={seller.id} onClick={() => setSelectedSeller(seller.id)}>
                <span className="goals-team-name"><i>{seller.name.charAt(0)}</i><strong>{seller.name}</strong></span><span>{seller.goal ? moneyShort(seller.goal) : '—'}</span><span>{moneyShort(seller.realized)}</span><span>{seller.goal ? moneyShort(seller.remaining) : '—'}</span><span className="goals-team-attainment"><em><i style={{ width: `${Math.min(100, seller.percent)}%` }} /></em><b>{seller.goal ? `${seller.percent.toFixed(0)}%` : '—'}</b></span>
              </button>)}
            </div>
          </section>}

          <details className="cc-more">
            <summary><span className="cc-summary-icon">↗</span><span className="cc-summary-text">Ver ritmo de vendas e histórico do ano<small>Ritmo diário, dias restantes, realizado no ano e gráfico mensal de metas</small></span><span className="cc-arrow">⌄</span></summary>
            <div className="cc-more-body">
              <p className="cc-toolbar-help">Ritmo diário estimado por dias corridos. Use como referência, não como garantia de fechamento.</p>
          <section className="goals-kpis goals-kpis-four">
            <article><IconTrendingUp /><span>Ritmo realizado/dia</span><strong>{moneyShort(data.actualPace)}</strong></article>
            <article><IconTargetArrow /><span>Ritmo necessário/dia</span><strong>{data.current.Meta && data.remainingDays ? moneyShort(data.requiredPace) : '—'}</strong></article>
            <article><IconClock /><span>Dias restantes</span><strong>{data.remainingDays}</strong></article>
            <article><IconCheck /><span>Acumulado no ano</span><strong>{moneyShort(data.realizedYtd)}</strong></article>
          </section>


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

            </div>
          </details>
        </> : <section className="goals-editor">
          <div className="goals-card-head"><div><span className="goals-eyebrow">Planejamento interno</span><h3>Metas de {monthName(month)} de {year}</h3></div><small>Metas de budgets aprovados são automáticas e ficam vinculadas à aprovação</small></div>
          {saveNotice && <p className="goals-save-notice" role="status">{saveNotice}</p>}
          {data.sellerOptions.map(([sellerId, sellerName]) => {
            const ultraToProfileId = buildUltraToProfileId(sellers)
            const activeGoal = goals.find(goal =>
              resolveKey(goalKey(goal), ultraToProfileId) === sellerId && goal.mes === month)
            const fromBudget = Boolean(activeGoal?.budget_cycle_id)
            return <div className="goals-editor-row" key={sellerId}>
              <div className="goals-avatar">{(sellerName || 'V').charAt(0)}</div>
              <div><strong>{sellerName}</strong><span>{fromBudget ? 'Meta oficial · Budget aprovado' : 'Meta mensal de pedidos'}</span></div>
              <label>R$ <input type="number" value={editGoals[sellerId] ?? ''} disabled={fromBudget} onChange={event => setEditGoals(current => ({ ...current, [sellerId]: event.target.value }))} placeholder="0,00" /></label>
              {fromBudget
                ? <span className="goals-budget-source"><IconCheck size={14}/> Automática</span>
                : <button className="btn btn-primary btn-sm" onClick={() => saveGoal(sellerId)} disabled={saving[sellerId]}><IconCheck size={14}/>{saving[sellerId] ? 'Salvando' : 'Salvar'}</button>}
            </div>
          } )}
        </section>}
      </div>
    </div>
  )
}
