import { useState, useEffect } from 'react'
import { supabaseAdmin } from '../lib/supabase'
import Topbar from '../components/Topbar'
import * as d3 from 'd3'
import { feature } from 'topojson-client'

function fmt(n) { return Number(n||0).toLocaleString('pt-BR',{minimumFractionDigits:2,maximumFractionDigits:2}) }
function fmtK(n) { if(n>=1000000) return `R$ ${(n/1000000).toFixed(1)}M`; if(n>=1000) return `R$ ${(n/1000).toFixed(1)}k`; return `R$ ${fmt(n)}` }
function toISO(d) { return d.toISOString().split('T')[0] }
function periodoRange(p) {
  const hoje=new Date(),ano=hoje.getFullYear(),mes=hoje.getMonth()
  if(p==='mes') return [new Date(ano,mes,1),hoje]
  if(p==='trimestre') return [new Date(ano,mes-2,1),hoje]
  if(p==='semestre') return [new Date(ano,mes-5,1),hoje]
  return [new Date(ano,0,1),hoje]
}

// Coordenadas centrais dos estados brasileiros
const ESTADOS_COORDS = {
  AC:{cx:120,cy:280,nome:'Acre'}, AL:{cx:580,cy:280,nome:'Alagoas'},
  AM:{cx:180,cy:220,nome:'Amazonas'}, AP:{cx:460,cy:100,nome:'Amapá'},
  BA:{cx:530,cy:320,nome:'Bahia'}, CE:{cx:580,cy:200,nome:'Ceará'},
  DF:{cx:440,cy:340,nome:'Distrito Federal'}, ES:{cx:560,cy:390,nome:'Espírito Santo'},
  GO:{cx:420,cy:340,nome:'Goiás'}, MA:{cx:490,cy:190,nome:'Maranhão'},
  MG:{cx:490,cy:370,nome:'Minas Gerais'}, MS:{cx:360,cy:390,nome:'Mato Grosso do Sul'},
  MT:{cx:310,cy:300,nome:'Mato Grosso'}, PA:{cx:380,cy:180,nome:'Pará'},
  PB:{cx:600,cy:230,nome:'Paraíba'}, PE:{cx:580,cy:255,nome:'Pernambuco'},
  PI:{cx:530,cy:225,nome:'Piauí'}, PR:{cx:400,cy:430,nome:'Paraná'},
  RJ:{cx:530,cy:410,nome:'Rio de Janeiro'}, RN:{cx:610,cy:215,nome:'Rio Grande do Norte'},
  RO:{cx:200,cy:290,nome:'Rondônia'}, RR:{cx:230,cy:120,nome:'Roraima'},
  RS:{cx:390,cy:490,nome:'Rio Grande do Sul'}, SC:{cx:420,cy:460,nome:'Santa Catarina'},
  SE:{cx:590,cy:290,nome:'Sergipe'}, SP:{cx:460,cy:420,nome:'São Paulo'},
  TO:{cx:430,cy:260,nome:'Tocantins'}
}

