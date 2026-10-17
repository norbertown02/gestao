import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { ResponsiveContainer, ComposedChart, BarChart, Bar, Line, XAxis, YAxis, CartesianGrid, Tooltip } from 'recharts'
import { IconChartBar, IconChevronDown, IconRotateClockwise, IconTrendingUp, IconUsers, IconPackage, IconAlertCircle, IconArrowUpRight, IconArrowDownRight, IconArrowRight } from '@tabler/icons-react'
import './InteligenciaClientes.css'
import Topbar from '../components/Topbar'
import { supabaseAdmin } from '../lib/supabase'

const currency = n => Number(n || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL', maximumFractionDigits: 0 })
const number = n => Number(n || 0).toLocaleString('pt-BR')
const formatDays = n => n === null || n === undefined ? '—' : Number(n).toLocaleString('pt-BR',{maximumFractionDigits:1})+' dias'
const isoDate = value => value ? new Date(value + 'T12:00:00') : null
const median = values => {
  if (!values.length) return 0
  const ordered = [...values].sort((a,b) => a-b)
  const mid = Math.floor(ordered.length/2)
  return ordered.length % 2 ? ordered[mid] : (ordered[mid-1]+ordered[mid])/2
}
const dateDiff = (a,b) => Math.max(0,Math.round((a-b)/86400000))
const yearMonth = date => String(date || '').slice(0,7)
const monthLabel = key => {const [y,m] = String(key||'').split('-').map(Number);return y&&m ? new Intl.DateTimeFormat('pt-BR',{month:'short',year:'2-digit'}).format(new Date(y,m-1,1)).replace('.','') : key}
const ONE_DAY = 86400000
const toISO = d => d.toISOString().slice(0,10)
const dateForUTC = (year,month,day=1) => new Date(Date.UTC(year,month,day))
const clientKey = row => row.ultra_partner_id != null ? 'u:' + row.ultra_partner_id : 'f:' + row.farm_id
function summarizeItems(rows) {
  const buyers = new Set(),products = new Set(),categories = new Map()
  let amount = 0
  for (const row of rows) {
    amount += Number(row.allocated_order_value || 0)
    buyers.add(clientKey(row))
    if (row.product_code) products.add(row.product_code)
    const name = row.category || 'Sem categoria'
    categories.set(name,(categories.get(name)||0)+Number(row.allocated_order_value||0))
  }
  return {valor:amount,clientes:buyers.size,produtos:products.size,categorias:categories}
}
const quarterChange=(current,previous)=>previous===0?null:100*(current-previous)/previous
const changeLabel=(current,previous)=>{const rate=quarterChange(current,previous);return rate===null?'Sem base comparável':(rate>=0?'+':'')+rate.toFixed(1)+'%'}
const CHART={orange:'#E87722',ink:'#171411',blue:'#426A8C',muted:'#A49B92'}
const MARKET_OPTIONS = ['Bovinos','Suínos','Multiespécie','Todos']

function Kpi({label,value,note,Icon}) {
  return <article className="ci-kpi">
    <div className="ci-kpi-head">
      <span className="ci-kpi-title">{label}</span>
      <span className="ci-kpi-icon"><Icon size={17} stroke={1.8}/></span>
    </div>
    <div>
      <strong className="ci-kpi-number">{value}</strong>
      <p className="ci-kpi-note">{note}</p>
    </div>
  </article>
}
function Panel({eyebrow,title,note,side,children,footer,className=''}) {
  return <section className={'ci-card '+className}>
    <div className="ci-card-head">
      <div><div className="ci-card-kicker">{eyebrow}</div><h3 className="ci-card-title">{title}</h3>
        {note&&<p className="ci-card-desc">{note}</p>}
      </div>
      {side&&<span className="ci-card-side">{side}</span>}
    </div>
    <div className="ci-card-body">{children}</div>
    {footer&&<div className="ci-card-footer">{footer}</div>}
  </section>
}
function HoverTooltip({active,payload,label,formatValue}) {
  if(!active||!payload?.length)return null
  return <div className="ci-tooltip">
    <div className="ci-tooltip-label">{label}</div>
    {payload.filter(p=>p.value!=null).map((p,i)=><div className="ci-tooltip-item" key={i}>
      <span>{p.name}</span><strong>{formatValue?formatValue(p.value,p):number(p.value)}</strong>
    </div>)}
  </div>
}
function LegendStrip({items}) {
  return <div className="ci-legend">{items.map(x=><span className="ci-legend-item" key={x.name}>
    <span className="ci-legend-mark" style={{background:x.color}}/>{x.name}
  </span>)}</div>
}
function Delta({current,previous}) {
  const ratio=quarterChange(current,previous)
  if(ratio===null)return <span className="ci-delta flat">—</span>
  const positive=ratio>0,negative=ratio<0,Icon=positive?IconArrowUpRight:negative?IconArrowDownRight:null
  return <span className={'ci-delta '+(positive?'up':negative?'down':'flat')}>{Icon&&<Icon size={13}/>}
    {changeLabel(current,previous)}</span>
}
const axis={fontSize:11,fill:'#8A8177',fontFamily:'Archivo, sans-serif'}
const gridProps={stroke:'#EEE7DF',strokeDasharray:'3 5',vertical:false}
export default function InteligenciaClientes() {
  const [market,setMarket] = useState('Bovinos')
  const [year,setYear] = useState(String(new Date().getFullYear()))
  const [segment,setSegment] = useState('Todos')
  const [showTrends,setShowTrends] = useState(false)
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
    const todayISO=toISO(dateForUTC(reference.getFullYear(),reference.getMonth(),reference.getDate()))
    const eligible=active.filter(x=>x.sale_date && x.sale_date<=todayISO && (year==='Todos'||x.sale_date.startsWith(year))&&
      (market==='Todos'||x.market===market)&&
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
    const currentQNumber=Math.floor(reference.getMonth()/3)+1
    const currentQuarter=reference.getFullYear()+'-T'+currentQNumber
    if (year!=='Todos') {
      const selectedYear=Number(year)
      if (Number.isInteger(selectedYear)) {
        const lastQ=selectedYear===reference.getFullYear()?currentQNumber:4
        for(let q=1;q<=lastQ;q++){
          const key=selectedYear+'-T'+q
          if(!quarters.has(key))quarters.set(key,{name:key,clientes:new Set(),skus:new Set(),categorias:new Map(),valor:0})
        }
      }
    } else if (eligible.length) {
      const firstQuarter=[...quarters.keys()].sort()[0]
      const startYear=Number(firstQuarter.slice(0,4))
      const startQ=Number(firstQuarter.slice(-1))
      for(let y=startYear;y<=reference.getFullYear();y++){
        const begin=y===startYear?startQ:1
        const end=y===reference.getFullYear()?currentQNumber:4
        for(let q=begin;q<=end;q++){
          const key=y+'-T'+q
          if(!quarters.has(key))quarters.set(key,{name:key,clientes:new Set(),skus:new Set(),categorias:new Map(),valor:0})
        }
      }
    }
    const quarterData=[...quarters.values()].sort((a,b)=>a.name.localeCompare(b.name))
      .map(q=>({trimestre:q.name,clientes:q.clientes.size,produtos:q.skus.size,valor:q.valor,categorias:q.categorias}))
    const quarterComparison=quarterData.map((q,i)=>{
      const previous=quarterData[i-1]||null
      if(!previous)return {...q,compared:null,shown:q,isQtd:false,windowText:''}
      const isQtd=q.trimestre===currentQuarter
      if(!isQtd)return {...q,compared:previous,shown:q,isQtd:false,windowText:''}
      // QTD: same number of calendar days elapsed in current and previous quarters.
      const currentStart=dateForUTC(reference.getFullYear(),(currentQNumber-1)*3)
      const precedingStart=dateForUTC(reference.getFullYear(),(currentQNumber-2)*3)
      const precedingEnd=dateForUTC(reference.getFullYear(),(currentQNumber-1)*3)
      const daysElapsed=Math.floor((dateForUTC(reference.getFullYear(),reference.getMonth(),reference.getDate())-currentStart)/ONE_DAY)+1
      const comparisonDays=Math.min(daysElapsed,Math.round((precedingEnd-precedingStart)/ONE_DAY))
      const currentLimit=toISO(new Date(currentStart.getTime()+(comparisonDays-1)*ONE_DAY))
      const priorLimit=toISO(new Date(precedingStart.getTime()+(comparisonDays-1)*ONE_DAY))
      const shown=summarizeItems(eligible.filter(r=>r.sale_date>=toISO(currentStart)&&r.sale_date<=currentLimit))
      const compared=summarizeItems(eligible.filter(r=>r.sale_date>=toISO(precedingStart)&&r.sale_date<=priorLimit))
      return {...q,shown,compared,isQtd:true,
        windowText:'1º a '+currentLimit.slice(8,10)+'/'+currentLimit.slice(5,7)+' vs. 1º a '+priorLimit.slice(8,10)+'/'+priorLimit.slice(5,7),
        comparisonDays,previousQuarter:previous.trimestre}
    })
    const funnelStages=Array.from({length:5},(_,i)=>{
      const reached=customerRows.filter(c=>c.ordersCount>=i+1)
      const previousReached=i===0?reached.length:customerRows.filter(c=>c.ordersCount>=i).length
      const gaps=i===0?[]:reached.map(c=>dateDiff(isoDate(c.dates[i]),isoDate(c.dates[i-1])))
      return {stage:i+1,label:i===4?'5ª compra ou mais':(i+1)+'ª compra',clients:reached.length,
        share:customerRows.length?100*reached.length/customerRows.length:0,
        stepRate:i===0?100:previousReached?100*reached.length/previousReached:0,
        avgDays:gaps.length?gaps.reduce((a,b)=>a+b,0)/gaps.length:null}
    })
    const allRepeatGaps=customerRows.flatMap(c=>c.dates.slice(1).map((date,i)=>dateDiff(isoDate(date),isoDate(c.dates[i]))))
    const overallAvgReorderDays=allRepeatGaps.length?allRepeatGaps.reduce((a,b)=>a+b,0)/allRepeatGaps.length:null
    const reorderDistribution=[
      {grupo:'1 pedido · até 90d',clientes:one.filter(c=>c.days<=90).length},
      {grupo:'1 pedido · >90d',clientes:one.filter(c=>c.days>90).length},
      {grupo:'Recompra a avaliar',clientes:risk.length},
      {grupo:'Dentro do ciclo',clientes:recurring.filter(c=>c.situation==='Dentro do ciclo').length}
    ]
    const categoryNames=[...new Set(quarterData.flatMap(q=>[...q.categorias.keys()]))]
    const categoryGrowth=categoryNames.map(name=>({
      name,
      periodos:quarterComparison.map(q=>({trimestre:q.trimestre,valor:q.shown.categorias.get(name)||0})),
      latest:quarterComparison.at(-1)?.shown.categorias.get(name)||0,
      previous:quarterComparison.at(-1)?.compared?.categorias.get(name)||0
    })).sort((a,b)=>b.latest-a.latest)
    return {timeline,customerRows,one,recurring,risk,missing,unvalued,divergent,concentration,
      quarterData,quarterComparison,categoryGrowth,funnelStages,overallAvgReorderDays,
      reorderDistribution,mix:[...mix.entries()].map(([name,value])=>({name,value})).sort((a,b)=>b.value-a.value),
      sum:eligible.reduce((a,x)=>a+Number(x.allocated_order_value||0),0),
      oneRecent:one.filter(c=>c.days<=90).length,
      oneOlder:one.filter(c=>c.days>90).length}
  },[data,market,segment,year,reference])

  const segments=[...new Set(data.filter(x=>market==='Todos'||x.market===market).map(x=>x.segment).filter(Boolean))].sort()
  const years=[...new Set(data.map(r=>r.sale_date?.slice(0,4)).filter(Boolean))].sort((a,b)=>b.localeCompare(a))
  const reset=()=>{setMarket('Bovinos');setSegment('Todos');setYear(String(new Date().getFullYear()))}
  const changed=market!=='Bovinos'||segment!=='Todos'||year!==String(new Date().getFullYear())
  const firstMonth=analysis.timeline[0]?.mes
  const lastMonth=analysis.timeline.at(-1)?.mes
  const latestComparison=analysis.quarterComparison.at(-1)
  const latestShown=latestComparison?.shown
  const latestPrior=latestComparison?.compared
  const repeatRate=analysis.customerRows.length ? 100*analysis.recurring.length/analysis.customerRows.length : 0
  const mixTop=analysis.mix.length>5
    ? [...analysis.mix.slice(0,5),{name:'Outras categorias',value:analysis.mix.slice(5).reduce((sum,c)=>sum+c.value,0)}]
    : analysis.mix
  const mainCategory=analysis.mix[0]
  const categoryShare=mainCategory&&analysis.sum?mainCategory.value/analysis.sum*100:0
  const hasQualityIssues=analysis.missing+analysis.unvalued+analysis.divergent>0
  return <div>
    <Topbar title="Inteligência de Clientes" subtitle="Resultados, crescimento e comportamento de compra"/>
    <main className="ci-page ci-simple">
      <div className="ci-overview">
        <div>
          <div className="ci-eyebrow">Nutrialle · Inteligência Comercial</div>
          <h1>Como estão nossas vendas?</h1>
          <p className="ci-lead">Uma visão direta do desempenho comercial. Selecione o mercado e acompanhe os indicadores na ordem abaixo.</p>
        </div>
        <div className="ci-date-pill">{firstMonth?monthLabel(firstMonth):'—'} — {lastMonth?monthLabel(lastMonth):'—'}</div>
      </div>
      <div className="ci-filters" aria-label="Filtros do relatório">
        <div className="ci-filter-group ci-market-group">
          <span className="ci-filter-label">Mercado</span>
          <div className="ci-market-toggle" role="group" aria-label="Selecionar mercado">
            {MARKET_OPTIONS.map(item=><button key={item} type="button" className="ci-market-btn"
              aria-pressed={market===item} onClick={()=>{setMarket(item);setSegment('Todos')}}>{item}</button>)}
          </div>
        </div>
        <label className="ci-filter-group ci-select-group">
          <span className="ci-filter-label">Segmento</span>
          <span className="ci-select-wrap">
            <select value={segment} onChange={e=>setSegment(e.target.value)}>
              <option value="Todos">Todos os segmentos</option>
              {segments.map(v=><option key={v} value={v}>{v}</option>)}
            </select><IconChevronDown className="ci-select-chevron" size={15}/>
          </span>
        </label>
        <label className="ci-filter-group ci-select-group" style={{flex:'0 0 120px',minWidth:105}}>
          <span className="ci-filter-label">Ano</span>
          <span className="ci-select-wrap">
            <select value={year} onChange={e=>setYear(e.target.value)}>
              <option value="Todos">Todos</option>
              {years.map(y=><option value={y} key={y}>{y}</option>)}
            </select><IconChevronDown className="ci-select-chevron" size={15}/>
          </span>
        </label>
        <div className="ci-filter-tools">
          {changed&&<button type="button" className="ci-reset" onClick={reset}><IconRotateClockwise size={15}/> Limpar filtros</button>}
          <span className="ci-live"><span className="ci-live-dot"/> Por data do pedido</span>
        </div>
      </div>

      {loading&&<div className="ci-loading">Carregando o relatório comercial…</div>}
      {error&&<div className="ci-quality" role="alert"><IconAlertCircle size={17}/><span>{error}. A carteira operacional continua disponível.</span></div>}
      {!loading&&!error&&<>
        {analysis.customerRows.length===0 ?
          <section className="ci-no-results"><IconChartBar size={27}/><h3>Não há vendas com produtos identificados para estes filtros.</h3>
            <p>Escolha outro mercado, segmento ou ano para visualizar o relatório.</p></section>:
        <>
          <div className="ci-kpis">
            <Kpi label="Vendas analisadas" value={currency(analysis.sum)} note="Pedidos com valores atribuídos aos produtos" Icon={IconChartBar}/>
            <Kpi label="Clientes compradores" value={number(analysis.customerRows.length)} note="Clientes diferentes que fizeram pedidos" Icon={IconUsers}/>
            <Kpi label="Clientes que recompraram" value={repeatRate.toLocaleString('pt-BR',{maximumFractionDigits:1})+'%'} note={number(analysis.recurring.length)+' clientes com 2 ou mais compras' } Icon={IconTrendingUp}/>
            <Kpi label="Produtos vendidos" value={number(new Set(analysis.customerRows.flatMap(c=>[...c.skus])).size)} note="Produtos diferentes na seleção" Icon={IconPackage}/>
          </div>

          <div className="ci-reading-note">
            <span className="ci-reading-title">Em poucas palavras</span>
            <p>De <strong>{number(analysis.customerRows.length)} clientes</strong>, <strong>{number(analysis.recurring.length)}</strong> fizeram pelo menos uma nova compra.
            {mainCategory&&<> A categoria <strong>{mainCategory.name}</strong> representa <strong>{categoryShare.toLocaleString('pt-BR',{maximumFractionDigits:1})}%</strong> das vendas analisadas.</>}</p>
          </div>

          <div className="ci-grid">
            <Panel eyebrow="Vendas" title="Como as vendas evoluíram?" note="Total vendido em cada mês." side="POR MÊS"
              footer="Os valores são gerenciais e seguem a data do pedido, não a data do faturamento.">
              <div className="ci-chart-toolbar"><button type="button" className="ci-tiny-toggle" aria-pressed={showTrends} onClick={()=>setShowTrends(v=>!v)}>
                {showTrends?'Ocultar tendências':'Ver média e mediana'}
              </button></div>
              <div className="ci-card-chart"><ResponsiveContainer width="100%" height="100%">
                <ComposedChart data={analysis.timeline} margin={{top:12,right:8,left:0,bottom:4}}>
                  <CartesianGrid {...gridProps}/><XAxis dataKey="mes" tickFormatter={monthLabel} tick={axis} axisLine={false} tickLine={false} tickMargin={11}/>
                  <YAxis tick={axis} axisLine={false} tickLine={false} tickFormatter={v=>(v/1000).toFixed(0)+' mil'} width={60}/>
                  <Tooltip labelFormatter={monthLabel} content={<HoverTooltip formatValue={v=>currency(v)}/>}/>
                  <Bar dataKey="vendas" name="Vendas do mês" fill={CHART.orange} maxBarSize={36} radius={[5,5,0,0]}/>
                  {showTrends&&<Line type="monotone" dataKey="media" name="Média dos últimos 3 meses" stroke={CHART.ink} strokeWidth={2.5} dot={false} activeDot={{r:4}}/>}
                  {showTrends&&<Line type="monotone" dataKey="mediana" name="Mediana dos últimos 3 meses" stroke={CHART.blue} strokeWidth={2.5} dot={false} activeDot={{r:4}}/>}
                </ComposedChart>
              </ResponsiveContainer></div>
              {showTrends&&<LegendStrip items={[{name:'Vendas',color:CHART.orange},{name:'Média móvel',color:CHART.ink},{name:'Mediana móvel',color:CHART.blue}]}/>}
            </Panel>

            <Panel eyebrow="Portfólio" title="Quais categorias mais vendem?" note="Distribuição do valor vendido por linha de produto." side="PARTICIPAÇÃO">
              <div className="ci-card-chart"><ResponsiveContainer width="100%" height="100%">
                <BarChart data={mixTop} layout="vertical" margin={{top:11,right:15,left:5,bottom:4}}>
                  <CartesianGrid {...gridProps}/><XAxis type="number" tick={axis} axisLine={false} tickLine={false} tickFormatter={v=>(v/1000).toFixed(0)+' mil'}/>
                  <YAxis type="category" dataKey="name" width={116} tick={{...axis,fontSize:10}} axisLine={false} tickLine={false}/>
                  <Tooltip content={<HoverTooltip formatValue={v=>currency(v)}/>}/>
                  <Bar name="Vendas" dataKey="value" fill={CHART.orange} maxBarSize={27} radius={[0,5,5,0]}/>
                </BarChart>
              </ResponsiveContainer></div>
              <p className="ci-mini-explain">Até 5 categorias em destaque. As demais aparecem somadas em “Outras categorias”.</p>
            </Panel>

            <Panel eyebrow="Crescimento" title="Estamos crescendo em relação ao trimestre anterior?" className="ci-card-wide"
              note={latestComparison?.isQtd?'Comparação justa: somente os mesmos dias de cada trimestre.':'Comparação entre os últimos dois trimestres disponíveis.'}
              side={latestComparison?.trimestre}>
              {!latestPrior?<div className="ci-empty">Ainda não há dois trimestres disponíveis para calcular a variação.</div>:
              <>
                <div className="ci-comparison-caption">
                  {latestComparison.isQtd
                    ? <><strong>Trimestre em andamento</strong> · {latestComparison.windowText} (mesmo número de dias)</>
                    : <><strong>{latestComparison.trimestre}</strong> em relação a <strong>{analysis.quarterComparison.at(-2)?.trimestre}</strong> · períodos completos</>}
                </div>
                <div className="ci-growth-grid">
                  {[
                    {name:'Vendas',now:latestShown.valor,prev:latestPrior.valor,money:true},
                    {name:'Clientes',now:latestShown.clientes,prev:latestPrior.clientes,money:false},
                    {name:'Produtos diferentes',now:latestShown.produtos,prev:latestPrior.produtos,money:false}
                  ].map(item=><div className="ci-growth-tile" key={item.name}>
                    <div className="ci-growth-label">{item.name}</div>
                    <strong>{item.money?currency(item.now):number(item.now)}</strong>
                    <div className="ci-growth-foot">
                      <Delta current={item.now} previous={item.prev}/>
                      <span>antes: {item.money?currency(item.prev):number(item.prev)}</span>
                    </div>
                  </div>)}
                </div>
                <p className="ci-mini-explain ci-growth-explain">{latestComparison.isQtd
                  ?'O restante do trimestre ainda não aconteceu; por isso, usamos um intervalo equivalente.'
                  :'Uma variação negativa significa queda real em relação ao trimestre anterior.'}</p>
              </>}
            </Panel>

            <Panel eyebrow="Recompra" title="Quantos clientes voltam a comprar?" side="JORNADA DE COMPRA" className="ci-card-wide"
              note="Cada faixa representa clientes que chegaram àquela compra ou a uma posterior.">
              <div className="ci-funnel-layout ci-funnel-compact">
                <div className="ci-funnel-graphic" role="img" aria-label={analysis.funnelStages.map(f=>f.label+': '+f.clients+' clientes, '+f.share.toFixed(1)+' por cento').join('; ')}>
                  {analysis.funnelStages.map(stage=><div key={stage.stage} className={'ci-funnel-segment ci-funnel-segment-'+stage.stage}
                    style={{width:Math.max(44,Math.round(stage.clients/analysis.funnelStages[0].clients*100))+'%'}}>
                    <span className="ci-funnel-stage-label">{stage.label}</span>
                    <strong className="ci-funnel-stage-value">{number(stage.clients)} <span>clientes</span></strong>
                    <small>{stage.share.toLocaleString('pt-BR',{maximumFractionDigits:1})}% da base</small>
                  </div>)}
                </div>
                <div className="ci-funnel-content">
                  <div className="ci-funnel-summary">
                    <div><span>Voltaram a comprar</span><strong>{repeatRate.toLocaleString('pt-BR',{maximumFractionDigits:1})}%</strong>
                      <small>Chegaram a pelo menos 2 pedidos</small></div>
                    <div><span>Tempo médio de recompra</span><strong>{formatDays(analysis.overallAvgReorderDays)}</strong>
                      <small>Intervalo entre pedidos realizados</small></div>
                  </div>
                  <p className="ci-simple-description">O funil diminui a cada etapa porque nem todos os clientes já fizeram tantas compras. Isso não significa, por si só, perda de clientes.</p>
                  <details className="ci-inline-details">
                    <summary>Ver conversão e prazo em cada etapa <IconChevronDown size={16}/></summary>
                    <div className="ci-funnel-table-scroll">
                      <table className="ci-funnel-table">
                        <thead><tr><th>Compra</th><th>Clientes</th><th>% da base</th><th>Avanço</th><th>Dias entre compras</th></tr></thead>
                        <tbody>{analysis.funnelStages.map((stage,i)=><tr key={stage.stage}>
                          <td>{stage.label}</td><td>{number(stage.clients)}</td>
                          <td>{stage.share.toLocaleString('pt-BR',{maximumFractionDigits:1})}%</td>
                          <td>{i===0?'—':stage.stepRate.toLocaleString('pt-BR',{maximumFractionDigits:1})+'%'}</td>
                          <td>{i===0?'—':formatDays(stage.avgDays)}</td>
                        </tr>)}</tbody>
                      </table>
                    </div>
                    <p className="ci-mini-explain">“Avanço” indica quantos clientes passaram de uma etapa à próxima. O prazo é a média observada, não uma previsão de quando o cliente comprará novamente.</p>
                  </details>
                </div>
              </div>
            </Panel>
          </div>

          <details className="ci-advanced">
            <summary>
              <span className="ci-advanced-icon"><IconChartBar size={19}/></span>
              <span className="ci-advanced-text"><strong>Explorar análises detalhadas</strong><small>Histórico trimestral, evolução dos produtos e situação da carteira</small></span>
              <IconChevronDown size={20} className="ci-advanced-arrow"/>
            </summary>
            <div className="ci-advanced-inner">
              <h3>Histórico de crescimento por trimestre</h3>
              <p className="ci-mini-explain">Valores e variações de cada trimestre. O trimestre corrente usa a comparação por dias equivalentes (QTD).</p>
              <div className="ci-table-scroll"><table className="ci-table"><thead><tr>
                <th>Trimestre</th><th>Vendas</th><th>Variação</th><th>Clientes</th><th>Variação</th><th>Produtos</th><th>Variação</th>
              </tr></thead><tbody>{analysis.quarterComparison.map(row=>{
                const q=row.shown,prev=row.compared
                return <tr key={row.trimestre}>
                  <td><span className="ci-quarter-id">{row.trimestre}{row.isQtd&&<span className="ci-partial">QTD</span>}</span>
                    {row.isQtd&&<small className="ci-qtd-range">{row.windowText}</small>}</td>
                  <td className="ci-strong">{currency(q.valor)}</td><td>{prev?<Delta current={q.valor} previous={prev.valor}/>:<span className="ci-delta flat">—</span>}</td>
                  <td className="ci-strong">{number(q.clientes)}</td><td>{prev?<Delta current={q.clientes} previous={prev.clientes}/>:<span className="ci-delta flat">—</span>}</td>
                  <td className="ci-strong">{number(q.produtos)}</td><td>{prev?<Delta current={q.produtos} previous={prev.produtos}/>:<span className="ci-delta flat">—</span>}</td>
                </tr>
              })}</tbody></table></div>

              <div className="ci-advanced-divider"/>
              <h3>Clientes e produtos por trimestre</h3>
              <p className="ci-mini-explain">Quantos clientes fizeram pedidos e quantos produtos diferentes foram vendidos em cada trimestre.</p>
              <div className="ci-card-chart ci-advanced-chart"><ResponsiveContainer width="100%" height="100%">
                <BarChart data={analysis.quarterData} margin={{top:10,right:10,left:-5,bottom:5}} barGap={7}>
                  <CartesianGrid {...gridProps}/><XAxis dataKey="trimestre" tick={axis} axisLine={false} tickLine={false} tickMargin={11}/>
                  <YAxis tick={axis} axisLine={false} tickLine={false} allowDecimals={false}/>
                  <Tooltip content={<HoverTooltip/>}/>
                  <Bar name="Clientes compradores" dataKey="clientes" fill={CHART.ink} maxBarSize={30} radius={[5,5,0,0]}/>
                  <Bar name="Produtos diferentes" dataKey="produtos" fill={CHART.orange} maxBarSize={30} radius={[5,5,0,0]}/>
                </BarChart>
              </ResponsiveContainer></div>
              <LegendStrip items={[{name:'Clientes',color:CHART.ink},{name:'Produtos',color:CHART.orange}]}/>
              <div className="ci-advanced-divider"/>
              <h3>Vendas por categoria em cada trimestre</h3>
              <p className="ci-mini-explain">Detalhamento do mix. No trimestre atual, a variação usa o mesmo período do trimestre anterior.</p>
              <div className="ci-mix-table ci-table-scroll"><table className="ci-table">
                <thead><tr><th>Categoria</th>{analysis.quarterComparison.map(q=><th key={q.trimestre}>{q.trimestre}{q.isQtd?' QTD':''}</th>)}<th>Variação</th></tr></thead>
                <tbody>{analysis.categoryGrowth.map(cat=><tr key={cat.name}>
                  <td className="ci-strong">{cat.name}</td>
                  {cat.periodos.map(p=><td key={p.trimestre}>{currency(p.valor)}</td>)}
                  <td>{analysis.quarterComparison.length>1?<Delta current={cat.latest} previous={cat.previous}/>:<span className="ci-delta flat">—</span>}</td>
                </tr>)}</tbody>
              </table></div>
              <div className="ci-advanced-divider"/>
              <h3>Leitura complementar da carteira</h3>
              <div className="ci-portfolio-metrics">
                <div><span>Concentração dos 5 maiores clientes</span><strong>{analysis.concentration.toLocaleString('pt-BR',{maximumFractionDigits:1})}%</strong></div>
                <div><span>Clientes com apenas uma compra</span><strong>{number(analysis.one.length)}</strong></div>
                <div><span>Clientes com ciclo a investigar</span><strong>{number(analysis.risk.length)}</strong></div>
              </div>
              <p className="ci-mini-explain">O acompanhamento do ciclo se baseia nos intervalos anteriores do próprio cliente. Uma compra única ou um intervalo longo não comprova perda de cliente.</p>
            </div>
          </details>
        </>}

        <details className="ci-method">
          <summary><IconAlertCircle size={16}/> Como ler os números {hasQualityIssues&&<span className="ci-method-notice">· Há pendências na base</span>} <IconChevronDown size={15}/></summary>
          <div className="ci-method-body">
            <p><strong>Vendas analisadas:</strong> valores dos pedidos com produtos identificados, atribuídos comercialmente às categorias. Não substituem a conciliação de faturamento fiscal.</p>
            <p><strong>Recompra:</strong> clientes com dois ou mais pedidos distintos no período filtrado. Os intervalos são calculados entre as datas de pedidos consecutivos.</p>
            <p><strong>Trimestre atual (QTD):</strong> compara somente os dias transcorridos no trimestre com igual número de dias do anterior. Um desempenho negativo ainda pode ser real.</p>
            {hasQualityIssues&&<p><strong>Pendências na base geral:</strong> {analysis.missing} pedidos sem itens, {analysis.unvalued} sem valores de itens e {analysis.divergent} pedidos com valores divergentes/rateados. Isso pode limitar os indicadores do relatório.</p>}
          </div>
        </details>
        <div className="ci-report-footer">
          <span className="ci-live"><span className="ci-live-dot"/> Nutrialle · Relatório comercial</span>
          <Link className="ci-link" to="/carteira">Abrir carteira operacional <IconArrowRight size={14}/></Link>
        </div>
      </>}
    </main>
  </div>
}
