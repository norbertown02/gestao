import { useState, useEffect } from 'react'
import { supabase, supabaseAdmin } from '../lib/supabase'
import Topbar from '../components/Topbar'
import { IconFilter, IconDownload, IconTrendingUp, IconTrendingDown, IconChevronDown, IconChevronUp } from '@tabler/icons-react'
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, BarChart, Bar, PieChart, Pie, Cell } from 'recharts'

function fmt(n) { return Number(n||0).toLocaleString('pt-BR',{minimumFractionDigits:2,maximumFractionDigits:2}) }
function fmtK(n) { if(n>=1000000) return `R$ ${(n/1000000).toFixed(1)}M`; if(n>=1000) return `R$ ${(n/1000).toFixed(1)}k`; return `R$ ${fmt(n)}` }
function pct(a,b) { if(!b) return '0.0'; return ((a-b)/b*100).toFixed(1) }
const CORES=['#F07D1A','#6BA4D9','#E67E47','#D9A4C1','#2f9e44']
const CORES_SEG={leite:'#6BA4D9',corte:'#E67E47',suinos:'#D9A4C1'}

function periodoRange(p) {
  const hoje=new Date(),ano=hoje.getFullYear(),mes=hoje.getMonth()
  if(p==='mes') return [new Date(ano,mes,1),hoje]
  if(p==='trimestre') return [new Date(ano,mes-2,1),hoje]
  if(p==='semestre') return [new Date(ano,mes-5,1),hoje]
  return [new Date(ano,0,1),hoje]
}
function toISO(d) { return d.toISOString().split('T')[0] }

