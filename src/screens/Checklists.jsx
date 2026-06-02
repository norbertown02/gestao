import { useState, useEffect } from 'react'
import { supabase } from '../lib/supabase'
import Topbar from '../components/Topbar'
import { IconFilter, IconDownload, IconChevronDown, IconChevronUp } from '@tabler/icons-react'
import { RadarChart, Radar, PolarGrid, PolarAngleAxis, ResponsiveContainer, BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, LineChart, Line, Legend } from 'recharts'

function periodoRange(p) {
  const hoje=new Date(),ano=hoje.getFullYear(),mes=hoje.getMonth()
  if(p==='mes') return [new Date(ano,mes,1),hoje]
  if(p==='trimestre') return [new Date(ano,mes-2,1),hoje]
  if(p==='semestre') return [new Date(ano,mes-5,1),hoje]
  return [new Date(ano,0,1),hoje]
}
function toISO(d) { return d.toISOString().split('T')[0] }
function scoreCor(n) { if(n>=75) return 'var(--green)'; if(n>=50) return 'var(--amber)'; return 'var(--red)' }
function scoreBg(n)  { if(n>=75) return 'var(--green-bg)'; if(n>=50) return 'var(--amber-bg)'; return 'var(--red-bg)' }
function scoreLabel(n){ if(n>=75) return 'Excelente'; if(n>=50) return 'Bom'; if(n>=25) return 'Atenção'; return 'Crítico' }

