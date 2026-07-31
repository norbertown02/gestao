import { useEffect, useMemo, useState } from 'react'
import { IconArrowDownRight, IconArrowUpRight, IconChevronDown, IconCoins, IconPercentage, IconReceipt, IconScale, IconTrendingDown, IconTrendingUp } from '@tabler/icons-react'
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
const MESES = ['', 'Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho', 'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro']

// Ordem das linhas segue exatamente o DRE Comparativo por Período do Ultra --
// dentro de cada grupo as contas já vêm alfabéticas no relatório original.
const GRUPO_ORDER = {
  receitas: ['VENDAS'],
  custos_variaveis: ['CUSTO', 'IMPOSTOS', 'COMPRAS', 'FUNCIONAMENTO', 'FUNCIONARIOS', 'VENDAS'],
  custos_fixos: ['ADMINISTRATIVAS', 'BANCARIAS', 'FUNCIONAMENTO', 'FUNCIONARIOS', 'PROPAGANDA E PUBLICIDADE', 'TRANSPORTE', 'TRIBUTARIAS', 'VEICULOS'],
  extra_operacional: ['ADIANTAMENTOS', 'ADMINISTRATIVAS', 'BANCARIAS', 'COMPRAS', 'FUNCIONAMENTO', 'JUROS/MULTAS/DESCONTOS', 'TRIBUTARIAS'],
}

const GRUPO_LABEL = {
  CUSTO: 'Custo (CMV)', IMPOSTOS: 'Impostos sobre venda', COMPRAS: 'Compras', FUNCIONAMENTO: 'Funcionamento',
  FUNCIONARIOS: 'Pessoal', VENDAS: 'Vendas', ADMINISTRATIVAS: 'Administrativas', BANCARIAS: 'Bancárias',
  'PROPAGANDA E PUBLICIDADE': 'Marketing', TRANSPORTE: 'Transporte', TRIBUTARIAS: 'Tributos', VEICULOS: 'Veículos',
  ADIANTAMENTOS: 'Adiantamentos', 'JUROS/MULTAS/DESCONTOS': 'Juros, multas e descontos',
}

function monthRange(type, index) {
  if (type === 'mes') return [index, index]
  if (type === 'bimestre') return [(index - 1) * 2 + 1, index * 2]
  if (type === 'trimestre') return [(index - 1) * 3 + 1, index * 3]
  return [1, 12]
}

function periodLabel(type, year, index) {
  if (type === 'mes') return `${MESES[index]} de ${year}`
  if (type === 'bimestre') return `${index}º bimestre de ${year}`
  if (type === 'trimestre') return `${index}º trimestre de ${year}`
  return `Ano de ${year}`
}

function variation(current, previous) {
  if (!previous) return current ? null : 0
  return ((Number(current || 0) - Number(previous || 0)) / Math.abs(Number(previous))) * 100
}

function Comparison({ current, previous }) {
  const value = variation(current, previous)
  if (value === null) return <small>sem período anterior</small>
  const positive = value >= 0
  const Icon = positive ? IconArrowUpRight : IconArrowDownRight
  return <small className={positive ? 'macro-up' : 'macro-down'}><Icon size={13} />{value >= 0 ? '+' : ''}{value.toFixed(1)}% vs. período anterior</small>
}

function Kpi({ icon: Icon, label, value, current, previous, note, tone = '' }) {
  return <article className={`dash-kpi-card ${tone}`}><Icon size={20} /><span>{label}</span><strong>{value}</strong>{previous !== undefined ? <Comparison current={current} previous={previous} /> : <small>{note}</small>}</article>
}

