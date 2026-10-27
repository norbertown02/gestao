// Status visual dos pedidos a partir do estágio oficial e quantidades efetivamente faturadas.
// Mantém cancelamentos e estornos prioritários.
export function commercialOrderStage(row) {
  const stage = row?.order_stage || 'sem_faturamento'
  if (stage !== 'em_aberto') return stage
  const billedQuantity = Number(row?.quantity_invoiced || 0)
  const openQuantity = Number(row?.quantity_open || 0)
  const netFiscal = Number(row?.fiscal_net_value || 0)
  if (openQuantity > 0 && (billedQuantity > 0 || netFiscal > 0.01)) return 'parcial'
  return stage
}

export const commercialStageLabel = {
  em_aberto: 'Em aberto',
  parcial: 'Parcial',
  faturado: 'Faturado',
  estornado: 'Estornado',
  cancelado: 'Cancelado',
  cancelado_apos_faturamento: 'Cancelado após faturamento',
  sem_faturamento: 'Sem faturamento',
}
