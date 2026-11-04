// Matriz rodoviária assimétrica: o percurso A→B pode ser diferente de B→A.
const edge=(matrix,i,j,objective)=>Number(matrix[i][j][objective])
export function routeCost(path,matrix,returnHome,objective='duration'){
 let total=0
 for(let k=1;k<path.length;k++) total+=edge(matrix,path[k-1],path[k],objective)
 return total+(returnHome&&path.length>1?edge(matrix,path[path.length-1],0,objective):0)
}
function exactTsp(matrix,returnHome,objective){
 const stops=matrix.length-1, size=1<<stops
 const dp=Array.from({length:size},()=>new Float64Array(stops).fill(Infinity))
 const parent=Array.from({length:size},()=>new Int16Array(stops).fill(-1))
 for(let i=0;i<stops;i++)dp[1<<i][i]=edge(matrix,0,i+1,objective)
 for(let mask=1;mask<size;mask++){
  for(let last=0;last<stops;last++){
   if(!(mask&(1<<last))||!Number.isFinite(dp[mask][last]))continue
   for(let next=0;next<stops;next++){
    if(mask&(1<<next))continue
    const dest=mask|(1<<next), cost=dp[mask][last]+edge(matrix,last+1,next+1,objective)
    if(cost<dp[dest][next]){dp[dest][next]=cost;parent[dest][next]=last}
   }
  }
 }
 const full=size-1
 let ending=-1,cost=Infinity
 for(let j=0;j<stops;j++){
  const current=dp[full][j]+(returnHome?edge(matrix,j+1,0,objective):0)
  if(current<cost){cost=current;ending=j}
 }
 const path=[],maskRef={value:full}
 while(ending!==-1){
  path.push(ending+1)
  const before=parent[maskRef.value][ending]
  maskRef.value^=1<<ending
  ending=before
 }
 return [0,...path.reverse()]
}
function greedy(matrix,returnHome,objective,first){
 const remaining=new Set(Array.from({length:matrix.length-1},(_,i)=>i+1))
 const path=[0];let current=0
 if(first!=null){path.push(first);remaining.delete(first);current=first}
 while(remaining.size){
  let candidate=-1, best=Infinity
  for(const node of remaining){
   const cost=edge(matrix,current,node,objective)
   if(cost<best){best=cost;candidate=node}
  }
  path.push(candidate);remaining.delete(candidate);current=candidate
 }
 return path
}
function improve(initial,matrix,returnHome,objective){
 let current=initial.slice(),best=routeCost(current,matrix,returnHome,objective)
 let changed=true,iterations=0
 while(changed&&iterations++<60){
  changed=false;let candidatePath=current,candidateCost=best
  const consider=p=>{
   const c=routeCost(p,matrix,returnHome,objective)
   if(c+1e-7<candidateCost){candidateCost=c;candidatePath=p;changed=true}
  }
  for(let i=1;i<current.length;i++)for(let j=i+1;j<current.length;j++){
   const swapped=current.slice();[swapped[i],swapped[j]]=[swapped[j],swapped[i]];consider(swapped)
   consider([...current.slice(0,i),...current.slice(i,j+1).reverse(),...current.slice(j+1)])
  }
  for(let i=1;i<current.length;i++)for(let j=1;j<current.length;j++){
   if(i===j)continue
   const moved=current.slice(),[node]=moved.splice(i,1);moved.splice(j,0,node);consider(moved)
  }
  if(changed){current=candidatePath;best=candidateCost}
 }
 return current
}
export function optimizeRoute(matrix,{returnHome=true,objective='duration'}={}){
 const n=matrix.length
 if(n<2)return {path:[0],method:'trivial',objective,score:0,baseline:0}
 if(!['duration','distance'].includes(objective))throw new Error('Objetivo inválido')
 for(let i=0;i<n;i++)for(let j=0;j<n;j++)
  if(!Number.isFinite(edge(matrix,i,j,objective))||edge(matrix,i,j,objective)<0)
   throw new Error('Matriz incompleta. Não é possível calcular uma rota confiável.')
 const baselinePath=greedy(matrix,returnHome,objective)
 const baseline=routeCost(baselinePath,matrix,returnHome,objective)
 let path,method
 if(n-1<=13){path=exactTsp(matrix,returnHome,objective);method='Exato (programação dinâmica)'}
 else{
  method='Busca avançada multistart (2-opt, realocação, troca)'
  path=baselinePath
  let best=baseline
  for(let start=1;start<n;start++){
   const candidate=improve(greedy(matrix,returnHome,objective,start),matrix,returnHome,objective)
   const score=routeCost(candidate,matrix,returnHome,objective)
   if(score<best){path=candidate;best=score}
  }
 }
 return {path,method,objective,score:routeCost(path,matrix,returnHome,objective),baseline,
 improvementPct:baseline>0?Math.max(0,(baseline-routeCost(path,matrix,returnHome,objective))/baseline*100):0}
}