function aggregate(monthly, accounts, year, start, end) {
  const monthsInRange = monthly.filter(row => row.ano === year && row.mes >= start && row.mes <= end)
  const accountsInRange = accounts.filter(row => row.ano === year && row.mes >= start && row.mes <= end)

  const totals = monthsInRange.reduce((acc, row) => {
    acc.receitas += Number(row.receitas)
    acc.custos_variaveis += Number(row.custos_variaveis)
    acc.margem_contribuicao += Number(row.margem_contribuicao)
    acc.custos_fixos += Number(row.custos_fixos)
    acc.resultado_operacional += Number(row.resultado_operacional)
    acc.extra_operacional += Number(row.extra_operacional)
    acc.resultado_liquido += Number(row.resultado_liquido)
    return acc
  }, { receitas: 0, custos_variaveis: 0, margem_contribuicao: 0, custos_fixos: 0, resultado_operacional: 0, extra_operacional: 0, resultado_liquido: 0 })

  const margemPct = totals.receitas ? totals.margem_contribuicao / totals.receitas : 0
  const pontoEquilibrio = margemPct ? totals.custos_fixos / margemPct : 0

  const bySecao = {}
  ;['receitas', 'custos_variaveis', 'custos_fixos', 'extra_operacional'].forEach(key => { bySecao[key] = { total: 0, grupos: new Map() } })
  accountsInRange.forEach(row => {
    const bucket = bySecao[row.secao]
    if (!bucket) return
    bucket.total += Number(row.valor)
    if (!bucket.grupos.has(row.grupo)) bucket.grupos.set(row.grupo, { total: 0, contas: new Map() })
    const grupo = bucket.grupos.get(row.grupo)
    grupo.total += Number(row.valor)
    grupo.contas.set(row.conta, (grupo.contas.get(row.conta) || 0) + Number(row.valor))
  })

  const cmv = bySecao.custos_variaveis.grupos.get('CUSTO')?.total || 0

  return { ...totals, margemPct, pontoEquilibrio, bySecao, cmv, monthCount: monthsInRange.length }
}

function orderedGrupos(bucket, secaoKey) {
  const order = GRUPO_ORDER[secaoKey] || []
  return [...bucket.grupos.entries()].sort(([a], [b]) => {
    const ia = order.indexOf(a), ib = order.indexOf(b)
    if (ia !== -1 && ib !== -1) return ia - ib
    return a.localeCompare(b, 'pt-BR')
  })
}

// Uma seção inteira (ex.: CUSTOS FIXOS) no fluxo único -- cabeçalho da seção,
// seguido pelos grupos (colapsáveis) e, quando abertos, as contas.
function SectionRows({ title, total, bucket, secaoKey, expanded, onToggle, negative, receitaTotal }) {
  const grupos = orderedGrupos(bucket, secaoKey)
  const secaoPct = receitaTotal ? Math.abs(total) / Math.abs(receitaTotal) * 100 : 0
  return <>
    <div className="dre-section-row">
      <span>{title}</span>
      <span className="dre-line-right"><span className="dre-line-pct">{pct(secaoPct)}</span><strong style={{ color: negative ? 'var(--red)' : 'var(--text)' }}>{money(total)}</strong></span>
    </div>
    {grupos.map(([grupo, data]) => {
      const key = `${secaoKey}:${grupo}`
      const isOpen = expanded.has(key)
      const barPct = total ? Math.min(100, Math.abs(data.total) / Math.abs(total) * 100) : 0
      const grupoPct = receitaTotal ? Math.abs(data.total) / Math.abs(receitaTotal) * 100 : 0
      const contas = [...data.contas.entries()].sort(([a], [b]) => a.localeCompare(b, 'pt-BR'))
      return <div key={key} className="dre-group">
        <button type="button" className="dre-group-row" onClick={() => onToggle(key)}>
          <IconChevronDown size={14} className={`dre-chevron ${isOpen ? 'open' : ''}`} />
          <span>{GRUPO_LABEL[grupo] || grupo}</span>
          <div className="dre-group-bar"><span style={{ width: `${barPct}%` }} /></div>
          <span className="dre-line-pct">{pct(grupoPct)}</span>
          <strong>{money(data.total)}</strong>
        </button>
        {isOpen && <div className="dre-account-list">
          {contas.map(([conta, valor]) => {
            const contaPct = receitaTotal ? Math.abs(valor) / Math.abs(receitaTotal) * 100 : 0
            return <div key={conta} className="dre-account-row"><span>{conta}</span><span className="dre-line-right"><span className="dre-line-pct">{pct(contaPct)}</span><span>{money(valor)}</span></span></div>
          })}
        </div>}
      </div>
    })}
  </>
}

