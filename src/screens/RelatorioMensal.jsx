import { useState, useEffect } from 'react'
import { supabase } from '../lib/supabase'
import Topbar from '../components/Topbar'
import { IconDownload, IconFileText, IconCalendar } from '@tabler/icons-react'
import jsPDF from 'jspdf'
import logoNutrialle from '../assets/logo-nutrialle.jpg'
import autoTable from 'jspdf-autotable'

function fmt(n) { return Number(n||0).toLocaleString('pt-BR',{minimumFractionDigits:2,maximumFractionDigits:2}) }
function fmtK(n) { if(n>=1000000) return `R$ ${(n/1000000).toFixed(1)}M`; if(n>=1000) return `R$ ${(n/1000).toFixed(1)}k`; return `R$ ${fmt(n)}` }
function pct(a,b) { if(!b) return '0.0'; return ((a-b)/b*100).toFixed(1) }
function toISO(d) { return d.toISOString().split('T')[0] }

function getMes(offset=0) {
  const d=new Date(); d.setMonth(d.getMonth()+offset)
  return { ano:d.getFullYear(), mes:d.getMonth()+1, label:d.toLocaleDateString('pt-BR',{month:'long',year:'numeric'}) }
}

function mesRange(ano,mes) {
  const ini=new Date(ano,mes-1,1), fim=new Date(ano,mes,0)
  return [toISO(ini),toISO(fim)]
}


