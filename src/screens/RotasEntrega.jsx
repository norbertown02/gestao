import { useEffect, useMemo, useRef, useState } from 'react'
import { IconRoute, IconTruckDelivery, IconFileTypePdf, IconMapPin, IconRefresh, IconPackage, IconCurrencyReal, IconAlertTriangle, IconExternalLink, IconArrowUpRight } from '@tabler/icons-react'
import { supabase } from '../lib/supabase'
import Topbar from '../components/Topbar'
import jsPDF from 'jspdf'
import autoTable from 'jspdf-autotable'
import './RotasEntrega.css'
import { optimizeRoute } from '../lib/routeOptimizer'
import { optimizeFleet } from '../lib/fleetOptimizer'

const fmt = v => Number(v || 0).toLocaleString('pt-BR', { maximumFractionDigits: 2 })
const reais = v => Number(v || 0).toLocaleString('pt-BR', { style:'currency', currency:'BRL' })
const num = v => Number(String(v ?? 0).replace(',', '.')) || 0
const qty = i => num(i?.quantityKg ?? i?.quantity ?? i?.qty)
const name = i => i.productName || i.product_name || i.name || 'Produto'
const code = i => String(i.productKey || i.product_code || i.productId || i.product_name || i.productName || '')
const address = f => [f?.street && [f.street, f.street_number].filter(Boolean).join(', '), f?.bairro, f?.city, f?.state, f?.cep, 'Brasil'].filter(Boolean).join(', ')
const hasAddress = f => Boolean(f?.city && f?.state)
const nowDate = () => new Date().toISOString().slice(0,10)
const first = val => Array.isArray(val) ? val : (typeof val === 'string' ? (()=>{try{return JSON.parse(val)}catch{return []}})() : [])
const eps=0.00001

