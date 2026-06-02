import { useState, useEffect } from 'react'
import { supabase } from '../lib/supabase'
import Topbar from '../components/Topbar'
import { IconFilter, IconDownload, IconChevronDown, IconChevronUp } from '@tabler/icons-react'

function toISO(d) { return d.toISOString().split('T')[0] }
function fmt(n) { return Number(n||0).toLocaleString('pt-BR',{minimumFractionDigits:2,maximumFractionDigits:2}) }
function fmtK(n) { if(n>=1000000) return `R$ ${(n/1000000).toFixed(1)}M`; if(n>=1000) return `R$ ${(n/1000).toFixed(1)}k`; return `R$ ${fmt(n)}` }
function diasAtras(dias) { const d=new Date(); d.setDate(d.getDate()-dias); return toISO(d) }

const GRUPOS = {
  A: { label:'Estrelas',    cor:'#2f9e44', bg:'#ebfbee', desc:'Alta frequência + alto ticket' },
  B: { label:'Promissoras', cor:'#1971c2', bg:'#e7f5ff', desc:'Ativas com ticket médio' },
  C: { label:'Manter',      cor:'#e67700', bg:'#fff9db', desc:'Ativas com baixo ticket' },
  D: { label:'Em risco',    cor:'#e03131', bg:'#fff5f5', desc:'Sem compra há 60-90 dias' },
  E: { label:'Inativas',    cor:'#868e96', bg:'#f1f3f5', desc:'Sem compra há +90 dias' },
  F: { label:'Sem dados',   cor:'#495057', bg:'#f8f9fa', desc:'Cadastradas sem transação' },
}

function classificarFazenda(farmId, allSales, ticketMedio) {
  const vendas = allSales.filter(s=>s.farm_id===farmId)
  if(vendas.length===0) return 'F'
  const ultima = vendas.sort((a,b)=>b.sale_date.localeCompare(a.sale_date))[0]
  const diasSemCompra = Math.round((new Date()-new Date(ultima.sale_date+'T12:00:00'))/86400000)
  const totalFazenda  = vendas.reduce((a,s)=>a+Number(s.total||0),0)
  const ticketFazenda = totalFazenda/vendas.length
  if(diasSemCompra>90) return 'E'
  if(diasSemCompra>60) return 'D'
  if(ticketFazenda>=ticketMedio*1.3 && vendas.length>=3) return 'A'
  if(ticketFazenda>=ticketMedio*0.8) return 'B'
  return 'C'
}

