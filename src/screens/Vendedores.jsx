import { Fragment, useEffect, useMemo, useRef, useState } from 'react'
import { supabaseAdmin } from '../lib/supabase'
import { hasNetOrderValue, netOrderValue } from '../lib/commercialMetrics'
import { isVendedorValido, useVendedores } from '../lib/sellers'
import Topbar from '../components/Topbar'
import Metas from './Metas'
import './CommercialClarity.css'
import { CURRENT_MONTH, CURRENT_YEAR, historyStart, monthOptions, periodRange, previousPeriodRange, yearOptions } from '../lib/commercialPeriod'
import {
  IconAlertTriangle,
  IconBuildingStore,
  IconChartBar,
  IconChevronDown,
  IconChevronUp,
  IconDownload,
  IconFilter,
  IconMapPin,
  IconReceipt,
  IconTargetArrow,
  IconTrendingDown,
  IconTrendingUp,
  IconUser,
  IconWallet,
} from '@tabler/icons-react'
import {
  ComposedChart,
  Area,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
} from 'recharts'

function toISO(d) {
  return d.toISOString().split('T')[0]
}

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

function diasDesde(data) {
  if (!data) return 999

  try {
    const safe = String(data).length === 10 ? `${data}T12:00:00` : data
    return Math.max(0, Math.floor((new Date() - new Date(safe)) / 86400000))
  } catch {
    return 999
  }
}

function normalizarStatus(status) {
  const s = String(status || '').toLowerCase()

  if (['convertida', 'convertido', 'aprovada', 'aprovado', 'won'].includes(s)) return 'convertida'
  if (['cancelada', 'cancelado', 'perdida', 'perdido', 'lost'].includes(s)) return 'cancelada'
  if (['enviada', 'enviado', 'sent'].includes(s)) return 'enviada'

  return 'rascunho'
}

const normalizeOrder = row => ({ ...row, total: netOrderValue(row) })

function VarBadge({ atual, anterior, invert = false }) {
  const diff = pct(atual, anterior)
  const positivo = invert ? diff <= 0 : diff >= 0

  return (
    <span className={`vendedores-var ${positivo ? 'up' : 'down'}`}>
      {positivo ? <IconTrendingUp size={12} /> : <IconTrendingDown size={12} />}
      {diff >= 0 ? '+' : ''}
      {diff.toFixed(1)}% vs período ant.
    </span>
  )
}

