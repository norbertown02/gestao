import { useEffect, useMemo, useState } from 'react'
import { supabaseAdmin } from '../lib/supabase'
import Topbar from '../components/Topbar'
import {
  IconCalendar,
  IconCheck,
  IconClipboardText,
  IconDownload,
  IconFileText,
  IconLoader2,
  IconTrendingDown,
  IconTrendingUp,
} from '@tabler/icons-react'
import jsPDF from 'jspdf'
import autoTable from 'jspdf-autotable'
import logoNutrialle from '../assets/logo-nutrialle.png'

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

function getMes(offset = 0) {
  const d = new Date()
  d.setMonth(d.getMonth() + offset)

  return {
    ano: d.getFullYear(),
    mes: d.getMonth() + 1,
    label: d.toLocaleDateString('pt-BR', {
      month: 'long',
      year: 'numeric',
    }),
  }
}

function mesRange(ano, mes) {
  const ini = new Date(ano, mes - 1, 1)
  const fim = new Date(ano, mes, 0)
  return [toISO(ini), toISO(fim)]
}

function trimestreRange(ano, trim) {
  const mesIni = (trim - 1) * 3 + 1
  const ini = new Date(ano, mesIni - 1, 1)
  const fim = new Date(ano, mesIni + 2, 0)
  return [toISO(ini), toISO(fim)]
}

function anoRange(ano) {
  return [`${ano}-01-01`, `${ano}-12-31`]
}

function getPeriodoRange(tipo, ano, mes, trim) {
  if (tipo === 'mensal') return mesRange(ano, mes)
  if (tipo === 'trimestral') return trimestreRange(ano, trim)
  return anoRange(ano)
}

function getAnteriorRange(tipo, ano, mes, trim) {
  if (tipo === 'mensal') {
    const d = new Date(ano, mes - 2, 1)
    return [toISO(d), toISO(new Date(ano, mes - 1, 0))]
  }

  if (tipo === 'trimestral') {
    const trimAnt = trim === 1 ? 4 : trim - 1
    const anoAnt = trim === 1 ? ano - 1 : ano
    return trimestreRange(anoAnt, trimAnt)
  }

  return anoRange(ano - 1)
}

function getPeriodoLabel(tipo, ano, mes, trim) {
  if (tipo === 'mensal') {
    const label = new Date(ano, mes - 1, 1).toLocaleDateString('pt-BR', {
      month: 'long',
      year: 'numeric',
    })
    return label.charAt(0).toUpperCase() + label.slice(1)
  }

  if (tipo === 'trimestral') return `${trim}º Trimestre de ${ano}`

  return `Ano de ${ano}`
}

function getAnteriorLabel(tipo, ano, mes, trim) {
  if (tipo === 'mensal') {
    const d = new Date(ano, mes - 2, 1)
    const label = d.toLocaleDateString('pt-BR', {
      month: 'long',
      year: 'numeric',
    })
    return label.charAt(0).toUpperCase() + label.slice(1)
  }

  if (tipo === 'trimestral') {
    const trimAnt = trim === 1 ? 4 : trim - 1
    const anoAnt = trim === 1 ? ano - 1 : ano
    return `${trimAnt}º Trimestre de ${anoAnt}`
  }

  return `Ano de ${ano - 1}`
}

function labelSegmento(seg) {
  const s = String(seg || '').toLowerCase()
  if (s === 'leite') return 'Leite'
  if (s === 'corte') return 'Corte'
  if (s === 'suinos' || s === 'suínos') return 'Suínos'
  return s ? s.charAt(0).toUpperCase() + s.slice(1) : '—'
}