export default function Carteira() {
  const [segmento,  setSegmento]  = useState('todos')
  const [farms,     setFarms]     = useState([])
  const [allSales,  setAllSales]  = useState([])
  const [allChecks, setAllChecks] = useState([])
  const [loading,   setLoading]   = useState(true)
  const [grupoAberto, setGrupoAberto] = useState({})

  useEffect(()=>{ carregar() },[])

  async function carregar() {
    setLoading(true)
    const [fs,sl,ck]=await Promise.all([
      supabase.from('farms').select('*').eq('status','ativo'),
      supabase.from('sales').select('*').order('sale_date',{ascending:false}),
      supabase.from('checklists').select('farm_id,overall_score,applied_at').order('applied_at',{ascending:false}),
    ])
    setFarms(fs.data||[])
    setAllSales(sl.data||[])
    setAllChecks(ck.data||[])
    setLoading(false)
  }

  function exportCSV(grupo) {
    const fazendas = farmasPorGrupo[grupo]||[]
    const rows=[['Código','Nome','Segmento','Grupo','Última compra','Total 12m','Score'],
      ...fazendas.map(f=>[f.clientCode||'—',f.name,f.segment,grupo,f.ultimaCompra||'—',f.total12m,f.score||'—'])]
    const a=document.createElement('a')
    a.href='data:text/csv;charset=utf-8,\uFEFF'+encodeURIComponent(rows.map(r=>r.join(';')).join('\n'))
    a.download=`carteira_grupo${grupo}.csv`;a.click()
  }

  // Filtra farms por segmento
  const farmsFiltradas = segmento==='todos' ? farms : farms.filter(f=>f.segment===segmento)

  // Ticket médio geral para classificação
  const totalGeral = allSales.reduce((a,s)=>a+Number(s.total||0),0)
  const ticketMedio = allSales.length ? totalGeral/allSales.length : 0

  // Monta dados enriquecidos de cada fazenda
  const d12m = diasAtras(365)
  const fazEnriquecidas = farmsFiltradas.map(f=>{
    const vendas    = allSales.filter(s=>s.farm_id===f.id)
    const vendas12m = vendas.filter(s=>s.sale_date>=d12m)
    const total12m  = vendas12m.reduce((a,s)=>a+Number(s.total||0),0)
    const ultimaVenda = vendas[0]?.sale_date||null
    const diasSemCompra = ultimaVenda ? Math.round((new Date()-new Date(ultimaVenda+'T12:00:00'))/86400000) : 999
    const scoreChecklist = allChecks.find(c=>c.farm_id===f.id)?.overall_score||null
    const grupo = classificarFazenda(f.id, allSales, ticketMedio)
    return { ...f, grupo, total12m, ultimaCompra:ultimaVenda, diasSemCompra, score:scoreChecklist, qtdVendas:vendas.length }
  })

  // Agrupa por grupo RFM
  const farmasPorGrupo = {}
  Object.keys(GRUPOS).forEach(g=>{ farmasPorGrupo[g]=fazEnriquecidas.filter(f=>f.grupo===g) })

  // KPIs
  const totalFazendas = fazEnriquecidas.length
  const receitaTotal  = fazEnriquecidas.reduce((a,f)=>a+f.total12m,0)

  return (
    <div style={{flex:1,overflow:'hidden',display:'flex',flexDirection:'column'}}>
      <Topbar title="Carteira — Segmentação RFM" subtitle="Classificação estratégica das fazendas"/>
      <div className="page" style={{overflowY:'auto'}}>

        <div style={{display:'flex',gap:10,marginBottom:20,alignItems:'center'}}>
          <IconFilter size={14} color="var(--text-faint)"/>
          <select value={segmento} onChange={e=>setSegmento(e.target.value)} style={{width:'auto',padding:'6px 10px',fontSize:12}}>
            <option value="todos">Todos</option><option value="leite">Leite</option><option value="corte">Corte</option><option value="suinos">Suínos</option>
          </select>
          <span style={{fontSize:12,color:'var(--text-faint)',marginLeft:'auto'}}>{totalFazendas} fazendas</span>
        </div>

        {loading?<div className="empty">Carregando...</div>:(
          <>
            {/* Cards de grupo */}
            <div style={{display:'grid',gridTemplateColumns:'repeat(3,1fr)',gap:12,marginBottom:24}}>
              {Object.entries(GRUPOS).map(([g,cfg])=>{
                const fazendas = farmasPorGrupo[g]||[]
                const receita  = fazendas.reduce((a,f)=>a+f.total12m,0)
                const pct      = totalFazendas?Math.round((fazendas.length/totalFazendas)*100):0
                return (
                  <div key={g} style={{background:cfg.bg,border:`1px solid ${cfg.cor}33`,borderRadius:12,padding:16,cursor:'pointer'}}
                    onClick={()=>setGrupoAberto(p=>({...p,[g]:!p[g]}))}>
                    <div style={{display:'flex',alignItems:'center',gap:8,marginBottom:8}}>
                      <span style={{fontWeight:700,fontSize:18,color:cfg.cor,width:24,textAlign:'center'}}>{g}</span>
                      <div>
                        <div style={{fontWeight:600,fontSize:13}}>{cfg.label}</div>
                        <div style={{fontSize:11,color:'var(--text-dim)'}}>{cfg.desc}</div>
                      </div>
                    </div>
                    <div style={{display:'flex',justifyContent:'space-between',alignItems:'flex-end'}}>
                      <div>
                        <div style={{fontSize:24,fontWeight:700,color:cfg.cor}}>{fazendas.length}</div>
                        <div style={{fontSize:11,color:'var(--text-dim)'}}>{pct}% da carteira</div>
                      </div>
                      <div style={{textAlign:'right'}}>
                        <div style={{fontSize:14,fontWeight:600}}>{fmtK(receita)}</div>
                        <div style={{fontSize:11,color:'var(--text-dim)'}}>12 meses</div>
                      </div>
                    </div>
                  </div>
                )
              })}
            </div>

            {/* Listagem expandível por grupo */}
            {Object.entries(GRUPOS).map(([g,cfg])=>{
              const fazendas=farmasPorGrupo[g]||[]
              if(fazendas.length===0) return null
              return (
                <div key={g} className="card" style={{marginBottom:12}}>
                  <div style={{display:'flex',alignItems:'center',gap:10,cursor:'pointer',marginBottom:grupoAberto[g]?14:0}}
                    onClick={()=>setGrupoAberto(p=>({...p,[g]:!p[g]}))}>
                    <span style={{fontWeight:700,fontSize:16,color:cfg.cor,width:28,height:28,borderRadius:8,background:cfg.bg,display:'flex',alignItems:'center',justifyContent:'center'}}>{g}</span>
                    <span style={{fontWeight:600}}>{cfg.label}</span>
                    <span className="pill" style={{background:cfg.bg,color:cfg.cor}}>{fazendas.length} fazendas</span>
                    <span style={{marginLeft:'auto',color:'var(--text-faint)',fontSize:12}}>{fmtK(fazendas.reduce((a,f)=>a+f.total12m,0))} em 12m</span>
                    <button className="btn btn-ghost btn-sm" onClick={e=>{e.stopPropagation();exportCSV(g)}}><IconDownload size={12}/></button>
                    {grupoAberto[g]?<IconChevronUp size={16}/>:<IconChevronDown size={16}/>}
                  </div>
                  {grupoAberto[g]&&(
                    <div className="table-wrap">
                      <table>
                        <thead><tr><th>Fazenda</th><th>Segmento</th><th>Última compra</th><th>Dias sem compra</th><th style={{textAlign:'right'}}>Total 12m</th><th style={{textAlign:'center'}}>Score</th><th>Ação sugerida</th></tr></thead>
                        <tbody>
                          {fazendas.sort((a,b)=>b.total12m-a.total12m).map(f=>{
                            const acao = {
                              A:'Fidelizar + upsell',B:'Aumentar frequência',
                              C:'Avaliar valor',     D:'Campanha urgente',
                              E:'Reativação',        F:'Primeira visita'
                            }[g]
                            return (
                              <tr key={f.id}>
                                <td style={{fontWeight:500}}>{f.name}</td>
                                <td><span className="pill pill-gray" style={{textTransform:'capitalize'}}>{f.segment}</span></td>
                                <td style={{fontSize:12}}>{f.ultimaCompra?new Date(f.ultimaCompra+'T12:00:00').toLocaleDateString('pt-BR'):'Nunca'}</td>
                                <td style={{color:f.diasSemCompra>90?'var(--red)':f.diasSemCompra>60?'var(--amber)':'var(--text)'}}>{f.diasSemCompra===999?'—':f.diasSemCompra+' dias'}</td>
                                <td style={{textAlign:'right',fontWeight:600}}>{fmtK(f.total12m)}</td>
                                <td style={{textAlign:'center'}}>
                                  {f.score?<span className="pill" style={{background:f.score>=75?'var(--green-bg)':f.score>=50?'var(--amber-bg)':'var(--red-bg)',color:f.score>=75?'var(--green)':f.score>=50?'var(--amber)':'var(--red)'}}>{f.score}</span>:'—'}
                                </td>
                                <td style={{fontSize:12,color:'var(--text-dim)'}}>{acao}</td>
                              </tr>
                            )
                          })}
                        </tbody>
                      </table>
                    </div>
                  )}
                </div>
              )
            })}
          </>
        )}
      </div>
    </div>
  )
}
