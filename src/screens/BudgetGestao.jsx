import { useEffect, useMemo, useState } from 'react'
import { supabase } from '../lib/supabase'
import { useAuth } from '../lib/useAuth'
import Topbar from '../components/Topbar'
import './BudgetGestao.css'
const fmt = n => Number(n||0).toLocaleString('pt-BR',{style:'currency',currency:'BRL'})
const localDateTime = (days=0) => {const d=new Date();d.setDate(d.getDate()+days);const pad=n=>String(n).padStart(2,'0');return d.getFullYear()+'-'+pad(d.getMonth()+1)+'-'+pad(d.getDate())+'T'+pad(d.getHours())+':'+pad(d.getMinutes())}
const defaultMonths = () => Array.from({length:3},(_,i)=>{const x=new Date();x.setDate(1);x.setMonth(x.getMonth()+i+1);return x.getFullYear()+'-'+String(x.getMonth()+1).padStart(2,'0')})
const monthName = m => new Date(m+'-01T12:00:00').toLocaleDateString('pt-BR',{month:'short',year:'numeric'})
export default function BudgetGestao() {
  const {user}=useAuth()
  const manager=['admin','gestor','gestor_comercial'].includes(user?.role)
  const [cycles,setCycles]=useState([])
  const [assignments,setAssignments]=useState([])
  const [rows,setRows]=useState([])
  const [sellers,setSellers]=useState([])
  const [farms,setFarms]=useState([])
  const [products,setProducts]=useState([])
  const [title,setTitle]=useState('Planejamento comercial trimestral')
  const [months,setMonths]=useState(defaultMonths)
  const [openAt,setOpenAt]=useState(localDateTime())
  const [closeAt,setCloseAt]=useState(localDateTime(14))
  const [selected,setSelected]=useState([])
  const [cycleId,setCycleId]=useState('')
  const [filterSeller,setFilterSeller]=useState('todos')
  const [busy,setBusy]=useState(false)
  const [message,setMessage]=useState('')
  async function load(){
    setBusy(true)
    const [c,a,i,p,f,pr]=await Promise.all([
      supabase.from('budget_cycles').select('*').order('created_at',{ascending:false}),
      supabase.from('budget_cycle_sellers').select('*'),
      supabase.from('budget_items').select('*'),
      supabase.from('profiles').select('id,name,role,active,ultra_salesman_id').eq('active',true),
      supabase.from('farms').select('id,name'),
      supabase.from('products').select('id,name,category_id,application_id')
    ])
    const err=[c,a,i,p,f,pr].find(x=>x.error)
    if(err)setMessage(err.error.message)
    setCycles(c.data||[]);setAssignments(a.data||[]);setRows(i.data||[])
    setSellers((p.data||[]).filter(x=>x.role==='vendedor'||x.role==='gestor_comercial').sort((a,b)=>a.name.localeCompare(b.name)))
    setFarms(f.data||[]);setProducts(pr.data||[])
    setCycleId(prev=>prev||(c.data||[])[0]?.id||'')
    setBusy(false)
  }
  useEffect(()=>{if(manager)load()},[manager])
  const cycle=cycles.find(c=>c.id===cycleId)
  const people=assignments.filter(a=>a.cycle_id===cycleId)
  const data=rows.filter(r=>r.cycle_id===cycleId && (filterSeller==='todos'||filterSeller===r.seller_id))
  const total=data.reduce((a,r)=>a+Number(r.quantity_kg)*Number(r.unit_price),0)
  const totalKg=data.reduce((a,r)=>a+Number(r.quantity_kg),0)
  const sellerName=id=>sellers.find(p=>p.id===id)?.name||'Vendedor'
  const create=async()=>{
    if(!title.trim()||!months.length||!selected.length){setMessage('Informe nome, meses e ao menos um vendedor.');return}
    if(new Date(closeAt)<=new Date(openAt)){setMessage('O encerramento deve ser posterior à abertura.');return}
    setBusy(true);setMessage('')
    const {data:newCycle,error}=await supabase.from('budget_cycles').insert({
      title:title.trim(),months:[...new Set(months)].sort(),opens_at:new Date(openAt).toISOString(),
      closes_at:new Date(closeAt).toISOString(),status:'draft',created_by:user.id
    }).select().single()
    if(error){setMessage(error.message);setBusy(false);return}
    const {error:assignmentError}=await supabase.from('budget_cycle_sellers').insert(selected.map(id=>({cycle_id:newCycle.id,seller_id:id,status:'pending'})))
    if(assignmentError)setMessage('Ciclo criado, mas os vendedores não foram vinculados: '+assignmentError.message)
    else setMessage('Ciclo criado como rascunho. Clique em Liberar quando desejar abrir o preenchimento.')
    setCycleId(newCycle.id);await load()
  }
  const changeCycle=async(status)=>{
    if(!window.confirm(status==='open'?'Liberar preenchimento deste ciclo para os vendedores?':'Encerrar preenchimento deste ciclo?'))return
    setBusy(true)
    const {error}=await supabase.from('budget_cycles').update({status}).eq('id',cycleId)
    if(error)setMessage(error.message);else setMessage(status==='open'?'Preenchimento liberado.':'Ciclo encerrado.')
    await load()
  }
  const review=async(a,status)=>{
    let feedback=a.feedback||null
    if(status==='revision_requested'){const value=window.prompt('Orientação para o vendedor corrigir o budget:',a.feedback||'');if(value===null)return;feedback=value.trim();if(!feedback){setMessage('Informe o motivo da revisão.');return}}
    const {error}=await supabase.from('budget_cycle_sellers').update({status,feedback}).eq('cycle_id',a.cycle_id).eq('seller_id',a.seller_id)
    if(error)setMessage(error.message);else setMessage('Situação atualizada para '+sellerName(a.seller_id))
    await load()
  }
  if(!manager)return <main className="budget-manage"><h2>Acesso exclusivo à gestão comercial.</h2></main>
  return <div className="budget-manage-shell">
    <Topbar title="Budget Comercial" subtitle="Planejamento de vendas por cliente, produto, vendedor e mês"/>
    <main className="page budget-manage">
      {!!message&&<div role="status" className="budget-msg">{message}</div>}
      <section className="budget-card">
        <div className="budget-heading"><span>CONTROLE GERENCIAL</span><h2>Criar ciclo de planejamento</h2><p>O ciclo começa fechado. Você escolhe quando liberar o preenchimento no Campo.</p></div>
        <div className="budget-form-grid"><label>Nome do ciclo<input value={title} onChange={e=>setTitle(e.target.value)}/></label><label>Início do preenchimento<input type="datetime-local" value={openAt} onChange={e=>setOpenAt(e.target.value)}/></label><label>Prazo final<input type="datetime-local" value={closeAt} onChange={e=>setCloseAt(e.target.value)}/></label></div>
        <div className="budget-section-label">Meses permitidos</div><div className="budget-month-list">{Array.from({length:6},(_,i)=>{const x=new Date();x.setDate(1);x.setMonth(x.getMonth()+i+1);const m=x.getFullYear()+'-'+String(x.getMonth()+1).padStart(2,'0');return <label key={m}><input type="checkbox" checked={months.includes(m)} onChange={e=>setMonths(prev=>e.target.checked?[...prev,m]:prev.filter(y=>y!==m))}/>{monthName(m)}</label>})}</div>
        <div className="budget-section-label">Vendedores autorizados</div>
        <div className="budget-seller-list">{sellers.map(s=><label key={s.id}><input type="checkbox" checked={selected.includes(s.id)} onChange={e=>setSelected(prev=>e.target.checked?[...prev,s.id]:prev.filter(x=>x!==s.id))}/>{s.name}</label>)}</div>
        <button className="budget-primary" disabled={busy} onClick={create}>Criar ciclo em rascunho</button>
      </section>
      <section className="budget-card">
        <div className="budget-heading"><span>CONSOLIDAÇÃO</span><h2>Acompanhamento do Budget</h2></div>
        <label className="budget-select">Ciclo<select value={cycleId} onChange={e=>setCycleId(e.target.value)}><option value="">Selecione</option>{cycles.map(c=><option key={c.id} value={c.id}>{c.title} · {c.status}</option>)}</select></label>
        {cycle&&<>
          <div className="budget-cycle-meta"><span>Meses: {cycle.months.map(monthName).join(' · ')}</span><span>Liberação: {new Date(cycle.opens_at).toLocaleString('pt-BR')}</span><span>Prazo: {new Date(cycle.closes_at).toLocaleString('pt-BR')}</span></div>
          <div className="budget-manage-actions">{cycle.status!=='open'&&<button disabled={busy} onClick={()=>changeCycle('open')}>Liberar preenchimento</button>}{cycle.status==='open'&&<button disabled={busy} onClick={()=>changeCycle('closed')}>Encerrar ciclo</button>}</div>
          <div className="budget-kpis"><article><span>Volume previsto</span><strong>{Number(totalKg/1000).toLocaleString('pt-BR',{maximumFractionDigits:2})} t</strong></article><article><span>Receita prevista</span><strong>{fmt(total)}</strong></article><article><span>Enviados</span><strong>{people.filter(x=>['submitted','approved'].includes(x.status)).length}/{people.length}</strong></article></div>
          <h3>Envios da equipe</h3><div className="budget-table-scroll"><table><thead><tr><th>Vendedor</th><th>Situação</th><th>Valor previsto</th><th>Revisão</th></tr></thead><tbody>{people.map(a=><tr key={a.seller_id}><td><strong>{sellerName(a.seller_id)}</strong></td><td>{a.status==='pending'?'Não iniciado':a.status==='draft'?'Em preenchimento':a.status==='submitted'?'Enviado':a.status==='approved'?'Aprovado':'Revisão solicitada'}</td><td>{fmt(rows.filter(r=>r.cycle_id===cycleId&&r.seller_id===a.seller_id).reduce((s,r)=>s+Number(r.quantity_kg)*Number(r.unit_price),0))}</td><td>{a.status==='submitted'?<div className="budget-review-actions"><button disabled={busy} onClick={()=>review(a,'approved')}>Aprovar</button><button disabled={busy} onClick={()=>review(a,'revision_requested')}>Devolver</button></div>:a.feedback||'—'}</td></tr>)}</tbody></table></div>
          <h3>Detalhamento por cliente e produto</h3><label className="budget-select">Vendedor<select value={filterSeller} onChange={e=>setFilterSeller(e.target.value)}><option value="todos">Todos os vendedores</option>{people.map(a=><option key={a.seller_id} value={a.seller_id}>{sellerName(a.seller_id)}</option>)}</select></label>
          <div className="budget-table-scroll"><table><thead><tr><th>Vendedor</th><th>Cliente</th><th>Produto</th><th>Mês</th><th>Volume kg</th><th>Previsto R$</th><th>Origem</th></tr></thead><tbody>{data.map(r=><tr key={r.id}><td>{sellerName(r.seller_id)}</td><td>{farms.find(f=>f.id===r.farm_id)?.name||r.farm_id}</td><td>{products.find(p=>p.id===r.product_id)?.name||r.product_id}</td><td>{monthName(r.month)}</td><td>{Number(r.quantity_kg).toLocaleString('pt-BR')}</td><td>{fmt(Number(r.quantity_kg)*Number(r.unit_price))}</td><td>{r.source==='recurring'?'Recorrente':'Oportunidade'}</td></tr>)}</tbody></table>{!data.length&&<p>Sem previsões cadastradas neste ciclo.</p>}</div>
        </>}
      </section>
      <p className="budget-caption">Valores são previsões comerciais baseadas nos preços de referência registrados, não metas, pedidos confirmados ou faturamento realizado.</p>
    </main>
  </div>
}
