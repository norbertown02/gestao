import { useState, useEffect } from 'react'
import { supabase, supabaseAdmin } from '../lib/supabase'
import Topbar from '../components/Topbar'
import { IconFilter, IconDownload, IconChevronDown, IconChevronUp, IconUser } from '@tabler/icons-react'
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, BarChart, Bar, Legend } from 'recharts'

function toISO(d) { return d.toISOString().split('T')[0] }
function fmt(n) { return Number(n||0).toLocaleString('pt-BR',{minimumFractionDigits:2,maximumFractionDigits:2}) }
function fmtK(n) { if(n>=1000000) return `R$ ${(n/1000000).toFixed(1)}M`; if(n>=1000) return `R$ ${(n/1000).toFixed(1)}k`; return `R$ ${fmt(n)}` }
function pct(a,b) { if(!b) return '0.0'; return ((a-b)/b*100).toFixed(1) }

function periodoRange(p) {
  const hoje=new Date(),ano=hoje.getFullYear(),mes=hoje.getMonth()
  if(p==='mes') return [new Date(ano,mes,1),hoje]
  if(p==='trimestre') return [new Date(ano,mes-2,1),hoje]
  if(p==='semestre') return [new Date(ano,mes-5,1),hoje]
  return [new Date(ano,0,1),hoje]
}

