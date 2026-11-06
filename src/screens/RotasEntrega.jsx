import { useEffect, useMemo, useRef, useState } from 'react'
import { IconRoute, IconTruckDelivery, IconFileTypePdf, IconMapPin, IconRefresh, IconPackage, IconCurrencyReal, IconAlertTriangle, IconExternalLink, IconArrowUpRight } from '@tabler/icons-react'
import { supabase } from '../lib/supabase'
import Topbar from '../components/Topbar'
import jsPDF from 'jspdf'
import autoTable from 'jspdf-autotable'
import 'leaflet/dist/leaflet.css'
import './RotasEntrega.css'
import { renderRouteMapPdf } from '../lib/routePdfMap'
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
 const [goBack,setGoBack]=useState(false)
 const [objective,setObjective]=useState('duration')
 const [roadProfile,setRoadProfile]=useState('conservador')
 const [vehicles,setVehicles]=useState([{id:'v1',name:'Veículo 01',capacity:5000,enabled:true,cost:''}])
 const [activeRoute,setActiveRoute]=useState(0)
 const [date,setDate]=useState(nowDate)
 const [notes,setNotes]=useState('')
 const [addressEdits,setAddressEdits]=useState({})
 const [gpsEdits,setGpsEdits]=useState({})
 const [plan,setPlan]=useState(null)
 const mapRef=useRef(null)
 const mapInstance=useRef(null)
 const [mapFallback,setMapFallback]=useState('')
 const [mapNotice,setMapNotice]=useState('')
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
 const editVehicle=(id,field,value)=>{setVehicles(prev=>prev.map(v=>v.id===id?{...v,[field]:value}:v));if(field!=='cost')invalidate()}
 const addVehicle=()=>{setVehicles(prev=>[...prev,{id:'v'+Date.now(),name:'Veículo '+String(prev.length+1).padStart(2,'0'),capacity:3000,enabled:true,cost:''}]);invalidate()}
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
  if(!activePlan){
   if(mapInstance.current){mapInstance.current.remove();mapInstance.current=null}
   return
  }
  let cancelled=false
  let map=null
  let observer=null
  let resizeTimer=null
  let tileTimer=null
  let tileLoads=0
  setMapFallback('')
  setMapNotice('')
  // O traçado do PDF é independente do Leaflet e serve de reserva quando
  // o navegador não consegue carregar o mapa interativo ou suas peças.
  const fallback=async(message)=>{
   try{
    const snapshot=await renderRouteMapPdf(activePlan)
    if(!cancelled && tileLoads===0){
     setMapFallback(snapshot.image)
     setMapNotice(message)
    }
   }catch(e){
    console.error('Mapa alternativo indisponível:',e)
    if(!cancelled)setMapNotice('Não foi possível exibir o mapa. A sequência de paradas e o link do Maps continuam disponíveis.')
   }
  }
  const show=async()=>{
   const leaflet=await import('leaflet')
   if(cancelled||!mapRef.current)return
   const L=leaflet.default||leaflet
   if(mapInstance.current){mapInstance.current.remove();mapInstance.current=null}
   const container=mapRef.current
   map=L.map(container,{zoomControl:true,scrollWheelZoom:false})
   mapInstance.current=map
   const tiles=L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png',{attribution:'© OpenStreetMap contributors',maxZoom:19}).addTo(map)
   tiles.on('tileload',()=>{
    tileLoads++
    if(!cancelled){clearTimeout(tileTimer);setMapFallback('');setMapNotice('')}
   })
   const latlngs=(activePlan.geometry?.coordinates||[])
    .filter(([lon,lat])=>Number.isFinite(lon)&&Number.isFinite(lat))
    .map(([lon,lat])=>[lat,lon])
   if(!latlngs.length)throw Error('Rota sem coordenadas para exibir o mapa.')
   L.polyline(latlngs,{color:'#e87722',weight:6,opacity:.93}).addTo(map)
   const makeMarker=(coord,label,background)=>{
    if(!coord)return
    L.marker([coord[1],coord[0]],{icon:L.divIcon({className:'',html:'<div style="background:'+background+';color:#fff;border:3px solid #fff;border-radius:50%;box-shadow:0 3px 10px #0005;width:32px;height:32px;display:grid;place-items:center;font-weight:800">'+label+'</div>',iconSize:[32,32],iconAnchor:[16,16]})}).addTo(map)
   }
   makeMarker(activePlan.coordinates?.[0],'CD','#161616')
   activePlan.stops.forEach((s,i)=>makeMarker(activePlan.coordinates?.[i+1],i+1,'#e87722'))
   map.fitBounds(L.latLngBounds(latlngs),{padding:[35,35]})
   requestAnimationFrame(()=>{if(!cancelled)map?.invalidateSize()})
   resizeTimer=setTimeout(()=>{if(!cancelled)map?.invalidateSize()},300)
   if(typeof ResizeObserver!=='undefined'){
    observer=new ResizeObserver(()=>{if(!cancelled)map?.invalidateSize()})
    observer.observe(container)
   }
   // Se os tiles forem bloqueados, ainda mostramos a rota como no PDF.
   tileTimer=setTimeout(()=>{if(!cancelled && tileLoads===0)void fallback('Mapa alternativo da rota: o mapa interativo não carregou neste navegador.')},7000)
  }
  show().catch(e=>{
   console.error('Falha ao inicializar mapa interativo:',e)
   if(!cancelled){
    if(map){map.remove();if(mapInstance.current===map)mapInstance.current=null;map=null}
    void fallback('Mapa alternativo da rota: não foi possível iniciar o mapa interativo.')
   }
  })
  return()=>{
   cancelled=true
   clearTimeout(resizeTimer)
   clearTimeout(tileTimer)
   observer?.disconnect()
   if(map){map.remove();if(mapInstance.current===map)mapInstance.current=null}
  }
 },[activePlan])
 const mapsUrl=activePlan?routeLink([activePlan.origin,...activePlan.stops.map((stop,i)=>activePlan.gpsEdits?.[stop.id]||activePlan.locationNotes?.[i]?.approximate ? activePlan.coordinates[i+1][1]+','+activePlan.coordinates[i+1][0] : (activePlan.addressEdits?.[stop.id]||address(stop.client))),...(activePlan.returnHome?[activePlan.origin]:[])]):''
 async function pdf(){
  if(!activePlan)return
  const doc=new jsPDF('p','mm','a4')
  const orange=[232,119,34], dark=[17,17,17], muted=[117,107,97]
  const label=(title,value,x,y)=>{doc.setTextColor(...muted);doc.setFont('helvetica','normal');doc.setFontSize(8);doc.text(title,x,y);doc.setTextColor(...dark);doc.setFont('helvetica','bold');doc.setFontSize(13);doc.text(value,x,y+7)}
  const currentVehicle=vehicles.find(v=>v.id===activePlan.vehicle.id)
  const frete=currentVehicle?.cost===''||currentVehicle?.cost==null?null:num(currentVehicle.cost)
  doc.setFillColor(...dark);doc.rect(0,0,210,46,'F')
  doc.setFillColor(...orange);doc.rect(0,43,210,3,'F')
  doc.setTextColor(255);doc.setFont('helvetica','bold');doc.setFontSize(10);doc.text('NUTRIALLE   /   PLANEJAMENTO DE ENTREGAS',14,13)
  doc.setFontSize(23);doc.text('Rota de entrega',14,27)
  doc.setFont('helvetica','normal');doc.setFontSize(9)
  doc.text(activePlan.vehicle.name+'  |  '+date.split('-').reverse().join('/')+'  |  '+activePlan.stops.length+' paradas',14,37)
  label('CARGA',fmt(activePlan.totalKg)+' kg',14,55)
  label('DISTÂNCIA',fmt(activePlan.km)+' km',62,55)
  label('TEMPO DE CONDUÇÃO',fmt(activePlan.minutes/60)+' h',112,55)
  label('FRETE',frete===null?'Não informado':reais(frete),161,55)
  doc.setTextColor(84);doc.setFont('helvetica','normal');doc.setFontSize(9)
  doc.text('Frete/kg: '+(frete!==null&&activePlan.totalKg?reais(frete/activePlan.totalKg):'—'),14,75)
  doc.text('Frete/km: '+(frete!==null&&activePlan.km?reais(frete/activePlan.km):'—'),91,75)
  doc.text('Capacidade: '+fmt(activePlan.vehicle.capacity)+' kg',155,75)
  doc.setFontSize(9);doc.setTextColor(...dark);doc.setFont('helvetica','bold');doc.text('ORIGEM',14,84)
  doc.setFont('helvetica','normal');doc.setFontSize(8.5)
  doc.text(doc.splitTextToSize(activePlan.origin,176).slice(0,2),14,90)
  try{
   const map=await renderRouteMapPdf(activePlan)
   doc.addImage(map.image,'JPEG',14,100,182,90,undefined,'FAST')
  }catch(e){
   console.error('Mapa do PDF:',e)
   doc.setFillColor(245,241,237);doc.roundedRect(14,100,182,90,3,3,'F')
   doc.setTextColor(...muted);doc.setFontSize(10);doc.text('Mapa indisponível. Consulte a sequência de paradas abaixo.',20,143)
  }
  doc.setTextColor(...dark);doc.setFont('helvetica','bold');doc.setFontSize(13);doc.text('Roteiro e pedidos',14,201)
  doc.setFontSize(8);doc.setFont('helvetica','normal');doc.setTextColor(...muted);doc.text('Paradas na ordem otimizada • endereço cadastrado e quantidades planejadas',14,207)
  const rows=[]
  activePlan.stops.forEach((stop,i)=>{
   const addr=activePlan.addressEdits?.[stop.id]||address(stop.client)
   rows.push([{content:String(i+1).padStart(2,'0')+'   '+(stop.client?.name||'Cliente sem nome')+'\n'+addr+
    (activePlan.locationNotes?.[i]?.approximate?'\nATENÇÃO: localização aproximada; confirmar acesso.':''),
    colSpan:4,styles:{fillColor:[249,238,228],textColor:[37,31,25],fontStyle:'bold',fontSize:8.4,cellPadding:{top:4,bottom:4,left:4,right:4}}}])
   stop.orders.forEach(o=>{
    o.lines.forEach(line=>rows.push([
      {content:'PEDIDO',styles:{textColor:[135,125,116],fontSize:7}},
      {content:String(o.ultra_order_number||o.id),styles:{fontStyle:'bold'}},
      {content:line.product},
      {content:fmt(line.load)+' kg',styles:{halign:'right',fontStyle:'bold'}}
    ]))
   })
  })
  autoTable(doc,{
   startY:213,head:[['TIPO','Nº PEDIDO','PRODUTO','QUANTIDADE']],body:rows,theme:'plain',
   margin:{left:14,right:14,bottom:19,top:17},
   styles:{fontSize:8,cellPadding:3,overflow:'linebreak',lineColor:[237,232,225],lineWidth:0.12,valign:'middle'},
   headStyles:{fillColor:dark,textColor:[255,255,255],fontStyle:'bold',fontSize:7.5},
   columnStyles:{0:{cellWidth:24},1:{cellWidth:34},2:{cellWidth:83},3:{cellWidth:41}},
   didDrawPage:()=>{}
  })
  let y=(doc.lastAutoTable?.finalY||213)+9
  if(y>265){doc.addPage();y=23}
  doc.setTextColor(...dark);doc.setFont('helvetica','bold');doc.setFontSize(9);doc.text('Observações',14,y)
  doc.setFont('helvetica','normal');doc.setFontSize(8);doc.setTextColor(90)
  doc.text(doc.splitTextToSize(notes||'Conferir volumes, documentos fiscais e condições de descarga.',175),14,y+6)
  const warning=activePlan.locationNotes?.some(x=>x.approximate)
  if(warning){
   y+=16
   if(y>270){doc.addPage();y=23}
   doc.setTextColor(166,76,25);doc.setFont('helvetica','bold');doc.setFontSize(8)
   doc.text(doc.splitTextToSize('ATENÇÃO: há endereços aproximados. Conferir o ponto de entrega antes da viagem.',175),14,y)
  }
  const count=doc.getNumberOfPages()
  for(let p=1;p<=count;p++){
   doc.setPage(p);doc.setDrawColor(235,229,222);doc.line(14,282,196,282)
   doc.setFont('helvetica','normal');doc.setTextColor(125);doc.setFontSize(7)
   doc.text('NUTRIALLE  •  Distâncias estimadas. Confirmar acessos e condições das vias.',14,288)
   doc.text(p+' / '+count,196,288,{align:'right'})
  }
  if(mapsUrl)doc.link(14,100,182,90,{url:mapsUrl})
  doc.save('Nutrialle-Rota-'+activePlan.vehicle.name.replace(/[^a-z0-9-]/gi,'-')+'-'+date+'.pdf')
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
    <Metric label="Custo do frete / kg" value={plan&&vehicles.some(v=>plan.routes.some(r=>r.vehicle.id===v.id)&&v.cost!=='')&&kg?reais(vehicles.filter(v=>plan.routes.some(r=>r.vehicle.id===v.id)).reduce((sum,v)=>sum+num(v.cost),0)/kg):'—'} note="Somatório dos fretes informados por veículo" Icon={IconCurrencyReal}/>
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
     <div className="rt-field"><label>Ponto de saída</label><input value={origin} onChange={e=>{setOrigin(e.target.value);invalidate()}}/></div>
     <div className="rt-fleet rt-fleet-simple">
      <div className="rt-fleet-title"><div><strong>Veículos da rota</strong><small>Informe apenas a capacidade e, se quiser, o valor do frete de cada um.</small></div><button className="btn btn-ghost btn-sm" type="button" onClick={addVehicle}>+ Veículo</button></div>
      {vehicles.map((v,i)=><div className="rt-vehicle rt-vehicle-simple" key={v.id}>
       <div className="rt-vehicle-heading"><strong>{v.name}</strong>{vehicles.length>1&&<button className="rt-remove-vehicle" type="button" onClick={()=>{setVehicles(prev=>prev.filter(x=>x.id!==v.id));invalidate()}}>Remover</button>}</div>
       <div className="rt-two">
        <div className="rt-field"><label>Capacidade (kg)</label><input aria-label={'Capacidade '+v.name} type="number" min="1" step="1" value={v.capacity} onChange={e=>editVehicle(v.id,'capacity',e.target.value)}/></div>
        <div className="rt-field"><label>Frete do veículo (R$) <span style={{fontWeight:400}}>· opcional</span></label><input aria-label={'Frete '+v.name} type="number" min="0" step=".01" placeholder="Não informado" value={v.cost} onChange={e=>editVehicle(v.id,'cost',e.target.value)}/></div>
       </div>
      </div>)}
     </div>
     <details className="rt-advanced">
      <summary>Mais opções de rota</summary>
      <div className="rt-advanced-content">
       <div className="rt-field"><label>Data prevista</label><input type="date" value={date} onChange={e=>setDate(e.target.value)}/></div>
       <div className="rt-field"><label>Otimizar por</label><select value={objective} onChange={e=>{setObjective(e.target.value);invalidate()}}><option value="duration">Menor tempo de deslocamento</option><option value="distance">Menor distância percorrida</option></select></div>
       <label className="rt-toggle"><input type="checkbox" checked={goBack} onChange={e=>{setGoBack(e.target.checked);invalidate()}}/> Incluir retorno ao CD</label>
       <div className="rt-field"><label>Preferência de vias (informativa)</label><select value={roadProfile} onChange={e=>{setRoadProfile(e.target.value);invalidate()}}><option value="conservador">Conservadora</option><option value="equilibrado">Equilibrada</option><option value="rural">Acesso rural</option></select><small className="rt-warning">A preferência não altera o motor rodoviário atual; confira estradas rurais e restrições de caminhões.</small></div>
       <div className="rt-field"><label>Observações para o PDF</label><textarea rows="2" placeholder="Orientações de entrega..." value={notes} onChange={e=>setNotes(e.target.value)}/></div>
      </div>
     </details>
     <button className="btn btn-primary rt-calc" onClick={optimize} disabled={working||!kg}><IconRoute size={20}/>{working?'Calculando trajetos...':'Otimizar rota de entrega'}</button>
     <p className="rt-disclaimer">Motor próprio para múltiplos veículos, com capacidade em kg e melhor distribuição aproximada de clientes. As restrições de estrada, peso, ponte e pavimentação NÃO estão aplicadas ao percurso: confira manualmente antes da viagem.</p>
    </section>
   </div>
   <section className="rt-result">
    <div className="rt-pane-head"><div><h2>03 <span>Rotas otimizadas por veículo</span></h2><p>{plan?plan.vehicleCount+' veículo(s) · '+fmt(plan.km)+' km somados · '+fmt(plan.totalKg)+' kg':'Selecione os pedidos e veículos para calcular.'}</p></div>
    {activePlan&&<div className="rt-actions"><a href={mapsUrl} target="_blank" rel="noreferrer" className="btn btn-ghost"><IconExternalLink size={17}/> Navegar no Maps</a><button className="btn btn-primary" onClick={pdf}><IconFileTypePdf size={18}/> PDF deste veículo</button></div>}</div>
    {plan?.locationNotes?.some(x=>x.approximate)&&<div className="rt-error"><IconAlertTriangle size={18}/> Há localizações aproximadas. Confira as entradas das propriedades antes de enviar veículos.</div>}
    {plan&&<div className="rt-error"><IconAlertTriangle size={18}/> A preferência de estrada é apenas uma indicação: os dados rodoviários atuais não garantem qualidade, pavimentação nem passagem de caminhões. Confirme os trajetos com o motorista.</div>}
    {plan&&<div className="rt-vehicle-tabs">{plan.routes.map((r,i)=><button type="button" key={r.vehicle.id} onClick={()=>setActiveRoute(i)} className={'rt-vehicle-tab '+(activeRoute===i?'selected':'')}><strong>{r.vehicle.name}</strong><span>{fmt(r.totalKg)} kg / {fmt(r.vehicle.capacity)} kg</span><span>{fmt(r.km)} km · {fmt(r.minutes/60)} h</span><span>{vehicles.find(v=>v.id===r.vehicle.id)?.cost!==''?reais(num(vehicles.find(v=>v.id===r.vehicle.id)?.cost))+' de frete':'Frete não informado'}</span></button>)}</div>}
    {activePlan?<div className="rt-route-grid">
     <div className="rt-map-shell">
      <div className="rt-map" ref={mapRef}/>
      {mapFallback&&<img className="rt-map-fallback" src={mapFallback} alt="Mapa da rota de entrega com traçado e paradas"/>}
      {mapNotice&&<div className="rt-map-notice" role="status">{mapNotice}</div>}
     </div>
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
