import { useEffect, useMemo, useState } from 'react'
import {
  IconAlertTriangle, IconArrowRight, IconBuildingBank,
  IconClockDollar, IconCreditCard, IconInvoice, IconPercentage,
  IconScale,
} from '@tabler/icons-react'
import { Bar, CartesianGrid, Cell, ComposedChart, Line, Pie, PieChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'
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

    return {
      months, last, prev, totalReceitas, totalCustosVariaveis, totalMargem, totalCustosFixos, totalResultadoLiquido,
      avgMargemPct: totalReceitas ? totalMargem / totalReceitas * 100 : 0,
      balanco, balanceMetrics, competencia, closing,
      despesasPorGrupo, receitaCaixaOperacional, despesaCaixaOperacional,
      resultadoCaixaOperacional: receitaCaixaOperacional - despesaCaixaOperacional,
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
        <Kpi icon={IconBuildingBank} label="Patrimônio líquido" value={shortMoney(bm.patrimonioLiquido)} note="lucro/prejuízo acumulado" tone={bm.patrimonioLiquido < 0 ? 'risk' : 'ok'} />
        <Kpi icon={IconCreditCard} label="Endividamento" value={pct(bm.endividamento)} note="contas a pagar ÷ ativo total" tone={bm.endividamento > 100 ? 'risk' : ''} />
        <Kpi icon={IconClockDollar} label="Ciclo financeiro (est.)" value={`${Math.round(bm.cicloFinanceiro)} dias`} note="PMR + PME − PMP, estimado" tone={bm.cicloFinanceiro < 0 ? 'ok' : ''} />
        <Kpi icon={IconInvoice} label="Recebíveis vencidos" value={pct(bm.arVencidoPct)} note={`${money(balanco.contas_receber_vencido)} em atraso`} />
        <Kpi icon={IconCreditCard} label="Contas a pagar vencidas" value={pct(bm.apVencidoPct)} note={`${money(bm.apVencidoTotal)} em atraso`} tone={bm.apVencidoPct > 5 ? 'risk' : ''} />
        <Kpi icon={IconPercentage} label="Margem de contribuição" value={pct(data.last.margemPct)} note={`${data.last.label}/26 · ${shortMoney(data.last.MargemContribuicao)}`} />
      </section>

      <section className="dash-main-grid">
        <div className="chart-card dash-chart-large">
          <div className="chart-head"><div><span className="chart-title">DRE mensal</span><div className="chart-subtitle">Receita, custos totais e resultado líquido — regime de competência</div></div></div>
          <ResponsiveContainer width="100%" height={330}>
            <ComposedChart data={data.months} margin={{ top: 10, right: 18, left: 4, bottom: 4 }}>
              <CartesianGrid stroke="#E9E4DE" strokeDasharray="2 7" vertical={false} />
              <XAxis dataKey="label" tickLine={false} axisLine={false} />
              <YAxis tickLine={false} axisLine={false} tickFormatter={value => `${Math.round(value / 1000)}k`} width={54} />
              <Tooltip formatter={(value, name) => [money(value), name]} />
              <Bar dataKey="Receita" fill="#E87722" radius={[6, 6, 0, 0]} barSize={26} />
              <Bar dataKey="Custos" fill="#292623" radius={[6, 6, 0, 0]} barSize={26} />
              <Line type="monotone" dataKey="Resultado Líquido" stroke="#23864A" strokeWidth={2.6} dot={{ r: 3.5 }} />
              <Line type="monotone" dataKey="Ponto de Equilíbrio" stroke="#A79C92" strokeWidth={1.8} strokeDasharray="5 6" dot={false} />
            </ComposedChart>
          </ResponsiveContainer>
        </div>
        <div className="chart-card">
          <div className="chart-head"><div><span className="chart-title">Despesas — regime de caixa</span><div className="chart-subtitle">Acumulado do período, sem aportes/adiantamentos</div></div></div>
          <ResponsiveContainer width="100%" height={230}>
            <PieChart>
              <Pie data={data.despesasPorGrupo} dataKey="value" nameKey="name" innerRadius={54} outerRadius={86} paddingAngle={2}>
                {data.despesasPorGrupo.map((entry, index) => <Cell key={entry.name} fill={PIE_COLORS[index % PIE_COLORS.length]} />)}
              </Pie>
              <Tooltip formatter={value => money(value)} />
            </PieChart>
          </ResponsiveContainer>
          <div className="dash-ranking" style={{ marginTop: 6 }}>
            {data.despesasPorGrupo.slice(0, 6).map((item, index) => <div key={item.name} className="dash-ranking-row" style={{ gridTemplateColumns: '12px 1fr auto' }}><span style={{ width: 9, height: 9, borderRadius: 99, background: PIE_COLORS[index % PIE_COLORS.length] }} /><div className="dash-ranking-info"><strong>{item.name}</strong></div><span className="dash-ranking-value">{shortMoney(item.value)}</span></div>)}
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

      <div className="macro-section-title macro-section-title-compact"><div><span>Detalhamento</span><h3>DRE mês a mês</h3></div></div>
      <section className="table-wrap">
        <table>
          <thead><tr><th>Mês</th><th style={{ textAlign: 'right' }}>Receita</th><th style={{ textAlign: 'right' }}>Custos variáveis</th><th style={{ textAlign: 'right' }}>Margem contrib.</th><th style={{ textAlign: 'right' }}>% margem</th><th style={{ textAlign: 'right' }}>Custos fixos</th><th style={{ textAlign: 'right' }}>Result. operacional</th><th style={{ textAlign: 'right' }}>Result. líquido</th><th style={{ textAlign: 'right' }}>Ponto de equilíbrio</th><th>Situação</th></tr></thead>
          <tbody>
            {data.months.map(m => <tr key={m.key}>
              <td><strong>{m.label}/26</strong></td>
              <td style={{ textAlign: 'right' }}>{money(m.Receita)}</td>
              <td style={{ textAlign: 'right' }}>{money(m.CustosVariaveis)}</td>
              <td style={{ textAlign: 'right' }}>{money(m.MargemContribuicao)}</td>
              <td style={{ textAlign: 'right' }}>{pct(m.margemPct)}</td>
              <td style={{ textAlign: 'right' }}>{money(m.CustosFixos)}</td>
              <td style={{ textAlign: 'right', color: m.ResultadoOperacional >= 0 ? 'var(--green)' : 'var(--red)' }}>{money(m.ResultadoOperacional)}</td>
              <td style={{ textAlign: 'right', color: m['Resultado Líquido'] >= 0 ? 'var(--green)' : 'var(--red)' }}><strong>{money(m['Resultado Líquido'])}</strong></td>
              <td style={{ textAlign: 'right' }}>{money(m['Ponto de Equilíbrio'])}</td>
              <td><span className={`pill ${m.acimaPE ? 'pill-green' : 'pill-red'}`}>{m.acimaPE ? 'Acima do PE' : 'Abaixo do PE'}</span></td>
            </tr>)}
          </tbody>
        </table>
      </section>

    </div>
  </div>
}
