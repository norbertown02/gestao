import { useState, useEffect } from 'react'
import { supabase } from '../lib/supabase'
import Topbar from '../components/Topbar'
import { IconCheck } from '@tabler/icons-react'
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Cell } from 'recharts'

function fmt(n) { return Number(n||0).toLocaleString('pt-BR',{minimumFractionDigits:2,maximumFractionDigits:2}) }
function fmtK(n) { if(n>=1000000) return `R$ ${(n/1000000).toFixed(1)}M`; if(n>=1000) return `R$ ${(n/1000).toFixed(1)}k`; return `R$ ${fmt(n)}` }
function getMesAtual() { const d=new Date(); return {ano:d.getFullYear(),mes:d.getMonth()+1} }
function nomeMes(mes,ano) { return new Date(ano,mes-1,1).toLocaleDateString('pt-BR',{month:'long',year:'numeric'}) }
function diasNoMes(ano,mes) { return new Date(ano,mes,0).getDate() }
function diasPassados(ano,mes) { const hoje=new Date(); if(hoje.getFullYear()===ano&&hoje.getMonth()+1===mes) return hoje.getDate(); if(hoje>new Date(ano,mes,0)) return diasNoMes(ano,mes); return 0 }

export default function Metas() {
  const [sellers,  setSellers]  = useState([])
  const [goals,    setGoals]    = useState([])
  const [sales,    setSales]    = useState([])
  const [loading,  setLoading]  = useState(true)
  const [saving,   setSaving]   = useState({})
  const [editMeta, setEditMeta] = useState({})
  const [mesSel,   setMesSel]   = useState(getMesAtual())
  const [aba,      setAba]      = useState('acompanhamento')

  useEffect(()=>{ carregarBase() },[])
  useEffect(()=>{ if(sellers.length) carregarDados() },[mesSel,sellers])

  async function carregarBase() {
    const {data}=await supabase.from('profiles').select('*').eq('active',true).order('name')
    setSellers(data||[])
  }

  async function carregarDados() {
    setLoading(true)
    const mesStr=`${mesSel.ano}-${String(mesSel.mes).padStart(2,'0')}`
    const [gl,sl]=await Promise.all([
      supabase.from('goals').select('*').eq('ano',mesSel.ano).eq('mes',mesSel.mes),
      supabase.from('sales').select('*').gte('sale_date',mesStr+'-01').lte('sale_date',mesStr+'-31'),
    ])
    setGoals(gl.data||[])
    setSales(sl.data||[])
    const em={}
    ;(gl.data||[]).forEach(g=>{ em[g.seller_id]=g.meta_fat })
    setEditMeta(em)
    setLoading(false)
  }

  async function salvarMeta(sellerId) {
    setSaving(p=>({...p,[sellerId]:true}))
    const metaVal=parseFloat(String(editMeta[sellerId]||'0').replace(',','.'))
    const existing=goals.find(g=>g.seller_id===sellerId)
    if(existing) {
      await supabase.from('goals').update({meta_fat:metaVal,updated_at:new Date().toISOString()}).eq('id',existing.id)
      setGoals(prev=>prev.map(g=>g.seller_id===sellerId?{...g,meta_fat:metaVal}:g))
    } else {
      const {data}=await supabase.from('goals').insert({seller_id:sellerId,ano:mesSel.ano,mes:mesSel.mes,meta_fat:metaVal}).select().single()
      if(data) setGoals(prev=>[...prev,data])
    }
    setSaving(p=>({...p,[sellerId]:false}))
  }

  const diasT=diasNoMes(mesSel.ano,mesSel.mes)
  const diasP=diasPassados(mesSel.ano,mesSel.mes)

  const dadosVendedores=sellers.map(s=>{
    const goal=goals.find(g=>g.seller_id===s.id)
    const meta=Number(goal?.meta_fat||0)
    const realizado=sales.reduce((a,v)=>a+Number(v.total||0),0)/sellers.length
    const pct=meta>0?Math.min((realizado/meta)*100,150):0
    const projecao=diasP?((realizado/diasP)*diasT):0
    const status=pct>=100?'atingida':pct>=70?'caminho':pct>=40?'atencao':'risco'
    return {...s,meta,realizado,pct,projecao,status}
  })

  const totalMeta=dadosVendedores.reduce((a,s)=>a+s.meta,0)
  const totalReal=dadosVendedores.reduce((a,s)=>a+s.realizado,0)
  const pctGeral=totalMeta>0?Math.min((totalReal/totalMeta)*100,150):0
  const projGeral=diasP?((totalReal/diasP)*diasT):0

  const statusCor={atingida:'var(--green)',caminho:'var(--blue)',atencao:'var(--amber)',risco:'var(--red)'}
  const statusLabel={atingida:'Meta atingida!',caminho:'No caminho',atencao:'Atenção',risco:'Em risco'}

  const meses=Array.from({length:12},(_,i)=>{ const d=new Date(); d.setMonth(d.getMonth()-i); return {ano:d.getFullYear(),mes:d.getMonth()+1} })

  return (
    <div style={{flex:1,overflow:'hidden',display:'flex',flexDirection:'column'}}>
      <Topbar title="Metas Comerciais" subtitle="Acompanhamento de metas mensais por vendedor"/>
      <div className="page" style={{overflowY:'auto'}}>

        <div style={{display:'flex',gap:12,marginBottom:20,alignItems:'center',flexWrap:'wrap'}}>
          <select value={`${mesSel.ano}-${mesSel.mes}`} onChange={e=>{ const [a,m]=e.target.value.split('-').map(Number); setMesSel({ano:a,mes:m}) }} style={{width:'auto',padding:'6px 10px',fontSize:12}}>
            {meses.map(m=><option key={`${m.ano}-${m.mes}`} value={`${m.ano}-${m.mes}`}>{nomeMes(m.mes,m.ano).charAt(0).toUpperCase()+nomeMes(m.mes,m.ano).slice(1)}</option>)}
          </select>
          <div style={{display:'flex',background:'var(--surface)',border:'1px solid var(--line)',borderRadius:8,overflow:'hidden'}}>
            {[{id:'acompanhamento',label:'Acompanhamento'},{id:'cadastro',label:'Cadastrar metas'}].map(t=>(
              <button key={t.id} onClick={()=>setAba(t.id)} style={{padding:'7px 14px',border:'none',cursor:'pointer',fontSize:12,fontWeight:500,fontFamily:'inherit',background:aba===t.id?'var(--orange)':'transparent',color:aba===t.id?'#fff':'var(--text-dim)'}}>
                {t.label}
              </button>
            ))}
          </div>
          <span style={{fontSize:12,color:'var(--text-faint)',marginLeft:'auto'}}>{diasP} de {diasT} dias passados</span>
        </div>

        {loading?<div className="empty">Carregando...</div>:(
          <>
            {aba==='acompanhamento'&&(
              <>
                <div className="kpi-grid" style={{gridTemplateColumns:'repeat(4,1fr)',marginBottom:20}}>
                  {[
                    {label:'Meta geral do mês',     value:fmtK(totalMeta),  sub:'soma de todos os vendedores'},
                    {label:'Realizado até hoje',    value:fmtK(totalReal),  sub:`${pctGeral.toFixed(1)}% da meta`},
                    {label:'Projeção de fechamento',value:fmtK(projGeral),  sub:projGeral>=totalMeta?'✓ Meta será atingida':'⚠ Abaixo da meta', style:{color:projGeral>=totalMeta?'var(--green)':'var(--red)'}},
                    {label:'Dias restantes',         value:diasT-diasP,      sub:`de ${diasT} dias no mês`},
                  ].map(k=>(
                    <div key={k.label} className="kpi">
                      <div className="label">{k.label}</div>
                      <div className="value" style={{fontSize:20,...(k.style||{})}}>{k.value}</div>
                      <div className="sub">{k.sub}</div>
                    </div>
                  ))}
                </div>

                <div className="card" style={{marginBottom:20}}>
                  <div style={{display:'flex',justifyContent:'space-between',marginBottom:8}}>
                    <span style={{fontWeight:600,fontSize:14}}>Progresso geral do time</span>
                    <span style={{fontWeight:700,fontSize:16,color:pctGeral>=100?'var(--green)':pctGeral>=70?'var(--blue)':'var(--amber)'}}>{pctGeral.toFixed(1)}%</span>
                  </div>
                  <div style={{background:'var(--surface-2)',borderRadius:8,height:16,overflow:'hidden',marginBottom:8}}>
                    <div style={{width:`${Math.min(pctGeral,100)}%`,height:'100%',background:pctGeral>=100?'var(--green)':pctGeral>=70?'var(--blue)':'var(--amber)',borderRadius:8,transition:'width 0.5s',display:'flex',alignItems:'center',justifyContent:'flex-end',paddingRight:8}}>
                      {pctGeral>15&&<span style={{fontSize:10,color:'#fff',fontWeight:700}}>{pctGeral.toFixed(0)}%</span>}
                    </div>
                  </div>
                  <div style={{display:'flex',justifyContent:'space-between',fontSize:11,color:'var(--text-faint)'}}>
                    <span>R$ 0</span><span>Meta: {fmtK(totalMeta)}</span>
                  </div>
                </div>

                <div style={{display:'grid',gridTemplateColumns:'repeat(auto-fill,minmax(280px,1fr))',gap:14,marginBottom:20}}>
                  {dadosVendedores.map(s=>(
                    <div key={s.id} className="card" style={{borderLeft:`4px solid ${statusCor[s.status]}`}}>
                      <div style={{display:'flex',justifyContent:'space-between',alignItems:'flex-start',marginBottom:12}}>
                        <div>
                          <div style={{fontWeight:600,fontSize:14}}>{s.name}</div>
                          <span className="pill" style={{background:statusCor[s.status]+'22',color:statusCor[s.status],marginTop:4,display:'inline-flex'}}>{statusLabel[s.status]}</span>
                        </div>
                        <div style={{textAlign:'right'}}>
                          <div style={{fontSize:22,fontWeight:700,color:statusCor[s.status]}}>{s.pct.toFixed(0)}%</div>
                          <div style={{fontSize:10,color:'var(--text-faint)'}}>da meta</div>
                        </div>
                      </div>
                      <div style={{background:'var(--surface-2)',borderRadius:6,height:8,overflow:'hidden',marginBottom:10}}>
                        <div style={{width:`${Math.min(s.pct,100)}%`,height:'100%',background:statusCor[s.status],borderRadius:6,transition:'width 0.5s'}}/>
                      </div>
                      <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:8}}>
                        {[
                          {label:'Realizado',value:fmtK(s.realizado)},
                          {label:'Meta',     value:fmtK(s.meta)},
                          {label:'Projeção', value:fmtK(s.projecao),style:{color:s.projecao>=s.meta?'var(--green)':'var(--red)'}},
                          {label:'Falta',    value:s.meta>s.realizado?fmtK(s.meta-s.realizado):'✓ Atingida',style:{color:s.meta>s.realizado?'var(--red)':'var(--green)'}},
                        ].map(k=>(
                          <div key={k.label} style={{background:'var(--surface-2)',borderRadius:8,padding:'8px 10px'}}>
                            <div style={{fontSize:10,color:'var(--text-faint)',marginBottom:2}}>{k.label}</div>
                            <div style={{fontSize:13,fontWeight:600,...(k.style||{})}}>{k.value}</div>
                          </div>
                        ))}
                      </div>
                    </div>
                  ))}
                </div>

                <div className="card">
                  <div className="section-title">Meta vs Realizado vs Projeção</div>
                  <ResponsiveContainer width="100%" height={220}>
                    <BarChart data={dadosVendedores} margin={{top:4,right:8,left:-8,bottom:0}}>
                      <CartesianGrid strokeDasharray="3 3" stroke="var(--line)"/>
                      <XAxis dataKey="name" tick={{fontSize:11}}/><YAxis tick={{fontSize:11}} tickFormatter={v=>`R$${(v/1000).toFixed(0)}k`}/>
                      <Tooltip formatter={v=>[`R$ ${fmt(v)}`]}/>
                      <Bar dataKey="meta"      name="Meta"      fill="var(--line)"  radius={[4,4,0,0]}/>
                      <Bar dataKey="realizado" name="Realizado" radius={[4,4,0,0]}>{dadosVendedores.map((s,i)=><Cell key={i} fill={statusCor[s.status]}/>)}</Bar>
                      <Bar dataKey="projecao"  name="Projeção"  fill="var(--blue)"  radius={[4,4,0,0]} fillOpacity={0.4}/>
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              </>
            )}

            {aba==='cadastro'&&(
              <div className="card">
                <div className="section-title">Definir metas — {nomeMes(mesSel.mes,mesSel.ano)}</div>
                <p style={{fontSize:13,color:'var(--text-dim)',marginBottom:20}}>Configure a meta de faturamento mensal para cada vendedor.</p>
                <div style={{display:'flex',flexDirection:'column',gap:12}}>
                  {sellers.map(s=>{
                    const goal=goals.find(g=>g.seller_id===s.id)
                    return (
                      <div key={s.id} style={{display:'flex',alignItems:'center',gap:12,padding:'14px 16px',background:'var(--surface-2)',borderRadius:12}}>
                        <div style={{width:36,height:36,borderRadius:8,background:'var(--orange-bg)',display:'flex',alignItems:'center',justifyContent:'center',flexShrink:0,fontSize:14,fontWeight:700,color:'var(--orange)'}}>{s.name.charAt(0)}</div>
                        <div style={{flex:1}}>
                          <div style={{fontWeight:600,fontSize:13}}>{s.name}</div>
                          <div style={{fontSize:11,color:'var(--text-faint)'}}>{goal?.meta_fat>0?`Meta atual: ${fmtK(goal.meta_fat)}`:'Sem meta definida'}</div>
                        </div>
                        <div style={{display:'flex',alignItems:'center',gap:8}}>
                          <span style={{fontSize:13,color:'var(--text-dim)'}}>R$</span>
                          <input type="number" value={editMeta[s.id]||''} onChange={e=>setEditMeta(p=>({...p,[s.id]:e.target.value}))} placeholder="0,00" style={{width:140,textAlign:'right',padding:'8px 12px'}}/>
                          <button className="btn btn-primary btn-sm" onClick={()=>salvarMeta(s.id)} disabled={saving[s.id]} style={{minWidth:80}}>
                            {saving[s.id]?'Salvando...':<><IconCheck size={13}/> Salvar</>}
                          </button>
                        </div>
                      </div>
                    )
                  })}
                </div>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  )
}
