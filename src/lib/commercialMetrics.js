const excludedOrderStages = new Set(['cancelado', 'cancelado_apos_faturamento'])

const ORDER_NET_VALUE_FIELDS = [
  'order_net_value',
  'net_order_value',
  'net_value',
  'valor_liquido',
  'valor_liquido_pedido',
  'liquid_value',
  'total_liquido',
]

const ORDER_GROSS_VALUE_FIELDS = [
  'order_value',
  'gross_order_value',
  'gross_value',
  'valor_bruto',
  'valor_bruto_pedido',
  'total_bruto',
]

function firstNumeric(row, fields) {
  for (const field of fields) {
    const value = Number(row?.[field])
    if (Number.isFinite(value) && value !== 0) return value
  }
  return 0
}

export function grossOrderValue(row) {
  return firstNumeric(row, ORDER_GROSS_VALUE_FIELDS)
}

export function orderBaseValue(row) {
  return firstNumeric(row, ORDER_NET_VALUE_FIELDS) || grossOrderValue(row)
}

export function netOrderValue(row) {
  if (excludedOrderStages.has(row?.order_stage)) return 0

  const orderValue = orderBaseValue(row)
  const returnedValue = Math.abs(Number(row?.fiscal_returned_value || 0))

  return Math.max(orderValue - returnedValue, 0)
}

export function hasNetOrderValue(row) {
  return netOrderValue(row) > 0
}

export function fiscalDocumentValue(row) {
  const value = Math.abs(Number(row?.document_total || 0))
  if (row?.movement_type === 'devolucao') return -value
  if (row?.movement_type === 'venda') return value
  return 0
}