export default function Regioes() {
  const [periodo, setPeriodo] = useState('mes')
  const [farms,   setFarms]   = useState([])
  const [sales,   setSales]   = useState([])
  const [loading, setLoading] = useState(true)
  const [hover,   setHover]   = useState(null)
  const [estadoSel, setEstadoSel] = useState(null)

  useEffect(()=>{ carregarBase() },[])
  useEffect(()=>{ if(farms.length) carregarPeriodo() },[periodo,farms])

  async function carregarBase() {
    const {data}=await supabaseAdmin.from('farms').select('id,name,state,segment')
    setFarms(data||[])
  }

  async function carregarPeriodo() {
    setLoading(true)
    const [ini,fim]=periodoRange(periodo)
    const {data}=await supabaseAdmin.from('sales').select('*').gte('sale_date',toISO(ini)).lte('sale_date',toISO(fim))
    setSales(data||[])
    setLoading(false)
  }

  // Agrupa por estado
  const porEstado = {}
  farms.forEach(f => {
    if (!f.state) return
    if (!porEstado[f.state]) porEstado[f.state] = { state: f.state, fazendas: 0, vendas: 0, pedidos: 0, fazIds: new Set() }
    porEstado[f.state].fazendas++
    porEstado[f.state].fazIds.add(f.id)
  })
  sales.forEach(s => {
    const farm = farms.find(f=>f.id===s.farm_id)
    if (!farm?.state) return
    if (!porEstado[farm.state]) return
    porEstado[farm.state].vendas += Number(s.total||0)
    porEstado[farm.state].pedidos++
  })

  const estados = Object.values(porEstado).sort((a,b)=>b.vendas-a.vendas)
  const maxVenda = Math.max(...estados.map(e=>e.vendas), 1)

  const estadoSelData = estadoSel ? porEstado[estadoSel] : null
  const salesEstado = estadoSel ? sales.filter(s=>farms.find(f=>f.id===s.farm_id)?.state===estadoSel) : []
  const farmsEstado = estadoSel ? farms.filter(f=>f.state===estadoSel) : []

  return (
    <div style={{flex:1,overflow:'hidden',display:'flex',flexDirection:'column'}}>
      <Topbar title="Mapa de Vendas" subtitle="Distribuição por estado"/>
      <div className="page" style={{overflowY:'auto'}}>

        {/* Filtro período */}
        <div style={{display:'flex',gap:8,marginBottom:20}}>
          {[['mes','Este mês'],['trimestre','Trimestre'],['semestre','Semestre'],['ano','Este ano']].map(([v,l])=>(
            <button key={v} onClick={()=>setPeriodo(v)}
              className={`btn ${periodo===v?'btn-primary':'btn-ghost'} btn-sm`}>{l}</button>
          ))}
        </div>

        <div style={{display:'grid',gridTemplateColumns:'1fr 340px',gap:20}}>
          {/* Mapa */}
          <div className="card" style={{padding:16,position:'relative'}}>
            <div className="section-title" style={{marginBottom:12}}>Faturamento por Estado</div>
            {loading ? <div className="empty">Carregando...</div> : (
              <svg viewBox="0 0 700 560" style={{width:'100%',height:'auto'}}>
                {/* Fundo */}
                <rect width={700} height={560} fill="var(--surface-2)" rx={12}/>

                {/* Bolhas por estado */}
                {estados.map(e => {
                  const coord = ESTADOS_COORDS[e.state]
                  if (!coord) return null
                  const r = e.vendas > 0 ? Math.max(12, Math.sqrt(e.vendas/maxVenda)*60) : 8
                  const isHover = hover === e.state
                  const isSel = estadoSel === e.state
                  return (
                    <g key={e.state} style={{cursor:'pointer'}}
                      onMouseEnter={()=>setHover(e.state)}
                      onMouseLeave={()=>setHover(null)}
                      onClick={()=>setEstadoSel(estadoSel===e.state?null:e.state)}>
                      <circle
                        cx={coord.cx} cy={coord.cy} r={r}
                        fill={e.vendas>0?'rgba(240,125,26,0.7)':'rgba(100,100,100,0.3)'}
                        stroke={isSel?'var(--orange)':isHover?'white':'none'}
                        strokeWidth={isSel?3:2}
                      />
                      <text x={coord.cx} y={coord.cy+1} textAnchor="middle" dominantBaseline="middle"
                        fill="white" fontSize={10} fontWeight={600}>{e.state}</text>
                      {isHover && e.vendas>0 && (
                        <g>
                          <rect x={coord.cx+r+4} y={coord.cy-20} width={100} height={40} rx={6}
                            fill="var(--surface-1)" stroke="var(--line)"/>
                          <text x={coord.cx+r+54} y={coord.cy-5} textAnchor="middle"
                            fill="var(--text)" fontSize={9} fontWeight={600}>{coord.nome}</text>
                          <text x={coord.cx+r+54} y={coord.cy+8} textAnchor="middle"
                            fill="var(--orange)" fontSize={10} fontWeight={700}>{fmtK(e.vendas)}</text>
                        </g>
                      )}
                    </g>
                  )
                })}
              </svg>
            )}
            {/* Legenda */}
            <div style={{display:'flex',gap:16,marginTop:8,fontSize:11,color:'var(--text-faint)'}}>
              <span>● Maior = mais faturamento</span>
              <span style={{color:'rgba(100,100,100,0.5)'}}>● Cinza = sem vendas no período</span>
            </div>
          </div>

          {/* Ranking + detalhe */}
          <div style={{display:'flex',flexDirection:'column',gap:12}}>
            {/* Ranking */}
            <div className="card" style={{padding:16}}>
              <div className="section-title" style={{marginBottom:12}}>Ranking por Estado</div>
              {estados.filter(e=>e.vendas>0).slice(0,8).map((e,i)=>(
                <div key={e.state} onClick={()=>setEstadoSel(estadoSel===e.state?null:e.state)}
                  style={{display:'flex',alignItems:'center',gap:8,padding:'6px 8px',borderRadius:8,
                    cursor:'pointer',marginBottom:4,
                    background:estadoSel===e.state?'var(--orange-bg)':'transparent'}}>
                  <span style={{width:20,fontSize:11,color:'var(--text-faint)',fontWeight:600}}>#{i+1}</span>
                  <span style={{flex:1,fontSize:13,fontWeight:600}}>{ESTADOS_COORDS[e.state]?.nome||e.state}</span>
                  <span style={{fontSize:13,fontWeight:700,color:'var(--orange)'}}>{fmtK(e.vendas)}</span>
                </div>
              ))}
              {estados.filter(e=>e.vendas>0).length===0 && (
                <div className="empty" style={{padding:20}}>Sem vendas no período</div>
              )}
            </div>

            {/* Detalhe do estado selecionado */}
            {estadoSelData && (
              <div className="card" style={{padding:16}}>
                <div className="section-title" style={{marginBottom:12}}>
                  {ESTADOS_COORDS[estadoSel]?.nome||estadoSel}
                </div>
                {[
                  {label:'Faturamento', value:fmtK(estadoSelData.vendas)},
                  {label:'Pedidos', value:estadoSelData.pedidos},
                  {label:'Fazendas', value:estadoSelData.fazendas},
                  {label:'Cobertura', value:estadoSelData.fazendas?Math.round((new Set(salesEstado.map(s=>s.farm_id)).size/estadoSelData.fazendas)*100)+'%':'0%'},
                ].map(k=>(
                  <div key={k.label} style={{display:'flex',justifyContent:'space-between',
                    padding:'6px 0',borderBottom:'1px solid var(--line)',fontSize:13}}>
                    <span style={{color:'var(--text-dim)'}}>{k.label}</span>
                    <span style={{fontWeight:600}}>{k.value}</span>
                  </div>
                ))}
                <div style={{marginTop:12,fontSize:12,color:'var(--text-faint)'}}>Fazendas:</div>
                {farmsEstado.slice(0,5).map(f=>(
                  <div key={f.id} style={{fontSize:12,padding:'4px 0',color:'var(--text-dim)'}}>{f.name}</div>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
