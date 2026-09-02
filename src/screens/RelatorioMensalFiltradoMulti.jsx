import { useEffect, useMemo, useRef, useState } from 'react'
import { supabaseAdmin } from '../lib/supabase'
import Topbar from '../components/Topbar'
import MultiSelectFilter from '../components/MultiSelectFilter'
import { IconCalendar, IconDownload, IconFileText, IconLoader2 } from '@tabler/icons-react'
import jsPDF from 'jspdf'
import html2canvas from 'html2canvas'

const money = n => Number(n || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })
const int = n => Number(n || 0).toLocaleString('pt-BR', { maximumFractionDigits: 0 })
function pct(a,b){a=Number(a||0);b=Number(b||0);if(!a&&!b)return 0;if(!b)return 100;return((a-b)/b)*100}
function parseItems(items){if(Array.isArray(items))return items;if(typeof items==='string'){try{const x=JSON.parse(items);return Array.isArray(x)?x:[]}catch{return[]}}return[]}
function itemValue(item){const subtotal=Number(item?.subtotal);if(Number.isFinite(subtotal))return subtotal;const total=Number(item?.total??item?.value);if(Number.isFinite(total))return total;return Number(item?.quantity||0)*Number(item?.unitPrice||item?.unit_price||0)}
const itemQty=item=>Number(item?.quantity||item?.qty||0)
const iso=d=>d.toISOString().slice(0,10)
const monthRange=(year,month)=>[iso(new Date(year,month-1,1)),iso(new Date(year,month,0))]
function previousMonthRange(year,month){const d=new Date(year,month-2,1);return[iso(d),iso(new Date(d.getFullYear(),d.getMonth()+1,0))]}

