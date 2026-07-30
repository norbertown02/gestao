const excludedOrderStages = new Set(['cancelado', 'cancelado_apos_faturamento'])

export function netOrderValue(row) {
  if (excludedOrderStages.has(row?.order_stage)) return 0

  const orderValue = Number(row?.order_value || 0)
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
