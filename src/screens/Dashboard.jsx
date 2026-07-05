import { useState, useEffect } from 'react'
import { supabaseAdmin } from '../lib/supabase'
import Topbar from '../components/Topbar'
import {
  IconTrendingUp,
  IconTrendingDown,
  IconMinus,
  IconAlertTriangle,
  IconClock,
  IconTargetArrow,
  IconReceipt,
  IconUsers,
  IconRoute,
  IconChartBar,
  IconChevronRight,
  IconBuildingStore,
  IconFileText,
  IconCircleCheck,
  IconMoneybag,
} from '@tabler/icons-react'
import {
  AreaChart,
  Area,
  Line,
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
  if (!anterior) return 0
  return ((Number(atual || 0) - Number(anterior || 0)) / Number(anterior || 1)) * 100
}

function toISO(d) {
  return d.toISOString().split('T')[0]
}

function mesAtual() {
  const d = new Date()

  return {
    ano: d.getFullYear(),
    mes: d.getMonth() + 1,
    key: `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`,
    dia: d.getDate(),
    diasMes: new Date(d.getFullYear(), d.getMonth() + 1, 0).getDate(),
  }
}

function mesAnterior() {
  const d = new Date()
  d.setMonth(d.getMonth() - 1)

  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
}

function diasAtras(n) {
  const d = new Date()
  d.setDate(d.getDate() - n)
  return toISO(d)
}

function diasFrente(n) {
  const d = new Date()
  d.setDate(d.getDate() + n)
  return toISO(d)
}

function VarBadge({ atual, anterior, suffix = '%' }) {
  const diff = pct(atual, anterior)
  const up = diff > 0
  const eq = diff === 0

  return (
    <span className={`dash-var ${up ? 'up' : eq ? '' : 'down'}`}>
      {up ? <IconTrendingUp size={13} /> : eq ? <IconMinus size={13} /> : <IconTrendingDown size={13} />}
      {up ? '+' : ''}
      {diff.toFixed(1)}
      {suffix} vs mês anterior
    </span>
  )
}

function ProgressBar({ value }) {
  const safe = Math.max(0, Math.min(100, Number(value || 0)))

  return (
    <div className="dash-progress">
      <span style={{ width: `${safe}%` }} />
    </div>
  )
}

function Insight({ type = 'neutral', title, text }) {
  const Icon = type === 'ok' ? IconCircleCheck : type === 'risk' ? IconAlertTriangle : IconChartBar

  return (
    <div className={`dash-insight ${type}`}>
      <div className="dash-insight-icon">
        <Icon size={16} />
      </div>

      <div>
        <strong>{title}</strong>
        <span>{text}</span>
      </div>
    </div>
  )
}

function ActionItem({ icon: Icon, title, text, count, tone = 'neutral' }) {
  return (
    <div className={`dash-action ${tone}`}>
      <div className="dash-action-icon">
        <Icon size={16} />
      </div>

      <div style={{ minWidth: 0, flex: 1 }}>
        <strong>{title}</strong>
        <span>{text}</span>
      </div>

      <div className="dash-action-count">{count}</div>
      <IconChevronRight size={16} className="dash-action-arrow" />
    </div>
  )
}

function dataOf(result) {
  return result?.data || []
}

