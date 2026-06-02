import { useState, useEffect } from 'react'
import { supabase } from '../lib/supabase'
import Topbar from '../components/Topbar'
import { IconFilter, IconDownload } from '@tabler/icons-react'
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, LineChart, Line } from 'recharts'

function fmt(n) { return Number(n||0).toLocaleString('pt-BR',{minimumFractionDigits:2,maximumFractionDigits:2}) }
function fmtK(n) { if(n>=1000000) return `R$ ${(n/1000000).toFixed(1)}M`; if(n>=1000) return `R$ ${(n/1000).toFixed(1)}k`; return `R$ ${fmt(n)}` }
function periodoRange(p) {
  const hoje=new Date(),ano=hoje.getFullYear(),mes=hoje.getMonth()
  if(p==='mes') return [new Date(ano,mes,1),hoje]
  if(p==='trimestre') return [new Date(ano,mes-2,1),hoje]
  if(p==='semestre') return [new Date(ano,mes-5,1),hoje]
  return [new Date(ano,0,1),hoje]
}
function toISO(d) { return d.toISOString().split('T')[0] }

export default function Produtos() {
  const [periodo,  setPeriodo]  = useState('mes')
  const [segmento, setSegmento] = useState('todos')
  const [sales,    setSales]    = useState([])
  const [produtos, setProdutos] = useState([])
  const [loading,  setLoading]  = useState(true)

  useEffect(()=>{ carregarProdutos() },[])
  useEffect(()=>{ carregarVendas() },[periodo])

  async function carregarProdutos() {
    const {data}=await supabase.from('products').select('*').eq('active',true)
    setProdutos(data||[])
  }

  async function carregarVendas() {
    setLoading(true)
    const [ini,fim]=periodoRange(periodo)
    const {data}=await supabase.from('sales').select('*').gte('sale_date',toISO(ini)).lte('sale_date',toISO(fim))
    setSales(data||[])
    setLoading(false)
  }

  // Agrega itens de todas as vendas
  const itemMap={}
  sales.forEach(s=>{
    (s.items||[]).forEach(it=>{
      const k=it.productName||it.product_name||'Produto'
      if(!itemMap[k]) itemMap[k]={name:k,receita:0,qty:0,fazendas:new Set()}
      itemMap[k].receita+=Number(it.subtotal||0)
      itemMap[k].qty+=Number(it.quantity||0)
      itemMap[k].fazendas.add(s.farm_id)
    })
  })
  const porProduto=Object.values(itemMap).map(p=>({...p,fazendas:p.fazendas.size})).sort((a,b)=>b.receita-a.receita)
  const totalReceita=porProduto.reduce((a,p)=>a+p.receita,0)

  // Produtos sem venda no período
  const produtosAtivos=produtos.map(p=>p.name)
  const produtosComVenda=new Set(porProduto.map(p=>p.name))
  const semVenda=produtosAtivos.filter(p=>!produtosComVenda.has(p))

  // Sazonalidade — últimos 6 meses top 3 produtos
  const top3=porProduto.slice(0,3).map(p=>p.name)
  const meses6=[]
  for(let i=5;i>=0;i--){
    const d=new Date(); d.setMonth(d.getMonth()-i)
    const mes=`${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}`
    const obj={mes}
    top3.forEach(prod=>{
      obj[prod]=0
    })
    // seria necessário buscar sales de todos os meses — simplificamos com os dados atuais
    meses6.push(obj)
  }

  function exportCSV(){
    const rows=[['Produto','Receita','Quantidade','Fazendas únicas','% do total'],
      ...porProduto.map(p=>[p.name,p.receita,p.qty,p.fazendas,totalReceita?((p.receita/totalReceita)*100).toFixed(1):'0'])]
    const a=document.createElement('a')
    a.href='data:text/csv;charset=utf-8,\uFEFF'+encodeURIComponent(rows.map(r=>r.join(';')).join('\n'))
    a.download='produtos.csv';a.click()
  }

  return (
    <div style={{flex:1,overflow:'hidden',display:'flex',flexDirection:'column'}}>
      <Topbar title="Análise por Produto" subtitle="Performance do catálogo de produtos">
        <button className="btn btn-ghost btn-sm" onClick={exportCSV}><IconDownload size={14}/> Exportar CSV</button>
      </Topbar>
      <div className="page" style={{overflowY:'auto'}}>
        <div style={{display:'flex',gap:10,marginBottom:20,alignItems:'center'}}>
          <IconFilter size={14} color="var(--text-faint)"/>
          <select value={periodo} onChange={e=>setPeriodo(e.target.value)} style={{width:'auto',padding:'6px 10px',fontSize:12}}>
            <option value="mes">Mês atual</option><option value="trimestre">Trimestre</option><option value="semestre">Semestre</option><option value="ano">Ano</option>
          </select>
          <span style={{fontSize:12,color:'var(--text-faint)',marginLeft:'auto'}}>{porProduto.length} produtos vendidos</span>
        </div>

        <div className="kpi-grid" style={{gridTemplateColumns:'repeat(4,1fr)'}}>
          {[
            {label:'Receita total',       value:fmtK(totalReceita),                sub:'no período'},
            {label:'Produtos vendidos',   value:porProduto.length,                  sub:`de ${produtos.length} ativos`},
            {label:'Top produto',         value:porProduto[0]?.name||'—',           sub:porProduto[0]?fmtK(porProduto[0].receita):''},
            {label:'Sem venda',           value:semVenda.length,                    sub:'produtos sem movimento', style:{color:semVenda.length>0?'var(--red)':'var(--green)'}},
          ].map(k=>(
            <div key={k.label} className="kpi">
              <div className="label">{k.label}</div>
              <div className="value" style={{fontSize:18,...(k.style||{})}}>{k.value}</div>
              <div className="sub">{k.sub}</div>
            </div>
          ))}
        </div>

        {loading?<div className="empty">Carregando...</div>:(
          <>
            <div style={{display:'grid',gridTemplateColumns:'2fr 1fr',gap:16,marginBottom:20}}>
              <div className="card">
                <div className="section-title">Top produtos por receita</div>
                {porProduto.length>0?(
                  <ResponsiveContainer width="100%" height={260}>
                    <BarChart data={porProduto.slice(0,10)} layout="vertical" margin={{top:0,right:60,left:8,bottom:0}}>
                      <CartesianGrid strokeDasharray="3 3" stroke="var(--line)"/>
                      <XAxis type="number" tick={{fontSize:11}} tickFormatter={v=>`R$${(v/1000).toFixed(0)}k`}/>
                      <YAxis type="category" dataKey="name" tick={{fontSize:10}} width={160}/>
                      <Tooltip formatter={v=>[`R$ ${fmt(v)}`,'Receita']}/>
                      <Bar dataKey="receita" fill="var(--orange)" radius={[0,4,4,0]}/>
                    </BarChart>
                  </ResponsiveContainer>
                ):<div className="empty" style={{padding:40}}>Sem vendas no período</div>}
              </div>

              <div className="card">
                <div className="section-title">Produtos sem movimento</div>
                {semVenda.length===0?(
                  <div style={{color:'var(--green)',fontSize:13,padding:'20px 0'}}>✓ Todos os produtos tiveram vendas</div>
                ):(
                  semVenda.map(p=>(
                    <div key={p} style={{padding:'8px 0',borderBottom:'1px solid var(--line)',fontSize:13,color:'var(--red)'}}>
                      {p}
                    </div>
                  ))
                )}
              </div>
            </div>

            <div className="card">
              <div className="section-title">Tabela detalhada de produtos</div>
              <div className="table-wrap">
                <table>
                  <thead>
                    <tr><th>#</th><th>Produto</th><th style={{textAlign:'right'}}>Receita</th><th style={{textAlign:'right'}}>Qtd vendida</th><th style={{textAlign:'center'}}>Fazendas únicas</th><th style={{textAlign:'right'}}>% do total</th></tr>
                  </thead>
                  <tbody>
                    {porProduto.length===0?(
                      <tr><td colSpan={6} style={{textAlign:'center',color:'var(--text-faint)'}}>Nenhuma venda no período</td></tr>
                    ):porProduto.map((p,i)=>(
                      <tr key={p.name}>
                        <td style={{color:'var(--text-faint)',fontWeight:700}}>{i+1}</td>
                        <td style={{fontWeight:500}}>{p.name}</td>
                        <td style={{textAlign:'right',fontWeight:600,color:'var(--orange)'}}>R$ {fmt(p.receita)}</td>
                        <td style={{textAlign:'right'}}>{p.qty}</td>
                        <td style={{textAlign:'center'}}>{p.fazendas}</td>
                        <td style={{textAlign:'right'}}>
                          <div style={{display:'flex',alignItems:'center',gap:8,justifyContent:'flex-end'}}>
                            <div style={{width:60,background:'var(--surface-2)',borderRadius:4,height:6,overflow:'hidden'}}>
                              <div style={{width:`${totalReceita?((p.receita/totalReceita)*100):0}%`,height:'100%',background:'var(--orange)',borderRadius:4}}/>
                            </div>
                            <span style={{fontSize:12,fontWeight:600}}>{totalReceita?((p.receita/totalReceita)*100).toFixed(1):0}%</span>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </>
        )}
      </div>
    </div>
  )
}
