import { useState, useEffect } from 'react'
import { supabase } from '../lib/supabase'
import Topbar from '../components/Topbar'
import { IconAlertTriangle, IconFilter } from '@tabler/icons-react'
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Cell, LineChart, Line, Legend } from 'recharts'

function fmt(n) { return Number(n||0).toLocaleString('pt-BR',{minimumFractionDigits:2,maximumFractionDigits:2}) }
function fmtK(n) { if(n>=1000000) return `R$ ${(n/1000000).toFixed(1)}M`; if(n>=1000) return `R$ ${(n/1000).toFixed(1)}k`; return `R$ ${fmt(n)}` }

const STATUS_CFG = {
  rascunho:   { label:'Rascunho',   color:'#888' },
  enviada:    { label:'Enviada',    color:'#f08c00' },
  convertida: { label:'Convertida', color:'#2f9e44' },
  cancelada:  { label:'Cancelada',  color:'#e03131' },
}

export default function Cotacoes() {
  const [loading, setLoading] = useState(true)
  const [quotes, setQuotes] = useState([])
  const [profiles, setProfiles] = useState([])
  const [farms, setFarms] = useState([])
  const [filtroStatus, setFiltroStatus] = useState('todos')

  useEffect(() => { carregar() }, [])

  async function carregar() {
    setLoading(true)
    const [rQuotes, rProfiles, rFarms] = await Promise.all([
      supabase.from('quotes').select('*').order('created_at', {ascending: false}),
      supabase.from('profiles').select('id,name,email'),
      supabase.from('farms').select('id,name,segment,prospect'),
    ])
    setQuotes(rQuotes.data || [])
    setProfiles(rProfiles.data || [])
    setFarms(rFarms.data || [])
    setLoading(false)
  }

  if (loading) return <div style={{flex:1,display:'flex',alignItems:'center',justifyContent:'center'}}><div className="empty">Carregando...</div></div>

  const qs = quotes
  const total = qs.length
  const nRascunho   = qs.filter(q=>q.status==='rascunho').length
  const nEnviada    = qs.filter(q=>q.status==='enviada').length
  const nConvertida = qs.filter(q=>q.status==='convertida').length
  const nCancelada  = qs.filter(q=>q.status==='cancelada').length
  const valorAberto = qs.filter(q=>q.status==='rascunho'||q.status==='enviada').reduce((a,q)=>a+Number(q.total||0),0)
  const txConversao = total > 0 ? Math.round(nConvertida/total*100) : 0

  // Perda entre etapas
  const perdaRascunhoEnviada   = nRascunho+nEnviada+nConvertida+nCancelada > 0 ? Math.round((nRascunho)/(total)*100) : 0
  const perdaEnviadaConvertida = (nEnviada+nConvertida) > 0 ? Math.round((nEnviada)/(nEnviada+nConvertida)*100) : 0

  // Funil
  const funilData = [
    { name:'Criadas',    value:total,       color:'#6BA4D9' },
    { name:'Enviadas',   value:nEnviada+nConvertida, color:'#f08c00', perda: perdaRascunhoEnviada },
    { name:'Convertidas',value:nConvertida, color:'#2f9e44', perda: perdaEnviadaConvertida },
    { name:'Canceladas', value:nCancelada,  color:'#e03131' },
  ]

  // Evolução mensal
  const mesMap = {}
  qs.forEach(q => {
    const mes = q.created_at?.slice(0,7)
    if (!mes) return
    if (!mesMap[mes]) mesMap[mes] = {mes, criadas:0, convertidas:0, canceladas:0}
    mesMap[mes].criadas++
    if (q.status==='convertida') mesMap[mes].convertidas++
    if (q.status==='cancelada')  mesMap[mes].canceladas++
  })
  const evolucao = Object.entries(mesMap).sort().slice(-6).map(([mes,v]) => ({
    ...v,
    label: new Date(mes+'-01T12:00:00').toLocaleDateString('pt-BR',{month:'short',year:'2-digit'}),
    conversao: v.criadas > 0 ? Math.round(v.convertidas/v.criadas*100) : 0,
  }))

  // Por vendedor
  const vMap = {}
  qs.forEach(q => {
    const k = q.seller_id || 'sem'
    if (!vMap[k]) vMap[k] = {id:k, total:0, convertidas:0, enviadas:0, rascunho:0, valor:0}
    vMap[k].total++
    vMap[k].valor += Number(q.total||0)
    if (q.status==='convertida') vMap[k].convertidas++
    if (q.status==='enviada')    vMap[k].enviadas++
    if (q.status==='rascunho')   vMap[k].rascunho++
  })
  const porVendedor = Object.values(vMap).map(v => ({
    ...v,
    name: profiles.find(p=>p.id===v.id)?.name || profiles.find(p=>p.id===v.id)?.email || 'Desconhecido',
    tx: v.total > 0 ? Math.round(v.convertidas/v.total*100) : 0,
  })).sort((a,b)=>b.total-a.total)

  // Alertas
  const hoje = new Date().toISOString().split('T')[0]
  const d7   = new Date(Date.now()-7*86400000).toISOString().split('T')[0]
  const expiradas   = qs.filter(q=>(q.status==='rascunho'||q.status==='enviada')&&q.valid_until&&q.valid_until<hoje)
  const semRetorno  = qs.filter(q=>q.status==='enviada'&&q.created_at?.slice(0,10)<d7)

  // Lista filtrada
  const quotesFiltered = filtroStatus==='todos' ? qs : qs.filter(q=>q.status===filtroStatus)

  return (
    <div style={{flex:1,overflow:'hidden',display:'flex',flexDirection:'column'}}>
      <Topbar title="Análise de Cotações" subtitle="Funil comercial e evolução"/>
      <div className="page" style={{overflowY:'auto'}}>

        {/* KPIs */}
        <div className="kpi-grid" style={{gridTemplateColumns:'repeat(4,1fr)',marginBottom:20}}>
          {[
            {label:'Total de cotações', value:total,              sub:`${nRascunho} rascunhos`},
            {label:'Valor em aberto',   value:fmtK(valorAberto),  sub:'pipeline atual'},
            {label:'Convertidas',       value:nConvertida,         sub:`de ${total} criadas`},
            {label:'Taxa de conversão', value:txConversao+'%',     sub:'sobre total criado'},
          ].map(k=>(
            <div key={k.label} className="kpi">
              <div className="label">{k.label}</div>
              <div className="value">{k.value}</div>
              <div className="sub">{k.sub}</div>
            </div>
          ))}
        </div>

        {/* Alertas */}
        {(expiradas.length>0||semRetorno.length>0) && (
          <div style={{marginBottom:20,display:'flex',flexDirection:'column',gap:8}}>
            {expiradas.length>0 && (
              <div style={{background:'var(--red-bg)',border:'1px solid var(--red)',borderRadius:8,padding:'10px 14px',display:'flex',gap:10,alignItems:'center'}}>
                <IconAlertTriangle size={16} color="var(--red)"/>
                <span style={{fontSize:13,color:'var(--red)'}}>
                  <strong>{expiradas.length}</strong> cotação{expiradas.length>1?'ões':''} expirada{expiradas.length>1?'s':''} ainda em aberto
                </span>
              </div>
            )}
            {semRetorno.length>0 && (
              <div style={{background:'var(--amber-bg)',border:'1px solid var(--amber)',borderRadius:8,padding:'10px 14px',display:'flex',gap:10,alignItems:'center'}}>
                <IconAlertTriangle size={16} color="var(--amber)"/>
                <span style={{fontSize:13,color:'var(--amber)'}}>
                  <strong>{semRetorno.length}</strong> cotação{semRetorno.length>1?'ões':''} enviada{semRetorno.length>1?'s':''} há mais de 7 dias sem retorno
                </span>
              </div>
            )}
          </div>
        )}

        <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:16,marginBottom:20}}>
          {/* Funil */}
          <div className="card">
            <div className="section-title">Funil de Conversão</div>
            <div style={{marginBottom:12}}>
              {funilData.map((f,i) => (
                <div key={f.name} style={{marginBottom:10}}>
                  <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',marginBottom:4}}>
                    <span style={{fontSize:12,fontWeight:500}}>{f.name}</span>
                    <span style={{fontSize:13,fontWeight:700,color:f.color}}>{f.value}</span>
                  </div>
                  <div style={{background:'var(--surface-2)',borderRadius:4,height:8,overflow:'hidden'}}>
                    <div style={{width:`${total>0?Math.round(f.value/total*100):0}%`,height:'100%',background:f.color,borderRadius:4,transition:'width .3s'}}/>
                  </div>
                  {f.perda !== undefined && f.value > 0 && (
                    <div style={{fontSize:10,color:'var(--text-faint)',marginTop:2}}>
                      {total>0?Math.round(f.value/total*100):0}% do total
                      {f.perda > 0 && <span style={{color:'var(--red)',marginLeft:6}}>· {f.perda}% ainda não avançou</span>}
                    </div>
                  )}
                  {!f.perda && f.value > 0 && (
                    <div style={{fontSize:10,color:'var(--text-faint)',marginTop:2}}>
                      {total>0?Math.round(f.value/total*100):0}% do total
                    </div>
                  )}
                </div>
              ))}
            </div>
          </div>

          {/* Por vendedor */}
          <div className="card">
            <div className="section-title">Por Vendedor</div>
            <div className="table-wrap">
              <table>
                <thead>
                  <tr>
                    <th>Vendedor</th>
                    <th style={{textAlign:'center'}}>Total</th>
                    <th style={{textAlign:'center'}}>Conv.</th>
                    <th style={{textAlign:'center'}}>Taxa</th>
                    <th style={{textAlign:'right'}}>Valor</th>
                  </tr>
                </thead>
                <tbody>
                  {porVendedor.length===0
                    ? <tr><td colSpan={5} style={{textAlign:'center',color:'var(--text-faint)'}}>Sem dados</td></tr>
                    : porVendedor.map((v,i)=>(
                      <tr key={v.id}>
                        <td style={{fontWeight:500}}>{v.name}</td>
                        <td style={{textAlign:'center'}}>{v.total}</td>
                        <td style={{textAlign:'center',color:'var(--green)',fontWeight:600}}>{v.convertidas}</td>
                        <td style={{textAlign:'center'}}>
                          <span style={{color: v.tx>=50?'var(--green)':v.tx>=25?'var(--amber)':'var(--red)',fontWeight:600}}>
                            {v.tx}%
                          </span>
                        </td>
                        <td style={{textAlign:'right',color:'var(--orange)',fontWeight:600}}>{fmtK(v.valor)}</td>
                      </tr>
                    ))
                  }
                </tbody>
              </table>
            </div>
          </div>
        </div>

        {/* Gráficos de evolução mensal */}
        <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:16,marginBottom:20}}>
          <div className="card">
            <div className="section-title">Cotações geradas por mês</div>
            {evolucao.length>0 ? (
              <ResponsiveContainer width="100%" height={180}>
                <BarChart data={evolucao} margin={{top:4,right:8,left:-16,bottom:0}}>
                  <CartesianGrid strokeDasharray="3 3" stroke="var(--line)"/>
                  <XAxis dataKey="label" tick={{fontSize:11}}/>
                  <YAxis tick={{fontSize:11}}/>
                  <Tooltip/>
                  <Bar dataKey="criadas" name="Criadas" fill="#6BA4D9" radius={[4,4,0,0]}/>
                  <Bar dataKey="convertidas" name="Convertidas" fill="#2f9e44" radius={[4,4,0,0]}/>
                  <Bar dataKey="canceladas" name="Canceladas" fill="#e03131" radius={[4,4,0,0]}/>
                </BarChart>
              </ResponsiveContainer>
            ) : <div className="empty" style={{padding:40}}>Sem dados</div>}
          </div>

          <div className="card">
            <div className="section-title">Taxa de conversão por mês (%)</div>
            {evolucao.length>0 ? (
              <ResponsiveContainer width="100%" height={180}>
                <LineChart data={evolucao} margin={{top:4,right:8,left:-16,bottom:0}}>
                  <CartesianGrid strokeDasharray="3 3" stroke="var(--line)"/>
                  <XAxis dataKey="label" tick={{fontSize:11}}/>
                  <YAxis tick={{fontSize:11}} domain={[0,100]} tickFormatter={v=>v+'%'}/>
                  <Tooltip formatter={v=>[v+'%','Conversão']}/>
                  <Line type="monotone" dataKey="conversao" name="Conversão" stroke="var(--orange)" strokeWidth={2} dot={{r:4}}/>
                </LineChart>
              </ResponsiveContainer>
            ) : <div className="empty" style={{padding:40}}>Sem dados</div>}
          </div>
        </div>

        {/* Lista */}
        <div className="card">
          <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',marginBottom:14}}>
            <div className="section-title" style={{margin:0}}>Todas as Cotações</div>
            <div style={{display:'flex',gap:8,alignItems:'center'}}>
              <IconFilter size={13} color="var(--text-faint)"/>
              <select value={filtroStatus} onChange={e=>setFiltroStatus(e.target.value)} style={{fontSize:12,padding:'4px 8px',width:'auto'}}>
                <option value="todos">Todos</option>
                {Object.entries(STATUS_CFG).map(([k,v])=><option key={k} value={k}>{v.label}</option>)}
              </select>
            </div>
          </div>
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Cliente</th>
                  <th>Vendedor</th>
                  <th>Criada em</th>
                  <th>Status</th>
                  <th>Validade</th>
                  <th style={{textAlign:'right'}}>Valor</th>
                </tr>
              </thead>
              <tbody>
                {quotesFiltered.length===0
                  ? <tr><td colSpan={6} style={{textAlign:'center',color:'var(--text-faint)'}}>Nenhuma cotação</td></tr>
                  : quotesFiltered.map(q=>{
                    const farm    = farms.find(f=>f.id===q.farm_id)
                    const profile = profiles.find(p=>p.id===q.seller_id)
                    const cfg     = STATUS_CFG[q.status]||STATUS_CFG.rascunho
                    const expirou = q.valid_until&&q.valid_until<hoje
                    return (
                      <tr key={q.id}>
                        <td style={{fontWeight:500}}>
                          {farm?.name||'—'}
                          {farm?.prospect&&<span style={{fontSize:10,color:'var(--amber)',marginLeft:6}}>prospecto</span>}
                        </td>
                        <td style={{fontSize:12,color:'var(--text-dim)'}}>{profile?.name||profile?.email||'—'}</td>
                        <td style={{fontSize:12,color:'var(--text-faint)'}}>
                          {q.created_at ? new Date(q.created_at).toLocaleDateString('pt-BR',{day:'2-digit',month:'short'}) : '—'}
                        </td>
                        <td>
                          <span style={{background:cfg.color+'22',color:cfg.color,borderRadius:20,padding:'2px 10px',fontSize:11,fontWeight:600}}>
                            {cfg.label}
                          </span>
                        </td>
                        <td style={{fontSize:12,color:expirou?'var(--red)':'var(--text-faint)'}}>
                          {q.valid_until?new Date(q.valid_until+'T12:00:00').toLocaleDateString('pt-BR'):'—'}
                          {expirou&&' ⚠️'}
                        </td>
                        <td style={{textAlign:'right',fontWeight:600,color:'var(--orange)'}}>{fmtK(q.total)}</td>
                      </tr>
                    )
                  })
                }
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </div>
  )
}