export default function RelatorioMensalFiltradoMulti(){
  const printRef=useRef(null)
  const now=new Date()
  const [year,setYear]=useState(now.getFullYear())
  const [month,setMonth]=useState(now.getMonth()+1)
  const [applicationIds,setApplicationIds]=useState([])
  const [categoryIds,setCategoryIds]=useState([])
  const [product,setProduct]=useState('')
  const [products,setProducts]=useState([])
  const [categories,setCategories]=useState([])
  const [applications,setApplications]=useState([])
  const [data,setData]=useState(null)
  const [loading,setLoading]=useState(false)
  const [pdfLoading,setPdfLoading]=useState(false)

  useEffect(()=>{
    Promise.all([
      supabaseAdmin.from('products').select('id,name,ultra_codproduto,category_id,application_id').eq('active',true),
      supabaseAdmin.from('product_categories').select('id,name,sort_order').eq('active',true).order('sort_order'),
      supabaseAdmin.from('product_applications').select('id,name,sort_order').eq('active',true).order('sort_order'),
    ]).then(([p,c,a])=>{setProducts(p.data||[]);setCategories(c.data||[]);setApplications(a.data||[])})
  },[])

  const filteredProducts=useMemo(()=>products.filter(p=>(!applicationIds.length||applicationIds.includes(p.application_id))&&(!categoryIds.length||categoryIds.includes(p.category_id))).sort((a,b)=>String(a.name).localeCompare(String(b.name))),[products,applicationIds,categoryIds])
  useEffect(()=>{if(product&&!filteredProducts.some(p=>p.id===product))setProduct('')},[filteredProducts,product])
  useEffect(()=>{if(products.length)load()},[year,month,applicationIds.join('|'),categoryIds.join('|'),product,products])

  function productForItem(item,byId,byUltra){const canonical=item?.canonicalProductId||item?.canonical_product_id;if(canonical&&byId.has(String(canonical)))return byId.get(String(canonical));const ultra=Number(item?.ultra_codproduto);if(Number.isFinite(ultra)&&byUltra.has(ultra))return byUltra.get(ultra);return null}
  function matches(p){if(!p)return !applicationIds.length&&!categoryIds.length&&!product;if(applicationIds.length&&!applicationIds.includes(p.application_id))return false;if(categoryIds.length&&!categoryIds.includes(p.category_id))return false;if(product&&p.id!==product)return false;return true}
  function filteredSaleAmount(sale,byId,byUltra){const items=parseItems(sale.items);if(!applicationIds.length&&!categoryIds.length&&!product)return{amount:Number(sale.total||0),qty:items.reduce((a,i)=>a+itemQty(i),0),matched:items.length>0};let amount=0,qty=0,matched=false;items.forEach(item=>{const p=productForItem(item,byId,byUltra);if(!matches(p))return;amount+=itemValue(item);qty+=itemQty(item);matched=true});return{amount,qty,matched}}

  async function load(){
    setLoading(true)
    try{
      const[ini,fim]=monthRange(year,month);const[iniAnt,fimAnt]=previousMonthRange(year,month);const d6=new Date(year,month-6,1)
      const byId=new Map(products.map(p=>[String(p.id),p]));const byUltra=new Map(products.filter(p=>p.ultra_codproduto!=null).map(p=>[Number(p.ultra_codproduto),p]))
      const[sa,sp,visits,visitsPrev,farms,profiles,evol]=await Promise.all([
        supabaseAdmin.from('sales').select('*').gte('sale_date',ini).lte('sale_date',fim),
        supabaseAdmin.from('sales').select('*').gte('sale_date',iniAnt).lte('sale_date',fimAnt),
        supabaseAdmin.from('visits').select('id').gte('visit_date',ini).lte('visit_date',fim),
        supabaseAdmin.from('visits').select('id').gte('visit_date',iniAnt).lte('visit_date',fimAnt),
        supabaseAdmin.from('farms').select('id,name'),
        supabaseAdmin.from('profiles').select('id,name,full_name,display_name,email'),
        supabaseAdmin.from('sales').select('sale_date,total,items,farm_id,seller_id,ultra_salesman_id,comissao_pct').gte('sale_date',iso(d6)).lte('sale_date',fim),
      ])
      const current=(sa.data||[]).map(s=>({...s,...filteredSaleAmount(s,byId,byUltra)})).filter(s=>s.matched)
      const previous=(sp.data||[]).map(s=>({...s,...filteredSaleAmount(s,byId,byUltra)})).filter(s=>s.matched)
      const fat=current.reduce((a,s)=>a+s.amount,0),fatPrev=previous.reduce((a,s)=>a+s.amount,0),orders=current.length,ordersPrev=previous.length,qty=current.reduce((a,s)=>a+s.qty,0),commission=current.reduce((a,s)=>a+s.amount*(Number(s.comissao_pct||0)/100),0)
      const farmMap=new Map((farms.data||[]).map(f=>[String(f.id),f])),profileMap=new Map((profiles.data||[]).map(p=>[String(p.id),p]))
      const productMap=new Map();current.forEach(s=>parseItems(s.items).forEach(item=>{const p=productForItem(item,byId,byUltra);if(!matches(p))return;const key=p?.id||item?.canonicalProductId||item?.productName||item?.product_name||'produto';const row=productMap.get(key)||{id:key,name:p?.name||item?.productName||item?.product_name||'Produto',total:0,qty:0};row.total+=itemValue(item);row.qty+=itemQty(item);productMap.set(key,row)}))
      const sellerMap=new Map(),farmSales=new Map();current.forEach(s=>{const skey=String(s.seller_id||`ultra:${s.ultra_salesman_id||'geral'}`),prof=profileMap.get(String(s.seller_id)),sr=sellerMap.get(skey)||{id:skey,name:prof?.name||prof?.full_name||prof?.display_name||prof?.email||'Vendedor não vinculado',total:0,orders:0};sr.total+=s.amount;sr.orders+=1;sellerMap.set(skey,sr);const fkey=String(s.farm_id||'sem-fazenda'),fr=farmSales.get(fkey)||{id:fkey,name:farmMap.get(fkey)?.name||'—',total:0,orders:0};fr.total+=s.amount;fr.orders+=1;farmSales.set(fkey,fr)})
      const evoMap=new Map();for(let i=5;i>=0;i--){const d=new Date(year,month-1-i,1),k=d.toISOString().slice(0,7);evoMap.set(k,{key:k,label:d.toLocaleDateString('pt-BR',{month:'short'}),total:0})};(evol.data||[]).forEach(s=>{const k=String(s.sale_date||'').slice(0,7);if(!evoMap.has(k))return;const fs=filteredSaleAmount(s,byId,byUltra);if(fs.matched)evoMap.get(k).total+=fs.amount})
      setData({ini,fim,fat,fatPrev,orders,ordersPrev,qty,commission,visits:(visits.data||[]).length,visitsPrev:(visitsPrev.data||[]).length,topProducts:[...productMap.values()].sort((a,b)=>b.total-a.total).slice(0,10),topSellers:[...sellerMap.values()].sort((a,b)=>b.total-a.total).slice(0,8),topFarms:[...farmSales.values()].sort((a,b)=>b.total-a.total).slice(0,8),evolution:[...evoMap.values()]})
    }catch(e){console.error('Erro no relatório filtrado',e);setData(null)}finally{setLoading(false)}
  }

  async function exportPdf(){if(!printRef.current||!data)return;setPdfLoading(true);try{const canvas=await html2canvas(printRef.current,{scale:2,useCORS:true,backgroundColor:'#fff'});const pdf=new jsPDF('p','mm','a4'),img=canvas.toDataURL('image/jpeg',0.95),w=190,h=canvas.height*w/canvas.width;let y=10,left=h;pdf.addImage(img,'JPEG',10,y,w,h);left-=277;while(left>0){pdf.addPage();y=10-(h-left);pdf.addImage(img,'JPEG',10,y,w,h);left-=277}pdf.save(`Nutrialle_Relatorio_${year}_${String(month).padStart(2,'0')}.pdf`)}finally{setPdfLoading(false)}}

  const appName=applicationIds.length?applications.filter(a=>applicationIds.includes(a.id)).map(a=>a.name).join(', '):'Todas as aplicações'
  const catName=categoryIds.length?categories.filter(c=>categoryIds.includes(c.id)).map(c=>c.name).join(', '):'Todas as categorias'
  const prodName=products.find(p=>p.id===product)?.name||'Todos os produtos'
  const months=Array.from({length:12},(_,i)=>({value:i+1,label:new Date(2026,i,1).toLocaleDateString('pt-BR',{month:'long'})}))

  return <div style={{flex:1,overflow:'hidden',display:'flex',flexDirection:'column'}}>
    <Topbar title="Relatório de Gestão" subtitle="Análise comercial por aplicação, categoria e produto" />
    <div className="page relpremium-page" style={{overflowY:'auto'}}>
      <section className="relpremium-hero"><div><span className="relpremium-eyebrow">Relatório executivo Nutrialle</span><h2>Gestão comercial por mix de produto</h2><p>Aplicação e categoria aceitam seleção múltipla e são calculadas item a item, sem duplicidade.</p></div><div className="relpremium-period-card"><IconFileText size={28}/><strong>{applicationIds.length?`${applicationIds.length} aplicação(ões)`:'Todas'}</strong><span>{categoryIds.length?`${categoryIds.length} categoria(s)`:'Todas as categorias'}</span></div></section>
      <section className="relpremium-generator"><div className="relpremium-panel" style={{width:'100%'}}><div className="relpremium-panel-head"><div><span className="relpremium-eyebrow">Filtros</span><h3>Período e classificação</h3></div><IconCalendar size={20}/></div>
        <div className="relpremium-form-grid" style={{gridTemplateColumns:'repeat(3,minmax(180px,1fr))',alignItems:'end'}}>
          <label><span>Mês</span><select value={month} onChange={e=>setMonth(Number(e.target.value))}>{months.map(m=><option key={m.value} value={m.value}>{m.label}</option>)}</select></label>
          <label><span>Ano</span><select value={year} onChange={e=>setYear(Number(e.target.value))}>{[2024,2025,2026,2027].map(y=><option key={y}>{y}</option>)}</select></label>
          <MultiSelectFilter label="Aplicação" options={applications} values={applicationIds} onChange={setApplicationIds} allLabel="Todas as aplicações" />
          <MultiSelectFilter label="Categoria" options={categories} values={categoryIds} onChange={setCategoryIds} allLabel="Todas as categorias" />
          <label style={{gridColumn:'span 2'}}><span>Produto</span><select value={product} onChange={e=>setProduct(e.target.value)}><option value="">Todos</option>{filteredProducts.map(p=><option key={p.id} value={p.id}>{p.name}</option>)}</select></label>
        </div>
      </div></section>

      {loading?<div className="relpremium-loading"><IconLoader2 size={20} className="relpremium-spin"/> Carregando...</div>:data&&<div ref={printRef} style={{background:'#fff',padding:24,borderRadius:18,marginTop:18}}>
        <div style={{display:'flex',justifyContent:'space-between',gap:20,borderBottom:'1px solid #eee',paddingBottom:16,marginBottom:20}}><div><span className="relpremium-eyebrow">{appName} · {catName}</span><h2 style={{margin:'6px 0'}}>Relatório comercial</h2><p style={{margin:0,color:'#666'}}>{prodName} · {data.ini} a {data.fim}</p></div><button className="relpremium-download" onClick={exportPdf} disabled={pdfLoading}>{pdfLoading?<IconLoader2 size={17} className="relpremium-spin"/>:<IconDownload size={17}/>} Exportar PDF</button></div>
        <div className="relpremium-metrics" style={{marginBottom:24}}><div className="relpremium-metric"><span>Faturamento</span><strong>{money(data.fat)}</strong><small>{pct(data.fat,data.fatPrev).toFixed(1)}% vs anterior</small></div><div className="relpremium-metric"><span>Pedidos</span><strong>{int(data.orders)}</strong><small>{pct(data.orders,data.ordersPrev).toFixed(1)}% vs anterior</small></div><div className="relpremium-metric"><span>Ticket médio</span><strong>{money(data.orders?data.fat/data.orders:0)}</strong><small>somente itens filtrados</small></div><div className="relpremium-metric"><span>Quantidade</span><strong>{int(data.qty)}</strong><small>conforme unidade do item</small></div><div className="relpremium-metric"><span>Comissão estimada</span><strong>{money(data.commission)}</strong><small>sobre faturamento filtrado</small></div></div>
        <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:18}}><div className="pdf-panel"><div className="pdf-panel-title"><span>Produtos</span><strong>Top produtos</strong></div>{data.topProducts.map(r=><div key={r.id} style={{display:'flex',justifyContent:'space-between',gap:12,padding:'10px 0',borderBottom:'1px solid #eee'}}><span>{r.name}</span><strong>{money(r.total)}</strong></div>)}</div><div className="pdf-panel"><div className="pdf-panel-title"><span>Clientes</span><strong>Top fazendas</strong></div>{data.topFarms.map(r=><div key={r.id} style={{display:'flex',justifyContent:'space-between',gap:12,padding:'10px 0',borderBottom:'1px solid #eee'}}><span>{r.name}</span><strong>{money(r.total)}</strong></div>)}</div></div>
      </div>}
    </div>
  </div>
}
