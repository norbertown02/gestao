// Análises da apresentação: receita e volume reais das notas fiscais do Ultra.
// O valor de cada nota é a fonte da verdade; itens recebem rateio proporcional
// para que segmento, categoria e produto conciliem com o faturamento líquido.
const numeric = value => {
  const result = Number(value)
  return Number.isFinite(result) ? result : 0
}

const normalize = value => String(value || '')
  .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
  .toLowerCase().trim()

const normalizeCode = value => {
  const parts = String(value || '').trim().split('/')
  const product = Number(parts[0])
  const variation = Number(parts[1] || 1)
  return Number.isFinite(product) && Number.isFinite(variation) ? `${product}/${variation}` : ''
}

const normalizeMarket = raw => {
  const value = normalize(raw)
  if (value.includes('bovin')) return 'Bovinos'
  if (value.includes('suin')) return 'Suínos'
  return 'Outros / não classificado'
}

const normalizeCategory = raw => {
  const value = normalize(raw)
  if (value.includes('aminoacido')) return 'Aminoácidos'
  if (value.includes('materia-prima') || value.includes('materia prima')) return 'Matérias-primas'
  if (value.includes('premix')) return 'Premix'
  if (value.includes('nucleo')) return 'Núcleos'
  if (value.includes('mineral')) return 'Minerais'
  if (value.includes('proteinado')) return 'Proteinados'
  if (value.includes('aditivo')) return 'Aditivos'
  return 'Outros / não classificado'
}

const normalizeSubmarket = (market, segment) => {
  if (market === 'Suínos') return 'Suínos'
  if (market !== 'Bovinos') return 'Outros / não classificado'
  const label = normalize(segment)
  if (label.includes('leite')) return 'Leite'
  if (label.includes('corte')) return 'Corte'
  return 'Bovinos · outros'
}

const signedDocumentTotal = doc => {
  const value = Math.abs(numeric(doc?.document_total))
  if (doc?.movement_type === 'venda') return value
  if (doc?.movement_type === 'devolucao') return -value
  return 0
}

const sum = (rows, key) => rows.reduce((total, row) => total + numeric(row[key]), 0)

function newSummary() {
  return {
    revenue: 0, kg: 0, documents: 0, itemsWithoutKg: 0,
    unclassifiedRevenue: 0, pendingReviewRevenue: 0, withoutItemsRevenue: 0,
    markets: [], submarkets: [], categories: [], products: [], months: [],
  }
}

function summarize(documents, lookup, from, to) {
  const summary = newSummary()
  const markets = new Map()
  const submarkets = new Map()
  const categories = new Map()
  const products = new Map()
  const months = new Map()

  const push = (map, name, value, kg, productName) => {
    const entry = map.get(name) || { name, revenue: 0, kg: 0 }
    entry.revenue += value
    entry.kg += kg
    if (productName) entry.productName = productName
    map.set(name, entry)
  }

  for (const doc of documents) {
    const date = String(doc?.issue_date || '').slice(0, 10)
    if (date < from || date > to) continue
    const value = signedDocumentTotal(doc)
    if (!value) continue
    summary.documents += 1
    summary.revenue += value
    const month = Number(date.slice(5, 7))
    const monthEntry = months.get(month) || { month, revenue: 0, kg: 0 }
    monthEntry.revenue += value

    const items = Array.isArray(doc.fiscal_document_items) ? doc.fiscal_document_items : []
    const portions = items.map(item => Math.abs(numeric(item?.product_total)))
    const totalPortions = portions.reduce((total, portion) => total + portion, 0)
    if (!totalPortions) {
      summary.withoutItemsRevenue += value
      summary.unclassifiedRevenue += value
      push(markets, 'Outros / não classificado', value, 0)
      push(submarkets, 'Outros / não classificado', value, 0)
      push(categories, 'Outros / não classificado', value, 0)
      push(products, 'sem-itens', value, 0, 'Documento sem itens')
      months.set(month, monthEntry)
      continue
    }

    items.forEach((item, index) => {
      if (!portions[index]) return
      const allocated = value * portions[index] / totalPortions
      const classification = lookup.get(normalizeCode(item?.product_code))
      const market = normalizeMarket(classification?.market)
      const category = normalizeCategory(classification?.category)
      const submarket = normalizeSubmarket(market, classification?.segment)
      const unit = normalize(item?.unit)
      const kg = unit === 'kg' ? Math.sign(value) * Math.abs(numeric(item?.quantity)) : 0
      if (unit !== 'kg') summary.itemsWithoutKg += 1
      if (category === 'Outros / não classificado' || market === 'Outros / não classificado') summary.unclassifiedRevenue += allocated
      if (classification && !normalize(classification.review_status).includes('aprovad')) summary.pendingReviewRevenue += allocated
      summary.kg += kg
      monthEntry.kg += kg
      push(markets, market, allocated, kg)
      push(submarkets, submarket, allocated, kg)
      push(categories, category, allocated, kg)
      const code = normalizeCode(item?.product_code) || String(item?.product_name || 'sem-codigo')
      push(products, code, allocated, kg, item?.product_name || classification?.ultra_product_name || 'Produto sem identificação')
    })
    months.set(month, monthEntry)
  }

  const ordered = map => [...map.values()].sort((a, b) => b.revenue - a.revenue)
  summary.markets = ordered(markets)
  summary.submarkets = ordered(submarkets)
  summary.categories = ordered(categories)
  summary.products = ordered(products).map(row => ({ ...row, name: row.productName || row.name }))
  summary.months = [...months.values()].sort((a, b) => a.month - b.month)
  return summary
}