function KpiCard({ icon: Icon, label, value, sub, atual, anterior, tone = 'neutral', invert = false }) {
  return (
    <article className={`vendedores-kpi ${tone}`}>
      <div className="vendedores-kpi-top">
        <div>
          <span>{label}</span>
          <strong>{value}</strong>
        </div>

        <div className="vendedores-kpi-icon">
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

function RankingRow({ index, title, subtitle, value, max, extra, money = false }) {
  const percent = max ? Math.max(5, (Number(value || 0) / max) * 100) : 0

  return (
    <div className="vendedores-ranking-row">
      <span className="vendedores-rank">{index + 1}</span>

      <div className="vendedores-ranking-main">
        <strong>{title}</strong>
        <small>{subtitle}</small>
      </div>

      <div className="vendedores-ranking-bar">
        <span style={{ width: `${percent}%` }} />
      </div>

      <div className="vendedores-ranking-foot">
        <strong>{money ? fmtK(value) : fmtInt(value)}</strong>
        {extra && <span>{extra}</span>}
      </div>
    </div>
  )
}

function Empty({ children = 'Sem dados para exibir' }) {
  return <div className="empty">{children}</div>
}

export default function Vendedores() {
  const [periodo, setPeriodo] = useState('mes')
  const [mesReferencia, setMesReferencia] = useState(CURRENT_MONTH)
  const [anoReferencia, setAnoReferencia] = useState(CURRENT_YEAR)
  const [segmento, setSegmento] = useState('todos')
  const [sellers, setSellers] = useState([])
  const [metas, setMetas] = useState([])
  const [farms, setFarms] = useState([])
  const [sales, setSales] = useState([])
  const [salesAnt, setSalesAnt] = useState([])
  const [documents, setDocuments] = useState([])
  const [documentsAnt, setDocumentsAnt] = useState([])
  const [documentsHistory, setDocumentsHistory] = useState([])
  const [visits, setVisits] = useState([])
  const [visitsAnt, setVisitsAnt] = useState([])
  const [quotes, setQuotes] = useState([])
  const [quotesAnt, setQuotesAnt] = useState([])
  const [checklists, setChecklists] = useState([])
  const [loading, setLoading] = useState(true)
  const [detalheId, setDetalheId] = useState(null)
  const [metaTab, setMetaTab] = useState(() => new URLSearchParams(window.location.search).get('metas') === 'cadastro' ? 'cadastro' : 'acompanhamento')
  const metasRef = useRef(null)
  const { vendedores, vendedoresById } = useVendedores()

  useEffect(() => {
    // eslint-disable-next-line react-hooks/immutability
    carregarBase()
  }, [])

  useEffect(() => {
    // eslint-disable-next-line react-hooks/immutability
    carregarPeriodo()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [periodo, mesReferencia, anoReferencia])

  useEffect(() => {
    if (metaTab !== 'cadastro') return
    metasRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' })
  }, [metaTab])

  async function carregarMetas() {
    const { data, error } = await supabaseAdmin
      .from('goals')
      .select('seller_id,ultra_salesman_id,ano,mes,meta_fat')
    if (error) {
      console.error('Erro ao carregar metas comerciais:', error)
      return
    }
    setMetas(data || [])
  }

  async function carregarBase() {
    const [rSellers, rFarms] = await Promise.all([
      supabaseAdmin.from('profiles').select('*').eq('active', true).order('name'),
      supabaseAdmin.from('farms').select('*'),
    ])

    setSellers(rSellers.data || [])
    setFarms(rFarms.data || [])
    await carregarMetas()
  }

  async function carregarPeriodo() {
    setLoading(true)

    try {
      const [ini, fim] = periodRange(periodo, anoReferencia, mesReferencia)
      const [iniAnt, fimAnt] = previousPeriodRange(periodo, anoReferencia, mesReferencia)
      const histIni = historyStart(anoReferencia, mesReferencia, 12)

      const [
        salesAtual,
        salesAnterior,
        visitsAtual,
        visitsAnterior,
        quotesAtual,
        quotesAnterior,
        checksAtual,
        documentsAtual,
        documentsAnterior,
        documentsHistoryResult,
      ] = await Promise.all([
        supabaseAdmin.from('management_order_overview').select('*').gte('sale_date', toISO(ini)).lte('sale_date', toISO(fim)),
        supabaseAdmin.from('management_order_overview').select('*').gte('sale_date', toISO(iniAnt)).lte('sale_date', toISO(fimAnt)),
        supabaseAdmin.from('visits').select('*').gte('visit_date', toISO(ini)).lte('visit_date', toISO(fim)),
        supabaseAdmin.from('visits').select('*').gte('visit_date', toISO(iniAnt)).lte('visit_date', toISO(fimAnt)),
        supabaseAdmin.from('quotes').select('*').gte('created_at', `${toISO(ini)}T00:00:00`).lte('created_at', `${toISO(fim)}T23:59:59`),
        supabaseAdmin.from('quotes').select('*').gte('created_at', `${toISO(iniAnt)}T00:00:00`).lte('created_at', `${toISO(fimAnt)}T23:59:59`),
        supabaseAdmin.from('checklists').select('*').gte('applied_at', toISO(ini)).lte('applied_at', toISO(fim)),
        supabaseAdmin.from('management_order_overview').select('*').gte('sale_date', toISO(ini)).lte('sale_date', toISO(fim)),
        supabaseAdmin.from('management_order_overview').select('*').gte('sale_date', toISO(iniAnt)).lte('sale_date', toISO(fimAnt)),
        supabaseAdmin.from('management_order_overview').select('*').gte('sale_date', toISO(histIni)),
      ])

      setSales((salesAtual.data || []).filter(hasNetOrderValue).map(normalizeOrder))
      setSalesAnt((salesAnterior.data || []).filter(hasNetOrderValue).map(normalizeOrder))
      setVisits(visitsAtual.data || [])
      setVisitsAnt(visitsAnterior.data || [])
      setQuotes(quotesAtual.data || [])
      setQuotesAnt(quotesAnterior.data || [])
      setChecklists(checksAtual.data || [])
      setDocuments((documentsAtual.data || []).filter(hasNetOrderValue).map(normalizeOrder))
      setDocumentsAnt((documentsAnterior.data || []).filter(hasNetOrderValue).map(normalizeOrder))
      setDocumentsHistory((documentsHistoryResult.data || []).filter(hasNetOrderValue).map(normalizeOrder))
    } catch (err) {
      console.error('Erro ao carregar vendedores:', err)
      setSales([])
      setSalesAnt([])
      setVisits([])
      setVisitsAnt([])
      setQuotes([])
      setQuotesAnt([])
      setChecklists([])
      setDocuments([])
      setDocumentsAnt([])
      setDocumentsHistory([])
    } finally {
      setLoading(false)
    }
  }

  const dados = useMemo(() => {
    const sellerById = new Map(sellers.map(s => [s.id, s]))
    // Só existe vendedor que vem do Ultra: perfis sem ultra_salesman_id
    // válido (ex.: gestor puro, ou vínculo quebrado apontando pra um id que
    // não é vendedor real) não contam como vendedor nesta tela.
    const sellersAtivos = sellers.filter(s => isVendedorValido(s.ultra_salesman_id, vendedoresById))
    const ultraToProfileId = new Map(sellersAtivos.filter(s => s.ultra_salesman_id).map(s => [Number(s.ultra_salesman_id), s.id]))
    const metaPorVendedorMes = new Map()
    metas.forEach(meta => {
      const codigo = Number(meta.ultra_salesman_id)
      const id = codigo
        ? ultraToProfileId.get(codigo) || `ultra:${codigo}`
        : meta.seller_id
      if (!id || !meta.ano || !meta.mes) return
      const chave = `${id}:${meta.ano}-${String(meta.mes).padStart(2, '0')}`
      metaPorVendedorMes.set(chave, (metaPorVendedorMes.get(chave) || 0) + Number(meta.meta_fat || 0))
    })
    const [inicioMeta, fimMeta] = periodRange(periodo, anoReferencia, mesReferencia)
    const mesesMeta = []
    for (let d = new Date(inicioMeta.getFullYear(), inicioMeta.getMonth(), 1);
      d <= fimMeta;
      d.setMonth(d.getMonth() + 1)) {
      mesesMeta.push(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`)
    }
    const metaDoMes = (sellerId, mes) => metaPorVendedorMes.get(`${sellerId}:${mes}`) ?? null
    // Prioriza resolver pelo id do Ultra quando o perfil dono dele já existe
    // (evita duplicar a mesma pessoa em duas linhas -- uma pelo seller_id do
    // app, outra pelo ultra_salesman_id solto na venda/documento).
    const saleSellerKey = row => {
      if (row.ultra_salesman_id && ultraToProfileId.has(Number(row.ultra_salesman_id))) return ultraToProfileId.get(Number(row.ultra_salesman_id))
      if (row.seller_id) return row.seller_id
      if (row.ultra_salesman_id && vendedoresById.has(row.ultra_salesman_id)) return `ultra:${row.ultra_salesman_id}`
      return null
    }
    const farmById = new Map(farms.map(f => [f.id, f]))

    const filtrarSegmento = row => {
      if (segmento === 'todos') return true
      const farm = farmById.get(row.farm_id)
      return String(farm?.segment || '').toLowerCase() === segmento
    }

    const vendas = sales.filter(filtrarSegmento)
    const vendasAnt = salesAnt.filter(filtrarSegmento)
    const visitas = visits.filter(filtrarSegmento)
    const visitasAnt = visitsAnt.filter(filtrarSegmento)
    const cotacoes = quotes.filter(filtrarSegmento)
    const cotacoesAnt = quotesAnt.filter(filtrarSegmento)

    const carteiraFiltrada = segmento === 'todos'
      ? farms
      : farms.filter(f => String(f.segment || '').toLowerCase() === segmento)

    const docs = segmento === 'todos' ? documents : []
    const docsAnt = segmento === 'todos' ? documentsAnt : []
    const totalFat = segmento === 'todos' ? docs.reduce((sum, doc) => sum + Number(doc.total || 0), 0) : vendas.reduce((a, s) => a + Number(s.total || 0), 0)
    const totalFatAnt = segmento === 'todos' ? docsAnt.reduce((sum, doc) => sum + Number(doc.total || 0), 0) : vendasAnt.reduce((a, s) => a + Number(s.total || 0), 0)
    const totalVisitas = visitas.length
    const totalVisitasAnt = visitasAnt.length
    const totalCotacoes = cotacoes.length
    const totalCotacoesAnt = cotacoesAnt.length
    const convertidas = cotacoes.filter(q => normalizarStatus(q.status) === 'convertida').length
    const convertidasAnt = cotacoesAnt.filter(q => normalizarStatus(q.status) === 'convertida').length
    const conversao = totalCotacoes ? Math.round((convertidas / totalCotacoes) * 100) : 0
    const conversaoAnt = totalCotacoesAnt ? Math.round((convertidasAnt / totalCotacoesAnt) * 100) : 0

    // Base é sempre a lista canônica de vendedores do Ultra: quem já tem
    // perfil de login entra pela chave do perfil (pra casar farms/visitas/
    // cotações, que usam seller_id=uuid do app); quem ainda não tem login
    // entra como "ultra:<id>" mesmo assim, pra aparecer se tiver atividade.
    const sellerIdsAtivos = new Set(
      vendedores.map(v => ultraToProfileId.get(Number(v.id)) || `ultra:${v.id}`),
    )

    const rows = [...sellerIdsAtivos].map(id => {
      const vendorId = typeof id === 'string' && id.startsWith('ultra:') ? Number(id.slice(6)) : sellerById.get(id)?.ultra_salesman_id
      const canonico = vendorId ? vendedoresById.get(vendorId) : null
      const profileSeller = sellerById.get(id)
      const seller = profileSeller ? {
        ...profileSeller,
        name: String(canonico?.name || profileSeller.name || profileSeller.email || '').trim() || 'Vendedor não vinculado',
      } : {
        id,
        name: String(canonico?.name || '').trim() || 'Vendedor não vinculado',
        email: '',
        ultra_salesman_id: vendorId || null,
      }
      const fazendas = carteiraFiltrada.filter(f => f.seller_id === id)
      const vendasSeller = vendas.filter(s => saleSellerKey(s) === id)
      const vendasSellerAnt = vendasAnt.filter(s => saleSellerKey(s) === id)
      const docsSeller = docs.filter(doc => saleSellerKey(doc) === id)
      const docsSellerAnt = docsAnt.filter(doc => saleSellerKey(doc) === id)
      const visitasSeller = visitas.filter(v => (v.seller_id || v.user_id || v.created_by) === id)
      const visitasSellerAnt = visitasAnt.filter(v => (v.seller_id || v.user_id || v.created_by) === id)
      const cotacoesSeller = cotacoes.filter(q => q.seller_id === id)
      const cotacoesSellerAnt = cotacoesAnt.filter(q => q.seller_id === id)
      const convertidasSeller = cotacoesSeller.filter(q => normalizarStatus(q.status) === 'convertida').length
      const convertidasSellerAnt = cotacoesSellerAnt.filter(q => normalizarStatus(q.status) === 'convertida').length
      const fat = segmento === 'todos' ? docsSeller.reduce((sum, doc) => sum + Number(doc.total || 0), 0) : vendasSeller.reduce((a, s) => a + Number(s.total || 0), 0)
      const fatAnt = segmento === 'todos' ? docsSellerAnt.reduce((sum, doc) => sum + Number(doc.total || 0), 0) : vendasSellerAnt.reduce((a, s) => a + Number(s.total || 0), 0)
      const pedidos = vendasSeller.length
      const ticket = pedidos ? fat / pedidos : 0
      const fazComVenda = new Set(vendasSeller.map(s => s.farm_id).filter(Boolean)).size
      const fazVisitadas = new Set(visitasSeller.map(v => v.farm_id).filter(Boolean)).size
      const coberturaVisitas = fazendas.length ? Math.round((fazVisitadas / fazendas.length) * 100) : 0
      const coberturaVendas = fazendas.length ? Math.round((fazComVenda / fazendas.length) * 100) : 0
      const txConversao = cotacoesSeller.length ? Math.round((convertidasSeller / cotacoesSeller.length) * 100) : 0
      const txConversaoAnt = cotacoesSellerAnt.length ? Math.round((convertidasSellerAnt / cotacoesSellerAnt.length) * 100) : 0
      const checksSeller = checklists.filter(c => {
        const farm = farmById.get(c.farm_id)
        return farm?.seller_id === id
      })
      const scoreMedia = checksSeller.length
        ? Math.round(checksSeller.reduce((a, c) => a + Number(c.overall_score || 0), 0) / checksSeller.length)
        : 0
      const clientesRisco = fazendas.filter(f => {
        const ultimaCompra = vendas
          .filter(s => s.farm_id === f.id)
          .sort((a, b) => String(b.sale_date).localeCompare(String(a.sale_date)))[0]?.sale_date

        const ultimaVisita = visits
          .filter(v => v.farm_id === f.id)
          .sort((a, b) => String(b.visit_date).localeCompare(String(a.visit_date)))[0]?.visit_date

        return diasDesde(ultimaCompra) >= 60 || diasDesde(ultimaVisita) >= 45
      }).length

      const performance = (
        (fat > 0 ? 35 : 0) +
        Math.min(25, txConversao / 4) +
        Math.min(20, coberturaVisitas / 5) +
        Math.min(20, visitasSeller.length * 2)
      )

      const evolucao = Array.from({ length: 6 }, (_, index) => {
        const date = new Date(anoReferencia, mesReferencia - 1 - (5 - index), 1)
        const key = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`
        const total = documentsHistory
          .filter(doc => saleSellerKey(doc) === id && doc.sale_date?.startsWith(key))
          .reduce((sum, doc) => sum + Number(doc.total || 0), 0)
        return {
          mes: date.toLocaleDateString('pt-BR', { month: 'short', year: '2-digit' }),
          Pedidos: total,
          Meta: segmento === 'todos' ? metaDoMes(id, key) : null,
        }
      })
      const metasPeriodo = mesesMeta.map(mes => metaDoMes(id, mes))
      const existeMeta = metasPeriodo.some(valor => valor !== null)
      const meta = existeMeta ? metasPeriodo.reduce((total, valor) => total + Number(valor || 0), 0) : null
      const atingimento = meta > 0 ? (fat / meta) * 100 : null

      return {
        ...seller,
        fat,
        fatAnt,
        meta,
        atingimento,
        pedidos,
        ticket,
        visitas: visitasSeller.length,
        visitasAnt: visitasSellerAnt.length,
        cotacoes: cotacoesSeller.length,
        cotacoesAnt: cotacoesSellerAnt.length,
        convertidas: convertidasSeller,
        txConversao,
        txConversaoAnt,
        coberturaVisitas,
        coberturaVendas,
        scoreMedia,
        fazendas: fazendas.length,
        fazComVenda,
        fazVisitadas,
        clientesRisco,
        performance: Math.round(performance),
        evolucao,
      }
    })

    // Renomeado pra rankingVendedores -- "vendedores" já é o nome da lista
    // canônica (vinda de useVendedores()) usada mais acima nesta mesma
    // função; reaproveitar o nome aqui criava um shadowing perigoso (TDZ).
    const rankingVendedores = rows
      .map(r => ({
        ...r,
        role: r.role || r.position || 'Comercial',
      }))
      .sort((a, b) => b.fat - a.fat || b.performance - a.performance)

    const melhor = rankingVendedores[0]
    const topFaturamento = [...rankingVendedores].sort((a, b) => b.fat - a.fat).slice(0, 8)
    const topConversao = [...rankingVendedores].filter(v => v.cotacoes > 0).sort((a, b) => b.txConversao - a.txConversao).slice(0, 8)
    const topVisitas = [...rankingVendedores].sort((a, b) => b.visitas - a.visitas).slice(0, 8)
    const risco = [...rankingVendedores].filter(v => v.clientesRisco > 0).sort((a, b) => b.clientesRisco - a.clientesRisco).slice(0, 8)

    const mesMap = {}
    documentsHistory.forEach(s => {
      const mes = s.sale_date?.slice(0, 7)
      if (!mes) return

      if (!mesMap[mes]) {
        mesMap[mes] = {
          mes,
          label: new Date(`${mes}-01T12:00:00`).toLocaleDateString('pt-BR', {
            month: 'short',
            year: '2-digit',
          }),
          Pedidos: 0,
          Quantidade: 0,
        }
      }

      mesMap[mes].Pedidos += Number(s.total || 0)
      mesMap[mes].Quantidade += 1
    })

    const evolucao = Object.values(mesMap)
      .sort((a, b) => a.mes.localeCompare(b.mes))
      .slice(-6)

    const barData = topFaturamento.map(v => ({
      name: v.name || v.email || '—',
      Pedidos: v.fat,
      Meta: v.meta,
    }))

    return {
      vendedores: rankingVendedores,
      melhor,
      totalFat,
      totalFatAnt,
      totalVisitas,
      totalVisitasAnt,
      totalCotacoes,
      totalCotacoesAnt,
      conversao,
      conversaoAnt,
      topFaturamento,
      topConversao,
      topVisitas,
      risco,
      evolucao,
      barData,
      totalCarteira: carteiraFiltrada.length,
    }
  }, [sellers, metas, vendedores, vendedoresById, farms, sales, salesAnt, documents, documentsAnt, documentsHistory, visits, visitsAnt, quotes, quotesAnt, checklists, segmento, periodo, mesReferencia, anoReferencia])

  const topFatMax = Math.max(...dados.topFaturamento.map(v => v.fat), 1)
  const topConvMax = Math.max(...dados.topConversao.map(v => v.txConversao), 1)
  const topVisitasMax = Math.max(...dados.topVisitas.map(v => v.visitas), 1)
  const riscoMax = Math.max(...dados.risco.map(v => v.clientesRisco), 1)

  function exportCSV() {
    const rows = [
      ['Nome', 'Email', 'Função', 'Fazendas', 'Faturamento', 'Meta do período', 'Atingimento %', 'Pedidos', 'Ticket Médio', 'Cotações', 'Convertidas', 'Conversão %', 'Visitas', 'Cobertura Visitas %', 'Cobertura Vendas %', 'Clientes em risco', 'Score Médio'],
      ...dados.vendedores.map(s => [
        s.name,
        s.email,
        s.role,
        s.fazendas,
        s.fat,
        s.meta ?? '',
        s.atingimento === null ? '' : s.atingimento.toFixed(1),
        s.pedidos,
        s.ticket,
        s.cotacoes,
        s.convertidas,
        s.txConversao,
        s.visitas,
        s.coberturaVisitas,
        s.coberturaVendas,
        s.clientesRisco,
        s.scoreMedia,
      ]),
    ]

    const csv = rows.map(r => r.map(c => `"${String(c ?? '').replace(/"/g, '""')}"`).join(';')).join('\n')
    const a = document.createElement('a')

    a.href = `data:text/csv;charset=utf-8,\uFEFF${encodeURIComponent(csv)}`
    a.download = 'performance-vendedores.csv'
    a.click()
  }

  const vendedoresComVenda = dados.vendedores.filter(v => v.fat > 0).length
  const totalPedidos = dados.vendedores.reduce((sum, v) => sum + Number(v.pedidos || 0), 0)
  const ticketTime = totalPedidos ? dados.totalFat / totalPedidos : 0

  return (
    <div style={{ flex: 1, overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>
      <Topbar title="Equipe Comercial" subtitle="Vendedores, pedidos, atividade e acompanhamento de metas">
        <button className="btn btn-primary btn-sm" onClick={() => setMetaTab('cadastro')}>
          <IconTargetArrow size={14} /> Cadastrar metas
        </button>
        <button className="btn btn-ghost btn-sm" onClick={exportCSV}>
          <IconDownload size={14} />
          Exportar
        </button>
      </Topbar>

      <div className="page vendedores-page cc-page" style={{ overflowY: 'auto' }}>
        <div className="cc-intro"><span className="cc-kicker">Desempenho do time</span><h2>Como está cada vendedor?</h2><p>Compare os pedidos do período e clique no nome de um vendedor para ver os detalhes. Os indicadores de visitas, cotações e carteira podem ser exibidos quando você precisar.</p></div>
        <section className="vendedores-toolbar" style={{ marginBottom: 14 }}>
          <div className="vendedores-toolbar-left">
            <div className="vendedores-filter-icon"><IconFilter size={15} /></div>

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

          <div className="vendedores-toolbar-count">
            {fmtInt(dados.vendedores.length)} vendedores
          </div>
        </section>

        <div className="cc-toolbar-help">Os valores refletem os filtros selecionados. “Em atenção” é um sinal para acompanhamento, não comprovação de perda de cliente.</div>
        <section className="cc-vendedores-kpis" style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(4,minmax(0,1fr))',
          gap: 10,
          marginBottom: 14
        }}>
          <KpiCard
            icon={IconWallet}
            label="Valor dos pedidos"
            value={fmtK(dados.totalFat)}
            atual={dados.totalFat}
            anterior={dados.totalFatAnt}
          />
          <KpiCard
            icon={IconReceipt}
            label="Pedidos"
            value={fmtInt(totalPedidos)}
            sub={`${fmtK(ticketTime)} ticket médio`}
          />
          <KpiCard
            icon={IconUser}
            label="Vendedores com venda"
            value={`${vendedoresComVenda} de ${dados.vendedores.length}`}
            sub="com pedido no período"
          />
          <KpiCard
            icon={IconMapPin}
            label="Visitas"
            value={fmtInt(dados.totalVisitas)}
            atual={dados.totalVisitas}
            anterior={dados.totalVisitasAnt}
          />
        </section>



        {loading ? (
          <Empty>Carregando equipe comercial...</Empty>
        ) : (
          <>
            <section className="vendedores-card" style={{ marginBottom: 14 }}>
              <div className="vendedores-card-head" style={{ alignItems: 'center' }}>
                <div>
                  <span className="vendedores-eyebrow">Visão principal</span>
                  <h3>Pedidos e metas por vendedor</h3>
                  <p style={{ margin: '4px 0 0', fontSize: 10, color: 'var(--text-faint)' }}>
                    Resultado comercial primeiro. Campo e carteira aparecem como contexto para entender cada desempenho.
                  </p>
                </div>
                <div className="cc-table-head-actions"><small>Selecione um vendedor para abrir os detalhes</small></div>
              </div>

              <div className="table-wrap vendedores-table-wrap">
                <table className="vendedores-summary-table">
                  <thead>
                    <tr>
                      <th scope="col">Vendedor</th>
                      <th scope="col" className="vendedores-align-right">Valor dos pedidos</th>
                      <th scope="col">Meta e atingimento</th>
                      <th scope="col" className="vendedores-align-right">Variação</th>
                      <th scope="col" className="vendedores-align-center">Pedidos</th>
                      <th scope="col" className="vendedores-align-center">Carteira</th>
                      <th scope="col"><span className="sr-only">Detalhes</span></th>
                    </tr>
                  </thead>
                  <tbody>
                    {dados.vendedores.length === 0 ? (
                      <tr>
                        <td colSpan={7} className="vendedores-empty-state">Nenhum vendedor com dados no período</td>
                      </tr>
                    ) : dados.vendedores.map(s => {
                      const variacao = pct(s.fat, s.fatAnt)
                      const aberto = detalheId === s.id
                      const alternarDetalhe = () => setDetalheId(aberto ? null : s.id)
                      return (
                        <Fragment key={s.id}>
                          <tr
                            className={'vendedores-summary-row' + (aberto ? ' vendedores-row-active' : '')}
                            onClick={alternarDetalhe}
                            onKeyDown={event => {
                              if (event.target === event.currentTarget && (event.key === 'Enter' || event.key === ' ')) {
                                event.preventDefault()
                                alternarDetalhe()
                              }
                            }}
                            tabIndex={0}
                            aria-expanded={aberto}
                          >
                            <td className="vendedores-cell-name">
                              <div className="vendedores-person">
                                <div className="vendedores-avatar"><IconUser size={17} /></div>
                                <div className="vendedores-person-info">
                                  <strong className="vendedores-person-name" title={s.name}>{String(s.name || '').trim() || 'Vendedor não identificado'}</strong>
                                  <small>{s.fazendas ? `${fmtInt(s.fazendas)} clientes na carteira` : 'Sem carteira vinculada'}</small>
                                </div>
                              </div>
                            </td>
                            <td className="vendedores-cell-revenue vendedores-align-right">
                              <strong className="vendedores-money">{fmtK(s.fat)}</strong>
                            </td>
                            <td className="vendedores-cell-goal">
                              {segmento !== 'todos' ? (
                                <span className="vendedores-goal-muted">Meta disponível no consolidado</span>
                              ) : s.atingimento === null ? (
                                <span className="vendedores-goal-muted">Sem meta cadastrada</span>
                              ) : (
                                <div className="vendedores-goal-content">
                                  <div className="vendedores-goal-progress">
                                    <span className={'vendedores-goal-track' + (s.atingimento >= 100 ? ' achieved' : '')}
                                      role="progressbar" aria-label={'Meta atingida por ' + s.name}
                                      aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.min(100, Math.max(0, Math.round(s.atingimento)))}
                                      aria-valuetext={s.atingimento.toFixed(1) + '% da meta atingida'}>
                                      <i style={{ width: Math.min(100, Math.max(0, s.atingimento)) + '%' }} />
                                    </span>
                                    <strong className="vendedores-goal-percent">{s.atingimento.toFixed(0)}%</strong>
                                  </div>
                                  <span className="vendedores-goal-meta">Meta: <strong>{fmtK(s.meta)}</strong></span>
                                </div>
                              )}
                            </td>
                            <td className="vendedores-cell-variation vendedores-align-right">
                              <span className={'vendedores-var ' + (variacao >= 0 ? 'up' : 'down')}>
                                {variacao >= 0 ? <IconTrendingUp size={14} /> : <IconTrendingDown size={14} />}
                                {variacao >= 0 ? '+' : ''}{variacao.toFixed(1)}%
                              </span>
                            </td>
                            <td className="vendedores-cell-orders vendedores-align-center"><strong>{fmtInt(s.pedidos)}</strong></td>
                            <td className="vendedores-cell-wallet vendedores-align-center">{fmtInt(s.fazendas)}</td>
                            <td className="vendedores-cell-expand">
                              <button type="button" className="vendedores-expand-button"
                                onClick={event => { event.stopPropagation(); alternarDetalhe() }}
                                aria-expanded={aberto} aria-label={(aberto ? 'Fechar' : 'Abrir') + ' detalhes de ' + s.name}>
                                {aberto ? <IconChevronUp size={17} /> : <IconChevronDown size={17} />}
                              </button>
                            </td>
                          </tr>

                          {detalheId === s.id && (
                            <tr className="vendedores-detail-row">
                              <td colSpan={7} className="vendedores-detail-cell">
                                <div className="vendedores-detail-layout">
                                  <div className="vendedores-detail-chart">
                                    <div className="vendedores-card-head">
                                      <div>
                                        <span className="vendedores-eyebrow">Últimos 6 meses</span>
                                        <h3>Evolução de {s.name}</h3>
                                        <small className="vendedores-chart-legend">
                                          <span><i className="pedidos" /> Pedidos</span>
                                          {segmento === 'todos' && <span><i className="meta" /> Meta mensal</span>}
                                        </small>
                                      </div>
                                    </div>

                                    <ResponsiveContainer width="100%" height={220}>
                                      <ComposedChart data={s.evolucao} margin={{ top: 12, right: 12, left: 0, bottom: 0 }}>
                                        <defs>
                                          <linearGradient id={`sellerEvolution-${String(s.id).replace(/[^a-zA-Z0-9]/g, '')}`} x1="0" y1="0" x2="0" y2="1">
                                            <stop offset="5%" stopColor="#E87722" stopOpacity={0.24} />
                                            <stop offset="95%" stopColor="#E87722" stopOpacity={0.02} />
                                          </linearGradient>
                                        </defs>
                                        <CartesianGrid strokeDasharray="4 6" vertical={false} />
                                        <XAxis dataKey="mes" tickLine={false} axisLine={false} />
                                        <YAxis tickLine={false} axisLine={false} tickFormatter={value => `${Math.round(value / 1000)}k`} />
                                        <Tooltip formatter={(value, name) => [fmtK(value), name === 'Meta' ? 'Meta cadastrada' : 'Valor dos pedidos']} />
                                        <Area
                                          type="monotone"
                                          dataKey="Pedidos"
                                          stroke="#E87722"
                                          strokeWidth={2.5}
                                          fill={`url(#sellerEvolution-${String(s.id).replace(/[^a-zA-Z0-9]/g, '')})`}
                                          dot={{ r: 3 }}
                                        />
                                        {segmento === 'todos' && (
                                          <Line type="monotone" dataKey="Meta" stroke="#246E6A" strokeWidth={2.5} strokeDasharray="6 4" connectNulls={false} dot={{ r: 3, fill: '#246E6A', stroke: '#fff', strokeWidth: 1.5 }} activeDot={{ r: 5 }} />
                                        )}
                                      </ComposedChart>
                                    </ResponsiveContainer>
                                  </div>

                                  <div className="vendedores-detail-stats">
                                    <div className="vendedores-detail-box vendedores-detail-goal">
                                      <span>Meta do período</span>
                                      <strong>{segmento === 'todos' && s.meta !== null ? fmtK(s.meta) : '—'}</strong>
                                      <small>{segmento !== 'todos' ? 'Meta não segmentada' : s.meta !== null ? `${s.atingimento?.toFixed(1) ?? 0}% atingido · ${fmtK(Math.max(0, s.meta - s.fat))} restante` : 'Sem meta cadastrada'}</small>
                                    </div>
                                    <div className="vendedores-detail-box">
                                      <span>Valor dos pedidos</span>
                                      <strong>{fmtK(s.fat)}</strong>
                                      <small>Pedidos líquidos do período</small>
                                    </div>
                                    <div className="vendedores-detail-box">
                                      <span>Pedidos</span>
                                      <strong>{fmtInt(s.pedidos)}</strong>
                                      <small>{fmtK(s.ticket)} por pedido</small>
                                    </div>
                                    <div className="vendedores-detail-box">
                                      <span>Visitas</span>
                                      <strong>{fmtInt(s.visitas)}</strong>
                                      <small>{s.coberturaVisitas}% da carteira visitada</small>
                                    </div>
                                    <div className="vendedores-detail-box">
                                      <span>Cotações</span>
                                      <strong>{fmtInt(s.cotacoes)}</strong>
                                      <small>{fmtInt(s.convertidas)} convertidas</small>
                                    </div>
                                    <div className="vendedores-detail-box">
                                      <span>Clientes com venda</span>
                                      <strong>{fmtInt(s.fazComVenda)}</strong>
                                      <small>{s.coberturaVendas}% da carteira</small>
                                    </div>
                                    <div className="vendedores-detail-box">
                                      <span>Clientes em atenção</span>
                                      <strong>{fmtInt(s.clientesRisco)}</strong>
                                      <small>sem compra 60d ou visita 45d</small>
                                    </div>
                                    <div className="vendedores-detail-box">
                                      <span>Valor anterior</span>
                                      <strong>{fmtK(s.fatAnt)}</strong>
                                      <VarBadge atual={s.fat} anterior={s.fatAnt} />
                                    </div>
                                  </div>
                                </div>
                              </td>
                            </tr>
                          )}
                        </Fragment>
                      )
                    })}
                  </tbody>
                </table>
              </div>
            </section>

            {metaTab === 'cadastro' && (
              <section ref={metasRef} id="equipe-metas" className="vendedores-card" style={{ marginBottom: 18, scrollMarginTop: 20 }}>
                <div className="vendedores-card-head" style={{ alignItems: 'center', flexWrap: 'wrap' }}>
                  <div>
                    <span className="vendedores-eyebrow">Configuração de objetivos</span>
                    <h3>Cadastrar ou revisar metas</h3>
                    <p style={{ margin: '5px 0 0', fontSize: 12, color: '#71685F' }}>As metas aprovadas no Budget são preservadas; metas manuais podem ser editadas.</p>
                  </div>
                  <button type="button" className="btn btn-ghost btn-sm" onClick={() => setMetaTab('acompanhamento')}>Fechar cadastro</button>
                </div>
                <div style={{ padding: '0 16px 18px', minWidth: 0 }}>
                  <Metas embedded activeTab="cadastro" initialYear={anoReferencia} initialMonth={mesReferencia} onGoalSaved={carregarMetas} />
                </div>
              </section>
            )}

            <details className="cc-more">
              <summary><span className="cc-summary-icon">↗</span><span className="cc-summary-text">Ver indicadores adicionais da equipe<small>Conversão de cotações, carteira vinculada e clientes que precisam de acompanhamento</small></span><span className="cc-arrow">⌄</span></summary>
              <div className="cc-more-body">
            <section style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(3,minmax(0,1fr))',
              gap: 10,
              marginBottom: 12
            }}>
              <div className="vendedores-card">
                <div className="vendedores-card-head">
                  <div><span className="vendedores-eyebrow">Time</span><h3>Conversão de cotações</h3></div>
                </div>
                <div style={{ padding: '18px 16px' }}>
                  <strong style={{ fontSize: 28 }}>{dados.conversao}%</strong>
                  <div style={{ marginTop: 6 }}><VarBadge atual={dados.conversao} anterior={dados.conversaoAnt} /></div>
                  <small style={{ display: 'block', marginTop: 8, color: 'var(--text-faint)' }}>
                    {fmtInt(dados.totalCotacoes)} cotações no período
                  </small>
                </div>
              </div>

              <div className="vendedores-card">
                <div className="vendedores-card-head">
                  <div><span className="vendedores-eyebrow">Cobertura</span><h3>Carteira comercial</h3></div>
                </div>
                <div style={{ padding: '18px 16px' }}>
                  <strong style={{ fontSize: 28 }}>{fmtInt(dados.totalCarteira)}</strong>
                  <small style={{ display: 'block', marginTop: 8, color: 'var(--text-faint)' }}>
                    clientes/fazendas vinculados ao time no filtro
                  </small>
                </div>
              </div>

              <div className="vendedores-card">
                <div className="vendedores-card-head">
                  <div><span className="vendedores-eyebrow">Atenção</span><h3>Carteiras com risco</h3></div>
                </div>
                <div style={{ padding: '18px 16px' }}>
                  <strong style={{ fontSize: 28 }}>
                    {fmtInt(dados.vendedores.reduce((sum, v) => sum + Number(v.clientesRisco || 0), 0))}
                  </strong>
                  <small style={{ display: 'block', marginTop: 8, color: 'var(--text-faint)' }}>
                    critérios de atenção: 60 dias sem pedido ou 45 sem visita; considerar ciclo de compra de cada cliente
                  </small>
                </div>
              </div>
            </section>
              </div>
            </details>
          </>
        )}
      </div>
    </div>
  )

}
