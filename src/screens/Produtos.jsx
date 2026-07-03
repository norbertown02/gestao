import { useEffect, useMemo, useState } from 'react'
import { supabaseAdmin } from '../lib/supabase'
import Topbar from '../components/Topbar'
import {
  IconAlertTriangle,
  IconBox,
  IconChartBar,
  IconDownload,
  IconFilter,
  IconPackage,
  IconReceipt,
  IconTargetArrow,
  IconTrendingDown,
  IconTrendingUp,
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

function periodoRange(periodo) {
  const hoje = new Date()
  const ano = hoje.getFullYear()
  const mes = hoje.getMonth()

  if (periodo === 'mes') return [new Date(ano, mes, 1), hoje]
  if (periodo === 'trimestre') return [new Date(ano, mes - 2, 1), hoje]
  if (periodo === 'semestre') return [new Date(ano, mes - 5, 1), hoje]

  return [new Date(ano, 0, 1), hoje]
}

function periodoAnterior(periodo) {
  const [ini, fim] = periodoRange(periodo)
  const diff = fim.getTime() - ini.getTime()
  const fimAnt = new Date(ini)
  fimAnt.setDate(fimAnt.getDate() - 1)

  const iniAnt = new Date(fimAnt.getTime() - diff)

  return [iniAnt, fimAnt]
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

function productName(item) {
  return item?.productName || item?.product_name || item?.name || item?.product || 'Produto'
}

function productQty(item) {
  return Number(item?.quantity || item?.qty || item?.qtd || 0)
}

function productSubtotal(item) {
  return Number(item?.subtotal || item?.total || item?.value || 0)
}

function getCategoria(produto) {
  const raw = String(produto?.category || produto?.categoria || produto?.line || produto?.linha || '').trim()

  if (raw) return raw

  const nome = String(produto?.name || '').toLowerCase()

  if (nome.includes('protein') || nome.includes('proteína') || nome.includes('gold')) return 'Proteinados'
  if (nome.includes('phós') || nome.includes('phos') || nome.includes('mineral')) return 'Minerais'
  if (nome.includes('detox')) return 'Aditivos'
  if (nome.includes('lacto')) return 'Leite'
  if (nome.includes('lisina') || nome.includes('metionina') || nome.includes('treonina') || nome.includes('triptofano')) return 'Aminoácidos'

  return 'Outros'
}

function VarBadge({ atual, anterior, invert = false }) {
  const diff = pct(atual, anterior)
  const positivo = invert ? diff <= 0 : diff >= 0

  return (
    <span className={`produtos-var ${positivo ? 'up' : 'down'}`}>
      {positivo ? <IconTrendingUp size={12} /> : <IconTrendingDown size={12} />}
      {diff >= 0 ? '+' : ''}
      {diff.toFixed(1)}% vs período ant.
    </span>
  )
}

function KpiCard({ icon: Icon, label, value, sub, atual, anterior, tone = 'neutral', invert = false }) {
  return (
    <article className={`produtos-kpi ${tone}`}>
      <div className="produtos-kpi-top">
        <div>
          <span>{label}</span>
          <strong>{value}</strong>
        </div>

        <div className="produtos-kpi-icon">
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
    <div className="produtos-ranking-row">
      <span className="produtos-rank">{index + 1}</span>

      <div className="produtos-ranking-main">
        <strong>{title}</strong>
        <small>{subtitle}</small>
      </div>

      <div className="produtos-ranking-bar">
        <span style={{ width: `${percent}%` }} />
      </div>

      <div className="produtos-ranking-foot">
        <strong>{money ? fmtK(value) : fmtInt(value)}</strong>
        {extra && <span>{extra}</span>}
      </div>
    </div>
  )
}

function Empty({ children = 'Sem dados para exibir' }) {
  return <div className="empty">{children}</div>
}

export default function Produtos() {
  const [periodo, setPeriodo] = useState('mes')
  const [segmento, setSegmento] = useState('todos')
  const [categoria, setCategoria] = useState('todos')
  const [sales, setSales] = useState([])
  const [salesAnt, setSalesAnt] = useState([])
  const [salesHistorico, setSalesHistorico] = useState([])
  const [produtos, setProdutos] = useState([])
  const [farms, setFarms] = useState([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    carregarBase()
  }, [])

  useEffect(() => {
    carregarVendas()
  }, [periodo])

  async function carregarBase() {
    const [prodRes, farmsRes] = await Promise.all([
      supabaseAdmin.from('products').select('*').eq('active', true).order('name'),
      supabaseAdmin.from('farms').select('id,name,segment'),
    ])

    setProdutos(prodRes.data || [])
    setFarms(farmsRes.data || [])
  }

  async function carregarVendas() {
    setLoading(true)

    try {
      const [ini, fim] = periodoRange(periodo)
      const [iniAnt, fimAnt] = periodoAnterior(periodo)
      const histIni = new Date()
      histIni.setMonth(histIni.getMonth() - 5)
      histIni.setDate(1)

      const [rAtual, rAnt, rHist] = await Promise.all([
        supabaseAdmin
          .from('sales')
          .select('*')
          .gte('sale_date', toISO(ini))
          .lte('sale_date', toISO(fim)),

        supabaseAdmin
          .from('sales')
          .select('*')
          .gte('sale_date', toISO(iniAnt))
          .lte('sale_date', toISO(fimAnt)),

        supabaseAdmin
          .from('sales')
          .select('*')
          .gte('sale_date', toISO(histIni))
          .lte('sale_date', toISO(new Date())),
      ])

      setSales(rAtual.data || [])
      setSalesAnt(rAnt.data || [])
      setSalesHistorico(rHist.data || [])
    } catch (err) {
      console.error('Erro ao carregar produtos:', err)
      setSales([])
      setSalesAnt([])
      setSalesHistorico([])
    } finally {
      setLoading(false)
    }
  }

  const dados = useMemo(() => {
    const farmById = new Map(farms.map(f => [f.id, f]))
    const productByName = new Map(produtos.map(p => [String(p.name || '').toLowerCase(), p]))

    const filtrarSale = sale => {
      if (segmento === 'todos') return true
      const farm = farmById.get(sale.farm_id)
      return String(farm?.segment || '').toLowerCase() === segmento
    }

    const agregar = base => {
      const itemMap = {}

      base.filter(filtrarSale).forEach(sale => {
        const farm = farmById.get(sale.farm_id)

        parseItems(sale.items).forEach(item => {
          const name = productName(item)
          const produto = productByName.get(String(name).toLowerCase())
          const cat = getCategoria(produto || { name })

          if (categoria !== 'todos' && String(cat).toLowerCase() !== categoria) return

          if (!itemMap[name]) {
            itemMap[name] = {
              name,
              categoria: cat,
              receita: 0,
              qty: 0,
              pedidos: 0,
              fazendasSet: new Set(),
              segmentos: {},
            }
          }

          const subtotal = productSubtotal(item)
          const qty = productQty(item)

          itemMap[name].receita += subtotal
          itemMap[name].qty += qty
          itemMap[name].pedidos += 1

          if (sale.farm_id) itemMap[name].fazendasSet.add(sale.farm_id)

          const seg = farm?.segment || '—'
          itemMap[name].segmentos[seg] = (itemMap[name].segmentos[seg] || 0) + subtotal
        })
      })

      return Object.values(itemMap).map(p => ({
        ...p,
        fazendas: p.fazendasSet.size,
        ticket: p.pedidos ? p.receita / p.pedidos : 0,
      }))
    }

    const porProduto = agregar(sales).sort((a, b) => b.receita - a.receita)
    const porProdutoAnt = agregar(salesAnt)
    const antMap = new Map(porProdutoAnt.map(p => [p.name, p]))
    const totalReceita = porProduto.reduce((a, p) => a + p.receita, 0)
    const totalReceitaAnt = porProdutoAnt.reduce((a, p) => a + p.receita, 0)

    const porProdutoComparado = porProduto.map(p => ({
      ...p,
      receitaAnt: antMap.get(p.name)?.receita || 0,
      variacao: pct(p.receita, antMap.get(p.name)?.receita || 0),
      participacao: totalReceita ? (p.receita / totalReceita) * 100 : 0,
    }))

    const produtosAtivos = produtos
      .filter(p => {
        if (categoria === 'todos') return true
        return String(getCategoria(p)).toLowerCase() === categoria
      })
      .map(p => p.name)

    const produtosComVenda = new Set(porProduto.map(p => p.name))
    const semVenda = produtosAtivos.filter(p => !produtosComVenda.has(p))
    const totalQtd = porProduto.reduce((a, p) => a + p.qty, 0)
    const totalQtdAnt = porProdutoAnt.reduce((a, p) => a + p.qty, 0)
    const totalPedidos = porProduto.reduce((a, p) => a + p.pedidos, 0)
    const ticketMedio = totalPedidos ? totalReceita / totalPedidos : 0

    const topProduto = porProdutoComparado[0]
    const crescimento = [...porProdutoComparado]
      .filter(p => p.receitaAnt > 0)
      .sort((a, b) => b.variacao - a.variacao)
      .slice(0, 8)

    const queda = [...porProdutoComparado]
      .filter(p => p.receitaAnt > 0 && p.variacao < 0)
      .sort((a, b) => a.variacao - b.variacao)
      .slice(0, 8)

    const categoriaMap = {}
    porProduto.forEach(p => {
      if (!categoriaMap[p.categoria]) {
        categoriaMap[p.categoria] = { name: p.categoria, Receita: 0, Produtos: 0 }
      }

      categoriaMap[p.categoria].Receita += p.receita
      categoriaMap[p.categoria].Produtos += 1
    })

    const porCategoria = Object.values(categoriaMap).sort((a, b) => b.Receita - a.Receita)

    const top3 = porProduto.slice(0, 3).map(p => p.name)
    const mesesMap = {}

    salesHistorico.filter(filtrarSale).forEach(sale => {
      const mes = sale.sale_date?.slice(0, 7)
      if (!mes) return

      if (!mesesMap[mes]) {
        mesesMap[mes] = {
          mes,
          label: new Date(`${mes}-01T12:00:00`).toLocaleDateString('pt-BR', {
            month: 'short',
            year: '2-digit',
          }),
        }

        top3.forEach(prod => {
          mesesMap[mes][prod] = 0
        })
      }

      parseItems(sale.items).forEach(item => {
        const name = productName(item)
        if (!top3.includes(name)) return
        mesesMap[mes][name] += productSubtotal(item)
      })
    })

    const evolucaoTop = Object.values(mesesMap)
      .sort((a, b) => a.mes.localeCompare(b.mes))
      .slice(-6)

    const categoriasDisponiveis = [...new Set(produtos.map(getCategoria))]
      .filter(Boolean)
      .sort()

    return {
      porProduto: porProdutoComparado,
      totalReceita,
      totalReceitaAnt,
      totalQtd,
      totalQtdAnt,
      ticketMedio,
      topProduto,
      semVenda,
      crescimento,
      queda,
      porCategoria,
      evolucaoTop,
      top3,
      categoriasDisponiveis,
    }
  }, [sales, salesAnt, salesHistorico, produtos, farms, segmento, categoria])

  const receitaMax = Math.max(...dados.porProduto.map(p => p.receita), 1)
  const qtyMax = Math.max(...dados.porProduto.map(p => p.qty), 1)
  const crescimentoMax = Math.max(...dados.crescimento.map(p => Math.abs(p.variacao)), 1)
  const quedaMax = Math.max(...dados.queda.map(p => Math.abs(p.variacao)), 1)

  function exportCSV() {
    const rows = [
      ['Produto', 'Categoria', 'Receita', 'Quantidade', 'Ticket médio', 'Pedidos', 'Fazendas únicas', '% do total', 'Variação %'],
      ...dados.porProduto.map(p => [
        p.name,
        p.categoria,
        p.receita,
        p.qty,
        p.ticket,
        p.pedidos,
        p.fazendas,
        p.participacao.toFixed(1),
        p.variacao.toFixed(1),
      ]),
    ]

    const csv = rows.map(r => r.map(c => `"${String(c ?? '').replace(/"/g, '""')}"`).join(';')).join('\n')
    const a = document.createElement('a')

    a.href = `data:text/csv;charset=utf-8,\uFEFF${encodeURIComponent(csv)}`
    a.download = 'performance-produtos.csv'
    a.click()
  }

  return (
    <div style={{ flex: 1, overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>
      <Topbar title="Performance de Produtos" subtitle="Mix comercial, receita, volume e giro do catálogo">
        <button className="btn btn-ghost btn-sm" onClick={exportCSV}>
          <IconDownload size={14} />
          Exportar CSV
        </button>
      </Topbar>

      <div className="page produtos-page" style={{ overflowY: 'auto' }}>
        <section className="produtos-toolbar">
          <div className="produtos-toolbar-left">
            <div className="produtos-filter-icon">
              <IconFilter size={15} />
            </div>

            <select value={periodo} onChange={e => setPeriodo(e.target.value)}>
              <option value="mes">Mês atual</option>
              <option value="trimestre">Trimestre</option>
              <option value="semestre">Semestre</option>
              <option value="ano">Ano</option>
            </select>

            <select value={segmento} onChange={e => setSegmento(e.target.value)}>
              <option value="todos">Todos os segmentos</option>
              <option value="leite">Leite</option>
              <option value="corte">Corte</option>
              <option value="suinos">Suínos</option>
            </select>

            <select value={categoria} onChange={e => setCategoria(e.target.value)}>
              <option value="todos">Todas as categorias</option>
              {dados.categoriasDisponiveis.map(cat => (
                <option key={cat} value={cat.toLowerCase()}>{cat}</option>
              ))}
            </select>
          </div>

          <div className="produtos-toolbar-count">
            {fmtInt(dados.porProduto.length)} produtos vendidos
          </div>
        </section>

        <section className="produtos-hero">
          <div>
            <span className="produtos-eyebrow">Produto líder do período</span>
            <h2>{dados.topProduto?.name || 'Sem dados'}</h2>
            <small>{dados.topProduto ? `${fmtK(dados.topProduto.receita)} · ${fmtInt(dados.topProduto.qty)} unidades · ${dados.topProduto.participacao.toFixed(1)}% do mix` : 'Aguardando vendas no período'}</small>
          </div>

          <div className="produtos-hero-grid">
            <div>
              <span>Receita em produtos</span>
              <strong>{fmtK(dados.totalReceita)}</strong>
            </div>

            <div>
              <span>Volume vendido</span>
              <strong>{fmtInt(dados.totalQtd)}</strong>
            </div>

            <div>
              <span>Produtos sem giro</span>
              <strong>{fmtInt(dados.semVenda.length)}</strong>
            </div>
          </div>
        </section>

        <section className="produtos-kpi-grid">
          <KpiCard icon={IconWallet} label="Receita total" value={fmtK(dados.totalReceita)} atual={dados.totalReceita} anterior={dados.totalReceitaAnt} />
          <KpiCard icon={IconPackage} label="Produtos vendidos" value={fmtInt(dados.porProduto.length)} sub={`${fmtInt(produtos.length)} produtos ativos`} />
          <KpiCard icon={IconBox} label="Volume vendido" value={fmtInt(dados.totalQtd)} atual={dados.totalQtd} anterior={dados.totalQtdAnt} />
          <KpiCard icon={IconReceipt} label="Ticket médio" value={fmtK(dados.ticketMedio)} sub="valor médio por item vendido" />
          <KpiCard icon={IconAlertTriangle} label="Sem giro" value={fmtInt(dados.semVenda.length)} sub="produtos sem venda no filtro" tone={dados.semVenda.length ? 'danger' : 'success'} invert />
          <KpiCard icon={IconTargetArrow} label="Produto líder" value={dados.topProduto ? `${dados.topProduto.participacao.toFixed(1)}%` : '—'} sub={dados.topProduto?.name || 'sem vendas'} />
        </section>

        {loading ? (
          <Empty>Carregando produtos...</Empty>
        ) : (
          <>
            {dados.semVenda.length > 0 && (
              <section className="produtos-alerts">
                <div className="produtos-alert warning">
                  <IconAlertTriangle size={17} />
                  <span><strong>{dados.semVenda.length}</strong> produto{dados.semVenda.length > 1 ? 's' : ''} ativo{dados.semVenda.length > 1 ? 's' : ''} sem venda no período.</span>
                </div>
              </section>
            )}

            <section className="produtos-main-grid">
              <div className="produtos-card produtos-chart-card">
                <div className="produtos-card-head">
                  <div><span className="produtos-eyebrow">Receita</span><h3>Top produtos por faturamento</h3></div>
                </div>

                {dados.porProduto.length > 0 ? (
                  <ResponsiveContainer width="100%" height={340}>
                    <BarChart data={dados.porProduto.slice(0, 10)} layout="vertical" margin={{ top: 0, right: 42, left: 8, bottom: 0 }}>
                      <CartesianGrid strokeDasharray="4 6" />
                      <XAxis type="number" tickLine={false} axisLine={false} tickFormatter={v => `R$ ${(v / 1000).toFixed(0)}k`} />
                      <YAxis type="category" dataKey="name" tickLine={false} axisLine={false} width={158} />
                      <Tooltip formatter={v => [`R$ ${fmt(v)}`, 'Receita']} />
                      <Bar dataKey="receita" fill="var(--orange)" radius={[0, 8, 8, 0]} />
                    </BarChart>
                  </ResponsiveContainer>
                ) : <Empty>Sem vendas no período</Empty>}
              </div>

              <div className="produtos-card">
                <div className="produtos-card-head">
                  <div><span className="produtos-eyebrow">Mix</span><h3>Receita por categoria</h3></div>
                </div>

                {dados.porCategoria.length > 0 ? (
                  <ResponsiveContainer width="100%" height={340}>
                    <BarChart data={dados.porCategoria} margin={{ top: 8, right: 12, left: -18, bottom: 0 }}>
                      <CartesianGrid strokeDasharray="4 6" />
                      <XAxis dataKey="name" tickLine={false} axisLine={false} />
                      <YAxis tickLine={false} axisLine={false} tickFormatter={v => `R$ ${(v / 1000).toFixed(0)}k`} />
                      <Tooltip formatter={v => [`R$ ${fmt(v)}`, 'Receita']} />
                      <Bar dataKey="Receita" fill="var(--orange)" radius={[8, 8, 0, 0]} />
                    </BarChart>
                  </ResponsiveContainer>
                ) : <Empty>Sem categorias no período</Empty>}
              </div>
            </section>

            <section className="produtos-card produtos-chart-card">
              <div className="produtos-card-head">
                <div><span className="produtos-eyebrow">Tendência</span><h3>Evolução dos produtos líderes</h3></div>
                <small>{dados.top3.join(' · ') || 'sem produtos'}</small>
              </div>

              {dados.evolucaoTop.length > 0 && dados.top3.length > 0 ? (
                <ResponsiveContainer width="100%" height={300}>
                  <AreaChart data={dados.evolucaoTop} margin={{ top: 8, right: 12, left: -18, bottom: 0 }}>
                    <defs>
                      <linearGradient id="produtoTop1" x1="0" y1="0" x2="0" y2="1"><stop offset="5%" stopColor="var(--orange)" stopOpacity={0.23} /><stop offset="95%" stopColor="var(--orange)" stopOpacity={0.02} /></linearGradient>
                    </defs>
                    <CartesianGrid strokeDasharray="4 6" />
                    <XAxis dataKey="label" tickLine={false} axisLine={false} />
                    <YAxis tickLine={false} axisLine={false} tickFormatter={v => `R$ ${(v / 1000).toFixed(0)}k`} />
                    <Tooltip formatter={(v, n) => [`R$ ${fmt(v)}`, n]} />
                    {dados.top3.map((prod, i) => (
                      <Area key={prod} type="monotone" dataKey={prod} stroke={i === 0 ? 'var(--orange)' : i === 1 ? '#242424' : '#8A8178'} strokeWidth={i === 0 ? 2.5 : 2} fill={i === 0 ? 'url(#produtoTop1)' : 'transparent'} dot={{ r: 3 }} activeDot={{ r: 5 }} />
                    ))}
                  </AreaChart>
                </ResponsiveContainer>
              ) : <Empty>Sem histórico suficiente</Empty>}
            </section>

            <section className="produtos-grid-4">
              <div className="produtos-card"><div className="produtos-card-head"><div><span className="produtos-eyebrow">Campeões</span><h3>Mais faturamento</h3></div></div>{dados.porProduto.length > 0 ? <div className="produtos-ranking">{dados.porProduto.slice(0, 8).map((p, i) => <RankingRow key={p.name} index={i} title={p.name} subtitle={`${p.categoria} · ${fmtInt(p.fazendas)} clientes`} value={p.receita} max={receitaMax} extra={`${p.participacao.toFixed(1)}% do mix`} money />)}</div> : <Empty>Sem produtos vendidos</Empty>}</div>
              <div className="produtos-card"><div className="produtos-card-head"><div><span className="produtos-eyebrow">Volume</span><h3>Mais vendidos</h3></div></div>{dados.porProduto.length > 0 ? <div className="produtos-ranking">{[...dados.porProduto].sort((a, b) => b.qty - a.qty).slice(0, 8).map((p, i) => <RankingRow key={p.name} index={i} title={p.name} subtitle={`${fmtK(p.receita)} receita`} value={p.qty} max={qtyMax} extra="unidades" />)}</div> : <Empty>Sem volume vendido</Empty>}</div>
              <div className="produtos-card"><div className="produtos-card-head"><div><span className="produtos-eyebrow">Crescimento</span><h3>Produtos em alta</h3></div></div>{dados.crescimento.length > 0 ? <div className="produtos-ranking">{dados.crescimento.map((p, i) => <RankingRow key={p.name} index={i} title={p.name} subtitle={`${fmtK(p.receitaAnt)} → ${fmtK(p.receita)}`} value={Math.abs(p.variacao)} max={crescimentoMax} extra={`+${p.variacao.toFixed(1)}%`} />)}</div> : <Empty>Sem base para crescimento</Empty>}</div>
              <div className="produtos-card"><div className="produtos-card-head"><div><span className="produtos-eyebrow">Atenção</span><h3>Produtos em queda</h3></div></div>{dados.queda.length > 0 ? <div className="produtos-ranking">{dados.queda.map((p, i) => <RankingRow key={p.name} index={i} title={p.name} subtitle={`${fmtK(p.receitaAnt)} → ${fmtK(p.receita)}`} value={Math.abs(p.variacao)} max={quedaMax} extra={`${p.variacao.toFixed(1)}%`} />)}</div> : <Empty>Sem queda relevante</Empty>}</div>
            </section>

            <section className="produtos-card">
              <div className="produtos-card-head"><div><span className="produtos-eyebrow">Catálogo</span><h3>Tabela detalhada de produtos</h3></div><small>{fmtInt(dados.porProduto.length)} produtos</small></div>
              <div className="table-wrap produtos-table-wrap">
                <table>
                  <thead><tr><th>#</th><th>Produto</th><th>Categoria</th><th style={{ textAlign: 'right' }}>Receita</th><th style={{ textAlign: 'right' }}>Qtd vendida</th><th style={{ textAlign: 'right' }}>Ticket</th><th style={{ textAlign: 'center' }}>Clientes</th><th style={{ textAlign: 'right' }}>% do mix</th><th style={{ textAlign: 'right' }}>Variação</th></tr></thead>
                  <tbody>{dados.porProduto.length === 0 ? <tr><td colSpan={9} style={{ textAlign: 'center', color: 'var(--text-faint)' }}>Nenhuma venda no período</td></tr> : dados.porProduto.map((p, i) => <tr key={p.name}><td><strong className="produtos-position">{i + 1}</strong></td><td><strong>{p.name}</strong></td><td><span className="produtos-pill category">{p.categoria}</span></td><td style={{ textAlign: 'right' }}><strong className="produtos-money">{fmtK(p.receita)}</strong></td><td style={{ textAlign: 'right' }}>{fmtInt(p.qty)}</td><td style={{ textAlign: 'right' }}>{fmtK(p.ticket)}</td><td style={{ textAlign: 'center' }}>{fmtInt(p.fazendas)}</td><td style={{ textAlign: 'right' }}><div className="produtos-mix-cell"><div className="produtos-mini-bar"><span style={{ width: `${Math.min(100, p.participacao)}%` }} /></div><strong>{p.participacao.toFixed(1)}%</strong></div></td><td style={{ textAlign: 'right' }}><span className={`produtos-pill ${p.variacao >= 0 ? 'positive' : 'negative'}`}>{p.variacao >= 0 ? '+' : ''}{p.variacao.toFixed(1)}%</span></td></tr>)}</tbody>
                </table>
              </div>
            </section>

            <section className="produtos-card">
              <div className="produtos-card-head"><div><span className="produtos-eyebrow">Sem giro</span><h3>Produtos ativos sem venda no período</h3></div><small>{fmtInt(dados.semVenda.length)} produtos</small></div>
              {dados.semVenda.length === 0 ? <Empty>Todos os produtos tiveram venda no filtro atual</Empty> : <div className="produtos-sem-giro">{dados.semVenda.map(p => <span key={p}>{p}</span>)}</div>}
            </section>
          </>
        )}
      </div>
    </div>
  )
}
