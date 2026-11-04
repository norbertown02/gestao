// Renderer estável para o PDF: desenha mapa e geometria no mesmo canvas.
// Não captura o DOM do Leaflet (transformações CSS causavam mosaicos desalinhados).
const TILE=256
const mercator=(lon,lat,z)=>{
 const scale=TILE*2**z
 const sin=Math.sin(Math.max(-85,Math.min(85,lat))*Math.PI/180)
 return [(lon+180)/360*scale,(.5-Math.log((1+sin)/(1-sin))/(4*Math.PI))*scale]
}
const readTile=(z,x,y,timeout=4800)=>new Promise(resolve=>{
 const img=new Image()
 img.crossOrigin='anonymous'
 let done=false
 const finish=ok=>{if(done)return;done=true;clearTimeout(timer);resolve(ok?img:null)}
 const timer=setTimeout(()=>finish(false),timeout)
 img.onload=()=>finish(true)
 img.onerror=()=>finish(false)
 img.src='https://tile.openstreetmap.org/'+z+'/'+x+'/'+y+'.png'
})
export async function renderRouteMapPdf(route){
 const width=1200,height=590,pad=75
 const canvas=document.createElement('canvas');canvas.width=width;canvas.height=height
 const ctx=canvas.getContext('2d')
 ctx.fillStyle='#eef0eb';ctx.fillRect(0,0,width,height)
 const points=route.geometry?.coordinates||[]
 if(!points.length)throw Error('Rota sem coordenadas.')
 const anchors=[route.coordinates[0],...route.coordinates.slice(1,1+route.stops.length)].filter(Boolean)
 let zoom=2,left=0,top=0
 for(let z=15;z>=2;z--){
   const projected=points.map(p=>mercator(p[0],p[1],z))
   const xs=projected.map(p=>p[0]),ys=projected.map(p=>p[1])
   const minX=Math.min(...xs),maxX=Math.max(...xs),minY=Math.min(...ys),maxY=Math.max(...ys)
   if((maxX-minX<=width-2*pad && maxY-minY<=height-2*pad)||z===2){
     zoom=z;left=(minX+maxX-width)/2;top=(minY+maxY-height)/2;break
   }
 }
 const tiles=[]
 const max=2**zoom
 for(let y=Math.floor(top/TILE);y<=Math.floor((top+height)/TILE);y++)
 for(let x=Math.floor(left/TILE);x<=Math.floor((left+width)/TILE);x++){
  if(y<0||y>=max)continue
  tiles.push({x,y,dx:x*TILE-left,dy:y*TILE-top})
 }
 // Tenta desenhar as peças no lugar exato; não interrompe o PDF se um tile falhar.
 const images=await Promise.all(tiles.map(t=>readTile(zoom,((t.x%max)+max)%max,t.y)))
 let loaded=0
 images.forEach((img,i)=>{if(img){loaded++;ctx.drawImage(img,tiles[i].dx,tiles[i].dy,TILE,TILE)}})
 const projection=p=>{const [x,y]=mercator(p[0],p[1],zoom);return [x-left,y-top]}
 ctx.lineJoin='round';ctx.lineCap='round'
 function road(stroke,width){
  ctx.beginPath()
  points.forEach((p,i)=>{const [x,y]=projection(p);if(i===0)ctx.moveTo(x,y);else ctx.lineTo(x,y)})
  ctx.strokeStyle=stroke;ctx.lineWidth=width;ctx.stroke()
 }
 road('rgba(255,255,255,.98)',18)
 road('#df7121',10)
 anchors.forEach((point,i)=>{
  const [x,y]=projection(point)
  ctx.beginPath();ctx.arc(x,y,21,0,2*Math.PI);ctx.fillStyle=i===0?'#1a1a1a':'#e87722';ctx.fill()
  ctx.lineWidth=5;ctx.strokeStyle='#fff';ctx.stroke()
  ctx.font='bold 20px Arial, sans-serif';ctx.textAlign='center';ctx.textBaseline='middle';ctx.fillStyle='#fff';ctx.fillText(i===0?'CD':String(i),x,y+1)
 })
 // Cabeçalho discreto para separar mapa das informações do PDF.
 ctx.fillStyle='rgba(17,17,17,.90)';ctx.fillRect(0,0,width,45)
 ctx.font='bold 20px Arial, sans-serif';ctx.textAlign='left';ctx.textBaseline='middle';ctx.fillStyle='#fff'
 ctx.fillText('MAPA DA ROTA  •  '+route.stops.length+' PARADAS',25,24)
 ctx.fillStyle='rgba(255,255,255,.92)';ctx.fillRect(0,height-32,width,32)
 ctx.font='17px Arial, sans-serif';ctx.textAlign='right';ctx.textBaseline='middle';ctx.fillStyle='#555'
 ctx.fillText(loaded?'© OpenStreetMap contributors':'Mapa-base indisponível • traçado geográfico da rota',width-16,height-16)
 return {image:canvas.toDataURL('image/jpeg',.91),tilesLoaded:loaded,tilesExpected:tiles.length}
}
