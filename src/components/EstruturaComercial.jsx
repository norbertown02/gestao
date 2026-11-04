import { useCallback, useEffect, useMemo, useState } from 'react'
import {
  IconAlertCircle, IconArrowRight, IconCheck, IconChevronDown,
  IconChevronRight, IconRefresh, IconSearch, IconSitemap,
  IconUsersGroup,
} from '@tabler/icons-react'
import { supabase } from '../lib/supabase'
import { useAuth } from '../lib/useAuth'
import './EstruturaComercial.css'

const MANAGEMENT_ROLES = new Set(['admin', 'gestor'])
const SALES_ROLES = new Set(['vendedor', 'gestor_comercial'])
const SUPERVISOR_ROLES = new Set(['vendedor', 'gestor_comercial', 'gestor', 'admin'])
const SUPERVISOR_NONE = ''
const roleLabel = role => ({
  vendedor: 'Vendedor / promotor',
  gestor_comercial: 'Gestor comercial',
  gestor: 'Gestor',
  admin: 'Administração',
})[role] || 'Comercial'

function Initials({ name }) {
  const initials = String(name || '?').trim().split(/\s+/).slice(0, 2).map(n => n[0]).join('').toUpperCase()
  return <span className="structure-avatar" aria-hidden="true">{initials}</span>
}