function trimestreRange(ano, trim) {
  const mesIni = (trim-1)*3+1
  const ini = new Date(ano, mesIni-1, 1)
  const fim = new Date(ano, mesIni+2, 0)
  return [ini.toISOString().split('T')[0], fim.toISOString().split('T')[0]]
}
function anoRange(ano) {
  return [ano+'-01-01', ano+'-12-31']
}
function getPeriodoRange(tipo, ano, mes, trim) {
  if(tipo==='mensal') return mesRange(ano, mes)
  if(tipo==='trimestral') return trimestreRange(ano, trim)
  return anoRange(ano)
}
function getAnteriorRange(tipo, ano, mes, trim) {
  if(tipo==='mensal') {
    const d = new Date(ano, mes-2, 1)
    return [d.toISOString().split('T')[0], new Date(ano, mes-1, 0).toISOString().split('T')[0]]
  }
  if(tipo==='trimestral') {
    const trimAnt = trim===1?4:trim-1
    const anoAnt = trim===1?ano-1:ano
    return trimestreRange(anoAnt, trimAnt)
  }
  return anoRange(ano-1)
}
export default function RelatorioMensal() {
  const [mesSel,    setMesSel]    = useState(getMes(0))
  const [tipoPeriodo, setTipoPeriodo] = useState('mensal') // mensal | trimestral | anual
  const [anoSel,    setAnoSel]    = useState(new Date().getFullYear())
  const [trimSel,   setTrimSel]   = useState(Math.ceil((new Date().getMonth()+1)/3))
  const [dados,     setDados]     = useState(null)
  const [loading,   setLoading]   = useState(false)
  const [gerandoPDF,setGerandoPDF]= useState(false)

  // Meses disponíveis (últimos 12)
  const mesesOpcoes = Array.from({length:13},(_,i)=>getMes(-i))

  useEffect(()=>{ carregar() },[mesSel, tipoPeriodo, anoSel, trimSel])

  async function carregar() {
    setLoading(true)
    const [ini,fim] = getPeriodoRange(tipoPeriodo, anoSel, mesSel.mes, trimSel)
    const [iniAnt,fimAnt] = getAnteriorRange(tipoPeriodo, anoSel, mesSel.mes, trimSel)

    const [
      salesMes, salesAnt, visitsMes, visitsAnt,
      farms, checklists, sellers, appointments
    ] = await Promise.all([
      supabase.from('sales').select('*').gte('sale_date',ini).lte('sale_date',fim),
      supabase.from('sales').select('*').gte('sale_date',iniAnt).lte('sale_date',fimAnt),
      supabase.from('visits').select('*').gte('visit_date',ini).lte('visit_date',fim),
      supabase.from('visits').select('*').gte('visit_date',iniAnt).lte('visit_date',fimAnt),
      supabase.from('farms').select('*').eq('status','ativo'),
      supabase.from('checklists').select('*').gte('applied_at',ini).lte('applied_at',fim),
      supabase.from('sellers').select('*').eq('active',true),
      supabase.from('appointments').select('*').gte('appointment_date',toISO(new Date())).lte('appointment_date',toISO(new Date(new Date().setDate(new Date().getDate()+30)))),
    ])

    // Cotações em aberto
    const {data:quotesData} = await supabase.from('quotes').select('status,total')
    const qs = quotesData||[]
    const cotacoesAbertas = qs.filter(q=>q.status==='rascunho'||q.status==='enviada')
    const valorCotacoesAbertas = cotacoesAbertas.reduce((a,q)=>a+Number(q.total||0),0)

    const sm=salesMes.data||[], sa=salesAnt.data||[]
    const vm=visitsMes.data||[], va=visitsAnt.data||[]
    const fs=farms.data||[], ck=checklists.data||[], sl=sellers.data||[]

    const fatMes  = sm.reduce((a,s)=>a+Number(s.total||0),0)
    const fatAnt  = sa.reduce((a,s)=>a+Number(s.total||0),0)
    const tickMes = sm.length?fatMes/sm.length:0
    const tickAnt = sa.length?fatAnt/sa.length:0
    const scoreMedia = ck.length?Math.round(ck.reduce((a,c)=>a+Number(c.overall_score||0),0)/ck.length):0

    // Carteira ativa
    const d90=new Date(); d90.setDate(d90.getDate()-90)
    const allSales=(await supabase.from('sales').select('farm_id,sale_date')).data||[]
    const ativas=new Set(allSales.filter(s=>new Date(s.sale_date)>=d90).map(s=>s.farm_id))

    // Top vendedores
    const vMap={}
    sm.forEach(s=>{ const k=s.seller_id||'geral'; if(!vMap[k]) vMap[k]={id:k,total:0,pedidos:0}; vMap[k].total+=Number(s.total||0); vMap[k].pedidos++ })
    const topVendedores=Object.values(vMap).sort((a,b)=>b.total-a.total).slice(0,5)

    // Top fazendas
    const fMap={}
    sm.forEach(s=>{ if(!fMap[s.farm_id]) fMap[s.farm_id]={id:s.farm_id,total:0,pedidos:0}; fMap[s.farm_id].total+=Number(s.total||0); fMap[s.farm_id].pedidos++ })
    const topFazendas=Object.entries(fMap).sort((a,b)=>b[1].total-a[1].total).slice(0,5)
      .map(([id,v])=>({...v,name:fs.find(f=>f.id===id)?.name||'—',segment:fs.find(f=>f.id===id)?.segment||'—'}))

    // Por segmento
    const segMap={}
    sm.forEach(s=>{ const seg=fs.find(f=>f.id===s.farm_id)?.segment||'outros'; segMap[seg]=(segMap[seg]||0)+Number(s.total||0) })

    // Novas fazendas no mês
    const novasFazendas=fs.filter(f=>f.created_at>=ini&&f.created_at<=fim+'T23:59:59')

    // Fazendas esquecidas
    const ultimaVisita={}
    const allVisits=(await supabase.from('visits').select('farm_id,visit_date').order('visit_date',{ascending:false})).data||[]
    allVisits.forEach(v=>{ if(!ultimaVisita[v.farm_id]) ultimaVisita[v.farm_id]=v.visit_date })
    const hoje=new Date()
    const esquecidas=fs.filter(f=>{ const uv=ultimaVisita[f.id]; return !uv||(hoje-new Date(uv+'T12:00:00'))/86400000>45 })

    // Vendas com desconto
    const comDesconto=sm.filter(s=>s.needs_approval)

    // Próximas visitas
    const proximas=appointments.data||[]

    // Vendas por fazenda — mês atual vs anterior
    const fMapMes={}, fMapAnt={}
    sm.forEach(s=>{ fMapMes[s.farm_id]=(fMapMes[s.farm_id]||0)+Number(s.total||0) })
    sa.forEach(s=>{ fMapAnt[s.farm_id]=(fMapAnt[s.farm_id]||0)+Number(s.total||0) })

    // Fazendas com queda >40%
    const fazendasEmQueda=fs.filter(f=>{
      const atual=fMapMes[f.id]||0, ant=fMapAnt[f.id]||0
      return ant>0 && atual<ant && ((ant-atual)/ant*100)>40
    }).map(f=>({...f,atual:fMapMes[f.id]||0,anterior:fMapAnt[f.id]||0,queda:((fMapAnt[f.id]-(fMapMes[f.id]||0))/fMapAnt[f.id]*100).toFixed(1)}))

    // Vendedores com queda >30% — agrupamos por seller_id quando disponível, senão geral
    const vMapMes={}, vMapAnt={}
    sm.forEach(s=>{ const k=s.seller_id||'geral'; vMapMes[k]=(vMapMes[k]||0)+Number(s.total||0) })
    sa.forEach(s=>{ const k=s.seller_id||'geral'; vMapAnt[k]=(vMapAnt[k]||0)+Number(s.total||0) })
    const vendedoresEmQueda=sl.filter(s=>{
      const atual=vMapMes[s.id]||0, ant=vMapAnt[s.id]||0
      return ant>0 && atual<ant && ((ant-atual)/ant*100)>30
    }).map(s=>({...s,atual:vMapMes[s.id]||0,anterior:vMapAnt[s.id]||0,queda:((vMapAnt[s.id]-(vMapMes[s.id]||0))/vMapAnt[s.id]*100).toFixed(1)}))

    setDados({
      fatMes,fatAnt,tickMes,tickAnt,fazendasEmQueda,vendedoresEmQueda,
      pedMes:sm.length,pedAnt:sa.length,
      visitMes:vm.length,visitAnt:va.length,
      carteiraAtiva:ativas.size,carteiraTot:fs.length,
      scoreMedia,checklists:ck.length,
      topVendedores,topFazendas,segMap,
      novasFazendas,esquecidas,comDesconto,
      proximas,sellers:sl,farms:fs,fazendasEmQueda,vendedoresEmQueda,
      cotacoesAbertas:cotacoesAbertas.length,valorCotacoesAbertas,
    })
    setLoading(false)
  }

  async function gerarPDF() {
    if(!dados) return
    setGerandoPDF(true)

    const doc = new jsPDF('p','mm','a4')
    const W=210, margin=20
    let y=margin

    const laranja  = [240,125,26]
    const cinzaEsc = [50,50,50]
    const cinzaMed = [120,120,120]
    const cinzaCla = [240,240,240]
    const verde    = [47,158,68]
    const vermelho = [224,49,49]

    function addPage() { doc.addPage(); y=margin }
    function checkPage(needed=30) { if(y+needed>280) addPage() }
    function titulo(txt,size=14,cor=cinzaEsc) { doc.setFontSize(size); doc.setTextColor(...cor); doc.setFont('helvetica','bold'); doc.text(txt,margin,y); y+=size*0.5+4 }
    function subtitulo(txt) { titulo(txt,10,cinzaMed) }
    function texto(txt,bold=false) { doc.setFontSize(9); doc.setTextColor(...cinzaEsc); doc.setFont('helvetica',bold?'bold':'normal'); doc.text(txt,margin,y,{maxWidth:W-margin*2}); y+=6 }
    function linha() { doc.setDrawColor(...cinzaCla); doc.line(margin,y,W-margin,y); y+=4 }
    function kpiBox(label,value,x,w,cor=cinzaEsc) {
      doc.setFillColor(...cinzaCla); doc.roundedRect(x,y,w,16,2,2,'F')
      doc.setFontSize(7); doc.setTextColor(...cinzaMed); doc.setFont('helvetica','normal')
      doc.text(label,x+4,y+5)
      doc.setFontSize(12); doc.setTextColor(...cor); doc.setFont('helvetica','bold')
      doc.text(String(value),x+4,y+12)
    }

    // ── CAPA ──────────────────────────────────────────────────────────────────
    doc.setFillColor(...laranja); doc.rect(0,0,W,60,'F')
    // Logo
    try { doc.addImage(logoNutrialle,'JPEG',margin,10,40,40) } catch(e) {}
    doc.setFontSize(22); doc.setTextColor(255,255,255); doc.setFont('helvetica','bold')
    doc.text('NUTRIALLE',margin+46,28)
    doc.setFontSize(12); doc.setFont('helvetica','normal')
    doc.text('Relatório Mensal — '+mesSel.label.charAt(0).toUpperCase()+mesSel.label.slice(1),margin+46,38)
    doc.setFontSize(9)
    doc.text('Gerado em '+new Date().toLocaleDateString('pt-BR',{day:'2-digit',month:'long',year:'numeric'}),margin+46,46)
    y=75

    // ── RESUMO EXECUTIVO ──────────────────────────────────────────────────────
    titulo('Resumo Executivo',13,laranja)
    linha()
    const varFat=parseFloat(pct(dados.fatMes,dados.fatAnt))
    const varPed=parseFloat(pct(dados.pedMes,dados.pedAnt))
    const resumos=[
      `Faturamento de ${fmtK(dados.fatMes)}, ${varFat>=0?'alta':'queda'} de ${Math.abs(varFat)}% vs mês anterior.`,
      `${dados.pedMes} pedidos no mês, ticket médio de ${fmtK(dados.tickMes)}.`,
      `${dados.visitMes} visitas realizadas, carteira ativa com ${dados.carteiraAtiva} fazendas.`,
      dados.scoreMedia>0?`Score técnico médio da carteira: ${dados.scoreMedia}/100.`:'',
      dados.novasFazendas?.length>0?`${dados.novasFazendas.length} nova(s) fazenda(s) cadastrada(s) no mês.`:'',
      dados.esquecidas?.length>0?`${dados.esquecidas.length} fazenda(s) sem visita há mais de 45 dias — atenção requerida.`:'',
      dados.fazendasEmQueda?.length>0?`${dados.fazendasEmQueda.length} fazenda(s) com queda de faturamento acima de 40% vs mês anterior.`:'',
      dados.vendedoresEmQueda?.length>0?`${dados.vendedoresEmQueda.length} vendedor(es) com queda acima de 30% vs mês anterior.`:'',
    ].filter(Boolean)
    resumos.forEach(r=>texto('• '+r))
    y+=4

    // ── KPIs ──────────────────────────────────────────────────────────────────
    checkPage(40)
    titulo('KPIs Principais',13,laranja)
    linha()
    const colW=(W-margin*2-12)/4
    const kpis=[
      {label:'Faturamento',  value:fmtK(dados.fatMes),  cor:laranja},
      {label:'Pedidos',      value:dados.pedMes,         cor:cinzaEsc},
      {label:'Ticket médio', value:fmtK(dados.tickMes),  cor:cinzaEsc},
      {label:'Visitas',      value:dados.visitMes,        cor:cinzaEsc},
    ]
    kpis.forEach((k,i)=>kpiBox(k.label,k.value,margin+i*(colW+4),colW,k.cor))
    y+=22
    const kpis2=[
      {label:'Carteira ativa', value:dados.carteiraAtiva+' faz.',cor:cinzaEsc},
      {label:'Checklists',     value:dados.checklists,            cor:cinzaEsc},
      {label:'Score médio',    value:dados.scoreMedia||'—',       cor:dados.scoreMedia>=75?verde:vermelho},
      {label:'Com desconto',   value:dados.comDesconto?.length||0, cor:cinzaEsc},
    ]
    kpis2.forEach((k,i)=>kpiBox(k.label,k.value,margin+i*(colW+4),colW,k.cor))
    y+=22

    // ── COMPARATIVO ───────────────────────────────────────────────────────────
    checkPage(40)
    titulo('Comparativo com Mês Anterior',13,laranja)
    linha()
    autoTable(doc,{
      startY:y,
      head:[['Métrica','Período atual','Período anterior','Variação']],
      body:[
        ['Faturamento',fmtK(dados.fatMes),fmtK(dados.fatAnt),(varFat>=0?'+':'')+varFat+'%'],
        ['Pedidos',dados.pedMes,dados.pedAnt,(varPed>=0?'+':'')+varPed+'%'],
        ['Ticket médio',fmtK(dados.tickMes),fmtK(dados.tickAnt),pct(dados.tickMes,dados.tickAnt)+'%'],
        ['Visitas',dados.visitMes,dados.visitAnt,pct(dados.visitMes,dados.visitAnt)+'%'],
      ],
      theme:'striped',
      headStyles:{fillColor:laranja,textColor:[255,255,255],fontSize:9},
      bodyStyles:{fontSize:9},
      margin:{left:margin,right:margin},
    })
    y=doc.lastAutoTable.finalY+8

    // ── TOP FAZENDAS ──────────────────────────────────────────────────────────
    checkPage(50)
    titulo('Top 5 Fazendas',13,laranja)
    linha()
    if(dados.topFazendas.length>0){
      autoTable(doc,{
        startY:y,
        head:[['#','Fazenda','Segmento','Pedidos','Faturamento']],
        body:dados.topFazendas.map((f,i)=>[i+1,f.name,f.segment||'—',f.pedidos,'R$ '+fmt(f.total)]),
        theme:'striped',
        headStyles:{fillColor:laranja,textColor:[255,255,255],fontSize:9},
        bodyStyles:{fontSize:9},
        margin:{left:margin,right:margin},
      })
      y=doc.lastAutoTable.finalY+8
    } else { texto('Sem dados de vendas no período.'); y+=4 }

    // ── ATENÇÃO ───────────────────────────────────────────────────────────────
    checkPage(50)
    titulo('Pontos de Atenção',13,[224,49,49])
    linha()
    if(dados.esquecidas?.length>0){
      subtitulo('Fazendas sem visita há mais de 45 dias:')
      autoTable(doc,{
        startY:y,
        head:[['Fazenda','Segmento','Cidade']],
        body:dados.esquecidas.slice(0,10).map(f=>[f.name,f.segment||'—',f.city||'—']),
        theme:'striped',
        headStyles:{fillColor:[224,49,49],textColor:[255,255,255],fontSize:9},
        bodyStyles:{fontSize:9},
        margin:{left:margin,right:margin},
      })
      y=doc.lastAutoTable.finalY+8
    }
    if(dados.comDesconto?.length>0){
      checkPage(30)
      subtitulo('Vendas com desconto acima do limite:')
      autoTable(doc,{
        startY:y,
        head:[['Data','Fazenda','Total']],
        body:dados.comDesconto.map(s=>[
          s.sale_date,
          dados.farms?.find(f=>f.id===s.farm_id)?.name||'—',
          'R$ '+fmt(s.total)
        ]),
        theme:'striped',
        headStyles:{fillColor:[240,125,26],textColor:[255,255,255],fontSize:9},
        bodyStyles:{fontSize:9},
        margin:{left:margin,right:margin},
      })
      y=doc.lastAutoTable.finalY+8
    }

    // ── FAZENDAS EM QUEDA ─────────────────────────────────────────────────────
    if(dados.fazendasEmQueda?.length>0){
      checkPage(40)
      subtitulo('Fazendas com queda de faturamento >40% vs mês anterior:')
      autoTable(doc,{
        startY:y,
        head:[['Fazenda','Segmento','Período atual','Período anterior','Queda']],
        body:dados.fazendasEmQueda.map(f=>[f.name,f.segment||'—','R$ '+fmt(f.atual),'R$ '+fmt(f.anterior),'-'+f.queda+'%']),
        theme:'striped',
        headStyles:{fillColor:[224,49,49],textColor:[255,255,255],fontSize:9},
        bodyStyles:{fontSize:9},
        margin:{left:margin,right:margin},
      })
      y=doc.lastAutoTable.finalY+8
    }

    // ── VENDEDORES EM QUEDA ───────────────────────────────────────────────────
    if(dados.vendedoresEmQueda?.length>0){
      checkPage(40)
      subtitulo('Vendedores com queda de faturamento >30% vs mês anterior:')
      autoTable(doc,{
        startY:y,
        head:[['Vendedor','Período atual','Período anterior','Queda']],
        body:dados.vendedoresEmQueda.map(s=>[s.name,'R$ '+fmt(s.atual),'R$ '+fmt(s.anterior),'-'+s.queda+'%']),
        theme:'striped',
        headStyles:{fillColor:[224,49,49],textColor:[255,255,255],fontSize:9},
        bodyStyles:{fontSize:9},
        margin:{left:margin,right:margin},
      })
      y=doc.lastAutoTable.finalY+8
    }

    // ── PRÓXIMOS PASSOS ───────────────────────────────────────────────────────
    checkPage(40)
    titulo('Próximos 30 Dias',13,laranja)
    linha()
    texto(`${dados.proximas?.length||0} compromissos agendados para os próximos 30 dias.`)
    if(dados.proximas?.length>0){
      autoTable(doc,{
        startY:y,
        head:[['Data','Fazenda/Título']],
        body:dados.proximas.slice(0,10).map(a=>[
          a.appointment_date,
          dados.farms?.find(f=>f.id===a.farm_id)?.name||a.title||'Compromisso'
        ]),
        theme:'striped',
        headStyles:{fillColor:laranja,textColor:[255,255,255],fontSize:9},
        bodyStyles:{fontSize:9},
        margin:{left:margin,right:margin},
      })
      y=doc.lastAutoTable.finalY+8
    }

    // ── RODAPÉ ────────────────────────────────────────────────────────────────
    const pages=doc.getNumberOfPages()
    for(let i=1;i<=pages;i++){
      doc.setPage(i)
      doc.setFontSize(8); doc.setTextColor(...cinzaMed)
      doc.text('Nutrialle — Relatório Confidencial',margin,290)
      doc.text(`Página ${i} de ${pages}`,W-margin-20,290)
      doc.setDrawColor(...cinzaCla); doc.line(margin,285,W-margin,285)
    }

    const nomeArq=`Nutrialle_Relatorio_${mesSel.ano}_${String(mesSel.mes).padStart(2,'0')}.pdf`
    doc.save(nomeArq)
    setGerandoPDF(false)
  }

  return (
    <div style={{flex:1,overflow:'hidden',display:'flex',flexDirection:'column'}}>
      <Topbar title="Relatório de Vendas" subtitle="Mensal, trimestral ou anual em PDF"/>
      <div className="page" style={{overflowY:'auto'}}>

        {/* Seletor de período */}
        <div className="card" style={{marginBottom:20}}>
          <div className="section-title">Relatório de Vendas</div>
          <div style={{display:'flex',gap:8,marginBottom:16,marginTop:8}}>
            {['mensal','trimestral','anual'].map(t=>(
              <button key={t} onClick={()=>setTipoPeriodo(t)}
                className={`btn ${tipoPeriodo===t?'btn-primary':'btn-ghost'} btn-sm`}
                style={{textTransform:'capitalize'}}>
                {t.charAt(0).toUpperCase()+t.slice(1)}
              </button>
            ))}
          </div>
          <div style={{display:'flex',gap:12,alignItems:'flex-end',flexWrap:'wrap'}}>
            {tipoPeriodo==='mensal' && (
              <div style={{flex:1,minWidth:180}}>
                <label>Mês de referência</label>
                <select value={`${mesSel.ano}-${mesSel.mes}`}
                  onChange={e=>{ const [ano,mes]=e.target.value.split('-').map(Number); setMesSel({ano,mes,label:new Date(ano,mes-1,1).toLocaleDateString('pt-BR',{month:'long',year:'numeric'})}) }}
                  style={{marginTop:4}}>
                  {mesesOpcoes.map(m=>(
                    <option key={`${m.ano}-${m.mes}`} value={`${m.ano}-${m.mes}`}>
                      {m.label.charAt(0).toUpperCase()+m.label.slice(1)}
                    </option>
                  ))}
                </select>
              </div>
            )}
            {tipoPeriodo==='trimestral' && (
              <>
                <div style={{flex:1,minWidth:120}}>
                  <label>Trimestre</label>
                  <select value={trimSel} onChange={e=>setTrimSel(Number(e.target.value))} style={{marginTop:4}}>
                    <option value={1}>1º Trimestre (Jan-Mar)</option>
                    <option value={2}>2º Trimestre (Abr-Jun)</option>
                    <option value={3}>3º Trimestre (Jul-Set)</option>
                    <option value={4}>4º Trimestre (Out-Dez)</option>
                  </select>
                </div>
                <div style={{flex:1,minWidth:100}}>
                  <label>Ano</label>
                  <select value={anoSel} onChange={e=>setAnoSel(Number(e.target.value))} style={{marginTop:4}}>
                    {[0,1,2].map(i=><option key={i} value={new Date().getFullYear()-i}>{new Date().getFullYear()-i}</option>)}
                  </select>
                </div>
              </>
            )}
            {tipoPeriodo==='anual' && (
              <div style={{flex:1,minWidth:100}}>
                <label>Ano</label>
                <select value={anoSel} onChange={e=>setAnoSel(Number(e.target.value))} style={{marginTop:4}}>
                  {[0,1,2].map(i=><option key={i} value={new Date().getFullYear()-i}>{new Date().getFullYear()-i}</option>)}
                </select>
              </div>
            )}
            <button className="btn btn-primary" onClick={gerarPDF} disabled={loading||gerandoPDF||!dados} style={{minWidth:160}}>
              <IconDownload size={15}/>{gerandoPDF?'Gerando PDF...':'Baixar PDF'}
            </button>
          </div>
        </div>

        {loading?<div className="empty">Carregando dados do mês...</div>:dados&&(
          <>
            {/* Preview do relatório */}
            <div style={{display:'grid',gridTemplateColumns:'repeat(5,1fr)',gap:12,marginBottom:20}}>
              {[
                {label:'Cotações abertas', value:dados.cotacoesAbertas, sub:`R$ ${fmtK(dados.valorCotacoesAbertas)} em aberto`},
                {label:'Faturamento',   value:fmtK(dados.fatMes),    sub:`vs ${fmtK(dados.fatAnt)} ${tipoPeriodo==='mensal'?'mês ant.':tipoPeriodo==='trimestral'?'trim. ant.':'ano ant.'}`, cor:parseFloat(pct(dados.fatMes,dados.fatAnt))>=0?'var(--green)':'var(--red)'},
                {label:'Pedidos',       value:dados.pedMes,           sub:`vs ${dados.pedAnt} ${tipoPeriodo==='mensal'?'mês ant.':tipoPeriodo==='trimestral'?'trim. ant.':'ano ant.'}`},
                {label:'Visitas',       value:dados.visitMes,         sub:`vs ${dados.visitAnt} ${tipoPeriodo==='mensal'?'mês ant.':tipoPeriodo==='trimestral'?'trim. ant.':'ano ant.'}`},
                {label:'Score médio',   value:dados.scoreMedia||'—',  sub:`${dados.checklists} checklists`},
              ].map(k=>(
                <div key={k.label} className="kpi">
                  <div className="label">{k.label}</div>
                  <div className="value" style={{fontSize:20,color:k.cor||'var(--text)'}}>{k.value}</div>
                  <div className="sub">{k.sub}</div>
                </div>
              ))}
            </div>

            <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:16,marginBottom:20}}>
              {/* Top fazendas preview */}
              <div className="card">
                <div className="section-title">Top fazendas do mês</div>
                {dados.topFazendas.length>0?(
                  dados.topFazendas.map((f,i)=>(
                    <div key={f.id} style={{display:'flex',justifyContent:'space-between',padding:'6px 0',borderBottom:'1px solid var(--line)',fontSize:13}}>
                      <span style={{color:'var(--text-dim)'}}>{i+1}. {f.name}</span>
                      <span style={{fontWeight:600,color:'var(--orange)'}}>{fmtK(f.total)}</span>
                    </div>
                  ))
                ):<div style={{color:'var(--text-faint)',fontSize:13}}>Sem vendas no período</div>}
              </div>

              {/* Pontos de atenção preview */}
              <div className="card">
                <div className="section-title">Pontos de atenção</div>
                <div style={{display:'flex',flexDirection:'column',gap:8}}>
                  <div style={{display:'flex',justifyContent:'space-between',fontSize:13}}>
                    <span style={{color:'var(--text-dim)'}}>Fazendas esquecidas (+45d)</span>
                    <span style={{fontWeight:600,color:dados.esquecidas?.length>0?'var(--red)':'var(--green)'}}>{dados.esquecidas?.length||0}</span>
                  </div>
                  <div style={{display:'flex',justifyContent:'space-between',fontSize:13}}>
                    <span style={{color:'var(--text-dim)'}}>Desconto acima do limite</span>
                    <span style={{fontWeight:600,color:dados.comDesconto?.length>0?'var(--amber)':'var(--green)'}}>{dados.comDesconto?.length||0}</span>
                  </div>
                  <div style={{display:'flex',justifyContent:'space-between',fontSize:13}}>
                    <span style={{color:'var(--text-dim)'}}>Novas fazendas no mês</span>
                    <span style={{fontWeight:600,color:'var(--blue)'}}>{dados.novasFazendas?.length||0}</span>
                  </div>
                  <div style={{display:'flex',justifyContent:'space-between',fontSize:13}}>
                    <span style={{color:'var(--text-dim)'}}>Fazendas em queda (+40%)</span>
                    <span style={{fontWeight:600,color:dados.fazendasEmQueda?.length>0?'var(--red)':'var(--green)'}}>{dados.fazendasEmQueda?.length||0}</span>
                  </div>
                  <div style={{display:'flex',justifyContent:'space-between',fontSize:13}}>
                    <span style={{color:'var(--text-dim)'}}>Vendedores em queda (+30%)</span>
                    <span style={{fontWeight:600,color:dados.vendedoresEmQueda?.length>0?'var(--red)':'var(--green)'}}>{dados.vendedoresEmQueda?.length||0}</span>
                  </div>
                  <div style={{display:'flex',justifyContent:'space-between',fontSize:13}}>
                    <span style={{color:'var(--text-dim)'}}>Próximos compromissos</span>
                    <span style={{fontWeight:600}}>{dados.proximas?.length||0}</span>
                  </div>
                </div>
              </div>
            </div>

            <div className="card" style={{background:'var(--orange-bg)',border:'1px solid rgba(240,125,26,0.3)',textAlign:'center',padding:24}}>
              <IconFileText size={32} color="var(--orange)" style={{marginBottom:12}}/>
              <div style={{fontWeight:600,fontSize:15,marginBottom:6}}>Relatório pronto para download</div>
              <div style={{fontSize:13,color:'var(--text-dim)',marginBottom:16}}>
                {mesSel.label.charAt(0).toUpperCase()+mesSel.label.slice(1)} · {dados.pedMes} pedidos · {fmtK(dados.fatMes)}
              </div>
              <button className="btn btn-primary" onClick={gerarPDF} disabled={gerandoPDF} style={{margin:'0 auto'}}>
                <IconDownload size={15}/>
                {gerandoPDF?'Gerando...':'Baixar PDF'}
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  )
}
