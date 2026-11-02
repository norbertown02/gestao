// Métricas EXCLUSIVAMENTE de pedidos para apresentação comercial.
// Não utiliza notas fiscais. Itens dos pedidos são conciliados ao valor líquido
// do próprio pedido; cancelamentos e pedidos inteiramente estornados não contam.
import { hasNetOrderValue, netOrderValue, orderBaseValue } from './commercialMetrics'

const numeric = value => {
  const parsed = Number(value)
  return Number.isFinite(parsed) ? parsed : 0
}

const normalize = value => String(value || '')
  .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
  .toLowerCase().trim()

const normalizeCode = value => {
  const parts = String(value || '').trim().split('/')
  const product = Number(parts[0])
  const variation = Number(parts[1] || 1)
  return product > 0 && variation > 0 ? `${product}/${variation}` : ''
}

const itemCode = item => (
  normalizeCode(item?.productKey) ||
  normalizeCode(item?.ultra_codproduto && `${item.ultra_codproduto}/${item.ultra_codproduto_clas || 1}`) ||
  normalizeCode(item?.productId)
)

const itemTotal = item => {
  const explicit = numeric(item?.product_total ?? item?.subtotal ?? item?.total ?? item?.value)
  if (explicit) return Math.abs(explicit)
  return Math.abs(numeric(item?.quantity ?? item?.qty) * numeric(item?.unitPrice ?? item?.unit_price))
}

const normalizeMarket = raw => {
  const label = normalize(raw)
  if (label.includes('bovin')) return 'Bovinos'
  if (label.includes('suin')) return 'Suínos'
  return 'Outros / não classificado'
}
const normalizeCategory = raw => {
  const label = normalize(raw)
  if (label.includes('aminoacido')) return 'Aminoácidos'
  if (label.includes('materia-prima') || label.includes('materia prima')) return 'Matérias-primas'
  if (label.includes('premix')) return 'Premix'
  if (label.includes('nucleo')) return 'Núcleos'
  if (label.includes('mineral')) return 'Minerais'
  if (label.includes('proteinado')) return 'Proteinados'
  if (label.includes('aditivo')) return 'Aditivos'
  return 'Outros / não classificado'
}
const normalizeSubmarket = (market, segment) => {
  if (market === 'Suínos') return 'Suínos'
  if (market !== 'Bovinos') return 'Outros / não classificado'
  const label = normalize(segment)
  if (label.includes('leite')) return 'Leite'
  if (label.includes('corte')) return 'Corte'
  return 'Outros / não classificado'
}

const isoLocal = date => [
  date.getFullYear(),
  String(date.getMonth() + 1).padStart(2, '0'),
  String(date.getDate()).padStart(2, '0'),
].join('-')

const summaryEmpty = () => ({
  value: 0, kg: 0, kgValue: 0, orderCount: 0, noItemsCount: 0,
  itemsWithoutKg: 0, unclassifiedValue: 0, pendingReviewValue: 0,
  markets: [], submarkets: [], categories: [], products: [], months: [],
})

