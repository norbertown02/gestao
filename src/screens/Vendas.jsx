import { useEffect, useMemo, useState } from 'react'
import { supabaseAdmin } from '../lib/supabase'
import Topbar from '../components/Topbar'
import {
  IconAlertTriangle,
  IconBuildingStore,
  IconChartBar,
  IconChevronDown,
  IconChevronUp,
  IconCurrencyReal,
  IconDownload,
  IconFilter,
  IconPackage,
  IconReceipt,
  IconTrendingDown,
  IconTrendingUp,
  IconUsers,
} from '@tabler/icons-react'
import {
  AreaChart,
  Area,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
} from 'recharts'

function fmt(n) {
  return Number(n || 0).toLocaleString('pt-BR', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })
}

function fmtInt(n) {
  return Number(n || 0).toLocaleString('pt-BR', {
    maximumFractionDigits: 0,
  })
}

function fmtK(n) {
  const v = Number(n || 0)

  if (Math.abs(v) >= 1000000) return `R$ ${(v / 1000000).toFixed(1)} mi`
  if (Math.abs(v) >= 1000) return `R$ ${(v / 1000).toFixed(1)} mil`

  return `R$ ${fmt(v)}`
}

function pct(atual, anterior) {
  const a = Number(atual || 0)
  const b = Number(anterior || 0)

  if (a === 0 && b === 0) return 0
  if (b === 0) return 100

  return ((a - b) / b) * 100
}

function toISO(d) {
  return d.toISOString().split('T')[0]
}

function periodoRange(periodo) {
  const hoje = new Date()
  const ano = hoje.getFullYear()
  const mes = hoje.getMonth()

  if (periodo === 'mes') return [new Date(ano, mes, 1), hoje]
  if (periodo === 'trimestre') return [new Date(ano, mes - 2, 1), hoje]
  if (periodo === 'semestre') return [new Date(ano, mes - 5, 1), hoje]

  return [new Date(ano, 0, 1), hoje]
}

function periodoAnterior(periodo) {
  const [ini, fim] = periodoRange(periodo)
  const diff = fim.getTime() - ini.getTime()

  const fimAnt = new Date(ini)
  fimAnt.setDate(fimAnt.getDate() - 1)

  const iniAnt = new Date(fimAnt.getTime() - diff)

  return [iniAnt, fimAnt]
}

function dataBR(data) {
  if (!data) return '—'

  try {
    return new Date(`${data}T12:00:00`).toLocaleDateString('pt-BR')
  } catch {
    return '—'
  }
}

function getTotal(row) {
  return Number(row?.total || row?.amount || row?.value || 0)
}

function getSaleDate(row) {
  return row?.sale_date || row?.saleDate || row?.created_at?.slice(0, 10) || ''
}

function getItems(row) {
  const items = row?.items

  if (Array.isArray(items)) return items

  if (typeof items === 'string') {
    try {
      const parsed = JSON.parse(items)
      return Array.isArray(parsed) ? parsed : []
    } catch {
      return []
    }
  }

  return []
}

function getProductName(item) {
  return item?.productName || item?.product_name || item?.name || item?.produto || 'Produto'
}

function getProductQty(item) {
  return Number(item?.quantity || item?.qty || item?.quantidade || 0)
}

function getUnitPrice(item) {
  return Number(item?.unitPrice || item?.unit_price || item?.price || item?.preco || 0)
}

function getSubtotal(item) {
  return Number(item?.subtotal || item?.total || (getProductQty(item) * getUnitPrice(item)) || 0)
}

function normalizeStatus(status) {
  const s = String(status || '').toLowerCase()

  if (['enviado', 'aprovado', 'finalizado', 'concluido', 'concluído'].includes(s)) return 'enviado'
  if (['pendente_envio', 'pendente', 'rascunho', 'aberto'].includes(s)) return 'pendente'

  return s || 'pendente'
}

function labelStatus(status) {
  const s = normalizeStatus(status)

  if (s === 'enviado') return 'Enviado'
  if (s === 'pendente') return 'Pendente'

  return s.charAt(0).toUpperCase() + s.slice(1)
}

