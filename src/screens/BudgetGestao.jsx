import { useEffect, useMemo, useState } from 'react'
import { supabase } from '../lib/supabase'
import { useAuth } from '../lib/useAuth'
import Topbar from '../components/Topbar'
import {
  IconArrowRight, IconArrowLeft, IconCheck, IconCalendarMonth, IconChevronRight,
  IconClock, IconCircleCheck, IconDeviceFloppy, IconFilter, IconPlus, IconSearch,
  IconSend, IconShieldCheck, IconUsers, IconX, IconRefresh, IconTrendingUp, IconTrendingDown
} from '@tabler/icons-react'
import BudgetExecutiveBreakdown from './BudgetExecutiveBreakdown'
import './BudgetGestao.css'

const fmt = value => Number(value || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })
const qty = value => Number(value || 0).toLocaleString('pt-BR', { maximumFractionDigits: 2 })
const percent = (planned, history) => history > 0 ? (planned / history - 1) * 100 : null
const percentText = value => value == null ? 'Sem histórico' : (value > 0 ? '+' : '') + value.toLocaleString('pt-BR', {maximumFractionDigits:1}) + '%'
const percentClass = value => value == null ? 'neutral' : value >= 0 ? 'positive' : 'negative'
const initials = value => String(value || 'V').trim().split(/\s+/).slice(0, 2).map(w => w[0]).join('').toUpperCase()
const MONTHS_FORWARD = 12
function futureMonths() {
  const date = new Date()
  return Array.from({ length: MONTHS_FORWARD }, (_, index) => {
    const d = new Date(date.getFullYear(), date.getMonth() + index + 1, 1)
    return { id: d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0'), month: d.toLocaleDateString('pt-BR', { month: 'long' }), year: d.getFullYear(), short: d.toLocaleDateString('pt-BR', { month: 'short', year: '2-digit' }).replace('.', '') }
  })
}
const monthName = value => new Date(value + '-01T12:00:00').toLocaleDateString('pt-BR', { month: 'short', year: 'numeric' }).replace('.', '')
function localDate(days = 0) {
  const d = new Date()
  d.setDate(d.getDate() + days)
  return [d.getFullYear(), String(d.getMonth() + 1).padStart(2, '0'), String(d.getDate()).padStart(2, '0')].join('-') + 'T' + String(d.getHours()).padStart(2, '0') + ':' + String(d.getMinutes()).padStart(2, '0')
}
const statusName = (a) => ({
  pending: 'Aguardando', draft: 'Em preenchimento', submitted: 'Enviado',
  approved: 'Aprovado', revision_requested: 'Revisão solicitada',
})[a] || 'Aguardando'
function cycleStatus(c) {
  if (c.status === 'draft') return { title: 'Não liberado', key: 'draft' }
  if (c.status === 'closed') return { title: 'Encerrado', key: 'closed' }
  if (new Date(c.opens_at) > new Date()) return { title: 'Abertura agendada', key: 'scheduled' }
  if (new Date(c.closes_at) < new Date()) return { title: 'Prazo encerrado', key: 'closed' }
  return { title: 'Liberado', key: 'open' }
}
const STAGES = ['Meses', 'Equipe', 'Liberação']

export default function BudgetGestao() {
  const { user } = useAuth()
  const manager = ['admin', 'gestor', 'gestor_comercial'].includes(user?.role)
  const monthOptions = useMemo(futureMonths, [])
  const [cycles, setCycles] = useState([])
  const [assignments, setAssignments] = useState([])
  const [items, setItems] = useState([])
  const [sellers, setSellers] = useState([])
  const [products, setProducts] = useState([])
  const [categories, setCategories] = useState([])
  const [classifications, setClassifications] = useState([])
  const [billedProducts, setBilledProducts] = useState([])
  const [activeCycle, setActiveCycle] = useState('')
  const [mode, setMode] = useState('overview')
  const [step, setStep] = useState(0)
  const [title, setTitle] = useState('Budget comercial trimestral')
  const [months, setMonths] = useState(() => futureMonths().slice(0, 3).map(m => m.id))
  const [chosenSellers, setChosenSellers] = useState([])
  const [sellerQuery, setSellerQuery] = useState('')
  const [opensAt, setOpensAt] = useState(localDate)
  const [closesAt, setClosesAt] = useState(() => localDate(14))
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [notice, setNotice] = useState(null)
  const [feedbackId, setFeedbackId] = useState(null)
  const [feedback, setFeedback] = useState('')

  async function reload() {
    if (!manager) return
    setLoading(true)
    const [c, a, i, p, pr, cats, cls, bs] = await Promise.all([
      supabase.from('budget_cycles').select('*').order('created_at', { ascending: false }),
      supabase.from('budget_cycle_sellers').select('*'),
      supabase.from('budget_items').select('*'),
      supabase.from('profiles').select('id,name,role,active,ultra_salesman_id').eq('active', true),
      supabase.from('products').select('id,name,category_id,application_id,ultra_codproduto,ultra_codproduto_clas'),
      supabase.from('product_categories').select('id,name'),
      supabase.from('product_commercial_classifications').select('codproduto,codproduto_clas,market,segment,category'),
      supabase.rpc('budget_fiscal_product_baselines'),
    ])
    const error = [c, a, i, p, pr, cats, cls, bs].find(r => r.error)?.error
    if (error) setNotice({ text: 'Não foi possível atualizar os dados: ' + error.message, kind: 'error' })
    setCycles(c.data || [])
    setAssignments(a.data || [])
    setItems(i.data || [])
    setSellers((p.data || []).filter(p => p.role === 'vendedor' || p.role === 'gestor_comercial').sort((x, y) => x.name.localeCompare(y.name, 'pt-BR')))
    setProducts(pr.data || [])
    setCategories(cats.data || [])
    setClassifications(cls.data || [])
    setBilledProducts(bs.data || [])
    setActiveCycle(current => current || c.data?.[0]?.id || '')
    setLoading(false)
  }
  useEffect(() => { if (manager) reload() }, [manager])

  const selectedCycle = cycles.find(c => c.id === activeCycle)
  const people = assignments.filter(a => a.cycle_id === activeCycle)
  const cycleItems = items.filter(i => i.cycle_id === activeCycle)
  const plannedValue = cycleItems.reduce((a, i) => a + Number(i.quantity_kg) * Number(i.unit_price), 0)
  const plannedKg = cycleItems.reduce((a, i) => a + Number(i.quantity_kg), 0)
  const baselineBySeller = useMemo(() => {
    const grouped = new Map()
    for (const line of billedProducts) {
      const current=grouped.get(line.seller_id)||{baseline_amount:0,baseline_kg:0}
      current.baseline_amount+=Number(line.billed_amount||0)
      current.baseline_kg+=Number(line.billed_kg||0)
      grouped.set(line.seller_id,current)
    }
    return grouped
  },[billedProducts])
  // Comparar periodos equivalentes: media dos ultimos 3 meses completos
  // aplicada a quantidade de meses disponibilizados no ciclo.
  const periodFactor = (selectedCycle?.months?.length || 0) / 3
  // Um preenchimento parcial não é uma queda de toda a Nutrialle.
  // Só comparar com o histórico dos vendedores que já lançaram volume
  // ou enviaram formalmente seu planejamento (mesmo que zerado).
  const comparablePeople = people.filter(p =>
    ['submitted', 'approved'].includes(p.status) ||
    cycleItems.some(i => i.seller_id === p.seller_id && Number(i.quantity_kg) > 0))
  const referenceAmount = comparablePeople.reduce((a, p) => a + Number(baselineBySeller.get(p.seller_id)?.baseline_amount || 0) * periodFactor, 0)
  const referenceKg = comparablePeople.reduce((a, p) => a + Number(baselineBySeller.get(p.seller_id)?.baseline_kg || 0) * periodFactor, 0)
  const revenueVariation = percent(plannedValue, referenceAmount)
  const volumeVariation = percent(plannedKg, referenceKg)
  const sentCount = people.filter(p => p.status === 'submitted' || p.status === 'approved').length
  const sellerById = useMemo(() => new Map(sellers.map(s => [s.id, s.name])), [sellers])
  const availableSellers = sellers.filter(p => (p.name || '').toLowerCase().includes(sellerQuery.trim().toLowerCase()))
  const allPeopleCount = assignments.filter(a => cycles.some(c => c.id === a.cycle_id)).length

  const openComposer = () => { setMode('create'); setStep(0); setNotice(null) }
  const resetComposer = () => {
    setMode('overview')
    setMonths(monthOptions.slice(0, 3).map(m => m.id))
    setChosenSellers([])
    setOpensAt(localDate())
    setClosesAt(localDate(14))
    setTitle('Budget comercial trimestral')
    setStep(0)
  }
  const chooseMonth = value => setMonths(old =>
    old.includes(value) ? old.filter(m => m !== value) : [...old, value].sort()
  )
  const toggleSeller = id => setChosenSellers(old =>
    old.includes(id) ? old.filter(x => x !== id) : [...old, id]
  )
  const sellerName = id => sellerById.get(id) || 'Vendedor'
  const stepValid = step === 0 ? months.length > 0 : step === 1 ? chosenSellers.length > 0 : Boolean(title.trim() && opensAt && closesAt && new Date(opensAt) < new Date(closesAt))

  const createCycle = async () => {
    if (!title.trim() || !months.length || !chosenSellers.length || new Date(closesAt) <= new Date(opensAt)) {
      setNotice({ text: 'Revise os meses, os vendedores e o prazo do ciclo.', kind: 'error' }); return
    }
    setSaving(true); setNotice(null)
    const { data, error } = await supabase.from('budget_cycles').insert({
      title: title.trim(),
      months: [...months].sort(),
      opens_at: new Date(opensAt).toISOString(),
      closes_at: new Date(closesAt).toISOString(),
      created_by: user.id,
      status: 'draft',
    }).select().single()
    if (error) {
      setNotice({ text: 'Não foi possível criar: ' + error.message, kind: 'error' })
      setSaving(false); return
    }
    const { error: sellersError } = await supabase.from('budget_cycle_sellers').insert(
      chosenSellers.map(seller_id => ({ cycle_id: data.id, seller_id, status: 'pending' }))
    )
    if (sellersError) {
      setNotice({ text: 'Ciclo salvo, mas não foi possível vincular os vendedores: ' + sellersError.message, kind: 'error' })
      setSaving(false)
      await reload()
      return
    }
    resetComposer()
    setActiveCycle(data.id)
    setNotice({ text: 'Ciclo criado! Ele está fechado para os vendedores até você clicar em “Liberar preenchimento”.', kind: 'success' })
    await reload()
    setSaving(false)
  }
  const setCycleState = async status => {
    if (!selectedCycle) return
    if (status === 'open' && new Date(selectedCycle.closes_at) <= new Date()) {
      setNotice({ kind: 'error', text: 'O prazo já encerrou. Ajuste as datas antes de liberar.' }); return
    }
    const question = status === 'open' ? 'Liberar este ciclo para os vendedores participantes?' : 'Encerrar este ciclo para edição?'
    if (!window.confirm(question)) return
    setSaving(true)
    const { error } = await supabase.from('budget_cycles').update({ status }).eq('id', activeCycle)
    if (error) setNotice({ kind: 'error', text: error.message })
    else setNotice({ kind: 'success', text: status === 'open' ? 'Ciclo liberado conforme a janela definida.' : 'Ciclo encerrado para edição.' })
    await reload()
    setSaving(false)
  }
  const setReview = async (assignment, status) => {
    if (status === 'revision_requested' && !feedback.trim()) {
      setNotice({ kind: 'error', text: 'Escreva uma orientação para solicitar a revisão.' }); return
    }
    setSaving(true)
    const { error } = await supabase.from('budget_cycle_sellers').update({
      status, feedback: status === 'revision_requested' ? feedback.trim() : null,
    }).eq('cycle_id', assignment.cycle_id).eq('seller_id', assignment.seller_id)
    if (error) setNotice({ kind: 'error', text: error.message })
    else setNotice({ kind: 'success', text: 'Situação de ' + sellerName(assignment.seller_id) + ' atualizada.' })
    setFeedbackId(null); setFeedback('')
    await reload(); setSaving(false)
  }
  if (!manager) return <div className="bgx-unauthorized">Acesso exclusivo à gestão comercial.</div>
  return (
    <div className="bgx-shell">
      <Topbar title="Budget Comercial" subtitle="Planejamento, liberação e acompanhamento de previsões"/>
      <main className="page bgx-page">
        <section className="bgx-intro">
          <div className="bgx-intro-copy">
            <span className="bgx-overline">INTELIGÊNCIA COMERCIAL / ORÇAMENTO</span>
            <h1>Planejamento de vendas</h1>
            <p>Organize os próximos meses, libere o preenchimento no Campo e acompanhe cada previsão da equipe.</p>
          </div>
          {mode === 'overview' ?
            <button type="button" className="bgx-button bgx-button-primary" onClick={openComposer}><IconPlus size={17}/> Novo ciclo</button> :
            <button type="button" className="bgx-button bgx-button-ghost" onClick={resetComposer}><IconX size={16}/> Fechar</button>
          }
        </section>
        {notice && <div className={'bgx-notice ' + notice.kind} role="status">{notice.text}<button aria-label="Dispensar aviso" onClick={() => setNotice(null)}><IconX size={15}/></button></div>}
        {mode === 'create' ? (
          <section className="bgx-wizard">
            <div className="bgx-wizard-side">
              <div className="bgx-overline">NOVO PLANEJAMENTO</div>
              <h2>Configure o ciclo</h2>
              <p>Três etapas para organizar a liberação. Nada será enviado aos vendedores antes da sua autorização.</p>
              <nav className="bgx-steps" aria-label="Etapas do novo ciclo">
                {STAGES.map((label, i) => (
                  <button key={label} type="button" className={'bgx-step ' + (step === i ? 'is-active' : '') + (step > i ? ' is-done' : '')}
                    onClick={() => setStep(i)}>
                    <span>{step > i ? <IconCheck size={15}/> : String(i + 1).padStart(2, '0')}</span>
                    <strong>{label}</strong>
                    <IconChevronRight size={15}/>
                  </button>
                ))}
              </nav>
              <div className="bgx-side-foot"><IconShieldCheck size={19}/><span>Liberação sempre controlada por você.</span></div>
            </div>
            <div className="bgx-wizard-content">
              {step === 0 && <>
                <div className="bgx-step-heading"><span>ETAPA 01 / 03</span><h3>Quais meses estarão disponíveis?</h3><p>Escolha os meses em que cada vendedor poderá projetar vendas. Selecione quantos precisar.</p></div>
                <div className="bgx-month-actions">
                  <button onClick={() => setMonths(monthOptions.slice(0, 3).map(m => m.id))} className="bgx-text-button">Próximos 3 meses</button>
                  <button onClick={() => setMonths([])} className="bgx-text-button subtle">Limpar seleção</button>
                  <span>{months.length} {months.length === 1 ? 'mês selecionado' : 'meses selecionados'}</span>
                </div>
                <div className="bgx-month-grid">
                  {monthOptions.map(m => <button type="button" key={m.id} aria-pressed={months.includes(m.id)}
                    onClick={() => chooseMonth(m.id)} className={'bgx-month ' + (months.includes(m.id) ? 'selected' : '')}>
                    <small>{m.year}</small><strong>{m.month}</strong><span>{months.includes(m.id) ? <IconCheck size={15}/> : <IconPlus size={15}/>}</span>
                  </button>)}
                </div>
              </>}
              {step === 1 && <>
                <div className="bgx-step-heading"><span>ETAPA 02 / 03</span><h3>Quem vai preencher?</h3><p>Selecione os representantes que participarão deste ciclo. Novos vendedores também podem ser incluídos.</p></div>
                <div className="bgx-seller-tools">
                  <label><IconSearch size={17}/><input value={sellerQuery} onChange={e => setSellerQuery(e.target.value)} placeholder="Buscar vendedor pelo nome..."/></label>
                  <button type="button" className="bgx-text-button" onClick={() => setChosenSellers(sellers.map(s => s.id))}>Selecionar todos</button>
                  <button type="button" className="bgx-text-button subtle" onClick={() => setChosenSellers([])}>Limpar</button>
                </div>
                <div className="bgx-selection-count">{chosenSellers.length} de {sellers.length} selecionados</div>
                <div className="bgx-seller-grid">
                  {availableSellers.map(s => <button key={s.id} type="button" className={'bgx-seller-tile ' + (chosenSellers.includes(s.id) ? 'selected' : '')}
                    aria-pressed={chosenSellers.includes(s.id)} onClick={() => toggleSeller(s.id)}>
                    <span className="bgx-avatar">{initials(s.name)}</span>
                    <span className="bgx-seller-info"><strong>{s.name}</strong><small>{s.ultra_salesman_id ? 'Ultra #' + s.ultra_salesman_id : 'Sem código Ultra'} · {s.role === 'gestor_comercial' ? 'Gestor comercial' : 'Vendedor'}</small></span>
                    <span className="bgx-selection-icon">{chosenSellers.includes(s.id) && <IconCheck size={14}/>}</span>
                  </button>)}
                  {availableSellers.length === 0 && <div className="bgx-empty-inline">Nenhum vendedor corresponde à busca.</div>}
                </div>
              </>}
              {step === 2 && <>
                <div className="bgx-step-heading"><span>ETAPA 03 / 03</span><h3>Quando começa o preenchimento?</h3><p>Defina a janela de edição. Você ainda precisará liberar o ciclo após criá-lo.</p></div>
                <div className="bgx-form">
                  <label>Nome do ciclo<input value={title} onChange={e => setTitle(e.target.value)} placeholder="Ex.: Budget novembro a janeiro"/></label>
                  <div className="bgx-date-grid"><label>Abertura permitida<input type="datetime-local" value={opensAt} onChange={e => setOpensAt(e.target.value)}/></label><label>Último dia para enviar<input type="datetime-local" value={closesAt} onChange={e => setClosesAt(e.target.value)}/></label></div>
                </div>
                <div className="bgx-review-summary">
                  <div><IconCalendarMonth size={18}/><span><strong>{months.length} meses</strong><small>{months.map(monthName).join(' · ')}</small></span></div>
                  <div><IconUsers size={18}/><span><strong>{chosenSellers.length} vendedores</strong><small>{chosenSellers.map(sellerName).slice(0, 3).join(' · ')}{chosenSellers.length > 3 ? ' e outros' : ''}</small></span></div>
                  <div><IconClock size={18}/><span><strong>Criação como rascunho</strong><small>A equipe só terá acesso quando você liberar.</small></span></div>
                </div>
              </>}
              <footer className="bgx-wizard-footer">
                <button type="button" className="bgx-button bgx-button-ghost" onClick={() => step ? setStep(step - 1) : resetComposer()}>
                  <IconArrowLeft size={16}/>{step ? 'Voltar' : 'Cancelar'}
                </button>
                {step < 2 ?
                  <button type="button" disabled={!stepValid || saving} className="bgx-button bgx-button-primary" onClick={() => setStep(step + 1)}>Continuar <IconArrowRight size={16}/></button> :
                  <button type="button" disabled={!stepValid || saving} className="bgx-button bgx-button-primary" onClick={createCycle}><IconDeviceFloppy size={16}/>{saving ? 'Salvando...' : 'Criar em rascunho'}</button>
                }
              </footer>
            </div>
          </section>
        ) : <>
          <div className="bgx-overview-kpis">
            <div><span>Ciclos criados</span><strong>{cycles.length}</strong><small>Planejamentos registrados</small></div>
            <div><span>Participações</span><strong>{allPeopleCount}</strong><small>Vendedores incluídos em ciclos</small></div>
            <div><span>Previsão consolidada</span><strong>{fmt(items.reduce((a, i) => a + Number(i.quantity_kg) * Number(i.unit_price), 0))}</strong><small>Valor total dos ciclos registrados</small></div>
          </div>
          <section className="bgx-card bgx-cycle-section">
            <div className="bgx-section-head">
              <div><span className="bgx-overline">ADMINISTRAÇÃO</span><h2>Ciclos de planejamento</h2><p>Selecione um ciclo para conferir a situação e liberar o preenchimento.</p></div>
              <button className="bgx-icon-button" title="Atualizar dados" onClick={reload} disabled={loading}><IconRefresh size={18}/></button>
            </div>
            {cycles.length ? (
              <div className="bgx-cycles-grid">
                {cycles.map(c => { const status = cycleStatus(c);const count = assignments.filter(a => a.cycle_id === c.id);const done = count.filter(a => ['submitted','approved'].includes(a.status)).length;return (
                  <button type="button" key={c.id} onClick={() => { setActiveCycle(c.id) }} className={'bgx-cycle-tile ' + (activeCycle === c.id ? 'active' : '')}>
                    <div className="bgx-cycle-top"><span className={'bgx-state ' + status.key}>{status.title}</span><IconChevronRight size={17}/></div>
                    <strong>{c.title}</strong>
                    <small>{c.months.map(monthName).join(' · ')}</small>
                    <div className="bgx-cycle-foot"><span><IconUsers size={14}/> {count.length} vendedores</span><span>{done}/{count.length} envios</span></div>
                  </button>
                ) })}
              </div>
            ) : <div className="bgx-empty"><IconCalendarMonth size={29}/><h3>Nenhum ciclo criado</h3><p>Comece selecionando os meses e representantes que participarão do próximo orçamento.</p><button className="bgx-button bgx-button-primary" onClick={openComposer}><IconPlus size={16}/> Criar primeiro ciclo</button></div>}
          </section>
          {selectedCycle && <section className="bgx-card bgx-detail">
            <div className="bgx-detail-header">
              <div><span className="bgx-overline">CICLO SELECIONADO</span><h2>{selectedCycle.title}</h2><div className="bgx-detail-tags"><span className={'bgx-state ' + cycleStatus(selectedCycle).key}>{cycleStatus(selectedCycle).title}</span><span>{selectedCycle.months.map(monthName).join(' · ')}</span></div></div>
              {selectedCycle.status === 'draft' && <button className="bgx-button bgx-button-primary" disabled={saving || new Date(selectedCycle.closes_at) <= new Date()} onClick={() => setCycleState('open')}><IconSend size={16}/> Liberar preenchimento</button>}
              {selectedCycle.status === 'open' && <button className="bgx-button bgx-button-secondary" disabled={saving} onClick={() => setCycleState('closed')}><IconClock size={16}/> Encerrar ciclo</button>}
            </div>
            <div className="bgx-meta-line"><span><IconClock size={14}/> Abertura: {new Date(selectedCycle.opens_at).toLocaleString('pt-BR')}</span><span>Prazo: {new Date(selectedCycle.closes_at).toLocaleString('pt-BR')}</span></div>
            {selectedCycle.status === 'draft' && <p className="bgx-lock-note"><IconShieldCheck size={17}/> Os vendedores ainda não têm acesso. Revise os participantes e clique em “Liberar preenchimento” quando estiver pronto.</p>}
            <div className="bgx-detail-kpis">
              <div><span>Volume projetado</span><strong>{qty(plannedKg / 1000)} t</strong><small>NF anterior: {qty(referenceKg / 1000)} t</small></div>
              <div><span>Faturamento previsto</span><strong>{fmt(plannedValue)}</strong><small>NF anterior: {fmt(referenceAmount)}</small></div>
              <div className={'bgx-delta-kpi '+percentClass(revenueVariation)}><span>Variação de faturamento</span><strong>{percentText(revenueVariation)}</strong><small>vs. NF do período anterior</small></div>
              <div className={'bgx-delta-kpi '+percentClass(volumeVariation)}><span>Variação de volume</span><strong>{percentText(volumeVariation)}</strong><small>vs. pedidos do período anterior</small></div>
              <div><span>Enviados</span><strong>{sentCount} <em>/ {people.length}</em></strong><small>Participantes que enviaram</small></div>
              <div><span>Clientes previstos</span><strong>{new Set(cycleItems.filter(i => Number(i.quantity_kg) > 0).map(i => i.budget_prospect_id ? 'budget:'+i.budget_prospect_id : i.farm_id)).size}</strong><small>Incluindo clientes só do budget</small></div>
            </div>
            <p className="bgx-baseline-note">Referência: faturamento das notas fiscais dos três últimos meses-calendário encerrados, líquido de devoluções, proporcionalizado para {selectedCycle.months.length} {selectedCycle.months.length===1?'mês':'meses'}. O comparativo considera apenas {comparablePeople.length} de {people.length} vendedores que já registraram volume ou enviaram seu budget; vendedores sem preenchimento não são tratados como queda de vendas. Valores ainda não aprovados são provisórios.</p>
            <div className="bgx-subhead"><h3>Acompanhamento da equipe</h3><small>{people.length} participantes</small></div>
            <div className="bgx-team-table">
              <div className="bgx-team-col-head"><span>Vendedor</span><span>Volume previsto</span><span>Faturamento previsto</span><span>Variação R$</span><span>Avaliação</span></div>
              {people.map(a => {
                const sellerItems = cycleItems.filter(i => i.seller_id === a.seller_id)
                const amount = sellerItems.reduce((s, i) => s + Number(i.quantity_kg) * Number(i.unit_price), 0)
                const totalVolume = sellerItems.reduce((s, i) => s + Number(i.quantity_kg), 0)
                const reference = Number(baselineBySeller.get(a.seller_id)?.baseline_amount || 0) * periodFactor
                const hasForecast = sellerItems.some(i => Number(i.quantity_kg) > 0) ||
                  ['submitted','approved'].includes(a.status)
                const change = hasForecast ? percent(amount, reference) : null
                return <div className="bgx-team-row" key={a.seller_id}>
                  <div className="bgx-team-person">
                    <span className="bgx-avatar">{initials(sellerName(a.seller_id))}</span>
                    <div className="bgx-team-name"><strong>{sellerName(a.seller_id)}</strong><span className={'bgx-substate '+a.status}>{statusName(a.status)}</span></div>
                  </div>
                  <strong className="bgx-team-volume">{hasForecast ? qty(totalVolume / 1000) + ' t' : '—'}</strong>
                  <strong className="bgx-team-amount">{hasForecast ? fmt(amount) : '—'}</strong>
                  <div className="bgx-team-change">
                    <strong className={percentClass(change)}>{hasForecast ? percentText(change) : '—'}</strong>
                    {hasForecast && <small>NF anterior: {fmt(reference)}</small>}
                  </div>
                  <div className="bgx-team-buttons-area">
                    {a.status === 'submitted' ? <div className="bgx-team-buttons">
                      {feedbackId === a.seller_id ? <div className="bgx-feedback">
                        <textarea placeholder="Orientações para o vendedor corrigir..." value={feedback} onChange={e => setFeedback(e.target.value)}/>
                        <button disabled={saving || !feedback.trim()} onClick={() => setReview(a, 'revision_requested')}>Enviar revisão</button>
                        <button className="cancel" onClick={() => setFeedbackId(null)}>Cancelar</button>
                      </div> : <><button disabled={saving} className="approve" onClick={() => setReview(a, 'approved')}><IconCheck size={14}/> Aprovar</button>
                        <button disabled={saving} className="revise" onClick={() => {setFeedbackId(a.seller_id);setFeedback('')}}>Devolver</button></>}
                    </div> : <span className="bgx-team-feedback">{a.feedback || '—'}</span>}
                  </div>
                </div>
              })}
              {!people.length && <div className="bgx-empty-inline">Nenhum participante vinculado a este ciclo.</div>}
            </div>
            <BudgetExecutiveBreakdown
              key={activeCycle}
              cycle={selectedCycle}
              assignments={people}
              budgetItems={cycleItems}
              billedItems={billedProducts}
              products={products}
              categories={categories}
              classifications={classifications}
              sellers={sellers}
              periodStart={billedProducts[0]?.period_start}
              periodEnd={billedProducts[0]?.period_end}
            />
          </section>}
          <p className="bgx-disclaimer">Budget é uma previsão comercial. Não altera as metas, os pedidos ou o faturamento do período.</p>
        </>}
      </main>
    </div>
  )
}
