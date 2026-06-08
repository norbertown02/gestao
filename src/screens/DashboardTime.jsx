import { useState, useEffect } from 'react'
import { supabase } from '../lib/supabase'
import Topbar from '../components/Topbar'
import { IconUsers, IconRoute, IconClipboardList, IconBuildingStore, IconAlertTriangle, IconCalendar, IconChartPie } from '@tabler/icons-react'
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Cell } from 'recharts'

function fmt(n) { return Number(n||0).toLocaleString('pt-BR',{minimumFractionDigits:2,maximumFractionDigits:2}) }
function fmtK(n) { if(n>=1000000) return `R$ ${(n/1000000).toFixed(1)}M`; if(n>=1000) return `R$ ${(n/1000).toFixed(1)}k`; return `R$ ${fmt(n)}` }
function toISO(d) { return d.toISOString().split('T')[0] }
const CORES = ['#F07D1A','#6BA4D9','#E67E47','#D9A4C1','#2f9e44','#e03131','#1971c2','#f08c00']

export default function DashboardTime() {
  const [dados, setDados] = useState(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => { carregar() }, [])

  async function carregar() {
    setLoading(true)
    const hoje = new Date()
    const inicioMes = toISO(new Date(hoje.getFullYear(), hoje.getMonth(), 1))
    const fimMes = toISO(new Date(hoje.getFullYear(), hoje.getMonth()+1, 0))
    const d45 = toISO(new Date(hoje - 45*86400000))
    const d90 = toISO(new Date(hoje - 90*86400000))
    const d7f = toISO(new Date(hoje.getTime() + 7*86400000))

    const [rSellers, rFarms, rVisitsMes, rAllVisits, rSalesMes, rChecks, rAppointments] = await Promise.all([
      supabase.from('profiles').select('*').eq('active', true),
      supabase.from('farms').select('*').eq('status', 'ativo'),
      supabase.from('visits').select('*').gte('visit_date', inicioMes).lte('visit_date', fimMes),
      supabase.from('visits').select('farm_id,visit_date,seller_id,outcome').gte('visit_date', d90),
      supabase.from('sales').select('*').gte('sale_date', inicioMes).lte('sale_date', fimMes),
      supabase.from('checklists').select('*').gte('applied_at', inicioMes).lte('applied_at', fimMes),
      supabase.from('appointments').select('*').gte('appointment_date', toISO(hoje)).lte('appointment_date', d7f),
    ])

    const sellers = rSellers.data || []
    const farms = rFarms.data || []
    const visitsMes = rVisitsMes.data || []
    const allVisits = rAllVisits.data || []
    const salesMes = rSalesMes.data || []
    const checks = rChecks.data || []
    const appointments = rAppointments.data || []

    const ultimaVisita = {}
    allVisits.forEach(v => { if (!ultimaVisita[v.farm_id] || v.visit_date > ultimaVisita[v.farm_id]) ultimaVisita[v.farm_id] = v.visit_date })

    const semVisita = farms.filter(f => !ultimaVisita[f.id] || ultimaVisita[f.id] < d45)
    const comVenda = new Set(salesMes.map(s => s.farm_id))

    const porVendedor = sellers.map(s => {
      const visitas = visitsMes.filter(v => v.seller_id === s.id)
      const vendas = salesMes.filter(v => v.seller_id === s.id)
      const fat = vendas.reduce((a, v) => a + Number(v.total||0), 0)
      const fazCarteira = new Set(allVisits.filter(v => v.seller_id === s.id).map(v => v.farm_id)).size
      const agendadas = appointments.filter(a => a.seller_id === s.id).length
      const positivas = visitas.filter(v => v.outcome === 'positiva').length
      const checklists = checks.filter(c => c.seller_id === s.id).length
      return { ...s, visitas: visitas.length, vendas: vendas.length, fat, fazCarteira, agendadas, positivas, checklists }
    }).sort((a, b) => b.fat - a.fat)

    const outcomes = { positiva: 0, neutra: 0, negativa: 0 }
    visitsMes.forEach(v => { outcomes[v.outcome || 'neutra']++ })

    const fazVisMap = {}
    visitsMes.forEach(v => {
      const f = farms.find(f => f.id === v.farm_id)
      const k = f?.name || '—'
      if (!fazVisMap[k]) fazVisMap[k] = 0
      fazVisMap[k]++
    })
    const topFazVisitas = Object.entries(fazVisMap).sort((a,b) => b[1]-a[1]).slice(0,6).map(([name,v]) => ({name, Visitas: v}))

    const checksPorVendedor = sellers.map(s => ({
      name: s.name,
      checks: checks.filter(c => c.seller_id === s.id).length
    })).filter(s => s.checks > 0)

    setDados({ sellers, farms, visitsMes, salesMes, checks, appointments, semVisita, comVenda, porVendedor, outcomes, topFazVisitas, checksPorVendedor, totalFarms: farms.length, comVendaMes: comVenda.size })
    setLoading(false)
  }

  if (loading) return <div style={{flex:1,display:'flex',alignItems:'center',justifyContent:'center'}}><div className="empty">Carregando...</div></div>
  if (!dados) return null
  const { porVendedor, outcomes, topFazVisitas, semVisita, checksPorVendedor, totalFarms, comVendaMes, visitsMes, salesMes, checks, appointments } = dados

  return (
    <div style={{flex:1,overflow:'hidden',display:'flex',flexDirection:'column'}}>
      <Topbar title="Dashboard do Time" subtitle="Acompanhamento de vendedores, visitas e carteira"/>
      <div className="page" style={{overflowY:'auto'}}>

        <div className="kpi-grid" style={{gridTemplateColumns:'repeat(5,1fr)',marginBottom:20}}>
          {[
            {label:'Vendedores ativos',  value: porVendedor.length,              Icon: IconUsers},
            {label:'Visitas no mês',     value: visitsMes.length,                Icon: IconRoute},
            {label:'Fazendas com venda', value: `${comVendaMes} / ${totalFarms}`,Icon: IconBuildingStore},
            {label:'Checklists no mês',  value: checks.length,                   Icon: IconClipboardList},
            {label:'Agendadas (7 dias)', value: appointments.length,             Icon: IconCalendar},
          ].map(k => (
            <div key={k.label} className="kpi">
              <div className="label" style={{display:'flex',alignItems:'center',gap:6}}><k.Icon size={13}/>{k.label}</div>
              <div className="value" style={{fontSize:22}}>{k.value}</div>
            </div>
          ))}
        </div>

        {semVisita.length > 0 && (
          <div style={{background:'var(--amber-bg,#fff8e1)',border:'1px solid #f08c00',borderRadius:8,padding:'12px 16px',marginBottom:20,display:'flex',gap:10,alignItems:'flex-start'}}>
            <IconAlertTriangle size={18} color="#f08c00" style={{marginTop:2,flexShrink:0}}/>
            <div>
              <div style={{fontWeight:600,fontSize:13,color:'#f08c00',marginBottom:4}}>{semVisita.length} fazenda{semVisita.length>1?'s':''} sem visita há mais de 45 dias</div>
              <div style={{fontSize:12,color:'var(--text-dim)',display:'flex',flexWrap:'wrap',gap:'4px 12px'}}>
                {semVisita.slice(0,8).map(f => <span key={f.id}>• {f.name}</span>)}
                {semVisita.length > 8 && <span>e mais {semVisita.length-8}...</span>}
              </div>
            </div>
          </div>
        )}

        <div className="card" style={{marginBottom:20}}>
          <div className="section-title" style={{display:'flex',alignItems:'center',gap:8}}><IconUsers size={14}/>Performance do Time — Mês Atual</div>
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Vendedor</th>
                  <th style={{textAlign:'center'}}>Carteira</th>
                  <th style={{textAlign:'center'}}>Visitas</th>
                  <th style={{textAlign:'center'}}>Positivas</th>
                  <th style={{textAlign:'center'}}>Pedidos</th>
                  <th style={{textAlign:'center'}}>Agendadas</th>
                  <th style={{textAlign:'center'}}>Checklists</th>
                  <th style={{textAlign:'right'}}>Faturamento</th>
                </tr>
              </thead>
              <tbody>
                {porVendedor.length === 0
                  ? <tr><td colSpan={8} style={{textAlign:'center',color:'var(--text-faint)'}}>Nenhum vendedor ativo</td></tr>
                  : porVendedor.map((s, i) => (
                    <tr key={s.id}>
                      <td style={{fontWeight:500}}>
                        <span style={{width:8,height:8,borderRadius:'50%',background:CORES[i%CORES.length],display:'inline-block',marginRight:8}}/>
                        {s.name}
                      </td>
                      <td style={{textAlign:'center'}}>{s.fazCarteira}</td>
                      <td style={{textAlign:'center'}}>{s.visitas}</td>
                      <td style={{textAlign:'center'}}>
                        <span style={{color:'var(--green)',fontWeight:600}}>{s.positivas}</span>
                        {s.visitas > 0 && <span style={{color:'var(--text-faint)',fontSize:11}}> ({Math.round(s.positivas/s.visitas*100)}%)</span>}
                      </td>
                      <td style={{textAlign:'center'}}>{s.vendas}</td>
                      <td style={{textAlign:'center'}}>{s.agendadas}</td>
                      <td style={{textAlign:'center'}}>{s.checklists}</td>
                      <td style={{textAlign:'right',fontWeight:600,color:'var(--orange)'}}>{fmtK(s.fat)}</td>
                    </tr>
                  ))
                }
              </tbody>
            </table>
          </div>
        </div>

        <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:16}}>
          <div className="card">
            <div className="section-title" style={{display:'flex',alignItems:'center',gap:8}}><IconRoute size={14}/>Resultado das Visitas</div>
            <div style={{display:'flex',gap:12,marginBottom:16}}>
              {[
                {label:'Positivas', value:outcomes.positiva, color:'var(--green)'},
                {label:'Neutras',   value:outcomes.neutra,   color:'var(--text-dim)'},
                {label:'Negativas', value:outcomes.negativa, color:'var(--red)'},
              ].map(o => (
                <div key={o.label} style={{flex:1,textAlign:'center',padding:'12px 8px',borderRadius:8,background:'var(--surface-2)'}}>
                  <div style={{fontSize:24,fontWeight:700,color:o.color}}>{o.value}</div>
                  <div style={{fontSize:11,color:'var(--text-faint)'}}>{o.label}</div>
                </div>
              ))}
            </div>
            <div className="section-title">Top fazendas visitadas</div>
            {topFazVisitas.length > 0
              ? <ResponsiveContainer width="100%" height={160}>
                  <BarChart data={topFazVisitas} layout="vertical" margin={{top:0,right:8,left:8,bottom:0}}>
                    <CartesianGrid strokeDasharray="3 3" stroke="var(--line)"/>
                    <XAxis type="number" tick={{fontSize:10}}/>
                    <YAxis type="category" dataKey="name" tick={{fontSize:10}} width={120}/>
                    <Tooltip/>
                    <Bar dataKey="Visitas" fill="var(--orange)" radius={[0,4,4,0]}/>
                  </BarChart>
                </ResponsiveContainer>
              : <div className="empty" style={{padding:30}}>Sem visitas no mês</div>
            }
          </div>

          <div className="card">
            <div className="section-title" style={{display:'flex',alignItems:'center',gap:8}}><IconClipboardList size={14}/>Checklists por Vendedor</div>
            {checksPorVendedor.length > 0
              ? <ResponsiveContainer width="100%" height={180}>
                  <BarChart data={checksPorVendedor} margin={{top:4,right:8,left:-16,bottom:0}}>
                    <CartesianGrid strokeDasharray="3 3" stroke="var(--line)"/>
                    <XAxis dataKey="name" tick={{fontSize:11}}/>
                    <YAxis tick={{fontSize:11}}/>
                    <Tooltip/>
                    <Bar dataKey="checks" name="Checklists" radius={[4,4,0,0]}>
                      {checksPorVendedor.map((_,i) => <Cell key={i} fill={CORES[i%CORES.length]}/>)}
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              : <div className="empty" style={{padding:30}}>Nenhum checklist no mês</div>
            }
            {appointments.length > 0 && (
              <>
                <div className="section-title" style={{marginTop:16,display:'flex',alignItems:'center',gap:8}}><IconCalendar size={14}/>Próximas visitas (7 dias)</div>
                {appointments.slice(0,5).map(a => (
                  <div key={a.id} style={{display:'flex',justifyContent:'space-between',alignItems:'center',padding:'6px 0',borderBottom:'1px solid var(--line)',fontSize:12}}>
                    <span style={{fontWeight:500}}>{a.farm_name||'—'}</span>
                    <span style={{color:'var(--text-faint)'}}>{new Date(a.appointment_date+'T12:00:00').toLocaleDateString('pt-BR',{day:'2-digit',month:'short'})}</span>
                  </div>
                ))}
              </>
            )}
          </div>
        </div>

      </div>
    </div>
  )
}