export default function EstruturaComercial() {
  const { user } = useAuth()
  const allowed = MANAGEMENT_ROLES.has(user?.role)
  const [profiles, setProfiles] = useState([])
  const [links, setLinks] = useState([])
  const [draft, setDraft] = useState({})
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(null)
  const [error, setError] = useState('')
  const [feedback, setFeedback] = useState('')
  const [query, setQuery] = useState('')
  const [selectedTeam, setSelectedTeam] = useState('all')
  const [expanded, setExpanded] = useState(true)

  const reload = useCallback(async () => {
    if (!allowed) return
    setLoading(true)
    setError('')
    const [p, l] = await Promise.all([
      supabase.from('profiles').select('id,name,role,active,ultra_salesman_id').eq('active', true).order('name'),
      supabase.from('commercial_supervision').select('seller_id,supervisor_id'),
    ])
    if (p.error || l.error) {
      setError('Não foi possível consultar os profissionais e seus vínculos. Atualize para tentar novamente.')
    } else {
      const current = l.data || []
      setProfiles(p.data || [])
      setLinks(current)
      setDraft(Object.fromEntries(current.map(link => [link.seller_id, link.supervisor_id])))
    }
    setLoading(false)
  }, [allowed])

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    reload()
  }, [reload])

  const sellers = useMemo(() => profiles.filter(p => SALES_ROLES.has(p.role)), [profiles])
  const supervisors = useMemo(() => profiles.filter(p => SUPERVISOR_ROLES.has(p.role)), [profiles])
  const byId = useMemo(() => new Map(profiles.map(p => [p.id, p])), [profiles])
  const committed = useMemo(() => new Map(links.map(l => [l.seller_id, l.supervisor_id])), [links])
  const teamGroups = useMemo(() => supervisors
    .map(person => ({
      ...person,
      reports: sellers.filter(s => committed.get(s.id) === person.id),
    }))
    .filter(group => group.reports.length > 0), [supervisors, sellers, committed])
  const withoutTeam = sellers.filter(s => !committed.has(s.id))
  const visibleSellers = sellers.filter(s => {
    if (selectedTeam !== 'all' && (committed.get(s.id) || 'none') !== selectedTeam) return false
    return String(s.name || '').toLocaleLowerCase('pt-BR').includes(query.toLocaleLowerCase('pt-BR'))
  })

  async function save(sellerId) {
    if (!allowed || saving) return
    const nextSupervisorId = draft[sellerId] || null
    if (nextSupervisorId === (committed.get(sellerId) || null)) return
    setSaving(sellerId)
    setError('')
    setFeedback('')
    const { error: updateError } = await supabase.rpc('gestao_set_commercial_supervisor', {
      p_seller_id: sellerId,
      p_supervisor_id: nextSupervisorId,
    })
    if (updateError) {
      setError(updateError.message || 'Não foi possível salvar a hierarquia.')
      setSaving(null)
      return
    }
    const { data, error: readError } = await supabase
      .from('commercial_supervision')
      .select('seller_id,supervisor_id')
    if (readError) {
      setError('O vínculo foi salvo, mas não foi possível atualizar a lista. Clique em Atualizar.')
    } else {
      const current = data || []
      setLinks(current)
      setDraft(Object.fromEntries(current.map(link => [link.seller_id, link.supervisor_id])))
      setFeedback('Vínculo atualizado. O App Campo reconhecerá o novo supervisor.')
    }
    setSaving(null)
  }

  if (!allowed) return null

  return <section className="structure-panel" aria-label="Estrutura comercial">
    <div className="structure-heading">
      <div className="structure-heading-title">
        <span className="structure-heading-icon"><IconSitemap size={23} stroke={1.7}/></span>
        <div><span className="structure-eyebrow">ADMINISTRAÇÃO DA EQUIPE</span><h3>Estrutura Comercial</h3><p>Defina os supervisores e organize as equipes que aparecem no App Campo.</p></div>
      </div>
      <div className="structure-heading-actions">
        <button className="structure-button subtle" type="button" disabled={loading || !!saving} onClick={reload}><IconRefresh size={16}/> Atualizar</button>
        <button className="structure-button subtle" type="button" onClick={() => setExpanded(v => !v)} aria-expanded={expanded}>{expanded ? 'Recolher' : 'Gerenciar'} <IconChevronDown className={expanded ? 'structure-rotate' : ''} size={16}/></button>
      </div>
    </div>
    {expanded && <div className="structure-content">
      <div className="structure-summary">
        <div><strong>{teamGroups.length}</strong><span>supervisores com equipe</span></div>
        <div><strong>{sellers.length}</strong><span>profissionais comerciais</span></div>
        <div><strong>{withoutTeam.length}</strong><span>sem supervisor</span></div>
      </div>
      {error && <div className="structure-message error" role="alert"><IconAlertCircle size={17}/>{error}</div>}
      {feedback && <div className="structure-message success" role="status"><IconCheck size={17}/>{feedback}</div>}
      {loading ? <div className="structure-loading">Carregando estrutura comercial...</div> : <>
        <div className="structure-team-title"><IconUsersGroup size={19}/><h4>Equipes cadastradas</h4></div>
        <div className="structure-team-list">
          {teamGroups.length === 0 && <p className="structure-empty">Nenhuma equipe cadastrada.</p>}
          {teamGroups.map(group => <article key={group.id} className="structure-team">
            <div className="structure-team-supervisor"><Initials name={group.name}/><div><strong>{group.name}</strong><span>Supervisor · {group.reports.length} subordinado{group.reports.length !== 1 ? 's' : ''}</span></div></div>
            <div className="structure-team-members">{group.reports.map(member => <span key={member.id}>{member.name}</span>)}</div>
          </article>)}
        </div>
        <div className="structure-edit-title"><div><h4>Gerenciar vínculos</h4><p>Selecione o supervisor de cada profissional e clique em Salvar.</p></div></div>
        <div className="structure-controls">
          <label className="structure-search"><IconSearch size={17}/><input value={query} onChange={e => setQuery(e.target.value)} placeholder="Buscar profissional" aria-label="Buscar profissional"/></label>
          <select value={selectedTeam} onChange={e => setSelectedTeam(e.target.value)} aria-label="Filtrar por supervisor"><option value="all">Todos os vendedores</option><option value="none">Sem supervisor</option>{supervisors.map(person => <option key={person.id} value={person.id}>{person.name}</option>)}</select>
        </div>
        <div className="structure-rows">
          {visibleSellers.length === 0 && <div className="structure-empty">Nenhum profissional encontrado.</div>}
          {visibleSellers.map(person => {
            const selected = draft[person.id] || ''
            const original = committed.get(person.id) || ''
            const changed = selected !== original
            return <div className="structure-row" key={person.id}>
              <div className="structure-person"><Initials name={person.name}/><div><strong>{person.name}</strong><span>{roleLabel(person.role)}{person.ultra_salesman_id ? ` · Ultra ${person.ultra_salesman_id}` : ''}</span></div></div>
              <IconArrowRight size={17} className="structure-direction"/>
              <label className="structure-select-label"><span>Supervisor responsável</span><select aria-label={`Supervisor de ${person.name}`} value={selected} disabled={!!saving} onChange={e => { setDraft(d => ({ ...d, [person.id]: e.target.value })); setFeedback('') }}>
                <option value={SUPERVISOR_NONE}>Sem supervisor</option>
                {supervisors.filter(p => p.id !== person.id).map(candidate => <option value={candidate.id} key={candidate.id}>{candidate.name}</option>)}
              </select></label>
              <button type="button" className="structure-button save" disabled={!changed || !!saving} onClick={() => save(person.id)}>{saving === person.id ? 'Salvando...' : changed ? 'Salvar' : 'Salvo'}{!changed && <IconCheck size={15}/>}</button>
            </div>
          })}
        </div>
        <p className="structure-footnote">A alteração não transfere a autoria de visitas, cotações ou pedidos. Cada registro continua no nome do vendedor responsável. O supervisor recebe acesso de consulta à equipe no Campo.</p>
      </>}
    </div>}
  </section>
}