function VarBadge({ atual, anterior, invert = false }) {
  const diff = pct(atual, anterior)
  const positivo = invert ? diff <= 0 : diff >= 0

  return (
    <span className={`vendas-var ${positivo ? 'up' : 'down'}`}>
      {positivo ? <IconTrendingUp size={12} /> : <IconTrendingDown size={12} />}
      {diff >= 0 ? '+' : ''}
      {diff.toFixed(1)}% vs período ant.
    </span>
  )
}

function KpiCard({ icon: Icon, label, value, sub, atual, anterior, tone = 'neutral', invert = false }) {
  return (
    <article className={`vendas-kpi ${tone}`}>
      <div className="vendas-kpi-top">
        <div>
          <span>{label}</span>
          <strong>{value}</strong>
        </div>

        <div className="vendas-kpi-icon">
          <Icon size={18} />
        </div>
      </div>

      {anterior !== undefined ? (
        <VarBadge atual={atual} anterior={anterior} invert={invert} />
      ) : (
        <small>{sub}</small>
      )}
    </article>
  )
}

function RankingRow({ index, title, subtitle, value, max }) {
  const percent = max ? Math.max(5, (Number(value || 0) / max) * 100) : 0

  return (
    <div className="vendas-ranking-row">
      <span className="vendas-rank">{index + 1}</span>

      <div className="vendas-ranking-main">
        <strong>{title}</strong>
        <small>{subtitle}</small>
      </div>

      <div className="vendas-ranking-bar">
        <span style={{ width: `${percent}%` }} />
      </div>

      <strong className="vendas-ranking-value">{fmtK(value)}</strong>
    </div>
  )
}

function Empty({ children = 'Sem dados para exibir' }) {
  return <div className="empty">{children}</div>
}