function summarize(orders, lookup, from, to) {
  const result = summaryEmpty()
  const markets = new Map()
  const submarkets = new Map()
  const categories = new Map()
  const products = new Map()
  const months = new Map()

  const add = (map, key, value, kg = 0, kgValue = 0, name) => {
    const row = map.get(key) || { name: name || key, value: 0, kg: 0, kgValue: 0 }
    row.value += value
    row.kg += kg
    row.kgValue += kgValue
    if (name) row.name = name
    map.set(key, row)
  }

  for (const order of orders) {
    const date = String(order?.sale_date || '').slice(0, 10)
    if (!date || date < from || date > to || !hasNetOrderValue(order)) continue
    const orderValue = netOrderValue(order)
    result.value += orderValue
    result.orderCount += 1
    const month = Number(date.slice(5, 7))
    const monthRow = months.get(month) || { month, value: 0, kg: 0 }
    monthRow.value += orderValue

    const items = Array.isArray(order.items) ? order.items : []
    const totals = items.map(itemTotal)
    const itemSum = totals.reduce((total, part) => total + part, 0)
    if (!items.length || !itemSum) {
      result.noItemsCount += 1
      result.unclassifiedValue += orderValue
      add(markets, 'Outros / não classificado', orderValue)
      add(submarkets, 'Outros / não classificado', orderValue)
      add(categories, 'Outros / não classificado', orderValue)
      add(products, 'sem-itens', orderValue, 0, 0, 'Pedidos sem detalhamento')
      months.set(month, monthRow)
      continue
    }

    // Valores do pedido podem ter desconto/frete e devoluções. Rateio garante
    // soma exata dos valores sem usar o faturamento fiscal como fonte.
    const ratioNetToBase = orderBaseValue(order) > 0
      ? Math.max(0, Math.min(1, orderValue / orderBaseValue(order))) : 0

    items.forEach((item, index) => {
      if (!totals[index]) return
      const allocated = orderValue * totals[index] / itemSum
      const code = itemCode(item)
      const classification = lookup.get(code)
      const market = normalizeMarket(classification?.market)
      const category = normalizeCategory(classification?.category)
      const submarket = normalizeSubmarket(market, classification?.segment)
      const unit = normalize(item?.unit)
      // quantityKg tem precedência se existir e for confiável; quantidade em
      // 'saco' ou 'SC' só é convertida com bagKg conhecido e positivo.
      const quantityKg = numeric(item?.quantityKg) > 0
        ? numeric(item.quantityKg)
        : unit === 'kg' ? Math.abs(numeric(item?.quantity ?? item?.qty))
        : (unit === 'sc' || unit === 'saco') && numeric(item?.bagKg) > 0
          ? Math.abs(numeric(item.quantity ?? item?.qty)) * numeric(item.bagKg)
          : 0
      const kg = quantityKg * ratioNetToBase
      const kgValue = quantityKg > 0 ? allocated : 0

      if (quantityKg === 0) result.itemsWithoutKg += 1
      if (market === 'Outros / não classificado' || category === 'Outros / não classificado') result.unclassifiedValue += allocated
      if (classification && !normalize(classification.review_status).includes('aprovad')) result.pendingReviewValue += allocated
      result.kg += kg
      result.kgValue += kgValue
      monthRow.kg += kg

      add(markets, market, allocated, kg, kgValue)
      add(submarkets, submarket, allocated, kg, kgValue)
      add(categories, category, allocated, kg, kgValue)
      add(products, code || String(item.productName || item.product_name || 'sem-codigo'), allocated, kg, kgValue,
        item.productName || item.product_name || classification?.ultra_product_name || 'Produto sem identificação')
    })
    months.set(month, monthRow)
  }

  const sorted = map => [...map.values()].sort((a, b) => b.value - a.value)
  result.markets = sorted(markets)
  result.submarkets = sorted(submarkets)
  result.categories = sorted(categories)
  result.products = [...products].map(([code, row]) => ({ ...row, code })).sort((a, b) => b.value - a.value)
  result.months = [...months.values()].sort((a, b) => a.month - b.month)
  return result
}

function quarterBounds(year, quarter) {
  const startMonth = (quarter - 1) * 3
  return {
    start: new Date(year, startMonth, 1),
    end: new Date(year, startMonth + 3, 0),
  }
}

/**
 * Compara períodos comerciais sempre na mesma etapa do ciclo:
 * - Q4 com apenas outubro disponível => compara outubro com julho.
 * - Ao começar novembro com pedidos => compara out + nov (até o dia)
 *   com jul + ago (até o mesmo dia); em meses fechados, meses inteiros.
 * - Períodos encerrados seguem o comparativo de períodos completos.
 * A data de atualização é determinada por pedidos VÁLIDOS, nunca notas.
 */
function comparablePreviousEnd({ orders, currentStart, currentEnd, nominalEnd, previousStart, previousEnd }) {
  const end = currentEnd < nominalEnd ? currentEnd : nominalEnd
  if (end >= nominalEnd) return previousEnd

  const from = isoLocal(currentStart)
  const through = isoLocal(end)
  const lastValid = orders
    .filter(order => hasNetOrderValue(order))
    .map(order => String(order?.sale_date || '').slice(0, 10))
    .filter(date => date >= from && date <= through)
    .sort().at(-1) || null

  // Se a base ainda não tem pedidos no mês recém-iniciado, preserva a
  // comparação do(s) mês(es) já concluído(s), sem misturar um mês vazio.
  let effectiveEnd = end
  if (lastValid) {
    const lastMonth = lastValid.slice(0, 7)
    const currentMonth = isoLocal(end).slice(0, 7)
    if (lastMonth < currentMonth) {
      const lastClosedMonth = new Date(end.getFullYear(), end.getMonth(), 0)
      if (lastClosedMonth >= currentStart) effectiveEnd = lastClosedMonth
    }
  }

  const elapsedMonths = (effectiveEnd.getFullYear() - currentStart.getFullYear()) * 12
    + effectiveEnd.getMonth() - currentStart.getMonth()
  const compareMonthStart = new Date(previousStart.getFullYear(), previousStart.getMonth() + elapsedMonths, 1)
  const compareMonthLastDay = new Date(compareMonthStart.getFullYear(), compareMonthStart.getMonth() + 1, 0).getDate()
  const effectiveMonthLastDay = new Date(effectiveEnd.getFullYear(), effectiveEnd.getMonth() + 1, 0).getDate()
  const targetDay = effectiveEnd.getDate() === effectiveMonthLastDay
    ? compareMonthLastDay : Math.min(effectiveEnd.getDate(), compareMonthLastDay)
  const candidate = new Date(compareMonthStart.getFullYear(), compareMonthStart.getMonth(), targetDay)
  return candidate < previousEnd ? candidate : previousEnd
}

