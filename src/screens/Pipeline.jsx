import { useState, useEffect } from 'react'
import { supabase } from '../lib/supabase'
import Topbar from '../components/Topbar'
import { IconTarget, IconCalendar, IconTrendingUp, IconDownload } from '@tabler/icons-react'
import { FunnelChart, Funnel, LabelList, ResponsiveContainer, Tooltip } from 'recharts'

function toISO(d) { return d.toISOString().split('T')[0] }
function fmt(n) { return Number(n||0).toLocaleString('pt-BR',{minimumFractionDigits:2,maximumFractionDigits:2}) }
function fmtK(n) { if(n>=1000000) return `R$ ${(n/1000000).toFixed(1)}M`; if(n>=1000) return `R$ ${(n/1000).toFixed(1)}k`; return `R$ ${fmt(n)}` }
function diasAtras(n) { const d=new Date(); d.setDate(d.getDate()-n); return toISO(d) }
function diasFrente(n) { const d=new Date(); d.setDate(d.getDate()+n); return toISO(d) }
function hoje() { return toISO(new Date()) }

export default function Pipeline() {
  const [farms,        setFarms]        = useState([])
  const [visits,       setVisits]       = useState([])
  const [sales,        setSales]        = useState([])
  const [appointments, setAppointments] = useState([])
  const [checklists,   setChecklists]   = useState([])
  const [loading,      setLoading]      = useState(true)

  useEffect(()=>{ carregar() },[])

  async function carregar() {
    setLoading(true)
    const [fs,vs,sl,ap,ck]=await Promise.all([
      supabase.from('farms').select('*').eq('status','ativo'),
      supabase.from('visits').select('*').order('visit_date',{ascending:false}),
      supabase.from('sales').select('*').order('sale_date',{ascending:false}),
      supabase.from('appointments').select('*').gte('appointment_date',hoje()).order('appointment_date'),
      supabase.from('checklists').select('*').order('applied_at',{ascending:false}),
    ])
    setFarms(fs.data||[])
    setVisits(vs.data||[])
    setSales(sl.data||[])
    setAppointments(ap.data||[])
    setChecklists(ck.data||[])
    setLoading(false)
  }

  // ─── Funil de conversão ───────────────────────────────────────────────────
  const d30 = diasAtras(30)
  const totalFarms    = farms.length
  const visitadas30d  = new Set(visits.filter(v=>v.visit_date>=d30).map(v=>v.farm_id)).size
  const positivasFarms= new Set(visits.filter(v=>v.visit_date>=d30&&v.outcome==='positiva').map(v=>v.farm_id))
  const compraramApos = new Set(sales.filter(s=>s.sale_date>=d30&&positivasFarms.has(s.farm_id))).size

  const funil=[
    {name:'Carteira total',    value:totalFarms,    fill:'#1971c2'},
    {name:'Visitadas (30d)',   value:visitadas30d,  fill:'#F07D1A'},
    {name:'Visita positiva',   value:positivasFarms.size, fill:'#e67700'},
    {name:'Converteram',       value:compraramApos, fill:'#2f9e44'},
  ]

  // ─── Oportunidades quentes ────────────────────────────────────────────────
  // Visita positiva nos últimos 30 dias + score >=70 + sem venda nos últimos 60 dias
  const d60 = diasAtras(60)
  const ultimaVisitaFarm = {}
  visits.forEach(v=>{ if(!ultimaVisitaFarm[v.farm_id]) ultimaVisitaFarm[v.farm_id]=v })

  const ultimaVendaFarm = {}
  sales.forEach(s=>{ if(!ultimaVendaFarm[s.farm_id]) ultimaVendaFarm[s.farm_id]=s })

  const ultimoCheckFarm = {}
  checklists.forEach(c=>{ if(!ultimoCheckFarm[c.farm_id]) ultimoCheckFarm[c.farm_id]=c })

  const oportunidades = farms.filter(f=>{
    const uv = ultimaVisitaFarm[f.id]
    const us = ultimaVendaFarm[f.id]
    const ck = ultimoCheckFarm[f.id]
    const visitaPositiva30d = uv && uv.visit_date>=d30 && uv.outcome==='positiva'
    const semVenda60d = !us || us.sale_date<d60
    const scoreAlto = !ck || ck.overall_score>=70
    return visitaPositiva30d && semVenda60d && scoreAlto
  }).map(f=>({
    ...f,
    ultimaVisita: ultimaVisitaFarm[f.id],
    ultimaVenda:  ultimaVendaFarm[f.id],
    score:        ultimoCheckFarm[f.id]?.overall_score||null,
  })).sort((a,b)=>(b.score||0)-(a.score||0))

  // ─── Próximas visitas agendadas (30 dias) ─────────────────────────────────
  const d30frente = diasFrente(30)
  const proximasVisitas = appointments.filter(a=>a.appointment_date<=d30frente&&a.status==='agendado')
    .map(a=>({...a, farmName:farms.find(f=>f.id===a.farm_id)?.name||a.title||'Compromisso'}))

  // ─── Fazendas reativáveis ─────────────────────────────────────────────────
  const d90  = diasAtras(90)
  const d180 = diasAtras(180)
  const reativaveis = farms.filter(f=>{
    const us = ultimaVendaFarm[f.id]
    const uv = ultimaVisitaFarm[f.id]
    const inativa90d = us && us.sale_date<d90
    const visitaPositiva = uv && uv.outcome==='positiva'
    const compraHistorico = sales.filter(s=>s.farm_id===f.id).length>=2
    return inativa90d && visitaPositiva && compraHistorico
  }).map(f=>({
    ...f,
    ultimaVenda: ultimaVendaFarm[f.id],
    totalHistorico: sales.filter(s=>s.farm_id===f.id).reduce((a,s)=>a+Number(s.total||0),0),
  })).sort((a,b)=>b.totalHistorico-a.totalHistorico)

  function exportCSV() {
    const rows=[['Fazenda','Segmento','Última visita','Resultado','Sem venda (dias)','Score','Ação'],
      ...oportunidades.map(f=>[
        f.name, f.segment,
        f.ultimaVisita?.visit_date||'—', f.ultimaVisita?.outcome||'—',
        f.ultimaVenda?Math.round((new Date()-new Date(f.ultimaVenda.sale_date+'T12:00:00'))/86400000):'nunca',
        f.score||'—', 'Oportunidade quente'
      ])]
    const a=document.createElement('a')
    a.href='data:text/csv;charset=utf-8,\uFEFF'+encodeURIComponent(rows.map(r=>r.join(';')).join('\n'))
    a.download='pipeline.csv';a.click()
  }

  return (
    <div style={{flex:1,overflow:'hidden',display:'flex',flexDirection:'column'}}>
      <Topbar title="Pipeline Comercial" subtitle="Oportunidades e projeção de receita futura">
        <button className="btn btn-ghost btn-sm" onClick={exportCSV}><IconDownload size={14}/> Exportar CSV</button>
      </Topbar>
      <div className="page" style={{overflowY:'auto'}}>

        {loading?<div className="empty">Carregando...</div>:(
          <>
            {/* KPIs */}
            <div className="kpi-grid" style={{gridTemplateColumns:'repeat(4,1fr)',marginBottom:24}}>
              {[
                {label:'Oportunidades quentes', value:oportunidades.length,    sub:'visita positiva + score alto', style:{color:'var(--green)'}},
                {label:'Próximas visitas (30d)', value:proximasVisitas.length,  sub:'agendadas no app'},
                {label:'Reativáveis',            value:reativaveis.length,      sub:'inativas há 90+ dias', style:{color:'var(--amber)'}},
                {label:'Conversão 30d',          value:`${totalFarms?Math.round((compraramApos/totalFarms)*100):0}%`, sub:'visita → venda'},
              ].map(k=>(
                <div key={k.label} className="kpi">
                  <div className="label">{k.label}</div>
                  <div className="value" style={{fontSize:22,...(k.style||{})}}>{k.value}</div>
                  <div className="sub">{k.sub}</div>
                </div>
              ))}
            </div>

            <div style={{display:'grid',gridTemplateColumns:'1fr 2fr',gap:16,marginBottom:20}}>
              {/* Funil */}
              <div className="card">
                <div className="section-title">Funil de conversão (30 dias)</div>
                <div style={{display:'flex',flexDirection:'column',gap:8,marginTop:8}}>
                  {funil.map((f,i)=>(
                    <div key={f.name}>
                      <div style={{display:'flex',justifyContent:'space-between',fontSize:12,marginBottom:4}}>
                        <span style={{color:'var(--text-dim)'}}>{f.name}</span>
                        <span style={{fontWeight:700,color:f.fill}}>{f.value}</span>
                      </div>
                      <div style={{background:'var(--surface-2)',borderRadius:4,height:28,overflow:'hidden',position:'relative'}}>
                        <div style={{
                          width:`${funil[0].value?((f.value/funil[0].value)*100):0}%`,
                          height:'100%',background:f.fill,borderRadius:4,
                          display:'flex',alignItems:'center',justifyContent:'flex-end',paddingRight:8
                        }}>
                          {f.value>0&&<span style={{fontSize:11,color:'#fff',fontWeight:600}}>
                            {funil[0].value?((f.value/funil[0].value)*100).toFixed(0):0}%
                          </span>}
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              {/* Próximas visitas */}
              <div className="card">
                <div style={{display:'flex',alignItems:'center',gap:8,marginBottom:14}}>
                  <IconCalendar size={15} color="var(--blue)"/>
                  <div className="section-title" style={{margin:0}}>Próximas visitas agendadas (30 dias)</div>
                  <span className="pill pill-blue" style={{marginLeft:'auto'}}>{proximasVisitas.length}</span>
                </div>
                {proximasVisitas.length===0?(
                  <div className="empty" style={{padding:20}}>Nenhuma visita agendada</div>
                ):(
                  <div className="table-wrap">
                    <table>
                      <thead><tr><th>Data</th><th>Fazenda/Título</th><th>Horário</th></tr></thead>
                      <tbody>
                        {proximasVisitas.slice(0,10).map(a=>(
                          <tr key={a.id}>
                            <td style={{fontWeight:500}}>{new Date(a.appointment_date+'T12:00:00').toLocaleDateString('pt-BR',{day:'2-digit',month:'short'})}</td>
                            <td>{a.farmName}</td>
                            <td style={{color:'var(--text-dim)',fontSize:12}}>{a.appointment_time||'—'}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            </div>

            {/* Oportunidades quentes */}
            <div className="card" style={{marginBottom:20,borderColor:'rgba(47,158,68,0.3)'}}>
              <div style={{display:'flex',alignItems:'center',gap:8,marginBottom:14}}>
                <IconTarget size={15} color="var(--green)"/>
                <div className="section-title" style={{margin:0,color:'var(--green)'}}>Oportunidades quentes — priorizar agora</div>
                <span className="pill pill-green" style={{marginLeft:'auto'}}>{oportunidades.length}</span>
              </div>
              {oportunidades.length===0?(
                <div className="empty" style={{padding:20}}>Nenhuma oportunidade identificada no momento</div>
              ):(
                <div className="table-wrap">
                  <table>
                    <thead><tr><th>Fazenda</th><th>Segmento</th><th>Última visita</th><th>Sem compra há</th><th style={{textAlign:'center'}}>Score</th><th>Notas da visita</th></tr></thead>
                    <tbody>
                      {oportunidades.map(f=>(
                        <tr key={f.id}>
                          <td style={{fontWeight:600}}>{f.name}</td>
                          <td><span className="pill pill-gray" style={{textTransform:'capitalize'}}>{f.segment}</span></td>
                          <td style={{fontSize:12}}>{f.ultimaVisita?new Date(f.ultimaVisita.visit_date+'T12:00:00').toLocaleDateString('pt-BR'):'—'}</td>
                          <td style={{color:'var(--amber)',fontWeight:600}}>
                            {f.ultimaVenda?Math.round((new Date()-new Date(f.ultimaVenda.sale_date+'T12:00:00'))/86400000)+' dias':'Nunca comprou'}
                          </td>
                          <td style={{textAlign:'center'}}>
                            {f.score?<span className="pill pill-green">{f.score}</span>:'—'}
                          </td>
                          <td style={{fontSize:12,color:'var(--text-dim)',maxWidth:200,overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap'}}>
                            {f.ultimaVisita?.notes||'—'}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>

            {/* Reativáveis */}
            <div className="card">
              <div style={{display:'flex',alignItems:'center',gap:8,marginBottom:14}}>
                <IconTrendingUp size={15} color="var(--amber)"/>
                <div className="section-title" style={{margin:0,color:'var(--amber)'}}>Fazendas reativáveis</div>
                <span className="pill pill-amber" style={{marginLeft:'auto'}}>{reativaveis.length}</span>
              </div>
              {reativaveis.length===0?(
                <div className="empty" style={{padding:20}}>Nenhuma fazenda para reativar</div>
              ):(
                <div className="table-wrap">
                  <table>
                    <thead><tr><th>Fazenda</th><th>Segmento</th><th>Última compra</th><th>Inativa há</th><th style={{textAlign:'right'}}>Total histórico</th><th>Ação</th></tr></thead>
                    <tbody>
                      {reativaveis.map(f=>(
                        <tr key={f.id}>
                          <td style={{fontWeight:600}}>{f.name}</td>
                          <td><span className="pill pill-gray" style={{textTransform:'capitalize'}}>{f.segment}</span></td>
                          <td style={{fontSize:12}}>{f.ultimaVenda?new Date(f.ultimaVenda.sale_date+'T12:00:00').toLocaleDateString('pt-BR'):'—'}</td>
                          <td style={{color:'var(--red)',fontWeight:600}}>
                            {f.ultimaVenda?Math.round((new Date()-new Date(f.ultimaVenda.sale_date+'T12:00:00'))/86400000)+' dias':'—'}
                          </td>
                          <td style={{textAlign:'right',fontWeight:600}}>{fmtK(f.totalHistorico)}</td>
                          <td><span className="pill pill-amber">Campanha de retorno</span></td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          </>
        )}
      </div>
    </div>
  )
}