function itemsOf(order) {
  const list=first(order.items)
  const ratio=(num(order.quantity_invoiced)+num(order.quantity_shipped))
  const total=list.reduce((s,i)=>s+qty(i),0)
  // Conservador: sem detalhe de NF por item, o saldo geral do pedido limita a seleção.
  const open=Math.max(0, (num(order.quantity_ordered)||total)-Math.max(num(order.quantity_invoiced),num(order.quantity_shipped)))
  const proportional=total ? Math.min(1,open/total) : 0
  return list.map((i,index)=>({key:order.id+':'+index,orderId:order.id,index,product:name(i),code:code(i),ordered:qty(i),available:Math.max(0,qty(i)*proportional),bagKg:num(i.bagKg)})).filter(i=>i.ordered>0)
}
function routeLink(points) {
 const places=points.filter(Boolean)
 if(!places.length)return ''
 const base='https://www.google.com/maps/dir/?api=1'
 return base+'&origin='+encodeURIComponent(places[0])+'&destination='+encodeURIComponent(places[places.length-1])+
   (places.length>2?'&waypoints='+encodeURIComponent(places.slice(1,-1).join('|')):'')+'&travelmode=driving'
}
function nearestPath(matrix, returnHome) {
 const n=matrix.length, remaining=new Set(Array.from({length:n-1},(_,i)=>i+1))
 let path=[0], at=0
 while(remaining.size){
   const next=[...remaining].sort((a,b)=>matrix[at][a].duration-matrix[at][b].duration)[0]
   path.push(next);remaining.delete(next);at=next
 }
 // Busca local 2-opt, preservando origem.
 let best=p=>p.slice(1).reduce((s,k,i)=>s+matrix[p[i]][k].duration,0)+(returnHome?matrix[p[p.length-1]][0].duration:0)
 for(let improved=true;improved;){
   improved=false
   for(let i=1;i<path.length-1;i++) for(let j=i+1;j<path.length;j++){
     const candidate=[...path.slice(0,i),...path.slice(i,j+1).reverse(),...path.slice(j+1)]
     if(best(candidate)+0.001<best(path)){path=candidate;improved=true}
   }
 }
 return path
}
const BR_STATES={AC:'Acre',AL:'Alagoas',AP:'Amapá',AM:'Amazonas',BA:'Bahia',CE:'Ceará',DF:'Distrito Federal',ES:'Espírito Santo',GO:'Goiás',MA:'Maranhão',MT:'Mato Grosso',MS:'Mato Grosso do Sul',MG:'Minas Gerais',PA:'Pará',PB:'Paraíba',PR:'Paraná',PE:'Pernambuco',PI:'Piauí',RJ:'Rio de Janeiro',RN:'Rio Grande do Norte',RS:'Rio Grande do Sul',RO:'Rondônia',RR:'Roraima',SC:'Santa Catarina',SP:'São Paulo',SE:'Sergipe',TO:'Tocantins'}
const cleanText=v=>String(v||'').replace(/[\t\n\r]+/g,' ').replace(/\s+/g,' ').trim()
const stateName=v=>BR_STATES[cleanText(v).toUpperCase()]||cleanText(v)
const postal=v=>cleanText(v).replace(/\D/g,'')
const usablePostal=v=>postal(v).length===8
function addressCandidates(f,edited) {
 if(edited)return [{q:cleanText(edited),precision:'informado'}]
 const city=cleanText(f?.city), state=stateName(f?.state), street=cleanText(f?.street), number=cleanText(f?.street_number)
 const district=cleanText(f?.bairro), zip=usablePostal(f?.cep)?postal(f.cep):''
 const place=[city,state,'Brasil'].filter(Boolean).join(', ')
 const numberOk=number&&!/^(SN|S\/N|S N|SEM NUMERO)$/i.test(number)
 const firstLine=[street,numberOk?number:''].filter(Boolean).join(', ')
 const candidates=[
  [firstLine,district,city,state,'Brasil'].filter(Boolean).join(', '),
  [street,city,state,'Brasil'].filter(Boolean).join(', '),
  [district&&!/^(RURAL|ZONA RURAL|CENTRO)$/i.test(district)?district:'',city,state,'Brasil'].filter(Boolean).join(', '),
  zip?[zip,'Brasil'].join(', '):'',
  place
 ].filter(Boolean)
 return [...new Set(candidates)].map((q,i)=>({q,precision:q===place?'municipio':i===0?'endereco':'aproximado'}))
}
function parseCoords(value){
 const raw=cleanText(value).replace(';',',')
 const at=raw.match(/@(-?\d+(?:\.\d+)?),(-?\d+(?:\.\d+)?)/)
 const pair=at||raw.match(/(-?\d{1,3}(?:\.\d+)?)\s*,\s*(-?\d{1,3}(?:\.\d+)?)/)
 if(!pair)return null
 const lat=Number(pair[1]),lon=Number(pair[2])
 return Number.isFinite(lat)&&Number.isFinite(lon)&&lat>=-34&&lat<=6&&lon>=-75&&lon<=-30?[lon,lat]:null
}
async function geocodeCandidates(candidates,signal){
 let serverError=false
 for(const candidate of candidates){
  try{
   const response=await fetch('https://nominatim.openstreetmap.org/search?'+new URLSearchParams({q:candidate.q,format:'json',limit:'1',countrycodes:'br',addressdetails:'1'}),{signal,headers:{'Accept':'application/json'}})
   if(!response.ok){serverError=true;continue}
   const data=await response.json()
   if(data.length){
    const hit=data[0], type=String(hit.type||'').toLowerCase()
    const nonSpecific=['city','town','village','municipality','administrative','county','state']
    const approximate=candidate.precision!=='endereco'||nonSpecific.includes(type)
    return {coordinate:[Number(hit.lon),Number(hit.lat)],approximate,query:candidate.q,display:hit.display_name}
   }
  }catch(e){if(e.name==='AbortError')throw e;serverError=true}
  await sleep(1050)
 }
 throw new Error(serverError?'Serviço de geolocalização não respondeu. Tente novamente ou informe as coordenadas.':'Local não encontrado no mapa. Informe um endereço alternativo ou coordenadas GPS.')
}
const sleep=ms=>new Promise(resolve=>setTimeout(resolve,ms))
function Metric({label,value,note,Icon}){return <div className="rt-metric"><div className="rt-metric-top"><span>{label}</span><Icon size={19}/></div><strong>{value}</strong><small>{note}</small></div>}
export default function RotasEntrega(){
 const [orders,setOrders]=useState([])
 const [farms,setFarms]=useState([])
 const [selected,setSelected]=useState({})
 const [search,setSearch]=useState('')
 const [loading,setLoading]=useState(true)
 const [working,setWorking]=useState(false)
 const [error,setError]=useState('')
 const [origin,setOrigin]=useState('Toledo, Paraná, Brasil')
 const [goBack,setGoBack]=useState(true)
 const [objective,setObjective]=useState('duration')
 const [roadProfile,setRoadProfile]=useState('conservador')
 const [vehicles,setVehicles]=useState([{id:'v1',name:'Veículo 01',capacity:5000,enabled:true,fixedCost:0}])
 const [activeRoute,setActiveRoute]=useState(0)
 const [freight,setFreight]=useState('')
 const [date,setDate]=useState(nowDate)
 const [driver,setDriver]=useState('')
 const [vehicle,setVehicle]=useState('')
 const [notes,setNotes]=useState('')
 const [addressEdits,setAddressEdits]=useState({})
 const [gpsEdits,setGpsEdits]=useState({})
 const [plan,setPlan]=useState(null)
 const mapRef=useRef(null)
 const mapInstance=useRef(null)
 const selectedRef=useRef(null)
 const locations=useMemo(()=>Object.fromEntries(farms.map(f=>[f.id,f])),[farms])
 const refresh=async()=>{
  setLoading(true);setError('')
  try{
   const [sales,customers]=await Promise.all([
    supabase.from('sales').select('id,farm_id,sale_date,items,status,quantity_ordered,quantity_invoiced,quantity_shipped,ultra_order_number,delivery_date').order('created_at',{ascending:false}).limit(600),
    supabase.from('farms').select('id,name,street,street_number,bairro,city,state,cep,phone,owner_name')
   ])
   if(sales.error)throw sales.error
   if(customers.error)throw customers.error
   setOrders((sales.data||[]).filter(s=>!['cancelado','estornado','cancelado_apos_faturamento'].includes(String(s.status||'').toLowerCase())&&itemsOf(s).some(i=>i.available>eps)))
   setFarms(customers.data||[])
  }catch(e){setError(e.message||'Não foi possível buscar os pedidos.')}
  finally{setLoading(false)}
 }
 useEffect(()=>{refresh()},[])
 const rows=useMemo(()=>orders.map(o=>({...o,client:locations[o.farm_id],lines:itemsOf(o)})).filter(o=>o.lines.length),[orders,locations])
 const filtered=rows.filter(r=>([r.client?.name,r.ultra_order_number,r.id,r.client?.city].join(' ').toLowerCase()).includes(search.toLowerCase()))
 const chosen=useMemo(()=>rows.map(o=>({...o,lines:o.lines.filter(i=>num(selected[i.key])>0).map(i=>({...i,load:Math.min(i.available,num(selected[i.key]))}))})).filter(o=>o.lines.length),[rows,selected])
 const kg=chosen.reduce((s,o)=>s+o.lines.reduce((t,i)=>t+i.load,0),0)
 const clientCount=new Set(chosen.map(o=>o.farm_id)).size
 const stops=useMemo(()=>{
  const grouped=new Map()
  chosen.forEach(o=>{
   const key=o.farm_id
   if(!grouped.has(key))grouped.set(key,{id:key,client:o.client,orders:[],total:0})
   const item=grouped.get(key);item.orders.push(o);item.total+=o.lines.reduce((s,i)=>s+i.load,0)
  });return [...grouped.values()]
 },[chosen])
 const invalidate=()=>{setPlan(null);setError('')}
 const change=(key,value,max)=>{setSelected(prev=>({...prev,[key]:Math.max(0,Math.min(max,num(value)))}));invalidate()}
 const chooseOrder=(r,checked)=>{setSelected(prev=>{const next={...prev};r.lines.forEach(i=>{next[i.key]=checked?i.available:0});return next});invalidate()}
 const allSelected=r=>r.lines.every(i=>num(selected[i.key])>eps)
 const missing=stops.filter(s=>!hasAddress(s.client)&&!parseCoords(gpsEdits[s.id]))
 const editVehicle=(id,field,value)=>{setVehicles(prev=>prev.map(v=>v.id===id?{...v,[field]:value}:v));invalidate()}
 const addVehicle=()=>{setVehicles(prev=>[...prev,{id:'v'+Date.now(),name:'Veículo '+String(prev.length+1).padStart(2,'0'),capacity:3000,enabled:true,fixedCost:0}]);invalidate()}
 const activePlan=plan?.routes?.[Math.min(activeRoute,(plan?.routes?.length||1)-1)]||null
 async function optimize(){
   setError('');setPlan(null)
   if(!stops.length){setError('Selecione pelo menos um pedido.');return}
   if(missing.length){setError('Complete a cidade e o estado dos clientes: '+missing.map(x=>x.client?.name||x.id).join(', '));return}
   if(stops.length>18){setError('Para confiabilidade, divida a programação em rotas de até 18 clientes.');return}
   setWorking(true)
   const controller=new AbortController()
   try{
    const addresses=[origin,...stops.map(s=>addressEdits[s.id]||address(s.client))]
    const coords=[],positions=[]
    for(let i=0;i<addresses.length;i++){
      const stop=i===0?null:stops[i-1]
      const direct=stop?parseCoords(gpsEdits[stop.id]):parseCoords(origin)
      const position=direct?{coordinate:direct,approximate:false,query:'Coordenadas GPS',display:'Ponto GPS informado'}:
        await geocodeCandidates(stop?addressCandidates(stop.client,addressEdits[stop.id]):[{q:origin,precision:'informado'}],controller.signal)
      coords.push(position.coordinate);positions.push(position)
      if(!direct&&i<addresses.length-1)await sleep(1100)
    }
    const joined=coords.map(c=>c.join(',')).join(';')
    const base='https://router.project-osrm.org'
    const matrixRes=await fetch(base+'/table/v1/driving/'+joined+'?annotations=duration,distance')
    if(!matrixRes.ok)throw new Error('Serviço de roteirização indisponível')
    const table=await matrixRes.json()
    if(table.code!=='Ok'||table.durations.some(r=>r.some(x=>x===null)))throw new Error('Não foi possível calcular o trajeto rodoviário entre todos os pontos')
    const matrix=table.durations.map((row,i)=>row.map((duration,j)=>({duration,distance:table.distances?.[i]?.[j]})))
    const allocation=optimizeFleet(matrix,stops,vehicles,{returnHome:goBack,objective})
    const routePlans=[]
    for(const assigned of allocation.routes){
      const path=[0,...assigned.indices,...(goBack?[0]:[])]
      const orderedCoords=path.map(i=>coords[i])
      const response=await fetch(base+'/route/v1/driving/'+orderedCoords.map(c=>c.join(',')).join(';')+'?overview=full&geometries=geojson&steps=false')
      if(!response.ok)throw Error('Falha ao obter a rota rodoviária do veículo '+assigned.vehicle.name)
      const routeData=await response.json()
      if(routeData.code!=='Ok'||!routeData.routes?.length)throw Error('Trajeto não encontrado para '+assigned.vehicle.name)
      const result=routeData.routes[0]
      routePlans.push({stops:assigned.stops,vehicle:assigned.vehicle,geometry:result.geometry,
       km:result.distance/1000,minutes:result.duration/60,coordinates:orderedCoords,
       returnHome:goBack,origin,totalKg:assigned.load,
       locationNotes:assigned.stops.map(x=>({...positions[stops.findIndex(z=>z.id===x.id)+1],name:x.client?.name})),
       addressEdits:{...addressEdits},gpsEdits:{...gpsEdits},optimization:{method:allocation.method,objective}})
    }
    setActiveRoute(0)
    setPlan({routes:routePlans,km:routePlans.reduce((a,r)=>a+r.km,0),
      totalKg:kg,minutes:routePlans.reduce((a,r)=>a+r.minutes,0),
      vehicleCount:routePlans.length,origin,returnHome:goBack,roadProfile,
      locationNotes:routePlans.flatMap(r=>r.locationNotes),generatedAt:new Date().toISOString()})
   }catch(e){setError(e.message||'Não foi possível calcular a rota. Verifique os endereços.')}
   finally{setWorking(false)}
 }
 useEffect(()=>{
  if(!activePlan){if(mapInstance.current){mapInstance.current.remove();mapInstance.current=null}return}
  let cancelled=false
  const show=async()=>{
   const L=(await import('leaflet')).default
   if(cancelled||!mapRef.current)return
   if(mapInstance.current)mapInstance.current.remove()
   const map=L.map(mapRef.current,{zoomControl:true,scrollWheelZoom:false})
   mapInstance.current=map
   L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png',{attribution:'© OpenStreetMap contributors',crossOrigin:true,maxZoom:19}).addTo(map)
   const latlngs=activePlan.geometry.coordinates.map(([lon,lat])=>[lat,lon])
   L.polyline(latlngs,{color:'#e87722',weight:6,opacity:.93}).addTo(map)
   const makeMarker=(coord,label,background)=>{
     L.marker([coord[1],coord[0]],{icon:L.divIcon({className:'',html:'<div style="background:'+background+';color:#fff;border:3px solid #fff;border-radius:50%;box-shadow:0 3px 10px #0005;width:32px;height:32px;display:grid;place-items:center;font-weight:800">'+label+'</div>',iconSize:[32,32],iconAnchor:[16,16]})}).addTo(map)
   }
   makeMarker(activePlan.coordinates[0],'CD','#161616')
   activePlan.stops.forEach((s,i)=>makeMarker(activePlan.coordinates[i+1],i+1,'#e87722'))
   map.fitBounds(L.latLngBounds(latlngs),{padding:[35,35]})
   setTimeout(()=>{if(!cancelled)map.invalidateSize()},200)
  }
  show().catch(()=>setError('O mapa não carregou. A sequência de entrega permanece disponível.'))
  return()=>{cancelled=true}
 },[activePlan])
 const mapsUrl=activePlan?routeLink([activePlan.origin,...activePlan.stops.map((stop,i)=>activePlan.gpsEdits?.[stop.id]||activePlan.locationNotes?.[i]?.approximate ? activePlan.coordinates[i+1][1]+','+activePlan.coordinates[i+1][0] : (activePlan.addressEdits?.[stop.id]||address(stop.client))),...(activePlan.returnHome?[activePlan.origin]:[])]):''
 async function pdf(){
  if(!activePlan)return
  const doc=new jsPDF('p','mm','a4')
  const W=210, orange=[232,119,34],dark=[16,16,16]
  doc.setFillColor(...dark);doc.rect(0,0,W,47,'F')
  doc.setFillColor(...orange);doc.rect(0,44,W,3,'F')
  doc.setTextColor(255);doc.setFont('helvetica','bold');doc.setFontSize(11);doc.text('NUTRIALLE  /  GESTÃO LOGÍSTICA',14,14)
  doc.setFontSize(21);doc.text('Rota de entrega',14,28)
  doc.setFontSize(9);doc.text(activePlan.vehicle.name+' · capacidade '+fmt(activePlan.vehicle.capacity)+' kg',14,33)
  doc.setFont('helvetica','normal');doc.setFontSize(9);doc.text('Programação '+date.split('-').reverse().join('/')+'   •   '+activePlan.stops.length+' paradas',14,41)
  doc.setTextColor(...dark)
  const summary=[['Carga',fmt(activePlan.totalKg)+' kg'],['Distância',fmt(activePlan.km)+' km'],['Tempo estimado',fmt(activePlan.minutes/60)+' h'],['Frete',freight===''?'Não informado':reais(num(freight))]]
  summary.forEach((x,i)=>{const xx=14+(i%2)*93,yy=57+Math.floor(i/2)*16;doc.setFontSize(8);doc.setTextColor(118);doc.text(x[0],xx,yy);doc.setTextColor(20);doc.setFont('helvetica','bold');doc.setFontSize(12);doc.text(x[1],xx,yy+6)})
  const costY=94
  doc.setFontSize(9);doc.setFont('helvetica','normal');doc.text('Frete/kg: '+(freight!==''&&activePlan.totalKg>0?reais(num(freight)/activePlan.totalKg):'—'),14,costY)
  doc.text('Frete/km: '+(freight!==''&&activePlan.km>0?reais(num(freight)/activePlan.km):'—'),100,costY)
  doc.setFontSize(9);doc.text('Saída: '+activePlan.origin,14,102)
  doc.text('Motorista: '+(driver||'Não informado')+'     Veículo: '+(vehicle||'Não informado'),14,109)
  let startY=115
  // Mapa no PDF: captura apenas quando tiles permitem CORS; nunca bloqueia o relatório.
  if(mapRef.current){
   try{
    const {default:html2canvas}=await import('html2canvas')
    const canvas=await html2canvas(mapRef.current,{useCORS:true,allowTaint:false,backgroundColor:'#f2f0ec',logging:false,scale:1})
    const img=canvas.toDataURL('image/jpeg',.78)
    doc.addImage(img,'JPEG',14,117,182,66)
    startY=190
   }catch{
     // Sempre oferece representação geográfica vetorial mesmo quando o mapa de tiles bloqueia captura.
     const coords=activePlan.geometry.coordinates
     const minLon=Math.min(...coords.map(c=>c[0])),maxLon=Math.max(...coords.map(c=>c[0]))
     const minLat=Math.min(...coords.map(c=>c[1])),maxLat=Math.max(...coords.map(c=>c[1]))
     const xy=([lon,lat])=>[18+(lon-minLon)/Math.max(.0001,maxLon-minLon)*173,122+(maxLat-lat)/Math.max(.0001,maxLat-minLat)*52]
     doc.setFillColor(247,244,240);doc.roundedRect(14,116,182,65,3,3,'F')
     doc.setDrawColor(232,119,34);doc.setLineWidth(.9)
     for(let i=1;i<coords.length;i++){const a=xy(coords[i-1]),b=xy(coords[i]);doc.line(a[0],a[1],b[0],b[1])}
     const anchors=[activePlan.coordinates[0],...activePlan.coordinates.slice(1,1+activePlan.stops.length)]
     anchors.forEach((coord,i)=>{const [x,y]=xy(coord);doc.setFillColor(i===0?20:232,i===0?20:119,i===0?20:34);doc.circle(x,y,2.2,'F');doc.setFontSize(7);doc.setTextColor(20);doc.text(i===0?'CD':String(i),x+3,y-2)})
     doc.setFontSize(7);doc.setTextColor(110);doc.text('Traçado geográfico da rota (sem mapa-base)',18,178)
     startY=190
    }
  }
  doc.setTextColor(...dark);doc.setFontSize(11);doc.setFont('helvetica','bold');doc.text('Sequência de entregas',14,startY)
  const lines=activePlan.stops.flatMap((stop,i)=>stop.orders.flatMap(o=>o.lines.map(line=>[i+1,stop.client?.name||'Cliente',stop.client?.city||'—',o.ultra_order_number||o.id,line.product,fmt(line.load)+' kg'])))
  autoTable(doc,{startY:startY+5,head:[['#','Cliente','Cidade','Pedido','Produto','Quantidade']],body:lines,theme:'striped',
   styles:{fontSize:7,cellPadding:2.4,overflow:'linebreak'},headStyles:{fillColor:dark,textColor:[255,255,255]},alternateRowStyles:{fillColor:[249,246,242]},
   columnStyles:{0:{cellWidth:9},1:{cellWidth:42},2:{cellWidth:27},3:{cellWidth:25},4:{cellWidth:46},5:{cellWidth:28}},
   margin:{left:14,right:14,bottom:23}})
  let y=(doc.lastAutoTable?.finalY||startY+15)+9
  if(y>265){doc.addPage();y=18}
  doc.setFont('helvetica','bold');doc.setFontSize(9);doc.text('Observações:',14,y)
  doc.setFont('helvetica','normal');doc.setFontSize(8);doc.text(doc.splitTextToSize([notes||'Conferir volumes, documentos fiscais e condições de descarga antes da saída.',...(activePlan.locationNotes||[]).filter(p=>p.approximate).map(p=>'ATENÇÃO: '+p.name+' - localização aproximada; confirmar ponto de entrega.')].join(' | '),180),14,y+6)
  doc.setTextColor(130);doc.setFontSize(8);doc.text('Perfil preferido: '+(plan.roadProfile||'não informado')+'. Perfil ainda não aplicado ao motor rodoviário.',14,281)
  const count=doc.getNumberOfPages()
  for(let p=1;p<=count;p++){doc.setPage(p);doc.setTextColor(130);doc.setFontSize(8);doc.text('Nutrialle • Planejamento logístico | Distância estimada, sujeita a condições da via',14,287);doc.text(p+'/'+count,195,287,{align:'right'})}
  if(mapsUrl)doc.link(14,100,180,7,{url:mapsUrl})
  doc.save('nutrialle-rota-'+activePlan.vehicle.name.replace(/[^a-z0-9-]/gi,'-')+'-'+date+'.pdf')
 }
 return <>
  <Topbar title="Rotas de entrega" subtitle="Planejamento logístico · pedidos, carregamento e frete" />
  <main className="page rt-page">
   <header className="rt-hero">
    <div><div className="rt-eyebrow">NUTRIALLE · LOGÍSTICA</div><h1>Planeje melhor.<br/><em>Entregue com eficiência.</em></h1><p>Selecione os pedidos, ajuste o carregamento e calcule a melhor sequência de entregas.</p></div>
    <IconTruckDelivery size={110} stroke={1.15} className="rt-hero-icon"/>
   </header>
   <div className="rt-metrics">
    <Metric label="Carga selecionada" value={fmt(kg)+' kg'} note={fmt(kg/1000)+' toneladas' } Icon={IconPackage}/>
    <Metric label="Clientes na rota" value={clientCount} note={chosen.length+' pedidos selecionados'} Icon={IconMapPin}/>
    <Metric label="Distância rodoviária" value={plan?fmt(plan.km)+' km':'—'} note={plan?'Percurso calculado':'Calcule a rota para obter'} Icon={IconRoute}/>
    <Metric label="Custo do frete / kg" value={plan&&freight!==''&&kg?reais(num(freight)/kg):'—'} note={plan&&freight!==''&&plan.km?reais(num(freight)/plan.km)+' / km':'Informe o frete, se desejar'} Icon={IconCurrencyReal}/>
   </div>
   {error&&<div className="rt-error"><IconAlertTriangle size={19}/>{error}</div>}
   <div className="rt-layout">
    <section className="rt-pane">
     <div className="rt-pane-head"><div><h2>01 <span>Escolha os pedidos</span></h2><p>Quantidades editáveis em kg, sem alterar o faturamento no Ultra.</p></div><button className="btn btn-ghost btn-sm" onClick={refresh} disabled={loading}><IconRefresh size={16}/> Atualizar</button></div>
     <div className="rt-search"><input placeholder="Buscar cliente, pedido ou cidade..." value={search} onChange={e=>setSearch(e.target.value)}/><strong>{filtered.length} pedidos</strong></div>
     <div className="rt-order-list">
      {loading?<div className="rt-placeholder">Carregando pedidos...</div>:!filtered.length?<div className="rt-placeholder">Nenhum pedido em aberto para esta busca.</div>:filtered.map(r=><article className={'rt-order '+(allSelected(r)?'rt-active':'')} key={r.id}>
       <div className="rt-order-head">
        <label className="rt-check"><input type="checkbox" checked={allSelected(r)} onChange={e=>chooseOrder(r,e.target.checked)}/><span className="rt-order-name">{r.client?.name||'Cliente não localizado'}</span></label>
        <span className="rt-order-id">#{r.ultra_order_number||r.id}</span>
       </div>
       <div className="rt-order-address"><IconMapPin size={14}/>{r.client?([r.client.city,r.client.state].filter(Boolean).join(' / ')||'Endereço incompleto'):'Cadastro não vinculado'}</div>
       <details className="rt-location-edit"><summary>Corrigir localização desta entrega</summary>
        <label>Endereço alternativo (somente nesta rota)</label><input placeholder="Estrada, localidade, cidade, UF" value={addressEdits[r.farm_id]||''} onChange={e=>{setAddressEdits(prev=>({...prev,[r.farm_id]:e.target.value}));invalidate()}}/>
        <label>Coordenadas exatas (latitude, longitude) ou link do Google Maps</label><input placeholder="-24.7200, -53.7400" value={gpsEdits[r.farm_id]||''} onChange={e=>{setGpsEdits(prev=>({...prev,[r.farm_id]:e.target.value}));invalidate()}}/>
        <small>Para sítios e fazendas, prefira a localização GPS da entrada da propriedade. Não altera o cadastro do Ultra.</small>
       </details>
       {r.lines.map(i=><div className="rt-product" key={i.key}><div><strong>{i.product}</strong><small>Saldo estimado {fmt(i.available)} kg{ i.bagKg>0?' · saca '+fmt(i.bagKg)+' kg':''}</small></div><div className="rt-qty"><input aria-label={'Quantidade de '+i.product} type="number" min="0" max={i.available} step="0.01" value={selected[i.key]??0} onChange={e=>change(i.key,e.target.value,i.available)}/><span>kg</span></div></div>)}
      </article>)}
     </div>
    </section>
    <section className="rt-pane rt-config">
     <div className="rt-pane-head"><div><h2>02 <span>Configure a viagem</span></h2><p>Origem, itinerário e custos operacionais.</p></div></div>
     <div className="rt-field"><label>Origem da viagem</label><input value={origin} onChange={e=>{setOrigin(e.target.value);invalidate()}}/></div>
     <div className="rt-field"><label>Data prevista</label><input type="date" value={date} onChange={e=>setDate(e.target.value)}/></div>
     <div className="rt-field"><label>Preferência de vias</label><select value={roadProfile} onChange={e=>{setRoadProfile(e.target.value);invalidate()}}><option value="conservador">Conservadora — preferir vias principais</option><option value="equilibrado">Equilibrada</option><option value="rural">Acesso rural permitido</option></select><small className="rt-warning">Preferência informativa nesta fase. O serviço rodoviário atual não possui filtros confiáveis de pavimentação, peso ou altura. Exige conferência manual.</small></div>
     <div className="rt-fleet"><div className="rt-fleet-title"><strong>Veículos disponíveis</strong><button className="btn btn-ghost btn-sm" type="button" onClick={addVehicle}>+ Adicionar veículo</button></div>
       {vehicles.map(v=><div className="rt-vehicle" key={v.id}>
        <label className="rt-toggle"><input type="checkbox" checked={v.enabled} onChange={e=>editVehicle(v.id,'enabled',e.target.checked)}/> Usar este veículo</label>
        <div className="rt-two"><div className="rt-field"><label>Identificação</label><input value={v.name} onChange={e=>editVehicle(v.id,'name',e.target.value)}/></div>
         <div className="rt-field"><label>Capacidade (kg)</label><input type="number" min="1" step="1" value={v.capacity} onChange={e=>editVehicle(v.id,'capacity',e.target.value)}/></div></div>
        <div className="rt-field"><label>Custo fixo estimado de utilização (R$, opcional)</label><input type="number" min="0" step=".01" value={v.fixedCost} onChange={e=>editVehicle(v.id,'fixedCost',e.target.value)}/></div>
        {vehicles.length>1&&<button className="btn btn-ghost btn-sm" onClick={()=>{setVehicles(prev=>prev.filter(x=>x.id!==v.id));invalidate()}}>Remover veículo</button>}
       </div>)}
     </div>
     <div className="rt-field"><label>Objetivo de otimização</label><select value={objective} onChange={e=>{setObjective(e.target.value);invalidate()}}><option value="duration">Menor tempo de deslocamento</option><option value="distance">Menor distância percorrida (km)</option></select></div>
     <label className="rt-toggle"><input type="checkbox" checked={goBack} onChange={e=>{setGoBack(e.target.checked);invalidate()}}/> Incluir retorno ao ponto de origem</label>
     <div className="rt-two"><div className="rt-field"><label>Frete total (R$) · opcional</label><input placeholder="0,00" type="number" step="0.01" min="0" value={freight} onChange={e=>setFreight(e.target.value)}/></div><div className="rt-field"><label>Veículo / placa</label><input placeholder="Ex.: ABC-1D23" value={vehicle} onChange={e=>setVehicle(e.target.value)}/></div></div>
     <div className="rt-field"><label>Motorista</label><input placeholder="Nome do responsável" value={driver} onChange={e=>setDriver(e.target.value)}/></div>
     <div className="rt-field"><label>Observações de carregamento</label><textarea rows="2" placeholder="Orientações, contatos, restrições..." value={notes} onChange={e=>setNotes(e.target.value)}/></div>
     <button className="btn btn-primary rt-calc" onClick={optimize} disabled={working||!kg}><IconRoute size={20}/>{working?'Calculando trajetos...':'Otimizar rota de entrega'}</button>
     <p className="rt-disclaimer">Motor próprio para múltiplos veículos, com capacidade em kg e melhor distribuição aproximada de clientes. As restrições de estrada, peso, ponte e pavimentação NÃO estão aplicadas ao percurso: confira manualmente antes da viagem.</p>
    </section>
   </div>
   <section className="rt-result">
    <div className="rt-pane-head"><div><h2>03 <span>Rotas otimizadas por veículo</span></h2><p>{plan?plan.vehicleCount+' veículo(s) · '+fmt(plan.km)+' km somados · '+fmt(plan.totalKg)+' kg':'Selecione os pedidos e veículos para calcular.'}</p></div>
    {activePlan&&<div className="rt-actions"><a href={mapsUrl} target="_blank" rel="noreferrer" className="btn btn-ghost"><IconExternalLink size={17}/> Navegar no Maps</a><button className="btn btn-primary" onClick={pdf}><IconFileTypePdf size={18}/> PDF deste veículo</button></div>}</div>
    {plan?.locationNotes?.some(x=>x.approximate)&&<div className="rt-error"><IconAlertTriangle size={18}/> Há localizações aproximadas. Confira as entradas das propriedades antes de enviar veículos.</div>}
    {plan&&<div className="rt-error"><IconAlertTriangle size={18}/> A preferência de estrada é apenas uma indicação: os dados rodoviários atuais não garantem qualidade, pavimentação nem passagem de caminhões. Confirme os trajetos com o motorista.</div>}
    {plan&&<div className="rt-vehicle-tabs">{plan.routes.map((r,i)=><button type="button" key={r.vehicle.id} onClick={()=>setActiveRoute(i)} className={'rt-vehicle-tab '+(activeRoute===i?'selected':'')}><strong>{r.vehicle.name}</strong><span>{fmt(r.totalKg)} kg / {fmt(r.vehicle.capacity)} kg</span><span>{fmt(r.km)} km · {fmt(r.minutes/60)} h</span></button>)}</div>}
    {activePlan?<div className="rt-route-grid">
     <div className="rt-map" ref={mapRef}/>
     <div className="rt-stops">
      <div className="rt-stop"><span className="rt-stop-index rt-start">CD</span><div><strong>Saída • {activePlan.origin}</strong><small>Início da rota</small></div></div>
      {activePlan.stops.map((stop,i)=><div className="rt-stop" key={stop.id}><span className="rt-stop-index">{i+1}</span><div><strong>{stop.client?.name||'Cliente'}</strong><small>{activePlan.addressEdits?.[stop.id]||address(stop.client)} · {fmt(stop.total)} kg</small>
      {activePlan.locationNotes?.[i]?.approximate&&<small style={{color:'#b75b18',fontWeight:800}}>Localização aproximada — conferir acesso</small>}
      {stop.orders.map(o=><div className="rt-stop-product" key={o.id}>{o.ultra_order_number||o.id}: {o.lines.map(x=>x.product+' ('+fmt(x.load)+' kg)').join(' · ')}</div>)}</div></div>)}
      {activePlan.returnHome&&<div className="rt-stop"><span className="rt-stop-index rt-start">CD</span><div><strong>Retorno ao CD</strong><small>{activePlan.origin}</small></div></div>}
      <div className="rt-time"><IconArrowUpRight size={17}/> {fmt(activePlan.km)} km · {fmt(activePlan.minutes/60)} h previstas de condução</div>
      <div className="rt-engine-note"><strong>Motor Nutrialle · VRP capacitado</strong><span>Alocação por capacidade, realocação e melhoria das sequências. Não garante ótimo global.</span></div>
     </div>
    </div>:<div className="rt-empty"><IconRoute size={44} stroke={1.3}/><strong>Monte suas rotas por veículo</strong><span>Selecione pedidos, cadastre capacidades e otimize.</span></div>}
   </section>
  </main>
 </>
}
