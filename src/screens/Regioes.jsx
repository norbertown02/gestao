import { useEffect, useMemo, useRef, useState } from 'react'
import { supabaseAdmin } from '../lib/supabase'
import Topbar from '../components/Topbar'
import { hasNetOrderValue, netOrderValue } from '../lib/commercialMetrics'
import { CURRENT_MONTH, CURRENT_YEAR, historyStart, monthOptions, periodRange, previousPeriodRange, yearOptions } from '../lib/commercialPeriod'
import {
  IconAlertTriangle,
  IconBuildingStore,
  IconDownload,
  IconFilter,
  IconReceipt,
  IconTargetArrow,
  IconTrendingDown,
  IconTrendingUp,
  IconWallet,
} from '@tabler/icons-react'
import {
  AreaChart,
  Area,
  Cell,
  Pie,
  PieChart,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
} from 'recharts'
import * as d3 from 'd3'

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

function diasDesde(data) {
  if (!data) return 999

  try {
    const safe = String(data).length === 10 ? `${data}T12:00:00` : data
    return Math.max(0, Math.floor((new Date() - new Date(safe)) / 86400000))
  } catch {
    return 999
  }
}

function productName(item) {
  return item?.productName || item?.product_name || item?.name || item?.product || 'Produto'
}

function estadoNome(feature) {
  return feature?.properties?.name || feature?.properties?.nome || feature?.properties?.estado || feature?.properties?.NM_ESTADO || feature?.properties?.NM_UF || ''
}

function estadoSigla(feature) {
  return feature?.properties?.sigla || feature?.properties?.SIGLA || feature?.properties?.uf || feature?.properties?.UF || ''
}

function getState(farm) {
  return String(farm?.state || farm?.estado || farm?.uf || '').toUpperCase()
}

function VarBadge({ atual, anterior, invert = false }) {
  const diff = pct(atual, anterior)
  const positivo = invert ? diff <= 0 : diff >= 0

  return (
    <span className={`regioes-var ${positivo ? 'up' : 'down'}`}>
      {positivo ? <IconTrendingUp size={12} /> : <IconTrendingDown size={12} />}
      {diff >= 0 ? '+' : ''}
      {diff.toFixed(1)}% vs período ant.
    </span>
  )
}

