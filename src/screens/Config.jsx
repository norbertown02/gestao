import { useState, useEffect } from 'react'
import { supabase, supabaseAdmin } from '../lib/supabase'
import Topbar from '../components/Topbar'
import { IconPlus, IconTrash, IconEdit, IconCheck, IconX } from '@tabler/icons-react'

function useTable(table, order='name') {
  const [data, setData]       = useState([])
  const [loading, setLoading] = useState(true)

  async function load() {
    setLoading(true)
    const { data: rows } = await supabaseAdmin.from(table).select('*').order(order)
    setData(rows || [])
    setLoading(false)
  }

  useEffect(() => { load() }, [])

  async function add(row)           { const { data: novo } = await supabaseAdmin.from(table).insert(row).select().single(); if(novo) setData(prev=>[...prev,novo]) }
  async function update(id,changes) { await supabaseAdmin.from(table).update(changes).eq('id',id); setData(prev=>prev.map(r=>r.id===id?{...r,...changes}:r)) }
  async function remove(id)         { await supabaseAdmin.from(table).delete().eq('id',id); setData(prev=>prev.filter(r=>r.id!==id)) }

  return { data, loading, add, update, remove }
}

function TableSection({ title, columns, data, loading, onAdd, onUpdate, onDelete, newRowTemplate }) {
  const [editId, setEditId]   = useState(null)
  const [editRow, setEditRow] = useState({})
  const [adding, setAdding]   = useState(false)
  const [newRow, setNewRow]   = useState(newRowTemplate)

  async function saveEdit() { await onUpdate(editId, editRow); setEditId(null) }
  async function saveNew()  { await onAdd(newRow); setNewRow(newRowTemplate); setAdding(false) }

  return (
    <div className="card" style={{marginBottom:20}}>

      <div style={{display:'flex',alignItems:'center',marginBottom:14}}>
        <div className="section-title" style={{margin:0}}>{title}</div>
        <button className="btn btn-primary btn-sm" style={{marginLeft:'auto'}} onClick={()=>setAdding(true)}>
          <IconPlus size={14}/> Adicionar
        </button>
      </div>
      <div className="table-wrap">
        <table>
          <thead><tr>{columns.map(c=><th key={c.key}>{c.label}</th>)}<th style={{width:90}}>Ações</th></tr></thead>
          <tbody>
            {adding && (
              <tr style={{background:'var(--orange-bg)'}}>
                {columns.map(c=>(
                  <td key={c.key}>
                    {c.type==='select' ? (
                      <select value={newRow[c.key]||''} onChange={e=>setNewRow(p=>({...p,[c.key]:e.target.value}))} style={{padding:'4px 8px',fontSize:12}}>
                        {c.options.map(o=><option key={o.value} value={o.value}>{o.label}</option>)}
                      </select>
                    ) : (
                      <input value={newRow[c.key]||''} onChange={e=>setNewRow(p=>({...p,[c.key]:e.target.value}))} style={{padding:'4px 8px',fontSize:12}} placeholder={c.label}/>
                    )}
                  </td>
                ))}
                <td>
                  <div style={{display:'flex',gap:4}}>
                    <button className="btn btn-primary btn-sm" onClick={saveNew}><IconCheck size={13}/></button>
                    <button className="btn btn-ghost btn-sm" onClick={()=>setAdding(false)}><IconX size={13}/></button>
                  </div>
                </td>
              </tr>
            )}
            {loading ? <tr><td colSpan={columns.length+1} style={{textAlign:'center',color:'var(--text-faint)'}}>Carregando...</td></tr>
              : data.map(row=>(
                <tr key={row.id}>
                  {columns.map(c=>(
                    <td key={c.key}>
                      {editId===row.id ? (
                        c.type==='select' ? (
                          <select value={editRow[c.key]||''} onChange={e=>setEditRow(p=>({...p,[c.key]:e.target.value}))} style={{padding:'4px 8px',fontSize:12}}>
                            {c.options.map(o=><option key={o.value} value={o.value}>{o.label}</option>)}
                          </select>
                        ) : (
                          <input value={editRow[c.key]||''} onChange={e=>setEditRow(p=>({...p,[c.key]:e.target.value}))} style={{padding:'4px 8px',fontSize:12}}/>
                        )
                      ) : c.render ? c.render(row[c.key],row) : row[c.key]}
                    </td>
                  ))}
                  <td>
                    {editId===row.id ? (
                      <div style={{display:'flex',gap:4}}>
                        <button className="btn btn-primary btn-sm" onClick={saveEdit}><IconCheck size={13}/></button>
                        <button className="btn btn-ghost btn-sm" onClick={()=>setEditId(null)}><IconX size={13}/></button>
                      </div>
                    ) : (
                      <div style={{display:'flex',gap:4}}>
                        <button className="btn btn-ghost btn-sm" onClick={()=>{setEditId(row.id);setEditRow({...row})}}><IconEdit size={13}/></button>
                        <button className="btn btn-danger btn-sm" onClick={()=>onDelete(row.id)}><IconTrash size={13}/></button>
                      </div>
                    )}
                  </td>
                </tr>
              ))
            }
          </tbody>
        </table>
      </div>
    </div>
  )
}