export default function Vendedores() {
  const [periodo,    setPeriodo]    = useState('mes')
  const [sellers,    setSellers]    = useState([])
  const [farms,      setFarms]      = useState([])
  const [sales,      setSales]      = useState([])
  const [visits,     setVisits]     = useState([])
  const [checklists, setChecklists] = useState([])
  const [loading,    setLoading]    = useState(true)
  const [detalheId,  setDetalheId]  = useState(null)

  useEffect(()=>{ carregar() },[])
  useEffect(()=>{ if(farms.length) carregarPeriodo() },[periodo,farms])

  async function carregar() {
    const [sl,fs]=await Promise.all([
      supabaseAdmin.from('profiles').select('*').eq('active',true).order('name'),
      supabaseAdmin.from('farms').select('*'),
    ])
    setSellers(sl.data||[])
    setFarms(fs.data||[])
  }

  async function carregarPeriodo() {
    setLoading(true)
    const [ini,fim]=periodoRange(periodo)
    const [sl,vs,ck]=await Promise.all([
      supabaseAdmin.from('sales').select('*').gte('sale_date',toISO(ini)).lte('sale_date',toISO(fim)),
      supabaseAdmin.from('visits').select('*').gte('visit_date',toISO(ini)).lte('visit_date',toISO(fim)),
      supabaseAdmin.from('checklists').select('*').gte('applied_at',toISO(ini)).lte('applied_at',toISO(fim)),
    ])
    setSales(sl.data||[])
    setVisits(vs.data||[])
    setChecklists(ck.data||[])
    setLoading(false)
  }

  // Monta dados por vendedor
  // Como as vendas ainda não têm seller_id, agrupamos por farm como proxy
  // Quando seller_id for adicionado às vendas, basta trocar a chave
  const mediaTime = sales.length ? sales.reduce((a,s)=>a+Number(s.total||0),0)/sales.length : 0

  const dadosSellers = sellers.map(seller=>{
    // Fazendas do vendedor — por ora todas são de todos
    const farmsVendedor = farms.filter(f=>f.seller_id===seller.id)
    const salesVendedor = sales.filter(s=>s.seller_id===seller.id)
    const visitsVendedor = visits.filter(v=>v.seller_id===seller.id)
    const checksVendedor = checklists

    const fat      = salesVendedor.reduce((a,s)=>a+Number(s.total||0),0)
    const pedidos  = salesVendedor.length
    const ticket   = pedidos?fat/pedidos:0
    const visitas  = visitsVendedor.length
    const cobertura= farmsVendedor.length?Math.round((new Set(visitsVendedor.map(v=>v.farm_id)).size/farmsVendedor.length)*100):0
    const scoreMedia=checksVendedor.length?Math.round(checksVendedor.reduce((a,c)=>a+Number(c.overall_score||0),0)/checksVendedor.length):0
    const fazVisitadas=new Set(visitsVendedor.map(v=>v.farm_id)).size; const fazComVenda=new Set(salesVendedor.map(s=>s.farm_id)).size; const conversao=fazVisitadas?((fazComVenda/fazVisitadas)*100).toFixed(0):0

    return { ...seller, fat, pedidos, ticket, visitas, cobertura, scoreMedia, conversao, farmsCount:farmsVendedor.length }
  })

  const mediaFat = dadosSellers.length ? dadosSellers.reduce((a,s)=>a+s.fat,0)/dadosSellers.length : 0

  // Vendedor selecionado para detalhe
  const sellerDetalhe = detalheId ? dadosSellers.find(s=>s.id===detalheId) : null

  // Evolução mensal do vendedor selecionado (últimos 6 meses)
  const evolucaoDetalhe = (() => {
    if(!sellerDetalhe) return []
    const meses=[]
    for(let i=5;i>=0;i--){
      const d=new Date(); d.setMonth(d.getMonth()-i)
      const mes=`${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}`
      const fat=sales.filter(s=>s.sale_date?.startsWith(mes)).reduce((a,s)=>a+Number(s.total||0),0)
      meses.push({mes,Faturamento:fat})
    }
    return meses
  })()

  function exportCSV(){
    const rows=[['Nome','Email','Fazendas','Faturamento','Pedidos','Ticket Médio','Visitas','Cobertura%','Score Médio','Conversão%'],
      ...dadosSellers.map(s=>[s.name,s.email,s.farmsCount,s.fat,s.pedidos,s.ticket,s.visitas,s.cobertura,s.scoreMedia,s.conversao])]
    const a=document.createElement('a')
    a.href='data:text/csv;charset=utf-8,\uFEFF'+encodeURIComponent(rows.map(r=>r.join(';')).join('\n'))
    a.download='vendedores.csv';a.click()
  }

  return (
    <div style={{flex:1,overflow:'hidden',display:'flex',flexDirection:'column'}}>
      <Topbar title="Performance por Vendedor" subtitle="Análise individual e comparativa do time">
        <button className="btn btn-ghost btn-sm" onClick={exportCSV}><IconDownload size={14}/> Exportar CSV</button>
      </Topbar>
      <div className="page" style={{overflowY:'auto'}}>

        <div style={{display:'flex',gap:10,marginBottom:20,alignItems:'center'}}>
          <IconFilter size={14} color="var(--text-faint)"/>
          <select value={periodo} onChange={e=>setPeriodo(e.target.value)} style={{width:'auto',padding:'6px 10px',fontSize:12}}>
            <option value="mes">Mês atual</option>
            <option value="trimestre">Trimestre</option>
            <option value="semestre">Semestre</option>
            <option value="ano">Ano</option>
          </select>
          <span style={{fontSize:12,color:'var(--text-faint)',marginLeft:'auto'}}>{sellers.length} vendedores ativos</span>
        </div>

        {loading?<div className="empty">Carregando...</div>:(
          <>
            {/* Tabela geral */}
            <div className="card" style={{marginBottom:20}}>
              <div className="section-title">Visão geral do time</div>
              <div className="table-wrap">
                <table>
                  <thead>
                    <tr>
                      <th>#</th><th>Vendedor</th><th>Fazendas</th>
                      <th style={{textAlign:'right'}}>Faturamento</th>
                      <th style={{textAlign:'right'}}>Pedidos</th>
                      <th style={{textAlign:'right'}}>Ticket médio</th>
                      <th style={{textAlign:'center'}}>Visitas</th>
                      <th style={{textAlign:'center'}}>Cobertura</th>
                      <th style={{textAlign:'center'}}>Score médio</th>
                      <th style={{textAlign:'center'}}>Conversão</th>
                      <th></th>
                    </tr>
                  </thead>
                  <tbody>
                    {dadosSellers.sort((a,b)=>b.fat-a.fat).map((s,i)=>(
                      <>
                        <tr key={s.id}
                          style={{background:detalheId===s.id?'var(--orange-bg)':s.fat>=mediaFat?'':'',cursor:'pointer'}}
                          onClick={()=>setDetalheId(detalheId===s.id?null:s.id)}>
                          <td style={{fontWeight:700,color:'var(--text-faint)'}}>{i+1}</td>
                          <td>
                            <div style={{display:'flex',alignItems:'center',gap:8}}>
                              <div style={{width:32,height:32,borderRadius:8,background:'var(--orange-bg)',display:'flex',alignItems:'center',justifyContent:'center',flexShrink:0}}>
                                <IconUser size={16} color="var(--orange)"/>
                              </div>
                              <div>
                                <div style={{fontWeight:600,fontSize:13}}>{s.name}</div>
                                <div style={{fontSize:11,color:'var(--text-faint)'}}>{s.role}</div>
                              </div>
                            </div>
                          </td>
                          <td style={{textAlign:'center'}}>{s.farmsCount}</td>
                          <td style={{textAlign:'right',fontWeight:600,color:'var(--orange)'}}>{fmtK(s.fat)}</td>
                          <td style={{textAlign:'right'}}>{s.pedidos}</td>
                          <td style={{textAlign:'right'}}>{fmtK(s.ticket)}</td>
                          <td style={{textAlign:'center'}}>{s.visitas}</td>
                          <td style={{textAlign:'center'}}>
                            <span style={{color:s.cobertura>=70?'var(--green)':s.cobertura>=50?'var(--amber)':'var(--red)',fontWeight:600}}>
                              {s.cobertura}%
                            </span>
                          </td>
                          <td style={{textAlign:'center'}}>
                            {s.scoreMedia>0?<span className="pill" style={{background:s.scoreMedia>=75?'var(--green-bg)':s.scoreMedia>=50?'var(--amber-bg)':'var(--red-bg)',color:s.scoreMedia>=75?'var(--green)':s.scoreMedia>=50?'var(--amber)':'var(--red)'}}>{s.scoreMedia}</span>:'—'}
                          </td>
                          <td style={{textAlign:'center',color:Number(s.conversao)>=20?'var(--green)':'var(--text-dim)',fontWeight:600}}>{s.conversao}%</td>
                          <td>{detalheId===s.id?<IconChevronUp size={14}/>:<IconChevronDown size={14}/>}</td>
                        </tr>

                        {/* Detalhe expandido */}
                        {detalheId===s.id&&(
                          <tr key={s.id+'_d'}>
                            <td colSpan={11} style={{background:'var(--surface-2)',padding:'16px'}}>
                              <div style={{display:'grid',gridTemplateColumns:'2fr 1fr 1fr',gap:16}}>

                                {/* Evolução */}
                                <div>
                                  <div style={{fontWeight:600,fontSize:12,marginBottom:8}}>Evolução — últimos 6 meses</div>
                                  <ResponsiveContainer width="100%" height={160}>
                                    <LineChart data={evolucaoDetalhe} margin={{top:4,right:8,left:-16,bottom:0}}>
                                      <CartesianGrid strokeDasharray="3 3" stroke="var(--line)"/>
                                      <XAxis dataKey="mes" tick={{fontSize:10}}/><YAxis tick={{fontSize:10}} tickFormatter={v=>`R$${(v/1000).toFixed(0)}k`}/>
                                      <Tooltip formatter={v=>[`R$ ${fmt(v)}`,'Faturamento']}/>
                                      <Line type="monotone" dataKey="Faturamento" stroke="var(--orange)" strokeWidth={2} dot={{r:3}}/>
                                    </LineChart>
                                  </ResponsiveContainer>
                                </div>

                                {/* KPIs individuais */}
                                <div>
                                  <div style={{fontWeight:600,fontSize:12,marginBottom:8}}>Destaques</div>
                                  {[
                                    {label:'Faturamento',   value:fmtK(s.fat)},
                                    {label:'Pedidos',       value:s.pedidos},
                                    {label:'Ticket médio',  value:fmtK(s.ticket)},
                                    {label:'Visitas',       value:s.visitas},
                                    {label:'Cobertura',     value:`${s.cobertura}%`},
                                    {label:'Conversão',     value:`${s.conversao}%`},
                                  ].map(k=>(
                                    <div key={k.label} style={{display:'flex',justifyContent:'space-between',padding:'5px 0',borderBottom:'1px solid var(--line)',fontSize:12}}>
                                      <span style={{color:'var(--text-dim)'}}>{k.label}</span>
                                      <span style={{fontWeight:600}}>{k.value}</span>
                                    </div>
                                  ))}
                                </div>

                                {/* Comparação com time */}
                                <div>
                                  <div style={{fontWeight:600,fontSize:12,marginBottom:8}}>vs média do time</div>
                                  {[
                                    {label:'Faturamento', val:s.fat,       media:mediaFat,      fmt:fmtK},
                                    {label:'Visitas',     val:s.visitas,   media:dadosSellers.reduce((a,x)=>a+x.visitas,0)/dadosSellers.length, fmt:v=>Math.round(v)},
                                    {label:'Cobertura',   val:s.cobertura, media:dadosSellers.reduce((a,x)=>a+x.cobertura,0)/dadosSellers.length, fmt:v=>v+'%'},
                                  ].map(k=>{
                                    const acima=k.val>=k.media
                                    return(
                                      <div key={k.label} style={{marginBottom:8}}>
                                        <div style={{display:'flex',justifyContent:'space-between',fontSize:11,marginBottom:3}}>
                                          <span>{k.label}</span>
                                          <span style={{color:acima?'var(--green)':'var(--red)',fontWeight:600}}>
                                            {acima?'▲':'▼'} {acima?'+':''}{pct(k.val,k.media)}%
                                          </span>
                                        </div>
                                        <div style={{background:'var(--surface-3)',borderRadius:4,height:4,overflow:'hidden'}}>
                                          <div style={{width:`${Math.min((k.val/Math.max(k.media*1.5,1))*100,100)}%`,height:'100%',background:acima?'var(--green)':'var(--red)',borderRadius:4}}/>
                                        </div>
                                        <div style={{fontSize:10,color:'var(--text-faint)',marginTop:2}}>Média: {k.fmt(k.media)}</div>
                                      </div>
                                    )
                                  })}
                                </div>
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

            {/* Comparativo visual */}
            <div className="card">
              <div className="section-title">Comparativo do time — faturamento</div>
              <ResponsiveContainer width="100%" height={200}>
                <BarChart data={dadosSellers.sort((a,b)=>b.fat-a.fat)} margin={{top:4,right:8,left:-16,bottom:0}}>
                  <CartesianGrid strokeDasharray="3 3" stroke="var(--line)"/>
                  <XAxis dataKey="name" tick={{fontSize:11}}/><YAxis tick={{fontSize:11}} tickFormatter={v=>`R$${(v/1000).toFixed(0)}k`}/>
                  <Tooltip formatter={v=>[`R$ ${fmt(v)}`,'Faturamento']}/>
                  <Bar dataKey="fat" name="Faturamento" fill="var(--orange)" radius={[4,4,0,0]}/>
                </BarChart>
              </ResponsiveContainer>
            </div>
          </>
        )}
      </div>
    </div>
  )
}