function quarterBounds(year, quarter) {
  const month = (quarter - 1) * 3
  const start = new Date(year, month, 1)
  const end = new Date(year, month + 3, 0)
  return { from: `${year}-${String(month + 1).padStart(2, '0')}-01`, to: `${year}-${String(month + 3).padStart(2, '0')}-${String(end.getDate()).padStart(2, '0')}`, start, end }
}

export function buildPresentationCommercialAnalytics({
  documents = [], classifications = [], currentRange, previousRange,
  year, focusQuarter, today = new Date(),
}) {
  const lookup = new Map(classifications.map(row => [
    normalizeCode(`${row.codproduto}/${row.codproduto_clas || 1}`), row,
  ]))
  const dateISO = date => {
    const y = date.getFullYear()
    const m = String(date.getMonth() + 1).padStart(2, '0')
    const d = String(date.getDate()).padStart(2, '0')
    return `${y}-${m}-${d}`
  }
  const period = range => summarize(documents, lookup, dateISO(range.start), dateISO(range.end))
  const current = period(currentRange)
  const previous = period(previousRange)

  const quarters = [1, 2, 3, 4].map(quarter => {
    const bounds = quarterBounds(year, quarter)
    const future = bounds.start > today
    const partial = !future && bounds.end > today
    const endISO = partial ? dateISO(today) : bounds.to
    return {
      quarter, label: `${quarter}º TRI`, future, partial, start: bounds.from,
      end: endISO, ...summarize(documents, lookup, bounds.from, endISO),
    }
  })
  const focus = quarters[Math.max(0, Math.min(3, focusQuarter - 1))]
  const focusPrevious = focusQuarter > 1 ? quarters[focusQuarter - 2] : null
  const latestInvoiceDate = documents
    .map(doc => String(doc.issue_date || '').slice(0, 10))
    .filter(date => date && date <= dateISO(today))
    .sort().at(-1) || null

  return {
    current, previous, quarters, focus, focusPrevious,
    latestInvoiceDate,
    categoryLabels: ['Núcleos', 'Minerais', 'Proteinados', 'Aditivos', 'Aminoácidos', 'Premix', 'Matérias-primas', 'Outros / não classificado'],
    marketLabels: ['Bovinos', 'Suínos', 'Outros / não classificado'],
    months: [3 * (focusQuarter - 1) + 1, 3 * (focusQuarter - 1) + 2, 3 * (focusQuarter - 1) + 3],
  }
}

export function revenueRow(rows, name) {
  return rows.find(row => row.name === name) || { name, revenue: 0, kg: 0 }
}

export function percentageDelta(current, previous) {
  if (!previous) return current ? 'Novo' : '—'
  const delta = (current - previous) / Math.abs(previous) * 100
  return `${delta > 0 ? '+' : ''}${delta.toFixed(1).replace('.', ',')}%`
}

export function totalShare(value, total) {
  return total ? value / total * 100 : 0
}
