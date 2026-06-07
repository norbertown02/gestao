import { useState, useEffect } from 'react'
import { supabase } from '../lib/supabase'
import Topbar from '../components/Topbar'
import { IconTrendingUp, IconTrendingDown, IconMinus, IconAlertTriangle, IconClock, IconStar } from '@tabler/icons-react'
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, PieChart, Pie, Cell, Legend } from 'recharts'

function fmt(n) { return Number(n||0).toLocaleString('pt-BR',{minimumFractionDigits:2,maximumFractionDigits:2}) }
function fmtK(n) {
  if (n>=1000000) return `R$ ${(n/1000000).toFixed(1)}M`
  if (n>=1000)    return `R$ ${(n/1000).toFixed(1)}k`
  return `R$ ${fmt(n)}`
}
function pct(a,b) { if(!b) return '0.0'; return ((a-b)/b*100).toFixed(1) }

function VarBadge({atual,anterior}) {
  const diff = parseFloat(pct(atual,anterior))
  const up = diff > 0, eq = diff === 0
  return (
    <span className={`sub ${up?'up':eq?'':'down'}`} style={{display:'flex',alignItems:'center',gap:3}}>
      {up?<IconTrendingUp size={12}/>:eq?<IconMinus size={12}/>:<IconTrendingDown size={12}/>}
      {up?'+':''}{diff}% vs mês ant.
    </span>
  )
}

function mesAtual()    { const d=new Date(); return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}` }
function mesAnterior() { const d=new Date(); d.setMonth(d.getMonth()-1); return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}` }

const CORES_SEG = {leite:'#6BA4D9',corte:'#E67E47',suinos:'#D9A4C1'}

