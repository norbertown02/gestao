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
  const [tab,setTab] = useState('evolucao')
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
    const categoryNames=[...new Set(quarterData.flatMap(q=>[...q.categorias.keys()]))]
    const categoryGrowth=categoryNames.map(name=>({name,periodos:quarterData.map(q=>({trimestre:q.trimestre,valor:q.categorias.get(name)||0})),latest:quarterData.at(-1)?.categorias.get(name)||0})).sort((a,b)=>b.latest-a.latest)
    return {timeline,customerRows,one,recurring,risk,missing,unvalued,divergent,concentration,
      quarterData,comparison,categoryGrowth,mix:[...mix.entries()].map(([name,value])=>({name,value})).sort((a,b)=>b.value-a.value),
      sum:eligible.reduce((a,x)=>a+Number(x.allocated_order_value||0),0),
      oneRecent:one.filter(c=>c.days<=90).length,
      oneOlder:one.filter(c=>c.days>90).length}
  },[data,market,segment,reference])
  const segments=[...new Set(data.filter(x=>market==='Todos'||x.market===market).map(x=>x.segment).filter(Boolean))].sort()
  const tabs=[['evolucao','Evolução'],['carteira','Carteira'],['mix','Mix'],['recompra','Recompra']]
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
        <div role="tablist" style={{display:'flex',gap:8,marginTop:20,flexWrap:'wrap'}}>
          {tabs.map(([key,label])=><button key={key} role="tab" aria-selected={tab===key} onClick={()=>setTab(key)} style={{padding:'9px 18px',borderRadius:9,border:'1px solid var(--line)',background:tab===key?'var(--carbon)':'var(--surface)',color:tab===key?'white':'inherit',cursor:'pointer'}}>{label}</button>)}
        </div>
        {tab==='evolucao'&&<>
          <Section title="Vendas, média e mediana móveis (3 meses)" description="Média e mediana das vendas atribuídas em três meses; meses incompletos podem distorcer a leitura.">
            <div style={{height:320}}><ResponsiveContainer><ComposedChart data={analysis.timeline}><CartesianGrid strokeDasharray="3 3"/><XAxis dataKey="mes"/><YAxis tickFormatter={v=>(v/1000).toFixed(0)+'k'}/><Tooltip formatter={v=>currency(v)}/><Legend/><Bar dataKey="vendas" name="Vendas" fill={CHART.orange}/><Line type="monotone" dataKey="media" name="Média móvel" stroke={CHART.ink} strokeWidth={3}/><Line type="monotone" dataKey="mediana" name="Mediana móvel" stroke={CHART.blue} strokeWidth={3}/></ComposedChart></ResponsiveContainer></div>
          </Section>
          <Section title="Clientes e SKUs por trimestre" description="Abrangência comercial sem exigir que a fazenda compre todos os meses.">
            <div style={{height:300}}><ResponsiveContainer><BarChart data={analysis.quarterData}><CartesianGrid strokeDasharray="3 3"/><XAxis dataKey="trimestre"/><YAxis allowDecimals={false}/><Tooltip/><Legend/><Bar name="Clientes compradores" dataKey="clientes" fill={CHART.orange}/><Bar name="SKUs vendidos" dataKey="produtos" fill={CHART.orange}/></BarChart></ResponsiveContainer></div>
          </Section>
          <Section title="Crescimento entre trimestres" description="Comparativo de vendas atribuídas, clientes compradores e SKUs distintos. Variações de trimestre incompleto são apenas parciais.">
            <div style={{display:'grid',gridTemplateColumns:'repeat(auto-fit,minmax(245px,1fr))',gap:12}}>
              {analysis.comparison.map(q=><article key={q.periodo} style={{border:'1px solid var(--line)',borderRadius:12,padding:15,background:'var(--bg-soft)'}}>
                <div style={{display:'flex',justifyContent:'space-between',gap:8,alignItems:'center',marginBottom:12}}><strong>{q.periodo}</strong>{q.partial&&<small style={{color:'var(--amber)'}}>Parcial</small>}</div>
                {[['Faturamento',q.receita,q.prevReceita,true],['Clientes',q.clientes,q.prevClientes,false],['Mix (SKUs)',q.produtos,q.prevProdutos,false]].map(([label,now,prev,money])=><div key={label} style={{padding:'9px 0',borderTop:'1px solid var(--line)',display:'flex',justifyContent:'space-between',gap:10}}>
                  <div><small style={{display:'block',color:'var(--text-dim)'}}>{label}</small><strong>{money?currency(now):number(now)}</strong><small style={{display:'block',color:'var(--text-dim)'}}>Anterior: {money?currency(prev):number(prev)}</small></div>
                  <div style={{textAlign:'right',whiteSpace:'nowrap'}}><strong style={{color:'var(--text)'}}>{changeLabel(now,prev)}</strong><small style={{display:'block',color:'var(--text-dim)'}}>{deltaLabel(now,prev,money)}</small></div>
                </div>)}
              </article>)}
            </div>
          </Section>
        </>}
        {tab==='carteira'&&<Section title="Clientes por volume e profundidade de relacionamento" description="A quantidade de categorias refere-se ao histórico de produtos bovinos classificados; compra única não é sinônimo de cliente perdido.">
          <div style={{overflowX:'auto'}}><table style={{width:'100%',borderCollapse:'collapse'}}><thead><tr>{['Cliente','Pedidos','Produtos','Categorias','Vendas atribuídas','Última compra'].map(x=><th key={x} style={{textAlign:'left',padding:9}}>{x}</th>)}</tr></thead><tbody>{analysis.customerRows.map(c=><tr key={c.id} style={{borderTop:'1px solid #ddd'}}><td style={{padding:9}}>{c.name}</td><td>{c.ordersCount}</td><td>{c.skuCount}</td><td>{c.categoryCount}</td><td>{currency(c.total)}</td><td>{dateBR(c.last)}</td></tr>)}</tbody></table></div>
        </Section>}
        {tab==='mix'&&<Section title="Crescimento do mix por trimestre" description="Comparação de SKUs comercializados e faturamento de cada categoria, respeitando o mercado selecionado.">
          <div style={{overflowX:'auto'}}><table style={{width:'100%',borderCollapse:'collapse',minWidth:650}}>
            <thead><tr><th style={{textAlign:'left',padding:10}}>Período</th><th style={{textAlign:'right',padding:10}}>SKUs</th><th style={{textAlign:'right',padding:10}}>Variação SKUs</th><th style={{textAlign:'right',padding:10}}>Faturamento</th><th style={{textAlign:'right',padding:10}}>Variação</th></tr></thead>
            <tbody>{analysis.quarterData.map((q,i)=>{const prev=analysis.quarterData[i-1];return <tr key={q.trimestre} style={{borderTop:'1px solid var(--line)'}}><td style={{padding:10}}>{q.trimestre}</td><td style={{textAlign:'right'}}>{q.produtos}</td><td style={{textAlign:'right'}}>{prev?changeLabel(q.produtos,prev.produtos):'—'}</td><td style={{textAlign:'right'}}>{currency(q.valor)}</td><td style={{textAlign:'right'}}>{prev?changeLabel(q.valor,prev.valor):'—'}</td></tr>})}</tbody>
          </table></div>
          <h4 style={{marginTop:22,marginBottom:12}}>Categorias: participação e crescimento</h4>
          <div style={{overflowX:'auto'}}><table style={{width:'100%',borderCollapse:'collapse',minWidth:650}}><thead><tr><th style={{textAlign:'left',padding:10}}>Categoria</th>{analysis.quarterData.map(q=><th key={q.trimestre} style={{textAlign:'right',padding:10}}>{q.trimestre}</th>)}<th style={{textAlign:'right',padding:10}}>Última variação</th></tr></thead><tbody>{analysis.categoryGrowth.map(cat=>{const values=cat.periodos;const last=values.at(-1)?.valor||0,prev=values.at(-2)?.valor;return <tr key={cat.name} style={{borderTop:'1px solid var(--line)'}}><td style={{padding:10}}>{cat.name}</td>{values.map(v=><td key={v.trimestre} style={{textAlign:'right',padding:10}}>{currency(v.valor)}</td>)}<td style={{textAlign:'right',padding:10}}>{prev===undefined?'—':changeLabel(last,prev)}</td></tr>})}</tbody></table></div>
        </Section>}
        {tab==='mix'&&<Section title="Categorias comercializadas" description="Mix financeiro atribuído e oportunidades de ampliação da carteira.">
          <div style={{height:320}}><ResponsiveContainer><BarChart data={analysis.mix} layout="vertical"><CartesianGrid strokeDasharray="3 3"/><XAxis type="number" tickFormatter={v=>(v/1000).toFixed(0)+'k'}/><YAxis type="category" dataKey="name" width={105}/><Tooltip formatter={v=>currency(v)}/><Bar dataKey="value" name="Vendas atribuídas" fill={CHART.orange}/></BarChart></ResponsiveContainer></div>
        </Section>}
        {tab==='recompra'&&<Section title="Acompanhamento de recompra" description="O ciclo é calculado pela mediana dos intervalos observados. Uma compra não permite estimar ciclo; 90 dias são apenas uma janela de observação.">
          <div style={{overflowX:'auto'}}><table style={{width:'100%',borderCollapse:'collapse'}}><thead><tr>{['Cliente','Pedidos','Dias desde compra','Ciclo observado','Situação'].map(x=><th key={x} style={{textAlign:'left',padding:9}}>{x}</th>)}</tr></thead><tbody>{[...analysis.customerRows].sort((a,b)=>(a.situation==='Recompra a investigar'?-1:1)-(b.situation==='Recompra a investigar'?-1:1)||b.days-a.days).map(c=><tr key={c.id} style={{borderTop:'1px solid #ddd'}}><td style={{padding:9}}>{c.name}</td><td>{c.ordersCount}</td><td>{c.days}</td><td>{c.cycle===null?'Não determinado':Math.round(c.cycle)+' dias'}</td><td>{c.situation}</td></tr>)}</tbody></table></div>
        </Section>}
      </>}
    </div>
  </div>
}
