import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import {
  IconAlertTriangle, IconArrowRight, IconBuildingBank,
  IconClockDollar, IconCoins, IconCreditCard, IconInvoice, IconPackage, IconPercentage,
  IconScale, IconUsers, IconWallet,
} from '@tabler/icons-react'
import { Cell, Pie, PieChart, ResponsiveContainer, Tooltip } from 'recharts'
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
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    async function load() {
      const [dreRes, balancoRes, contasRes, closingsRes] = await Promise.all([
        supabaseAdmin.from('finance_dre_monthly').select('*').order('ano').order('mes'),
        supabaseAdmin.from('finance_balanco').select('*').order('competencia_date', { ascending: false }),
        supabaseAdmin.from('finance_balancete_accounts').select('*'),
        supabaseAdmin.from('finance_closings').select('*').order('competencia_date', { ascending: false }),
      ])
      setDre(dreRes.data || [])
      setBalancos(balancoRes.data || [])
      setContas(contasRes.data || [])
      setClosings(closingsRes.data || [])
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
    const mediaReceitaMensal = totalReceitas / months.length
    const mediaCmvMensal = dre.reduce((s, r) => s + Number(r.custos_variaveis_detail?.cmv || 0), 0) / months.length

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
      const ativoCirculante = Number(balanco.disponibilidades) + Number(balanco.contas_receber_total) + Number(balanco.estoque)
      const passivoCirculante = Number(balanco.contas_pagar_vencido_curto) + Number(balanco.contas_pagar_vencido_medio) + Number(balanco.contas_pagar_a_vencer_curto) + Number(balanco.contas_pagar_a_vencer_medio)
      const passivoNaoCirculante = Number(balanco.contas_pagar_a_vencer_longo)
      const liquidezCorrente = passivoCirculante ? ativoCirculante / passivoCirculante : 0
      const liquidezSeca = passivoCirculante ? (ativoCirculante - Number(balanco.estoque)) / passivoCirculante : 0
      const endividamento = Number(balanco.ativo_total) ? Number(balanco.contas_pagar_total) / Number(balanco.ativo_total) * 100 : 0
      const dso = mediaReceitaMensal ? Number(balanco.contas_receber_total) / mediaReceitaMensal * 30 : 0
      const dio = mediaCmvMensal ? Number(balanco.estoque) / mediaCmvMensal * 30 : 0
      const dpo = mediaCmvMensal ? Number(balanco.contas_pagar_total) / mediaCmvMensal * 30 : 0
      const arVencidoPct = Number(balanco.contas_receber_total) ? Number(balanco.contas_receber_vencido) / Number(balanco.contas_receber_total) * 100 : 0
      const apVencidoTotal = Number(balanco.contas_pagar_vencido_curto) + Number(balanco.contas_pagar_vencido_medio)
      const apVencidoPct = Number(balanco.contas_pagar_total) ? apVencidoTotal / Number(balanco.contas_pagar_total) * 100 : 0
      const apLongoPct = Number(balanco.contas_pagar_total) ? passivoNaoCirculante / Number(balanco.contas_pagar_total) * 100 : 0
      balanceMetrics = {
        ativoCirculante, passivoCirculante, passivoNaoCirculante, liquidezCorrente, liquidezSeca, endividamento,
        dso, dio, dpo, cicloFinanceiro: dso + dio - dpo, arVencidoPct, apVencidoPct, apVencidoTotal, apLongoPct,
        patrimonioLiquido: Number(balanco.lucro_prejuizo_acumulado),
        capitalGiroLiquido: ativoCirculante - passivoCirculante,
      }
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
      months, last, prev, totalReceitas, totalCustosVariaveis, totalMargem, totalCustosFixos, totalResultadoLiquido,
      avgMargemPct: totalReceitas ? totalMargem / totalReceitas * 100 : 0,
      balanco, balanceMetrics, competencia, closing,
      despesasPorGrupo, receitaCaixaOperacional, despesaCaixaOperacional,
      resultadoCaixaOperacional: receitaCaixaOperacional - despesaCaixaOperacional,
      peMedio, mesesAcimaPE, concentracaoTop2Pct, top2Labels,
      payrollTotal, payrollPct: totalReceitas ? payrollTotal / totalReceitas * 100 : 0,
      custoFinanceiro,
    }
  }, [dre, balancos, contas, closings])

  const insights = useMemo(() => {
    if (!data?.balanceMetrics) return []
    const { balanceMetrics: bm, last, prev, totalResultadoLiquido } = data
    const list = []
    if (bm.patrimonioLiquido < 0) list.push({ tone: 'risk', title: `Patrimônio líquido negativo: ${shortMoney(bm.patrimonioLiquido)}`, text: 'O prejuízo acumulado supera o capital social — sob a ótica contábil a empresa opera com passivo a descoberto, financiada essencialmente por fornecedores e terceiros.' })
    if (bm.liquidezCorrente < 1) list.push({ tone: 'risk', title: `Liquidez corrente de ${bm.liquidezCorrente.toFixed(2)}x`, text: `Para cada R$ 1,00 de contas a pagar até 360 dias, a empresa tem R$ ${bm.liquidezCorrente.toFixed(2)} em caixa, recebíveis e estoque. O descoberto é de ${shortMoney(bm.passivoCirculante - bm.ativoCirculante)}.` })
    if (bm.apVencidoTotal > 0) list.push({ tone: bm.apVencidoPct > 5 ? 'risk' : 'warn', title: `${shortMoney(bm.apVencidoTotal)} em contas a pagar vencidas`, text: `Equivale a ${pct(bm.apVencidoPct)} do total a pagar, contra apenas ${pct(bm.arVencidoPct)} de inadimplência nos recebíveis — a empresa está mais atrasada com fornecedores do que seus clientes estão com ela.` })
    if (bm.cicloFinanceiro < 0) list.push({ tone: 'ok', title: `Ciclo financeiro negativo (${Math.round(bm.cicloFinanceiro)} dias)`, text: `Estimativa: recebe de clientes e gira estoque bem mais rápido do que paga fornecedores, o que alivia caixa no curto prazo. Mas ${pct(bm.apLongoPct)} das contas a pagar só vencem em prazo longo — há concentração de dívida à frente.` })
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
          <h2>{data.totalResultadoLiquido < 0 && data.last['Resultado Líquido'] > 0 ? 'Prejuízo acumulado, mas o último mês fechou no azul' : data.totalResultadoLiquido < 0 ? 'Resultado acumulado ainda negativo' : 'Resultado acumulado positivo no período'}</h2>
          <p>De {data.months[0].label} a {data.last.label}/26 a operação somou {shortMoney(data.totalReceitas)} em receita reconhecida, com margem de contribuição média de {pct(data.avgMargemPct)} e resultado líquido acumulado de {shortMoney(data.totalResultadoLiquido)}.</p>
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
        <Kpi icon={IconBuildingBank} label="Patrimônio líquido" value={shortMoney(bm.patrimonioLiquido)} note="lucro/prejuízo acumulado" tone={bm.patrimonioLiquido < 0 ? 'risk' : 'ok'} />
        <Kpi icon={IconCreditCard} label="Endividamento" value={pct(bm.endividamento)} note="contas a pagar ÷ ativo total" tone={bm.endividamento > 100 ? 'risk' : ''} />
      </section>

      <div className="macro-section-title macro-section-title-compact"><div><span>Ciclo de caixa</span><h3>Prazos médios (estimados) e inadimplência</h3></div></div>
      <section className="dash-kpi-row">
        <Kpi icon={IconInvoice} label="Prazo médio de recebimento" value={`${Math.round(bm.dso)} dias`} note="PMR · contas a receber ÷ receita média diária" />
        <Kpi icon={IconPackage} label="Prazo médio de estoque" value={`${Math.round(bm.dio)} dias`} note="PME · estoque ÷ CMV médio diário" />
        <Kpi icon={IconCreditCard} label="Prazo médio de pagamento" value={`${Math.round(bm.dpo)} dias`} note="PMP · contas a pagar ÷ CMV médio diário" />
        <Kpi icon={IconClockDollar} label="Ciclo financeiro" value={`${Math.round(bm.cicloFinanceiro)} dias`} note="PMR + PME − PMP" tone={bm.cicloFinanceiro < 0 ? 'ok' : ''} />
        <Kpi icon={IconInvoice} label="Recebíveis vencidos" value={pct(bm.arVencidoPct)} note={`${money(balanco.contas_receber_vencido)} em atraso`} />
        <Kpi icon={IconCreditCard} label="Contas a pagar vencidas" value={pct(bm.apVencidoPct)} note={`${money(bm.apVencidoTotal)} em atraso`} tone={bm.apVencidoPct > 5 ? 'risk' : ''} />
      </section>

      <div className="macro-section-title macro-section-title-compact"><div><span>Estrutura de custos</span><h3>Rentabilidade e peso da folha</h3></div></div>
      <section className="dash-kpi-row">
        <Kpi icon={IconPercentage} label="Margem de contribuição" value={pct(data.avgMargemPct)} note={`acumulado do ano · ${shortMoney(data.totalMargem)}`} />
        <Kpi icon={IconPercentage} label="Margem líquida" value={pct(data.totalReceitas ? data.totalResultadoLiquido / data.totalReceitas * 100 : 0)} note={`acumulado do ano · ${shortMoney(data.totalResultadoLiquido)}`} tone={data.totalResultadoLiquido >= 0 ? 'ok' : 'risk'} />
        <Kpi icon={IconUsers} label="Folha sobre receita" value={pct(data.payrollPct)} note={`${shortMoney(data.payrollTotal)} acumulado no período`} tone={data.payrollPct > 25 ? 'risk' : ''} />
        <Kpi icon={IconCoins} label="Custo financeiro acumulado" value={shortMoney(data.custoFinanceiro)} note="juros, IOF e tarifas bancárias" />
      </section>

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

      <div className="macro-section-title macro-section-title-compact"><div><span>Balanço patrimonial</span><h3>Composição de ativo e passivo</h3></div></div>
      <section className="dash-bottom-grid">
        <div className="card">
          <div className="dash-card-head"><h3>Ativo</h3><small>{money(balanco.ativo_total)}</small></div>
          <div className="dash-segment-list">
            {[
              { label: 'Disponibilidades', value: balanco.disponibilidades, color: '#E87722' },
              { label: 'Contas a receber', value: balanco.contas_receber_total, color: '#426A8C' },
              { label: 'Estoque', value: balanco.estoque, color: '#C87812' },
            ].map(seg => <div key={seg.label} className="dash-segment-item"><strong>{seg.label}</strong><span>{money(seg.value)} · {pct(Number(seg.value) / Number(balanco.ativo_total) * 100)}</span><div className="dash-segment-bar"><span style={{ width: `${Number(seg.value) / Number(balanco.ativo_total) * 100}%`, background: seg.color }} /></div></div>)}
          </div>
        </div>
        <div className="card">
          <div className="dash-card-head"><h3>Contas a pagar</h3><small>{money(balanco.contas_pagar_total)}</small></div>
          <div className="dash-segment-list">
            {[
              { label: 'Vencido', value: Number(balanco.contas_pagar_vencido_curto) + Number(balanco.contas_pagar_vencido_medio), color: '#C93A32' },
              { label: 'A vencer até 90 dias', value: balanco.contas_pagar_a_vencer_curto, color: '#C87812' },
              { label: 'A vencer até 360 dias', value: balanco.contas_pagar_a_vencer_medio, color: '#426A8C' },
              { label: 'A vencer longo prazo', value: balanco.contas_pagar_a_vencer_longo, color: '#A79C92' },
            ].map(seg => <div key={seg.label} className="dash-segment-item"><strong>{seg.label}</strong><span>{money(seg.value)} · {pct(Number(seg.value) / Number(balanco.contas_pagar_total) * 100)}</span><div className="dash-segment-bar"><span style={{ width: `${Number(seg.value) / Number(balanco.contas_pagar_total) * 100}%`, background: seg.color }} /></div></div>)}
          </div>
        </div>
        <div className="dash-insights-card">
          <div className="dash-card-head"><h3>Pontos de atenção</h3></div>
          <div className="dash-insights-list">
            {insights.length ? insights.map(item => <Insight key={item.title} {...item} />) : <div className="empty">Sem alertas para este fechamento.</div>}
          </div>
        </div>
      </section>

      <div className="dre-cta card" style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 16 }}>
        <div><strong style={{ display: 'block', fontSize: 14, marginBottom: 3 }}>Quer o DRE mês a mês, por bimestre, trimestre ou ano?</strong><span style={{ color: 'var(--text-dim)', fontSize: 12.5 }}>A página DRE tem o demonstrativo completo, nível de conta, com filtro de período.</span></div>
        <Link to="/dre" className="btn btn-primary btn-sm">Abrir DRE →</Link>
      </div>

    </div>
  </div>
}
