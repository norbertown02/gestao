// Identifica subtotal explicitamente marcado e reconciliado com contas analíticas.
// Não exclui rubricas por nome ou valor isolado: exige evidência dentro do mesmo grupo.
const val=v=>Number(v||0)
const cents=v=>Math.round(val(v)*100)
export function analyzeDreSection(rows=[],section) {
  const sectionRows=rows.filter(r=>r.secao===section)
  const aggregate=sectionRows.reduce((s,r)=>s+val(r.valor),0)
  const marked=sectionRows.filter(r=>String(r.conta||'').trim().endsWith('*'))
  const excluded=new Set()
  const matched=[]
  for(const parent of marked){
    const siblings=sectionRows.filter(r=>r!==parent && r.grupo===parent.grupo && !excluded.has(r))
    const target=cents(parent.valor)
    const exact=siblings.filter(r=>cents(r.valor)===target)
    // A regra só aceita um único filho igual ou a soma de todos os filhos do grupo.
    const children=exact.length===1?[exact[0]]:(siblings.length>0&&siblings.reduce((s,r)=>s+cents(r.valor),0)===target?siblings:[])
    if(!children.length)continue
    excluded.add(parent)
    matched.push({subtotal:parent,children,amount:val(parent.valor)})
  }
  const cleanRows=sectionRows.filter(r=>!excluded.has(r))
  const cleanTotal=cleanRows.reduce((s,r)=>s+val(r.valor),0)
  return {aggregate,cleanTotal,rows:cleanRows,subtotals:matched,excludedAmount:aggregate-cleanTotal}
}