function KpiCard({ icon: Icon, label, value, sub, atual, anterior, tone = 'neutral', invert = false }) {
  return (
    <article className={`regioes-kpi ${tone}`}>
      <div className="regioes-kpi-top">
        <div>
          <span>{label}</span>
          <strong>{value}</strong>
        </div>

        <div className="regioes-kpi-icon">
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

function RankingRow({ index, title, subtitle, value, max, extra, money = false, onClick, active }) {
  const percent = max ? Math.max(5, (Number(value || 0) / max) * 100) : 0

  return (
    <button type="button" className={`regioes-ranking-row ${active ? 'active' : ''}`} onClick={onClick}>
      <span className="regioes-rank">{index + 1}</span>

      <div className="regioes-ranking-main">
        <strong>{title}</strong>
        <small>{subtitle}</small>
      </div>

      <div className="regioes-ranking-bar">
        <span style={{ width: `${percent}%` }} />
      </div>

      <div className="regioes-ranking-foot">
        <strong>{money ? fmtK(value) : fmtInt(value)}</strong>
        {extra && <span>{extra}</span>}
      </div>
    </button>
  )
}

function Empty({ children = 'Sem dados para exibir' }) {
  return <div className="empty">{children}</div>
}

export default function Regioes() {
  const svgRef = useRef(null)
  const [periodo, setPeriodo] = useState('mes')
  const [mesReferencia, setMesReferencia] = useState(CURRENT_MONTH)
  const [anoReferencia, setAnoReferencia] = useState(CURRENT_YEAR)
  const [segmento, setSegmento] = useState('todos')
  const [farms, setFarms] = useState([])
  const [sales, setSales] = useState([])
  const [salesAnt, setSalesAnt] = useState([])
  const [documents, setDocuments] = useState([])
  const [documentsAnt, setDocumentsAnt] = useState([])
  const [documentsHistorico, setDocumentsHistorico] = useState([])
  const [visits, setVisits] = useState([])
  const [quotes, setQuotes] = useState([])
  const [geo, setGeo] = useState(null)
  const [loading, setLoading] = useState(true)
  const [tooltip, setTooltip] = useState(null)
  const [estadoSel, setEstadoSel] = useState(null)

  useEffect(() => {
    // BASE_URL acompanha o "base" do vite.config.js (/gestao/ no build) --
    // assim o fetch acerta tanto rodando direto quanto atras do proxy do Painel.
    fetch(import.meta.env.BASE_URL + 'brazil.json')
      .then(r => r.json())
      .then(setGeo)
      .catch(err => {
        console.error('Erro ao carregar brazil.json:', err)
        setGeo(null)
      })

    carregarBase()
  }, [])

  useEffect(() => {
    carregarPeriodo()
  }, [periodo, mesReferencia, anoReferencia])

  async function carregarBase() {
    const { data } = await supabaseAdmin
      .from('farms')
      .select('*')

    setFarms(data || [])
  }

  async function carregarPeriodo() {
    setLoading(true)

    try {
      const [ini, fim] = periodRange(periodo, anoReferencia, mesReferencia)
      const [iniAnt, fimAnt] = previousPeriodRange(periodo, anoReferencia, mesReferencia)
      const histIni = historyStart(anoReferencia, mesReferencia)

      const [rOrders, rVisits, rQuotes] = await Promise.all([
        supabaseAdmin.from('management_order_overview').select('*').gte('sale_date', toISO(histIni < iniAnt ? histIni : iniAnt)).lte('sale_date', toISO(fim)),
        supabaseAdmin.from('visits').select('*').gte('visit_date', toISO(ini)).lte('visit_date', toISO(fim)),
        supabaseAdmin.from('quotes').select('*').gte('created_at', `${toISO(ini)}T00:00:00`).lte('created_at', `${toISO(fim)}T23:59:59`),
      ])
      if (rOrders.error) throw rOrders.error

      const validOrders = (rOrders.data || []).filter(hasNetOrderValue)
      const ids = validOrders.map(row => row.id).filter(Boolean)
      let itemsById = new Map()
      if (ids.length) {
        const itemResult = await supabaseAdmin.from('sales').select('id,items').in('id', ids)
        if (itemResult.error) throw itemResult.error
        itemsById = new Map((itemResult.data || []).map(row => [String(row.id), Array.isArray(row.items) ? row.items : []]))
      }
      const orders = validOrders.map(row => ({ ...row, items: itemsById.get(String(row.id)) || [] }))
      const dentro = (row, inicio, final) => row.sale_date >= toISO(inicio) && row.sale_date <= toISO(final)
      const atual = orders.filter(row => dentro(row, ini, fim))
      const anterior = orders.filter(row => dentro(row, iniAnt, fimAnt))
      const historico = orders.filter(row => row.sale_date >= toISO(histIni))

      setSales(atual)
      setSalesAnt(anterior)
      setDocuments(atual)
      setDocumentsAnt(anterior)
      setDocumentsHistorico(historico)
      setVisits(rVisits.data || [])
      setQuotes(rQuotes.data || [])
    } catch (err) {
      console.error('Erro ao carregar regiões:', err)
      setSales([])
      setSalesAnt([])
      setDocuments([])
      setDocumentsAnt([])
      setDocumentsHistorico([])
      setVisits([])
      setQuotes([])
    } finally {
      setLoading(false)
    }
  }

  const dados = useMemo(() => {
    const farmById = new Map(farms.map(f => [f.id, f]))
    const farmByPartnerId = new Map(farms.filter(f => f.ultra_partner_id).map(f => [Number(f.ultra_partner_id), f]))

    const farmsFiltradas = farms.filter(f => {
      if (segmento === 'todos') return true
      return String(f.segment || '').toLowerCase() === segmento
    })

    const farmIdsFiltro = new Set(farmsFiltradas.map(f => f.id))

    const filtrarPorSegmento = row => {
      if (segmento === 'todos') return true
      return farmIdsFiltro.has(row.farm_id)
    }

    const pedidos = sales.filter(filtrarPorSegmento).filter(hasNetOrderValue)
    const pedidosAnt = salesAnt.filter(filtrarPorSegmento).filter(hasNetOrderValue)
    const faturamento = pedidos
    const faturamentoAnt = pedidosAnt
    const visitas = visits.filter(filtrarPorSegmento)
    const cotacoes = quotes.filter(filtrarPorSegmento)

    const porEstado = {}

    farmsFiltradas.forEach(f => {
      const state = getState(f)
      if (!state) return

      if (!porEstado[state]) {
        porEstado[state] = {
          state,
          nome: state,
          fazendas: 0,
          fazendasComVenda: new Set(),
          visitas: 0,
          vendas: 0,
          vendasAnt: 0,
          valorPedidos: 0,
          valorPedidosAnt: 0,
          pedidos: 0,
          pedidosAnt: 0,
          cotacoesAbertas: 0,
          valorCotadoAberto: 0,
          produtos: {},
          ultimaVisita: null,
          farmIds: new Set(),
        }
      }

      porEstado[state].fazendas += 1
      porEstado[state].farmIds.add(f.id)
    })

    pedidos.forEach(s => {
      const farm = farmById.get(s.farm_id)
      const state = getState(farm)
      if (!state || !porEstado[state]) return

      porEstado[state].valorPedidos += netOrderValue(s)
      porEstado[state].pedidos += 1
      if (s.farm_id) porEstado[state].fazendasComVenda.add(s.farm_id)
    })

    pedidosAnt.forEach(s => {
      const farm = farmById.get(s.farm_id)
      const state = getState(farm)
      if (!state || !porEstado[state]) return

      porEstado[state].valorPedidosAnt += netOrderValue(s)
      porEstado[state].pedidosAnt += 1
    })

    faturamento.forEach(doc => {
      const farm = farmById.get(doc.farm_id)
      const state = getState(farm)
      if (!state || !porEstado[state]) return

      porEstado[state].vendas += netOrderValue(doc)
      ;(doc.items || []).forEach(item => {
        const name = productName(item)
        const subtotal = Math.abs(Number(item?.subtotal ?? item?.total ?? item?.value ?? (Number(item?.quantity || 0) * Number(item?.unitPrice || item?.unit_price || 0))))
        porEstado[state].produtos[name] = (porEstado[state].produtos[name] || 0) + subtotal
      })
    })

    faturamentoAnt.forEach(doc => {
      const farm = farmById.get(doc.farm_id)
      const state = getState(farm)
      if (!state || !porEstado[state]) return
      porEstado[state].vendasAnt += netOrderValue(doc)
    })

    visitas.forEach(v => {
      const farm = farmById.get(v.farm_id)
      const state = getState(farm)
      if (!state || !porEstado[state]) return

      porEstado[state].visitas += 1

      if (!porEstado[state].ultimaVisita || String(v.visit_date) > String(porEstado[state].ultimaVisita)) {
        porEstado[state].ultimaVisita = v.visit_date
      }
    })

    cotacoes.forEach(q => {
      const farm = farmById.get(q.farm_id)
      const state = getState(farm)
      if (!state || !porEstado[state]) return

      const st = String(q.status || '').toLowerCase()
      if (['rascunho', 'enviada'].includes(st)) {
        porEstado[state].cotacoesAbertas += 1
        porEstado[state].valorCotadoAberto += Number(q.total || 0)
      }
    })

    const estados = Object.values(porEstado)
      .map(e => {
        const topProduto = Object.entries(e.produtos).sort((a, b) => b[1] - a[1])[0]

        return {
          ...e,
          fazendasComVendaCount: e.fazendasComVenda.size,
          ticket: e.pedidos ? e.valorPedidos / e.pedidos : 0,
          coberturaVenda: e.fazendas ? Math.round((e.fazendasComVenda.size / e.fazendas) * 100) : 0,
          crescimento: pct(e.vendas, e.vendasAnt),
          topProduto: topProduto?.[0] || '—',
          topProdutoReceita: topProduto?.[1] || 0,
          diasSemVisita: diasDesde(e.ultimaVisita),
        }
      })
      .sort((a, b) => b.vendas - a.vendas)

    const estadosComVenda = estados.filter(e => e.vendas > 0)
    const estadoLider = estadosComVenda[0]
    const totalReceita = estados.reduce((a, e) => a + e.vendas, 0)
    const totalReceitaAnt = estados.reduce((a, e) => a + e.vendasAnt, 0)
    const totalClientes = estados.reduce((a, e) => a + e.fazendas, 0)
    const carteiraOrdenada = [...estados].filter(e => e.fazendas > 0).sort((a, b) => b.fazendas - a.fazendas)
    const carteiraPorEstado = carteiraOrdenada.slice(0, 7).map(e => ({ name: e.state, value: e.fazendas }))
    const outrosClientes = carteiraOrdenada.slice(7).reduce((sum, e) => sum + e.fazendas, 0)
    if (outrosClientes) carteiraPorEstado.push({ name: 'Outros', value: outrosClientes })
    const totalClientesComVenda = estados.reduce((a, e) => a + e.fazendasComVendaCount, 0)
    const totalVisitas = estados.reduce((a, e) => a + e.visitas, 0)
    const totalCotacoesAbertas = estados.reduce((a, e) => a + e.cotacoesAbertas, 0)
    const valorCotadoAberto = estados.reduce((a, e) => a + e.valorCotadoAberto, 0)
    const ticketMedio = estados.reduce((a, e) => a + e.pedidos, 0)
      ? totalReceita / estados.reduce((a, e) => a + e.pedidos, 0)
      : 0

    const regioesAtencao = estados
      .filter(e => e.fazendas > 0 && (e.diasSemVisita >= 30 || e.coberturaVenda < 25 || e.cotacoesAbertas > 0))
      .sort((a, b) => b.valorCotadoAberto - a.valorCotadoAberto || b.fazendas - a.fazendas)
      .slice(0, 8)

    const crescimento = estados
      .filter(e => e.vendasAnt > 0)
      .sort((a, b) => b.crescimento - a.crescimento)
      .slice(0, 8)

    const poucaVisita = estados
      .filter(e => e.fazendas > 0)
      .sort((a, b) => b.diasSemVisita - a.diasSemVisita || b.fazendas - a.fazendas)
      .slice(0, 8)

    const mesMap = {}
    documentsHistorico.forEach(s => {
      const farm = farmById.get(s.farm_id)
      if (segmento !== 'todos' && !farmIdsFiltro.has(farm?.id)) return
      const state = getState(farm)
      if (!state) return

      const mes = s.sale_date?.slice(0, 7)
      if (!mes) return

      if (!mesMap[mes]) {
        mesMap[mes] = {
          mes,
          label: new Date(`${mes}-01T12:00:00`).toLocaleDateString('pt-BR', {
            month: 'short',
            year: '2-digit',
          }),
          Receita: 0,
          Clientes: new Set(),
        }
      }

      mesMap[mes].Receita += netOrderValue(s)
      if (farm?.id) mesMap[mes].Clientes.add(farm.id)
    })

    const evolucao = Object.values(mesMap)
      .sort((a, b) => a.mes.localeCompare(b.mes))
      .slice(-6)
      .map(m => ({
        ...m,
        Clientes: m.Clientes.size,
      }))

    return {
      estados,
      estadosComVenda,
      porEstado,
      estadoLider,
      totalReceita,
      totalReceitaAnt,
      totalClientes,
      carteiraPorEstado,
      totalClientesComVenda,
      totalVisitas,
      totalCotacoesAbertas,
      valorCotadoAberto,
      ticketMedio,
      regioesAtencao,
      crescimento,
      poucaVisita,
      evolucao,
    }
  }, [farms, sales, salesAnt, documents, documentsAnt, documentsHistorico, visits, quotes, segmento])

  useEffect(() => {
    if (!geo || loading) return

    const timer = window.setTimeout(() => {
      desenharMapa()
    }, 0)

    return () => window.clearTimeout(timer)
  }, [geo, loading, dados, estadoSel])

  function desenharMapa() {
    if (!svgRef.current || !geo) return

    const svg = d3.select(svgRef.current)
    svg.selectAll('*').remove()

    const W = svgRef.current.clientWidth || 720
    const H = 520

    const projection = d3.geoMercator().fitSize([W, H], geo)
    const path = d3.geoPath().projection(projection)
    const maxVenda = Math.max(...dados.estados.map(e => e.vendas), 1)

    svg
      .attr('viewBox', `0 0 ${W} ${H}`)
      .attr('preserveAspectRatio', 'xMidYMid meet')

    svg.selectAll('path')
      .data(geo.features)
      .join('path')
      .attr('d', path)
      .attr('fill', d => {
        const sigla = estadoSigla(d)
        const item = dados.porEstado[sigla]

        if (!item || item.vendas === 0) return '#ECE8E1'

        return `rgba(232,119,34,${0.18 + (item.vendas / maxVenda) * 0.62})`
      })
      .attr('stroke', d => estadoSel === estadoSigla(d) ? 'var(--orange)' : 'rgba(118,105,92,.25)')
      .attr('stroke-width', d => estadoSel === estadoSigla(d) ? 2.2 : 0.7)
      .style('cursor', 'pointer')
      .on('click', (event, d) => {
        const sigla = estadoSigla(d)
        setEstadoSel(prev => prev === sigla ? null : sigla)
      })
      .on('mousemove', (event, d) => {
        const sigla = estadoSigla(d)
        const item = dados.porEstado[sigla]

        setTooltip({
          x: event.offsetX,
          y: event.offsetY,
          nome: estadoNome(d) || sigla,
          sigla,
          vendas: item?.vendas || 0,
          pedidos: item?.pedidos || 0,
          fazendas: item?.fazendas || 0,
          visitas: item?.visitas || 0,
        })
      })
      .on('mouseleave', () => setTooltip(null))

    const bubbleScale = d3.scaleSqrt().domain([0, maxVenda]).range([0, 42])

    dados.estados.forEach(item => {
      if (!item.vendas) return

      const feature = geo.features.find(f => estadoSigla(f) === item.state)
      if (!feature) return

      const centroid = path.centroid(feature)
      if (Number.isNaN(centroid[0])) return

      const r = Math.max(8, bubbleScale(item.vendas))

      svg.append('circle')
        .attr('cx', centroid[0])
        .attr('cy', centroid[1])
        .attr('r', r)
        .attr('fill', 'rgba(232,119,34,.76)')
        .attr('stroke', 'rgba(255,255,255,.92)')
        .attr('stroke-width', 1.8)
        .style('cursor', 'pointer')
        .on('click', () => setEstadoSel(prev => prev === item.state ? null : item.state))
        .on('mousemove', event => {
          setTooltip({
            x: event.offsetX,
            y: event.offsetY,
            nome: estadoNome(feature) || item.state,
            sigla: item.state,
            vendas: item.vendas,
            pedidos: item.pedidos,
            fazendas: item.fazendas,
            visitas: item.visitas,
          })
        })
        .on('mouseleave', () => setTooltip(null))

      if (r > 17) {
        svg.append('text')
          .attr('x', centroid[0])
          .attr('y', centroid[1] + 1)
          .attr('text-anchor', 'middle')
          .attr('dominant-baseline', 'middle')
          .attr('fill', '#fff')
          .attr('font-size', 9.5)
          .attr('font-weight', 760)
          .attr('pointer-events', 'none')
          .text(fmtK(item.vendas).replace('R$ ', ''))
      }
    })
  }

  const estadoSelData = estadoSel ? dados.porEstado[estadoSel] : null
  const rankingMax = Math.max(...dados.estados.map(e => e.vendas), 1)
  const crescimentoMax = Math.max(...dados.crescimento.map(e => Math.abs(e.crescimento)), 1)
  const visitaMax = Math.max(...dados.poucaVisita.map(e => e.diasSemVisita >= 999 ? 100 : e.diasSemVisita), 1)

  function exportCSV() {
    const rows = [
      ['Estado', 'Valor de pedidos líquido', 'Valor de pedidos líquido ant.', 'Crescimento %', 'Pedidos', 'Ticket', 'Clientes', 'Clientes com pedido', 'Cobertura venda %', 'Visitas', 'Cotações abertas', 'Valor cotado aberto', 'Produto líder'],
      ...dados.estados.map(e => [
        e.state,
        e.vendas,
        e.vendasAnt,
        e.crescimento.toFixed(1),
        e.pedidos,
        e.ticket,
        e.fazendas,
        e.fazendasComVendaCount,
        e.coberturaVenda,
        e.visitas,
        e.cotacoesAbertas,
        e.valorCotadoAberto,
        e.topProduto,
      ]),
    ]

    const csv = rows.map(r => r.map(c => `"${String(c ?? '').replace(/"/g, '""')}"`).join(';')).join('\n')
    const a = document.createElement('a')

    a.href = `data:text/csv;charset=utf-8,\uFEFF${encodeURIComponent(csv)}`
    a.download = 'performance-regioes.csv'
    a.click()
  }

  return (
    <div style={{ flex: 1, overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>
      <Topbar title="Performance por Região" subtitle="Mapa comercial, receita, clientes, visitas e oportunidades">
        <button className="btn btn-ghost btn-sm" onClick={exportCSV}>
          <IconDownload size={14} />
          Exportar CSV
        </button>
      </Topbar>

      <div className="page regioes-page" style={{ overflowY: 'auto' }}>
        <section className="regioes-toolbar">
          <div className="regioes-toolbar-left">
            <div className="regioes-filter-icon">
              <IconFilter size={15} />
            </div>

            <select value={periodo} onChange={e => setPeriodo(e.target.value)}>
              <option value="mes">Mês</option>
              <option value="trimestre">Trimestre</option>
              <option value="semestre">Semestre</option>
              <option value="ano">Ano</option>
            </select>

            <select aria-label="Mês de referência" value={mesReferencia} onChange={e => setMesReferencia(Number(e.target.value))}>
              {monthOptions.map(option => <option key={option.value} value={option.value}>{option.label}</option>)}
            </select>

            <select aria-label="Ano de referência" value={anoReferencia} onChange={e => setAnoReferencia(Number(e.target.value))}>
              {yearOptions.map(value => <option key={value} value={value}>{value}</option>)}
            </select>

            <select value={segmento} onChange={e => setSegmento(e.target.value)}>
              <option value="todos">Todos os segmentos</option>
              <option value="leite">Leite</option>
              <option value="corte">Corte</option>
              <option value="suinos">Suínos</option>
            </select>
          </div>

          <div className="regioes-toolbar-count">
            {fmtInt(dados.estados.filter(e => e.fazendas > 0).length)} estados com carteira
          </div>
        </section>

        <section className="regioes-hero">
          <div>
            <span className="regioes-eyebrow">Região líder</span>
            <h2>{dados.estadoLider?.state || 'Sem vendas'}</h2>
            <small>{dados.estadoLider ? `${fmtK(dados.estadoLider.vendas)} · ${fmtInt(dados.estadoLider.fazendas)} clientes · ${dados.estadoLider.topProduto}` : 'Aguardando vendas no período'}</small>
          </div>

          <div className="regioes-hero-grid">
            <div>
              <span>Valor de pedidos líquido</span>
              <strong>{fmtK(dados.totalReceita)}</strong>
            </div>

            <div>
              <span>Clientes com venda</span>
              <strong>{fmtInt(dados.totalClientesComVenda)}</strong>
            </div>

            <div>
              <span>Oportunidades abertas</span>
              <strong>{fmtK(dados.valorCotadoAberto)}</strong>
            </div>
          </div>
        </section>

        <section className="regioes-kpi-grid">
          <KpiCard
            icon={IconWallet}
            label="Valor de pedidos líquido"
            value={fmtK(dados.totalReceita)}
            atual={dados.totalReceita}
            anterior={dados.totalReceitaAnt}
          />

          <KpiCard
            icon={IconBuildingStore}
            label="Clientes"
            value={fmtInt(dados.totalClientes)}
            sub={`${fmtInt(dados.totalClientesComVenda)} com venda`}
          />

          <KpiCard
            icon={IconReceipt}
            label="Ticket médio"
            value={fmtK(dados.ticketMedio)}
            sub="por pedido regional"
          />

          <KpiCard
            icon={IconTargetArrow}
            label="Cotações abertas"
            value={fmtInt(dados.totalCotacoesAbertas)}
            sub={fmtK(dados.valorCotadoAberto)}
          />

          <KpiCard
            icon={IconAlertTriangle}
            label="Regiões atenção"
            value={fmtInt(dados.regioesAtencao.length)}
            sub="baixa cobertura ou oportunidade"
            tone={dados.regioesAtencao.length ? 'danger' : 'success'}
          />
        </section>

        {loading ? (
          <Empty>Carregando regiões...</Empty>
        ) : (
          <>
            <section className="regioes-map-grid">
              <div className="regioes-card regioes-map-card">
                <div className="regioes-card-head">
                  <div>
                    <span className="regioes-eyebrow">Mapa comercial</span>
                    <h3>Valor de pedidos líquido por estado</h3>
                  </div>

                  <small>{estadoSel ? `Selecionado: ${estadoSel}` : 'Clique em um estado'}</small>
                </div>

                {!geo ? (
                  <Empty>Arquivo brazil.json não encontrado em /public</Empty>
                ) : (
                  <div className="regioes-map-wrap">
                    <svg ref={svgRef} className="regioes-map-svg" />

                    {tooltip && (
                      <div
                        className="regioes-tooltip"
                        style={{
                          left: tooltip.x + 14,
                          top: tooltip.y - 26,
                        }}
                      >
                        <strong>{tooltip.nome} · {tooltip.sigla}</strong>
                        <span>{fmtK(tooltip.vendas)}</span>
                        <small>{fmtInt(tooltip.pedidos)} pedidos · {fmtInt(tooltip.fazendas)} clientes · {fmtInt(tooltip.visitas)} visitas</small>
                      </div>
                    )}
                  </div>
                )}
              </div>

              <div className="regioes-side">
                <div className="regioes-card">
                  <div className="regioes-card-head">
                    <div>
                      <span className="regioes-eyebrow">Ranking</span>
                      <h3>Top estados</h3>
                    </div>
                  </div>

                  {dados.estadosComVenda.length > 0 ? (
                    <div className="regioes-ranking">
                      {dados.estadosComVenda.slice(0, 8).map((e, i) => (
                        <RankingRow
                          key={e.state}
                          index={i}
                          title={e.state}
                          subtitle={`${fmtInt(e.fazendas)} clientes · ${fmtInt(e.pedidos)} pedidos`}
                          value={e.vendas}
                          max={rankingMax}
                          extra={`${e.coberturaVenda}% cobertura`}
                          money
                          active={estadoSel === e.state}
                          onClick={() => setEstadoSel(prev => prev === e.state ? null : e.state)}
                        />
                      ))}
                    </div>
                  ) : (
                    <Empty>Sem vendas por estado</Empty>
                  )}
                </div>

                {estadoSelData && (
                  <div className="regioes-card regioes-selected-card">
                    <div className="regioes-card-head">
                      <div>
                        <span className="regioes-eyebrow">Detalhe</span>
                        <h3>{estadoSel}</h3>
                      </div>
                    </div>

                    {[
                      ['Valor de pedidos', fmtK(estadoSelData.vendas)],
                      ['Pedidos', fmtInt(estadoSelData.pedidos)],
                      ['Clientes', fmtInt(estadoSelData.fazendas)],
                      ['Visitas', fmtInt(estadoSelData.visitas)],
                      ['Cotações abertas', fmtInt(estadoSelData.cotacoesAbertas)],
                      ['Produto líder', estadoSelData.topProduto || '—'],
                    ].map(([label, value]) => (
                      <div className="regioes-selected-row" key={label}>
                        <span>{label}</span>
                        <strong>{value}</strong>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </section>

            <section className="regioes-main-grid">
              <div className="regioes-card regioes-chart-card">
                <div className="regioes-card-head">
                  <div>
                    <span className="regioes-eyebrow">Evolução</span>
                    <h3>Valor de pedidos líquido regional</h3>
                  </div>
                </div>

                {dados.evolucao.length > 0 ? (
                  <ResponsiveContainer width="100%" height={290}>
                    <AreaChart data={dados.evolucao} margin={{ top: 8, right: 12, left: -18, bottom: 0 }}>
                      <defs>
                        <linearGradient id="regioesReceita" x1="0" y1="0" x2="0" y2="1">
                          <stop offset="5%" stopColor="var(--orange)" stopOpacity={0.23} />
                          <stop offset="95%" stopColor="var(--orange)" stopOpacity={0.02} />
                        </linearGradient>
                      </defs>

                      <CartesianGrid strokeDasharray="4 6" />
                      <XAxis dataKey="label" tickLine={false} axisLine={false} />
                      <YAxis tickLine={false} axisLine={false} tickFormatter={v => `R$ ${(v / 1000).toFixed(0)}k`} />
                      <Tooltip formatter={(v, n) => [n === 'Receita' ? `R$ ${fmt(v)}` : fmtInt(v), n]} />

                      <Area
                        type="monotone"
                        dataKey="Receita"
                        stroke="var(--orange)"
                        strokeWidth={2.5}
                        fill="url(#regioesReceita)"
                        dot={{ r: 3 }}
                        activeDot={{ r: 5 }}
                      />
                    </AreaChart>
                  </ResponsiveContainer>
                ) : (
                  <Empty>Sem evolução no período</Empty>
                )}
              </div>

              <div className="regioes-card">
                <div className="regioes-card-head">
                  <div>
                    <span className="regioes-eyebrow">Clientes</span>
                    <h3>Carteira por estado</h3>
                  </div>
                </div>

                {dados.carteiraPorEstado.length > 0 ? (
                  <div className="regioes-donut-wrap"><ResponsiveContainer width="100%" height={290}>
                    <PieChart>
                      <Pie data={dados.carteiraPorEstado} dataKey="value" nameKey="name" innerRadius={65} outerRadius={104} paddingAngle={2} stroke="#fff" strokeWidth={3}>
                        {dados.carteiraPorEstado.map((entry, index) => <Cell key={entry.name} fill={['#E87722', '#292623', '#A79C92', '#C85F18', '#665D56', '#E9A36D', '#B8AEA5', '#DDD5CE'][index % 8]} />)}
                      </Pie>
                      <Tooltip formatter={(value, name) => [`${fmtInt(value)} clientes`, name]} />
                    </PieChart>
                  </ResponsiveContainer><div className="regioes-donut-center"><strong>{fmtInt(dados.totalClientes)}</strong><span>clientes</span></div><div className="regioes-donut-legend">{dados.carteiraPorEstado.map((entry, index) => <div key={entry.name}><i style={{ background: ['#E87722', '#292623', '#A79C92', '#C85F18', '#665D56', '#E9A36D', '#B8AEA5', '#DDD5CE'][index % 8] }} /><span>{entry.name}</span><strong>{dados.totalClientes ? `${(entry.value / dados.totalClientes * 100).toFixed(1)}%` : '0%'}</strong></div>)}</div></div>
                ) : (
                  <Empty>Sem carteira por estado</Empty>
                )}
              </div>
            </section>

            <section className="regioes-grid-3">
              <div className="regioes-card">
                <div className="regioes-card-head">
                  <div>
                    <span className="regioes-eyebrow">Alta</span>
                    <h3>Regiões em crescimento</h3>
                  </div>
                </div>

                {dados.crescimento.length > 0 ? (
                  <div className="regioes-ranking">
                    {dados.crescimento.map((e, i) => (
                      <RankingRow
                        key={e.state}
                        index={i}
                        title={e.state}
                        subtitle={`${fmtK(e.vendasAnt)} → ${fmtK(e.vendas)}`}
                        value={Math.abs(e.crescimento)}
                        max={crescimentoMax}
                        extra={`+${e.crescimento.toFixed(1)}%`}
                        onClick={() => setEstadoSel(e.state)}
                      />
                    ))}
                  </div>
                ) : (
                  <Empty>Sem base para crescimento</Empty>
                )}
              </div>

              <div className="regioes-card">
                <div className="regioes-card-head">
                  <div>
                    <span className="regioes-eyebrow">Atenção</span>
                    <h3>Baixa cobertura</h3>
                  </div>
                </div>

                {dados.poucaVisita.length > 0 ? (
                  <div className="regioes-ranking">
                    {dados.poucaVisita.map((e, i) => (
                      <RankingRow
                        key={e.state}
                        index={i}
                        title={e.state}
                        subtitle={`${fmtInt(e.fazendas)} clientes · ${fmtInt(e.visitas)} visitas`}
                        value={e.diasSemVisita >= 999 ? 100 : e.diasSemVisita}
                        max={visitaMax}
                        extra={e.diasSemVisita >= 999 ? 'sem visita' : `${fmtInt(e.diasSemVisita)} dias`}
                        onClick={() => setEstadoSel(e.state)}
                      />
                    ))}
                  </div>
                ) : (
                  <Empty>Sem regiões em atenção</Empty>
                )}
              </div>

              <div className="regioes-card">
                <div className="regioes-card-head">
                  <div>
                    <span className="regioes-eyebrow">Produtos</span>
                    <h3>Produto líder por estado</h3>
                  </div>
                </div>

                {dados.estadosComVenda.length > 0 ? (
                  <div className="regioes-product-list">
                    {dados.estadosComVenda.slice(0, 8).map(e => (
                      <button key={e.state} type="button" onClick={() => setEstadoSel(e.state)}>
                        <strong>{e.state}</strong>
                        <span>{e.topProduto}</span>
                        <em>{fmtK(e.topProdutoReceita)}</em>
                      </button>
                    ))}
                  </div>
                ) : (
                  <Empty>Sem produtos por estado</Empty>
                )}
              </div>
            </section>

            <section className="regioes-card">
              <div className="regioes-card-head">
                <div>
                  <span className="regioes-eyebrow">Tabela</span>
                  <h3>Lista completa por estado</h3>
                </div>

                <small>{fmtInt(dados.estados.length)} estados</small>
              </div>

              <div className="table-wrap regioes-table-wrap">
                <table>
                  <thead>
                    <tr>
                      <th>Estado</th>
                      <th style={{ textAlign: 'right' }}>Valor de pedidos líquido</th>
                      <th style={{ textAlign: 'right' }}>Pedidos</th>
                      <th style={{ textAlign: 'right' }}>Ticket</th>
                      <th style={{ textAlign: 'center' }}>Clientes</th>
                      <th style={{ textAlign: 'center' }}>Cobertura</th>
                      <th style={{ textAlign: 'center' }}>Visitas</th>
                      <th style={{ textAlign: 'center' }}>Cotações</th>
                      <th>Produto líder</th>
                      <th style={{ textAlign: 'right' }}>Variação</th>
                    </tr>
                  </thead>

                  <tbody>
                    {dados.estados.length === 0 ? (
                      <tr>
                        <td colSpan={10} style={{ textAlign: 'center', color: 'var(--text-faint)' }}>
                          Nenhum estado encontrado
                        </td>
                      </tr>
                    ) : (
                      dados.estados.map(e => (
                        <tr key={e.state} onClick={() => setEstadoSel(e.state)} className={estadoSel === e.state ? 'regioes-row-active' : ''}>
                          <td>
                            <strong>{e.state}</strong>
                          </td>
                          <td style={{ textAlign: 'right' }}>
                            <strong className="regioes-money">{fmtK(e.vendas)}</strong>
                          </td>
                          <td style={{ textAlign: 'right' }}>{fmtInt(e.pedidos)}</td>
                          <td style={{ textAlign: 'right' }}>{fmtK(e.ticket)}</td>
                          <td style={{ textAlign: 'center' }}>{fmtInt(e.fazendas)}</td>
                          <td style={{ textAlign: 'center' }}>
                            <span className={`regioes-pill ${e.coberturaVenda >= 50 ? 'positive' : e.coberturaVenda >= 25 ? 'warning' : 'negative'}`}>
                              {e.coberturaVenda}%
                            </span>
                          </td>
                          <td style={{ textAlign: 'center' }}>{fmtInt(e.visitas)}</td>
                          <td style={{ textAlign: 'center' }}>{fmtInt(e.cotacoesAbertas)}</td>
                          <td>{e.topProduto}</td>
                          <td style={{ textAlign: 'right' }}>
                            <span className={`regioes-pill ${e.crescimento >= 0 ? 'positive' : 'negative'}`}>
                              {e.crescimento >= 0 ? '+' : ''}
                              {e.crescimento.toFixed(1)}%
                            </span>
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
