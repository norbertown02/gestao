import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import {
  IconAlertTriangle, IconArrowRight, IconBuildingBank,
  IconClockDollar, IconCoins, IconCreditCard, IconInvoice, IconPackage, IconPercentage,
  IconScale, IconUsers, IconWallet,
} from '@tabler/icons-react'
import { Bar, CartesianGrid, Cell, ComposedChart, Legend, Line, LineChart, Pie, PieChart, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'
import Topbar from '../components/Topbar'
import { supabaseAdmin } from '../lib/supabase'

const money = value => Number(value || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })
const shortMoney = value => {
  const n = Number(value || 0)
  const sign = n < 0 ? '-' : ''
  const abs = Math.abs(n)
  if (abs >= 1000000) return `${sign}R$ ${(abs / 1000000).toFixed(2)} mi`
  if (abs >= 1000) return `${sign}R$ ${(abs / 1000).toFixed(0)} mil`
  return money(n)
}
const pct = value => `${Number(value || 0).toFixed(1)}%`
const dateBR = value => value ? new Date(`${value}T12:00:00`).toLocaleDateString('pt-BR', { day: '2-digit', month: 'long', year: 'numeric' }) : '—'
const MESES = ['', 'Jan', 'Fev', 'Mar', 'Abr', 'Mai', 'Jun', 'Jul', 'Ago', 'Set', 'Out', 'Nov', 'Dez']

// Contas que representam entrada/saída neutra de caixa (aporte de sócios, adiantamentos
// e o próprio empréstimo tomado) -- somadas distorceriam a leitura de despesa operacional.
const CONTAS_NEUTRAS = new Set([
  'DEVOLUCAO ADIANTAMENTO - FORNECEDOR', 'DEVOLUCAO ADIANTAMENTO - FUNCIONARIO',
  'ADIANTAMENTO A FORNECEDOR', 'ADIANTAMENTO A FUNCIONÁRIO',
  'APORTE SOCIOS', 'DEVOLUÇÃO DE APORTE AOS SÓCIOS', 'EMPRÉSTIMO/FINANCIAMENTO',
])

const GRUPO_LABEL = {
  ADMINISTRATIVAS: 'Administrativas', BANCARIAS: 'Bancárias', COMPRAS: 'Compras',
  FUNCIONAMENTO: 'Funcionamento', FUNCIONARIOS: 'Pessoal', 'PROPAGANDA E PUBLICIDADE': 'Marketing',
  TRANSPORTE: 'Transporte', TRIBUTARIAS: 'Tributos', VEICULOS: 'Veículos', VENDAS: 'Devoluções e seguro',
}

const PIE_COLORS = ['#E87722', '#292623', '#426A8C', '#23864A', '#C87812', '#C93A32', '#A79C92', '#7C746C', '#9b621f', '#675f58']

function Kpi({ icon: Icon, label, value, note, tone = '' }) {
  return <article className={`dash-kpi-card ${tone}`}><Icon size={20} /><span>{label}</span><strong>{value}</strong><small>{note}</small></article>
}

function Insight({ tone, title, text }) {
  return <div className={`dash-insight ${tone}`}><div className="dash-insight-icon"><IconAlertTriangle size={16} /></div><div><strong>{title}</strong><span>{text}</span></div></div>
}

