import { useEffect, useMemo, useState } from 'react'
import { IconChevronDown, IconDownload, IconSearch, IconStar } from '@tabler/icons-react'
import { supabaseAdmin } from '../lib/supabase'
import { hasNetOrderValue, netOrderValue } from '../lib/commercialMetrics'

const GROUPS = [
  { id: 'A', name: 'Estrelas', detail: 'Alta frequência e alto ticket', action: 'Fidelizar e ampliar o mix' },
  { id: 'B', name: 'Promissoras', detail: 'Boas compradoras com potencial', action: 'Estimular a recorrência' },
  { id: 'C', name: 'Manter', detail: 'Ativas com ticket menor', action: 'Desenvolver novas oportunidades' },
  { id: 'D', name: 'Em risco', detail: '61 a 90 dias sem compra', action: 'Confirmar o ciclo de reposição' },
  { id: 'E', name: 'Inativas', detail: 'Mais de 90 dias sem compra', action: 'Planejar reativação' },
  { id: 'F', name: 'Sem histórico', detail: 'Ainda não fizeram pedidos', action: 'Planejar primeira venda' },
]
const money = value => Number(value || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL', maximumFractionDigits: 0 })
const formatDate = value => value ? new Date(value + 'T12:00:00').toLocaleDateString('pt-BR') : '—'
const daysSince = value => value ? Math.max(0, Math.floor((Date.now() - new Date(value + 'T12:00:00').getTime()) / 86400000)) : null

function rankCustomer(orders, averageTicket) {
  if (!orders.length) return 'F'
  const recent = [...orders].sort((a, b) => String(b.sale_date).localeCompare(String(a.sale_date)))
  const inactiveDays = daysSince(recent[0].sale_date)
  const ticket = orders.reduce((sum, row) => sum + row.net, 0) / orders.length
  if (inactiveDays > 90) return 'E'
  if (inactiveDays > 60) return 'D'
  if (ticket >= averageTicket * 1.3 && orders.length >= 3) return 'A'
  if (ticket >= averageTicket * 0.8) return 'B'
  return 'C'
}

export default function ClientStarsPanel() {
  const [farms, setFarms] = useState([])
  const [orders, setOrders] = useState([])
  const [visits, setVisits] = useState([])
  const [active, setActive] = useState(null)
  const [search, setSearch] = useState('')
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  useEffect(() => {
    let alive = true
    async function load() {
      try {
        const [farmsResult, ordersResult, visitsResult] = await Promise.all([
          supabaseAdmin.from('farms').select('id,name,segment,status').eq('status', 'ativo'),
          supabaseAdmin.from('management_order_overview').select('farm_id,sale_date,order_value,order_stage,fiscal_returned_value,seller_id,ultra_salesman_id'),
          supabaseAdmin.from('visits').select('farm_id,visit_date').order('visit_date', { ascending: false }),
        ])
        const failure = farmsResult.error || ordersResult.error || visitsResult.error
        if (failure) throw failure
        if (!alive) return
        setFarms(farmsResult.data || [])
        setOrders((ordersResult.data || []).filter(hasNetOrderValue).map(row => ({ ...row, net: netOrderValue(row) })))
        setVisits(visitsResult.data || [])
      } catch (e) {
        if (alive) setError(e.message || 'Não foi possível carregar a classificação dos clientes.')
      } finally {
        if (alive) setLoading(false)
      }
    }
    load()
    return () => { alive = false }
  }, [])

  const rows = useMemo(() => {
    const ordersByFarm = new Map()
    for (const order of orders) {
      const key = String(order.farm_id || '')
      if (!ordersByFarm.has(key)) ordersByFarm.set(key, [])
      ordersByFarm.get(key).push(order)
    }
    const lastVisit = new Map()
    for (const visit of visits) {
      const key = String(visit.farm_id || '')
      if (!lastVisit.has(key)) lastVisit.set(key, visit.visit_date)
    }
    const averageTicket = orders.length ? orders.reduce((total, order) => total + order.net, 0) / orders.length : 0
    const start12m = new Date()
    start12m.setDate(start12m.getDate() - 365)
    const since12m = start12m.toISOString().slice(0, 10)
    return farms.map(farm => {
      const farmOrders = ordersByFarm.get(String(farm.id)) || []
      const sorted = [...farmOrders].sort((a, b) => String(b.sale_date).localeCompare(String(a.sale_date)))
      const latest = sorted[0]?.sale_date || null
      return {
        ...farm,
        group: rankCustomer(farmOrders, averageTicket),
        total12m: farmOrders.filter(row => row.sale_date >= since12m).reduce((sum, row) => sum + row.net, 0),
        ordersCount: farmOrders.length,
        latest,
        days: daysSince(latest),
        lastVisit: lastVisit.get(String(farm.id)) || null,
      }
    })
  }, [farms, orders, visits])

  const groupRows = active ? rows.filter(row => row.group === active && row.name?.toLocaleLowerCase('pt-BR').includes(search.toLocaleLowerCase('pt-BR'))).sort((a, b) => b.total12m - a.total12m) : []
  const activeGroup = GROUPS.find(group => group.id === active)

  function exportGroup() {
    const values = [['Cliente','Segmento','Compras','Última compra','Dias sem comprar','Valor 12 meses'], ...groupRows.map(row => [
      row.name, row.segment, row.ordersCount, row.latest || '', row.days ?? '', row.total12m,
    ])]
    const csv = values.map(row => row.map(value => '"' + String(value ?? '').replace(/"/g, '""') + '"').join(';')).join('\n')
    const link = document.createElement('a')
    link.href = 'data:text/csv;charset=utf-8,\uFEFF' + encodeURIComponent(csv)
    link.download = 'inteligencia-clientes-' + active + '.csv'
    link.click()
  }

  return <section className="ci-card" style={{ marginTop: 16 }}>
    <div className="ci-card-head">
      <div><div className="ci-card-kicker">Carteira operacional · Segmentação RFM simplificada</div>
        <h3 className="ci-card-title">Clientes por estrelas e situação</h3>
        <p className="ci-card-desc">Selecione um grupo para conhecer os clientes, quando compraram e onde concentrar o acompanhamento.</p>
      </div>
      <span className="ci-card-side">{rows.length.toLocaleString('pt-BR')} CLIENTES</span>
    </div>
    <div className="ci-card-body">
      {loading ? <div className="ci-empty">Carregando carteira de clientes…</div> :
        error ? <div className="ci-quality" role="alert">{error}</div> : <>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(135px,1fr))', gap: 10 }}>
          {GROUPS.map(group => {
            const groupClients = rows.filter(row => row.group === group.id)
            return <button key={group.id} type="button" onClick={() => {setActive(current => current === group.id ? null : group.id);setSearch('')}}
              aria-expanded={active === group.id}
              style={{ cursor: 'pointer', border: active === group.id ? '2px solid #E87722' : '1px solid #EAE3DB',
                borderRadius: 13, background: active === group.id ? '#FFF5EB' : '#fff',
                textAlign: 'left', padding: '14px 12px', display: 'flex', flexDirection: 'column', gap: 5, fontFamily: 'inherit', color: '#27211C' }}>
              <span style={{ color: active === group.id ? '#BF590C' : '#8B8177', fontSize: 11, fontWeight: 750 }}>
                {group.id === 'A' ? <IconStar size={16} fill="#E87722" color="#E87722" /> : group.id}
              </span>
              <strong style={{ fontSize: 25, lineHeight: 1.15 }}>{groupClients.length.toLocaleString('pt-BR')}</strong>
              <span style={{ fontSize: 12, fontWeight: 750 }}>{group.name}</span>
              <small style={{ color: '#71685F', fontSize: 10, lineHeight: 1.4 }}>{group.detail}</small>
              <span style={{ color: '#B35E1C', fontSize: 10, marginTop: 2 }}>Ver clientes <IconChevronDown size={12} style={{ verticalAlign: 'middle', transform: active === group.id ? 'rotate(180deg)' : 'none' }} /></span>
            </button>
          })}
        </div>
        {activeGroup && <div style={{ marginTop: 20, borderTop: '1px solid #EAE3DB', paddingTop: 17 }}>
          <div style={{ display: 'flex', gap: 10, justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', marginBottom: 14 }}>
            <div><strong style={{ fontSize: 15 }}>{activeGroup.name}</strong>
              <p style={{ fontSize: 12, color: '#71685F', margin: '3px 0 0' }}>Ação sugerida: {activeGroup.action}</p></div>
            <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
              <label style={{ position: 'relative' }}><IconSearch size={14} style={{ position: 'absolute', left: 9, top: 10, color: '#82766B' }}/>
                <input value={search} onChange={event => setSearch(event.target.value)} placeholder="Buscar cliente"
                  aria-label="Buscar cliente no grupo" style={{ padding: '9px 12px 9px 31px', borderRadius: 9, border: '1px solid #E0D7CD', minWidth: 180, fontSize: 12 }}/></label>
              <button type="button" onClick={exportGroup} className="btn btn-ghost btn-sm"><IconDownload size={14}/> Exportar</button>
            </div>
          </div>
          <div className="ci-table-scroll"><table className="ci-table">
            <thead><tr><th>Cliente</th><th>Segmento</th><th>Pedidos</th><th>Última compra</th><th>Sem comprar</th><th>Última visita</th><th>Valor 12m</th></tr></thead>
            <tbody>{groupRows.length ? groupRows.map(row => <tr key={row.id}>
              <td className="ci-strong">{row.name}</td><td>{row.segment || '—'}</td><td>{row.ordersCount}</td>
              <td>{formatDate(row.latest)}</td><td>{row.days === null ? '—' : row.days + ' dias'}</td>
              <td>{formatDate(row.lastVisit)}</td><td className="ci-strong">{money(row.total12m)}</td>
            </tr>) : <tr><td colSpan={7}>Nenhum cliente nesse grupo com a busca atual.</td></tr>}</tbody>
          </table></div>
          <p style={{ fontSize: 11, color: '#82766B', marginTop: 12 }}>Classificação calculada sobre todo o histórico de pedidos da carteira ativa: estrelas exigem ao menos três pedidos e ticket acima de 130% da média; risco e inatividade consideram 60 e 90 dias sem compra. São sinais de acompanhamento, não ranking de produtores. Esta carteira operacional independe dos filtros do painel analítico acima.</p>
        </div>}
      </>}
    </div>
  </section>
}
