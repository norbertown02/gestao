import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { ResponsiveContainer, ComposedChart, BarChart, Bar, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend } from 'recharts'
import Topbar from '../components/Topbar'
import { supabaseAdmin } from '../lib/supabase'

const currency = n => Number(n || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL', maximumFractionDigits: 0 })
const number = n => Number(n || 0).toLocaleString('pt-BR')
const isoDate = value => value ? new Date(value + 'T12:00:00') : null
const dateBR = value => value ? isoDate(value).toLocaleDateString('pt-BR') : '—'
const median = values => {
  if (!values.length) return 0
  const ordered = [...values].sort((a,b) => a-b)
  const mid = Math.floor(ordered.length/2)
  return ordered.length % 2 ? ordered[mid] : (ordered[mid-1]+ordered[mid])/2
}
const dateDiff = (a,b) => Math.max(0,Math.round((a-b)/86400000))
const pct = (a,b) => b ? ((a-b)/b*100).toFixed(1)+'%' : '—'
const yearMonth = date => String(date || '').slice(0,7)
const quarterChange=(current,previous)=>previous===0?null:100*(current-previous)/previous
const changeLabel=(current,previous)=>{const rate=quarterChange(current,previous);return rate===null?'Sem base comparável':(rate>=0?'+':'')+rate.toFixed(1)+'%'}
const deltaLabel=(current,previous,asMoney=false)=>{const d=current-previous;return (d>=0?'+':'−')+(asMoney?currency(Math.abs(d)):number(Math.abs(d)))}
const CHART={orange:'#E87722',ink:'#171411',blue:'#426A8C',muted:'#A49B92'}
const MARKET_OPTIONS = ['Bovinos','Suínos','Multiespécie','Todos']

function Kpi({ label, value, note }) {
  return <article className="carteira-kpi" style={{minWidth:0}}><div className="carteira-kpi-top"><div><span>{label}</span><strong>{value}</strong></div></div><small>{note}</small></article>
}
function Section({title,children,description}) {
  return <section style={{background:'var(--surface)',border:'1px solid var(--line)',borderRadius:16,padding:22,marginTop:18,boxShadow:'var(--shadow-soft)'}}>
    <h3 style={{margin:'0 0 6px'}}>{title}</h3>{description&&<p style={{margin:'0 0 15px',opacity:.7,fontSize:13}}>{description}</p>}{children}
  </section>
}
export default function InteligenciaClientes() {
  const [market,setMarket] = useState('Bovinos')
  const [segment,setSegment] = useState('Todos')
  const [data,setData] = useState([])
  const [loading,setLoading] = useState(true)
  const [error,setError] = useState('')
  const [reference,setReference] = useState(() => new Date())
  useEffect(() => {
    let alive = true
    async function load(){
      setLoading(true);setError('')
      try {
        const result=[]
        for(let from=0;from<10000;from+=1000){
          const {data:page,error:e}=await supabaseAdmin.from('commercial_order_item_analysis')
            .select('sale_id,sale_date,status,farm_id,ultra_partner_id,customer_name,order_total,item_count,item_position,product_code,product_name,market,segment,category,subcategory,data_quality,allocated_order_value')
            .order('sale_date',{ascending:true}).order('sale_id',{ascending:true}).order('item_position',{ascending:true})
            .range(from,from+999)
          if(e) throw e
          result.push(...(page||[]))
          if(!page||page.length<1000) break
        }
        if(alive){setData(result);setReference(new Date())}
      }catch(e){if(alive)setError(e.message||'Não foi possível carregar a base comercial')}
      finally{if(alive)setLoading(false)}
    }
    load()
    return()=>{alive=false}
  },[])
  const analysis=useMemo(()=>{
    const today=reference
    const active = data.filter(x => !['cancelado','estornado'].includes(String(x.status||'').toLowerCase()))
    const orders = new Map()
    for(const row of active) if(!orders.has(row.sale_id)) orders.set(row.sale_id,row)
    const allQuality=[...orders.values()]
    const missing=allQuality.filter(x=>x.item_count===0).length
    const unvalued=allQuality.filter(x=>x.data_quality==='sem_valores').length
    const divergent=new Set(active.filter(x=>x.data_quality==='rateado_divergencia').map(x=>x.sale_id)).size
    const eligible=active.filter(x=>(market==='Todos'||x.market===market)&&
      (segment==='Todos'||x.segment===segment) && x.allocated_order_value!==null)
    const customers=new Map(),monthMap=new Map(),mix=new Map()
    for(const r of eligible){
      const customerId=r.ultra_partner_id!=null?'u:'+r.ultra_partner_id:'f:'+r.farm_id
      if(!customers.has(customerId)) customers.set(customerId,{id:customerId,name:r.customer_name,orders:new Map(),skus:new Set(),categories:new Set(),last:null})
      const c=customers.get(customerId),value=Number(r.allocated_order_value||0)
      c.orders.set(r.sale_id,{date:r.sale_date,value:(c.orders.get(r.sale_id)?.value||0)+value})
      if(r.product_code)c.skus.add(r.product_code)
      if(r.category)c.categories.add(r.category)
      c.last=!c.last||r.sale_date>c.last?r.sale_date:c.last
      const key=yearMonth(r.sale_date)
      if(!monthMap.has(key))monthMap.set(key,{mes:key,venda:0,clientes:new Set(),produtos:new Set()})
      const m=monthMap.get(key);m.venda+=value;m.clientes.add(customerId);if(r.product_code)m.produtos.add(r.product_code)
      const mixKey=r.category||'Sem categoria'
      mix.set(mixKey,(mix.get(mixKey)||0)+value)
    }
    const months=[...monthMap.values()].sort((a,b)=>a.mes.localeCompare(b.mes))
    const timeline=months.map((m,i)=>{
      const recent=months.slice(Math.max(0,i-2),i+1).map(x=>x.venda)
      return {mes:m.mes,vendas:m.venda,media:recent.reduce((a,b)=>a+b,0)/recent.length,mediana:median(recent),clientes:m.clientes.size,produtos:m.produtos.size}
    })
    const customerRows=[...customers.values()].map(c=>{
      const os=[...c.orders.values()].sort((a,b)=>a.date.localeCompare(b.date))
      const intervals=os.slice(1).map((o,i)=>dateDiff(isoDate(o.date),isoDate(os[i].date)))
      const days=dateDiff(today,isoDate(c.last))
      const cycle=intervals.length?median(intervals):null
      const expected=cycle===null?null:Math.max(30,cycle*1.3)
      return {...c,dates:os.map(o=>o.date),ordersCount:os.length,total:os.reduce((a,o)=>a+o.value,0),
        first:os[0]?.date,days,cycle,expected,
        situation:cycle===null?'Ciclo desconhecido':days>expected?'Recompra a investigar':'Dentro do ciclo',
        skuCount:c.skus.size,categoryCount:c.categories.size}
    }).sort((a,b)=>b.total-a.total)
    const one=customerRows.filter(c=>c.ordersCount===1)
    const recurring=customerRows.filter(c=>c.ordersCount>1)
    const risk=customerRows.filter(c=>c.situation==='Recompra a investigar')
    const concentration=customerRows.slice(0,5).reduce((a,c)=>a+c.total,0)/Math.max(1,customerRows.reduce((a,c)=>a+c.total,0))*100
    const quarters=new Map()
    for(const r of eligible){
      const [yr,month]=r.sale_date.split('-').map(Number)
      const k=yr+'-T'+(Math.floor((month-1)/3)+1)
      if(!quarters.has(k))quarters.set(k,{name:k,clientes:new Set(),skus:new Set(),categorias:new Map(),valor:0})
      const q=quarters.get(k);q.valor+=Number(r.allocated_order_value||0)
      q.clientes.add(r.ultra_partner_id!=null?'u:'+r.ultra_partner_id:'f:'+r.farm_id)
      if(r.product_code)q.skus.add(r.product_code)
      const cat=r.category||'Sem categoria';q.categorias.set(cat,(q.categorias.get(cat)||0)+Number(r.allocated_order_value||0))
    }
    const quarterData=[...quarters.values()].sort((a,b)=>a.name.localeCompare(b.name)).map(q=>({trimestre:q.name,clientes:q.clientes.size,produtos:q.skus.size,valor:q.valor,categorias:q.categorias}))
    const comparison=quarterData.slice(1).map((q,i)=>{const prev=quarterData[i];const quarterNumber=Number(q.trimestre.split('T')[1]);const currentQuarter=reference.getFullYear()+'-T'+(Math.floor(reference.getMonth()/3)+1);const partial=q.trimestre===currentQuarter&&((reference.getMonth()%3)!==2||reference.getDate()<new Date(reference.getFullYear(),reference.getMonth()+1,0).getDate());return {periodo:prev.trimestre+' → '+q.trimestre,trimestre:q.trimestre,partial,receita:q.valor,clientes:q.clientes,produtos:q.produtos,prevReceita:prev.valor,prevClientes:prev.clientes,prevProdutos:prev.produtos,receitaPct:quarterChange(q.valor,prev.valor),clientesPct:quarterChange(q.clientes,prev.clientes),mixPct:quarterChange(q.produtos,prev.produtos)}})
    const customerDistribution=[
      {grupo:'1 pedido',clientes:customerRows.filter(c=>c.ordersCount===1).length},
      {grupo:'2 pedidos',clientes:customerRows.filter(c=>c.ordersCount===2).length},
      {grupo:'3–4 pedidos',clientes:customerRows.filter(c=>c.ordersCount>=3&&c.ordersCount<=4).length},
      {grupo:'5+ pedidos',clientes:customerRows.filter(c=>c.ordersCount>=5).length}
    ]
    const reorderDistribution=[
      {grupo:'1 pedido · até 90d',clientes:one.filter(c=>c.days<=90).length},
      {grupo:'1 pedido · >90d',clientes:one.filter(c=>c.days>90).length},
      {grupo:'Recompra a avaliar',clientes:risk.length},
      {grupo:'Dentro do ciclo',clientes:recurring.filter(c=>c.situation==='Dentro do ciclo').length}
    ]
    const categoryNames=[...new Set(quarterData.flatMap(q=>[...q.categorias.keys()]))]
    const categoryGrowth=categoryNames.map(name=>({name,periodos:quarterData.map(q=>({trimestre:q.trimestre,valor:q.categorias.get(name)||0})),latest:quarterData.at(-1)?.categorias.get(name)||0})).sort((a,b)=>b.latest-a.latest)
    return {timeline,customerRows,one,recurring,risk,missing,unvalued,divergent,concentration,
      quarterData,comparison,categoryGrowth,customerDistribution,reorderDistribution,mix:[...mix.entries()].map(([name,value])=>({name,value})).sort((a,b)=>b.value-a.value),
      sum:eligible.reduce((a,x)=>a+Number(x.allocated_order_value||0),0),
      oneRecent:one.filter(c=>c.days<=90).length,
      oneOlder:one.filter(c=>c.days>90).length}
  },[data,market,segment,reference])
  const segments=[...new Set(data.filter(x=>market==='Todos'||x.market===market).map(x=>x.segment).filter(Boolean))].sort()
  return <div style={{paddingBottom:36}}>
    <Topbar title="Inteligência de Clientes" subtitle="Evolução, concentração, mix e recompra por data do pedido" />
    <div style={{padding:'22px 34px 48px',maxWidth:1440,margin:'0 auto',width:'100%'}}>
      <div style={{display:'flex',gap:10,flexWrap:'wrap',alignItems:'center',marginBottom:14}}>
        <label>Mercado <select value={market} onChange={e=>{setMarket(e.target.value);setSegment('Todos')}}>{MARKET_OPTIONS.map(v=><option key={v}>{v}</option>)}</select></label>
        <label>Segmento <select value={segment} onChange={e=>setSegment(e.target.value)}><option>Todos</option>{segments.map(s=><option key={s}>{s}</option>)}</select></label>
        <Link to="/carteira" style={{marginLeft:'auto'}}>Ver carteira operacional →</Link>
      </div>
      {loading&&<p>Carregando dados comerciais...</p>}
      {error&&<Section title="Erro ao consultar os dados"><p>{error}</p><p>A carteira operacional permanece disponível.</p></Section>}
      {!loading&&!error&&<>
        <div style={{display:'grid',gridTemplateColumns:'repeat(auto-fit,minmax(180px,1fr))',gap:12}}>
          <Kpi label="Vendas atribuídas" value={currency(analysis.sum)} note="Somente itens classificáveis"/>
          <Kpi label="Clientes compradores" value={number(analysis.customerRows.length)} note="No histórico disponível"/>
          <Kpi label="Compra única" value={number(analysis.one.length)} note={analysis.oneRecent+' até 90d · '+analysis.oneOlder+' acima de 90d'}/>
          <Kpi label="Concentração top 5" value={analysis.concentration.toFixed(1)+'%'} note="Dos valores atribuídos"/>
        </div>
        {(analysis.missing||analysis.divergent||analysis.unvalued)>0&&<p role="status" style={{padding:12,borderRadius:8,background:'var(--orange-bg)',border:'1px solid var(--line)',color:'var(--text)',marginTop:14}}>
          Qualidade da base: {analysis.missing} pedidos sem itens, {analysis.unvalued} sem valores de itens e {analysis.divergent} com divergências e rateio. Não use estes indicadores como conciliação fiscal.
        </p>}
        <div style={{display:'grid',gridTemplateColumns:'repeat(auto-fit,minmax(400px,1fr))',gap:16}}>
          <Section title="Vendas, média e mediana — 3 meses" description="Evolução pela data do pedido; média e mediana móveis suavizam as compras concentradas.">
            <div style={{height:310}}><ResponsiveContainer><ComposedChart data={analysis.timeline}><CartesianGrid strokeDasharray="3 3" stroke="var(--line)"/><XAxis dataKey="mes"/><YAxis tickFormatter={v=>(v/1000).toFixed(0)+'k'}/><Tooltip formatter={v=>currency(v)}/><Legend/><Bar dataKey="vendas" name="Vendas" fill={CHART.orange} radius={[4,4,0,0]}/><Line type="monotone" dataKey="media" name="Média" stroke={CHART.ink} strokeWidth={2.5} dot={false}/><Line type="monotone" dataKey="mediana" name="Mediana" stroke={CHART.blue} strokeWidth={2.5} dot={false}/></ComposedChart></ResponsiveContainer></div>
          </Section>
          <Section title="Clientes e mix comercial por trimestre" description="Clientes únicos compradores e produtos distintos no período.">
            <div style={{height:310}}><ResponsiveContainer><BarChart data={analysis.quarterData}><CartesianGrid strokeDasharray="3 3" stroke="var(--line)"/><XAxis dataKey="trimestre"/><YAxis allowDecimals={false}/><Tooltip/><Legend/><Bar name="Clientes compradores" dataKey="clientes" fill={CHART.ink} radius={[4,4,0,0]}/><Bar name="Produtos (SKUs)" dataKey="produtos" fill={CHART.orange} radius={[4,4,0,0]}/></BarChart></ResponsiveContainer></div>
          </Section>
        </div>
        <Section title="Comparativo de crescimento entre trimestres" description="Variação em valor absoluto e percentual. O trimestre em andamento não é comparável a um trimestre completo.">
          <div style={{overflowX:'auto'}}><table style={{width:'100%',borderCollapse:'collapse',minWidth:750}}>
            <thead><tr>{['Período','Faturamento','Variação','Clientes','Variação','Mix (SKUs)','Variação'].map((v,i)=><th key={i} style={{textAlign:i===0?'left':'right',padding:12,color:'var(--text-dim)',fontSize:12}}>{v}</th>)}</tr></thead>
            <tbody>{analysis.quarterData.map((q,i)=>{const prior=analysis.quarterData[i-1];const last=q.trimestre===reference.getFullYear()+'-T'+(Math.floor(reference.getMonth()/3)+1);return <tr key={q.trimestre} style={{borderTop:'1px solid var(--line)'}}><td style={{padding:12,fontWeight:700}}>{q.trimestre}{last?' · parcial':''}</td><td style={{textAlign:'right',padding:12}}>{currency(q.valor)}</td><td style={{textAlign:'right',padding:12}}>{prior?changeLabel(q.valor,prior.valor):'—'}</td><td style={{textAlign:'right',padding:12}}>{q.clientes}</td><td style={{textAlign:'right',padding:12}}>{prior?changeLabel(q.clientes,prior.clientes):'—'}</td><td style={{textAlign:'right',padding:12}}>{q.produtos}</td><td style={{textAlign:'right',padding:12}}>{prior?changeLabel(q.produtos,prior.produtos):'—'}</td></tr>})}</tbody>
          </table></div>
        </Section>
        <div style={{display:'grid',gridTemplateColumns:'repeat(auto-fit,minmax(340px,1fr))',gap:16}}>
          <Section title="Mix de produtos — categorias" description="Distribuição do faturamento atribuído por categoria.">
            <div style={{height:290}}><ResponsiveContainer><BarChart data={analysis.mix} layout="vertical" margin={{left:4,right:10}}><CartesianGrid strokeDasharray="3 3" stroke="var(--line)"/><XAxis type="number" tickFormatter={v=>(v/1000).toFixed(0)+'k'}/><YAxis type="category" dataKey="name" width={105}/><Tooltip formatter={v=>currency(v)}/><Bar dataKey="value" name="Faturamento" fill={CHART.orange} radius={[0,4,4,0]}/></BarChart></ResponsiveContainer></div>
          </Section>
          <Section title="Perfil de frequência dos clientes" description="Distribuição agregada por número de pedidos bovinos no histórico.">
            <div style={{height:290}}><ResponsiveContainer><BarChart data={analysis.customerDistribution}><CartesianGrid strokeDasharray="3 3" stroke="var(--line)"/><XAxis dataKey="grupo"/><YAxis allowDecimals={false}/><Tooltip/><Bar dataKey="clientes" name="Clientes" fill={CHART.ink} radius={[5,5,0,0]}/></BarChart></ResponsiveContainer></div>
          </Section>
        </div>
        <div style={{display:'grid',gridTemplateColumns:'repeat(auto-fit,minmax(340px,1fr))',gap:16}}>
          <Section title="Recompra — visão da carteira" description="Indicadores agregados; um único pedido não estabelece o ciclo de reposição.">
            <div style={{height:290}}><ResponsiveContainer><BarChart data={analysis.reorderDistribution} layout="vertical"><CartesianGrid strokeDasharray="3 3" stroke="var(--line)"/><XAxis type="number" allowDecimals={false}/><YAxis type="category" dataKey="grupo" width={155} tick={{fontSize:11}}/><Tooltip/><Bar dataKey="clientes" name="Clientes" fill={CHART.orange} radius={[0,5,5,0]}/></BarChart></ResponsiveContainer></div>
          </Section>
          <Section title="Mix — evolução das categorias por trimestre" description="Receita atribuída por categoria. A variação mais recente pode envolver trimestre parcial.">
            <div style={{overflowX:'auto'}}><table style={{width:'100%',borderCollapse:'collapse',minWidth:390}}><thead><tr><th style={{textAlign:'left',padding:9}}>Categoria</th>{analysis.quarterData.map(q=><th key={q.trimestre} style={{textAlign:'right',padding:9}}>{q.trimestre}</th>)}</tr></thead><tbody>{analysis.categoryGrowth.map(cat=><tr key={cat.name} style={{borderTop:'1px solid var(--line)'}}><td style={{padding:9}}>{cat.name}</td>{cat.periodos.map(v=><td key={v.trimestre} style={{textAlign:'right',padding:9}}>{currency(v.valor)}</td>)}</tr>)}</tbody></table></div>
          </Section>
        </div>
      </>}
    </div>
  </div>
}