export default function Financeiro() {
  const [dre, setDre] = useState([])
  const [balancos, setBalancos] = useState([])
  const [contas, setContas] = useState([])
  const [closings, setClosings] = useState([])
  const [managerial, setManagerial] = useState([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    async function load() {
      const [dreRes, balancoRes, contasRes, closingsRes, managerialRes] = await Promise.all([
        supabaseAdmin.from('finance_dre_monthly').select('*').order('ano').order('mes'),
        supabaseAdmin.from('finance_balanco').select('*').order('competencia_date', { ascending: false }),
        supabaseAdmin.from('finance_balancete_accounts').select('*'),
        supabaseAdmin.from('finance_closings').select('*').order('competencia_date', { ascending: false }),
        supabaseAdmin.from('finance_managerial_monthly').select('*').order('ano').order('mes'),
      ])
      setDre(dreRes.data || [])
      setBalancos(balancoRes.data || [])
      setContas(contasRes.data || [])
      setClosings(closingsRes.data || [])
      setManagerial(managerialRes.data || [])
      setLoading(false)
    }
    load()
  }, [])

  const data = useMemo(() => {
    if (!dre.length) return null
    const balanco = balancos[0]
    const closing = closings[0]
    const competencia = balanco?.competencia_date
    const contasPeriodo = contas.filter(row => row.competencia_date === competencia)

    // Aporte de sócios e sua devolução são movimentação de capital (bancam o capital de giro),
    // não resultado operacional -- mas o Ultra lança os dois como receita/despesa no balancete,
    // o que contamina o "lucro/prejuízo acumulado" oficial do balanço como se fosse prejuízo.
    // Isolamos aqui pra tirar esse efeito de qualquer indicador de análise operacional.
    const aporteRecebido = contasPeriodo.filter(row => row.conta === 'APORTE SOCIOS').reduce((s, row) => s + Number(row.debito), 0)
    const devolucaoAporte = contasPeriodo.filter(row => row.conta === 'DEVOLUÇÃO DE APORTE AOS SÓCIOS').reduce((s, row) => s + Number(row.credito), 0)
    const netAporteMovimento = aporteRecebido - devolucaoAporte

    const months = dre.map(row => {
      const receitas = Number(row.receitas)
      const resultadoLiquido = Number(row.resultado_liquido)
      return {
        key: `${row.ano}-${String(row.mes).padStart(2, '0')}`,
        label: MESES[row.mes],
        raw: row,
        Receita: receitas,
        CustosVariaveis: Number(row.custos_variaveis),
        MargemContribuicao: Number(row.margem_contribuicao),
        CustosFixos: Number(row.custos_fixos),
        Custos: Number(row.custos_variaveis) + Number(row.custos_fixos),
        ResultadoOperacional: Number(row.resultado_operacional),
        ExtraOperacional: Number(row.extra_operacional),
        'Resultado Líquido': resultadoLiquido,
        'Ponto de Equilíbrio': Number(row.ponto_equilibrio),
        margemPct: receitas ? Number(row.margem_contribuicao) / receitas * 100 : 0,
        liquidaPct: receitas ? resultadoLiquido / receitas * 100 : 0,
        acimaPE: receitas >= Number(row.ponto_equilibrio),
      }
    })

    const last = months[months.length - 1]
    const prev = months[months.length - 2]
    const totalReceitas = months.reduce((s, m) => s + m.Receita, 0)
    const totalCustosVariaveis = months.reduce((s, m) => s + m.CustosVariaveis, 0)
    const totalMargem = months.reduce((s, m) => s + m.MargemContribuicao, 0)
    const totalCustosFixos = months.reduce((s, m) => s + m.CustosFixos, 0)
    const totalResultadoLiquido = months.reduce((s, m) => s + m['Resultado Líquido'], 0)

    // Ponto de equilíbrio médio (custo fixo médio ÷ margem de contribuição agregada) em vez da
    // média simples mês a mês -- um único mês com margem quase nula (ex.: fevereiro) faz o PE
    // individual explodir matematicamente e não serve como referência.
    const custosFixosMedioMensal = totalCustosFixos / months.length
    const margemPctAgregada = totalReceitas ? totalMargem / totalReceitas : 0
    const peMedio = margemPctAgregada ? custosFixosMedioMensal / margemPctAgregada : 0
    const mesesAcimaPE = months.filter(m => m.acimaPE).length

    const payrollTotal = dre.reduce((s, r) => s + Number(r.custos_fixos_detail?.funcionarios || 0) + Number(r.custos_variaveis_detail?.funcionarios || 0), 0)

    const top2 = [...months].sort((a, b) => b.Receita - a.Receita).slice(0, 2)
    const concentracaoTop2Pct = totalReceitas ? top2.reduce((s, m) => s + m.Receita, 0) / totalReceitas * 100 : 0
    const top2Labels = top2.map(m => `${m.label}/26`).join(' e ')

    let balanceMetrics = null
    if (balanco) {
      // R$ 882.921,28 de aporte de sócios a devolver estão lançados como contas a pagar (dentro
      // da faixa "até 360 dias"), mas não são dívida operacional -- tiramos do total e da faixa
      // onde estão, senão liquidez, endividamento e o mapa de aperto de caixa ficam errados.
      const aporteADevolverAP = Number(balanco.contas_pagar_aporte_a_devolver || 0)
      const contasPagarMedioAjustado = Number(balanco.contas_pagar_a_vencer_medio) - aporteADevolverAP
      const contasPagarTotalAjustado = Number(balanco.contas_pagar_total) - aporteADevolverAP

      const ativoCirculante = Number(balanco.disponibilidades) + Number(balanco.contas_receber_total) + Number(balanco.estoque)
      const passivoCirculante = Number(balanco.contas_pagar_vencido_curto) + Number(balanco.contas_pagar_vencido_medio) + Number(balanco.contas_pagar_a_vencer_curto) + contasPagarMedioAjustado
      const passivoNaoCirculante = Number(balanco.contas_pagar_a_vencer_longo)
      const liquidezCorrente = passivoCirculante ? ativoCirculante / passivoCirculante : 0
      const liquidezSeca = passivoCirculante ? (ativoCirculante - Number(balanco.estoque)) / passivoCirculante : 0
      const endividamento = Number(balanco.ativo_total) ? contasPagarTotalAjustado / Number(balanco.ativo_total) * 100 : 0
      const arVencidoPct = Number(balanco.contas_receber_total) ? Number(balanco.contas_receber_vencido) / Number(balanco.contas_receber_total) * 100 : 0
      const apVencidoTotal = Number(balanco.contas_pagar_vencido_curto) + Number(balanco.contas_pagar_vencido_medio)
      const apVencidoPct = contasPagarTotalAjustado ? apVencidoTotal / contasPagarTotalAjustado * 100 : 0
      const apLongoPct = contasPagarTotalAjustado ? passivoNaoCirculante / contasPagarTotalAjustado * 100 : 0

      // Casa o vencimento de contas a receber com o de contas a pagar, faixa a faixa, pra achar
      // onde exatamente o caixa aperta -- uma liquidez corrente "ok" no total pode esconder uma
      // faixa de prazo com muito mais saindo do que entrando. Já sem o aporte a devolver.
      const apVencidoCurto = Number(balanco.contas_pagar_vencido_curto) + Number(balanco.contas_pagar_vencido_medio)
      const buckets = [
        { label: 'Vencido', ar: Number(balanco.contas_receber_vencido), ap: apVencidoCurto },
        { label: 'Até 90 dias', ar: Number(balanco.contas_receber_a_vencer_curto), ap: Number(balanco.contas_pagar_a_vencer_curto) },
        { label: 'Até 360 dias', ar: Number(balanco.contas_receber_a_vencer_medio), ap: contasPagarMedioAjustado },
        { label: 'Longo prazo', ar: 0, ap: Number(balanco.contas_pagar_a_vencer_longo) },
      ].map(b => ({ ...b, gap: b.ar - b.ap }))
      const piorFaixa = buckets.reduce((worst, b) => b.gap < worst.gap ? b : worst, buckets[0])

      const patrimonioLiquidoReportado = Number(balanco.lucro_prejuizo_acumulado)
      balanceMetrics = {
        ativoCirculante, passivoCirculante, passivoNaoCirculante, liquidezCorrente, liquidezSeca, endividamento,
        arVencidoPct, apVencidoPct, apVencidoTotal, apLongoPct, buckets, piorFaixa,
        aporteADevolverAP, contasPagarTotalAjustado, contasPagarMedioAjustado,
        patrimonioLiquidoReportado,
        patrimonioLiquido: patrimonioLiquidoReportado - netAporteMovimento,
        capitalGiroLiquido: ativoCirculante - passivoCirculante,
      }
    }

    // Prazos médios reais do Relatório Gerencial do Ultra (PMRV/PMPF/PMRE), calculados
    // fatura a fatura pelo próprio ERP -- muito mais confiáveis que estimar por saldo de balanço.
    const mgrMonths = managerial.map(row => ({ ...row, label: MESES[row.mes] }))
    const mgrLast = mgrMonths[mgrMonths.length - 1] || null
    const mgrFirst = mgrMonths[0] || null

    // Média ponderada em vez de simples: cada índice varia muito mês a mês (ex.: PMRV de 33 a 49
    // dias), então uma média simples trata um mês de R$ 24 mil em vendas igual a um de R$ 860 mil.
    // Pondera cada índice pela base que efetivamente o gera -- PMRV pelo faturamento do mês, PMPF
    // pelas contas a pagar geradas no mês, PMRE pelo valor comprado no mês -- e deriva o ciclo de
    // caixa/operacional dos componentes ponderados (mais consistente do que ponderar o ciclo à parte).
    let mgrWeighted = null
    if (mgrMonths.length) {
      const weightedAvg = (valueKey, weightKey) => {
        const totalWeight = mgrMonths.reduce((s, m) => s + Number(m[weightKey] || 0), 0)
        if (!totalWeight) return 0
        return mgrMonths.reduce((s, m) => s + Number(m[valueKey] || 0) * Number(m[weightKey] || 0), 0) / totalWeight
      }
      const pmrv = weightedAvg('pmrv', 'vendas_total')
      const pmpf = weightedAvg('pmpf', 'ap_geradas_mes')
      const pmre = weightedAvg('pmre', 'compras_valor')
      mgrWeighted = { pmrv, pmpf, pmre, cicloCaixa: pmrv + pmre - pmpf, cicloOperacional: pmrv + pmre }
    }

    const grupoTotais = new Map()
    let receitaCaixaOperacional = 0
    let despesaCaixaOperacional = 0
    contasPeriodo.forEach(row => {
      if (CONTAS_NEUTRAS.has(row.conta)) return
      if (row.tipo === 'receita') { receitaCaixaOperacional += Number(row.debito); return }
      const valor = Number(row.credito)
      despesaCaixaOperacional += valor
      grupoTotais.set(row.grupo, (grupoTotais.get(row.grupo) || 0) + valor)
    })
    const despesasPorGrupo = [...grupoTotais.entries()]
      .map(([grupo, value]) => ({ name: GRUPO_LABEL[grupo] || grupo, value }))
      .sort((a, b) => b.value - a.value)
    const custoFinanceiro = grupoTotais.get('BANCARIAS') || 0

    return {
      months, last, prev, totalReceitas, totalCustosVariaveis, totalMargem, totalCustosFixos, custosFixosMedioMensal, totalResultadoLiquido,
      avgMargemPct: totalReceitas ? totalMargem / totalReceitas * 100 : 0,
      balanco, balanceMetrics, competencia, closing,
      despesasPorGrupo, receitaCaixaOperacional, despesaCaixaOperacional,
      resultadoCaixaOperacional: receitaCaixaOperacional - despesaCaixaOperacional,
      peMedio, mesesAcimaPE, concentracaoTop2Pct, top2Labels,
      payrollTotal, payrollPct: totalReceitas ? payrollTotal / totalReceitas * 100 : 0,
      custoFinanceiro,
      mgrMonths, mgrLast, mgrFirst, mgrWeighted,
      aporteRecebido, devolucaoAporte, netAporteMovimento,
    }
  }, [dre, balancos, contas, closings, managerial])

  const insights = useMemo(() => {
    if (!data?.balanceMetrics) return []
    const { balanceMetrics: bm, last, prev, totalResultadoLiquido } = data
    const list = []
    if (bm.piorFaixa && bm.piorFaixa.gap < 0) list.push({ tone: 'risk', title: `Aperto concentrado em "${bm.piorFaixa.label}": faltam ${shortMoney(Math.abs(bm.piorFaixa.gap))}`, text: `Nessa faixa de vencimento a empresa tem ${shortMoney(bm.piorFaixa.ar)} a receber contra ${shortMoney(bm.piorFaixa.ap)} a pagar. É aqui que o caixa vai apertar primeiro, mesmo que a liquidez total pareça administrável.` })
    if (bm.patrimonioLiquido < 0) list.push({ tone: 'risk', title: `Patrimônio líquido negativo: ${shortMoney(bm.patrimonioLiquido)}`, text: 'Já sem o efeito de aporte/devolução de sócios (movimentação de capital, não resultado). O prejuízo acumulado operacional supera o capital social — a empresa está sendo financiada essencialmente por fornecedores e terceiros.' })
    if (bm.liquidezCorrente < 1) list.push({ tone: 'risk', title: `Liquidez corrente de ${bm.liquidezCorrente.toFixed(2)}x`, text: `Para cada R$ 1,00 de contas a pagar até 360 dias, a empresa tem R$ ${bm.liquidezCorrente.toFixed(2)} em caixa, recebíveis e estoque. O descoberto é de ${shortMoney(bm.passivoCirculante - bm.ativoCirculante)}.` })
    if (bm.apVencidoTotal > 0) list.push({ tone: bm.apVencidoPct > 5 ? 'risk' : 'warn', title: `${shortMoney(bm.apVencidoTotal)} em contas a pagar vencidas`, text: `Equivale a ${pct(bm.apVencidoPct)} do total a pagar, contra apenas ${pct(bm.arVencidoPct)} de inadimplência nos recebíveis — a empresa está mais atrasada com fornecedores do que seus clientes estão com ela.` })
    if (data.mgrLast) {
      const { pmrv, pmpf, ciclo_caixa: cicloCaixa } = data.mgrLast
      if (data.mgrFirst && pmrv !== data.mgrFirst.pmrv) list.push({ tone: pmrv > data.mgrFirst.pmrv ? 'warn' : 'ok', title: `Prazo de recebimento ${pmrv > data.mgrFirst.pmrv ? 'subiu' : 'caiu'} de ${data.mgrFirst.pmrv} para ${pmrv} dias`, text: `PMRV (Relatório Gerencial do Ultra) foi de ${data.mgrFirst.pmrv} dias em ${data.mgrFirst.label}/26 para ${pmrv} dias em ${data.mgrLast.label}/26. ${pmrv > data.mgrFirst.pmrv ? 'A empresa está demorando mais para receber dos clientes.' : 'A empresa está recebendo mais rápido dos clientes.'}` })
      list.push({ tone: cicloCaixa < 0 ? 'ok' : 'warn', title: `Ciclo de caixa de ${cicloCaixa} dias em ${data.mgrLast.label}/26`, text: `PMRV ${pmrv} dias + PMRE ${data.mgrLast.pmre} dias − PMPF ${pmpf} dias. ${cicloCaixa < 0 ? 'Recebe e gira estoque mais rápido do que paga fornecedores.' : 'Precisa financiar esse número de dias de operação com capital próprio ou de terceiros.'}` })
    }
    if (prev && last.ResultadoOperacional > 0 && prev.ResultadoOperacional <= 0) list.push({ tone: 'ok', title: `${last.label}/26 fechou com resultado operacional positivo`, text: `Depois de meses no vermelho, a operação voltou a superar o ponto de equilíbrio (${shortMoney(last['Ponto de Equilíbrio'])}) com margem de contribuição de ${pct(last.margemPct)}.` })
    if (totalResultadoLiquido < 0 && last['Resultado Líquido'] > 0) list.push({ tone: 'warn', title: 'Resultado acumulado ainda negativo', text: `Mesmo com ${last.label}/26 positivo, o acumulado do período segue em ${shortMoney(totalResultadoLiquido)}. A recuperação de um mês ainda não compensa os anteriores.` })
    if (data.concentracaoTop2Pct > 50) list.push({ tone: 'warn', title: `${data.top2Labels} concentram ${pct(data.concentracaoTop2Pct)} da receita`, text: 'Dois meses puxam a maior parte do faturamento do período — indício de vendas pontuais (grandes pedidos) em vez de um ritmo comercial recorrente. Vale entender se dá pra reproduzir isso todo mês.' })
    list.push({ tone: data.mesesAcimaPE >= data.months.length / 2 ? 'ok' : 'warn', title: `${data.mesesAcimaPE} de ${data.months.length} meses fecharam acima do ponto de equilíbrio`, text: `Ponto de equilíbrio médio estimado em ${shortMoney(data.peMedio)}/mês. ${data.mesesAcimaPE < data.months.length ? 'Nos demais meses a receita não cobriu os custos fixos do período.' : 'Todos os meses cobriram os custos fixos do período.'}` })
    return list
  }, [data])

  if (loading) return <div style={{ flex: 1, overflow: 'hidden', display: 'flex', flexDirection: 'column' }}><Topbar title="Financeiro" subtitle="Fechamento contábil, DRE, balanço e liquidez" /><div className="page"><div className="empty">Carregando dados do fechamento...</div></div></div>

  if (!data) return <div style={{ flex: 1, overflow: 'hidden', display: 'flex', flexDirection: 'column' }}><Topbar title="Financeiro" subtitle="Fechamento contábil, DRE, balanço e liquidez" /><div className="page"><div className="empty">Nenhum fechamento carregado ainda. Envie o Balanço, o Balancete e o DRE do período para carregarmos o painel.</div></div></div>

  const { balanco, balanceMetrics: bm } = data

  return <div style={{ flex: 1, overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>
    <Topbar title="Financeiro" subtitle="Fechamento contábil, DRE, balanço e liquidez — dados enviados manualmente do ERP Ultra" />
    <div className="page macro-page" style={{ overflowY: 'auto' }}>

      <section className="macro-toolbar">
        <div><span className="pill pill-orange">Fechamento de {dateBR(data.competencia)}</span></div>
        <span>{data.closing?.notes ? 'Carga manual (API do Ultra não expõe dados financeiros)' : ''} · atualizado em {data.closing ? new Date(data.closing.created_at).toLocaleDateString('pt-BR') : '—'}</span>
      </section>

      <section className="macro-hero">
        <header>
          <span>Leitura executiva</span>
          <h2>{data.totalResultadoLiquido < 0 && data.last['Resultado Líquido'] > 0 ? 'Prejuízo acumulado, mês mais recente no azul' : data.totalResultadoLiquido < 0 ? 'Resultado acumulado negativo' : 'Resultado acumulado positivo'}</h2>
          <p>{data.months[0].label}–{data.last.label}/26: {shortMoney(data.totalReceitas)} em receita, margem média de {pct(data.avgMargemPct)}, resultado líquido de {shortMoney(data.totalResultadoLiquido)}.</p>
        </header>
        <div className="macro-hero-flow">
          <div><span>Receita acumulada</span><strong>{shortMoney(data.totalReceitas)}</strong><small>{data.months.length} meses (regime de competência)</small></div>
          <IconArrowRight size={19} />
          <div><span>Custos totais</span><strong>{shortMoney(data.totalCustosVariaveis + data.totalCustosFixos)}</strong><small>variáveis + fixos</small></div>
          <IconArrowRight size={19} />
          <div><span>Resultado líquido</span><strong style={{ color: data.totalResultadoLiquido >= 0 ? '#70DF97' : '#FF8B82' }}>{shortMoney(data.totalResultadoLiquido)}</strong><small>acumulado no período</small></div>
        </div>
      </section>

      <div className="macro-section-title"><div><span>Saúde financeira</span><h3>Liquidez, endividamento e capital de giro</h3></div><small>posição em {dateBR(data.competencia)}</small></div>
      <section className="dash-kpi-row">
        <Kpi icon={IconScale} label="Liquidez corrente" value={`${bm.liquidezCorrente.toFixed(2)}x`} note="ativo circulante ÷ passivo até 360 dias" tone={bm.liquidezCorrente < 1 ? 'risk' : 'ok'} />
        <Kpi icon={IconScale} label="Liquidez seca" value={`${bm.liquidezSeca.toFixed(2)}x`} note="sem contar estoque" tone={bm.liquidezSeca < 1 ? 'risk' : 'ok'} />
        <Kpi icon={IconWallet} label="Capital de giro líquido" value={shortMoney(bm.capitalGiroLiquido)} note="ativo circulante − passivo até 360 dias" tone={bm.capitalGiroLiquido < 0 ? 'risk' : 'ok'} />
        <Kpi icon={IconBuildingBank} label="Patrimônio líquido" value={shortMoney(bm.patrimonioLiquido)} note="lucro/prejuízo acumulado, sem aporte de sócios" tone={bm.patrimonioLiquido < 0 ? 'risk' : 'ok'} />
        <Kpi icon={IconCreditCard} label="Endividamento" value={pct(bm.endividamento)} note="contas a pagar ÷ ativo total" tone={bm.endividamento > 100 ? 'risk' : ''} />
      </section>

      {data.netAporteMovimento !== 0 && <div className="dash-note-banner">
        <IconWallet size={17} />
        <div>
          <strong>Aporte de sócios não entra nos indicadores acima</strong>
          <span>São movimentações de capital pra bancar o capital de giro, não resultado operacional — por isso tiramos o efeito do patrimônio líquido e de todas as outras análises. No período carregado: {money(data.aporteRecebido)} recebido de aporte e {money(data.devolucaoAporte)} devolvido aos sócios, líquido de {data.netAporteMovimento >= 0 ? '+' : ''}{money(data.netAporteMovimento)}. Isso é só a movimentação do período — não sei quanto ainda falta devolver no total, porque não tenho o saldo histórico de aporte anterior a este fechamento.</span>
        </div>
      </div>}

      <div className="macro-section-title macro-section-title-compact"><div><span>Ciclo de caixa</span><h3>Prazos médios reais (Relatório Gerencial do Ultra) e inadimplência</h3></div>{data.mgrLast && <small>média ponderada do período · {data.mgrLast.label}/26 no detalhe</small>}</div>
      {data.mgrWeighted ? <>
        <section className="dash-kpi-row">
          <Kpi icon={IconInvoice} label="Prazo médio de recebimento" value={`${data.mgrWeighted.pmrv.toFixed(0)} dias`} note={`PMRV ponderado pelo faturamento · ${data.mgrLast.label}/26 foi ${data.mgrLast.pmrv}`} />
          <Kpi icon={IconPackage} label="Prazo médio de estoque" value={`${data.mgrWeighted.pmre.toFixed(0)} dias`} note={`PMRE ponderado pelas compras · ${data.mgrLast.label}/26 foi ${data.mgrLast.pmre}`} />
          <Kpi icon={IconCreditCard} label="Prazo médio de pagamento" value={`${data.mgrWeighted.pmpf.toFixed(0)} dias`} note={`PMPF ponderado pelas contas geradas · ${data.mgrLast.label}/26 foi ${data.mgrLast.pmpf}`} />
          <Kpi icon={IconClockDollar} label="Ciclo de caixa" value={`${data.mgrWeighted.cicloCaixa.toFixed(0)} dias`} note={`ciclo operacional de ${data.mgrWeighted.cicloOperacional.toFixed(0)} dias · médias ponderadas`} tone={data.mgrWeighted.cicloCaixa < 0 ? 'ok' : ''} />
          <Kpi icon={IconInvoice} label="Recebíveis vencidos" value={pct(bm.arVencidoPct)} note={`${money(balanco.contas_receber_vencido)} em atraso`} />
          <Kpi icon={IconCreditCard} label="Contas a pagar vencidas" value={pct(bm.apVencidoPct)} note={`${money(bm.apVencidoTotal)} em atraso`} tone={bm.apVencidoPct > 5 ? 'risk' : ''} />
        </section>
        <p style={{ fontSize: 11.5, color: 'var(--text-faint)', margin: '-4px 2px 0', lineHeight: 1.5 }}>Média ponderada, não simples: cada índice pesa mais nos meses em que a base que o gera foi maior (PMRV pelo faturamento, PMPF pelas contas a pagar geradas, PMRE pelo valor comprado no mês) — assim um mês de R$ 24 mil em vendas não pesa igual a um de R$ 860 mil.</p>
        <section className="chart-card">
          <div className="chart-head"><div><span className="chart-title">Evolução dos prazos e do ciclo de caixa</span><div className="chart-subtitle">PMRV, PMPF e ciclo de caixa mês a mês — dados reais do Ultra</div></div></div>
          <ResponsiveContainer width="100%" height={230}>
            <LineChart data={data.mgrMonths} margin={{ top: 10, right: 18, left: 4, bottom: 4 }}>
              <CartesianGrid stroke="#E9E4DE" strokeDasharray="2 7" vertical={false} />
              <XAxis dataKey="label" tickLine={false} axisLine={false} />
              <YAxis tickLine={false} axisLine={false} tickFormatter={value => `${value}d`} width={40} />
              <Tooltip formatter={(value, name) => [`${value} dias`, name]} />
              <Line type="monotone" dataKey="pmrv" name="PMRV (recebimento)" stroke="#E87722" strokeWidth={2.4} dot={{ r: 3 }} />
              <Line type="monotone" dataKey="pmpf" name="PMPF (pagamento)" stroke="#426A8C" strokeWidth={2.4} dot={{ r: 3 }} />
              <Line type="monotone" dataKey="ciclo_caixa" name="Ciclo de caixa" stroke="#23864A" strokeWidth={2.4} dot={{ r: 3 }} />
            </LineChart>
          </ResponsiveContainer>
        </section>
      </> : <section className="dash-kpi-row">
        <Kpi icon={IconInvoice} label="Recebíveis vencidos" value={pct(bm.arVencidoPct)} note={`${money(balanco.contas_receber_vencido)} em atraso`} />
        <Kpi icon={IconCreditCard} label="Contas a pagar vencidas" value={pct(bm.apVencidoPct)} note={`${money(bm.apVencidoTotal)} em atraso`} tone={bm.apVencidoPct > 5 ? 'risk' : ''} />
      </section>}

      <div className="macro-section-title macro-section-title-compact"><div><span>Estrutura de custos</span><h3>Rentabilidade e peso da folha</h3></div></div>
      <section className="dash-kpi-row">
        <Kpi icon={IconPercentage} label="Margem de contribuição" value={pct(data.avgMargemPct)} note={`acumulado do ano · ${shortMoney(data.totalMargem)}`} />
        <Kpi icon={IconPercentage} label="Margem líquida" value={pct(data.totalReceitas ? data.totalResultadoLiquido / data.totalReceitas * 100 : 0)} note={`acumulado do ano · ${shortMoney(data.totalResultadoLiquido)}`} tone={data.totalResultadoLiquido >= 0 ? 'ok' : 'risk'} />
        <Kpi icon={IconUsers} label="Folha sobre receita" value={pct(data.payrollPct)} note={`${shortMoney(data.payrollTotal)} acumulado no período`} tone={data.payrollPct > 25 ? 'risk' : ''} />
        <Kpi icon={IconCoins} label="Custo financeiro acumulado" value={shortMoney(data.custoFinanceiro)} note="juros, IOF e tarifas bancárias" />
        <Kpi icon={IconCoins} label="Custos fixos totais" value={shortMoney(data.totalCustosFixos)} note={`soma de ${data.months.length} meses`} />
        <Kpi icon={IconCoins} label="Custos fixos médios" value={shortMoney(data.custosFixosMedioMensal)} note={`${shortMoney(data.totalCustosFixos)} ÷ ${data.months.length} meses`} />
        <Kpi icon={IconScale} label="Ponto de equilíbrio médio" value={shortMoney(data.peMedio)} note="custo fixo médio ÷ margem de contribuição do período" tone={data.mesesAcimaPE >= data.months.length / 2 ? 'ok' : 'risk'} />
      </section>

      <div className="macro-section-title macro-section-title-compact"><div><span>Evolução</span><h3>DRE mensal e margens</h3></div><small>{data.mesesAcimaPE} de {data.months.length} meses acima do ponto de equilíbrio</small></div>
      <section className="chart-card">
        <div className="chart-head"><div><span className="chart-title">DRE mensal</span><div className="chart-subtitle">Receita, custos totais e resultado líquido — regime de competência</div></div></div>
        <ResponsiveContainer width="100%" height={310}>
          <ComposedChart data={data.months} margin={{ top: 10, right: 18, left: 4, bottom: 4 }}>
            <CartesianGrid stroke="#E9E4DE" strokeDasharray="2 7" vertical={false} />
            <XAxis dataKey="label" tickLine={false} axisLine={false} />
            <YAxis tickLine={false} axisLine={false} tickFormatter={value => `${Math.round(value / 1000)}k`} width={54} />
            <Tooltip formatter={(value, name) => [money(value), name]} />
            <Legend wrapperStyle={{ fontSize: 11 }} />
            <Bar dataKey="Receita" fill="#E87722" radius={[6, 6, 0, 0]} barSize={26} />
            <Bar dataKey="Custos" fill="#292623" radius={[6, 6, 0, 0]} barSize={26} />
            <Line type="monotone" dataKey="Resultado Líquido" stroke="#23864A" strokeWidth={2.6} dot={{ r: 3.5 }} />
            <ReferenceLine y={data.peMedio} stroke="#A79C92" strokeWidth={1.8} strokeDasharray="5 6" label={{ value: `PE médio: ${shortMoney(data.peMedio)}`, position: 'insideBottomRight', fill: '#8A8178', fontSize: 10.5, fontWeight: 600 }} />
          </ComposedChart>
        </ResponsiveContainer>
        <p style={{ fontSize: 11.5, color: 'var(--text-faint)', marginTop: 8, lineHeight: 1.5 }}>Mostramos a <strong>média</strong> do ponto de equilíbrio (custo fixo médio ÷ margem de contribuição do período) em vez do valor mês a mês: em fevereiro a margem de contribuição foi quase nula, o que torna o ponto de equilíbrio individual daquele mês (R$ 15,05 mi) matematicamente extremo e inútil como referência visual.</p>
      </section>
      <div className="dash-chart-trio">
        {[
          { key: 'margemPct', title: 'Margem de contribuição', color: '#E87722' },
          { key: 'liquidaPct', title: 'Margem líquida', color: '#23864A' },
          { key: 'custosFixosPct', title: 'Custos fixos / receita', color: '#426A8C' },
        ].map(serie => <section className="chart-card" key={serie.key}>
          <div className="chart-head"><div><span className="chart-title">{serie.title}</span><div className="chart-subtitle">% da receita, mês a mês</div></div></div>
          <ResponsiveContainer width="100%" height={190}>
            <LineChart data={data.months.map(m => ({ label: m.label, value: serie.key === 'custosFixosPct' ? (m.Receita ? m.CustosFixos / m.Receita * 100 : 0) : m[serie.key] }))} margin={{ top: 6, right: 10, left: 0, bottom: 0 }}>
              <CartesianGrid stroke="#E9E4DE" strokeDasharray="2 7" vertical={false} />
              <XAxis dataKey="label" tickLine={false} axisLine={false} tick={{ fontSize: 10.5 }} />
              <YAxis tickLine={false} axisLine={false} tickFormatter={value => `${Math.round(value)}%`} width={38} />
              <Tooltip formatter={value => `${Number(value).toFixed(1)}%`} />
              <ReferenceLine y={0} stroke="#C9BFB7" />
              <Line type="monotone" dataKey="value" stroke={serie.color} strokeWidth={2.6} dot={{ r: 3.5 }} />
            </LineChart>
          </ResponsiveContainer>
        </section>)}
      </div>

      <div className="macro-section-title macro-section-title-compact"><div><span>Despesas</span><h3>Regime de caixa, acumulado do período</h3></div><Link to="/dre" className="btn btn-ghost btn-sm">Ver DRE mês a mês →</Link></div>
      <section className="dash-main-grid">
        <div className="chart-card dash-chart-large">
          <div className="chart-head"><div><span className="chart-title">Despesas por grupo</span><div className="chart-subtitle">Sem aportes, adiantamentos e empréstimo (entradas/saídas neutras de caixa)</div></div></div>
          <ResponsiveContainer width="100%" height={280}>
            <PieChart>
              <Pie data={data.despesasPorGrupo} dataKey="value" nameKey="name" innerRadius={64} outerRadius={104} paddingAngle={2}>
                {data.despesasPorGrupo.map((entry, index) => <Cell key={entry.name} fill={PIE_COLORS[index % PIE_COLORS.length]} />)}
              </Pie>
              <Tooltip formatter={value => money(value)} />
            </PieChart>
          </ResponsiveContainer>
          <div className="dash-ranking" style={{ marginTop: 6 }}>
            {data.despesasPorGrupo.slice(0, 6).map((item, index) => <div key={item.name} className="dash-ranking-row" style={{ gridTemplateColumns: '12px 1fr auto' }}><span style={{ width: 9, height: 9, borderRadius: 99, background: PIE_COLORS[index % PIE_COLORS.length] }} /><div className="dash-ranking-info"><strong>{item.name}</strong></div><span className="dash-ranking-value">{shortMoney(item.value)}</span></div>)}
          </div>
        </div>
        <div className="chart-card">
          <div className="chart-head"><div><span className="chart-title">Fluxo de caixa operacional</span><div className="chart-subtitle">Mesma base do gráfico ao lado</div></div></div>
          <div className="dash-segment-list" style={{ marginTop: 10 }}>
            <div className="dash-segment-item"><strong>Entradas</strong><span>{money(data.receitaCaixaOperacional)}</span></div>
            <div className="dash-segment-item"><strong>Saídas</strong><span>{money(data.despesaCaixaOperacional)}</span></div>
            <div className="dash-segment-item"><strong>Resultado de caixa</strong><span style={{ color: data.resultadoCaixaOperacional >= 0 ? 'var(--green)' : 'var(--red)', fontWeight: 700 }}>{money(data.resultadoCaixaOperacional)}</span></div>
          </div>
        </div>
      </section>

      {data.mgrLast && <>
        <div className="macro-section-title macro-section-title-compact"><div><span>Contas a receber e a pagar</span><h3>Saldo em aberto mês a mês</h3></div><small>gerado até o fim de cada mês · Relatório Gerencial do Ultra</small></div>
        <section className="chart-card">
          <div className="chart-head"><div><span className="chart-title">Evolução do saldo em aberto</span><div className="chart-subtitle">Quanto mais rápido o saldo a pagar cresce que o a receber, mais a operação depende de fornecedores</div></div></div>
          <ResponsiveContainer width="100%" height={260}>
            <LineChart data={data.mgrMonths} margin={{ top: 10, right: 18, left: 4, bottom: 4 }}>
              <CartesianGrid stroke="#E9E4DE" strokeDasharray="2 7" vertical={false} />
              <XAxis dataKey="label" tickLine={false} axisLine={false} />
              <YAxis tickLine={false} axisLine={false} tickFormatter={value => `${Math.round(value / 1000)}k`} width={54} />
              <Tooltip formatter={(value, name) => [money(value), name]} />
              <Legend wrapperStyle={{ fontSize: 11 }} />
              <Line type="monotone" dataKey="ar_geradas_ate" name="Contas a receber em aberto" stroke="#426A8C" strokeWidth={2.6} dot={{ r: 3.5 }} />
              <Line type="monotone" dataKey="ap_geradas_ate" name="Contas a pagar em aberto" stroke="#C93A32" strokeWidth={2.6} dot={{ r: 3.5 }} />
            </LineChart>
          </ResponsiveContainer>
        </section>
      </>}

      <div className="macro-section-title macro-section-title-compact"><div><span>Balanço patrimonial</span><h3>Composição de ativo e passivo, faixa a faixa</h3></div></div>
      <section className="dash-two-col">
        <div className="card">
          <div className="dash-card-head"><h3>Ativo</h3><small>{money(balanco.ativo_total)}</small></div>
          <div className="dash-stat-duo">
            <div className="dash-stat-mini"><span>Disponibilidades</span><strong>{money(balanco.disponibilidades)}</strong></div>
            <div className="dash-stat-mini"><span>Estoque</span><strong>{money(balanco.estoque)}</strong></div>
          </div>
          <div className="dash-segment-head">Contas a receber — {money(balanco.contas_receber_total)}</div>
          <div className="dash-segment-list">
            {[
              { label: 'Vencido', value: balanco.contas_receber_vencido, color: '#C93A32' },
              { label: 'A vencer até 90 dias', value: balanco.contas_receber_a_vencer_curto, color: '#C87812' },
              { label: 'A vencer até 360 dias', value: balanco.contas_receber_a_vencer_medio, color: '#426A8C' },
            ].map(seg => <div key={seg.label} className="dash-segment-item"><strong>{seg.label}</strong><span>{money(seg.value)} · {pct(balanco.contas_receber_total ? Number(seg.value) / Number(balanco.contas_receber_total) * 100 : 0)}</span><div className="dash-segment-bar"><span style={{ width: `${balanco.contas_receber_total ? Number(seg.value) / Number(balanco.contas_receber_total) * 100 : 0}%`, background: seg.color }} /></div></div>)}
          </div>
        </div>
        <div className="card">
          <div className="dash-card-head"><h3>Contas a pagar</h3><small>{money(bm.contasPagarTotalAjustado)}</small></div>
          <div className="dash-segment-list">
            {[
              { label: 'Vencido', value: Number(balanco.contas_pagar_vencido_curto) + Number(balanco.contas_pagar_vencido_medio), color: '#C93A32' },
              { label: 'A vencer até 90 dias', value: balanco.contas_pagar_a_vencer_curto, color: '#C87812' },
              { label: 'A vencer até 360 dias', value: bm.contasPagarMedioAjustado, color: '#426A8C' },
              { label: 'A vencer longo prazo', value: balanco.contas_pagar_a_vencer_longo, color: '#A79C92' },
            ].map(seg => <div key={seg.label} className="dash-segment-item"><strong>{seg.label}</strong><span>{money(seg.value)} · {pct(bm.contasPagarTotalAjustado ? Number(seg.value) / bm.contasPagarTotalAjustado * 100 : 0)}</span><div className="dash-segment-bar"><span style={{ width: `${bm.contasPagarTotalAjustado ? Number(seg.value) / bm.contasPagarTotalAjustado * 100 : 0}%`, background: seg.color }} /></div></div>)}
          </div>
        </div>
      </section>

      {bm.aporteADevolverAP > 0 && <div className="dash-note-banner">
        <IconWallet size={17} />
        <div>
          <strong>Contas a pagar acima já exclui {money(bm.aporteADevolverAP)} de aporte a devolver aos sócios</strong>
          <span>Esse valor está lançado no Ultra como conta a pagar, na faixa "até 360 dias" — mas é devolução de capital, não dívida operacional. O total oficial do balanço é {money(balanco.contas_pagar_total)}; aqui em todas as análises (liquidez, endividamento, aperto de caixa por faixa) usamos {money(bm.contasPagarTotalAjustado)}, sem esse valor.</span>
        </div>
      </div>}

      <div className="macro-section-title macro-section-title-compact"><div><span>Aperto de caixa</span><h3>Contas a receber vs. a pagar, faixa a faixa</h3></div><small>faixa com maior descoberto: {bm.piorFaixa.label}</small></div>
      <section className="chart-card">
        <div className="chart-head"><div><span className="chart-title">Onde o caixa aperta primeiro</span><div className="chart-subtitle">Compara o que entra e o que sai em cada janela de vencimento — não a liquidez total, mas a liquidez por prazo</div></div></div>
        <ResponsiveContainer width="100%" height={260}>
          <ComposedChart data={bm.buckets} margin={{ top: 10, right: 18, left: 4, bottom: 4 }}>
            <CartesianGrid stroke="#E9E4DE" strokeDasharray="2 7" vertical={false} />
            <XAxis dataKey="label" tickLine={false} axisLine={false} />
            <YAxis tickLine={false} axisLine={false} tickFormatter={value => `${Math.round(value / 1000)}k`} width={54} />
            <Tooltip formatter={(value, name) => [money(value), name]} />
            <Legend wrapperStyle={{ fontSize: 11 }} />
            <Bar dataKey="ar" name="A receber" fill="#426A8C" radius={[6, 6, 0, 0]} barSize={30} />
            <Bar dataKey="ap" name="A pagar" fill="#C93A32" radius={[6, 6, 0, 0]} barSize={30} />
          </ComposedChart>
        </ResponsiveContainer>
        <div className="dash-gap-row">
          {bm.buckets.map(b => <div key={b.label} className={`dash-gap-item ${b.gap < 0 ? 'negative' : 'positive'}`}><span>{b.label}</span><strong>{b.gap >= 0 ? '+' : ''}{shortMoney(b.gap)}</strong></div>)}
        </div>
      </section>

      <div className="macro-section-title macro-section-title-compact"><div><span>Resumo</span><h3>Pontos de atenção</h3></div></div>
      <div className="dash-insights-card">
        <div className="dash-insights-list dash-insights-list-wide">
          {insights.length ? insights.map(item => <Insight key={item.title} {...item} />) : <div className="empty">Sem alertas para este fechamento.</div>}
        </div>
      </div>

      <div className="dre-cta card" style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 16 }}>
        <div><strong style={{ display: 'block', fontSize: 14, marginBottom: 3 }}>Quer o DRE mês a mês, por bimestre, trimestre ou ano?</strong><span style={{ color: 'var(--text-dim)', fontSize: 12.5 }}>A página DRE tem o demonstrativo completo, nível de conta, com filtro de período.</span></div>
        <Link to="/dre" className="btn btn-primary btn-sm">Abrir DRE →</Link>
      </div>

    </div>
  </div>
}
