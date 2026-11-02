import { percentageDelta, revenueRow, totalShare } from '../lib/presentationCommercialAnalytics'

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
const unitPrice = (revenue, kg) => kg > 0 ? money(revenue / kg) : '—'
const MONTHS = ['Jan', 'Fev', 'Mar', 'Abr', 'Mai', 'Jun', 'Jul', 'Ago', 'Set', 'Out', 'Nov', 'Dez']

export function CommercialAnalysisSlides({ analytics, year, comparisonNoun, editor, total, Slide, SlideTitle, MetricStrip }) {
  const revenue = analytics.current
  const previous = analytics.previous
  const focus = analytics.focus
  const focusPrevious = analytics.focusPrevious
  const maximumQuarterRevenue = Math.max(...analytics.quarters.map(row => row.revenue), 1)
  const maximumQuarterKg = Math.max(...analytics.quarters.map(row => row.kg), 1)
  const maximumMonthKg = Math.max(...focus.months.map(row => row.kg), 1)
  const previousProducts = new Map(previous.products.map(row => [row.code, row]))
  const categories = analytics.categoryLabels.map(name => {
    const current = revenueRow(revenue.categories, name)
    const baseline = revenueRow(previous.categories, name)
    return { ...current, previousRevenue: baseline.revenue }
  }).filter(row => row.revenue || row.previousRevenue).sort((a, b) => b.revenue - a.revenue)
  const maxCategory = Math.max(...categories.map(row => row.revenue), 1)
  const fetchedAt = analytics.latestInvoiceDate
    ? new Date(analytics.latestInvoiceDate + 'T12:00:00').toLocaleDateString('pt-BR')
    : 'nenhuma nota'
  const isPartial = focus.partial

  return [
    <Slide key="quarters" page={4} total={total} className="deck-commercial-analytics">
      <SlideTitle eyebrow="EVOLUÇÃO TRIMESTRAL" aside={'Base fiscal · atualização até ' + fetchedAt} editKey="comercial.quarters.title" editor={editor}>Receita e volume faturado, trimestre a trimestre.</SlideTitle>
      <div className="deck-qtrend">
        {analytics.quarters.map(row => <section key={row.quarter} className={(row.quarter === focus.quarter ? 'focus ' : '') + (row.future ? 'future' : '')}>
          <header><span>{row.quarter}º TRI / {year}</span>{row.partial && <em>PARCIAL</em>}{row.future && <em>A INICIAR</em>}</header>
          <strong>{shortMoney(row.revenue)}</strong>
          <div className="deck-qtrend-bar"><i style={{ height: (Math.max(0, row.revenue) / maximumQuarterRevenue * 100) + '%' }} /></div>
          <div className="deck-qtrend-weight"><b>{tons(row.kg)}</b><small>volume faturado</small><i style={{ width: (Math.max(0, row.kg) / maximumQuarterKg * 100) + '%' }} /></div>
        </section>)}
      </div>
      <MetricStrip items={[
        { label: focus.quarter + 'º tri · faturamento', value: shortMoney(focus.revenue) },
        { label: focus.quarter + 'º tri · volume', value: tons(focus.kg) },
        { label: 'Receita vs. trimestre anterior', value: focusPrevious ? percentageDelta(focus.revenue, focusPrevious.revenue) : '—' },
        { label: 'Volume vs. trimestre anterior', value: focusPrevious ? percentageDelta(focus.kg, focusPrevious.kg) : '—' },
      ]} />
      <p className="deck-analytics-note">{isPartial ? 'Trimestre em andamento: a variação confronta acumulado parcial com trimestre anterior completo. ' : ''}Receita e quantidade líquidas de devoluções; unidades sem conversão para KG ficam fora da tonelagem.</p>
    </Slide>,
    <Slide key="markets" page={5} total={total} tone="dark" className="deck-commercial-analytics">
      <SlideTitle eyebrow="COMPOSIÇÃO DA RECEITA" aside="Classificação pelo produto faturado" editKey="comercial.markets.title" editor={editor}>Bovinos e Suínos: participação e crescimento em cada mercado.</SlideTitle>
      <div className="deck-market-grid">
        {['Bovinos', 'Suínos'].map((name, index) => {
          const current = revenueRow(revenue.markets, name)
          const baseline = revenueRow(previous.markets, name)
          return <section key={name} className={index === 0 ? 'orange' : 'neutral'}>
            <span>{name.toUpperCase()}</span><strong>{shortMoney(current.revenue)}</strong>
            <div className="deck-market-share"><i style={{ width: Math.min(100, Math.max(0, totalShare(current.revenue, revenue.revenue))) + '%' }} /></div>
            <div className="deck-market-bottom"><b>{pct(totalShare(current.revenue, revenue.revenue))} da receita</b><b>{tons(current.kg)}</b></div>
            <p>Anterior: {shortMoney(baseline.revenue)} <em>{percentageDelta(current.revenue, baseline.revenue)}</em></p>
          </section>
        })}
      </div>
      <div className="deck-market-split">
        {['Corte', 'Leite', 'Suínos', 'Outros / não classificado'].map(name => {
          const row = revenueRow(revenue.submarkets, name)
          return <div key={name}><span>{name}</span><strong>{shortMoney(row.revenue)}</strong><small>{tons(row.kg)}</small></div>
        })}
      </div>
      <p className="deck-analytics-note">Classificação gerencial do produto no Ultra; não depende do segmento informado no cadastro do cliente.</p>
    </Slide>,
    <Slide key="categories" page={6} total={total} className="deck-commercial-analytics">
      <SlideTitle eyebrow="MIX DA RECEITA" aside={'Comparativo com ' + comparisonNoun} editKey="comercial.categories.title" editor={editor}>Quais categorias sustentam faturamento, volume e evolução.</SlideTitle>
      <div className="deck-cat-head"><span>Categoria</span><span>Receita</span><span>Volume</span><span>Mix</span><span>Var. receita</span></div>
      <div className="deck-cat-list">
        {categories.length ? categories.map(row => <div key={row.name}>
          <div className="deck-cat-name"><strong>{row.name}</strong><i><em style={{ width: Math.max(0, row.revenue) / maxCategory * 100 + '%' }} /></i></div>
          <strong>{shortMoney(row.revenue)}</strong><span>{tons(row.kg)}</span>
          <span>{pct(totalShare(row.revenue, revenue.revenue))}</span>
          <b className={row.revenue >= row.previousRevenue ? 'positive' : 'negative'}>{percentageDelta(row.revenue, row.previousRevenue)}</b>
        </div>) : <div className="deck-analytic-empty">Sem faturamento classificado neste período.</div>}
      </div>
      <div className="deck-cat-total"><span>Total faturado</span><strong>{shortMoney(revenue.revenue)}</strong><strong>{tons(revenue.kg)}</strong><span>100%</span><strong>{percentageDelta(revenue.revenue, previous.revenue)}</strong></div>
      <p className="deck-analytics-note">Núcleos, minerais, proteinados, aditivos, aminoácidos, premix e matérias-primas são categorias separadas. {revenue.pendingReviewRevenue ? shortMoney(revenue.pendingReviewRevenue) + ' com classificação pendente de validação. ' : ''}Totais conciliados às notas fiscais.</p>
    </Slide>,
    <Slide key="volume" page={7} total={total} className="deck-commercial-analytics">
      <SlideTitle eyebrow="QUANTIDADE DO TRIMESTRE" aside={focus.quarter + 'º trimestre de ' + year + (isPartial ? ' · parcial' : '')} editKey="comercial.volume.title" editor={editor}>Volume comercial, ritmo mensal e valor realizado por quilo.</SlideTitle>
      <div className="deck-volume-layout">
        <div className="deck-volume-hero"><span>VOLUME FATURADO</span><strong>{tons(focus.kg)}</strong><p>{weight(focus.kg)} no trimestre</p><div><span>vs. trimestre anterior</span><b>{focusPrevious ? percentageDelta(focus.kg, focusPrevious.kg) : '—'}</b></div></div>
        <div className="deck-volume-months"><h3>EVOLUÇÃO MENSAL</h3>
          {analytics.months.map(month => {
            const data = focus.months.find(row => row.month === month) || { kg: 0, revenue: 0 }
            return <div key={month}><header><span>{MONTHS[month - 1]}</span><strong>{tons(data.kg)}</strong><small>{shortMoney(data.revenue)}</small></header><i><em style={{ width: Math.max(0, data.kg) / maximumMonthKg * 100 + '%' }} /></i></div>
          })}
        </div>
      </div>
      <MetricStrip items={[
        { label: 'Faturamento do trimestre', value: shortMoney(focus.revenue) },
        { label: 'Receita por kg', value: unitPrice(focus.kgRevenue, focus.kg) },
        { label: 'Documentos fiscais', value: focus.documents },
        { label: 'Volume do tri anterior', value: focusPrevious ? tons(focusPrevious.kg) : '—' },
      ]} />
      <p className="deck-analytics-note">KG líquido de devoluções. {focus.itemsWithoutKg ? focus.itemsWithoutKg + ' item(ns) em unidade diferente de KG não foram convertidos.' : 'Todos os itens de quantidade deste trimestre estão em KG.'} Receita/kg considera somente os valores dos itens em KG.</p>
    </Slide>,
    <Slide key="invoiced-products" page={8} total={total} tone="dark" className="deck-commercial-analytics">
      <SlideTitle eyebrow="PRODUTOS FATURADOS" aside="Receita fiscal · não pedidos" editKey="comercial.invoiced_products.title" editor={editor}>Produtos líderes por receita, quantidade e preço médio.</SlideTitle>
      <div className="deck-invoiced-head"><span>Produto</span><span>Receita</span><span>Volume</span><span>R$/kg</span><span>vs. anterior</span></div>
      <div className="deck-invoiced-list">
        {revenue.products.length ? revenue.products.slice(0, 7).map((row, index) => {
          const baseline = previousProducts.get(row.code)
          return <div key={row.code}><span><b>{String(index + 1).padStart(2, '0')}</b><strong>{row.name}</strong></span><strong>{shortMoney(row.revenue)}</strong><span>{tons(row.kg)}</span><span>{unitPrice(row.kgRevenue, row.kg)}</span><b className={row.revenue >= (baseline?.revenue || 0) ? 'positive' : 'negative'}>{percentageDelta(row.revenue, baseline?.revenue || 0)}</b></div>
        }) : <div className="deck-analytic-empty">Sem produtos faturados no período.</div>}
      </div>
      <MetricStrip dark items={[
        { label: 'Volume total faturado', value: tons(revenue.kg) },
        { label: 'Receita por kg', value: unitPrice(revenue.kgRevenue, revenue.kg) },
        { label: 'Itens sem conversão para kg', value: revenue.itemsWithoutKg },
      ]} />
      <p className="deck-analytics-note">Produtos pelo código Ultra. Faturamento líquido do documento rateado proporcionalmente ao valor de cada item.</p>
    </Slide>,
  ]
}