function SubtotalRow({ label, value, receitaTotal, big }) {
  const linePct = receitaTotal ? Math.abs(value) / Math.abs(receitaTotal) * 100 : 0
  return <div className={`dre-subtotal-row ${big ? 'dre-subtotal-row-big' : ''}`}>
    <span>{label}</span>
    <span className="dre-line-right"><span className="dre-line-pct">{pct(linePct)}</span><strong style={{ color: big ? undefined : (value >= 0 ? 'var(--green)' : 'var(--red)') }}>{money(value)}</strong></span>
  </div>
}

export default function DRE() {
  const [monthly, setMonthly] = useState([])
  const [accounts, setAccounts] = useState([])
  const [loading, setLoading] = useState(true)
  const [type, setType] = useState('mes')
  const [year, setYear] = useState(null)
  const [index, setIndex] = useState(null)
  const [expanded, setExpanded] = useState(() => new Set())

  useEffect(() => {
    async function load() {
      const [monthlyRes, accountsRes] = await Promise.all([
        supabaseAdmin.from('finance_dre_monthly').select('*').order('ano').order('mes'),
        supabaseAdmin.from('finance_dre_accounts').select('*'),
      ])
      const monthlyData = monthlyRes.data || []
      setMonthly(monthlyData)
      setAccounts(accountsRes.data || [])
      if (monthlyData.length) {
        const last = monthlyData[monthlyData.length - 1]
        setYear(last.ano)
        setIndex(last.mes)
      }
      setLoading(false)
    }
    load()
  }, [])

  const years = useMemo(() => [...new Set(monthly.map(row => row.ano))].sort((a, b) => b - a), [monthly])
  const range = useMemo(() => year ? monthRange(type, index) : [1, 1], [type, index, year])
  const current = useMemo(() => year ? aggregate(monthly, accounts, year, range[0], range[1]) : null, [monthly, accounts, year, range])
  const previous = useMemo(() => {
    if (!year) return null
    const size = range[1] - range[0] + 1
    const prevStart = range[0] - size
    const prevEnd = range[1] - size
    if (prevStart < 1) return null
    return aggregate(monthly, accounts, year, prevStart, prevEnd)
  }, [monthly, accounts, year, range])

  function toggle(key) {
    setExpanded(prev => {
      const next = new Set(prev)
      if (next.has(key)) next.delete(key); else next.add(key)
      return next
    })
  }

  const counts = { mes: 12, bimestre: 6, trimestre: 4, ano: 1 }
  const labels = { mes: 'Mês', bimestre: 'Bimestre', trimestre: 'Trimestre', ano: 'Ano' }

  if (loading || year === null) return <div style={{ flex: 1, overflow: 'hidden', display: 'flex', flexDirection: 'column' }}><Topbar title="DRE" subtitle="Demonstrativo de resultado por período" /><div className="page"><div className="empty">{loading ? 'Carregando DRE...' : 'Nenhum fechamento carregado ainda.'}</div></div></div>

  return <div style={{ flex: 1, overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>
    <Topbar title="DRE" subtitle="Demonstrativo de resultado por período — nível de conta, igual ao relatório do Ultra" />
    <div className="page macro-page" style={{ overflowY: 'auto' }}>

      <section className="macro-toolbar">
        <div>
          <select value={year} onChange={event => setYear(Number(event.target.value))}>{years.map(value => <option key={value}>{value}</option>)}</select>
          <select value={type} onChange={event => { setType(event.target.value); setIndex(1) }}>{Object.entries(labels).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select>
          {type !== 'ano' && <select value={index} onChange={event => setIndex(Number(event.target.value))}>{Array.from({ length: counts[type] }, (_, i) => i + 1).map(value => <option value={value} key={value}>{type === 'mes' ? MESES[value] : `${value}º ${labels[type].toLowerCase()}`}</option>)}</select>}
        </div>
        <span>{periodLabel(type, year, index)} · {current.monthCount} {current.monthCount === 1 ? 'mês com dados' : 'meses com dados'}</span>
      </section>

      <section className="dash-kpi-row">
        <Kpi icon={IconReceipt} label="Receita" value={shortMoney(current.receitas)} current={current.receitas} previous={previous?.receitas} />
        <Kpi icon={IconCoins} label="CMV" value={shortMoney(current.cmv)} current={current.cmv} previous={previous?.cmv} />
        <Kpi icon={IconCoins} label="Custos fixos" value={shortMoney(current.custos_fixos)} current={current.custos_fixos} previous={previous?.custos_fixos} />
        <Kpi icon={IconPercentage} label="Margem de contribuição" value={pct(current.margemPct * 100)} note={shortMoney(current.margem_contribuicao)} />
        <Kpi icon={current.resultado_operacional >= 0 ? IconTrendingUp : IconTrendingDown} label="Resultado operacional" value={shortMoney(current.resultado_operacional)} current={current.resultado_operacional} previous={previous?.resultado_operacional} tone={current.resultado_operacional >= 0 ? 'ok' : 'risk'} />
        <Kpi icon={current.resultado_liquido >= 0 ? IconTrendingUp : IconTrendingDown} label="Resultado líquido" value={shortMoney(current.resultado_liquido)} current={current.resultado_liquido} previous={previous?.resultado_liquido} tone={current.resultado_liquido >= 0 ? 'ok' : 'risk'} />
        <Kpi icon={IconScale} label="Ponto de equilíbrio" value={shortMoney(current.pontoEquilibrio)} note={current.receitas >= current.pontoEquilibrio ? 'receita acima do PE do período' : 'receita abaixo do PE do período'} tone={current.receitas >= current.pontoEquilibrio ? 'ok' : 'risk'} />
      </section>

      <div className="macro-section-title macro-section-title-compact"><div><span>Demonstrativo</span><h3>{periodLabel(type, year, index)}</h3></div><small>clique num grupo para abrir as contas · % da receita do período</small></div>

      <div className="dre-flow">
        <SectionRows title="RECEITAS" total={current.receitas} bucket={current.bySecao.receitas} secaoKey="receitas" expanded={expanded} onToggle={toggle} receitaTotal={current.receitas} />
        <SectionRows title="CUSTOS VARIÁVEIS" total={current.custos_variaveis} bucket={current.bySecao.custos_variaveis} secaoKey="custos_variaveis" expanded={expanded} onToggle={toggle} negative receitaTotal={current.receitas} />
        <SubtotalRow label="MARGEM DE CONTRIBUIÇÃO (1 − 2)" value={current.margem_contribuicao} receitaTotal={current.receitas} />
        <SectionRows title="CUSTOS FIXOS" total={current.custos_fixos} bucket={current.bySecao.custos_fixos} secaoKey="custos_fixos" expanded={expanded} onToggle={toggle} negative receitaTotal={current.receitas} />
        <SubtotalRow label="RESULTADO OPERACIONAL (3 − 4)" value={current.resultado_operacional} receitaTotal={current.receitas} />
        <SectionRows title="EXTRA OPERACIONAL" total={current.extra_operacional} bucket={current.bySecao.extra_operacional} secaoKey="extra_operacional" expanded={expanded} onToggle={toggle} negative receitaTotal={current.receitas} />
        <SubtotalRow label="RESULTADO LÍQUIDO (5 − 6)" value={current.resultado_liquido} receitaTotal={current.receitas} big />
        <SubtotalRow label="PONTO DE EQUILÍBRIO ((4:3) × 1)" value={current.pontoEquilibrio} receitaTotal={current.receitas} />
      </div>

    </div>
  </div>
}