export default function Dashboard() {
  const [dados, setDados] = useState(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    carregar()
  }, [])

  async function carregar() {
    setLoading(true)

    try {
      const atual = mesAtual()
      const mes = atual.key
      const mesA = mesAnterior()
      const hoje = toISO(new Date())
      const d7 = diasFrente(7)
      const d45 = diasAtras(45)
      const d90 = diasAtras(90)

      const [
        salesMes,
        salesAnt,
        visitsMes,
        visitsAnt,
        farms,
        quotes,
        profiles,
        goals,
        appointments,
        allSales,
        allVisits,
      ] = await Promise.all([
        supabaseAdmin.from('sales').select('*').gte('sale_date', `${mes}-01`),
        supabaseAdmin.from('sales').select('*').gte('sale_date', `${mesA}-01`).lt('sale_date', `${mes}-01`),
        supabaseAdmin.from('visits').select('*').gte('visit_date', `${mes}-01`),
        supabaseAdmin.from('visits').select('*').gte('visit_date', `${mesA}-01`).lt('visit_date', `${mes}-01`),
        supabaseAdmin.from('farms').select('*').eq('status', 'ativo'),
        supabaseAdmin.from('quotes').select('*'),
        supabaseAdmin.from('profiles').select('*').eq('active', true),
        supabaseAdmin.from('goals').select('*').eq('ano', atual.ano).eq('mes', atual.mes),
        supabaseAdmin.from('appointments').select('*').gte('appointment_date', hoje).lte('appointment_date', d7).order('appointment_date'),
        supabaseAdmin.from('sales').select('farm_id,seller_id,sale_date,total,status,needs_approval'),
        supabaseAdmin.from('visits').select('farm_id,seller_id,visit_date,outcome').order('visit_date', { ascending: false }),
      ])

      const sm = dataOf(salesMes)
      const sa = dataOf(salesAnt)
      const vm = dataOf(visitsMes)
      const va = dataOf(visitsAnt)
      const fs = dataOf(farms)
      const qs = dataOf(quotes)
      const sellers = dataOf(profiles)
      const metas = dataOf(goals)
      const agenda = dataOf(appointments)
      const vendasTodas = dataOf(allSales)
      const visitasTodas = dataOf(allVisits)

      const fatMes = sm.reduce((a, s) => a + Number(s.total || 0), 0)
      const fatAnt = sa.reduce((a, s) => a + Number(s.total || 0), 0)

      const comissaoMes = sm.reduce((a, s) => a + Number(s.total || 0) * (Number(s.comissao_pct || 0) / 100), 0)
      const comissaoAnt = sa.reduce((a, s) => a + Number(s.total || 0) * (Number(s.comissao_pct || 0) / 100), 0)
      const comissaoPctFat = fatMes > 0 ? (comissaoMes / fatMes) * 100 : 0

      const pedMes = sm.length
      const pedAnt = sa.length

      const visitasPositivas = vm.filter(v => v.outcome === 'positiva').length
      const eficienciaVisita = vm.length ? Math.round((visitasPositivas / vm.length) * 100) : 0

      const metaTotal = metas.reduce((a, g) => a + Number(g.meta_fat || g.meta || 0), 0)
      const metaRealizada = metaTotal ? Math.min(999, (fatMes / metaTotal) * 100) : 0
      const ritmoEsperado = metaTotal ? Math.min(100, (atual.dia / atual.diasMes) * 100) : 0
      const projecaoFechamento = atual.dia ? (fatMes / atual.dia) * atual.diasMes : fatMes
      const gapMeta = metaTotal ? metaTotal - fatMes : 0
      const statusMeta = !metaTotal ? 'sem_meta' : metaRealizada >= ritmoEsperado ? 'no_ritmo' : 'abaixo'

      const abertas = qs.filter(q => q.status === 'rascunho' || q.status === 'enviada')
      const convertidas = qs.filter(q => q.status === 'convertida').length
      const valorAberto = abertas.reduce((a, q) => a + Number(q.total || 0), 0)
      const txConversao = qs.length ? Math.round((convertidas / qs.length) * 100) : 0

      const vendas90 = new Set(
        vendasTodas
          .filter(s => s.sale_date >= d90)
          .map(s => s.farm_id)
      )

      const carteiraAtiva = vendas90.size
      const carteiraTot = fs.length

      const ultimaVisita = {}

      visitasTodas.forEach(v => {
        if (!ultimaVisita[v.farm_id]) ultimaVisita[v.farm_id] = v.visit_date
      })

      const esquecidas = fs
        .map(f => {
          const uv = ultimaVisita[f.id]
          const dias = uv
            ? Math.round((new Date() - new Date(`${uv}T12:00:00`)) / 86400000)
            : 999

          return { ...f, dias, ultimaVisita: uv }
        })
        .filter(f => !f.ultimaVisita || f.ultimaVisita < d45)
        .sort((a, b) => b.dias - a.dias)
        .slice(0, 6)

      const pendentes = sm
        .filter(s => s.status === 'pendente_envio')
        .slice(0, 6)

      const descontos = sm
        .filter(s => s.needs_approval)
        .slice(0, 6)

      const segMap = {}

      sm.forEach(s => {
        const seg = fs.find(f => f.id === s.farm_id)?.segment || 'outros'
        segMap[seg] = (segMap[seg] || 0) + Number(s.total || 0)
      })

      const segmentos = Object.entries(segMap)
        .map(([name, value]) => ({ name, value }))
        .sort((a, b) => b.value - a.value)

      const vMap = {}

      sm.forEach(s => {
        const k = s.seller_id || 'geral'

        if (!vMap[k]) {
          const seller = sellers.find(p => p.id === k)

          vMap[k] = {
            id: k,
            name: seller?.name || seller?.email || (k === 'geral' ? 'Geral' : 'Sem vendedor'),
            total: 0,
            pedidos: 0,
          }
        }

        vMap[k].total += Number(s.total || 0)
        vMap[k].pedidos += 1
      })

      const topVendedores = Object.values(vMap)
        .sort((a, b) => b.total - a.total)
        .slice(0, 5)

      const fazMap = {}

      sm.forEach(s => {
        const f = fs.find(farm => farm.id === s.farm_id)
        const k = s.farm_id || 'sem_fazenda'

        if (!fazMap[k]) {
          fazMap[k] = {
            id: k,
            name: f?.name || 'Fazenda não identificada',
            total: 0,
            pedidos: 0,
          }
        }

        fazMap[k].total += Number(s.total || 0)
        fazMap[k].pedidos += 1
      })

      const topFazendas = Object.values(fazMap)
        .sort((a, b) => b.total - a.total)
        .slice(0, 5)

      const d6m = new Date()
      d6m.setMonth(d6m.getMonth() - 5)
      d6m.setDate(1)

      const ini6m = toISO(d6m)

      const [salesEvol, quotesEvol] = await Promise.all([
        supabaseAdmin.from('sales').select('sale_date,total').gte('sale_date', ini6m),
        supabaseAdmin.from('quotes').select('created_at,total').gte('created_at', ini6m),
      ])

      const evolMap = {}

      for (let i = 5; i >= 0; i--) {
        const d = new Date()
        d.setMonth(d.getMonth() - i)
        d.setDate(1)

        const key = d.toISOString().slice(0, 7)

        evolMap[key] = {
          data: d.toLocaleDateString('pt-BR', { month: 'short', year: '2-digit' }),
          Vendas: 0,
          Cotacoes: 0,
        }
      }

      dataOf(salesEvol).forEach(s => {
        const key = s.sale_date?.slice(0, 7)
        if (evolMap[key]) evolMap[key].Vendas += Number(s.total || 0)
      })

      dataOf(quotesEvol).forEach(q => {
        const key = q.created_at?.slice(0, 7)
        if (evolMap[key]) evolMap[key].Cotacoes += Number(q.total || 0)
      })

      const evolucao = Object.values(evolMap)

      const insights = []

      if (!metaTotal) {
        insights.push({
          type: 'risk',
          title: 'Meta mensal ainda não configurada.',
          text: 'Configure metas para ativar ritmo, projeção e gap comercial.',
        })
      } else if (statusMeta === 'no_ritmo') {
        insights.push({
          type: 'ok',
          title: 'Resultado dentro do ritmo esperado.',
          text: `Realizado em ${metaRealizada.toFixed(1)}% contra ${ritmoEsperado.toFixed(1)}% esperado até hoje.`,
        })
      } else {
        insights.push({
          type: 'risk',
          title: 'Faturamento abaixo do ritmo da meta.',
          text: `Faltam ${fmtK(Math.max(0, gapMeta))} para atingir a meta do mês.`,
        })
      }

      if (valorAberto > fatMes && txConversao < 30) {
        insights.push({
          type: 'risk',
          title: 'Pipeline alto, mas conversão baixa.',
          text: 'Priorize follow-up em cotações enviadas e propostas de maior valor.',
        })
      } else if (valorAberto > 0) {
        insights.push({
          type: 'neutral',
          title: 'Pipeline com oportunidades abertas.',
          text: `${fmtK(valorAberto)} em propostas abertas para acompanhamento.`,
        })
      }

      if (esquecidas.length > 0) {
        insights.push({
          type: 'risk',
          title: `${esquecidas.length} fazendas precisam de atenção.`,
          text: 'Há clientes sem visita há mais de 45 dias ou nunca visitados.',
        })
      } else {
        insights.push({
          type: 'ok',
          title: 'Carteira sem alerta crítico de visita.',
          text: 'Nenhuma fazenda ativa passou do limite de 45 dias sem visita.',
        })
      }

      if (vm.length > 0) {
        insights.push({
          type: eficienciaVisita >= 50 ? 'ok' : 'neutral',
          title: `Eficiência de visitas em ${eficienciaVisita}%.`,
          text: `${visitasPositivas} visitas positivas em ${vm.length} visitas realizadas no mês.`,
        })
      }

      setDados({
        fatMes,
        fatAnt,
        comissaoMes,
        comissaoAnt,
        comissaoPctFat,
        pedMes,
        pedAnt,
        metaTotal,
        metaRealizada,
        ritmoEsperado,
        projecaoFechamento,
        gapMeta,
        statusMeta,
        abertas: abertas.length,
        valorAberto,
        txConversao,
        visitasMes: vm.length,
        visitasPositivas,
        eficienciaVisita,
        carteiraAtiva,
        carteiraTot,
        esquecidas,
        pendentes,
        descontos,
        segmentos,
        topVendedores,
        topFazendas,
        evolucao,
        agenda,
        insights: insights.slice(0, 4),
      })
    } catch (err) {
      console.error('Erro ao carregar dashboard:', err)
      setDados(null)
    } finally {
      setLoading(false)
    }
  }

  const d = dados || {}

  const rankingMax = Math.max(...(d.topVendedores || []).map(v => v.total), 1)
  const segmentoMax = Math.max(...(d.segmentos || []).map(s => s.value), 1)

  return (
    <div style={{ flex: 1, overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>
      <Topbar title="Dashboard Executivo" subtitle="Visão comercial, pipeline e riscos da carteira" />

      <div className="page dash-page" style={{ overflowY: 'auto' }}>
        {loading ? (
          <div className="empty">Carregando visão comercial...</div>
        ) : !dados ? (
          <div className="empty">Não foi possível carregar os dados do dashboard.</div>
        ) : (
          <>
            <div className="dash-hero-grid">
              <section className="dash-hero">
                <div className="dash-hero-top">
                  <div>
                    <span className="dash-eyebrow">Resultado comercial</span>
                    <h2>{fmtK(d.fatMes)}</h2>
                    <VarBadge atual={d.fatMes} anterior={d.fatAnt} />
                  </div>

                  <div className={`dash-status ${d.statusMeta}`}>
                    {d.statusMeta === 'sem_meta'
                      ? 'Meta não configurada'
                      : d.statusMeta === 'no_ritmo'
                        ? 'No ritmo'
                        : 'Abaixo do ritmo'}
                  </div>
                </div>

                <div className="dash-hero-metrics">
                  <div>
                    <span>Meta do mês</span>
                    <strong>{d.metaTotal ? fmtK(d.metaTotal) : '—'}</strong>
                  </div>

                  <div>
                    <span>Realizado</span>
                    <strong>{d.metaTotal ? `${d.metaRealizada.toFixed(1)}%` : '—'}</strong>
                  </div>

                  <div>
                    <span>Projeção</span>
                    <strong>{fmtK(d.projecaoFechamento)}</strong>
                  </div>

                  <div>
                    <span>Gap para meta</span>
                    <strong>{d.metaTotal ? fmtK(Math.max(0, d.gapMeta)) : '—'}</strong>
                  </div>
                </div>

                {d.metaTotal ? (
                  <div className="dash-hero-progress">
                    <div>
                      <span>Ritmo esperado até hoje</span>
                      <strong>{d.ritmoEsperado.toFixed(1)}%</strong>
                    </div>
                    <ProgressBar value={d.metaRealizada} />
                  </div>
                ) : (
                  <div className="dash-hero-note">
                    Configure metas em Gestão para ativar a leitura completa de ritmo comercial.
                  </div>
                )}
              </section>

              <section className="dash-insights-card">
                <div className="dash-card-head">
                  <div>
                    <span className="dash-eyebrow">Leitura executiva</span>
                    <h3>O que merece atenção agora</h3>
                  </div>
                </div>

                <div className="dash-insights-list">
                  {d.insights.map((item, i) => (
                    <Insight key={i} {...item} />
                  ))}
                </div>
              </section>
            </div>

            <div className="dash-kpi-row">
              <div className="dash-kpi-card">
                <IconReceipt size={18} />
                <span>Pedidos</span>
                <strong>{fmtInt(d.pedMes)}</strong>
                <VarBadge atual={d.pedMes} anterior={d.pedAnt} />
              </div>

              <div className="dash-kpi-card">
                <IconTargetArrow size={18} />
                <span>Pipeline aberto</span>
                <strong>{fmtK(d.valorAberto)}</strong>
                <small>{d.abertas} cotações abertas</small>
              </div>

              <div className="dash-kpi-card">
                <IconChartBar size={18} />
                <span>Conversão</span>
                <strong>{d.txConversao}%</strong>
                <small>do total de cotações</small>
              </div>

              <div className="dash-kpi-card">
                <IconUsers size={18} />
                <span>Carteira ativa</span>
                <strong>{fmtInt(d.carteiraAtiva)}</strong>
                <small>de {fmtInt(d.carteiraTot)} fazendas</small>
              </div>

              <div className="dash-kpi-card">
                <IconRoute size={18} />
                <span>Visitas positivas</span>
                <strong>{d.eficienciaVisita}%</strong>
                <small>{d.visitasPositivas} de {d.visitasMes} visitas</small>
              </div>

              <div className="dash-kpi-card">
                <IconMoneybag size={18} />
                <span>Comissões do mês</span>
                <strong>{fmtK(d.comissaoMes)}</strong>
                <small>{d.comissaoPctFat.toFixed(1)}% do faturamento</small>
              </div>
            </div>

            <div className="dash-main-grid">
              <section className="chart-card dash-chart-large">
                <div className="chart-head">
                  <div>
                    <div className="chart-title">Evolução comercial</div>
                    <div className="chart-subtitle">Vendas e cotações nos últimos 6 meses</div>
                  </div>
                </div>

                {d.evolucao.length > 0 ? (
                  <ResponsiveContainer width="100%" height={290}>
                    <AreaChart data={d.evolucao} margin={{ top: 8, right: 10, left: -16, bottom: 0 }}>
                      <defs>
                        <linearGradient id="vendasGradient" x1="0" y1="0" x2="0" y2="1">
                          <stop offset="5%" stopColor="var(--orange)" stopOpacity={0.22} />
                          <stop offset="95%" stopColor="var(--orange)" stopOpacity={0.02} />
                        </linearGradient>

                        <linearGradient id="cotacoesGradient" x1="0" y1="0" x2="0" y2="1">
                          <stop offset="5%" stopColor="#8A8178" stopOpacity={0.14} />
                          <stop offset="95%" stopColor="#8A8178" stopOpacity={0.01} />
                        </linearGradient>
                      </defs>

                      <CartesianGrid strokeDasharray="4 6" />
                      <XAxis dataKey="data" tickLine={false} axisLine={false} />
                      <YAxis tickLine={false} axisLine={false} tickFormatter={v => `R$ ${(v / 1000).toFixed(0)}k`} />
                      <Tooltip formatter={(v, n) => [`R$ ${fmt(v)}`, n]} />

                      <Area
                        type="monotone"
                        dataKey="Cotacoes"
                        stroke="#8A8178"
                        strokeWidth={2}
                        fill="url(#cotacoesGradient)"
                        dot={false}
                      />

                      <Area
                        type="monotone"
                        dataKey="Vendas"
                        stroke="var(--orange)"
                        strokeWidth={2.6}
                        fill="url(#vendasGradient)"
                        dot={{ r: 3 }}
                        activeDot={{ r: 5 }}
                      />

                      <Line type="monotone" dataKey="Vendas" stroke="var(--orange)" strokeWidth={2.6} dot={false} />
                    </AreaChart>
                  </ResponsiveContainer>
                ) : (
                  <div className="empty">Sem dados para exibir</div>
                )}
              </section>

              <section className="chart-card">
                <div className="chart-head">
                  <div>
                    <div className="chart-title">Receita por segmento</div>
                    <div className="chart-subtitle">Distribuição do mês atual</div>
                  </div>
                </div>

                {d.segmentos.length > 0 ? (
                  <div className="dash-segment-list">
                    {d.segmentos.map(seg => (
                      <div key={seg.name} className="dash-segment-item">
                        <div>
                          <strong>{seg.name}</strong>
                          <span>{fmtK(seg.value)}</span>
                        </div>

                        <div className="dash-segment-bar">
                          <span style={{ width: `${Math.max(4, (seg.value / segmentoMax) * 100)}%` }} />
                        </div>
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="empty">Sem dados por segmento</div>
                )}
              </section>
            </div>

            <div className="dash-bottom-grid">
              <section className="card">
                <div className="dash-card-head">
                  <div>
                    <span className="dash-eyebrow">Performance</span>
                    <h3>Top vendedores</h3>
                  </div>
                </div>

                {d.topVendedores.length > 0 ? (
                  <div className="dash-ranking">
                    {d.topVendedores.map((v, i) => (
                      <div key={v.id} className="dash-ranking-row">
                        <span className="dash-rank">{i + 1}</span>

                        <div className="dash-ranking-info">
                          <strong>{v.name}</strong>
                          <span>{v.pedidos} pedidos</span>
                        </div>

                        <div className="dash-ranking-bar">
                          <span style={{ width: `${Math.max(6, (v.total / rankingMax) * 100)}%` }} />
                        </div>

                        <strong className="dash-ranking-value">{fmtK(v.total)}</strong>
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="empty">Sem vendas por vendedor</div>
                )}
              </section>

              <section className="card">
                <div className="dash-card-head">
                  <div>
                    <span className="dash-eyebrow">Carteira</span>
                    <h3>Clientes que mais compraram</h3>
                  </div>
                </div>

                {d.topFazendas.length > 0 ? (
                  <div className="dash-farm-list">
                    {d.topFazendas.map(f => (
                      <div key={f.id} className="dash-farm-item">
                        <div>
                          <strong>{f.name}</strong>
                          <span>{f.pedidos} pedidos no mês</span>
                        </div>
                        <strong>{fmtK(f.total)}</strong>
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="empty">Sem vendas por fazenda</div>
                )}
              </section>

              <section className="card">
                <div className="dash-card-head">
                  <div>
                    <span className="dash-eyebrow">Prioridades</span>
                    <h3>Ações comerciais</h3>
                  </div>
                </div>

                <div className="dash-actions-list">
                  <ActionItem
                    icon={IconFileText}
                    title="Pendentes de envio"
                    text={d.pendentes.length ? 'Vendas aguardando envio ou ajuste.' : 'Nenhuma pendência de envio.'}
                    count={d.pendentes.length}
                    tone={d.pendentes.length ? 'attention' : 'ok'}
                  />

                  <ActionItem
                    icon={IconBuildingStore}
                    title="Fazendas esquecidas"
                    text={d.esquecidas.length ? 'Clientes sem visita há mais de 45 dias.' : 'Carteira sem alerta crítico.'}
                    count={d.esquecidas.length}
                    tone={d.esquecidas.length ? 'risk' : 'ok'}
                  />

                  <ActionItem
                    icon={IconAlertTriangle}
                    title="Descontos acima do limite"
                    text={d.descontos.length ? 'Pedidos exigem atenção comercial.' : 'Nenhum desconto irregular.'}
                    count={d.descontos.length}
                    tone={d.descontos.length ? 'attention' : 'ok'}
                  />

                  <ActionItem
                    icon={IconClock}
                    title="Agenda 7 dias"
                    text={d.agenda.length ? 'Compromissos comerciais próximos.' : 'Sem compromissos próximos.'}
                    count={d.agenda.length}
                    tone="neutral"
                  />
                </div>
              </section>
            </div>
          </>
        )}
      </div>
    </div>
  )
}
