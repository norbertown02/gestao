
import { useEffect, useMemo, useState } from 'react'
import { supabaseAdmin } from '../lib/supabase'
import Topbar from '../components/Topbar'
import {
  IconCalendar,
  IconChartBar,
  IconClipboardCheck,
  IconDownload,
  IconMapPin,
  IconTargetArrow,
  IconTrendingDown,
  IconTrendingUp,
  IconUsers,
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
    label: d.toLocaleDateString('pt-BR', { month: 'long', year: 'numeric' }),
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

function periodoLabel(tipo, ano, mes, trim) {
  if (tipo === 'mensal') {
    return new Date(ano, mes - 1, 1).toLocaleDateString('pt-BR', { month: 'long', year: 'numeric' })
  }
  if (tipo === 'trimestral') return `${trim}º trimestre de ${ano}`
  return `Ano de ${ano}`
}

function dataBR(data) {
  if (!data) return '—'
  try {
    const safe = String(data).length === 10 ? `${data}T12:00:00` : data
    return new Date(safe).toLocaleDateString('pt-BR')
  } catch {
    return '—'
  }
}

function labelSegmento(seg) {
  const s = String(seg || '').toLowerCase()
  if (s === 'leite') return 'Leite'
  if (s === 'corte') return 'Corte'
  if (s === 'suinos' || s === 'suínos') return 'Suínos'
  return s ? s.charAt(0).toUpperCase() + s.slice(1) : '—'
}

function KpiCard({ icon: Icon, label, value, variance, note, tone = 'default' }) {
  const up = variance >= 0
  return (
    <article className={`relm-kpi ${tone}`}>
      <div className="relm-kpi-top">
        <div>
          <span>{label}</span>
          <strong>{value}</strong>
        </div>
        <div className="relm-kpi-icon">
          <Icon size={18} />
        </div>
      </div>
      {variance !== undefined ? (
        <small className={`relm-kpi-variance ${up ? 'up' : 'down'}`}>
          {up ? <IconTrendingUp size={12} /> : <IconTrendingDown size={12} />}
          {up ? '+' : ''}
          {variance.toFixed(1)}% vs período anterior
        </small>
      ) : (
        <small>{note}</small>
      )}
    </article>
  )
}

function Empty({ children = 'Sem dados para exibir' }) {
  return <div className="empty">{children}</div>
}

function drawSparkline(doc, data, x, y, w, h, key, color) {
  const values = data.map(d => Number(d[key] || 0))
  if (!values.length) return
  const min = Math.min(...values)
  const max = Math.max(...values)
  const pad = 8
  const ix = x + pad
  const iy = y + pad
  const iw = w - pad * 2
  const ih = h - pad * 2

  doc.setDrawColor(233, 228, 220)
  doc.roundedRect(x, y, w, h, 3, 3)

  doc.setDrawColor(238, 234, 229)
  for (let i = 0; i <= 2; i++) {
    const gy = iy + (ih / 2) * i
    doc.line(ix, gy, ix + iw, gy)
  }

  const pts = values.map((v, idx) => {
    const px = ix + (idx / Math.max(1, values.length - 1)) * iw
    const py = iy + ih - ((v - min) / Math.max(1, max - min || 1)) * ih
    return [px, py]
  })

  doc.setDrawColor(...color)
  doc.setLineWidth(1.2)
  for (let i = 0; i < pts.length - 1; i++) {
    doc.line(pts[i][0], pts[i][1], pts[i + 1][0], pts[i + 1][1])
  }

  pts.forEach(([px, py]) => {
    doc.setFillColor(...color)
    doc.circle(px, py, 1.1, 'F')
  })

  doc.setFontSize(8)
  doc.setTextColor(110, 102, 94)
  doc.text(data[0]?.label || '', ix, y + h - 2)
  doc.text(data[data.length - 1]?.label || '', x + w - 16, y + h - 2)
}

export default function RelatorioMensal() {
  const [mesSel, setMesSel] = useState(getMes(0))
  const [tipoPeriodo, setTipoPeriodo] = useState('mensal')
  const [anoSel, setAnoSel] = useState(new Date().getFullYear())
  const [trimSel, setTrimSel] = useState(Math.ceil((new Date().getMonth() + 1) / 3))
  const [loading, setLoading] = useState(false)
  const [gerandoPDF, setGerandoPDF] = useState(false)
  const [dados, setDados] = useState(null)

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

      const d6m = new Date()
      d6m.setMonth(d6m.getMonth() - 5)
      d6m.setDate(1)
      const ini6m = toISO(d6m)

      const [
        salesMes,
        salesAnt,
        visitsMes,
        visitsAnt,
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

      const sm = salesMes.data || []
      const sa = salesAnt.data || []
      const vm = visitsMes.data || []
      const va = visitsAnt.data || []
      const fs = farmsRes.data || []
      const ck = checklistsRes.data || []
      const sl = sellersRes.data || []
      const ap = appointmentsRes.data || []
      const qt = quotesRes.data || []
      const salesEvol = salesEvolRes.data || []
      const quotesEvol = quotesEvolRes.data || []
      const allSales = allSalesRes.data || []
      const allVisits = allVisitsRes.data || []

      const fatMes = sm.reduce((a, s) => a + Number(s.total || 0), 0)
      const fatAnt = sa.reduce((a, s) => a + Number(s.total || 0), 0)
      const pedMes = sm.length
      const pedAnt = sa.length
      const tickMes = pedMes ? fatMes / pedMes : 0
      const tickAnt = pedAnt ? fatAnt / pedAnt : 0
      const visitMes = vm.length
      const visitAnt = va.length
      const scoreMedia = ck.length ? Math.round(ck.reduce((a, c) => a + Number(c.overall_score || 0), 0) / ck.length) : 0

      const d90 = new Date()
      d90.setDate(d90.getDate() - 90)
      const carteiraAtiva = new Set(allSales.filter(s => new Date(s.sale_date) >= d90).map(s => s.farm_id)).size

      const ultimaVisita = {}
      allVisits.forEach(v => {
        if (!ultimaVisita[v.farm_id]) ultimaVisita[v.farm_id] = v.visit_date
      })

      const hoje = new Date()
      const esquecidas = fs.filter(f => {
        const uv = ultimaVisita[f.id]
        return !uv || (hoje - new Date(`${uv}T12:00:00`)) / 86400000 > 45
      }).slice(0, 10)

      const novasFazendas = fs.filter(f => String(f.created_at || '') >= `${ini}T00:00:00` && String(f.created_at || '') <= `${fim}T23:59:59`)

      const vMap = {}
      sm.forEach(s => {
        const k = s.seller_id || 'geral'
        if (!vMap[k]) vMap[k] = { id: k, total: 0, pedidos: 0 }
        vMap[k].total += Number(s.total || 0)
        vMap[k].pedidos += 1
      })

      const topVendedores = Object.values(vMap)
        .map(v => {
          const profile = sl.find(p => p.id === v.id)
          return {
            ...v,
            nome: profile?.name || profile?.full_name || profile?.display_name || profile?.email || 'Vendedor',
            ticket: v.pedidos ? v.total / v.pedidos : 0,
          }
        })
        .sort((a, b) => b.total - a.total)
        .slice(0, 5)

      const fMap = {}
      sm.forEach(s => {
        if (!fMap[s.farm_id]) fMap[s.farm_id] = { id: s.farm_id, total: 0, pedidos: 0 }
        fMap[s.farm_id].total += Number(s.total || 0)
        fMap[s.farm_id].pedidos += 1
      })

      const topFazendas = Object.values(fMap)
        .map(v => {
          const farm = fs.find(f => f.id === v.id)
          return {
            ...v,
            name: farm?.name || '—',
            segment: farm?.segment || '—',
          }
        })
        .sort((a, b) => b.total - a.total)
        .slice(0, 5)

      const segMap = {}
      sm.forEach(s => {
        const seg = fs.find(f => f.id === s.farm_id)?.segment || 'outros'
        if (!segMap[seg]) segMap[seg] = 0
        segMap[seg] += Number(s.total || 0)
      })

      const segChart = Object.entries(segMap)
        .map(([seg, valor]) => ({ name: labelSegmento(seg), valor }))
        .sort((a, b) => b.valor - a.valor)

      const produtosMap = {}
      sm.forEach(s => {
        const items = Array.isArray(s.items) ? s.items : (() => {
          if (typeof s.items === 'string') {
            try {
              const parsed = JSON.parse(s.items)
              return Array.isArray(parsed) ? parsed : []
            } catch {
              return []
            }
          }
          return []
        })()

        items.forEach(item => {
          const name = item?.productName || item?.product_name || item?.name || item?.product || 'Produto'
          const subtotal = Number(item?.subtotal || item?.total || item?.value || 0)
          if (!produtosMap[name]) produtosMap[name] = { name, total: 0 }
          produtosMap[name].total += subtotal
        })
      })

      const topProdutos = Object.values(produtosMap).sort((a, b) => b.total - a.total).slice(0, 6)

      const cotacoesAbertas = qt.filter(q => ['rascunho', 'enviada'].includes(String(q.status || '').toLowerCase()))
      const cotacoesConvertidas = qt.filter(q => String(q.status || '').toLowerCase() === 'convertida')
      const valorCotacoesAbertas = cotacoesAbertas.reduce((a, q) => a + Number(q.total || 0), 0)
      const conversaoCotacoes = qt.length ? (cotacoesConvertidas.length / qt.length) * 100 : 0

      const evolMap = {}
      for (let gi = 5; gi >= 0; gi--) {
        const gd = new Date()
        gd.setMonth(gd.getMonth() - gi)
        gd.setDate(1)
        const gk = gd.toISOString().slice(0, 7)
        evolMap[gk] = {
          mes: gk,
          label: gd.toLocaleDateString('pt-BR', { month: 'short', year: '2-digit' }),
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
      const evolucaoMensal = Object.values(evolMap)

      const fMapMes = {}
      const fMapAnt = {}
      sm.forEach(s => { fMapMes[s.farm_id] = (fMapMes[s.farm_id] || 0) + Number(s.total || 0) })
      sa.forEach(s => { fMapAnt[s.farm_id] = (fMapAnt[s.farm_id] || 0) + Number(s.total || 0) })

      const fazendasEmQueda = fs
        .filter(f => {
          const atual = fMapMes[f.id] || 0
          const ant = fMapAnt[f.id] || 0
          return ant > 0 && atual < ant && ((ant - atual) / ant) * 100 > 40
        })
        .map(f => ({
          ...f,
          atual: fMapMes[f.id] || 0,
          anterior: fMapAnt[f.id] || 0,
          queda: ((fMapAnt[f.id] - (fMapMes[f.id] || 0)) / fMapAnt[f.id]) * 100,
        }))
        .sort((a, b) => b.queda - a.queda)
        .slice(0, 8)

      const vMapMes = {}
      const vMapAnt = {}
      sm.forEach(s => { const k = s.seller_id || 'geral'; vMapMes[k] = (vMapMes[k] || 0) + Number(s.total || 0) })
      sa.forEach(s => { const k = s.seller_id || 'geral'; vMapAnt[k] = (vMapAnt[k] || 0) + Number(s.total || 0) })

      const vendedoresEmQueda = sl
        .filter(s => {
          const atual = vMapMes[s.id] || 0
          const ant = vMapAnt[s.id] || 0
          return ant > 0 && atual < ant && ((ant - atual) / ant) * 100 > 30
        })
        .map(s => ({
          ...s,
          atual: vMapMes[s.id] || 0,
          anterior: vMapAnt[s.id] || 0,
          queda: ((vMapAnt[s.id] - (vMapMes[s.id] || 0)) / vMapAnt[s.id]) * 100,
        }))
        .sort((a, b) => b.queda - a.queda)
        .slice(0, 8)

      const destaquePrincipal = topVendedores[0]
        ? `${topVendedores[0].nome} liderou o período com ${fmtK(topVendedores[0].total)} em vendas.`
        : 'Sem destaque comercial no período.'

      const pontoAtencao = fazendasEmQueda[0]
        ? `${fazendasEmQueda[0].name} apresentou queda de ${fazendasEmQueda[0].queda.toFixed(1)}% vs período anterior.`
        : 'Sem alertas críticos relevantes no período.'

      setDados({
        periodoLabel: periodoLabel(tipoPeriodo, anoSel, mesSel.mes, trimSel),
        fatMes,
        fatAnt,
        pedMes,
        pedAnt,
        tickMes,
        tickAnt,
        visitMes,
        visitAnt,
        carteiraAtiva,
        carteiraTot: fs.length,
        scoreMedia,
        checklists: ck.length,
        topVendedores,
        topFazendas,
        segChart,
        topProdutos,
        novasFazendas,
        esquecidas,
        cotacoesAbertas: cotacoesAbertas.length,
        valorCotacoesAbertas,
        cotacoesConvertidas: cotacoesConvertidas.length,
        conversaoCotacoes,
        evolucaoMensal,
        proximas: ap,
        fazendasEmQueda,
        vendedoresEmQueda,
        destaquePrincipal,
        pontoAtencao,
      })
    } catch (error) {
      console.error('Erro ao carregar relatório mensal:', error)
      setDados(null)
    } finally {
      setLoading(false)
    }
  }

  async function gerarPDF() {
    if (!dados) return
    setGerandoPDF(true)

    try {
      const doc = new jsPDF('p', 'mm', 'a4')
      const W = 210
      const H = 297
      const M = 16
      let y = M

      const ORANGE = [232, 119, 34]
      const BLACK = [20, 20, 20]
      const GRAY = [110, 102, 94]
      const LIGHT = [246, 243, 239]
      const LINE = [229, 223, 215]
      const GREEN = [44, 145, 76]
      const RED = [209, 56, 56]

      const addPage = () => { doc.addPage(); y = M }
      const ensure = (space = 20) => { if (y + space > H - M) addPage() }

      const card = (x, yy, w, h, title, value, delta, isGood = true) => {
        doc.setFillColor(...LIGHT)
        doc.roundedRect(x, yy, w, h, 4, 4, 'F')
        doc.setDrawColor(...LINE)
        doc.roundedRect(x, yy, w, h, 4, 4)

        doc.setFont('helvetica', 'normal')
        doc.setFontSize(8)
        doc.setTextColor(...GRAY)
        doc.text(title, x + 4, yy + 6)

        doc.setFont('helvetica', 'bold')
        doc.setFontSize(13)
        doc.setTextColor(...BLACK)
        doc.text(String(value), x + 4, yy + 13)

        if (delta !== undefined) {
          doc.setFontSize(8)
          doc.setTextColor(...((delta >= 0) === isGood ? GREEN : RED))
          doc.text(`${delta >= 0 ? '+' : ''}${delta.toFixed(1)}% vs anterior`, x + 4, yy + 18)
        }
      }

      doc.setFillColor(...ORANGE)
      doc.rect(0, 0, W, 44, 'F')
      try {
        doc.addImage(logoNutrialle, 'PNG', M, 10, 38, 20)
      } catch (e) {}

      doc.setFont('helvetica', 'bold')
      doc.setFontSize(20)
      doc.setTextColor(255, 255, 255)
      doc.text('Relatório Executivo Comercial', M, 33)

      y = 56

      doc.setFont('helvetica', 'bold')
      doc.setFontSize(16)
      doc.setTextColor(...BLACK)
      doc.text(dados.periodoLabel, M, y)
      y += 7
      doc.setFont('helvetica', 'normal')
      doc.setFontSize(9)
      doc.setTextColor(...GRAY)
      doc.text(`Gerado em ${new Date().toLocaleDateString('pt-BR')} · Nutrialle`, M, y)
      y += 12

      ensure(34)
      doc.setFont('helvetica', 'bold')
      doc.setFontSize(12)
      doc.setTextColor(...BLACK)
      doc.text('Resumo executivo', M, y)
      y += 5
      doc.setDrawColor(...LINE)
      doc.line(M, y, W - M, y)
      y += 8

      doc.setFont('helvetica', 'normal')
      doc.setFontSize(9)
      doc.setTextColor(...GRAY)
      const bullets = [
        `Faturamento de ${fmtK(dados.fatMes)}, variação de ${pct(dados.fatMes, dados.fatAnt).toFixed(1)}% vs período anterior.`,
        `${fmtInt(dados.pedMes)} pedidos com ticket médio de ${fmtK(dados.tickMes)}.`,
        `${fmtInt(dados.visitMes)} visitas realizadas e ${fmtInt(dados.cotacoesAbertas)} cotações abertas (${fmtK(dados.valorCotacoesAbertas)}).`,
        `Carteira ativa com ${fmtInt(dados.carteiraAtiva)} fazendas e score técnico médio de ${dados.scoreMedia}.`,
        dados.destaquePrincipal,
        dados.pontoAtencao,
      ]

      bullets.forEach(line => {
        const wrapped = doc.splitTextToSize(`• ${line}`, W - M * 2)
        doc.text(wrapped, M, y)
        y += wrapped.length * 4.6
      })

      y += 3
      const gap = 4
      const colW = (W - M * 2 - gap * 3) / 4
      card(M, y, colW, 22, 'Faturamento', fmtK(dados.fatMes), pct(dados.fatMes, dados.fatAnt))
      card(M + (colW + gap), y, colW, 22, 'Pedidos', fmtInt(dados.pedMes), pct(dados.pedMes, dados.pedAnt))
      card(M + (colW + gap) * 2, y, colW, 22, 'Ticket médio', fmtK(dados.tickMes), pct(dados.tickMes, dados.tickAnt))
      card(M + (colW + gap) * 3, y, colW, 22, 'Visitas', fmtInt(dados.visitMes), pct(dados.visitMes, dados.visitAnt))
      y += 30

      ensure(62)
      doc.setFont('helvetica', 'bold')
      doc.setFontSize(12)
      doc.setTextColor(...BLACK)
      doc.text('Evolução dos últimos 6 meses', M, y)
      y += 6
      doc.setDrawColor(...LINE)
      doc.line(M, y, W - M, y)
      y += 6

      drawSparkline(doc, dados.evolucaoMensal, M, y, 86, 42, 'vendas', ORANGE)
      drawSparkline(doc, dados.evolucaoMensal, M + 92, y, 86, 42, 'cotacoes', [30, 30, 30])
      doc.setTextColor(...GRAY)
      doc.setFontSize(8)
      doc.text('Vendas', M + 4, y + 6)
      doc.text('Valor cotado', M + 96, y + 6)
      y += 52

      ensure(60)
      autoTable(doc, {
        startY: y,
        theme: 'grid',
        headStyles: { fillColor: ORANGE, textColor: 255, fontStyle: 'bold', lineColor: LINE, lineWidth: 0.1 },
        bodyStyles: { fontSize: 8, textColor: BLACK, lineColor: LINE, lineWidth: 0.1 },
        alternateRowStyles: { fillColor: LIGHT },
        styles: { cellPadding: 2.6 },
        head: [['Top vendedores', 'Faturamento', 'Pedidos', 'Ticket médio']],
        body: (dados.topVendedores || []).map(v => [
          v.nome,
          fmtK(v.total),
          fmtInt(v.pedidos),
          fmtK(v.ticket),
        ]),
      })
      y = doc.lastAutoTable.finalY + 8

      ensure(60)
      autoTable(doc, {
        startY: y,
        theme: 'grid',
        headStyles: { fillColor: BLACK, textColor: 255, fontStyle: 'bold', lineColor: LINE, lineWidth: 0.1 },
        bodyStyles: { fontSize: 8, textColor: BLACK, lineColor: LINE, lineWidth: 0.1 },
        alternateRowStyles: { fillColor: LIGHT },
        styles: { cellPadding: 2.6 },
        head: [['Top fazendas', 'Segmento', 'Faturamento', 'Pedidos']],
        body: (dados.topFazendas || []).map(f => [
          f.name,
          labelSegmento(f.segment),
          fmtK(f.total),
          fmtInt(f.pedidos),
        ]),
      })
      y = doc.lastAutoTable.finalY + 8

      addPage()

      doc.setFont('helvetica', 'bold')
      doc.setFontSize(13)
      doc.setTextColor(...BLACK)
      doc.text('Mix, riscos e prioridades', M, y)
      y += 7
      doc.setDrawColor(...LINE)
      doc.line(M, y, W - M, y)
      y += 8

      autoTable(doc, {
        startY: y,
        theme: 'grid',
        headStyles: { fillColor: ORANGE, textColor: 255, fontStyle: 'bold', lineColor: LINE, lineWidth: 0.1 },
        bodyStyles: { fontSize: 8, textColor: BLACK, lineColor: LINE, lineWidth: 0.1 },
        alternateRowStyles: { fillColor: LIGHT },
        styles: { cellPadding: 2.6 },
        head: [['Top produtos', 'Faturamento']],
        body: (dados.topProdutos || []).map(p => [p.name, fmtK(p.total)]),
      })
      y = doc.lastAutoTable.finalY + 8

      autoTable(doc, {
        startY: y,
        theme: 'grid',
        headStyles: { fillColor: BLACK, textColor: 255, fontStyle: 'bold', lineColor: LINE, lineWidth: 0.1 },
        bodyStyles: { fontSize: 8, textColor: BLACK, lineColor: LINE, lineWidth: 0.1 },
        alternateRowStyles: { fillColor: LIGHT },
        styles: { cellPadding: 2.6 },
        head: [['Segmento', 'Receita']],
        body: (dados.segChart || []).map(s => [s.name, fmtK(s.valor)]),
      })
      y = doc.lastAutoTable.finalY + 8

      autoTable(doc, {
        startY: y,
        theme: 'grid',
        headStyles: { fillColor: [186, 56, 56], textColor: 255, fontStyle: 'bold', lineColor: LINE, lineWidth: 0.1 },
        bodyStyles: { fontSize: 8, textColor: BLACK, lineColor: LINE, lineWidth: 0.1 },
        alternateRowStyles: { fillColor: LIGHT },
        styles: { cellPadding: 2.6 },
        head: [['Fazendas em atenção', 'Receita atual', 'Receita anterior', 'Queda']],
        body: (dados.fazendasEmQueda || []).slice(0, 8).map(f => [
          f.name || '—',
          fmtK(f.atual),
          fmtK(f.anterior),
          `${f.queda.toFixed(1)}%`,
        ]),
      })
      y = doc.lastAutoTable.finalY + 8

      doc.setFont('helvetica', 'bold')
      doc.setFontSize(12)
      doc.setTextColor(...BLACK)
      doc.text('Recomendações de ação', M, y)
      y += 6

      doc.setFont('helvetica', 'normal')
      doc.setFontSize(9)
      doc.setTextColor(...GRAY)
      const recs = [
        `Priorizar recuperação das fazendas com maior queda e revisar o plano de ação dos vendedores em retração.`,
        `Atacar cotações abertas (${fmtInt(dados.cotacoesAbertas)}) para acelerar conversão e proteger faturamento do próximo período.`,
        `Aumentar a frequência de visitas nas fazendas esquecidas (${fmtInt(dados.esquecidas.length)}) e monitorar cobertura da carteira.`,
        `Aproveitar os segmentos e produtos líderes para replicar o desempenho nas demais carteiras.`,
      ]
      recs.forEach(r => {
        const wrapped = doc.splitTextToSize(`• ${r}`, W - M * 2)
        doc.text(wrapped, M, y)
        y += wrapped.length * 4.5
      })

      doc.save(`Relatorio_Executivo_${dados.periodoLabel.replace(/\s+/g, '_')}.pdf`)
    } catch (error) {
      console.error('Erro ao gerar PDF:', error)
    } finally {
      setGerandoPDF(false)
    }
  }

  const comparativo = useMemo(() => {
    if (!dados) return []
    return [
      { label: 'Atual', faturamento: dados.fatMes, pedidos: dados.pedMes, visitas: dados.visitMes },
      { label: 'Anterior', faturamento: dados.fatAnt, pedidos: dados.pedAnt, visitas: dados.visitAnt },
    ]
  }, [dados])

  return (
    <div style={{ flex: 1, overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>
      <Topbar title="Fechamento Executivo Mensal" subtitle="Resumo comercial, comparativo e PDF executivo">
        <button className="btn btn-ghost btn-sm" onClick={gerarPDF} disabled={!dados || gerandoPDF}>
          <IconDownload size={14} />
          {gerandoPDF ? 'Gerando PDF...' : 'Exportar PDF'}
        </button>
      </Topbar>

      <div className="page relm-page" style={{ overflowY: 'auto' }}>
        <section className="relm-toolbar">
          <div className="relm-toolbar-left">
            <div className="relm-filter-icon">
              <IconCalendar size={15} />
            </div>

            <select value={tipoPeriodo} onChange={e => setTipoPeriodo(e.target.value)}>
              <option value="mensal">Mensal</option>
              <option value="trimestral">Trimestral</option>
              <option value="anual">Anual</option>
            </select>

            {tipoPeriodo === 'mensal' && (
              <select
                value={`${mesSel.ano}-${mesSel.mes}`}
                onChange={e => {
                  const [ano, mes] = e.target.value.split('-')
                  setAnoSel(Number(ano))
                  setMesSel({
                    ano: Number(ano),
                    mes: Number(mes),
                    label: new Date(Number(ano), Number(mes) - 1, 1).toLocaleDateString('pt-BR', { month: 'long', year: 'numeric' }),
                  })
                }}
              >
                {mesesOpcoes.map(m => (
                  <option key={`${m.ano}-${m.mes}`} value={`${m.ano}-${m.mes}`}>
                    {m.label}
                  </option>
                ))}
              </select>
            )}

            {tipoPeriodo !== 'mensal' && (
              <select value={anoSel} onChange={e => setAnoSel(Number(e.target.value))}>
                {anosOpcoes.map(ano => (
                  <option key={ano} value={ano}>
                    {ano}
                  </option>
                ))}
              </select>
            )}

            {tipoPeriodo === 'trimestral' && (
              <select value={trimSel} onChange={e => setTrimSel(Number(e.target.value))}>
                <option value={1}>1º trimestre</option>
                <option value={2}>2º trimestre</option>
                <option value={3}>3º trimestre</option>
                <option value={4}>4º trimestre</option>
              </select>
            )}
          </div>

          <div className="relm-toolbar-count">{dados?.periodoLabel || 'Carregando período...'}</div>
        </section>

        {loading ? (
          <Empty>Carregando relatório...</Empty>
        ) : !dados ? (
          <Empty>Não foi possível carregar os dados do relatório.</Empty>
        ) : (
          <>
            <section className="relm-hero">
              <div>
                <span className="relm-eyebrow">Resumo do período</span>
                <h2>{fmtK(dados.fatMes)}</h2>
                <small>{dados.destaquePrincipal}</small>
              </div>

              <div className="relm-hero-grid">
                <div>
                  <span>Pedidos</span>
                  <strong>{fmtInt(dados.pedMes)}</strong>
                </div>
                <div>
                  <span>Visitas</span>
                  <strong>{fmtInt(dados.visitMes)}</strong>
                </div>
                <div>
                  <span>Pipeline aberto</span>
                  <strong>{fmtK(dados.valorCotacoesAbertas)}</strong>
                </div>
              </div>
            </section>

            <section className="relm-kpi-grid">
              <KpiCard icon={IconWallet} label="Faturamento" value={fmtK(dados.fatMes)} variance={pct(dados.fatMes, dados.fatAnt)} />
              <KpiCard icon={IconChartBar} label="Pedidos" value={fmtInt(dados.pedMes)} variance={pct(dados.pedMes, dados.pedAnt)} />
              <KpiCard icon={IconTargetArrow} label="Ticket médio" value={fmtK(dados.tickMes)} variance={pct(dados.tickMes, dados.tickAnt)} />
              <KpiCard icon={IconMapPin} label="Visitas" value={fmtInt(dados.visitMes)} variance={pct(dados.visitMes, dados.visitAnt)} />
              <KpiCard icon={IconUsers} label="Carteira ativa" value={fmtInt(dados.carteiraAtiva)} note={`${fmtInt(dados.carteiraTot)} fazendas ativas`} />
              <KpiCard icon={IconClipboardCheck} label="Score técnico" value={dados.scoreMedia} note={`${fmtInt(dados.checklists)} checklists no período`} />
            </section>

            <section className="relm-main-grid">
              <div className="relm-card relm-chart-card">
                <div className="relm-card-head">
                  <div>
                    <span className="relm-eyebrow">Evolução</span>
                    <h3>Vendas e cotações</h3>
                  </div>
                </div>

                <ResponsiveContainer width="100%" height={300}>
                  <AreaChart data={dados.evolucaoMensal} margin={{ top: 8, right: 14, left: -18, bottom: 0 }}>
                    <defs>
                      <linearGradient id="relmVendas" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="5%" stopColor="var(--orange)" stopOpacity={0.25} />
                        <stop offset="95%" stopColor="var(--orange)" stopOpacity={0.02} />
                      </linearGradient>
                      <linearGradient id="relmCot" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="5%" stopColor="#111111" stopOpacity={0.18} />
                        <stop offset="95%" stopColor="#111111" stopOpacity={0.02} />
                      </linearGradient>
                    </defs>
                    <CartesianGrid strokeDasharray="4 6" />
                    <XAxis dataKey="label" tickLine={false} axisLine={false} />
                    <YAxis tickLine={false} axisLine={false} tickFormatter={v => `R$ ${(v / 1000).toFixed(0)}k`} />
                    <Tooltip formatter={value => `R$ ${fmt(value)}`} />
                    <Area type="monotone" dataKey="vendas" stroke="var(--orange)" strokeWidth={2.5} fill="url(#relmVendas)" />
                    <Area type="monotone" dataKey="cotacoes" stroke="#111111" strokeWidth={1.8} fill="url(#relmCot)" />
                  </AreaChart>
                </ResponsiveContainer>
              </div>

              <div className="relm-card">
                <div className="relm-card-head">
                  <div>
                    <span className="relm-eyebrow">Comparativo</span>
                    <h3>Atual vs anterior</h3>
                  </div>
                </div>

                <ResponsiveContainer width="100%" height={300}>
                  <BarChart data={comparativo} margin={{ top: 8, right: 12, left: -16, bottom: 0 }}>
                    <CartesianGrid strokeDasharray="4 6" />
                    <XAxis dataKey="label" tickLine={false} axisLine={false} />
                    <YAxis tickLine={false} axisLine={false} tickFormatter={v => `R$ ${(v / 1000).toFixed(0)}k`} />
                    <Tooltip formatter={value => `R$ ${fmt(value)}`} />
                    <Bar dataKey="faturamento" fill="var(--orange)" radius={[8, 8, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </section>

            <section className="relm-grid-3">
              <div className="relm-card">
                <div className="relm-card-head">
                  <div>
                    <span className="relm-eyebrow">Equipe</span>
                    <h3>Top vendedores</h3>
                  </div>
                </div>

                <div className="relm-ranking">
                  {dados.topVendedores.length ? dados.topVendedores.map((v, i) => (
                    <div className="relm-ranking-row" key={v.id}>
                      <span className="relm-rank">{i + 1}</span>
                      <div className="relm-ranking-main">
                        <strong>{v.nome}</strong>
                        <small>{fmtInt(v.pedidos)} pedidos · ticket {fmtK(v.ticket)}</small>
                      </div>
                      <div className="relm-ranking-foot">
                        <strong>{fmtK(v.total)}</strong>
                      </div>
                    </div>
                  )) : <Empty>Sem vendas por vendedor</Empty>}
                </div>
              </div>

              <div className="relm-card">
                <div className="relm-card-head">
                  <div>
                    <span className="relm-eyebrow">Produtos</span>
                    <h3>Top produtos</h3>
                  </div>
                </div>

                <div className="relm-ranking">
                  {dados.topProdutos.length ? dados.topProdutos.map((p, i) => (
                    <div className="relm-ranking-row" key={p.name}>
                      <span className="relm-rank">{i + 1}</span>
                      <div className="relm-ranking-main">
                        <strong>{p.name}</strong>
                        <small>produto líder do período</small>
                      </div>
                      <div className="relm-ranking-foot">
                        <strong>{fmtK(p.total)}</strong>
                      </div>
                    </div>
                  )) : <Empty>Sem produtos vendidos</Empty>}
                </div>
              </div>

              <div className="relm-card">
                <div className="relm-card-head">
                  <div>
                    <span className="relm-eyebrow">Mix</span>
                    <h3>Receita por segmento</h3>
                  </div>
                </div>

                {dados.segChart.length ? (
                  <ResponsiveContainer width="100%" height={260}>
                    <BarChart data={dados.segChart} layout="vertical" margin={{ top: 8, right: 12, left: 20, bottom: 0 }}>
                      <CartesianGrid strokeDasharray="4 6" />
                      <XAxis type="number" tickLine={false} axisLine={false} tickFormatter={v => `R$ ${(v / 1000).toFixed(0)}k`} />
                      <YAxis type="category" dataKey="name" tickLine={false} axisLine={false} width={60} />
                      <Tooltip formatter={value => `R$ ${fmt(value)}`} />
                      <Bar dataKey="valor" fill="var(--orange)" radius={[0, 8, 8, 0]} />
                    </BarChart>
                  </ResponsiveContainer>
                ) : <Empty>Sem mix por segmento</Empty>}
              </div>
            </section>

            <section className="relm-grid-2">
              <div className="relm-card">
                <div className="relm-card-head">
                  <div>
                    <span className="relm-eyebrow">Clientes</span>
                    <h3>Top fazendas</h3>
                  </div>
                </div>

                <div className="relm-ranking">
                  {dados.topFazendas.length ? dados.topFazendas.map((f, i) => (
                    <div className="relm-ranking-row" key={f.id}>
                      <span className="relm-rank">{i + 1}</span>
                      <div className="relm-ranking-main">
                        <strong>{f.name}</strong>
                        <small>{labelSegmento(f.segment)} · {fmtInt(f.pedidos)} pedidos</small>
                      </div>
                      <div className="relm-ranking-foot">
                        <strong>{fmtK(f.total)}</strong>
                      </div>
                    </div>
                  )) : <Empty>Sem fazendas com vendas</Empty>}
                </div>
              </div>

              <div className="relm-card">
                <div className="relm-card-head">
                  <div>
                    <span className="relm-eyebrow">Atenção</span>
                    <h3>Fazendas em queda</h3>
                  </div>
                </div>

                <div className="relm-risk-list">
                  {dados.fazendasEmQueda.length ? dados.fazendasEmQueda.map(f => (
                    <div className="relm-risk-item" key={f.id}>
                      <div>
                        <strong>{f.name}</strong>
                        <small>{labelSegmento(f.segment)} · {fmtK(f.anterior)} → {fmtK(f.atual)}</small>
                      </div>
                      <span>{f.queda.toFixed(1)}%</span>
                    </div>
                  )) : <Empty>Sem fazendas críticas no período</Empty>}
                </div>
              </div>
            </section>

            <section className="relm-grid-2">
              <div className="relm-card relm-note-card">
                <span className="relm-eyebrow">Resumo qualitativo</span>
                <h3>Destaque do período</h3>
                <p>{dados.destaquePrincipal}</p>

                <h4>Ponto de atenção</h4>
                <p>{dados.pontoAtencao}</p>
              </div>

              <div className="relm-card relm-note-card">
                <span className="relm-eyebrow">Pipeline e agenda</span>
                <h3>Prioridades operacionais</h3>
                <p>{fmtInt(dados.cotacoesAbertas)} cotações abertas somando {fmtK(dados.valorCotacoesAbertas)}.</p>
                <p>Conversão histórica de cotações: {dados.conversaoCotacoes.toFixed(1)}%.</p>
                <p>{fmtInt(dados.esquecidas.length)} fazendas sem visita recente e {fmtInt(dados.proximas.length)} compromissos nos próximos 30 dias.</p>
              </div>
            </section>
          </>
        )}
      </div>
    </div>
  )
}
