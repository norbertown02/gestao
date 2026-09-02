import { useEffect, useMemo, useRef, useState } from 'react'
import { supabaseAdmin } from '../lib/supabase'
import Topbar from '../components/Topbar'
import { IconCalendar, IconCheck, IconDownload, IconFileText, IconLoader2 } from '@tabler/icons-react'
import jsPDF from 'jspdf'
import html2canvas from 'html2canvas'

function money(n) {
  return Number(n || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })
}
function int(n) { return Number(n || 0).toLocaleString('pt-BR', { maximumFractionDigits: 0 }) }
function pct(a, b) {
  a = Number(a || 0); b = Number(b || 0)
  if (!a && !b) return 0
  if (!b) return 100
  return ((a - b) / b) * 100
}
function parseItems(items) {
  if (Array.isArray(items)) return items
  if (typeof items === 'string') { try { const x = JSON.parse(items); return Array.isArray(x) ? x : [] } catch { return [] } }
  return []
}
function itemValue(item) {
  const subtotal = Number(item?.subtotal)
  if (Number.isFinite(subtotal)) return subtotal
  const total = Number(item?.total ?? item?.value)
  if (Number.isFinite(total)) return total
  return Number(item?.quantity || 0) * Number(item?.unitPrice || item?.unit_price || 0)
}
function itemQty(item) { return Number(item?.quantity || item?.qty || 0) }
function iso(d) { return d.toISOString().slice(0, 10) }
function monthRange(year, month) { return [iso(new Date(year, month - 1, 1)), iso(new Date(year, month, 0))] }
function previousMonthRange(year, month) { const d = new Date(year, month - 2, 1); return [iso(d), iso(new Date(d.getFullYear(), d.getMonth() + 1, 0))] }

