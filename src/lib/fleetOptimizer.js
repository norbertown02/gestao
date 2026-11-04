import { optimizeRoute, routeCost } from './routeOptimizer'

// VRP capacitado: cada cliente é uma entrega indivisível. Sem divisão silenciosa de pedidos.
const EPS = 1e-6
const numeric = v => Number(v) || 0
function submatrix(matrix, ids) { return ids.map(i => ids.map(j => matrix[i][j])) }
function routeMetrics(ids,matrix,returnHome,objective) {
 if(!ids.length)return {path:[],score:0,distance:0,duration:0,method:'sem carga'}
 const subset=[0,...ids]
 const solution=optimizeRoute(submatrix(matrix,subset),{returnHome,objective})
 const ordered=solution.path.slice(1).map(idx=>subset[idx])
 const original=[0,...ordered]
 return {path:ordered,score:routeCost(original,matrix,returnHome,objective),
  distance:routeCost(original,matrix,returnHome,'distance'),
  duration:routeCost(original,matrix,returnHome,'duration'),method:solution.method}
}
export function optimizeFleet(matrix,stops,vehicles,{returnHome=true,objective='distance'}={}){
 if(!stops.length)throw Error('Selecione pelo menos uma entrega.')
 if(stops.length>18)throw Error('Divida o carregamento em lotes de até 18 destinos.')
 const active=vehicles.filter(v=>v.enabled&&numeric(v.capacity)>0)
 if(!active.length)throw Error('Habilite ao menos um veículo com capacidade em kg.')
 const ordered=stops.map((stop,i)=>({...stop,matrixId:i+1,kg:numeric(stop.total)})).sort((a,b)=>b.kg-a.kg)
 const total=ordered.reduce((a,s)=>a+s.kg,0)
 if(active.reduce((a,v)=>a+numeric(v.capacity),0)+EPS<total)throw Error('Capacidade conjunta insuficiente: '+Math.round(total)+' kg selecionados.')
 for(const stop of ordered) if(!active.some(v=>numeric(v.capacity)+EPS>=stop.kg))
   throw Error('A entrega de '+(stop.client?.name||stop.id)+' ('+stop.kg+' kg) excede a capacidade individual dos veículos. Divida o pedido manualmente em outra programação.')
 const routes=active.map(vehicle=>({vehicle,ids:[],load:0}))
 const evaluate=r=>routeMetrics(r.ids,matrix,returnHome,objective)
 // Insertion by marginal travel cost: respects capacity and the true road network.
 for(const stop of ordered){
  let choice=null
  for(let i=0;i<routes.length;i++){
   const r=routes[i]
   if(r.load+stop.kg>numeric(r.vehicle.capacity)+EPS)continue
   const before=evaluate(r)
   const after=routeMetrics([...r.ids,stop.matrixId],matrix,returnHome,objective)
   const cost=(after.score-before.score)+(r.ids.length===0?numeric(r.vehicle.fixedCost):0)
   if(!choice||cost<choice.cost-EPS)choice={i,cost}
  }
  if(!choice)throw Error('Não foi possível distribuir a carga sem ultrapassar as capacidades.')
  routes[choice.i].ids.push(stop.matrixId);routes[choice.i].load+=stop.kg
 }
 // Improvement: relocate/swap whole clients between trucks when total travel falls.
 let current=routes, currentCost=()=>current.reduce((sum,r)=>sum+evaluate(r).score+(r.ids.length?numeric(r.vehicle.fixedCost):0),0)
 for(let iteration=0;iteration<12;iteration++){
  let bestCost=currentCost(),bestChange=null
  for(let a=0;a<current.length;a++)for(let b=0;b<current.length;b++)if(a!==b){
   const A=current[a],B=current[b]
   for(const i of A.ids){
    const stop=ordered.find(s=>s.matrixId===i)
    if(B.load+stop.kg<=numeric(B.vehicle.capacity)+EPS){
     const nextA=A.ids.filter(x=>x!==i),nextB=[...B.ids,i]
     const cost=routeMetrics(nextA,matrix,returnHome,objective).score+routeMetrics(nextB,matrix,returnHome,objective).score+
       (nextA.length?numeric(A.vehicle.fixedCost):0)+(nextB.length?numeric(B.vehicle.fixedCost):0)
     const old=evaluate(A).score+evaluate(B).score+(A.ids.length?numeric(A.vehicle.fixedCost):0)+(B.ids.length?numeric(B.vehicle.fixedCost):0)
     const improvement=old-cost
     if(improvement>EPS&&bestCost-currentCost()+improvement>EPS){bestCost=currentCost()-improvement;bestChange={type:'move',a,b,i,stop}}
    }
    for(const j of B.ids){
     const other=ordered.find(s=>s.matrixId===j)
     if(A.load-stop.kg+other.kg>numeric(A.vehicle.capacity)+EPS||B.load-other.kg+stop.kg>numeric(B.vehicle.capacity)+EPS)continue
     const nextA=A.ids.map(x=>x===i?j:x),nextB=B.ids.map(x=>x===j?i:x)
     const old=evaluate(A).score+evaluate(B).score
     const cost=routeMetrics(nextA,matrix,returnHome,objective).score+routeMetrics(nextB,matrix,returnHome,objective).score
     if(old-cost>EPS&&currentCost()-(old-cost)<bestCost){bestCost=currentCost()-(old-cost);bestChange={type:'swap',a,b,i,j,stop,other}}
    }
   }
  }
  if(!bestChange)break
  const {a,b,i,j,stop,other,type}=bestChange
  if(type==='move'){current[a].ids=current[a].ids.filter(x=>x!==i);current[a].load-=stop.kg;current[b].ids.push(i);current[b].load+=stop.kg}
  else{current[a].ids=current[a].ids.map(x=>x===i?j:x);current[b].ids=current[b].ids.map(x=>x===j?i:x);current[a].load+=other.kg-stop.kg;current[b].load+=stop.kg-other.kg}
 }
 const mapped=routes.filter(r=>r.ids.length).map(r=>{
  const metrics=evaluate(r)
  return {vehicle:r.vehicle,load:r.load,stops:metrics.path.map(i=>stops[i-1]),indices:metrics.path,
   meters:metrics.distance,seconds:metrics.duration,score:metrics.score,method:metrics.method}
 })
 return {routes:mapped,totalKg:total,totalMeters:mapped.reduce((a,r)=>a+r.meters,0),
 totalSeconds:mapped.reduce((a,r)=>a+r.seconds,0),method:'VRP capacitado — inserção econômica, realocação e trocas locais',
 approximate:true}
}
