import { useState, useEffect } from 'react'
import { supabase } from '../lib/supabase'
import Topbar from '../components/Topbar'
import { IconFilter, IconDownload, IconAlertTriangle } from '@tabler/icons-react'
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from 'recharts'

function periodoRange(p) {
  const hoje=new Date(),ano=hoje.getFullYear(),mes=hoje.getMonth()
  if(p==='mes') return [new Date(ano,mes,1),hoje]
  if(p==='trimestre') return [new Date(ano,mes-2,1),hoje]
  if(p==='semestre') return [new Date(ano,mes-5,1),hoje]
  return [new Date(ano,0,1),hoje]
}
function toISO(d) { return d.toISOString().split('T')[0] }

const OUTCOME_CFG = {
  positiva:{label:'Positiva',color:'var(--green)',  bg:'var(--green-bg)'},
  neutra:  {label:'Neutra',  color:'var(--text-dim)',bg:'var(--surface-2)'},
  negativa:{label:'Negativa',color:'var(--red)',    bg:'var(--red-bg)'},
}

export default function Visitas() {
  const [periodo,  setPeriodo]  = useState('mes')
  const [segmento, setSegmento] = useState('todos')
  const [farms,    setFarms]    = useState([])
  const [visits,   setVisits]   = useState([])
  const [visitsAnt,setVisitsAnt]= useState([])
  const [loading,  setLoading]  = useState(true)

  useEffect(()=>{ carregarBase() },[])
  useEffect(()=>{ if(farms.length) carregarVisitas() },[periodo,segmento,farms])

  async function carregarBase() {
    const {data}=await supabase.from('farms').select('*'); setFarms(data||[])
  }

  async function carregarVisitas() {
    setLoading(true)
    const [ini,fim]=periodoRange(periodo), diff=fim-ini
    const [r,rAnt]=await Promise.all([
      supabase.from('visits').select('*').gte('visit_date',toISO(ini)).lte('visit_date',toISO(fim)),
      supabase.from('visits').select('*').gte('visit_date',toISO(new Date(ini-diff))).lte('visit_date',toISO(ini)),
    ])
    let vs=r.data||[],va=rAnt.data||[]
    if(segmento!=='todos'){const ids=farms.filter(f=>f.segment===segmento).map(f=>f.id);vs=vs.filter(v=>ids.includes(v.farm_id));va=va.filter(v=>ids.includes(v.farm_id))}
    setVisits(vs);setVisitsAnt(va);setLoading(false)
  }

  const total=visits.length,totalAnt=visitsAnt.length
  const positivas=visits.filter(v=>v.outcome==='positiva').length
  const neutras=visits.filter(v=>v.outcome==='neutra').length
  const negativas=visits.filter(v=>v.outcome==='negativa').length
  const pctPos=total?((positivas/total)*100).toFixed(0):0

  const fazMap={}
  visits.forEach(v=>{
    const f=farms.find(f=>f.id===v.farm_id)
    const k=f?.name||'Desconhecida'
    if(!fazMap[k]) fazMap[k]={name:k,positiva:0,neutra:0,negativa:0}
    fazMap[k][v.outcome||'neutra']++
  })
  const porFazenda=Object.values(fazMap).sort((a,b)=>(b.positiva+b.neutra+b.negativa)-(a.positiva+a.neutra+a.negativa)).slice(0,8)

  const diasSemana=['Dom','Seg','Ter','Qua','Qui','Sex','Sáb']
  const diaMap={0:0,1:0,2:0,3:0,4:0,5:0,6:0}
  visits.forEach(v=>{ const d=new Date(v.visit_date+'T12:00:00').getDay(); diaMap[d]++ })
  const porDia=diasSemana.map((name,i)=>({name,Visitas:diaMap[i]}))

  const problemáticas=Object.values(visits.filter(v=>v.outcome==='negativa').reduce((acc,v)=>{
    const f=farms.find(f=>f.id===v.farm_id);const k=v.farm_id
    if(!acc[k]) acc[k]={name:f?.name||'—',count:0};acc[k].count++;return acc
  },{})).filter(f=>f.count>=2).sort((a,b)=>b.count-a.count)

  const tabela=visits.map(v=>({
    ...v,
    farmName:farms.find(f=>f.id===v.farm_id)?.name||'—',
    segment:farms.find(f=>f.id===v.farm_id)?.segment||'—',
  })).sort((a,b)=>b.visit_date.localeCompare(a.visit_date))

  function exportCSV(){
    const rows=[['Data','Fazenda','Segmento','Resultado','Anotações','Próxima visita'],
      ...tabela.map(v=>[v.visit_date,v.farmName,v.segment,v.outcome||'—',v.notes||'',v.next_visit_date||''])]
    const a=document.createElement('a')
    a.href='data:text/csv;charset=utf-8,\uFEFF'+encodeURIComponent(rows.map(r=>r.join(';')).join('\n'))
    a.download='visitas.csv';a.click()
  }

  return (
    <div style={{flex:1,overflow:'hidden',display:'flex',flexDirection:'column'}}>
      <Topbar title="Visitas e Produtividade" subtitle="Atividade do time em campo">
        <button className="btn btn-ghost btn-sm" onClick={exportCSV}><IconDownload size={14}/> Exportar CSV</button>
      </Topbar>
      <div className="page" style={{overflowY:'auto'}}>
        <div style={{display:'flex',gap:10,marginBottom:20,alignItems:'center'}}>
          <IconFilter size={14} color="var(--text-faint)"/>
          <select value={periodo} onChange={e=>setPeriodo(e.target.value)} style={{width:'auto',padding:'6px 10px',fontSize:12}}>
            <option value="mes">Mês atual</option><option value="trimestre">Trimestre</option><option value="semestre">Semestre</option><option value="ano">Ano</option>
          </select>
          <select value={segmento} onChange={e=>setSegmento(e.target.value)} style={{width:'auto',padding:'6px 10px',fontSize:12}}>
            <option value="todos">Todos</option><option value="leite">Leite</option><option value="corte">Corte</option><option value="suinos">Suínos</option>
          </select>
          <span style={{fontSize:12,color:'var(--text-faint)',marginLeft:'auto'}}>{total} visitas</span>
        </div>

        <div className="kpi-grid" style={{gridTemplateColumns:'repeat(5,1fr)'}}>
          {[
            {label:'Total de visitas',  value:total,                       sub:`vs ${totalAnt} período ant.`},
            {label:'Positivas',         value:`${positivas} (${pctPos}%)`, style:{color:'var(--green)'}},
            {label:'Neutras',           value:neutras,                     style:{color:'var(--text-dim)'}},
            {label:'Negativas',         value:negativas,                   style:{color:'var(--red)'}},
            {label:'Fazendas cobertas', value:new Set(visits.map(v=>v.farm_id)).size, sub:`de ${farms.length} na carteira`},
          ].map(k=>(
            <div key={k.label} className="kpi">
              <div className="label">{k.label}</div>
              <div className="value" style={{fontSize:20,...(k.style||{})}}>{k.value}</div>
              {k.sub&&<div className="sub">{k.sub}</div>}
            </div>
          ))}
        </div>

        {loading?<div className="empty">Carregando...</div>:(
          <>
            <div style={{display:'grid',gridTemplateColumns:'2fr 1fr',gap:16,marginBottom:20}}>
              <div className="card">
                <div className="section-title">Visitas por fazenda</div>
                {porFazenda.length>0?(
                  <ResponsiveContainer width="100%" height={220}>
                    <BarChart data={porFazenda} margin={{top:4,right:8,left:8,bottom:0}}>
                      <CartesianGrid strokeDasharray="3 3" stroke="var(--line)"/>
                      <XAxis dataKey="name" tick={{fontSize:10}}/><YAxis tick={{fontSize:11}}/>
                      <Tooltip/><Legend wrapperStyle={{fontSize:11}}/>
                      <Bar dataKey="positiva" name="Positiva" stackId="a" fill="var(--green)"/>
                      <Bar dataKey="neutra"   name="Neutra"   stackId="a" fill="var(--text-faint)"/>
                      <Bar dataKey="negativa" name="Negativa" stackId="a" fill="var(--red)" radius={[4,4,0,0]}/>
                    </BarChart>
                  </ResponsiveContainer>
                ):<div className="empty" style={{padding:40}}>Sem visitas no período</div>}
              </div>
              <div className="card">
                <div className="section-title">Por dia da semana</div>
                <ResponsiveContainer width="100%" height={220}>
                  <BarChart data={porDia} margin={{top:4,right:8,left:-16,bottom:0}}>
                    <CartesianGrid strokeDasharray="3 3" stroke="var(--line)"/>
                    <XAxis dataKey="name" tick={{fontSize:11}}/><YAxis tick={{fontSize:11}}/>
                    <Tooltip/><Bar dataKey="Visitas" fill="var(--orange)" radius={[4,4,0,0]}/>
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </div>

            {problemáticas.length>0&&(
              <div className="card" style={{marginBottom:20,borderColor:'rgba(224,49,49,0.3)',background:'var(--red-bg)'}}>
                <div style={{display:'flex',alignItems:'center',gap:8,marginBottom:12}}>
                  <IconAlertTriangle size={16} color="var(--red)"/>
                  <div className="section-title" style={{margin:0,color:'var(--red)'}}>Fazendas com visitas negativas recorrentes</div>
                </div>
                <div style={{display:'flex',gap:10,flexWrap:'wrap'}}>
                  {problemáticas.map(f=>(
                    <div key={f.name} style={{background:'var(--surface)',borderRadius:8,padding:'8px 12px',fontSize:12}}>
                      <div style={{fontWeight:600}}>{f.name}</div>
                      <div style={{color:'var(--red)'}}>{f.count} visitas negativas</div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            <div className="card">
              <div className="section-title">Histórico de visitas</div>
              <div className="table-wrap">
                <table>
                  <thead><tr><th>Data</th><th>Fazenda</th><th>Segmento</th><th>Resultado</th><th>Anotações</th><th>Próxima visita</th></tr></thead>
                  <tbody>
                    {tabela.length===0?(<tr><td colSpan={6} style={{textAlign:'center',color:'var(--text-faint)'}}>Nenhuma visita no período</td></tr>)
                      :tabela.map(v=>{
                        const cfg=OUTCOME_CFG[v.outcome||'neutra']
                        return(
                          <tr key={v.id}>
                            <td>{new Date(v.visit_date+'T12:00:00').toLocaleDateString('pt-BR')}</td>
                            <td style={{fontWeight:500}}>{v.farmName}</td>
                            <td><span className="pill pill-gray" style={{textTransform:'capitalize'}}>{v.segment}</span></td>
                            <td><span className="pill" style={{background:cfg.bg,color:cfg.color}}>{cfg.label}</span></td>
                            <td style={{fontSize:12,color:'var(--text-dim)',maxWidth:200,overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap'}}>{v.notes||'—'}</td>
                            <td style={{fontSize:12}}>{v.next_visit_date?new Date(v.next_visit_date+'T12:00:00').toLocaleDateString('pt-BR'):'—'}</td>
                          </tr>
                        )
                      })
                    }
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