export default function RelatorioMensalFiltrado() {
  const printRef = useRef(null)
  const now = new Date()
  const [year, setYear] = useState(now.getFullYear())
  const [month, setMonth] = useState(now.getMonth() + 1)
  const [application, setApplication] = useState('')
  const [category, setCategory] = useState('')
  const [product, setProduct] = useState('')
  const [products, setProducts] = useState([])
  const [categories, setCategories] = useState([])
  const [applications, setApplications] = useState([])
  const [data, setData] = useState(null)
  const [loading, setLoading] = useState(false)
  const [pdfLoading, setPdfLoading] = useState(false)

  useEffect(() => {
    Promise.all([
      supabaseAdmin.from('products').select('id,name,ultra_codproduto,category_id,application_id').eq('active', true),
      supabaseAdmin.from('product_categories').select('id,name,sort_order').eq('active', true).order('sort_order'),
      supabaseAdmin.from('product_applications').select('id,name,sort_order').eq('active', true).order('sort_order'),
    ]).then(([p, c, a]) => {
      setProducts(p.data || [])
      setCategories(c.data || [])
      setApplications(a.data || [])
    })
  }, [])

  const filteredProducts = useMemo(() => products.filter(p =>
    (!application || p.application_id === application) &&
    (!category || p.category_id === category)
  ).sort((a,b) => String(a.name).localeCompare(String(b.name))), [products, application, category])

  useEffect(() => {
    if (product && !filteredProducts.some(p => p.id === product)) setProduct('')
  }, [application, category, filteredProducts, product])

  useEffect(() => { if (products.length) load() /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, [year, month, application, category, product, products])

  function productForItem(item, byId, byUltra) {
    const canonical = item?.canonicalProductId || item?.canonical_product_id
    if (canonical && byId.has(String(canonical))) return byId.get(String(canonical))
    const ultra = Number(item?.ultra_codproduto)
    if (Number.isFinite(ultra) && byUltra.has(ultra)) return byUltra.get(ultra)
    return null
  }

  function matches(p) {
    if (!p) return !application && !category && !product
    if (application && p.application_id !== application) return false
    if (category && p.category_id !== category) return false
    if (product && p.id !== product) return false
    return true
  }

  function filteredSaleAmount(sale, byId, byUltra) {
    const items = parseItems(sale.items)
    if (!application && !category && !product) return { amount: Number(sale.total || 0), qty: items.reduce((a,i)=>a+itemQty(i),0), matched: items.length > 0 }
    let amount = 0, qty = 0, matched = false
    items.forEach(item => {
      const p = productForItem(item, byId, byUltra)
      if (!matches(p)) return
      amount += itemValue(item)
      qty += itemQty(item)
      matched = true
    })
    return { amount, qty, matched }
  }

  async function load() {
    setLoading(true)
    try {
      const [ini, fim] = monthRange(year, month)
      const [iniAnt, fimAnt] = previousMonthRange(year, month)
      const d6 = new Date(year, month - 6, 1)
      const byId = new Map(products.map(p => [String(p.id), p]))
      const byUltra = new Map(products.filter(p => p.ultra_codproduto != null).map(p => [Number(p.ultra_codproduto), p]))
      const [sa, sp, visits, visitsPrev, farms, profiles, evol] = await Promise.all([
        supabaseAdmin.from('sales').select('*').gte('sale_date', ini).lte('sale_date', fim),
        supabaseAdmin.from('sales').select('*').gte('sale_date', iniAnt).lte('sale_date', fimAnt),
        supabaseAdmin.from('visits').select('id').gte('visit_date', ini).lte('visit_date', fim),
        supabaseAdmin.from('visits').select('id').gte('visit_date', iniAnt).lte('visit_date', fimAnt),
        supabaseAdmin.from('farms').select('id,name'),
        supabaseAdmin.from('profiles').select('id,name,full_name,display_name,email'),
        supabaseAdmin.from('sales').select('sale_date,total,items,farm_id,seller_id,ultra_salesman_id,comissao_pct').gte('sale_date', iso(d6)).lte('sale_date', fim),
      ])
      const current = (sa.data || []).map(s => ({ ...s, ...filteredSaleAmount(s, byId, byUltra) })).filter(s => s.matched)
      const previous = (sp.data || []).map(s => ({ ...s, ...filteredSaleAmount(s, byId, byUltra) })).filter(s => s.matched)
      const fat = current.reduce((a,s)=>a+s.amount,0)
      const fatPrev = previous.reduce((a,s)=>a+s.amount,0)
      const orders = current.length
      const ordersPrev = previous.length
      const qty = current.reduce((a,s)=>a+s.qty,0)
      const commission = current.reduce((a,s)=>a+s.amount*(Number(s.comissao_pct||0)/100),0)
      const farmMap = new Map((farms.data||[]).map(f=>[String(f.id),f]))
      const profileMap = new Map((profiles.data||[]).map(p=>[String(p.id),p]))

      const productMap = new Map()
      current.forEach(s => parseItems(s.items).forEach(item => {
        const p = productForItem(item, byId, byUltra)
        if (!matches(p)) return
        const key = p?.id || item?.canonicalProductId || item?.productName || item?.product_name || 'produto'
        const row = productMap.get(key) || { id:key, name:p?.name || item?.productName || item?.product_name || 'Produto', total:0, qty:0 }
        row.total += itemValue(item); row.qty += itemQty(item); productMap.set(key,row)
      }))

      const sellerMap = new Map(), farmSales = new Map()
      current.forEach(s => {
        const skey = String(s.seller_id || `ultra:${s.ultra_salesman_id || 'geral'}`)
        const prof = profileMap.get(String(s.seller_id))
        const sr = sellerMap.get(skey) || { id:skey, name:prof?.name||prof?.full_name||prof?.display_name||prof?.email||'Vendedor não vinculado', total:0, orders:0 }
        sr.total += s.amount; sr.orders += 1; sellerMap.set(skey,sr)
        const fkey = String(s.farm_id || 'sem-fazenda')
        const fr = farmSales.get(fkey) || { id:fkey, name:farmMap.get(fkey)?.name||'—', total:0, orders:0 }
        fr.total += s.amount; fr.orders += 1; farmSales.set(fkey,fr)
      })

      const evoMap = new Map()
      for (let i=5;i>=0;i--) { const d=new Date(year,month-1-i,1); const k=d.toISOString().slice(0,7); evoMap.set(k,{key:k,label:d.toLocaleDateString('pt-BR',{month:'short'}),total:0}) }
      ;(evol.data||[]).forEach(s => { const k=String(s.sale_date||'').slice(0,7); if (!evoMap.has(k)) return; const fs=filteredSaleAmount(s,byId,byUltra); if (fs.matched) evoMap.get(k).total += fs.amount })

      setData({ ini,fim,fat,fatPrev,orders,ordersPrev,qty,commission,visits:(visits.data||[]).length,visitsPrev:(visitsPrev.data||[]).length,
        topProducts:[...productMap.values()].sort((a,b)=>b.total-a.total).slice(0,10),
        topSellers:[...sellerMap.values()].sort((a,b)=>b.total-a.total).slice(0,8),
        topFarms:[...farmSales.values()].sort((a,b)=>b.total-a.total).slice(0,8),
        evolution:[...evoMap.values()],
      })
    } catch (e) { console.error('Erro no relatório filtrado', e); setData(null) }
    finally { setLoading(false) }
  }

  async function exportPdf() {
    if (!printRef.current || !data) return
    setPdfLoading(true)
    try {
      const canvas = await html2canvas(printRef.current,{scale:2,useCORS:true,backgroundColor:'#fff'})
      const pdf = new jsPDF('p','mm','a4')
      const img=canvas.toDataURL('image/jpeg',0.95); const w=190; const h=canvas.height*w/canvas.width
      let y=10, left=h
      pdf.addImage(img,'JPEG',10,y,w,h)
      left -= 277
      while(left>0){ pdf.addPage(); y=10-(h-left); pdf.addImage(img,'JPEG',10,y,w,h); left-=277 }
      pdf.save(`Nutrialle_Relatorio_${year}_${String(month).padStart(2,'0')}.pdf`)
    } finally { setPdfLoading(false) }
  }

  const appName = applications.find(a=>a.id===application)?.name || 'Todas as aplicações'
  const catName = categories.find(c=>c.id===category)?.name || 'Todas as categorias'
  const prodName = products.find(p=>p.id===product)?.name || 'Todos os produtos'
  const months = Array.from({length:12},(_,i)=>({value:i+1,label:new Date(2026,i,1).toLocaleDateString('pt-BR',{month:'long'})}))

  return <div style={{flex:1,overflow:'hidden',display:'flex',flexDirection:'column'}}>
    <Topbar title="Relatório de Gestão" subtitle="Análise comercial por aplicação, categoria e produto" />
    <div className="page relpremium-page" style={{overflowY:'auto'}}>
      <section className="relpremium-hero"><div><span className="relpremium-eyebrow">Relatório executivo Nutrialle</span><h2>Gestão comercial por mix de produto</h2><p>Os filtros comerciais são aplicados item a item dentro de cada pedido, evitando duplicidade de faturamento.</p></div><div className="relpremium-period-card"><IconFileText size={28}/><strong>{appName}</strong><span>{catName}</span></div></section>
      <section className="relpremium-generator"><div className="relpremium-panel" style={{width:'100%'}}><div className="relpremium-panel-head"><div><span className="relpremium-eyebrow">Filtros</span><h3>Período e classificação</h3></div><IconCalendar size={20}/></div>
        <div className="relpremium-form-grid" style={{gridTemplateColumns:'repeat(3,minmax(160px,1fr))'}}>
          <label><span>Mês</span><select value={month} onChange={e=>setMonth(Number(e.target.value))}>{months.map(m=><option key={m.value} value={m.value}>{m.label}</option>)}</select></label>
          <label><span>Ano</span><select value={year} onChange={e=>setYear(Number(e.target.value))}>{[2024,2025,2026,2027].map(y=><option key={y}>{y}</option>)}</select></label>
          <label><span>Aplicação</span><select value={application} onChange={e=>setApplication(e.target.value)}><option value="">Todas</option>{applications.map(a=><option key={a.id} value={a.id}>{a.name}</option>)}</select></label>
          <label><span>Categoria</span><select value={category} onChange={e=>setCategory(e.target.value)}><option value="">Todas</option>{categories.map(c=><option key={c.id} value={c.id}>{c.name}</option>)}</select></label>
          <label style={{gridColumn:'span 2'}}><span>Produto</span><select value={product} onChange={e=>setProduct(e.target.value)}><option value="">Todos</option>{filteredProducts.map(p=><option key={p.id} value={p.id}>{p.name}</option>)}</select></label>
        </div>
      </div></section>

      {loading ? <div className="relpremium-loading"><IconLoader2 size={20} className="relpremium-spin"/> Carregando...</div> : data && <div ref={printRef} style={{background:'#fff',padding:24,borderRadius:18,marginTop:18}}>
        <div style={{display:'flex',justifyContent:'space-between',gap:20,borderBottom:'1px solid #eee',paddingBottom:16,marginBottom:20}}><div><span className="relpremium-eyebrow">{appName} · {catName}</span><h2 style={{margin:'6px 0'}}>Relatório comercial</h2><p style={{margin:0,color:'#666'}}>{prodName} · {data.ini} a {data.fim}</p></div><button className="relpremium-download" onClick={exportPdf} disabled={pdfLoading}>{pdfLoading?<IconLoader2 size={17} className="relpremium-spin"/>:<IconDownload size={17}/>} Exportar PDF</button></div>
        <div className="relpremium-metrics" style={{marginBottom:24}}>
          <div className="relpremium-metric"><span>Faturamento</span><strong>{money(data.fat)}</strong><small>{pct(data.fat,data.fatPrev).toFixed(1)}% vs anterior</small></div>
          <div className="relpremium-metric"><span>Pedidos</span><strong>{int(data.orders)}</strong><small>{pct(data.orders,data.ordersPrev).toFixed(1)}% vs anterior</small></div>
          <div className="relpremium-metric"><span>Ticket médio</span><strong>{money(data.orders?data.fat/data.orders:0)}</strong><small>somente itens filtrados</small></div>
          <div className="relpremium-metric"><span>Quantidade</span><strong>{int(data.qty)}</strong><small>unidades/kg conforme item</small></div>
          <div className="relpremium-metric"><span>Comissão estimada</span><strong>{money(data.commission)}</strong><small>sobre faturamento filtrado</small></div>
        </div>
        <div style={{display:'grid',gridTemplateColumns:'1.2fr 1fr',gap:18}}>
          <div className="pdf-panel"><div className="pdf-panel-title"><span>Mix comercial</span><strong>Top produtos</strong></div>{data.topProducts.map((r,i)=><div className="pdf-risk-row" key={r.id}><strong>{i+1}. {r.name}</strong><span>{int(r.qty)} · {money(r.total)}</span></div>)}</div>
          <div className="pdf-panel"><div className="pdf-panel-title"><span>Equipe</span><strong>Top vendedores</strong></div>{data.topSellers.map((r,i)=><div className="pdf-risk-row" key={r.id}><strong>{i+1}. {r.name}</strong><span>{r.orders} pedidos · {money(r.total)}</span></div>)}</div>
          <div className="pdf-panel"><div className="pdf-panel-title"><span>Clientes</span><strong>Top fazendas</strong></div>{data.topFarms.map((r,i)=><div className="pdf-risk-row" key={r.id}><strong>{i+1}. {r.name}</strong><span>{r.orders} pedidos · {money(r.total)}</span></div>)}</div>
          <div className="pdf-panel"><div className="pdf-panel-title"><span>Campo</span><strong>Indicadores gerais</strong></div><div className="pdf-risk-row"><strong>Visitas no período</strong><span>{data.visits}</span></div><div className="pdf-risk-row"><strong>Visitas período anterior</strong><span>{data.visitsPrev}</span></div><div className="pdf-risk-row"><strong>Status</strong><span><IconCheck size={14}/> sem filtro de produto</span></div></div>
        </div>
        <div className="pdf-panel" style={{marginTop:18}}><div className="pdf-panel-title"><span>Evolução</span><strong>Faturamento filtrado — últimos 6 meses</strong></div>{data.evolution.map(r=><div key={r.key} style={{display:'grid',gridTemplateColumns:'70px 1fr 130px',gap:12,alignItems:'center',margin:'10px 0'}}><span>{r.label}</span><div style={{height:8,background:'#eee',borderRadius:8,overflow:'hidden'}}><i style={{display:'block',height:'100%',background:'#e87722',width:`${Math.max(2,(r.total/Math.max(...data.evolution.map(x=>x.total),1))*100)}%`}}/></div><strong>{money(r.total)}</strong></div>)}</div>
      </div>}
    </div>
  </div>
}