function comparablePeriodLabel(start, end) {
  const monthName = date => date.toLocaleDateString('pt-BR', { month: 'short' }).replace('.', '')
  const sameYear = start.getFullYear() === end.getFullYear()
  const sameMonth = sameYear && start.getMonth() === end.getMonth()
  if (sameMonth) return `${monthName(start)}/${start.getFullYear()}`
  if (sameYear) return `${monthName(start)}–${monthName(end)}/${end.getFullYear()}`
  return `${monthName(start)}/${start.getFullYear()}–${monthName(end)}/${end.getFullYear()}`
}

export function buildPresentationCommercialAnalytics({
  orders = [], classifications = [], currentRange, previousRange,
  year, focusQuarter, today = new Date(),
}) {
  const lookup = new Map(classifications.map(row => [
    normalizeCode(`${row.codproduto}/${row.codproduto_clas || 1}`), row,
  ]))
  const alignedPreviousEnd = comparablePreviousEnd({
    orders, currentStart: currentRange.start, currentEnd: currentRange.end,
    nominalEnd: currentRange.nominalEnd || currentRange.end,
    previousStart: previousRange.start, previousEnd: previousRange.end,
  })
  const current = summarize(orders, lookup, isoLocal(currentRange.start), isoLocal(currentRange.end))
  const previous = summarize(orders, lookup, isoLocal(previousRange.start), isoLocal(alignedPreviousEnd))
  const previousIsAligned = isoLocal(alignedPreviousEnd) !== isoLocal(previousRange.end)
  const comparisonLabel = previousIsAligned
    ? comparablePeriodLabel(previousRange.start, alignedPreviousEnd)
    : null

  const quarters = [1, 2, 3, 4].map(quarter => {
    const bounds = quarterBounds(year, quarter)
    const future = bounds.start > today
    const partial = !future && bounds.end > today
    const summary = future ? summaryEmpty() : summarize(orders, lookup,
      isoLocal(bounds.start), isoLocal(partial ? today : bounds.end))
    if (quarter === 1 || future) return { ...summary, quarter, future, partial, comparablePrevious: null }

    const prior = quarterBounds(year, quarter - 1)
    const priorEnd = partial ? comparablePreviousEnd({
      orders, currentStart: bounds.start, currentEnd: today,
      nominalEnd: bounds.end, previousStart: prior.start, previousEnd: prior.end,
    }) : prior.end
    const comparablePrevious = summarize(orders, lookup, isoLocal(prior.start), isoLocal(priorEnd))
    const comparisonPeriod = isoLocal(priorEnd) === isoLocal(prior.end)
      ? `${quarter - 1}º trimestre completo`
      : comparablePeriodLabel(prior.start, priorEnd)
    return { ...summary, quarter, future, partial, comparablePrevious, comparisonPeriod }
  })
  const focus = quarters[Math.max(0, Math.min(3, focusQuarter - 1))]
  const focusPrevious = focus.comparablePrevious
  const focusComparisonPeriod = focus.comparisonPeriod || null
  const latestOrderDate = orders.map(row => String(row?.sale_date || '').slice(0, 10))
    .filter(date => date && date <= isoLocal(today)).sort().at(-1) || null

  return {
    year, current, previous, quarters, focus, focusPrevious, focusComparisonPeriod,
    alignedPreviousEnd: isoLocal(alignedPreviousEnd), previousIsAligned, comparisonLabel,
    latestOrderDate,
    categoryLabels: ['Núcleos', 'Minerais', 'Proteinados', 'Aditivos', 'Aminoácidos', 'Premix', 'Matérias-primas', 'Outros / não classificado'],
    marketLabels: ['Bovinos', 'Suínos', 'Outros / não classificado'],
    months: [3 * (focusQuarter - 1) + 1, 3 * (focusQuarter - 1) + 2, 3 * (focusQuarter - 1) + 3],
  }
}

export function valueRow(rows, name) {
  return rows.find(row => row.name === name) || { name, value: 0, kg: 0, kgValue: 0 }
}

export function percentageDelta(current, previous) {
  if (!previous) return current ? 'Novo' : '—'
  const delta = (current - previous) / Math.abs(previous) * 100
  return `${delta > 0 ? '+' : ''}${delta.toFixed(1).replace('.', ',')}%`
}

export function totalShare(value, total) {
  return total ? value / total * 100 : 0
}