function VendedoresSection() {
  const [sellers, setSellers]   = useState([])
  const [loading, setLoading]   = useState(true)
  const [adding, setAdding]     = useState(false)
  const [form, setForm]         = useState({name:'',email:'',password:'',role:'vendedor'})
  const [editRole, setEditRole]   = useState(null) // {id, role}
  const [saving, setSaving]     = useState(false)
  const [msg, setMsg]           = useState('')

  async function load() {
    setLoading(true)
    const { data } = await supabaseAdmin.from('profiles').select('*').order('name')
    setSellers(data||[])
    setLoading(false)
  }

  useEffect(()=>{ load() },[])

  async function addSeller() {
    setSaving(true)
    setSaving(true); setMsg('')
    // Cria usuário no Auth
    // Cria usuário via função SQL segura
    const { data: newUserId, error: fnError } = await supabase.rpc('create_user', {
      p_email: form.email,
      p_password: form.password,
      p_name: form.name,
      p_role: form.role,
    })
    if (fnError) { setMsg('Erro: ' + fnError.message); setSaving(false); return }
    // profiles é populado automaticamente pelo trigger
    const error = null
    if (!error) { setMsg('Vendedor cadastrado!'); setForm({name:'',email:'',password:'',role:'vendedor'}); setAdding(false); load() }
    else setMsg('Erro: '+error.message)
    setSaving(false)
  }

  async function toggleActive(id, active) {
    await supabaseAdmin.from('profiles').update({active}).eq('id',id)
    setSellers(prev=>prev.map(s=>s.id===id?{...s,active}:s))
  }

  return (
    <div className="card" style={{marginBottom:20}}>
      {editRole && (
        <div style={{position:'fixed',inset:0,background:'rgba(0,0,0,0.5)',zIndex:100,display:'flex',alignItems:'center',justifyContent:'center'}}
          onClick={()=>setEditRole(null)}>
          <div style={{background:'var(--surface-1)',borderRadius:16,padding:24,minWidth:320}} onClick={e=>e.stopPropagation()}>
            <div style={{fontWeight:700,fontSize:16,marginBottom:16}}>Editar perfil</div>
            <label style={{fontSize:12,fontWeight:600,color:'var(--text-dim)'}}>Role</label>
            <select value={editRole.role} onChange={e=>setEditRole(p=>({...p,role:e.target.value}))} style={{marginTop:4,marginBottom:16,width:'100%'}}>
              <option value="vendedor">Vendedor</option>
              <option value="gestor_comercial">Gestor Comercial</option>
              <option value="gestor">Gestor</option>
              <option value="admin">Admin</option>
            </select>
            <div style={{display:'flex',gap:8}}>
              <button className="btn btn-primary" style={{flex:1}} onClick={salvarRole}>Salvar</button>
              <button className="btn btn-ghost" style={{flex:1}} onClick={()=>setEditRole(null)}>Cancelar</button>
            </div>
          </div>
        </div>
      )}
      <div style={{display:'flex',alignItems:'center',marginBottom:14}}>
        <div className="section-title" style={{margin:0}}>Vendedores</div>
        <button className="btn btn-primary btn-sm" style={{marginLeft:'auto'}} onClick={()=>setAdding(p=>!p)}>
          <IconPlus size={14}/> Adicionar
        </button>
      </div>
      {adding && (
        <div style={{background:'var(--orange-bg)',borderRadius:10,padding:16,marginBottom:16}}>
          <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:10,marginBottom:10}}>
            <div className="form-group"><label>Nome *</label><input value={form.name} onChange={e=>setForm(p=>({...p,name:e.target.value}))}/></div>
            <div className="form-group"><label>E-mail *</label><input type="email" value={form.email} onChange={e=>setForm(p=>({...p,email:e.target.value}))}/></div>
            <div className="form-group"><label>Senha *</label><input type="password" value={form.password} onChange={e=>setForm(p=>({...p,password:e.target.value}))}/></div>
            <div className="form-group">
              <label>Perfil</label>
              <select value={form.role} onChange={e=>setForm(p=>({...p,role:e.target.value}))}>
                <option value="vendedor">Vendedor</option>
                <option value="gerente">Gerente</option>
                <option value="admin">Admin</option>
              </select>
            </div>
          </div>
          {msg && <div style={{marginBottom:10,fontSize:13,color:msg.includes('Erro')?'var(--red)':'var(--green)'}}>{msg}</div>}
          <div style={{display:'flex',gap:8}}>
            <button className="btn btn-primary btn-sm" onClick={addSeller} disabled={saving||!form.name||!form.email||!form.password}>
              {saving?'Salvando...':'Salvar'}
            </button>
            <button className="btn btn-ghost btn-sm" onClick={()=>setAdding(false)}>Cancelar</button>
          </div>
        </div>
      )}
      <div className="table-wrap">
        <table>
          <thead><tr><th>Nome</th><th>E-mail</th><th>Perfil</th><th>Status</th><th>Ações</th></tr></thead>
          <tbody>
            {loading ? <tr><td colSpan={5} style={{textAlign:'center',color:'var(--text-faint)'}}>Carregando...</td></tr>
              : sellers.map(s=>(
                <tr key={s.id}>
                  <td style={{fontWeight:500}}>{s.name}</td>
                  <td>{s.email}</td>
                  <td><span className={`pill ${s.role==='admin'?'pill-orange':s.role==='gerente'?'pill-blue':'pill-gray'}`}>{s.role}</span></td>
                  <td><span className={`pill ${s.active?'pill-green':'pill-red'}`}>{s.active?'Ativo':'Inativo'}</span></td>
                  <td style={{display:'flex',gap:6}}>
                    <button className={`btn btn-sm ${s.active?'btn-danger':'btn-ghost'}`} onClick={()=>toggleActive(s.id,!s.active)}>{s.active?'Desativar':'Ativar'}</button>
                    <button className="btn btn-sm btn-ghost" onClick={()=>setEditRole({id:s.id,role:s.role})}>Editar role</button>
                  </td>
                </tr>
              ))
            }
          </tbody>
        </table>
      </div>
    </div>
  )
}

