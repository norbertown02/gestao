// Agrupamento exclusivamente gerencial: preserva a classificação técnica do Ultra.
export const COMMERCIAL_CATEGORIES = ['Mineral', 'Núcleo', 'Aditivos']

function clean(value) {
  return String(value || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().trim()
}

export function commercialCategory(rawCategory, productName = '') {
  const raw = clean(rawCategory)
  const name = clean(productName)
  if (/amino|aditiv|enzim|levedur|lisina|metionina|treonina|triptofano|valina/.test(raw)) return 'Aditivos'
  if (/nucleo|premix/.test(raw)) return 'Núcleo'
  if (/mineral|protein|materia.prima|fonte mineral|fosfat/.test(raw)) return 'Mineral'
  // Sem categoria técnica: usar somente a denominação comercial como fallback.
  if (/lisina|metionina|treonina|triptofano|valina|detox|levedur|biotin|aditiv/.test(name)) return 'Aditivos'
  if (/nucleo|premix|lacto (bm|ade|max|future|pre parto)|confina|rumen pro/.test(name)) return 'Núcleo'
  if (/phos|phos|fosfat|protein|protei|gold|mineral|sal|calcario|repro/.test(name)) return 'Mineral'
  // Produtos sem classificação não devem ser atribuídos arbitrariamente.
  return null
}
