import { useState, useEffect } from 'react'
import { supabaseAdmin } from '../lib/supabase'
import Topbar from '../components/Topbar'
import { IconPlus, IconTrash, IconEdit, IconCheck, IconX } from '@tabler/icons-react'

function useTable(table, order='name') {
  const [data, setData] = useState([])
  const [loading, setLoading] = useState(true)

  async function load() {
    setLoading(true)
    const { data: rows } = await supabaseAdmin.from(table).select('*').order(order)
    setData(rows || [])
    setLoading(false)
  }

  useEffect(() => { load() }, [])

  async function add(row) {
    const { data: novo, error } = await supabaseAdmin.from(table).insert(row).select().single()
    if (error) { alert('Erro: ' + error.message); return }
    if (novo) setData(prev => [...prev, novo])
  }

  async function update(id, changes) {
    const { error } = await supabaseAdmin.from(table).update(changes).eq('id', id)
    if (error) { alert('Erro: ' + error.message); return }
    setData(prev => prev.map(r => r.id === id ? { ...r, ...changes } : r))
  }

  async function remove(id) {
    const { error } = await supabaseAdmin.from(table).delete().eq('id', id)
    if (error) { alert('Erro: ' + error.message); return }
    setData(prev => prev.filter(r => r.id !== id))
  }

  return { data, loading, add, update, remove }
}

function TableSection({ title, columns, data, loading, onAdd, onUpdate, onDelete, newRowTemplate }) {
  const [editId, setEditId] = useState(null)
  const [editRow, setEditRow] = useState({})
  const [adding, setAdding] = useState(false)
  const [newRow, setNewRow] = useState(newRowTemplate)

  async function saveEdit() {
    await onUpdate(editId, editRow)
    setEditId(null)
  }

  async function saveNew() {
    await onAdd(newRow)
    setNewRow(newRowTemplate)
    setAdding(false)
  }

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
          <thead>
            <tr>
              {columns.map(c => <th key={c.key}>{c.label}</th>)}
              <th style={{width:90}}>Ações</th>
            </tr>
          </thead>
          <tbody>
            {adding && (
              <tr style={{background:'var(--orange-bg)'}}>
                {columns.map(c => (
                  <td key={c.key}>
                    {c.type === 'select' ? (
                      <select
                        value={newRow[c.key] || ''}
                        onChange={e => setNewRow(p => ({...p, [c.key]: e.target.value}))}
                        style={{padding:'4px 8px',fontSize:12}}
                      >
                        {c.options.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
                      </select>
                    ) : (
                      <input
                        value={newRow[c.key] || ''}
                        onChange={e => setNewRow(p => ({...p, [c.key]: e.target.value}))}
                        style={{padding:'4px 8px',fontSize:12}}
                        placeholder={c.label}
                      />
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

            {loading ? (
              <tr>
                <td colSpan={columns.length + 1} style={{textAlign:'center',color:'var(--text-faint)'}}>Carregando...</td>
              </tr>
            ) : data.map(row => (
              <tr key={row.id}>
                {columns.map(c => (
                  <td key={c.key}>
                    {editId === row.id ? (
                      c.type === 'select' ? (
                        <select
                          value={editRow[c.key] || ''}
                          onChange={e => setEditRow(p => ({...p, [c.key]: e.target.value}))}
                          style={{padding:'4px 8px',fontSize:12}}
                        >
                          {c.options.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
                        </select>
                      ) : (
                        <input
                          value={editRow[c.key] || ''}
                          onChange={e => setEditRow(p => ({...p, [c.key]: e.target.value}))}
                          style={{padding:'4px 8px',fontSize:12}}
                        />
                      )
                    ) : c.render ? c.render(row[c.key], row) : row[c.key]}
                  </td>
                ))}
                <td>
                  {editId === row.id ? (
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
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}

export default function Config() {
  const segmentos = useTable('segments', 'label')
  const regioes = useTable('regions', 'name')
  const [aba, setAba] = useState('segmentos')

  const ABAS = [
    { id: 'segmentos', label: 'Segmentos' },
    { id: 'regioes', label: 'Regiões' },
  ]

  const STATES_OPT = [
    {value:'PR',label:'Paraná'},
    {value:'SC',label:'Santa Catarina'},
    {value:'MS',label:'Mato Grosso do Sul'},
    {value:'RS',label:'Rio Grande do Sul'},
    {value:'SP',label:'São Paulo'},
  ]

  return (
    <div style={{flex:1,overflow:'hidden',display:'flex',flexDirection:'column'}}>
      <Topbar title="Configurações" subtitle="Parâmetros gerais do sistema"/>

      <div className="page" style={{overflowY:'auto'}}>
        <div style={{display:'flex',gap:4,marginBottom:20,borderBottom:'1px solid var(--line)'}}>
          {ABAS.map(a => (
            <button
              key={a.id}
              onClick={()=>setAba(a.id)}
              style={{
                padding:'8px 16px',
                border:'none',
                background:'none',
                cursor:'pointer',
                fontSize:13,
                fontWeight:500,
                fontFamily:'inherit',
                color:aba===a.id?'var(--orange)':'var(--text-dim)',
                borderBottom:`2px solid ${aba===a.id?'var(--orange)':'transparent'}`,
                marginBottom:-1,
              }}
            >
              {a.label}
            </button>
          ))}
        </div>

        {aba === 'segmentos' && (
          <TableSection
            title="Segmentos"
            data={segmentos.data}
            loading={segmentos.loading}
            onAdd={segmentos.add}
            onUpdate={segmentos.update}
            onDelete={segmentos.remove}
            newRowTemplate={{id:'',label:'',color:'#F07D1A'}}
            columns={[
              {key:'id',label:'ID (chave)'},
              {key:'label',label:'Nome'},
              {key:'color',label:'Cor',render:v=><span style={{display:'inline-block',width:20,height:20,borderRadius:4,background:v}}/>},
            ]}
          />
        )}

        {aba === 'regioes' && (
          <TableSection
            title="Regiões comerciais"
            data={regioes.data}
            loading={regioes.loading}
            onAdd={regioes.add}
            onUpdate={regioes.update}
            onDelete={regioes.remove}
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