export default function Vendas() {
  const [periodo, setPeriodo] = useState('mes')
  const [segmento, setSegmento] = useState('todos')
  const [statusFiltro, setStatusFiltro] = useState('todos')
  const [farms, setFarms] = useState([])
  const [profiles, setProfiles] = useState([])
  const [sales, setSales] = useState([])
  const [salesAnt, setSalesAnt] = useState([])
  const [loading, setLoading] = useState(true)
  const [detalheId, setDetalheId] = useState(null)

  useEffect(() => {
    carregarBase()
  }, [])

  useEffect(() => {
    if (farms.length) carregarVendas()
  }, [periodo, segmento, statusFiltro, farms])

  async function carregarBase() {
    setLoading(true)

    const [farmsRes, profilesRes] = await Promise.all([
      supabaseAdmin.from('farms').select('*'),
      supabaseAdmin.from('profiles').select('*'),
    ])

    setFarms(farmsRes.data || [])
    setProfiles(profilesRes.data || [])
    setLoading(false)
  }

  async function carregarVendas() {
    setLoading(true)

    try {
      const [ini, fim] = periodoRange(periodo)
      const [iniAnt, fimAnt] = periodoAnterior(periodo)

      const [resAtual, resAnt] = await Promise.all([
        supabaseAdmin
          .from('sales')
          .select('*')
          .gte('sale_date', toISO(ini))
          .lte('sale_date', toISO(fim))
          .order('sale_date', { ascending: false }),

        supabaseAdmin
          .from('sales')
          .select('*')
          .gte('sale_date', toISO(iniAnt))
          .lte('sale_date', toISO(fimAnt)),
      ])

      let atual = resAtual.data || []
      let anterior = resAnt.data || []

      if (segmento !== 'todos') {
        const ids = farms
          .filter(f => String(f.segment || '').toLowerCase() === segmento)
          .map(f => f.id)

        atual = atual.filter(s => ids.includes(s.farm_id))
        anterior = anterior.filter(s => ids.includes(s.farm_id))
      }

      if (statusFiltro !== 'todos') {
        atual = atual.filter(s => normalizeStatus(s.status) === statusFiltro)
        anterior = anterior.filter(s => normalizeStatus(s.status) === statusFiltro)
      }

      setSales(atual)
      setSalesAnt(anterior)
    } catch (err) {
      console.error('Erro ao carregar vendas:', err)
      setSales([])
      setSalesAnt([])
    } finally {
      setLoading(false)
    }
  }

  const dados = useMemo(() => {
    const farmById = new Map(farms.map(f => [f.id, f]))
    const sellerById = new Map(profiles.map(p => [p.id, p]))

    const fat = sales.reduce((a, s) => a + getTotal(s), 0)
    const fatAnt = salesAnt.reduce((a, s) => a + getTotal(s), 0)

    const pedidos = sales.length
    const pedidosAnt = salesAnt.length

    const ticket = pedidos ? fat / pedidos : 0
    const ticketAnt = pedidosAnt ? fatAnt / pedidosAnt : 0

    const clientes = new Set(sales.map(s => s.farm_id).filter(Boolean)).size
    const clientesAnt = new Set(salesAnt.map(s => s.farm_id).filter(Boolean)).size

    const pendentes = sales.filter(s => normalizeStatus(s.status) === 'pendente').length
    const pendentesAnt = salesAnt.filter(s => normalizeStatus(s.status) === 'pendente').length

    const descontos = sales.filter(s => s.needs_approval).length
    const descontosAnt = salesAnt.filter(s => s.needs_approval).length

    const evolMap = {}

    sales.forEach(s => {
      const d = getSaleDate(s)
      if (!d) return
      evolMap[d] = (evolMap[d] || 0) + getTotal(s)
    })

    const evolucao = Object.entries(evolMap)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([data, receita]) => ({
        data: new Date(`${data}T12:00:00`).toLocaleDateString('pt-BR', {
          day: '2-digit',
          month: 'short',
        }),
        Receita: receita,
      }))

    const prodMap = {}

    sales.forEach(s => {
      getItems(s).forEach(item => {
        const nome = getProductName(item)
        if (!prodMap[nome]) prodMap[nome] = { name: nome, receita: 0, quantidade: 0, pedidos: 0 }

        prodMap[nome].receita += getSubtotal(item)
        prodMap[nome].quantidade += getProductQty(item)
        prodMap[nome].pedidos += 1
      })
    })

    const porProduto = Object.values(prodMap)
      .sort((a, b) => b.receita - a.receita)
      .slice(0, 8)

    const clienteMap = {}

    sales.forEach(s => {
      const farm = farmById.get(s.farm_id)
      const key = s.farm_id || 'sem_cliente'

      if (!clienteMap[key]) {
        clienteMap[key] = {
          id: key,
          name: farm?.name || 'Cliente não identificado',
          segment: farm?.segment || '—',
          receita: 0,
          pedidos: 0,
        }
      }

      clienteMap[key].receita += getTotal(s)
      clienteMap[key].pedidos += 1
    })

    const porCliente = Object.values(clienteMap)
      .sort((a, b) => b.receita - a.receita)
      .slice(0, 6)

    const sellerMap = {}

    sales.forEach(s => {
      const key = s.seller_id || s.user_id || 'sem_vendedor'
      const seller = sellerById.get(key)

      if (!sellerMap[key]) {
        sellerMap[key] = {
          id: key,
          name: seller?.name || seller?.email || 'Sem vendedor',
          receita: 0,
          pedidos: 0,
        }
      }

      sellerMap[key].receita += getTotal(s)
      sellerMap[key].pedidos += 1
    })

    const porVendedor = Object.values(sellerMap)
      .sort((a, b) => b.receita - a.receita)
      .slice(0, 6)

    const statusMap = {}

    sales.forEach(s => {
      const st = labelStatus(s.status)
      statusMap[st] = (statusMap[st] || 0) + 1
    })

    const porStatus = Object.entries(statusMap).map(([name, pedidos]) => ({ name, pedidos }))

    const tabela = sales
      .map(s => {
        const farm = farmById.get(s.farm_id)
        const seller = sellerById.get(s.seller_id || s.user_id)

        return {
          ...s,
          farmName: farm?.name || '—',
          segment: farm?.segment || '—',
          sellerName: seller?.name || seller?.email || '—',
          totalNumber: getTotal(s),
          itemsParsed: getItems(s),
          saleDate: getSaleDate(s),
        }
      })
      .sort((a, b) => String(b.saleDate).localeCompare(String(a.saleDate)))

    return {
      fat,
      fatAnt,
      pedidos,
      pedidosAnt,
      ticket,
      ticketAnt,
      clientes,
      clientesAnt,
      pendentes,
      pendentesAnt,
      descontos,
      descontosAnt,
      evolucao,
      porProduto,
      porCliente,
      porVendedor,
      porStatus,
      tabela,
    }
  }, [sales, salesAnt, farms, profiles])

  const produtoMax = Math.max(...dados.porProduto.map(p => p.receita), 1)
  const clienteMax = Math.max(...dados.porCliente.map(c => c.receita), 1)
  const vendedorMax = Math.max(...dados.porVendedor.map(v => v.receita), 1)

  function exportCSV() {
    const rows = [
      ['Data', 'Fazenda', 'Segmento', 'Vendedor', 'Itens', 'Pagamento', 'Total', 'Status', 'Desconto'],
      ...dados.tabela.map(s => [
        s.saleDate,
        s.farmName,
        s.segment,
        s.sellerName,
        s.itemsParsed.length,
        s.payment_term_label || '—',
        s.totalNumber,
        labelStatus(s.status),
        s.needs_approval ? 'Sim' : 'Não',
      ]),
    ]

    const csv = rows.map(r => r.map(c => `"${String(c ?? '').replace(/"/g, '""')}"`).join(';')).join('\n')
    const a = document.createElement('a')

    a.href = `data:text/csv;charset=utf-8,\uFEFF${encodeURIComponent(csv)}`
    a.download = 'vendas.csv'
    a.click()
  }

  return (
    <div style={{ flex: 1, overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>
      <Topbar title="Vendas" subtitle="Receita, pedidos, clientes e mix comercial">
        <button className="btn btn-ghost btn-sm" onClick={exportCSV}>
          <IconDownload size={14} />
          Exportar CSV
        </button>
      </Topbar>

      <div className="page vendas-page" style={{ overflowY: 'auto' }}>
        <section className="vendas-toolbar">
          <div className="vendas-toolbar-left">
            <div className="vendas-filter-icon">
              <IconFilter size={15} />
            </div>

            <select value={periodo} onChange={e => setPeriodo(e.target.value)}>
              <option value="mes">Mês atual</option>
              <option value="trimestre">Trimestre</option>
              <option value="semestre">Semestre</option>
              <option value="ano">Ano</option>
            </select>

            <select value={segmento} onChange={e => setSegmento(e.target.value)}>
              <option value="todos">Todos os segmentos</option>
              <option value="leite">Leite</option>
              <option value="corte">Corte</option>
              <option value="suinos">Suínos</option>
            </select>

            <select value={statusFiltro} onChange={e => setStatusFiltro(e.target.value)}>
              <option value="todos">Todos os status</option>
              <option value="enviado">Enviados</option>
              <option value="pendente">Pendentes</option>
            </select>
          </div>

          <div className="vendas-toolbar-count">
            {fmtInt(dados.pedidos)} pedidos no período
          </div>
        </section>

        <section className="vendas-hero">
          <div>
            <span className="vendas-eyebrow">Resultado de vendas</span>
            <h2>{fmtK(dados.fat)}</h2>
            <VarBadge atual={dados.fat} anterior={dados.fatAnt} />
          </div>

          <div className="vendas-hero-grid">
            <div>
              <span>Pedidos</span>
              <strong>{fmtInt(dados.pedidos)}</strong>
            </div>

            <div>
              <span>Ticket médio</span>
              <strong>{fmtK(dados.ticket)}</strong>
            </div>

            <div>
              <span>Clientes compradores</span>
              <strong>{fmtInt(dados.clientes)}</strong>
            </div>
          </div>
        </section>

        <section className="vendas-kpi-grid">
          <KpiCard
            icon={IconCurrencyReal}
            label="Faturamento"
            value={fmtK(dados.fat)}
            atual={dados.fat}
            anterior={dados.fatAnt}
          />

          <KpiCard
            icon={IconReceipt}
            label="Pedidos"
            value={fmtInt(dados.pedidos)}
            atual={dados.pedidos}
            anterior={dados.pedidosAnt}
          />

          <KpiCard
            icon={IconChartBar}
            label="Ticket médio"
            value={fmtK(dados.ticket)}
            atual={dados.ticket}
            anterior={dados.ticketAnt}
          />

          <KpiCard
            icon={IconUsers}
            label="Clientes compradores"
            value={fmtInt(dados.clientes)}
            atual={dados.clientes}
            anterior={dados.clientesAnt}
          />

          <KpiCard
            icon={IconAlertTriangle}
            label="Pendências"
            value={fmtInt(dados.pendentes)}
            atual={dados.pendentes}
            anterior={dados.pendentesAnt}
            invert
            tone={dados.pendentes ? 'warning' : 'success'}
          />

          <KpiCard
            icon={IconAlertTriangle}
            label="Descontos"
            value={fmtInt(dados.descontos)}
            atual={dados.descontos}
            anterior={dados.descontosAnt}
            invert
            tone={dados.descontos ? 'danger' : 'success'}
          />
        </section>

        {loading ? (
          <Empty>Carregando vendas...</Empty>
        ) : (
          <>
            <section className="vendas-main-grid">
              <div className="vendas-card vendas-chart-card">
                <div className="vendas-card-head">
                  <div>
                    <span className="vendas-eyebrow">Evolução</span>
                    <h3>Receita no período</h3>
                  </div>
                </div>

                {dados.evolucao.length > 0 ? (
                  <ResponsiveContainer width="100%" height={290}>
                    <AreaChart data={dados.evolucao} margin={{ top: 8, right: 12, left: -18, bottom: 0 }}>
                      <defs>
                        <linearGradient id="vendasArea" x1="0" y1="0" x2="0" y2="1">
                          <stop offset="5%" stopColor="var(--orange)" stopOpacity={0.24} />
                          <stop offset="95%" stopColor="var(--orange)" stopOpacity={0.02} />
                        </linearGradient>
                      </defs>

                      <CartesianGrid strokeDasharray="4 6" />
                      <XAxis dataKey="data" tickLine={false} axisLine={false} />
                      <YAxis tickLine={false} axisLine={false} tickFormatter={v => `R$ ${(v / 1000).toFixed(0)}k`} />
                      <Tooltip formatter={v => [`R$ ${fmt(v)}`, 'Receita']} />

                      <Area
                        type="monotone"
                        dataKey="Receita"
                        stroke="var(--orange)"
                        strokeWidth={2.6}
                        fill="url(#vendasArea)"
                        dot={{ r: 3 }}
                        activeDot={{ r: 5 }}
                      />
                    </AreaChart>
                  </ResponsiveContainer>
                ) : (
                  <Empty>Sem vendas no período</Empty>
                )}
              </div>

              <div className="vendas-card">
                <div className="vendas-card-head">
                  <div>
                    <span className="vendas-eyebrow">Status</span>
                    <h3>Pedidos por status</h3>
                  </div>
                </div>

                {dados.porStatus.length > 0 ? (
                  <div className="vendas-status-list">
                    {dados.porStatus.map(item => (
                      <div key={item.name} className="vendas-status-row">
                        <span>{item.name}</span>
                        <strong>{fmtInt(item.pedidos)}</strong>
                      </div>
                    ))}
                  </div>
                ) : (
                  <Empty>Sem status no período</Empty>
                )}
              </div>
            </section>

            <section className="vendas-grid-3">
              <div className="vendas-card">
                <div className="vendas-card-head">
                  <div>
                    <span className="vendas-eyebrow">Mix comercial</span>
                    <h3>Top produtos</h3>
                  </div>
                </div>

                {dados.porProduto.length > 0 ? (
                  <div className="vendas-ranking">
                    {dados.porProduto.map((p, i) => (
                      <RankingRow
                        key={p.name}
                        index={i}
                        title={p.name}
                        subtitle={`${fmtInt(p.quantidade)} un. · ${fmtInt(p.pedidos)} pedidos`}
                        value={p.receita}
                        max={produtoMax}
                      />
                    ))}
                  </div>
                ) : (
                  <Empty>Sem dados de produtos</Empty>
                )}
              </div>

              <div className="vendas-card">
                <div className="vendas-card-head">
                  <div>
                    <span className="vendas-eyebrow">Carteira</span>
                    <h3>Top clientes</h3>
                  </div>
                </div>

                {dados.porCliente.length > 0 ? (
                  <div className="vendas-ranking">
                    {dados.porCliente.map((c, i) => (
                      <RankingRow
                        key={c.id}
                        index={i}
                        title={c.name}
                        subtitle={`${c.segment} · ${fmtInt(c.pedidos)} pedidos`}
                        value={c.receita}
                        max={clienteMax}
                      />
                    ))}
                  </div>
                ) : (
                  <Empty>Sem clientes compradores</Empty>
                )}
              </div>

              <div className="vendas-card">
                <div className="vendas-card-head">
                  <div>
                    <span className="vendas-eyebrow">Equipe</span>
                    <h3>Vendas por vendedor</h3>
                  </div>
                </div>

                {dados.porVendedor.length > 0 ? (
                  <div className="vendas-ranking">
                    {dados.porVendedor.map((v, i) => (
                      <RankingRow
                        key={v.id}
                        index={i}
                        title={v.name}
                        subtitle={`${fmtInt(v.pedidos)} pedidos`}
                        value={v.receita}
                        max={vendedorMax}
                      />
                    ))}
                  </div>
                ) : (
                  <Empty>Sem vendas por vendedor</Empty>
                )}
              </div>
            </section>

            <section className="vendas-card">
              <div className="vendas-card-head">
                <div>
                  <span className="vendas-eyebrow">Pedidos</span>
                  <h3>Vendas detalhadas</h3>
                </div>

                <small>{fmtInt(dados.tabela.length)} registros</small>
              </div>

              <div className="table-wrap vendas-table-wrap">
                <table>
                  <thead>
                    <tr>
                      <th>Data</th>
                      <th>Fazenda</th>
                      <th>Segmento</th>
                      <th>Vendedor</th>
                      <th>Itens</th>
                      <th>Pagamento</th>
                      <th style={{ textAlign: 'right' }}>Total</th>
                      <th>Status</th>
                      <th>Desc.</th>
                      <th></th>
                    </tr>
                  </thead>

                  <tbody>
                    {dados.tabela.length === 0 ? (
                      <tr>
                        <td colSpan={10} style={{ textAlign: 'center', color: 'var(--text-faint)' }}>
                          Nenhuma venda no período
                        </td>
                      </tr>
                    ) : (
                      dados.tabela.map(s => (
                        <tr key={s.id} className="vendas-table-group">
                          <td colSpan={10} style={{ padding: 0 }}>
                            <table className="vendas-inner-table">
                              <tbody>
                                <tr onClick={() => setDetalheId(detalheId === s.id ? null : s.id)}>
                                  <td>{dataBR(s.saleDate)}</td>
                                  <td>
                                    <strong>{s.farmName}</strong>
                                  </td>
                                  <td>
                                    <span className="pill pill-gray" style={{ textTransform: 'capitalize' }}>
                                      {s.segment}
                                    </span>
                                  </td>
                                  <td>{s.sellerName}</td>
                                  <td>{fmtInt(s.itemsParsed.length)}</td>
                                  <td>{s.payment_term_label || '—'}</td>
                                  <td style={{ textAlign: 'right' }}>
                                    <strong className="vendas-total">R$ {fmt(s.totalNumber)}</strong>
                                  </td>
                                  <td>
                                    <span className={`pill ${normalizeStatus(s.status) === 'enviado' ? 'pill-green' : 'pill-amber'}`}>
                                      {labelStatus(s.status)}
                                    </span>
                                  </td>
                                  <td>
                                    {s.needs_approval ? <span className="pill pill-red">Sim</span> : '—'}
                                  </td>
                                  <td>
                                    {detalheId === s.id ? <IconChevronUp size={14} /> : <IconChevronDown size={14} />}
                                  </td>
                                </tr>

                                {detalheId === s.id && (
                                  <tr>
                                    <td colSpan={10} className="vendas-detail">
                                      <div className="vendas-detail-title">Itens do pedido</div>

                                      {s.itemsParsed.length > 0 ? (
                                        s.itemsParsed.map((it, i) => (
                                          <div key={`${s.id}-${i}`} className="vendas-detail-row">
                                            <span>
                                              {getProductName(it)} × {fmtInt(getProductQty(it))}
                                            </span>
                                            <span>
                                              R$ {fmt(getUnitPrice(it))} un · <strong>R$ {fmt(getSubtotal(it))}</strong>
                                            </span>
                                          </div>
                                        ))
                                      ) : (
                                        <div className="vendas-detail-row">
                                          <span>Sem itens detalhados neste pedido.</span>
                                        </div>
                                      )}

                                      {s.notes && <p className="vendas-notes">Obs: {s.notes}</p>}
                                    </td>
                                  </tr>
                                )}
                              </tbody>
                            </table>
                          </td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
            </section>
          </>
        )}
      </div>
    </div>
  )
}