function parseItems(items) {
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

function drawLineChart(doc, data, x, y, w, h, series) {
  const values = data.flatMap(row => series.map(s => Number(row[s.key] || 0)))
  const max = Math.max(...values, 1)
  const min = 0
  const padX = 8
  const padY = 10
  const gx = x + padX
  const gy = y + padY
  const gw = w - padX * 2
  const gh = h - padY * 2

  doc.setDrawColor(228, 222, 214)
  doc.setFillColor(250, 248, 245)
  doc.roundedRect(x, y, w, h, 4, 4, 'FD')

  doc.setDrawColor(235, 231, 226)
  doc.setLineWidth(0.2)
  for (let i = 0; i <= 4; i++) {
    const yy = gy + (gh / 4) * i
    doc.line(gx, yy, gx + gw, yy)
  }

  series.forEach(s => {
    const points = data.map((row, idx) => {
      const px = gx + (idx / Math.max(1, data.length - 1)) * gw
      const val = Number(row[s.key] || 0)
      const py = gy + gh - ((val - min) / Math.max(1, max - min)) * gh
      return [px, py, val]
    })

    doc.setDrawColor(...s.color)
    doc.setLineWidth(1.25)

    for (let i = 0; i < points.length - 1; i++) {
      doc.line(points[i][0], points[i][1], points[i + 1][0], points[i + 1][1])
    }

    points.forEach(([px, py]) => {
      doc.setFillColor(...s.color)
      doc.circle(px, py, 1.25, 'F')
    })
  })

  doc.setFont('helvetica', 'normal')
  doc.setFontSize(7)
  doc.setTextColor(115, 106, 96)
  data.forEach((row, idx) => {
    const px = gx + (idx / Math.max(1, data.length - 1)) * gw
    doc.text(row.label, px, y + h - 3, { align: 'center' })
  })

  let lx = x + 4
  series.forEach(s => {
    doc.setFillColor(...s.color)
    doc.circle(lx, y + 5, 1.4, 'F')
    doc.setTextColor(70, 62, 54)
    doc.setFontSize(7)
    doc.text(s.label, lx + 3, y + 6)
    lx += doc.getTextWidth(s.label) + 12
  })
}

function drawBarComparison(doc, rows, x, y, w, h) {
  const max = Math.max(...rows.map(r => Math.max(Number(r.atual || 0), Number(r.anterior || 0))), 1)

  doc.setDrawColor(228, 222, 214)
  doc.setFillColor(250, 248, 245)
  doc.roundedRect(x, y, w, h, 4, 4, 'FD')

  const left = x + 42
  const top = y + 12
  const rowH = 12
  const barW = w - 64

  rows.forEach((r, idx) => {
    const yy = top + idx * rowH

    doc.setFont('helvetica', 'normal')
    doc.setFontSize(7.5)
    doc.setTextColor(70, 62, 54)
    doc.text(r.label, x + 4, yy + 4)

    doc.setFillColor(226, 221, 216)
    doc.roundedRect(left, yy, barW, 3.2, 1.6, 1.6, 'F')
    doc.setFillColor(232, 119, 34)
    doc.roundedRect(left, yy, (Number(r.atual || 0) / max) * barW, 3.2, 1.6, 1.6, 'F')

    doc.setFillColor(30, 30, 30)
    doc.roundedRect(left, yy + 4.7, (Number(r.anterior || 0) / max) * barW, 3.2, 1.6, 1.6, 'F')

    doc.setFont('helvetica', 'bold')
    doc.setTextColor(232, 119, 34)
    doc.text(r.atualLabel, left + barW + 3, yy + 3)
  })

  doc.setFillColor(232, 119, 34)
  doc.circle(x + 5, y + h - 6, 1.3, 'F')
  doc.setFont('helvetica', 'normal')
  doc.setFontSize(7)
  doc.setTextColor(100, 92, 84)
  doc.text('Atual', x + 8, y + h - 4)

  doc.setFillColor(30, 30, 30)
  doc.circle(x + 25, y + h - 6, 1.3, 'F')
  doc.text('Anterior', x + 28, y + h - 4)
}

function MetricCard({ label, value, sub, variance }) {
  const up = Number(variance || 0) >= 0

  return (
    <div className="relpdf-metric">
      <span>{label}</span>
      <strong>{value}</strong>
      <small className={up ? 'up' : 'down'}>
        {variance !== undefined ? `${up ? '+' : ''}${variance.toFixed(1)}% vs anterior` : sub}
      </small>
    </div>
  )
}

export default function RelatorioMensal() {
  const [mesSel, setMesSel] = useState(getMes(0))
  const [tipoPeriodo, setTipoPeriodo] = useState('mensal')
  const [anoSel, setAnoSel] = useState(new Date().getFullYear())
  const [trimSel, setTrimSel] = useState(Math.ceil((new Date().getMonth() + 1) / 3))
  const [dados, setDados] = useState(null)
  const [loading, setLoading] = useState(false)
  const [gerandoPDF, setGerandoPDF] = useState(false)

  const mesesOpcoes = Array.from({ length: 13 }, (_, i) => getMes(-i))
  const anosOpcoes = Array.from({ length: 5 }, (_, i) => new Date().getFullYear() - i)

  useEffect(() => {
    carregar()
  }, [mesSel, tipoPeriodo, anoSel, trimSel])

  async function carregar() {
    setLoading(true)

    try {
      const [ini, fim] = getPeriodoRange(tipoPeriodo, anoSel, mesSel.mes, trimSel)
      const [iniAnt, fimAnt] = getAnteriorRange(tipoPeriodo, anoSel, mesSel.mes, trimSel)
      const periodoAtual = getPeriodoLabel(tipoPeriodo, anoSel, mesSel.mes, trimSel)
      const periodoAnterior = getAnteriorLabel(tipoPeriodo, anoSel, mesSel.mes, trimSel)

      const d6m = new Date()
      d6m.setMonth(d6m.getMonth() - 5)
      d6m.setDate(1)
      const ini6m = toISO(d6m)

      const [
        salesAtualRes,
        salesAntRes,
        visitsAtualRes,
        visitsAntRes,
        farmsRes,
        checklistsRes,
        sellersRes,
        appointmentsRes,
        quotesRes,
        salesEvolRes,
        quotesEvolRes,
        allSalesRes,
        allVisitsRes,
      ] = await Promise.all([
        supabaseAdmin.from('sales').select('*').gte('sale_date', ini).lte('sale_date', fim),
        supabaseAdmin.from('sales').select('*').gte('sale_date', iniAnt).lte('sale_date', fimAnt),
        supabaseAdmin.from('visits').select('*').gte('visit_date', ini).lte('visit_date', fim),
        supabaseAdmin.from('visits').select('*').gte('visit_date', iniAnt).lte('visit_date', fimAnt),
        supabaseAdmin.from('farms').select('*').eq('status', 'ativo'),
        supabaseAdmin.from('checklists').select('*').gte('applied_at', ini).lte('applied_at', fim),
        supabaseAdmin.from('profiles').select('*').eq('active', true),
        supabaseAdmin.from('appointments').select('*').gte('appointment_date', toISO(new Date())).lte('appointment_date', toISO(new Date(new Date().setDate(new Date().getDate() + 30)))),
        supabaseAdmin.from('quotes').select('*'),
        supabaseAdmin.from('sales').select('sale_date,total').gte('sale_date', ini6m),
        supabaseAdmin.from('quotes').select('created_at,total').gte('created_at', `${ini6m}T00:00:00`),
        supabaseAdmin.from('sales').select('farm_id,sale_date'),
        supabaseAdmin.from('visits').select('farm_id,visit_date').order('visit_date', { ascending: false }),
      ])

      const salesAtual = salesAtualRes.data || []
      const salesAnt = salesAntRes.data || []
      const visitsAtual = visitsAtualRes.data || []
      const visitsAnt = visitsAntRes.data || []
      const farms = farmsRes.data || []
      const checklists = checklistsRes.data || []
      const sellers = sellersRes.data || []
      const appointments = appointmentsRes.data || []
      const quotes = quotesRes.data || []
      const salesEvol = salesEvolRes.data || []
      const quotesEvol = quotesEvolRes.data || []
      const allSales = allSalesRes.data || []
      const allVisits = allVisitsRes.data || []

      const sellerById = new Map(sellers.map(s => [s.id, s]))
      const farmById = new Map(farms.map(f => [f.id, f]))

      const fatAtual = salesAtual.reduce((a, s) => a + Number(s.total || 0), 0)
      const fatAnt = salesAnt.reduce((a, s) => a + Number(s.total || 0), 0)
      const pedidosAtual = salesAtual.length
      const pedidosAnt = salesAnt.length
      const ticketAtual = pedidosAtual ? fatAtual / pedidosAtual : 0
      const ticketAnt = pedidosAnt ? fatAnt / pedidosAnt : 0
      const visitasAtual = visitsAtual.length
      const visitasAnt = visitsAnt.length
      const scoreMedia = checklists.length
        ? Math.round(checklists.reduce((a, c) => a + Number(c.overall_score || 0), 0) / checklists.length)
        : 0

      const quotesAbertas = quotes.filter(q => ['rascunho', 'enviada'].includes(String(q.status || '').toLowerCase()))
      const quotesConvertidas = quotes.filter(q => String(q.status || '').toLowerCase() === 'convertida')
      const valorQuotesAbertas = quotesAbertas.reduce((a, q) => a + Number(q.total || 0), 0)

      const d90 = new Date()
      d90.setDate(d90.getDate() - 90)
      const carteiraAtiva = new Set(allSales.filter(s => new Date(s.sale_date) >= d90).map(s => s.farm_id)).size

      const ultimaVisita = {}
      allVisits.forEach(v => {
        if (!ultimaVisita[v.farm_id]) ultimaVisita[v.farm_id] = v.visit_date
      })

      const hoje = new Date()
      const esquecidas = farms.filter(f => {
        const uv = ultimaVisita[f.id]
        return !uv || (hoje - new Date(`${uv}T12:00:00`)) / 86400000 > 45
      })

      const vendedorMap = {}
      salesAtual.forEach(s => {
        const key = s.seller_id || 'geral'
        if (!vendedorMap[key]) vendedorMap[key] = { id: key, nome: 'Vendedor', total: 0, pedidos: 0 }
        vendedorMap[key].total += Number(s.total || 0)
        vendedorMap[key].pedidos += 1
      })

      const topVendedores = Object.values(vendedorMap)
        .map(v => {
          const profile = sellerById.get(v.id)
          return {
            ...v,
            nome: profile?.name || profile?.full_name || profile?.display_name || profile?.email || 'Vendedor',
            ticket: v.pedidos ? v.total / v.pedidos : 0,
          }
        })
        .sort((a, b) => b.total - a.total)
        .slice(0, 6)

      const fazendaMap = {}
      salesAtual.forEach(s => {
        if (!fazendaMap[s.farm_id]) fazendaMap[s.farm_id] = { id: s.farm_id, total: 0, pedidos: 0 }
        fazendaMap[s.farm_id].total += Number(s.total || 0)
        fazendaMap[s.farm_id].pedidos += 1
      })

      const topFazendas = Object.values(fazendaMap)
        .map(f => {
          const farm = farmById.get(f.id)
          return {
            ...f,
            name: farm?.name || '—',
            segment: farm?.segment || '—',
          }
        })
        .sort((a, b) => b.total - a.total)
        .slice(0, 6)

      const produtoMap = {}
      salesAtual.forEach(s => {
        parseItems(s.items).forEach(item => {
          const name = item?.productName || item?.product_name || item?.name || item?.product || 'Produto'
          const total = Number(item?.subtotal || item?.total || item?.value || 0)
          if (!produtoMap[name]) produtoMap[name] = { name, total: 0 }
          produtoMap[name].total += total
        })
      })

      const topProdutos = Object.values(produtoMap)
        .sort((a, b) => b.total - a.total)
        .slice(0, 8)

      const segMap = {}
      salesAtual.forEach(s => {
        const seg = farmById.get(s.farm_id)?.segment || 'outros'
        if (!segMap[seg]) segMap[seg] = { name: labelSegmento(seg), total: 0 }
        segMap[seg].total += Number(s.total || 0)
      })
      const porSegmento = Object.values(segMap).sort((a, b) => b.total - a.total)

      const evolMap = {}
      for (let i = 5; i >= 0; i--) {
        const d = new Date()
        d.setMonth(d.getMonth() - i)
        d.setDate(1)
        const k = d.toISOString().slice(0, 7)
        evolMap[k] = {
          mes: k,
          label: d.toLocaleDateString('pt-BR', { month: 'short', year: '2-digit' }),
          vendas: 0,
          cotacoes: 0,
        }
      }

      salesEvol.forEach(s => {
        const k = s.sale_date?.slice(0, 7)
        if (evolMap[k]) evolMap[k].vendas += Number(s.total || 0)
      })

      quotesEvol.forEach(q => {
        const k = q.created_at?.slice(0, 7)
        if (evolMap[k]) evolMap[k].cotacoes += Number(q.total || 0)
      })

      const evolucao = Object.values(evolMap)

      const fAtual = {}
      const fAnt = {}
      salesAtual.forEach(s => { fAtual[s.farm_id] = (fAtual[s.farm_id] || 0) + Number(s.total || 0) })
      salesAnt.forEach(s => { fAnt[s.farm_id] = (fAnt[s.farm_id] || 0) + Number(s.total || 0) })

      const fazendasEmQueda = farms
        .filter(f => {
          const atual = fAtual[f.id] || 0
          const ant = fAnt[f.id] || 0
          return ant > 0 && atual < ant && ((ant - atual) / ant) * 100 > 40
        })
        .map(f => ({
          ...f,
          atual: fAtual[f.id] || 0,
          anterior: fAnt[f.id] || 0,
          queda: ((fAnt[f.id] - (fAtual[f.id] || 0)) / fAnt[f.id]) * 100,
        }))
        .sort((a, b) => b.queda - a.queda)
        .slice(0, 10)

      const comparativo = [
        {
          label: 'Faturamento',
          atual: fatAtual,
          anterior: fatAnt,
          atualLabel: fmtK(fatAtual),
          anteriorLabel: fmtK(fatAnt),
          variacao: pct(fatAtual, fatAnt),
        },
        {
          label: 'Pedidos',
          atual: pedidosAtual,
          anterior: pedidosAnt,
          atualLabel: fmtInt(pedidosAtual),
          anteriorLabel: fmtInt(pedidosAnt),
          variacao: pct(pedidosAtual, pedidosAnt),
        },
        {
          label: 'Ticket médio',
          atual: ticketAtual,
          anterior: ticketAnt,
          atualLabel: fmtK(ticketAtual),
          anteriorLabel: fmtK(ticketAnt),
          variacao: pct(ticketAtual, ticketAnt),
        },
        {
          label: 'Visitas',
          atual: visitasAtual,
          anterior: visitasAnt,
          atualLabel: fmtInt(visitasAtual),
          anteriorLabel: fmtInt(visitasAnt),
          variacao: pct(visitasAtual, visitasAnt),
        },
      ]

      const destaque = topVendedores[0]
        ? `${topVendedores[0].nome} liderou o período com ${fmtK(topVendedores[0].total)} em vendas.`
        : 'Sem vendas por vendedor no período selecionado.'

      const atencao = fazendasEmQueda[0]
        ? `${fazendasEmQueda[0].name} caiu ${fazendasEmQueda[0].queda.toFixed(1)}% em faturamento versus o período anterior.`
        : `${esquecidas.length} fazendas estão sem visita há mais de 45 dias.`

      setDados({
        periodoAtual,
        periodoAnterior,
        ini,
        fim,
        iniAnt,
        fimAnt,
        fatAtual,
        fatAnt,
        pedidosAtual,
        pedidosAnt,
        ticketAtual,
        ticketAnt,
        visitasAtual,
        visitasAnt,
        scoreMedia,
        checklists: checklists.length,
        carteiraAtiva,
        carteiraTotal: farms.length,
        cotacoesAbertas: quotesAbertas.length,
        valorCotacoesAbertas: valorQuotesAbertas,
        cotacoesConvertidas: quotesConvertidas.length,
        conversaoCotacoes: quotes.length ? (quotesConvertidas.length / quotes.length) * 100 : 0,
        esquecidas,
        appointments,
        topVendedores,
        topFazendas,
        topProdutos,
        porSegmento,
        evolucao,
        fazendasEmQueda,
        comparativo,
        destaque,
        atencao,
      })
    } catch (err) {
      console.error('Erro ao carregar relatório:', err)
      setDados(null)
    } finally {
      setLoading(false)
    }
  }

  function gerarPDF() {
    if (!dados) return
    setGerandoPDF(true)

    try {
      const doc = new jsPDF('p', 'mm', 'a4')
      const W = 210
      const H = 297
      const M = 16
      let y = M

      const ORANGE = [232, 119, 34]
      const BLACK = [18, 18, 18]
      const TEXT = [48, 43, 38]
      const GRAY = [120, 110, 100]
      const LIGHT = [246, 243, 239]
      const LINE = [226, 220, 212]
      const GREEN = [42, 145, 75]
      const RED = [199, 54, 54]

      const pages = []

      function addFooter() {
        const count = doc.getNumberOfPages()
        for (let i = 1; i <= count; i++) {
          doc.setPage(i)
          doc.setDrawColor(...LINE)
          doc.line(M, H - 14, W - M, H - 14)
          doc.setFont('helvetica', 'normal')
          doc.setFontSize(7.5)
          doc.setTextColor(...GRAY)
          doc.text('Nutrialle · Relatório executivo confidencial', M, H - 8)
          doc.text(`Página ${i} de ${count}`, W - M, H - 8, { align: 'right' })
        }
      }

      function newPage() {
        doc.addPage()
        y = M + 4
      }

      function ensure(space) {
        if (y + space > H - 22) newPage()
      }

      function section(title, subtitle = '') {
        ensure(18)
        doc.setFont('helvetica', 'bold')
        doc.setFontSize(13)
        doc.setTextColor(...BLACK)
        doc.text(title, M, y)
        y += 5
        if (subtitle) {
          doc.setFont('helvetica', 'normal')
          doc.setFontSize(8.5)
          doc.setTextColor(...GRAY)
          doc.text(subtitle, M, y)
          y += 5
        }
        doc.setDrawColor(...LINE)
        doc.line(M, y, W - M, y)
        y += 7
      }

      function metricCard(x, yy, w, h, label, value, variation, suffix = 'vs período anterior') {
        const good = Number(variation || 0) >= 0
        doc.setFillColor(...LIGHT)
        doc.roundedRect(x, yy, w, h, 4, 4, 'F')
        doc.setDrawColor(...LINE)
        doc.roundedRect(x, yy, w, h, 4, 4)

        doc.setFont('helvetica', 'normal')
        doc.setFontSize(7.5)
        doc.setTextColor(...GRAY)
        doc.text(label, x + 4, yy + 6)

        doc.setFont('helvetica', 'bold')
        doc.setFontSize(13)
        doc.setTextColor(...BLACK)
        doc.text(String(value), x + 4, yy + 14)

        if (variation !== undefined) {
          doc.setFontSize(7.5)
          doc.setTextColor(...(good ? GREEN : RED))
          doc.text(`${good ? '+' : ''}${variation.toFixed(1)}% ${suffix}`, x + 4, yy + 20)
        }
      }

      function table(title, head, body, color = ORANGE) {
        ensure(28)
        doc.setFont('helvetica', 'bold')
        doc.setFontSize(10.5)
        doc.setTextColor(...BLACK)
        doc.text(title, M, y)
        y += 4

        autoTable(doc, {
          startY: y,
          theme: 'grid',
          margin: { left: M, right: M },
          head: [head],
          body: body.length ? body : [['Sem dados', '', '', ''].slice(0, head.length)],
          headStyles: {
            fillColor: color,
            textColor: [255, 255, 255],
            fontStyle: 'bold',
            lineColor: LINE,
            lineWidth: 0.1,
            fontSize: 8.2,
          },
          bodyStyles: {
            textColor: TEXT,
            fontSize: 8,
            lineColor: LINE,
            lineWidth: 0.1,
          },
          alternateRowStyles: {
            fillColor: [250, 248, 245],
          },
          styles: {
            cellPadding: 2.4,
            overflow: 'linebreak',
          },
        })

        y = doc.lastAutoTable.finalY + 8
      }

      doc.setFillColor(...BLACK)
      doc.rect(0, 0, W, H, 'F')

      doc.setFillColor(...ORANGE)
      doc.rect(0, 0, 12, H, 'F')

      doc.setDrawColor(65, 65, 65)
      doc.setLineWidth(0.2)
      for (let i = 0; i < 12; i++) {
        doc.circle(W - 20 - i * 8, 42 + i * 12, 28 + i * 2)
      }

      try {
        doc.addImage(logoNutrialle, 'PNG', M + 4, 22, 48, 20)
      } catch (e) {}

      doc.setTextColor(255, 255, 255)
      doc.setFont('helvetica', 'bold')
      doc.setFontSize(24)
      doc.text('Relatório Executivo', M + 4, 72)
      doc.setFontSize(24)
      doc.setTextColor(...ORANGE)
      doc.text('Comercial', M + 4, 84)

      doc.setFont('helvetica', 'normal')
      doc.setFontSize(11)
      doc.setTextColor(220, 220, 220)
      doc.text(dados.periodoAtual, M + 4, 98)
      doc.text(`Comparativo: ${dados.periodoAnterior}`, M + 4, 105)

      doc.setFillColor(255, 255, 255)
      doc.roundedRect(M + 4, 132, W - M * 2 - 8, 58, 5, 5, 'F')
      doc.setTextColor(...GRAY)
      doc.setFontSize(8)
      doc.text('FATURAMENTO DO PERÍODO', M + 12, 145)
      doc.setFont('helvetica', 'bold')
      doc.setTextColor(...BLACK)
      doc.setFontSize(25)
      doc.text(fmtK(dados.fatAtual), M + 12, 160)
      doc.setFont('helvetica', 'normal')
      doc.setFontSize(9)
      doc.setTextColor(...(pct(dados.fatAtual, dados.fatAnt) >= 0 ? GREEN : RED))
      doc.text(`${pct(dados.fatAtual, dados.fatAnt) >= 0 ? '+' : ''}${pct(dados.fatAtual, dados.fatAnt).toFixed(1)}% vs período anterior`, M + 12, 171)

      doc.setFont('helvetica', 'normal')
      doc.setFontSize(8.5)
      doc.setTextColor(225, 225, 225)
      doc.text(`Gerado em ${new Date().toLocaleDateString('pt-BR')}`, M + 4, H - 24)
      doc.text('Nutrialle · Nutrição animal', M + 4, H - 18)

      newPage()

      section('Resumo executivo', 'Principais resultados, destaques e pontos de atenção do período selecionado.')

      doc.setFont('helvetica', 'normal')
      doc.setFontSize(9)
      doc.setTextColor(...TEXT)

      const bullets = [
        `Faturamento de ${fmtK(dados.fatAtual)}, com variação de ${pct(dados.fatAtual, dados.fatAnt).toFixed(1)}% frente ao período anterior.`,
        `${fmtInt(dados.pedidosAtual)} pedidos realizados, ticket médio de ${fmtK(dados.ticketAtual)} e ${fmtInt(dados.visitasAtual)} visitas registradas.`,
        `${fmtInt(dados.cotacoesAbertas)} cotações abertas somando ${fmtK(dados.valorCotacoesAbertas)} em oportunidades comerciais.`,
        `${fmtInt(dados.carteiraAtiva)} fazendas ativas nos últimos 90 dias, dentro de uma carteira total de ${fmtInt(dados.carteiraTotal)} fazendas.`,
        dados.destaque,
        dados.atencao,
      ]

      bullets.forEach(b => {
        const lines = doc.splitTextToSize(`• ${b}`, W - M * 2)
        doc.text(lines, M, y)
        y += lines.length * 4.6
      })

      y += 4
      const gap = 4
      const cw = (W - M * 2 - gap * 3) / 4
      metricCard(M, y, cw, 24, 'Faturamento', fmtK(dados.fatAtual), pct(dados.fatAtual, dados.fatAnt))
      metricCard(M + (cw + gap), y, cw, 24, 'Pedidos', fmtInt(dados.pedidosAtual), pct(dados.pedidosAtual, dados.pedidosAnt))
      metricCard(M + (cw + gap) * 2, y, cw, 24, 'Ticket médio', fmtK(dados.ticketAtual), pct(dados.ticketAtual, dados.ticketAnt))
      metricCard(M + (cw + gap) * 3, y, cw, 24, 'Visitas', fmtInt(dados.visitasAtual), pct(dados.visitasAtual, dados.visitasAnt))
      y += 34

      section('Comparativo com período anterior', `${dados.periodoAtual} versus ${dados.periodoAnterior}.`)
      drawBarComparison(doc, dados.comparativo, M, y, W - M * 2, 58)
      y += 68

      table(
        'Tabela comparativa',
        ['Métrica', 'Atual', 'Anterior', 'Variação'],
        dados.comparativo.map(r => [
          r.label,
          r.atualLabel,
          r.anteriorLabel,
          `${r.variacao >= 0 ? '+' : ''}${r.variacao.toFixed(1)}%`,
        ])
      )

      section('Evolução dos últimos 6 meses', 'Tendência de vendas realizadas e valor cotado.')
      drawLineChart(
        doc,
        dados.evolucao,
        M,
        y,
        W - M * 2,
        64,
        [
          { key: 'vendas', label: 'Vendas realizadas', color: ORANGE },
          { key: 'cotacoes', label: 'Valor cotado', color: BLACK },
        ]
      )
      y += 76

      newPage()

      section('Rankings comerciais', 'Principais vendedores, fazendas e produtos do período.')

      table(
        'Top vendedores',
        ['Vendedor', 'Faturamento', 'Pedidos', 'Ticket médio'],
        dados.topVendedores.map(v => [
          v.nome,
          fmtK(v.total),
          fmtInt(v.pedidos),
          fmtK(v.ticket),
        ]),
        ORANGE
      )

      table(
        'Top fazendas',
        ['Fazenda', 'Segmento', 'Faturamento', 'Pedidos'],
        dados.topFazendas.map(f => [
          f.name,
          labelSegmento(f.segment),
          fmtK(f.total),
          fmtInt(f.pedidos),
        ]),
        BLACK
      )

      table(
        'Top produtos',
        ['Produto', 'Faturamento'],
        dados.topProdutos.map(p => [
          p.name,
          fmtK(p.total),
        ]),
        ORANGE
      )

      table(
        'Receita por segmento',
        ['Segmento', 'Faturamento'],
        dados.porSegmento.map(s => [
          s.name,
          fmtK(s.total),
        ]),
        BLACK
      )

      newPage()

      section('Pontos de atenção e prioridades', 'Clientes, carteira e oportunidades que exigem acompanhamento.')

      table(
        'Fazendas em queda',
        ['Fazenda', 'Segmento', 'Atual', 'Anterior', 'Queda'],
        dados.fazendasEmQueda.map(f => [
          f.name,
          labelSegmento(f.segment),
          fmtK(f.atual),
          fmtK(f.anterior),
          `-${f.queda.toFixed(1)}%`,
        ]),
        RED
      )

      table(
        'Fazendas sem visita recente',
        ['Fazenda', 'Segmento', 'Cidade'],
        dados.esquecidas.slice(0, 12).map(f => [
          f.name,
          labelSegmento(f.segment),
          f.city || f.cidade || '—',
        ]),
        RED
      )

      section('Recomendações executivas')
      doc.setFont('helvetica', 'normal')
      doc.setFontSize(9)
      doc.setTextColor(...TEXT)

      const recomendacoes = [
        'Converter cotações abertas de maior valor antes de ampliar novas prospecções.',
        'Priorizar visita técnica nas fazendas sem acompanhamento recente.',
        'Criar plano de recuperação para fazendas com queda relevante de faturamento.',
        'Replicar a estratégia dos vendedores e produtos líderes nas carteiras com baixa performance.',
        'Acompanhar semanalmente evolução de faturamento, visitas e conversão até o próximo fechamento.',
      ]

      recomendacoes.forEach(r => {
        const lines = doc.splitTextToSize(`• ${r}`, W - M * 2)
        doc.text(lines, M, y)
        y += lines.length * 4.8
      })

      addFooter()

      const nome = `Nutrialle_Relatorio_${dados.periodoAtual.replace(/\s+/g, '_')}.pdf`
      doc.save(nome)
    } catch (err) {
      console.error('Erro ao gerar PDF:', err)
    } finally {
      setGerandoPDF(false)
    }
  }

  const periodoAtualTexto = dados?.periodoAtual || getPeriodoLabel(tipoPeriodo, anoSel, mesSel.mes, trimSel)

  return (
    <div style={{ flex: 1, overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>
      <Topbar title="Exportar Relatório Executivo" subtitle="Selecione o período e gere um PDF comercial pronto para diretoria" />

      <div className="page relpdf-page" style={{ overflowY: 'auto' }}>
        <section className="relpdf-hero">
          <div>
            <span className="relpdf-eyebrow">Relatório executivo Nutrialle</span>
            <h2>Gerador de PDF</h2>
            <p>
              Esta tela é focada em escolher o período e exportar um relatório bonito, completo e institucional.
              A análise visual vai dentro do PDF.
            </p>
          </div>

          <div className="relpdf-hero-card">
            <IconFileText size={26} />
            <strong>{periodoAtualTexto}</strong>
            <span>Período selecionado</span>
          </div>
        </section>

        <section className="relpdf-generator">
          <div className="relpdf-panel">
            <div className="relpdf-panel-head">
              <div>
                <span className="relpdf-eyebrow">Configuração</span>
                <h3>Selecionar período do relatório</h3>
              </div>
              <IconCalendar size={20} />
            </div>

            <div className="relpdf-period-tabs">
              {[
                ['mensal', 'Mensal'],
                ['trimestral', 'Trimestral'],
                ['anual', 'Anual'],
              ].map(([value, label]) => (
                <button
                  key={value}
                  type="button"
                  className={tipoPeriodo === value ? 'active' : ''}
                  onClick={() => setTipoPeriodo(value)}
                >
                  {label}
                </button>
              ))}
            </div>

            <div className="relpdf-form-grid">
              {tipoPeriodo === 'mensal' && (
                <label>
                  <span>Mês de referência</span>
                  <select
                    value={`${mesSel.ano}-${mesSel.mes}`}
                    onChange={e => {
                      const [ano, mes] = e.target.value.split('-').map(Number)
                      setAnoSel(ano)
                      setMesSel({
                        ano,
                        mes,
                        label: new Date(ano, mes - 1, 1).toLocaleDateString('pt-BR', {
                          month: 'long',
                          year: 'numeric',
                        }),
                      })
                    }}
                  >
                    {mesesOpcoes.map(m => (
                      <option key={`${m.ano}-${m.mes}`} value={`${m.ano}-${m.mes}`}>
                        {m.label.charAt(0).toUpperCase() + m.label.slice(1)}
                      </option>
                    ))}
                  </select>
                </label>
              )}

              {tipoPeriodo === 'trimestral' && (
                <>
                  <label>
                    <span>Trimestre</span>
                    <select value={trimSel} onChange={e => setTrimSel(Number(e.target.value))}>
                      <option value={1}>1º Trimestre</option>
                      <option value={2}>2º Trimestre</option>
                      <option value={3}>3º Trimestre</option>
                      <option value={4}>4º Trimestre</option>
                    </select>
                  </label>

                  <label>
                    <span>Ano</span>
                    <select value={anoSel} onChange={e => setAnoSel(Number(e.target.value))}>
                      {anosOpcoes.map(ano => (
                        <option key={ano} value={ano}>{ano}</option>
                      ))}
                    </select>
                  </label>
                </>
              )}

              {tipoPeriodo === 'anual' && (
                <label>
                  <span>Ano</span>
                  <select value={anoSel} onChange={e => setAnoSel(Number(e.target.value))}>
                    {anosOpcoes.map(ano => (
                      <option key={ano} value={ano}>{ano}</option>
                    ))}
                  </select>
                </label>
              )}
            </div>

            <button className="relpdf-download" onClick={gerarPDF} disabled={loading || gerandoPDF || !dados}>
              {gerandoPDF ? <IconLoader2 size={17} className="relpdf-spin" /> : <IconDownload size={17} />}
              {gerandoPDF ? 'Gerando PDF...' : 'Exportar PDF executivo'}
            </button>
          </div>

          <div className="relpdf-panel relpdf-preview">
            <div className="relpdf-panel-head">
              <div>
                <span className="relpdf-eyebrow">Prévia dos dados</span>
                <h3>O que será exportado</h3>
              </div>
              {loading ? <IconLoader2 size={20} className="relpdf-spin" /> : <IconCheck size={20} />}
            </div>

            {loading ? (
              <div className="relpdf-loading">Carregando dados do período...</div>
            ) : dados ? (
              <>
                <div className="relpdf-metrics">
                  <MetricCard label="Faturamento" value={fmtK(dados.fatAtual)} variance={pct(dados.fatAtual, dados.fatAnt)} />
                  <MetricCard label="Pedidos" value={fmtInt(dados.pedidosAtual)} variance={pct(dados.pedidosAtual, dados.pedidosAnt)} />
                  <MetricCard label="Ticket médio" value={fmtK(dados.ticketAtual)} variance={pct(dados.ticketAtual, dados.ticketAnt)} />
                  <MetricCard label="Visitas" value={fmtInt(dados.visitasAtual)} variance={pct(dados.visitasAtual, dados.visitasAnt)} />
                </div>

                <div className="relpdf-included">
                  {[
                    'Capa institucional Nutrialle',
                    'Resumo executivo',
                    'Comparativo com período anterior',
                    'Gráfico de evolução de vendas e cotações',
                    'Top vendedores, fazendas e produtos',
                    'Segmentos, pontos de atenção e recomendações',
                  ].map(item => (
                    <div key={item}>
                      <IconCheck size={14} />
                      <span>{item}</span>
                    </div>
                  ))}
                </div>

                <div className="relpdf-note">
                  <strong>PDF pronto para reunião.</strong>
                  <span>A página fica simples e o conteúdo analítico vai no arquivo exportado.</span>
                </div>
              </>
            ) : (
              <div className="relpdf-loading">Não foi possível carregar os dados.</div>
            )}
          </div>
        </section>
      </div>
    </div>
  )
}
