export const CURRENT_YEAR = new Date().getFullYear()
export const CURRENT_MONTH = new Date().getMonth() + 1

export const monthOptions = Array.from({ length: 12 }, (_, index) => ({
  value: index + 1,
  label: new Date(2024, index, 1).toLocaleDateString('pt-BR', { month: 'long' }),
}))

export const yearOptions = Array.from({ length: 6 }, (_, index) => CURRENT_YEAR - index)

export function periodRange(period, year, month) {
  const today = new Date()
  const isCurrentMonth = year === today.getFullYear() && month === today.getMonth() + 1
  const end = isCurrentMonth ? today : new Date(year, month, 0)

  if (period === 'mes') return [new Date(year, month - 1, 1), end]
  if (period === 'trimestre') return [new Date(year, month - 3, 1), end]
  if (period === 'semestre') return [new Date(year, month - 6, 1), end]

  return [new Date(year, 0, 1), end]
}

export function previousPeriodRange(period, year, month) {
  const [start, end] = periodRange(period, year, month)
  const previousEnd = new Date(start)
  previousEnd.setDate(previousEnd.getDate() - 1)
  const duration = end.getTime() - start.getTime()

  return [new Date(previousEnd.getTime() - duration), previousEnd]
}

export function historyStart(year, month, months = 6) {
  return new Date(year, month - months, 1)
}