export default function Vendas() {
  const [periodo,   setPeriodo]   = useState('mes')
  const [segmento,  setSegmento]  = useState('todos')
  const [farms,     setFarms]     = useState([])
  const [sales,     setSales]     = useState([])
  const [salesAnt,  setSalesAnt]  = useState([])
  const [loading,   setLoading]   = useState(true)
  const [detalheId, setDetalheId] = useState(null)

  useEffect(()=>{ carregarBase() },[])
  useEffect(()=>{ if(farms.length) carregarVendas() },[periodo,segmento,farms])

  async function carregarBase() {
    const {data}=await supabaseAdmin.from('farms').select('*')
    setFarms(data||[])
  }

  async function carregarVendas() {
    setLoading(true)
    const [ini,fim]=periodoRange(periodo), diff=fim-ini
    const [r,rAnt]=await Promise.all([
      supabaseAdmin.from('sales').select('*').gte('sale_date',toISO(ini)).lte('sale_date',toISO(fim)),
      supabaseAdmin.from('sales').select('*').gte('sale_date',toISO(new Date(ini-diff))).lte('sale_date',toISO(ini)),
    ])
    let sm=r.data||[],sa=rAnt.data||[]
    if(segmento!=='todos'){const ids=farms.filter(f=>f.segment===segmento).map(f=>f.id);sm=sm.filter(s=>ids.includes(s.farm_id));sa=sa.filter(s=>ids.includes(s.farm_id))}
    setSales(sm);setSalesAnt(sa);setLoading(false)
  }

  const fat=sales.reduce((a,s)=>a+Number(s.total||0),0)
  const fatAnt=salesAnt.reduce((a,s)=>a+Number(s.total||0),0)
  const tick=sales.length?fat/sales.length:0
  const tickAnt=salesAnt.length?fatAnt/salesAnt.length:0
  const comDesc=sales.filter(s=>s.needs_approval).length

  const evolMap={}
  sales.forEach(s=>{ evolMap[s.sale_date]=(evolMap[s.sale_date]||0)+Number(s.total||0) })
  const evolucao=Object.entries(evolMap).sort().map(([d,v])=>({
    data:new Date(d+'T12:00:00').toLocaleDateString('pt-BR',{day:'2-digit',month:'short'}),Receita:v
  }))

  const prodMap={}
  sales.forEach(s=>{ (s.items||[]).forEach(it=>{ const k=it.productName||it.product_name||'Produto'; if(!prodMap[k]) prodMap[k]={name:k,receita:0}; prodMap[k].receita+=Number(it.subtotal||0) }) })
  const porProduto=Object.values(prodMap).sort((a,b)=>b.receita-a.receita).slice(0,8)

  const segMap={}
  sales.forEach(s=>{ const seg=farms.find(f=>f.id===s.farm_id)?.segment||'outros'; segMap[seg]=(segMap[seg]||0)+Number(s.total||0) })
  const porSegmento=Object.entries(segMap).map(([name,value])=>({name,value}))

  const pagMap={}
  sales.forEach(s=>{ const k=s.payment_term_label||'Outro'; pagMap[k]=(pagMap[k]||0)+1 })
  const porPagamento=Object.entries(pagMap).map(([name,value])=>({name,value}))

  const tabela=sales.map(s=>({...s,farmName:farms.find(f=>f.id===s.farm_id)?.name||'—',segment:farms.find(f=>f.id===s.farm_id)?.segment||'—'})).sort((a,b)=>b.sale_date.localeCompare(a.sale_date))

  function exportCSV() {
    const rows=[['Data','Fazenda','Segmento','Itens','Pagamento','Total','Status','Desconto'],...tabela.map(s=>[s.sale_date,s.farmName,s.segment,(s.items||[]).length,s.payment_term_label,s.total,s.status,s.needs_approval?'Sim':'Não'])]
    const a=document.createElement('a');a.href='data:text/csv;charset=utf-8,\uFEFF'+encodeURIComponent(rows.map(r=>r.join(';')).join('\n'));a.download='vendas.csv';a.click()
  }

  return (
    <div style={{flex:1,overflow:'hidden',display:'flex',flexDirection:'column'}}>
      <Topbar title="Vendas Consolidadas" subtitle="Análise de receita e pedidos">
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
          <span style={{fontSize:12,color:'var(--text-faint)',marginLeft:'auto'}}>{sales.length} pedidos</span>
        </div>

        <div className="kpi-grid" style={{gridTemplateColumns:'repeat(5,1fr)'}}>
          {[
            {label:'Faturamento',  value:fmtK(fat),   at:fat,          ant:fatAnt},
            {label:'Pedidos',      value:sales.length, at:sales.length,  ant:salesAnt.length},
            {label:'Ticket médio', value:fmtK(tick),   at:tick,          ant:tickAnt},
            {label:'Com desconto', value:comDesc,      sub:'acima de 10%'},
            {label:'Período ant.', value:fmtK(fatAnt), sub:'para comparação'},
          ].map(k=>(
            <div key={k.label} className="kpi">
              <div className="label">{k.label}</div>
              <div className="value" style={{fontSize:20}}>{k.value}</div>
              {k.ant!==undefined
                ? <span className={`sub ${k.at>=k.ant?'up':'down'}`} style={{display:'flex',alignItems:'center',gap:3,fontSize:11}}>
                    {k.at>=k.ant?<IconTrendingUp size={11}/>:<IconTrendingDown size={11}/>}
                    {pct(k.at,k.ant)}% vs ant.
                  </span>
                : <div className="sub">{k.sub}</div>}
            </div>
          ))}
        </div>

        {loading?<div className="empty">Carregando...</div>:(
          <>
            <div style={{display:'grid',gridTemplateColumns:'2fr 1fr',gap:16,marginBottom:20}}>
              <div className="card">
                <div className="section-title">Evolução temporal</div>
                {evolucao.length>0?(
                  <ResponsiveContainer width="100%" height={200}>
                    <LineChart data={evolucao} margin={{top:4,right:8,left:-16,bottom:0}}>
                      <CartesianGrid strokeDasharray="3 3" stroke="var(--line)"/>
                      <XAxis dataKey="data" tick={{fontSize:11}}/><YAxis tick={{fontSize:11}} tickFormatter={v=>`R$${(v/1000).toFixed(0)}k`}/>
                      <Tooltip formatter={v=>[`R$ ${fmt(v)}`,'Receita']}/>
                      <Line type="monotone" dataKey="Receita" stroke="var(--orange)" strokeWidth={2} dot={false}/>
                    </LineChart>
                  </ResponsiveContainer>
                ):<div className="empty" style={{padding:40}}>Sem vendas no período</div>}
              </div>
              <div className="card">
                <div className="section-title">Por segmento</div>
                {porSegmento.length>0?(
                  <>
                    <ResponsiveContainer width="100%" height={130}>
                      <PieChart><Pie data={porSegmento} cx="50%" cy="50%" innerRadius={35} outerRadius={55} dataKey="value">
                        {porSegmento.map((s,i)=><Cell key={i} fill={CORES_SEG[s.name]||CORES[i]}/>)}
                      </Pie><Tooltip formatter={v=>[`R$ ${fmt(v)}`]}/></PieChart>
                    </ResponsiveContainer>
                    {porSegmento.map((s,i)=>(
                      <div key={i} style={{display:'flex',alignItems:'center',gap:8,fontSize:12,marginBottom:3}}>
                        <span style={{width:10,height:10,borderRadius:2,background:CORES_SEG[s.name]||CORES[i],display:'inline-block'}}/>
                        <span style={{flex:1,textTransform:'capitalize'}}>{s.name}</span>
                        <span style={{fontWeight:600}}>{fmtK(s.value)}</span>
                      </div>
                    ))}
                  </>
                ):<div className="empty" style={{padding:30}}>Sem dados</div>}
              </div>
            </div>

            <div style={{display:'grid',gridTemplateColumns:'2fr 1fr',gap:16,marginBottom:20}}>
              <div className="card">
                <div className="section-title">Top produtos</div>
                {porProduto.length>0?(
                  <ResponsiveContainer width="100%" height={200}>
                    <BarChart data={porProduto} layout="vertical" margin={{top:0,right:8,left:8,bottom:0}}>
                      <CartesianGrid strokeDasharray="3 3" stroke="var(--line)"/>
                      <XAxis type="number" tick={{fontSize:11}} tickFormatter={v=>`R$${(v/1000).toFixed(0)}k`}/>
                      <YAxis type="category" dataKey="name" tick={{fontSize:10}} width={150}/>
                      <Tooltip formatter={v=>[`R$ ${fmt(v)}`,'Receita']}/>
                      <Bar dataKey="receita" fill="var(--orange)" radius={[0,4,4,0]}/>
                    </BarChart>
                  </ResponsiveContainer>
                ):<div className="empty" style={{padding:40}}>Sem dados de produtos</div>}
              </div>
              <div className="card">
                <div className="section-title">Por forma de pagamento</div>
                {porPagamento.length>0?(
                  <>
                    <ResponsiveContainer width="100%" height={140}>
                      <PieChart><Pie data={porPagamento} cx="50%" cy="50%" outerRadius={60} dataKey="value">
                        {porPagamento.map((p,i)=><Cell key={i} fill={CORES[i]}/>)}
                      </Pie><Tooltip/></PieChart>
                    </ResponsiveContainer>
                    {porPagamento.map((p,i)=>(
                      <div key={i} style={{display:'flex',alignItems:'center',gap:8,fontSize:12,marginBottom:3}}>
                        <span style={{width:10,height:10,borderRadius:2,background:CORES[i],display:'inline-block'}}/>
                        <span style={{flex:1}}>{p.name}</span><span style={{fontWeight:600}}>{p.value} pedidos</span>
                      </div>
                    ))}
                  </>
                ):<div className="empty" style={{padding:30}}>Sem dados</div>}
              </div>
            </div>

            <div className="card">
              <div className="section-title">Pedidos detalhados</div>
              <div className="table-wrap">
                <table>
                  <thead><tr><th>Data</th><th>Fazenda</th><th>Segmento</th><th>Itens</th><th>Pagamento</th><th style={{textAlign:'right'}}>Total</th><th>Status</th><th>Desc.</th><th></th></tr></thead>
                  <tbody>
                    {tabela.length===0?(<tr><td colSpan={9} style={{textAlign:'center',color:'var(--text-faint)'}}>Nenhuma venda no período</td></tr>)
                      :tabela.map(s=>(
                        <>
                          <tr key={s.id} style={{cursor:'pointer'}} onClick={()=>setDetalheId(detalheId===s.id?null:s.id)}>
                            <td>{new Date(s.sale_date+'T12:00:00').toLocaleDateString('pt-BR')}</td>
                            <td style={{fontWeight:500}}>{s.farmName}</td>
                            <td><span className="pill pill-gray" style={{textTransform:'capitalize'}}>{s.segment}</span></td>
                            <td>{(s.items||[]).length}</td>
                            <td style={{fontSize:12}}>{s.payment_term_label||'—'}</td>
                            <td style={{textAlign:'right',fontWeight:600,color:'var(--orange)'}}>R$ {fmt(s.total)}</td>
                            <td><span className={`pill ${s.status==='enviado'?'pill-green':'pill-amber'}`}>{s.status==='enviado'?'Enviado':'Pendente'}</span></td>
                            <td>{s.needs_approval?<span className="pill pill-red">Sim</span>:'—'}</td>
                            <td>{detalheId===s.id?<IconChevronUp size={14}/>:<IconChevronDown size={14}/>}</td>
                          </tr>
                          {detalheId===s.id&&(
                            <tr key={s.id+'_d'}>
                              <td colSpan={9} style={{background:'var(--surface-2)',padding:'12px 16px'}}>
                                <div style={{fontWeight:600,marginBottom:8,fontSize:12}}>Itens do pedido:</div>
                                {(s.items||[]).map((it,i)=>(
                                  <div key={i} style={{display:'flex',justifyContent:'space-between',fontSize:12,marginBottom:4,padding:'4px 0',borderBottom:'1px solid var(--line)'}}>
                                    <span>{it.productName||it.product_name} × {it.quantity}</span>
                                    <span>R$ {fmt(it.unitPrice||it.unit_price)} un · <strong>R$ {fmt(it.subtotal)}</strong></span>
                                  </div>
                                ))}
                                {s.notes&&<div style={{marginTop:8,fontSize:12,color:'var(--text-dim)'}}>Obs: {s.notes}</div>}
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
