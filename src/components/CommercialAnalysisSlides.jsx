import { percentageDelta, valueRow, totalShare } from '../lib/presentationCommercialAnalytics'

const numeric = value => Number(value || 0)
const money = value => numeric(value).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })
const shortMoney = value => {
  const number = numeric(value)
  if (Math.abs(number) >= 1000000) return 'R$ ' + (number / 1000000).toFixed(2).replace('.', ',') + ' mi'
  if (Math.abs(number) >= 1000) return 'R$ ' + (number / 1000).toFixed(0).replace('.', ',') + ' mil'
  return money(number)
}
const pct = value => numeric(value).toFixed(1).replace('.', ',') + '%'
const weight = value => Math.round(numeric(value)).toLocaleString('pt-BR') + ' kg'
const tons = value => (numeric(value) / 1000).toLocaleString('pt-BR', { maximumFractionDigits: 1 }) + ' t'
const unitPrice = (orderValue, kg) => kg > 0 ? money(orderValue / kg) : '—'
const MONTHS = ['Jan', 'Fev', 'Mar', 'Abr', 'Mai', 'Jun', 'Jul', 'Ago', 'Set', 'Out', 'Nov', 'Dez']

export function CommercialAnalysisSlides({ analytics, year, comparisonNoun, editor, total, Slide, SlideTitle, MetricStrip }) {
  const orders = analytics.current
  const previous = analytics.previous
  const focus = analytics.focus
  const focusPrevious = analytics.focusPrevious
  const maximumQuarterOrders = Math.max(...analytics.quarters.map(row => row.value), 1)
  const maximumQuarterKg = Math.max(...analytics.quarters.map(row => row.kg), 1)
  const maximumMonthKg = Math.max(...focus.months.map(row => row.kg), 1)
  const previousProducts = new Map(previous.products.map(row => [row.code, row]))
  const categories = analytics.categoryLabels.map(name => {
    const current = valueRow(orders.categories, name)
    const baseline = valueRow(previous.categories, name)
    return { ...current, previousValue: baseline.value }
  }).filter(row => row.value || row.previousValue).sort((a, b) => b.value - a.value)
  const maxCategory = Math.max(...categories.map(row => row.value), 1)
  const fetchedAt = analytics.latestOrderDate
    ? new Date(analytics.latestOrderDate + 'T12:00:00').toLocaleDateString('pt-BR')
    : 'nenhum pedido'
  const isPartial = focus.partial

  return [
    <Slide key="quarters" page={4} total={total} className="deck-commercial-analytics">
      <SlideTitle eyebrow="EVOLUÇÃO TRIMESTRAL" aside={'Pedidos · atualização até ' + fetchedAt} editKey="comercial.quarters.title" editor={editor}>Pedidos em R$ e QTD, com crescimento entre trimestres.</SlideTitle>
      <div className="deck-qtrend">
        {analytics.quarters.map(row => <section key={row.quarter} className={(row.quarter === focus.quarter ? 'focus ' : '') + (row.future ? 'future' : '')}>
          <header><span>{row.quarter}º TRI / {year}</span>{row.partial && <em>PARCIAL</em>}{row.future && <em>A INICIAR</em>}</header>
          <strong>{shortMoney(row.value)}</strong>
          <div className="deck-qtrend-growth">
            <span>R$ {row.future ? '—' : row.quarter === 1 ? 'Base' : percentageDelta(row.value, analytics.quarters[row.quarter - 2].value)}</span>
            <span>QTD {row.future ? '—' : row.quarter === 1 ? 'Base' : percentageDelta(row.kg, analytics.quarters[row.quarter - 2].kg)}</span>
          </div>
          <div className="deck-qtrend-bar"><i style={{ height: (Math.max(0, row.value) / maximumQuarterOrders * 100) + '%' }} /></div>
          <div className="deck-qtrend-weight"><b>{tons(row.kg)}</b><small>QTD de pedidos</small><i style={{ width: (Math.max(0, row.kg) / maximumQuarterKg * 100) + '%' }} /></div>
        </section>)}
      </div>
      <MetricStrip items={[
        { label: focus.quarter + 'º tri · pedidos', value: shortMoney(focus.value) },
        { label: focus.quarter + 'º tri · QTD', value: tons(focus.kg) },
        { label: 'Pedidos · trimestre anterior', value: focusPrevious ? shortMoney(focusPrevious.value) : '—' },
        { label: 'QTD · trimestre anterior', value: focusPrevious ? tons(focusPrevious.kg) : '—' },
      ]} />
      <p className="deck-analytics-note">{isPartial ? 'Trimestre em andamento: a variação confronta acumulado parcial com trimestre anterior completo. ' : ''}Base exclusiva de pedidos válidos (cancelados e estornados excluídos); itens sem quantidade em KG comprovada não entram na tonelagem.</p>
    </Slide>,
    <Slide key="markets" page={5} total={total} tone="dark" className="deck-commercial-analytics">
      <SlideTitle eyebrow="COMPOSIÇÃO DOS PEDIDOS" aside="Classificação por produto pedido" editKey="comercial.markets.title" editor={editor}>Bovinos e Suínos: participação e evolução dos pedidos.</SlideTitle>
      <div className="deck-market-grid">
        {['Bovinos', 'Suínos'].map((name, index) => {
          const current = valueRow(orders.markets, name)
          const baseline = valueRow(previous.markets, name)
          return <section key={name} className={index === 0 ? 'orange' : 'neutral'}>
            <span>{name.toUpperCase()}</span><strong>{shortMoney(current.value)}</strong>
            <div className="deck-market-share"><i style={{ width: Math.min(100, Math.max(0, totalShare(current.value, orders.value))) + '%' }} /></div>
            <div className="deck-market-bottom"><b>{pct(totalShare(current.value, orders.value))} dos pedidos</b><b>{tons(current.kg)}</b></div>
            <p>Anterior: {shortMoney(baseline.value)} <em>{percentageDelta(current.value, baseline.value)}</em></p>
          </section>
        })}
      </div>
      <div className="deck-market-split">
        {['Corte', 'Leite', 'Suínos', 'Outros / não classificado'].map(name => {
          const row = valueRow(orders.submarkets, name)
          const baseline = valueRow(previous.submarkets, name)
          return <div key={name}>
            <span>{name}</span>
            <strong>{shortMoney(row.value)}</strong>
            <small>{tons(row.kg)} · QTD</small>
            <div className="deck-market-split-growth">
              <b className={row.value >= baseline.value ? 'positive' : 'negative'}>{percentageDelta(row.value, baseline.value)}</b>
              <em>vs. {shortMoney(baseline.value)}</em>
            </div>
          </div>
        })}
      </div>
      <p className="deck-analytics-note">Valores e QTD de pedidos, classificados pelos produtos Ultra. Crescimento de Corte, Leite, Suínos e Outros relativo ao período anterior selecionado.</p>
    </Slide>,
    <Slide key="categories" page={6} total={total} className="deck-commercial-analytics">
      <SlideTitle eyebrow="MIX DOS PEDIDOS" aside={'Comparativo com ' + comparisonNoun} editKey="comercial.categories.title" editor={editor}>Quais categorias sustentam pedidos, quantidade e crescimento.</SlideTitle>
      <div className="deck-cat-head"><span>Categoria</span><span>Pedidos (R$)</span><span>QTD</span><span>Mix</span><span>Var. pedidos</span></div>
      <div className="deck-cat-list">
        {categories.length ? categories.map(row => <div key={row.name}>
          <div className="deck-cat-name"><strong>{row.name}</strong><i><em style={{ width: Math.max(0, row.value) / maxCategory * 100 + '%' }} /></i></div>
          <strong>{shortMoney(row.value)}</strong><span>{tons(row.kg)}</span>
          <span>{pct(totalShare(row.value, orders.value))}</span>
          <b className={row.value >= row.previousValue ? 'positive' : 'negative'}>{percentageDelta(row.value, row.previousValue)}</b>
        </div>) : <div className="deck-analytic-empty">Sem pedidos classificados neste período.</div>}
      </div>
      <div className="deck-cat-total"><span>Total em pedidos</span><strong>{shortMoney(orders.value)}</strong><strong>{tons(orders.kg)}</strong><span>100%</span><strong>{percentageDelta(orders.value, previous.value)}</strong></div>
      <p className="deck-analytics-note">Núcleos, minerais, proteinados, aditivos, aminoácidos, premix e matérias-primas são categorias separadas. {orders.pendingReviewValue ? shortMoney(orders.pendingReviewValue) + ' com classificação pendente de validação. ' : ''}Totais conciliados aos pedidos válidos.</p>
    </Slide>,
    <Slide key="volume" page={7} total={total} className="deck-commercial-analytics">
      <SlideTitle eyebrow="QTD DE PEDIDOS NO TRIMESTRE" aside={focus.quarter + 'º trimestre de ' + year + (isPartial ? ' · parcial' : '')} editKey="comercial.volume.title" editor={editor}>Quantidade pedida, ritmo mensal e preço médio por quilo.</SlideTitle>
      <div className="deck-volume-layout">
        <div className="deck-volume-hero"><span>QTD PEDIDA</span><strong>{tons(focus.kg)}</strong><p>{weight(focus.kg)} em pedidos no trimestre</p><div><span>vs. trimestre anterior</span><b>{focusPrevious ? percentageDelta(focus.kg, focusPrevious.kg) : '—'}</b></div></div>
        <div className="deck-volume-months"><h3>EVOLUÇÃO MENSAL</h3>
          {analytics.months.map(month => {
            const data = focus.months.find(row => row.month === month) || { kg: 0, value: 0 }
            return <div key={month}><header><span>{MONTHS[month - 1]}</span><strong>{tons(data.kg)}</strong><small>{shortMoney(data.value)}</small></header><i><em style={{ width: Math.max(0, data.kg) / maximumMonthKg * 100 + '%' }} /></i></div>
          })}
        </div>
      </div>
      <MetricStrip items={[
        { label: 'Pedidos do trimestre', value: shortMoney(focus.value) },
        { label: 'Preço médio / kg', value: unitPrice(focus.kgValue, focus.kg) },
        { label: 'Pedidos válidos', value: focus.orderCount },
        { label: 'QTD trimestre anterior', value: focusPrevious ? tons(focusPrevious.kg) : '—' },
      ]} />
      <p className="deck-analytics-note">Quantidade em KG dos pedidos válidos. {focus.noItemsCount ? focus.noItemsCount + ' pedido(s) sem itens detalhados; QTD não presumida. ' : ''}{focus.itemsWithoutKg ? focus.itemsWithoutKg + ' item(ns) com unidade sem conversão em KG. ' : ''}Preço médio considera somente produtos com KG informado.</p>
    </Slide>,
    <Slide key="invoiced-products" page={8} total={total} tone="dark" className="deck-commercial-analytics">
      <SlideTitle eyebrow="PRODUTOS PEDIDOS" aside="Pedidos do Ultra · base comercial" editKey="comercial.invoiced_products.title" editor={editor}>Produtos líderes por pedidos, QTD e preço médio.</SlideTitle>
      <div className="deck-invoiced-head"><span>Produto</span><span>Pedidos</span><span>QTD</span><span>R$/kg</span><span>vs. anterior</span></div>
      <div className="deck-invoiced-list">
        {orders.products.length ? orders.products.slice(0, 7).map((row, index) => {
          const baseline = previousProducts.get(row.code)
          return <div key={row.code}><span><b>{String(index + 1).padStart(2, '0')}</b><strong>{row.name}</strong></span><strong>{shortMoney(row.value)}</strong><span>{tons(row.kg)}</span><span>{unitPrice(row.kgValue, row.kg)}</span><b className={row.value >= (baseline?.value || 0) ? 'positive' : 'negative'}>{percentageDelta(row.value, baseline?.value || 0)}</b></div>
        }) : <div className="deck-analytic-empty">Sem produtos pedidos no período.</div>}
      </div>
      <MetricStrip dark items={[
        { label: 'QTD total em pedidos', value: tons(orders.kg) },
        { label: 'Preço médio / kg', value: unitPrice(orders.kgValue, orders.kg) },
        { label: 'Itens sem conversão para kg', value: orders.itemsWithoutKg },
      ]} />
      <p className="deck-analytics-note">Produtos pelo código Ultra. Valor líquido de cada pedido rateado proporcionalmente entre seus itens; pedidos cancelados ou integralmente estornados ficam de fora.</p>
    </Slide>,
  ]
}