export default function Dashboard() {
  const [kpis,       setKpis]       = useState({})
  const [evolucao,   setEvolucao]   = useState([])
  const [segmentos,  setSegmentos]  = useState([])
  const [pendentes,  setPendentes]  = useState([])
  const [esquecidas, setEsquecidas] = useState([])
  const [descontos,  setDescontos]  = useState([])
  const [topVend,    setTopVend]    = useState([])
  const [topFazend,  setTopFazend]  = useState([])
  const [loading,    setLoading]    = useState(true)
  const [cotacoes,   setCotacoes]   = useState({abertas:0,valorAberto:0,txConversao:0})

  useEffect(() => { carregar() }, [])

  async function carregar() {
    setLoading(true)
    const mes  = mesAtual()
    const mesA = mesAnterior()

    const [smR, saR, vmR, vaR, fsR] = await Promise.all([
      supabase.from('sales').select('*').gte('sale_date', mes+'-01'),
      supabase.from('sales').select('*').gte('sale_date', mesA+'-01').lt('sale_date', mes+'-01'),
      supabase.from('visits').select('*').gte('visit_date', mes+'-01'),
      supabase.from('visits').select('*').gte('visit_date', mesA+'-01').lt('visit_date', mes+'-01'),
      supabase.from('farms').select('*').eq('status','ativo'),
    ])

    const sm=smR.data||[], sa=saR.data||[], vm=vmR.data||[], va=vaR.data||[], fs=fsR.data||[]
    const fatMes=sm.reduce((a,s)=>a+Number(s.total||0),0)
    const fatAnt=sa.reduce((a,s)=>a+Number(s.total||0),0)
    const tickMes=sm.length?fatMes/sm.length:0
    const tickAnt=sa.length?fatAnt/sa.length:0

    const d90=new Date(); d90.setDate(d90.getDate()-90)
    const {data:allSales}=await supabase.from('sales').select('farm_id,sale_date')
    const ativas=new Set((allSales||[]).filter(s=>new Date(s.sale_date)>=d90).map(s=>s.farm_id))

    setKpis({fatMes,fatAnt,pedMes:sm.length,pedAnt:sa.length,tickMes,tickAnt,visitMes:vm.length,visitAnt:va.length,carteiraAtiva:ativas.size,carteiraTot:fs.length})

    // Cotações
    const {data:quotes} = await supabase.from('quotes').select('status,total')
    const qs = quotes||[]
    const abertas = qs.filter(q=>q.status==='rascunho'||q.status==='enviada')
    const convertidas = qs.filter(q=>q.status==='convertida').length
    const enviadas = qs.filter(q=>q.status==='enviada').length
    const valorAberto = abertas.reduce((a,q)=>a+Number(q.total||0),0)
    const txConversao = qs.length>0 ? Math.round(convertidas/qs.length*100) : 0
    setCotacoes({abertas:abertas.length, valorAberto, txConversao})


    // Evolucao 6 meses - vendas e cotacoes
    const d6m = new Date(); d6m.setMonth(d6m.getMonth()-5); d6m.setDate(1)
    const ini6m = d6m.toISOString().split('T')[0]
    const [salesEvol6, quotesEvol6] = await Promise.all([
      supabase.from('sales').select('sale_date,total').gte('sale_date',ini6m),
      supabase.from('quotes').select('created_at,total').gte('created_at',ini6m),
    ])
    const em = {}
    for(let gi=5;gi>=0;gi--){
      const gd=new Date(); gd.setMonth(gd.getMonth()-gi); gd.setDate(1)
      const gk=gd.toISOString().slice(0,7)
      em[gk]={data:gd.toLocaleDateString('pt-BR',{month:'short',year:'2-digit'}),Vendas:0,Cotacoes:0}
    }
    ;(salesEvol6.data||[]).forEach(s=>{ const k=s.sale_date&&s.sale_date.slice(0,7); if(em[k]) em[k].Vendas+=Number(s.total||0) })
    ;(quotesEvol6.data||[]).forEach(q=>{ const k=q.created_at&&q.created_at.slice(0,7); if(em[k]) em[k].Cotacoes+=Number(q.total||0) })
    setEvolucao(Object.values(em))

    // Evolucao diaria removida - usando evolucao mensal acima

    // Segmentos
    const segMap={}
    sm.forEach(s=>{ const seg=fs.find(f=>f.id===s.farm_id)?.segment||'outros'; segMap[seg]=(segMap[seg]||0)+Number(s.total||0) })
    setSegmentos(Object.entries(segMap).map(([name,value])=>({name,value})))

    // Pendentes
    setPendentes(sm.filter(s=>s.status==='pendente_envio').slice(0,5).map(s=>({...s,farmName:fs.find(f=>f.id===s.farm_id)?.name||'—'})))

    // Esquecidas >45 dias
    const {data:allVisits}=await supabase.from('visits').select('farm_id,visit_date').order('visit_date',{ascending:false})
    const ultimaVisita={}
    ;(allVisits||[]).forEach(v=>{ if(!ultimaVisita[v.farm_id]) ultimaVisita[v.farm_id]=v.visit_date })
    const hoje=new Date()
    setEsquecidas(fs.filter(f=>{
      const uv=ultimaVisita[f.id]
      return !uv || (hoje-new Date(uv+'T12:00:00'))/86400000>45
    }).slice(0,5).map(f=>({...f,dias:ultimaVisita[f.id]?Math.round((hoje-new Date(ultimaVisita[f.id]+'T12:00:00'))/86400000):999})))

    // Descontos
    setDescontos(sm.filter(s=>s.needs_approval).slice(0,5).map(s=>({...s,farmName:fs.find(f=>f.id===s.farm_id)?.name||'—'})))

    // Top vendedores
    const vMap={}
    sm.forEach(s=>{ const k=s.seller_id||'—'; if(!vMap[k]) vMap[k]={total:0,pedidos:0,id:k}; vMap[k].total+=Number(s.total||0); vMap[k].pedidos++ })
    setTopVend(Object.values(vMap).sort((a,b)=>b.total-a.total).slice(0,5).map(v=>({...v,ticket:v.total/v.pedidos})))

    // Top fazendas
    const fMap={}
    sm.forEach(s=>{ if(!fMap[s.farm_id]) fMap[s.farm_id]={total:0,pedidos:0}; fMap[s.farm_id].total+=Number(s.total||0); fMap[s.farm_id].pedidos++ })
    setTopFazend(Object.entries(fMap).sort((a,b)=>b[1].total-a[1].total).slice(0,5).map(([id,v])=>({id,...v,name:fs.find(f=>f.id===id)?.name||'—',segment:fs.find(f=>f.id===id)?.segment})))

    setLoading(false)
  }

  if (loading) return <div style={{flex:1}}><Topbar title="Dashboard" subtitle="Carregando..."/><div className="page"><div className="empty">Carregando dados...</div></div></div>

  const maxV=Math.max(...topVend.map(v=>v.total),1)
  const maxF=Math.max(...topFazend.map(f=>f.total),1)

  return (
    <div style={{flex:1,overflow:'hidden',display:'flex',flexDirection:'column'}}>
      <Topbar title="Dashboard Executivo" subtitle="Visão geral da operação — mês corrente"/>
      <div className="page" style={{overflowY:'auto'}}>

        {/* KPIs vendas */}
        <div className="kpi-grid" style={{gridTemplateColumns:'repeat(4,1fr)',marginBottom:12}}>
          {[
            {label:'Faturamento mensal', value:fmtK(kpis.fatMes),  at:kpis.fatMes,  ant:kpis.fatAnt},
            {label:'Pedidos no mês',     value:kpis.pedMes,         at:kpis.pedMes,  ant:kpis.pedAnt},
            {label:'Ticket médio',       value:fmtK(kpis.tickMes),  at:kpis.tickMes, ant:kpis.tickAnt},
            {label:'Carteira ativa',     value:kpis.carteiraAtiva,  sub:`de ${kpis.carteiraTot} fazendas`},
          ].map(k=>(
            <div key={k.label} className="kpi">
              <div className="label">{k.label}</div>
              <div className="value">{k.value}</div>
              {k.ant!==undefined ? <VarBadge atual={k.at} anterior={k.ant}/> : <div className="sub">{k.sub}</div>}
            </div>
          ))}
        </div>

        {/* KPIs cotações */}
        <div className="kpi-grid" style={{gridTemplateColumns:'repeat(3,1fr)',marginBottom:20}}>
          {[
            {label:'Cotações em aberto',  value:cotacoes.abertas,                    sub:'propostas pendentes'},
            {label:'Pipeline de vendas',  value:fmtK(cotacoes.valorAberto),          sub:'valor em aberto'},
            {label:'Taxa de conversão',   value:cotacoes.txConversao+'%',            sub:'do total criado'},
          ].map(k=>(
            <div key={k.label} className="kpi">
              <div className="label">{k.label}</div>
              <div className="value">{k.value}</div>
              <div className="sub">{k.sub}</div>
            </div>
          ))}
        </div>

        {/* Gráficos */}
        <div style={{display:'grid',gridTemplateColumns:'2fr 1fr',gap:16,marginBottom:20}}>
          <div className="card">
            <div className="section-title">Vendas vs Cotações — últimos 6 meses</div>
            {evolucao.length>0 ? (
              <ResponsiveContainer width="100%" height={200}>
                <LineChart data={evolucao} margin={{top:4,right:8,left:-16,bottom:0}}>
                  <CartesianGrid strokeDasharray="3 3" stroke="var(--line)"/>
                  <XAxis dataKey="data" tick={{fontSize:11}}/>
                  <YAxis tick={{fontSize:11}} tickFormatter={v=>`R${(v/1000).toFixed(0)}k`}/>
                  <Tooltip formatter={(v,n)=>[`R$ ${fmt(v)}`,n]}/>
                  <Legend wrapperStyle={{fontSize:11}}/>
                  <Line type="monotone" dataKey="Vendas" stroke="var(--green)" strokeWidth={2} dot={{r:3}}/>
                  <Line type="monotone" dataKey="Cotacoes" stroke="var(--orange)" strokeWidth={2} dot={{r:3}} strokeDasharray="4 2"/>
                </LineChart>
              </ResponsiveContainer>
            ) : <div className="empty" style={{padding:40}}>Sem dados</div>}
          </div>
          <div className="card">
            <div className="section-title">Por segmento</div>
            {segmentos.length>0 ? (
              <>
                <ResponsiveContainer width="100%" height={160}>
                  <PieChart>
                    <Pie data={segmentos} cx="50%" cy="50%" innerRadius={45} outerRadius={70} dataKey="value">
                      {segmentos.map((s,i)=><Cell key={i} fill={CORES_SEG[s.name]||'#aaa'}/>)}
                    </Pie>
                    <Tooltip formatter={v=>[`R$ ${fmt(v)}`]}/>
                  </PieChart>
                </ResponsiveContainer>
                {segmentos.map((s,i)=>(
                  <div key={i} style={{display:'flex',alignItems:'center',gap:8,marginBottom:4,fontSize:12}}>
                    <span style={{width:10,height:10,borderRadius:2,background:CORES_SEG[s.name]||'#aaa',display:'inline-block'}}/>
                    <span style={{flex:1,textTransform:'capitalize'}}>{s.name}</span>
                    <span style={{fontWeight:600}}>{fmtK(s.value)}</span>
                  </div>
                ))}
              </>
            ) : <div className="empty" style={{padding:40}}>Sem dados</div>}
          </div>
        </div>

        {/* Pontos de atenção */}
        <div style={{display:'grid',gridTemplateColumns:'repeat(3,1fr)',gap:16,marginBottom:20}}>
          <div className="card">
            <div style={{display:'flex',alignItems:'center',gap:6,marginBottom:12}}>
              <IconClock size={15} color="var(--amber)"/>
              <div className="section-title" style={{margin:0}}>Pendentes de envio</div>
              <span className="pill pill-amber" style={{marginLeft:'auto'}}>{pendentes.length}</span>
            </div>
            {pendentes.length===0 ? <div style={{fontSize:12,color:'var(--text-faint)'}}>Nenhum pendente ✓</div>
              : pendentes.map(p=>(
                <div key={p.id} style={{padding:'6px 0',borderBottom:'1px solid var(--line)',fontSize:12}}>
                  <div style={{fontWeight:500}}>{p.farmName}</div>
                  <div style={{color:'var(--text-dim)'}}>{new Date(p.sale_date+'T12:00:00').toLocaleDateString('pt-BR')} · R$ {fmt(p.total)}</div>
                </div>
              ))
            }
          </div>
          <div className="card">
            <div style={{display:'flex',alignItems:'center',gap:6,marginBottom:12}}>
              <IconAlertTriangle size={15} color="var(--red)"/>
              <div className="section-title" style={{margin:0}}>Fazendas esquecidas</div>
              <span className="pill pill-red" style={{marginLeft:'auto'}}>{esquecidas.length}</span>
            </div>
            {esquecidas.length===0 ? <div style={{fontSize:12,color:'var(--text-faint)'}}>Todas visitadas ✓</div>
              : esquecidas.map(f=>(
                <div key={f.id} style={{padding:'6px 0',borderBottom:'1px solid var(--line)',fontSize:12}}>
                  <div style={{fontWeight:500}}>{f.name}</div>
                  <div style={{color:'var(--red)'}}>{f.dias===999?'Nunca visitada':`${f.dias} dias sem visita`}</div>
                </div>
              ))
            }
          </div>
          <div className="card">
            <div style={{display:'flex',alignItems:'center',gap:6,marginBottom:12}}>
              <IconAlertTriangle size={15} color="var(--orange)"/>
              <div className="section-title" style={{margin:0}}>Descontos acima do limite</div>
              <span className="pill pill-orange" style={{marginLeft:'auto'}}>{descontos.length}</span>
            </div>
            {descontos.length===0 ? <div style={{fontSize:12,color:'var(--text-faint)'}}>Nenhum irregular ✓</div>
              : descontos.map(d=>(
                <div key={d.id} style={{padding:'6px 0',borderBottom:'1px solid var(--line)',fontSize:12}}>
                  <div style={{fontWeight:500}}>{d.farmName}</div>
                  <div style={{color:'var(--orange)'}}>{new Date(d.sale_date+'T12:00:00').toLocaleDateString('pt-BR')} · R$ {fmt(d.total)}</div>
                </div>
              ))
            }
          </div>
        </div>

        {/* Rankings */}
        <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:16}}>
          <div className="card">
            <div style={{display:'flex',alignItems:'center',gap:6,marginBottom:14}}>
              <IconStar size={15} color="var(--orange)"/>
              <div className="section-title" style={{margin:0}}>Top vendedores do mês</div>
            </div>
            {topVend.length===0 ? <div className="empty" style={{padding:20}}>Sem dados</div>
              : topVend.map((v,i)=>(
                <div key={v.id} style={{marginBottom:12}}>
                  <div style={{display:'flex',justifyContent:'space-between',marginBottom:4,fontSize:13}}>
                    <span style={{fontWeight:500}}>#{i+1} {v.id.slice(0,8)}</span>
                    <span style={{fontWeight:600,color:'var(--orange)'}}>{fmtK(v.total)}</span>
                  </div>
                  <div style={{background:'var(--surface-2)',borderRadius:4,height:6,overflow:'hidden'}}>
                    <div style={{width:`${(v.total/maxV)*100}%`,height:'100%',background:'var(--orange)',borderRadius:4}}/>
                  </div>
                  <div style={{fontSize:11,color:'var(--text-dim)',marginTop:2}}>{v.pedidos} pedidos · ticket {fmtK(v.ticket)}</div>
                </div>
              ))
            }
          </div>
          <div className="card">
            <div style={{display:'flex',alignItems:'center',gap:6,marginBottom:14}}>
              <IconStar size={15} color="var(--blue)"/>
              <div className="section-title" style={{margin:0}}>Top fazendas do mês</div>
            </div>
            {topFazend.length===0 ? <div className="empty" style={{padding:20}}>Sem dados</div>
              : topFazend.map((f,i)=>(
                <div key={f.id} style={{marginBottom:12}}>
                  <div style={{display:'flex',justifyContent:'space-between',marginBottom:4,fontSize:13}}>
                    <span style={{fontWeight:500}}>#{i+1} {f.name}</span>
                    <span style={{fontWeight:600,color:'var(--blue)'}}>{fmtK(f.total)}</span>
                  </div>
                  <div style={{background:'var(--surface-2)',borderRadius:4,height:6,overflow:'hidden'}}>
                    <div style={{width:`${(f.total/maxF)*100}%`,height:'100%',background:'var(--blue)',borderRadius:4}}/>
                  </div>
                  <div style={{fontSize:11,color:'var(--text-dim)',marginTop:2}}>{f.pedidos} pedidos · <span style={{textTransform:'capitalize'}}>{f.segment}</span></div>
                </div>
              ))
            }
          </div>
        </div>
      </div>
    </div>
  )
}
