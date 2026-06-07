import { useState, useEffect } from 'react'
import { supabase } from '../lib/supabase'
import Topbar from '../components/Topbar'
import { IconAlertTriangle, IconTrendingUp, IconFilter } from '@tabler/icons-react'
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Cell } from 'recharts'

function fmt(n) { return Number(n||0).toLocaleString('pt-BR',{minimumFractionDigits:2,maximumFractionDigits:2}) }
function fmtK(n) { if(n>=1000000) return `R$ ${(n/1000000).toFixed(1)}M`; if(n>=1000) return `R$ ${(n/1000).toFixed(1)}k`; return `R$ ${fmt(n)}` }

const STATUS_CFG = {
  rascunho:   { label:'Rascunho',   color:'#888' },
  enviada:    { label:'Enviada',    color:'#f08c00' },
  convertida: { label:'Convertida', color:'#2f9e44' },
  cancelada:  { label:'Cancelada',  color:'#e03131' },
}

const CORES = ['#F07D1A','#6BA4D9','#E67E47','#D9A4C1','#2f9e44']

export default function Cotacoes() {
  const [dados, setDados] = useState(null)
  const [loading, setLoading] = useState(true)
  const [filtroStatus, setFiltroStatus] = useState('todos')
  const [quotes, setQuotes] = useState([])
  const [farms, setFarms] = useState([])
  const [sellers, setSellers] = useState([])

  useEffect(() => { carregar() }, [])

  async function carregar() {
    setLoading(true)
    const hoje = new Date().toISOString().split('T')[0]
    const d7 = new Date(Date.now() - 7*86400000).toISOString().split('T')[0]

    const [rQuotes, rFarms, rSellers] = await Promise.all([
      supabase.from('quotes').select('*').order('created_at', {ascending: false}),
      supabase.from('farms').select('id,name,segment,prospect'),
      supabase.from('sellers').select('id,name').eq('active', true),
    ])

    const qs = rQuotes.data || []
    const fs = rFarms.data || []
    const sl = rSellers.data || []

    setQuotes(qs)
    setFarms(fs)
    setSellers(sl)

    // Funil
    const funil = {
      rascunho:   qs.filter(q=>q.status==='rascunho').length,
      enviada:    qs.filter(q=>q.status==='enviada').length,
      convertida: qs.filter(q=>q.status==='convertida').length,
      cancelada:  qs.filter(q=>q.status==='cancelada').length,
    }

    // Valores
    const valorAberto = qs.filter(q=>q.status==='rascunho'||q.status==='enviada').reduce((a,q)=>a+Number(q.total||0),0)
    const valorConvertido = qs.filter(q=>q.status==='convertida').reduce((a,q)=>a+Number(q.total||0),0)
    const total = qs.length
    const txConversao = (funil.enviada+funil.convertida)>0 ? Math.round(funil.convertida/(funil.enviada+funil.convertida)*100) : 0

    // Alertas
    const expiradas = qs.filter(q=>(q.status==='rascunho'||q.status==='enviada') && q.valid_until && q.valid_until < hoje)
    const semRetorno = qs.filter(q=>q.status==='enviada' && q.created_at?.slice(0,10) < d7)

    // Por vendedor
    const vMap = {}
    qs.forEach(q => {
      const k = q.seller_id || 'sem_vendedor'
      if (!vMap[k]) vMap[k] = {id:k, total:0, convertidas:0, enviadas:0, valor:0}
      vMap[k].total++
      vMap[k].valor += Number(q.total||0)
      if (q.status==='convertida') vMap[k].convertidas++
      if (q.status==='enviada') vMap[k].enviadas++
    })
    const porVendedor = Object.values(vMap).map(v => ({
      ...v,
      name: sl.find(s=>s.id===v.id)?.name || 'Sem vendedor',
      tx: (v.enviadas+v.convertidas)>0 ? Math.round(v.convertidas/(v.enviadas+v.convertidas)*100) : 0
    })).sort((a,b)=>b.valor-a.valor)

    setDados({ funil, valorAberto, valorConvertido, total, txConversao, expiradas, semRetorno, porVendedor })
    setLoading(false)
  }

  const quotesFiltered = filtroStatus === 'todos' ? quotes : quotes.filter(q=>q.status===filtroStatus)

  if (loading) return <div style={{flex:1,display:'flex',alignItems:'center',justifyContent:'center'}}><div className="empty">Carregando...</div></div>
  if (!dados) return null

  const { funil, valorAberto, valorConvertido, total, txConversao, expiradas, semRetorno, porVendedor } = dados
  const funilData = Object.entries(funil).map(([k,v])=>({name:STATUS_CFG[k].label, value:v, color:STATUS_CFG[k].color}))

  return (
    <div style={{flex:1,overflow:'hidden',display:'flex',flexDirection:'column'}}>
      <Topbar title="Análise de Cotações" subtitle="Funil comercial e performance"/>
      <div className="page" style={{overflowY:'auto'}}>

        {/* KPIs */}
        <div className="kpi-grid" style={{gridTemplateColumns:'repeat(4,1fr)',marginBottom:20}}>
          {[
            {label:'Total de cotações', value:total},
            {label:'Valor em aberto',   value:fmtK(valorAberto),    sub:'pipeline atual'},
            {label:'Valor convertido',  value:fmtK(valorConvertido),sub:'fechamentos'},
            {label:'Taxa de conversão', value:txConversao+'%',       sub:'enviadas→convertidas'},
          ].map(k=>(
            <div key={k.label} className="kpi">
              <div className="label">{k.label}</div>
              <div className="value">{k.value}</div>
              {k.sub && <div className="sub">{k.sub}</div>}
            </div>
          ))}
        </div>

        {/* Alertas */}
        {(expiradas.length > 0 || semRetorno.length > 0) && (
          <div style={{marginBottom:20,display:'flex',flexDirection:'column',gap:8}}>
            {expiradas.length > 0 && (
              <div style={{background:'var(--red-bg)',border:'1px solid var(--red)',borderRadius:8,padding:'10px 14px',display:'flex',gap:10,alignItems:'center'}}>
                <IconAlertTriangle size={16} color="var(--red)"/>
                <div style={{fontSize:13,color:'var(--red)'}}>
                  <strong>{expiradas.length}</strong> cotação{expiradas.length>1?'ões':''} expirada{expiradas.length>1?'s':''} ainda em aberto
                </div>
              </div>
            )}
            {semRetorno.length > 0 && (
              <div style={{background:'var(--amber-bg)',border:'1px solid var(--amber)',borderRadius:8,padding:'10px 14px',display:'flex',gap:10,alignItems:'center'}}>
                <IconAlertTriangle size={16} color="var(--amber)"/>
                <div style={{fontSize:13,color:'var(--amber)'}}>
                  <strong>{semRetorno.length}</strong> cotação{semRetorno.length>1?'ões':''} enviada{semRetorno.length>1?'s':''} há mais de 7 dias sem retorno
                </div>
              </div>
            )}
          </div>
        )}

        <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:16,marginBottom:20}}>
          {/* Funil */}
          <div className="card">
            <div className="section-title">Funil de Cotações</div>
            <ResponsiveContainer width="100%" height={200}>
              <BarChart data={funilData} margin={{top:4,right:8,left:-16,bottom:0}}>
                <CartesianGrid strokeDasharray="3 3" stroke="var(--line)"/>
                <XAxis dataKey="name" tick={{fontSize:11}}/>
                <YAxis tick={{fontSize:11}}/>
                <Tooltip/>
                <Bar dataKey="value" name="Cotações" radius={[4,4,0,0]}>
                  {funilData.map((e,i)=><Cell key={i} fill={e.color}/>)}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
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
                  {porVendedor.map((v,i)=>(
                    <tr key={v.id}>
                      <td style={{fontWeight:500,display:'flex',alignItems:'center',gap:6}}>
                        <span style={{width:8,height:8,borderRadius:'50%',background:CORES[i%CORES.length],display:'inline-block'}}/>
                        {v.name}
                      </td>
                      <td style={{textAlign:'center'}}>{v.total}</td>
                      <td style={{textAlign:'center',color:'var(--green)',fontWeight:600}}>{v.convertidas}</td>
                      <td style={{textAlign:'center'}}>{v.tx}%</td>
                      <td style={{textAlign:'right',color:'var(--orange)',fontWeight:600}}>{fmtK(v.valor)}</td>
                    </tr>
                  ))}
                  {porVendedor.length===0&&<tr><td colSpan={5} style={{textAlign:'center',color:'var(--text-faint)'}}>Sem dados</td></tr>}
                </tbody>
              </table>
            </div>
          </div>
        </div>

        {/* Lista de cotações */}
        <div className="card">
          <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',marginBottom:14}}>
            <div className="section-title" style={{margin:0}}>Cotações</div>
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
                  <th>Status</th>
                  <th>Validade</th>
                  <th style={{textAlign:'right'}}>Valor</th>
                </tr>
              </thead>
              <tbody>
                {quotesFiltered.length===0
                  ? <tr><td colSpan={5} style={{textAlign:'center',color:'var(--text-faint)'}}>Nenhuma cotação</td></tr>
                  : quotesFiltered.map(q=>{
                    const farm = farms.find(f=>f.id===q.farm_id)
                    const seller = sellers.find(s=>s.id===q.seller_id)
                    const cfg = STATUS_CFG[q.status]||STATUS_CFG.rascunho
                    const expirou = q.valid_until && q.valid_until < new Date().toISOString().split('T')[0]
                    return (
                      <tr key={q.id}>
                        <td style={{fontWeight:500}}>
                          {farm?.name||'—'}
                          {farm?.prospect&&<span style={{fontSize:10,color:'var(--amber)',marginLeft:6}}>prospecto</span>}
                        </td>
                        <td style={{fontSize:12,color:'var(--text-dim)'}}>{seller?.name||'—'}</td>
                        <td><span style={{background:cfg.color+'22',color:cfg.color,borderRadius:20,padding:'2px 10px',fontSize:11,fontWeight:600}}>{cfg.label}</span></td>
                        <td style={{fontSize:12,color:expirou?'var(--red)':'var(--text-faint)'}}>
                          {q.valid_until ? new Date(q.valid_until+'T12:00:00').toLocaleDateString('pt-BR') : '—'}
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