export default function Config() {
  const produtos  = useTable('products','name')
  const pagamento = useTable('payment_terms','days')
  const segmentos = useTable('segments','label')
  const estados   = useTable('states','label')
  const regioes   = useTable('regions','name')
  const [aba, setAba] = useState('vendedores')

  const ABAS = [
    {id:'vendedores',label:'Vendedores'},
    {id:'produtos',  label:'Produtos'},
    {id:'pagamento', label:'Formas de pagamento'},
    {id:'segmentos', label:'Segmentos'},
    {id:'estados',   label:'Estados'},
    {id:'regioes',   label:'Regiões'},
  ]

  const SEGS = [{value:'leite',label:'Leite'},{value:'corte',label:'Corte'},{value:'suinos',label:'Suínos'},{value:'todos',label:'Todos'}]
  const STATES_OPT = [{value:'PR',label:'Paraná'},{value:'SC',label:'Santa Catarina'},{value:'MS',label:'Mato Grosso do Sul'},{value:'RS',label:'Rio Grande do Sul'},{value:'SP',label:'São Paulo'}]

  return (
    <div style={{flex:1,overflow:'hidden',display:'flex',flexDirection:'column'}}>
      <Topbar title="Configurações" subtitle="Gerencie produtos, vendedores e dados do sistema"/>
      <div className="page" style={{overflowY:'auto'}}>
        <div style={{display:'flex',gap:4,marginBottom:20,borderBottom:'1px solid var(--line)'}}>
          {ABAS.map(a=>(
            <button key={a.id} onClick={()=>setAba(a.id)} style={{
              padding:'8px 16px',border:'none',background:'none',cursor:'pointer',
              fontSize:13,fontWeight:500,fontFamily:'inherit',
              color:aba===a.id?'var(--orange)':'var(--text-dim)',
              borderBottom:`2px solid ${aba===a.id?'var(--orange)':'transparent'}`,
              marginBottom:-1,
            }}>{a.label}</button>
          ))}
        </div>

        {aba==='vendedores' && <VendedoresSection/>}

        {aba==='produtos' && (
          <TableSection title="Produtos" data={produtos.data} loading={produtos.loading}
            onAdd={r=>produtos.add({...r,active:true})} onUpdate={produtos.update} onDelete={produtos.remove}
            newRowTemplate={{code:'',name:'',segment:'leite',price:'',unit:''}}
            columns={[
              {key:'code',label:'Código'},
              {key:'name',label:'Nome'},
              {key:'segment',label:'Segmento',type:'select',options:SEGS},
              {key:'price',label:'Preço (R$)'},
              {key:'unit',label:'Unidade'},
              {key:'active',label:'Ativo',render:v=><span className={`pill ${v?'pill-green':'pill-gray'}`}>{v?'Sim':'Não'}</span>},
            ]}
          />
        )}

        {aba==='pagamento' && (
          <TableSection title="Formas de pagamento" data={pagamento.data} loading={pagamento.loading}
            onAdd={r=>pagamento.add({...r,active:true})} onUpdate={pagamento.update} onDelete={pagamento.remove}
            newRowTemplate={{label:'',days:''}}
            columns={[
              {key:'label',label:'Descrição'},
              {key:'days',label:'Prazo médio (dias)'},
              {key:'active',label:'Ativo',render:v=><span className={`pill ${v?'pill-green':'pill-gray'}`}>{v?'Sim':'Não'}</span>},
            ]}
          />
        )}

        {aba==='segmentos' && (
          <TableSection title="Segmentos" data={segmentos.data} loading={segmentos.loading}
            onAdd={segmentos.add} onUpdate={segmentos.update} onDelete={segmentos.remove}
            newRowTemplate={{id:'',label:'',color:'#F07D1A'}}
            columns={[
              {key:'id',label:'ID (chave)'},
              {key:'label',label:'Nome'},
              {key:'color',label:'Cor',render:v=><span style={{display:'inline-block',width:20,height:20,borderRadius:4,background:v}}/>},
            ]}
          />
        )}

        {aba==='estados' && (
          <TableSection title="Estados atendidos" data={estados.data} loading={estados.loading}
            onAdd={estados.add} onUpdate={estados.update} onDelete={estados.remove}
            newRowTemplate={{id:'',label:''}}
            columns={[{key:'id',label:'Sigla (ex: PR)'},{key:'label',label:'Nome completo'}]}
          />
        )}

        {aba==='regioes' && (
          <TableSection title="Regiões comerciais" data={regioes.data} loading={regioes.loading}
            onAdd={regioes.add} onUpdate={regioes.update} onDelete={regioes.remove}
            newRowTemplate={{name:'',state_id:'PR'}}
            columns={[
              {key:'name',label:'Nome da região'},
              {key:'state_id',label:'Estado',type:'select',options:STATES_OPT},
            ]}
          />
        )}
      </div>
    </div>
  )
}
