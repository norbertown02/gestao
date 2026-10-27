// Consolidação comercial do Budget. Todos os valores monetários de referência
// vêm de notas fiscais, com devoluções e descontos já reconciliados no banco.
// Não transformar a ausência de orçamento do vendedor em uma queda de -100%.
import { COMMERCIAL_CATEGORIES, commercialCategory } from './productTaxonomy'

const numeric = value => Number(value) || 0

const MARKET_ORDER = ['Bovinos','Suínos','Multiespécie','A classificar','Outros']
const CATEGORY_ORDER = COMMERCIAL_CATEGORIES

function marketFor(product, classification) {
  const market = (classification?.market || '').toLowerCase()
  if (market === 'bovinos') return 'Bovinos'
  if (market === 'suínos' || market === 'suinos') return 'Suínos'
  if (market === 'multiespécie' || market === 'multiespecie') return 'Multiespécie'
  if (market === 'não aplicável' || market === 'nao aplicavel') return 'Outros'
  if (product?.application_id?.startsWith('bovinos')) return 'Bovinos'
  if (product?.application_id === 'suinos') return 'Suínos'
  return 'A classificar'
}
function useFor(product, classification, market) {
  if (market !== 'Bovinos') return market
  if (product?.application_id === 'bovinos_leite') return 'Leite'
  if (product?.application_id === 'bovinos_corte') return 'Corte'
  if ((classification?.segment || '').toLowerCase() === 'leite') return 'Leite'
  if ((classification?.segment || '').toLowerCase() === 'corte') return 'Corte'
  return 'Bovinos'
}
function categoryFor(product, classification, categories) {
  const name = classification?.category || categories.get(product?.category_id)
  return commercialCategory(name, product?.name)
}

export function prepareBudgetComparison({ budgetItems = [], billedItems = [], products = [], categories = [],
  classifications = [], sellerIds = [], periodFactor = 1 }) {
  const selected = new Set(sellerIds)
  const productsById = new Map(products.map(p => [p.id, p]))
  const categoriesById = new Map(categories.map(p => [p.id, p.name]))
  const classificationByCode = new Map(classifications.map(c => [
    String(c.codproduto) + '/' + String(c.codproduto_clas || 1), c
  ]))
  const data = new Map()
  function getRow(productId, fallbackName) {
    if (data.has(productId)) return data.get(productId)
    const product = productsById.get(productId)
    const code = product?.ultra_codproduto == null ? '' :
      String(product.ultra_codproduto) + '/' + String(product.ultra_codproduto_clas || 1)
    const classification = classificationByCode.get(code)
    const market = marketFor(product, classification)
    const row = {
      id:productId, name:product?.name || fallbackName || productId,
      market, branch:useFor(product,classification,market),
      category:categoryFor(product,classification,categoriesById),
      priorAmount:0, priorKg:0, plannedAmount:0, plannedKg:0,
    }
    data.set(productId,row)
    return row
  }
  for (const line of billedItems) {
    if (!selected.has(line.seller_id)) continue
    const row = getRow(line.product_id, line.product_name)
    row.priorAmount += numeric(line.billed_amount) * periodFactor
    row.priorKg += numeric(line.billed_kg) * periodFactor
  }
  for (const line of budgetItems) {
    if (!selected.has(line.seller_id)) continue
    const row = getRow(line.product_id)
    row.plannedAmount += numeric(line.quantity_kg) * numeric(line.unit_price)
    row.plannedKg += numeric(line.quantity_kg)
  }
  return [...data.values()]
    .filter(row => Math.abs(row.plannedAmount) > .001 || Math.abs(row.priorAmount) > .001 ||
      Math.abs(row.plannedKg) > .001 || Math.abs(row.priorKg) > .001)
    .sort((a,b)=> Math.max(b.plannedAmount,b.priorAmount) - Math.max(a.plannedAmount,a.priorAmount))
}

export function sumBudgetComparison(rows) {
  return rows.reduce((total,r) => ({
    priorAmount:total.priorAmount+r.priorAmount,
    plannedAmount:total.plannedAmount+r.plannedAmount,
    priorKg:total.priorKg+r.priorKg,
    plannedKg:total.plannedKg+r.plannedKg,
  }), {priorAmount:0,plannedAmount:0,priorKg:0,plannedKg:0})
}

export function groupBudgetComparison(rows, key) {
  const grouped = new Map()
  for (const row of rows) {
    if (key === 'category' && !row.category) continue // itens operacionais sem categoria comercial
    const label=row[key] || 'A classificar'
    if (!grouped.has(label)) grouped.set(label,{name:label,priorAmount:0,plannedAmount:0,priorKg:0,plannedKg:0,products:0})
    const group=grouped.get(label)
    group.priorAmount+=row.priorAmount
    group.plannedAmount+=row.plannedAmount
    group.priorKg+=row.priorKg
    group.plannedKg+=row.plannedKg
    group.products+=1
  }
  const priority = key==='market' ? MARKET_ORDER : key==='category' ? CATEGORY_ORDER : []
  return [...grouped.values()].sort((a,b)=>{
    if (key==='market') return (priority.indexOf(a.name)<0?999:priority.indexOf(a.name))-
      (priority.indexOf(b.name)<0?999:priority.indexOf(b.name))
    const weightA=Math.max(a.plannedAmount,a.priorAmount)
    const weightB=Math.max(b.plannedAmount,b.priorAmount)
    if(weightA !== weightB) return weightB-weightA
    return a.name.localeCompare(b.name,'pt-BR')
  })
}
