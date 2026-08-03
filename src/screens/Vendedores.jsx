import { useEffect, useMemo, useState } from 'react'
import { supabaseAdmin } from '../lib/supabase'
import { hasNetOrderValue, netOrderValue } from '../lib/commercialMetrics'
import { isVendedorValido, useVendedores } from '../lib/sellers'
import Topbar from '../components/Topbar'
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
  const [periodo, setPeriodo] = useState('ano')
  const [mesReferencia, setMesReferencia] = useState(CURRENT_MONTH)
  const [anoReferencia, setAnoReferencia] = useState(CURRENT_YEAR)
  const [segmento, setSegmento] = useState('todos')
  const [sellers, setSellers] = useState([])
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

  async function carregarBase() {
    const [rSellers, rFarms] = await Promise.all([
      supabaseAdmin.from('profiles').select('*').eq('active', true).order('name'),
      supabaseAdmin.from('farms').select('*'),
    ])

    setSellers(rSellers.data || [])
    setFarms(rFarms.data || [])
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
        supabaseAdmin.from('fiscal_documents').select('issue_date,document_total,movement_type,seller_id,ultra_salesman_id,salesman_name').gte('issue_date', toISO(ini)).lte('issue_date', toISO(fim)),
        supabaseAdmin.from('fiscal_documents').select('issue_date,document_total,movement_type,seller_id,ultra_salesman_id,salesman_name').gte('issue_date', toISO(iniAnt)).lte('issue_date', toISO(fimAnt)),
        supabaseAdmin.from('fiscal_documents').select('issue_date,document_total,movement_type,seller_id,ultra_salesman_id,salesman_name').gte('issue_date', toISO(histIni)),
      ])

      setSales((salesAtual.data || []).filter(hasNetOrderValue).map(normalizeOrder))
      setSalesAnt((salesAnterior.data || []).filter(hasNetOrderValue).map(normalizeOrder))
      setVisits(visitsAtual.data || [])
      setVisitsAnt(visitsAnterior.data || [])
      setQuotes(quotesAtual.data || [])
      setQuotesAnt(quotesAnterior.data || [])
      setChecklists(checksAtual.data || [])
      setDocuments(documentsAtual.data || [])
      setDocumentsAnt(documentsAnterior.data || [])
      setDocumentsHistory(documentsHistoryResult.data || [])
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
    const fiscalValue = doc => doc.movement_type === 'devolucao' ? -Math.abs(Number(doc.document_total || 0)) : Number(doc.document_total || 0)
    // Só existe vendedor que vem do Ultra: perfis sem ultra_salesman_id
    // válido (ex.: gestor puro, ou vínculo quebrado apontando pra um id que
    // não é vendedor real) não contam como vendedor nesta tela.
    const sellersAtivos = sellers.filter(s => isVendedorValido(s.ultra_salesman_id, vendedoresById))
    const ultraToProfileId = new Map(sellersAtivos.filter(s => s.ultra_salesman_id).map(s => [s.ultra_salesman_id, s.id]))
    // Prioriza resolver pelo id do Ultra quando o perfil dono dele já existe
    // (evita duplicar a mesma pessoa em duas linhas -- uma pelo seller_id do
    // app, outra pelo ultra_salesman_id solto na venda/documento).
    const saleSellerKey = row => {
      if (row.ultra_salesman_id && ultraToProfileId.has(row.ultra_salesman_id)) return ultraToProfileId.get(row.ultra_salesman_id)
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
    const totalFat = segmento === 'todos' ? docs.reduce((sum, doc) => sum + fiscalValue(doc), 0) : vendas.reduce((a, s) => a + Number(s.total || 0), 0)
    const totalFatAnt = segmento === 'todos' ? docsAnt.reduce((sum, doc) => sum + fiscalValue(doc), 0) : vendasAnt.reduce((a, s) => a + Number(s.total || 0), 0)
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
      vendedores.map(v => ultraToProfileId.get(v.id) || `ultra:${v.id}`),
    )

    const rows = [...sellerIdsAtivos].map(id => {
      const vendorId = typeof id === 'string' && id.startsWith('ultra:') ? Number(id.slice(6)) : sellerById.get(id)?.ultra_salesman_id
      const canonico = vendorId ? vendedoresById.get(vendorId) : null
      const seller = sellerById.get(id) || {
        id,
        name: canonico?.name || 'Vendedor não vinculado',
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
      const fat = segmento === 'todos' ? docsSeller.reduce((sum, doc) => sum + fiscalValue(doc), 0) : vendasSeller.reduce((a, s) => a + Number(s.total || 0), 0)
      const fatAnt = segmento === 'todos' ? docsSellerAnt.reduce((sum, doc) => sum + fiscalValue(doc), 0) : vendasSellerAnt.reduce((a, s) => a + Number(s.total || 0), 0)
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
        const today = new Date()
        const date = new Date(today.getFullYear(), today.getMonth() - (5 - index), 1)
        const key = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`
        const total = documentsHistory
          .filter(doc => saleSellerKey(doc) === id && doc.issue_date?.startsWith(key))
          .reduce((sum, doc) => sum + fiscalValue(doc), 0)
        return {
          mes: date.toLocaleDateString('pt-BR', { month: 'short' }),
          Faturamento: total,
        }
      })

      return {
        ...seller,
        fat,
        fatAnt,
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
    documents.forEach(s => {
      const mes = s.issue_date?.slice(0, 7)
      if (!mes) return

      if (!mesMap[mes]) {
        mesMap[mes] = {
          mes,
          label: new Date(`${mes}-01T12:00:00`).toLocaleDateString('pt-BR', {
            month: 'short',
            year: '2-digit',
          }),
          Faturamento: 0,
          Pedidos: 0,
        }
      }

      mesMap[mes].Faturamento += fiscalValue(s)
      if (s.movement_type === 'venda') mesMap[mes].Pedidos += 1
    })

    const evolucao = Object.values(mesMap)
      .sort((a, b) => a.mes.localeCompare(b.mes))
      .slice(-6)

    const barData = topFaturamento.map(v => ({
      name: v.name || v.email || '—',
      Faturamento: v.fat,
      Meta: Number(v.monthly_goal || v.goal || 0),
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
  }, [sellers, vendedores, vendedoresById, farms, sales, salesAnt, documents, documentsAnt, documentsHistory, visits, visitsAnt, quotes, quotesAnt, checklists, segmento])

  const topFatMax = Math.max(...dados.topFaturamento.map(v => v.fat), 1)
  const topConvMax = Math.max(...dados.topConversao.map(v => v.txConversao), 1)
  const topVisitasMax = Math.max(...dados.topVisitas.map(v => v.visitas), 1)
  const riscoMax = Math.max(...dados.risco.map(v => v.clientesRisco), 1)

  function exportCSV() {
    const rows = [
      ['Nome', 'Email', 'Função', 'Fazendas', 'Faturamento', 'Pedidos', 'Ticket Médio', 'Cotações', 'Convertidas', 'Conversão %', 'Visitas', 'Cobertura Visitas %', 'Cobertura Vendas %', 'Clientes em risco', 'Score Médio'],
      ...dados.vendedores.map(s => [
        s.name,
        s.email,
        s.role,
        s.fazendas,
        s.fat,
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

  return (
    <div style={{ flex: 1, overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>
      <Topbar title="Performance Comercial" subtitle="Desempenho, conversão e execução por vendedor">
        <button className="btn btn-ghost btn-sm" onClick={exportCSV}>
          <IconDownload size={14} />
          Exportar CSV
        </button>
      </Topbar>

      <div className="page vendedores-page" style={{ overflowY: 'auto' }}>
        <section className="vendedores-toolbar">
          <div className="vendedores-toolbar-left">
            <div className="vendedores-filter-icon">
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

          <div className="vendedores-toolbar-count">
            {fmtInt(dados.vendedores.length)} vendedores analisados
          </div>
        </section>

        <section className="vendedores-hero">
          <div>
            <span className="vendedores-eyebrow">Melhor vendedor no período</span>
            <h2>{dados.melhor?.name || 'Sem dados'}</h2>
            <small>{dados.melhor ? `${fmtK(dados.melhor.fat)} · ${fmtInt(dados.melhor.pedidos)} pedidos · ${fmtInt(dados.melhor.visitas)} visitas` : 'Aguardando dados comerciais'}</small>
          </div>

          <div className="vendedores-hero-grid">
            <div>
              <span>Faturamento do time</span>
              <strong>{fmtK(dados.totalFat)}</strong>
            </div>

            <div>
              <span>Conversão média</span>
              <strong>{dados.conversao}%</strong>
            </div>

            <div>
              <span>Visitas totais</span>
              <strong>{fmtInt(dados.totalVisitas)}</strong>
            </div>
          </div>
        </section>

        <section className="vendedores-kpi-grid">
          <KpiCard
            icon={IconWallet}
            label="Faturamento"
            value={fmtK(dados.totalFat)}
            atual={dados.totalFat}
            anterior={dados.totalFatAnt}
          />

          <KpiCard
            icon={IconReceipt}
            label="Pedidos"
            value={fmtInt(sales.length)}
            sub={`${fmtK(sales.length ? dados.totalFat / sales.length : 0)} ticket médio`}
          />

          <KpiCard
            icon={IconTargetArrow}
            label="Cotações"
            value={fmtInt(dados.totalCotacoes)}
            atual={dados.totalCotacoes}
            anterior={dados.totalCotacoesAnt}
          />

          <KpiCard
            icon={IconChartBar}
            label="Conversão"
            value={`${dados.conversao}%`}
            atual={dados.conversao}
            anterior={dados.conversaoAnt}
          />

          <KpiCard
            icon={IconMapPin}
            label="Visitas"
            value={fmtInt(dados.totalVisitas)}
            atual={dados.totalVisitas}
            anterior={dados.totalVisitasAnt}
          />

          <KpiCard
            icon={IconBuildingStore}
            label="Carteira"
            value={fmtInt(dados.totalCarteira)}
            sub="clientes/fazendas no filtro"
          />
        </section>

        {loading ? (
          <Empty>Carregando performance...</Empty>
        ) : (
          <>
            {dados.risco.length > 0 && (
              <section className="vendedores-alerts">
                <div className="vendedores-alert warning">
                  <IconAlertTriangle size={17} />
                  <span>
                    <strong>{dados.risco.length}</strong> vendedor{dados.risco.length > 1 ? 'es' : ''} com clientes em risco de abandono ou sem acompanhamento.
                  </span>
                </div>
              </section>
            )}

            <section className="vendedores-main-grid">
              <div className="vendedores-card vendedores-chart-card">
                <div className="vendedores-card-head">
                  <div>
                    <span className="vendedores-eyebrow">Resultado</span>
                    <h3>Faturamento por vendedor</h3>
                  </div>
                </div>

                {dados.barData.length > 0 ? (
                  <ResponsiveContainer width="100%" height={300}>
                    <BarChart data={dados.barData} margin={{ top: 8, right: 12, left: -18, bottom: 0 }}>
                      <CartesianGrid strokeDasharray="4 6" />
                      <XAxis dataKey="name" tickLine={false} axisLine={false} />
                      <YAxis tickLine={false} axisLine={false} tickFormatter={v => `R$ ${(v / 1000).toFixed(0)}k`} />
                      <Tooltip formatter={(v, n) => [`R$ ${fmt(v)}`, n]} />
                      <Bar dataKey="Faturamento" fill="var(--orange)" radius={[8, 8, 0, 0]} />
                      <Bar dataKey="Meta" fill="var(--surface-3)" radius={[8, 8, 0, 0]} />
                    </BarChart>
                  </ResponsiveContainer>
                ) : (
                  <Empty>Sem faturamento no período</Empty>
                )}
              </div>

              <div className="vendedores-card">
                <div className="vendedores-card-head">
                  <div>
                    <span className="vendedores-eyebrow">Evolução</span>
                    <h3>Faturamento do time</h3>
                  </div>
                </div>

                {dados.evolucao.length > 0 ? (
                  <ResponsiveContainer width="100%" height={300}>
                    <AreaChart data={dados.evolucao} margin={{ top: 8, right: 12, left: -18, bottom: 0 }}>
                      <defs>
                        <linearGradient id="vendedoresFat" x1="0" y1="0" x2="0" y2="1">
                          <stop offset="5%" stopColor="var(--orange)" stopOpacity={0.23} />
                          <stop offset="95%" stopColor="var(--orange)" stopOpacity={0.02} />
                        </linearGradient>
                      </defs>

                      <CartesianGrid strokeDasharray="4 6" />
                      <XAxis dataKey="label" tickLine={false} axisLine={false} />
                      <YAxis tickLine={false} axisLine={false} tickFormatter={v => `R$ ${(v / 1000).toFixed(0)}k`} />
                      <Tooltip formatter={(v, n) => [n === 'Faturamento' ? `R$ ${fmt(v)}` : fmtInt(v), n]} />
                      <Area
                        type="monotone"
                        dataKey="Faturamento"
                        stroke="var(--orange)"
                        strokeWidth={2.5}
                        fill="url(#vendedoresFat)"
                        dot={{ r: 3 }}
                        activeDot={{ r: 5 }}
                      />
                    </AreaChart>
                  </ResponsiveContainer>
                ) : (
                  <Empty>Sem evolução no período</Empty>
                )}
              </div>
            </section>

            <section className="vendedores-grid-4">
              <div className="vendedores-card">
                <div className="vendedores-card-head">
                  <div>
                    <span className="vendedores-eyebrow">Ranking</span>
                    <h3>Maior faturamento</h3>
                  </div>
                </div>

                {dados.topFaturamento.length > 0 ? (
                  <div className="vendedores-ranking">
                    {dados.topFaturamento.map((s, i) => (
                      <RankingRow
                        key={s.id}
                        index={i}
                        title={s.name}
                        subtitle={`${fmtInt(s.pedidos)} pedidos · ${fmtK(s.ticket)} ticket`}
                        value={s.fat}
                        max={topFatMax}
                        extra={`${fmtInt(s.fazendas)} clientes`}
                        money
                      />
                    ))}
                  </div>
                ) : (
                  <Empty>Sem vendas</Empty>
                )}
              </div>

              <div className="vendedores-card">
                <div className="vendedores-card-head">
                  <div>
                    <span className="vendedores-eyebrow">Conversão</span>
                    <h3>Melhor taxa comercial</h3>
                  </div>
                </div>

                {dados.topConversao.length > 0 ? (
                  <div className="vendedores-ranking">
                    {dados.topConversao.map((s, i) => (
                      <RankingRow
                        key={s.id}
                        index={i}
                        title={s.name}
                        subtitle={`${fmtInt(s.convertidas)} convertidas · ${fmtInt(s.cotacoes)} cotações`}
                        value={s.txConversao}
                        max={topConvMax}
                        extra={`${s.txConversao}%`}
                      />
                    ))}
                  </div>
                ) : (
                  <Empty>Sem cotações</Empty>
                )}
              </div>

              <div className="vendedores-card">
                <div className="vendedores-card-head">
                  <div>
                    <span className="vendedores-eyebrow">Campo</span>
                    <h3>Mais visitas</h3>
                  </div>
                </div>

                {dados.topVisitas.length > 0 ? (
                  <div className="vendedores-ranking">
                    {dados.topVisitas.map((s, i) => (
                      <RankingRow
                        key={s.id}
                        index={i}
                        title={s.name}
                        subtitle={`${fmtInt(s.fazVisitadas)} clientes visitados`}
                        value={s.visitas}
                        max={topVisitasMax}
                        extra={`${s.coberturaVisitas}% cobertura`}
                      />
                    ))}
                  </div>
                ) : (
                  <Empty>Sem visitas</Empty>
                )}
              </div>

              <div className="vendedores-card">
                <div className="vendedores-card-head">
                  <div>
                    <span className="vendedores-eyebrow">Atenção</span>
                    <h3>Carteira em risco</h3>
                  </div>
                </div>

                {dados.risco.length > 0 ? (
                  <div className="vendedores-ranking">
                    {dados.risco.map((s, i) => (
                      <RankingRow
                        key={s.id}
                        index={i}
                        title={s.name}
                        subtitle={`${fmtInt(s.fazendas)} clientes na carteira`}
                        value={s.clientesRisco}
                        max={riscoMax}
                        extra="clientes em risco"
                      />
                    ))}
                  </div>
                ) : (
                  <Empty>Sem risco relevante</Empty>
                )}
              </div>
            </section>

            <section className="vendedores-card">
              <div className="vendedores-card-head">
                <div>
                  <span className="vendedores-eyebrow">Equipe</span>
                  <h3>Visão geral do time</h3>
                </div>

                <small>{fmtInt(dados.vendedores.length)} vendedores</small>
              </div>

              <div className="table-wrap vendedores-table-wrap">
                <table>
                  <thead>
                    <tr>
                      <th>#</th>
                      <th>Vendedor</th>
                      <th>Fazendas</th>
                      <th style={{ textAlign: 'right' }}>Faturamento</th>
                      <th style={{ textAlign: 'right' }}>Pedidos</th>
                      <th style={{ textAlign: 'right' }}>Ticket</th>
                      <th style={{ textAlign: 'center' }}>Cotações</th>
                      <th style={{ textAlign: 'center' }}>Conversão</th>
                      <th style={{ textAlign: 'center' }}>Visitas</th>
                      <th style={{ textAlign: 'center' }}>Cob. visitas</th>
                      <th />
                    </tr>
                  </thead>

                  <tbody>
                    {dados.vendedores.length === 0 ? (
                      <tr>
                        <td colSpan={11} style={{ textAlign: 'center', color: 'var(--text-faint)' }}>
                          Nenhum vendedor com dados no período
                        </td>
                      </tr>
                    ) : (
                      dados.vendedores.map((s, i) => (
                        <>
                          <tr
                            key={s.id}
                            className={detalheId === s.id ? 'vendedores-row-active' : ''}
                            onClick={() => setDetalheId(detalheId === s.id ? null : s.id)}
                          >
                            <td>
                              <strong className="vendedores-position">{i + 1}</strong>
                            </td>
                            <td>
                              <div className="vendedores-person">
                                <div className="vendedores-avatar">
                                  <IconUser size={16} />
                                </div>

                                <div>
                                  <strong>{s.name}</strong>
                                  <small>{s.role}</small>
                                </div>
                              </div>
                            </td>
                            <td>{fmtInt(s.fazendas)}</td>
                            <td style={{ textAlign: 'right' }}>
                              <strong className="vendedores-money">{fmtK(s.fat)}</strong>
                            </td>
                            <td style={{ textAlign: 'right' }}>{fmtInt(s.pedidos)}</td>
                            <td style={{ textAlign: 'right' }}>{fmtK(s.ticket)}</td>
                            <td style={{ textAlign: 'center' }}>{fmtInt(s.cotacoes)}</td>
                            <td style={{ textAlign: 'center' }}>
                              <span className={`vendedores-pill ${s.txConversao >= 50 ? 'positive' : s.txConversao >= 25 ? 'warning' : 'negative'}`}>
                                {s.txConversao}%
                              </span>
                            </td>
                            <td style={{ textAlign: 'center' }}>{fmtInt(s.visitas)}</td>
                            <td style={{ textAlign: 'center' }}>{s.coberturaVisitas}%</td>
                            <td>
                              {detalheId === s.id ? <IconChevronUp size={15} /> : <IconChevronDown size={15} />}
                            </td>
                          </tr>

                          {detalheId === s.id && (
                            <tr key={`${s.id}_detalhe`}>
                              <td colSpan={11} className="vendedores-detail-cell">
                                <div className="vendedores-detail-grid">
                                  <div className="vendedores-detail-box">
                                    <span>Faturamento</span>
                                    <strong>{fmtK(s.fat)}</strong>
                                    <VarBadge atual={s.fat} anterior={s.fatAnt} />
                                  </div>

                                  <div className="vendedores-detail-box">
                                    <span>Visitas</span>
                                    <strong>{fmtInt(s.visitas)}</strong>
                                    <VarBadge atual={s.visitas} anterior={s.visitasAnt} />
                                  </div>

                                  <div className="vendedores-detail-box">
                                    <span>Cotações</span>
                                    <strong>{fmtInt(s.cotacoes)}</strong>
                                    <VarBadge atual={s.cotacoes} anterior={s.cotacoesAnt} />
                                  </div>

                                  <div className="vendedores-detail-box">
                                    <span>Conversão</span>
                                    <strong>{s.txConversao}%</strong>
                                    <VarBadge atual={s.txConversao} anterior={s.txConversaoAnt} />
                                  </div>

                                  <div className="vendedores-detail-box">
                                    <span>Cobertura visitas</span>
                                    <strong>{s.coberturaVisitas}%</strong>
                                    <small>{fmtInt(s.fazVisitadas)} de {fmtInt(s.fazendas)} clientes</small>
                                  </div>

                                  <div className="vendedores-detail-box">
                                    <span>Cobertura vendas</span>
                                    <strong>{s.coberturaVendas}%</strong>
                                    <small>{fmtInt(s.fazComVenda)} clientes com venda</small>
                                  </div>
                                </div>
                                <div className="vendedores-detail-chart">
                                  <div className="vendedores-card-head">
                                    <div>
                                      <span className="vendedores-eyebrow">Últimos 6 meses</span>
                                      <h3>Evolução de faturamento de {s.name}</h3>
                                    </div>
                                    <small>notas líquidas por mês</small>
                                  </div>
                                  <ResponsiveContainer width="100%" height={230}>
                                    <AreaChart data={s.evolucao} margin={{ top: 12, right: 12, left: 0, bottom: 0 }}>
                                      <defs>
                                        <linearGradient id={`sellerEvolution-${String(s.id).replace(/[^a-zA-Z0-9]/g, '')}`} x1="0" y1="0" x2="0" y2="1">
                                          <stop offset="5%" stopColor="var(--orange)" stopOpacity={0.28} />
                                          <stop offset="95%" stopColor="var(--orange)" stopOpacity={0.02} />
                                        </linearGradient>
                                      </defs>
                                      <CartesianGrid strokeDasharray="4 6" vertical={false} />
                                      <XAxis dataKey="mes" tickLine={false} axisLine={false} />
                                      <YAxis tickLine={false} axisLine={false} tickFormatter={value => `${Math.round(value / 1000)}k`} />
                                      <Tooltip formatter={value => [fmtK(value), 'Vendas']} />
                                      <Area type="monotone" dataKey="Faturamento" stroke="var(--orange)" strokeWidth={2.5} fill={`url(#sellerEvolution-${String(s.id).replace(/[^a-zA-Z0-9]/g, '')})`} />
                                    </AreaChart>
                                  </ResponsiveContainer>
                                </div>
                              </td>
                            </tr>
                          )}
                        </>
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
