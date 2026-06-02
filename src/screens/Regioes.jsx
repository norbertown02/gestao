import { useState, useEffect } from 'react'
import { supabase } from '../lib/supabase'
import Topbar from '../components/Topbar'
import { IconFilter, IconDownload } from '@tabler/icons-react'
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts'

function fmt(n) { return Number(n||0).toLocaleString('pt-BR',{minimumFractionDigits:2,maximumFractionDigits:2}) }
function fmtK(n) { if(n>=1000000) return `R$ ${(n/1000000).toFixed(1)}M`; if(n>=1000) return `R$ ${(n/1000).toFixed(1)}k`; return `R$ ${fmt(n)}` }
function periodoRange(p) {
  const hoje=new Date(),ano=hoje.getFullYear(),mes=hoje.getMonth()
  if(p==='mes') return [new Date(ano,mes,1),hoje]
  if(p==='trimestre') return [new Date(ano,mes-2,1),hoje]
  if(p==='semestre') return [new Date(ano,mes-5,1),hoje]
  return [new Date(ano,0,1),hoje]
}
function toISO(d) { return d.toISOString().split('T')[0] }
function scoreCor(n) { if(n>=75) return 'var(--green)'; if(n>=50) return 'var(--amber)'; return 'var(--red)' }

export default function Regioes() {
  const [periodo,    setPeriodo]    = useState('mes')
  const [farms,      setFarms]      = useState([])
  const [sales,      setSales]      = useState([])
  const [visits,     setVisits]     = useState([])
  const [checklists, setChecklists] = useState([])
  const [loading,    setLoading]    = useState(true)
  const [regiaoSel,  setRegiaoSel]  = useState(null)

  useEffect(()=>{ carregarBase() },[])
  useEffect(()=>{ if(farms.length) carregarPeriodo() },[periodo,farms])

  async function carregarBase() {
    const {data}=await supabase.from('farms').select('*')
    setFarms(data||[])
  }

  async function carregarPeriodo() {
    setLoading(true)
    const [ini,fim]=periodoRange(periodo)
    const [sl,vs,ck]=await Promise.all([
      supabase.from('sales').select('*').gte('sale_date',toISO(ini)).lte('sale_date',toISO(fim)),
      supabase.from('visits').select('*').gte('visit_date',toISO(ini)).lte('visit_date',toISO(fim)),
      supabase.from('checklists').select('*').gte('applied_at',toISO(ini)).lte('applied_at',toISO(fim)),
    ])
    setSales(sl.data||[])
    setVisits(vs.data||[])
    setChecklists(ck.data||[])
    setLoading(false)
  }

  // Agrupa por região
  const regioes={}
  farms.forEach(f=>{
    const r=f.region||f.state||'Sem região'
    if(!regioes[r]) regioes[r]={nome:r,farms:[],receita:0,pedidos:0,visitas:0,scores:[],cidades:new Set()}
    regioes[r].farms.push(f)
    if(f.city) regioes[r].cidades.add(f.city)
  })

  // Adiciona dados de vendas
  sales.forEach(s=>{
    const f=farms.find(f=>f.id===s.farm_id)
    const r=f?.region||f?.state||'Sem região'
    if(regioes[r]){ regioes[r].receita+=Number(s.total||0); regioes[r].pedidos++ }
  })

  // Visitas
  visits.forEach(v=>{
    const f=farms.find(f=>f.id===v.farm_id)
    const r=f?.region||f?.state||'Sem região'
    if(regioes[r]) regioes[r].visitas++
  })

  // Checklists
  checklists.forEach(c=>{
    const f=farms.find(f=>f.id===c.farm_id)
    const r=f?.region||f?.state||'Sem região'
    if(regioes[r]) regioes[r].scores.push(Number(c.overall_score||0))
  })

  const listaRegioes=Object.values(regioes).map(r=>({
    ...r,
    cidades:r.cidades.size,
    fazendas:r.farms.length,
    ticket:r.pedidos?r.receita/r.pedidos:0,
    cobertura:r.farms.length?Math.round((new Set(visits.filter(v=>r.farms.find(f=>f.id===v.farm_id)).map(v=>v.farm_id)).size/r.farms.length)*100):0,
    scoreMedia:r.scores.length?Math.round(r.scores.reduce((a,b)=>a+b,0)/r.scores.length):0,
  })).sort((a,b)=>b.receita-a.receita)

  const totalReceita=listaRegioes.reduce((a,r)=>a+r.receita,0)
  const regiaoDetalhe=regiaoSel?listaRegioes.find(r=>r.nome===regiaoSel):null

  function exportCSV(){
    const rows=[['Região','Fazendas','Cidades','Receita','Pedidos','Ticket médio','Visitas','Cobertura%','Score médio'],
      ...listaRegioes.map(r=>[r.nome,r.fazendas,r.cidades,r.receita,r.pedidos,r.ticket,r.visitas,r.cobertura,r.scoreMedia])]
    const a=document.createElement('a')
    a.href='data:text/csv;charset=utf-8,\uFEFF'+encodeURIComponent(rows.map(r=>r.join(';')).join('\n'))
    a.download='regioes.csv';a.click()
  }

  return (
    <div style={{flex:1,overflow:'hidden',display:'flex',flexDirection:'column'}}>
      <Topbar title="Análise por Região" subtitle="Performance geográfica da operação">
        <button className="btn btn-ghost btn-sm" onClick={exportCSV}><IconDownload size={14}/> Exportar CSV</button>
      </Topbar>
      <div className="page" style={{overflowY:'auto'}}>
        <div style={{display:'flex',gap:10,marginBottom:20,alignItems:'center'}}>
          <IconFilter size={14} color="var(--text-faint)"/>
          <select value={periodo} onChange={e=>setPeriodo(e.target.value)} style={{width:'auto',padding:'6px 10px',fontSize:12}}>
            <option value="mes">Mês atual</option><option value="trimestre">Trimestre</option><option value="semestre">Semestre</option><option value="ano">Ano</option>
          </select>
          <span style={{fontSize:12,color:'var(--text-faint)',marginLeft:'auto'}}>{listaRegioes.length} regiões</span>
        </div>

        <div className="kpi-grid" style={{gridTemplateColumns:'repeat(4,1fr)'}}>
          {[
            {label:'Receita total',    value:fmtK(totalReceita),         sub:'no período'},
            {label:'Regiões ativas',   value:listaRegioes.filter(r=>r.receita>0).length, sub:`de ${listaRegioes.length} regiões`},
            {label:'Top região',       value:listaRegioes[0]?.nome||'—', sub:listaRegioes[0]?fmtK(listaRegioes[0].receita):''},
            {label:'Total de fazendas',value:farms.length,                sub:'na carteira'},
          ].map(k=>(
            <div key={k.label} className="kpi">
              <div className="label">{k.label}</div>
              <div className="value" style={{fontSize:18}}>{k.value}</div>
              <div className="sub">{k.sub}</div>
            </div>
          ))}
        </div>

        {loading?<div className="empty">Carregando...</div>:(
          <>
            {/* Gráfico comparativo */}
            <div style={{display:'grid',gridTemplateColumns:'2fr 1fr',gap:16,marginBottom:20}}>
              <div className="card">
                <div className="section-title">Receita por região</div>
                {listaRegioes.length>0?(
                  <ResponsiveContainer width="100%" height={220}>
                    <BarChart data={listaRegioes} layout="vertical" margin={{top:0,right:60,left:8,bottom:0}}>
                      <CartesianGrid strokeDasharray="3 3" stroke="var(--line)"/>
                      <XAxis type="number" tick={{fontSize:11}} tickFormatter={v=>`R$${(v/1000).toFixed(0)}k`}/>
                      <YAxis type="category" dataKey="nome" tick={{fontSize:11}} width={120}/>
                      <Tooltip formatter={v=>[`R$ ${fmt(v)}`,'Receita']}/>
                      <Bar dataKey="receita" fill="var(--orange)" radius={[0,4,4,0]}/>
                    </BarChart>
                  </ResponsiveContainer>
                ):<div className="empty" style={{padding:40}}>Sem dados</div>}
              </div>

              <div className="card">
                <div className="section-title">Score médio por região</div>
                {listaRegioes.filter(r=>r.scoreMedia>0).length>0?(
                  <ResponsiveContainer width="100%" height={220}>
                    <BarChart data={listaRegioes.filter(r=>r.scoreMedia>0)} layout="vertical" margin={{top:0,right:40,left:8,bottom:0}}>
                      <CartesianGrid strokeDasharray="3 3" stroke="var(--line)"/>
                      <XAxis type="number" domain={[0,100]} tick={{fontSize:11}}/>
                      <YAxis type="category" dataKey="nome" tick={{fontSize:11}} width={120}/>
                      <Tooltip/>
                      <Bar dataKey="scoreMedia" name="Score" fill="var(--blue)" radius={[0,4,4,0]}/>
                    </BarChart>
                  </ResponsiveContainer>
                ):<div className="empty" style={{padding:40}}>Sem checklists</div>}
              </div>
            </div>

            {/* Tabela comparativa */}
            <div className="card" style={{marginBottom:20}}>
              <div className="section-title">Comparativo por região</div>
              <div className="table-wrap">
                <table>
                  <thead>
                    <tr>
                      <th>Região</th><th style={{textAlign:'center'}}>Fazendas</th><th style={{textAlign:'center'}}>Cidades</th>
                      <th style={{textAlign:'right'}}>Receita</th><th style={{textAlign:'right'}}>Ticket médio</th>
                      <th style={{textAlign:'center'}}>Visitas</th><th style={{textAlign:'center'}}>Cobertura</th>
                      <th style={{textAlign:'center'}}>Score</th><th style={{textAlign:'right'}}>% receita</th>
                      <th></th>
                    </tr>
                  </thead>
                  <tbody>
                    {listaRegioes.map(r=>(
                      <>
                        <tr key={r.nome} style={{cursor:'pointer',background:regiaoSel===r.nome?'var(--orange-bg)':''}}
                          onClick={()=>setRegiaoSel(regiaoSel===r.nome?null:r.nome)}>
                          <td style={{fontWeight:600}}>{r.nome}</td>
                          <td style={{textAlign:'center'}}>{r.fazendas}</td>
                          <td style={{textAlign:'center'}}>{r.cidades}</td>
                          <td style={{textAlign:'right',fontWeight:600,color:'var(--orange)'}}>{fmtK(r.receita)}</td>
                          <td style={{textAlign:'right'}}>{fmtK(r.ticket)}</td>
                          <td style={{textAlign:'center'}}>{r.visitas}</td>
                          <td style={{textAlign:'center'}}>
                            <span style={{color:r.cobertura>=70?'var(--green)':r.cobertura>=50?'var(--amber)':'var(--red)',fontWeight:600}}>{r.cobertura}%</span>
                          </td>
                          <td style={{textAlign:'center'}}>
                            {r.scoreMedia>0?<span className="pill" style={{background:r.scoreMedia>=75?'var(--green-bg)':r.scoreMedia>=50?'var(--amber-bg)':'var(--red-bg)',color:scoreCor(r.scoreMedia)}}>{r.scoreMedia}</span>:'—'}
                          </td>
                          <td style={{textAlign:'right',fontSize:12}}>{totalReceita?((r.receita/totalReceita)*100).toFixed(1):0}%</td>
                          <td style={{fontSize:12,color:'var(--text-faint)'}}>{regiaoSel===r.nome?'▲':'▼'}</td>
                        </tr>
                        {regiaoSel===r.nome&&(
                          <tr key={r.nome+'_d'}>
                            <td colSpan={10} style={{background:'var(--surface-2)',padding:'12px 16px'}}>
                              <div style={{fontWeight:600,fontSize:12,marginBottom:8}}>Fazendas em {r.nome}:</div>
                              <div style={{display:'flex',gap:8,flexWrap:'wrap'}}>
                                {r.farms.map(f=>(
                                  <div key={f.id} style={{background:'var(--surface)',borderRadius:8,padding:'6px 12px',fontSize:12}}>
                                    <div style={{fontWeight:500}}>{f.name}</div>
                                    <div style={{fontSize:11,color:'var(--text-faint)',textTransform:'capitalize'}}>{f.segment} · {f.city}</div>
                                  </div>
                                ))}
                              </div>
                            </td>
                          </tr>
                        )}
                      </>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </>
        )}
      </div>
    </div>
  )
}
