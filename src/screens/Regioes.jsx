import { useState, useEffect, useRef } from 'react'
import { supabaseAdmin } from '../lib/supabase'
import Topbar from '../components/Topbar'
import * as d3 from 'd3'

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

export default function Regioes() {
  const svgRef = useRef(null)
  const [periodo, setPeriodo] = useState('mes')
  const [farms,   setFarms]   = useState([])
  const [sales,   setSales]   = useState([])
  const [geo,     setGeo]     = useState(null)
  const [loading, setLoading] = useState(true)
  const [tooltip, setTooltip] = useState(null)
  const [estadoSel, setEstadoSel] = useState(null)

  useEffect(()=>{
    fetch('/brazil.json').then(r=>r.json()).then(setGeo)
    carregarBase()
  },[])
  useEffect(()=>{ if(farms.length) carregarPeriodo() },[periodo,farms])
  useEffect(()=>{ if(geo && !loading) desenharMapa() },[geo,sales,farms,estadoSel])

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
    if (!porEstado[f.state]) porEstado[f.state] = {state:f.state,fazendas:0,vendas:0,pedidos:0,farmIds:new Set()}
    porEstado[f.state].fazendas++
    porEstado[f.state].farmIds.add(f.id)
  })
  sales.forEach(s => {
    const farm = farms.find(f=>f.id===s.farm_id)
    if (!farm?.state || !porEstado[farm.state]) return
    porEstado[farm.state].vendas += Number(s.total||0)
    porEstado[farm.state].pedidos++
  })

  const maxVenda = Math.max(...Object.values(porEstado).map(e=>e.vendas), 1)

  function desenharMapa() {
    if (!svgRef.current || !geo) return
    const svg = d3.select(svgRef.current)
    svg.selectAll('*').remove()

    const W = svgRef.current.clientWidth || 600
    const H = 480

    const projection = d3.geoMercator().fitSize([W, H], geo)
    const path = d3.geoPath().projection(projection)

    // Estados
    svg.selectAll('path')
      .data(geo.features)
      .join('path')
      .attr('d', path)
      .attr('fill', d => {
        const sigla = d.properties.sigla
        const dados = porEstado[sigla]
        if (!dados || dados.vendas === 0) return 'var(--surface-2)'
        return `rgba(240,125,26,${0.15 + (dados.vendas/maxVenda)*0.6})`
      })
      .attr('stroke', d => estadoSel===d.properties.sigla ? 'var(--orange)' : 'var(--line)')
      .attr('stroke-width', d => estadoSel===d.properties.sigla ? 2 : 0.5)
      .style('cursor', 'pointer')
      .on('click', (e, d) => {
        const sigla = d.properties.sigla
        setEstadoSel(prev => prev===sigla ? null : sigla)
      })
      .on('mousemove', (e, d) => {
        const sigla = d.properties.sigla
        const dados = porEstado[sigla]
        setTooltip({
          x: e.offsetX, y: e.offsetY,
          nome: d.properties.name,
          sigla,
          vendas: dados?.vendas || 0,
          pedidos: dados?.pedidos || 0,
          fazendas: dados?.fazendas || 0,
        })
      })
      .on('mouseleave', () => setTooltip(null))

    // Bolhas
    const bubbleScale = d3.scaleSqrt().domain([0, maxVenda]).range([0, 40])
    Object.entries(porEstado).forEach(([sigla, dados]) => {
      if (dados.vendas === 0) return
      const feature = geo.features.find(f=>f.properties.sigla===sigla)
      if (!feature) return
      const centroid = path.centroid(feature)
      if (isNaN(centroid[0])) return
      const r = Math.max(8, bubbleScale(dados.vendas))
      svg.append('circle')
        .attr('cx', centroid[0])
        .attr('cy', centroid[1])
        .attr('r', r)
        .attr('fill', 'rgba(240,125,26,0.8)')
        .attr('stroke', 'white')
        .attr('stroke-width', 1.5)
        .style('cursor', 'pointer')
        .on('click', () => setEstadoSel(prev => prev===sigla ? null : sigla))
        .on('mousemove', (e) => {
          setTooltip({x:e.offsetX,y:e.offsetY,nome:feature.properties.name,sigla,vendas:dados.vendas,pedidos:dados.pedidos,fazendas:dados.fazendas})
        })
        .on('mouseleave', () => setTooltip(null))

      // Label do valor dentro da bolha
      if (r > 16) {
        svg.append('text')
          .attr('x', centroid[0]).attr('y', centroid[1]+1)
          .attr('text-anchor', 'middle').attr('dominant-baseline', 'middle')
          .attr('fill', 'white').attr('font-size', 9).attr('font-weight', 700)
          .attr('pointer-events', 'none')
          .text(fmtK(dados.vendas).replace('R$ ',''))
      }
    })
  }

  const estados = Object.values(porEstado).sort((a,b)=>b.vendas-a.vendas)
  const estadoSelData = estadoSel ? porEstado[estadoSel] : null
  const salesEstado = estadoSel ? sales.filter(s=>farms.find(f=>f.id===s.farm_id)?.state===estadoSel) : []
  const farmsEstado = estadoSel ? farms.filter(f=>f.state===estadoSel) : []

  return (
    <div style={{flex:1,overflow:'hidden',display:'flex',flexDirection:'column'}}>
      <Topbar title="Mapa de Vendas" subtitle="Distribuição geográfica por estado"/>
      <div className="page" style={{overflowY:'auto'}}>
        <div style={{display:'flex',gap:8,marginBottom:20}}>
          {[['mes','Este mês'],['trimestre','Trimestre'],['semestre','Semestre'],['ano','Este ano']].map(([v,l])=>(
            <button key={v} onClick={()=>{setPeriodo(v)}} className={`btn ${periodo===v?'btn-primary':'btn-ghost'} btn-sm`}>{l}</button>
          ))}
        </div>

        <div style={{display:'grid',gridTemplateColumns:'1fr 300px',gap:20}}>
          <div className="card" style={{padding:16,position:'relative'}}>
            <div className="section-title" style={{marginBottom:12}}>Faturamento por Estado</div>
            {loading ? <div className="empty">Carregando...</div> : (
              <div style={{position:'relative'}}>
                <svg ref={svgRef} style={{width:'100%',height:480,display:'block'}}
                  viewBox={`0 0 ${svgRef.current?.clientWidth||600} 480`}/>
                {tooltip && (
                  <div style={{position:'absolute',left:tooltip.x+12,top:tooltip.y-20,
                    background:'var(--surface-1)',border:'1px solid var(--line)',
                    borderRadius:8,padding:'8px 12px',pointerEvents:'none',zIndex:10,minWidth:160}}>
                    <div style={{fontWeight:700,fontSize:13}}>{tooltip.nome}</div>
                    <div style={{fontSize:12,color:'var(--orange)',fontWeight:600}}>{fmtK(tooltip.vendas)}</div>
                    <div style={{fontSize:11,color:'var(--text-faint)'}}>{tooltip.pedidos} pedidos · {tooltip.fazendas} fazendas</div>
                  </div>
                )}
              </div>
            )}
          </div>

          <div style={{display:'flex',flexDirection:'column',gap:12}}>
            <div className="card" style={{padding:16}}>
              <div className="section-title" style={{marginBottom:12}}>Ranking</div>
              {estados.filter(e=>e.vendas>0).slice(0,8).map((e,i)=>(
                <div key={e.state} onClick={()=>setEstadoSel(prev=>prev===e.state?null:e.state)}
                  style={{display:'flex',alignItems:'center',gap:8,padding:'6px 8px',
                    borderRadius:8,cursor:'pointer',marginBottom:4,
                    background:estadoSel===e.state?'var(--orange-bg)':'transparent'}}>
                  <span style={{width:20,fontSize:11,color:'var(--text-faint)',fontWeight:600}}>#{i+1}</span>
                  <span style={{flex:1,fontSize:13,fontWeight:600}}>{e.state}</span>
                  <span style={{fontSize:13,fontWeight:700,color:'var(--orange)'}}>{fmtK(e.vendas)}</span>
                </div>
              ))}
              {estados.filter(e=>e.vendas>0).length===0 && <div className="empty" style={{padding:20}}>Sem vendas no período</div>}
            </div>

            {estadoSelData && (
              <div className="card" style={{padding:16}}>
                <div className="section-title" style={{marginBottom:12}}>{estadoSel}</div>
                {[
                  {label:'Faturamento',value:fmtK(estadoSelData.vendas)},
                  {label:'Pedidos',value:estadoSelData.pedidos},
                  {label:'Fazendas',value:estadoSelData.fazendas},
                  {label:'Cobertura',value:estadoSelData.fazendas?Math.round((new Set(salesEstado.map(s=>s.farm_id)).size/estadoSelData.fazendas)*100)+'%':'0%'},
                ].map(k=>(
                  <div key={k.label} style={{display:'flex',justifyContent:'space-between',
                    padding:'6px 0',borderBottom:'1px solid var(--line)',fontSize:13}}>
                    <span style={{color:'var(--text-dim)'}}>{k.label}</span>
                    <span style={{fontWeight:600}}>{k.value}</span>
                  </div>
                ))}
                <div style={{marginTop:12,fontSize:12,color:'var(--text-faint)',marginBottom:4}}>Fazendas:</div>
                {farmsEstado.slice(0,5).map(f=>(
                  <div key={f.id} style={{fontSize:12,padding:'3px 0',color:'var(--text-dim)'}}>{f.name}</div>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