export default function Checklists() {
  const [periodo,  setPeriodo]  = useState('ano')
  const [segmento, setSegmento] = useState('todos')
  const [farms,    setFarms]    = useState([])
  const [checks,   setChecks]   = useState([])
  const [loading,  setLoading]  = useState(true)
  const [detalheId,setDetalheId]= useState(null)

  useEffect(()=>{ carregarBase() },[])
  useEffect(()=>{ if(farms.length) carregarChecks() },[periodo,segmento,farms])

  async function carregarBase() {
    const {data}=await supabase.from('farms').select('*'); setFarms(data||[])
  }

  async function carregarChecks() {
    setLoading(true)
    const [ini,fim]=periodoRange(periodo)
    let q=supabase.from('checklists').select('*').gte('applied_at',toISO(ini)).lte('applied_at',toISO(fim)).order('applied_at',{ascending:false})
    const {data}=await q
    let cs=data||[]
    if(segmento!=='todos') cs=cs.filter(c=>{ const f=farms.find(f=>f.id===c.farm_id); return f?.segment===segmento })
    setChecks(cs); setLoading(false)
  }

  const total=checks.length
  const scoreMedia=total?Math.round(checks.reduce((a,c)=>a+Number(c.overall_score||0),0)/total):0

  // Distribuição por faixa
  const faixas=[
    {label:'Crítico (0-25)',  min:0,  max:25, color:'var(--red)'},
    {label:'Atenção (26-50)', min:26, max:50, color:'var(--amber)'},
    {label:'Bom (51-75)',     min:51, max:75, color:'var(--blue)'},
    {label:'Excelente (76+)', min:76, max:100,color:'var(--green)'},
  ].map(f=>({...f,count:checks.filter(c=>c.overall_score>=f.min&&c.overall_score<=f.max).length}))

  // Score médio por segmento
  const segScores={}
  checks.forEach(c=>{
    const f=farms.find(f=>f.id===c.farm_id)
    const seg=f?.segment||'outros'
    if(!segScores[seg]) segScores[seg]={seg,scores:[]}
    segScores[seg].scores.push(Number(c.overall_score||0))
  })
  const porSegmento=Object.values(segScores).map(s=>({
    name:s.seg.charAt(0).toUpperCase()+s.seg.slice(1),
    Score:Math.round(s.scores.reduce((a,b)=>a+b,0)/s.scores.length)
  }))

  // Score médio por etapa (radar) — agrega todos os stage_scores
  const etapaMap={}
  checks.forEach(c=>{
    if(c.stage_scores) Object.entries(c.stage_scores).forEach(([k,v])=>{
      if(!etapaMap[k]) etapaMap[k]=[]
      etapaMap[k].push(Number(v))
    })
  })
  const radarData=Object.entries(etapaMap).map(([k,arr])=>({
    etapa:k.charAt(0).toUpperCase()+k.slice(1),
    Score:Math.round(arr.reduce((a,b)=>a+b,0)/arr.length)
  }))

  // Evolução mensal
  const evolMap={}
  checks.forEach(c=>{
    const mes=c.applied_at?.slice(0,7)
    if(!evolMap[mes]) evolMap[mes]=[]
    evolMap[mes].push(Number(c.overall_score||0))
  })
  const evolucao=Object.entries(evolMap).sort().map(([mes,arr])=>({
    mes,Score:Math.round(arr.reduce((a,b)=>a+b,0)/arr.length)
  }))

  // Cobertura
  const farmsComCheck=new Set(checks.map(c=>c.farm_id)).size
  const cobertura=farms.length?Math.round((farmsComCheck/farms.length)*100):0

  // Score alto sem venda recente — oportunidade
  const tabela=checks.map(c=>({
    ...c,
    farmName:farms.find(f=>f.id===c.farm_id)?.name||'—',
    segment:farms.find(f=>f.id===c.farm_id)?.segment||'—',
  }))

  function exportCSV(){
    const rows=[['Data','Fazenda','Segmento','Score Geral',...(radarData.map(r=>r.etapa))],
      ...tabela.map(c=>[c.applied_at,c.farmName,c.segment,c.overall_score,...radarData.map(r=>c.stage_scores?.[r.etapa.toLowerCase()]||'')])]
    const a=document.createElement('a')
    a.href='data:text/csv;charset=utf-8,\uFEFF'+encodeURIComponent(rows.map(r=>r.join(';')).join('\n'))
    a.download='checklists.csv';a.click()
  }

  return (
    <div style={{flex:1,overflow:'hidden',display:'flex',flexDirection:'column'}}>
      <Topbar title="Checklists e Análise Técnica" subtitle="Diagnóstico técnico da carteira">
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
          <span style={{fontSize:12,color:'var(--text-faint)',marginLeft:'auto'}}>{total} checklists</span>
        </div>

        <div className="kpi-grid" style={{gridTemplateColumns:'repeat(5,1fr)'}}>
          {[
            {label:'Score médio geral',   value:scoreMedia,   style:{color:scoreCor(scoreMedia)}, sub:scoreLabel(scoreMedia)},
            {label:'Checklists aplicados',value:total,         sub:'no período'},
            {label:'Fazendas cobertas',   value:`${farmsComCheck} (${cobertura}%)`, sub:'da carteira'},
            {label:'Excelentes (76+)',     value:faixas[3].count, style:{color:'var(--green)'}},
            {label:'Críticas (0-25)',      value:faixas[0].count, style:{color:'var(--red)'}},
          ].map(k=>(
            <div key={k.label} className="kpi">
              <div className="label">{k.label}</div>
              <div className="value" style={{fontSize:20,...(k.style||{})}}>{k.value}</div>
              <div className="sub">{k.sub}</div>
            </div>
          ))}
        </div>

        {loading?<div className="empty">Carregando...</div>:(
          <>
            <div style={{display:'grid',gridTemplateColumns:'1fr 1fr 1fr',gap:16,marginBottom:20}}>
              {/* Distribuição por faixa */}
              <div className="card">
                <div className="section-title">Distribuição por faixa</div>
                {faixas.map(f=>(
                  <div key={f.label} style={{marginBottom:10}}>
                    <div style={{display:'flex',justifyContent:'space-between',marginBottom:4,fontSize:12}}>
                      <span>{f.label}</span>
                      <span style={{fontWeight:600,color:f.color}}>{f.count} fazendas</span>
                    </div>
                    <div style={{background:'var(--surface-2)',borderRadius:4,height:6,overflow:'hidden'}}>
                      <div style={{width:`${total?((f.count/total)*100):0}%`,height:'100%',background:f.color,borderRadius:4}}/>
                    </div>
                  </div>
                ))}
              </div>

              {/* Score por segmento */}
              <div className="card">
                <div className="section-title">Score médio por segmento</div>
                {porSegmento.length>0?(
                  <ResponsiveContainer width="100%" height={160}>
                    <BarChart data={porSegmento} margin={{top:4,right:8,left:-16,bottom:0}}>
                      <CartesianGrid strokeDasharray="3 3" stroke="var(--line)"/>
                      <XAxis dataKey="name" tick={{fontSize:11}}/><YAxis domain={[0,100]} tick={{fontSize:11}}/>
                      <Tooltip/>
                      <Bar dataKey="Score" fill="var(--orange)" radius={[4,4,0,0]}/>
                    </BarChart>
                  </ResponsiveContainer>
                ):<div className="empty" style={{padding:30}}>Sem dados</div>}
              </div>

              {/* Radar por etapa */}
              <div className="card">
                <div className="section-title">Score médio por etapa</div>
                {radarData.length>0?(
                  <ResponsiveContainer width="100%" height={180}>
                    <RadarChart data={radarData}>
                      <PolarGrid stroke="var(--line)"/>
                      <PolarAngleAxis dataKey="etapa" tick={{fontSize:10}}/>
                      <Radar name="Score" dataKey="Score" stroke="var(--orange)" fill="var(--orange)" fillOpacity={0.2}/>
                      <Tooltip/>
                    </RadarChart>
                  </ResponsiveContainer>
                ):<div className="empty" style={{padding:30}}>Sem dados</div>}
              </div>
            </div>

            {/* Evolução mensal */}
            {evolucao.length>1&&(
              <div className="card" style={{marginBottom:20}}>
                <div className="section-title">Evolução do score médio</div>
                <ResponsiveContainer width="100%" height={180}>
                  <LineChart data={evolucao} margin={{top:4,right:8,left:-16,bottom:0}}>
                    <CartesianGrid strokeDasharray="3 3" stroke="var(--line)"/>
                    <XAxis dataKey="mes" tick={{fontSize:11}}/><YAxis domain={[0,100]} tick={{fontSize:11}}/>
                    <Tooltip/><Line type="monotone" dataKey="Score" stroke="var(--orange)" strokeWidth={2} dot={{r:4}}/>
                  </LineChart>
                </ResponsiveContainer>
              </div>
            )}

            {/* Tabela */}
            <div className="card">
              <div className="section-title">Checklists detalhados</div>
              <div className="table-wrap">
                <table>
                  <thead><tr><th>Data</th><th>Fazenda</th><th>Segmento</th><th style={{textAlign:'center'}}>Score</th><th>Etapas</th><th></th></tr></thead>
                  <tbody>
                    {tabela.length===0?(<tr><td colSpan={6} style={{textAlign:'center',color:'var(--text-faint)'}}>Nenhum checklist no período</td></tr>)
                      :tabela.map(c=>(
                        <>
                          <tr key={c.id} style={{cursor:'pointer'}} onClick={()=>setDetalheId(detalheId===c.id?null:c.id)}>
                            <td>{new Date(c.applied_at+'T12:00:00').toLocaleDateString('pt-BR')}</td>
                            <td style={{fontWeight:500}}>{c.farmName}</td>
                            <td><span className="pill pill-gray" style={{textTransform:'capitalize'}}>{c.segment}</span></td>
                            <td style={{textAlign:'center'}}>
                              <span className="pill" style={{background:scoreBg(c.overall_score),color:scoreCor(c.overall_score),fontSize:13,fontWeight:700}}>
                                {c.overall_score}
                              </span>
                            </td>
                            <td>
                              <div style={{display:'flex',gap:4,flexWrap:'wrap'}}>
                                {c.stage_scores&&Object.entries(c.stage_scores).map(([k,v])=>(
                                  <span key={k} style={{fontSize:10,padding:'2px 6px',borderRadius:10,background:scoreBg(v),color:scoreCor(v),fontWeight:600}}>
                                    {k}: {v}
                                  </span>
                                ))}
                              </div>
                            </td>
                            <td>{detalheId===c.id?<IconChevronUp size={14}/>:<IconChevronDown size={14}/>}</td>
                          </tr>
                          {detalheId===c.id&&(
                            <tr key={c.id+'_d'}>
                              <td colSpan={6} style={{background:'var(--surface-2)',padding:'12px 16px'}}>
                                <div style={{display:'grid',gridTemplateColumns:'repeat(auto-fit,minmax(200px,1fr))',gap:12}}>
                                  {c.stage_scores&&Object.entries(c.stage_scores).map(([k,v])=>(
                                    <div key={k} style={{background:'var(--surface)',borderRadius:8,padding:12}}>
                                      <div style={{fontSize:11,color:'var(--text-dim)',marginBottom:4,textTransform:'capitalize'}}>{k}</div>
                                      <div style={{fontSize:22,fontWeight:700,color:scoreCor(v)}}>{v}</div>
                                      <div style={{background:'var(--surface-2)',borderRadius:4,height:4,overflow:'hidden',marginTop:6}}>
                                        <div style={{width:`${v}%`,height:'100%',background:scoreCor(v),borderRadius:4}}/>
                                      </div>
                                    </div>
                                  ))}
                                </div>
                              </td>
                            </tr>
                          )}
                        </>
                      ))
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
