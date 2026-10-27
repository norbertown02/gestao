import { useMemo, useState } from 'react'
import { IconArrowRight, IconChartBar, IconFilter, IconLayersIntersect, IconPackage, IconTrendingUp } from '@tabler/icons-react'
import { groupBudgetComparison, prepareBudgetComparison, sumBudgetComparison } from '../lib/budgetComparison'
import './BudgetExecutiveBreakdown.css'

const money = value => Number(value || 0).toLocaleString('pt-BR',{style:'currency',currency:'BRL'})
const tonne = value => (Number(value || 0)/1000).toLocaleString('pt-BR',{maximumFractionDigits:2})+' t'
const percent = (budget,base) => base > 0 ? (budget / base - 1)*100 : null
const deltaText = (budget,base) => {
  const change=percent(budget,base)
  if (change === null) return budget > 0 ? 'Novo' : '—'
  return (change > 0 ? '+' : '')+change.toLocaleString('pt-BR',{maximumFractionDigits:1})+'%'
}
const deltaClass = (budget,base) => {
  const change=percent(budget,base)
  if (change===null) return budget>0?'is-new':'is-neutral'
  return change>=0?'is-positive':'is-negative'
}
const sum = (rows,key)=>rows.reduce((a,row)=>a+Number(row[key]||0),0)

function CompareMarketCard({ group, branches, allPrior }) {
  const share=allPrior>0 ? Math.max(0,group.plannedAmount / allPrior) : 0
  return <article className="bex-market-card">
    <div className="bex-market-title"><span>{group.name}</span><strong className={deltaClass(group.plannedAmount,group.priorAmount)}>{deltaText(group.plannedAmount,group.priorAmount)}</strong></div>
    <strong className="bex-market-value">{money(group.plannedAmount)}</strong>
    <div className="bex-market-prev">Faturamento anterior <strong>{money(group.priorAmount)}</strong></div>
    <div className="bex-market-bar"><span style={{width:Math.min(100,share*100)+'%'}}/></div>
    <div className="bex-market-kg"><span>Volume anterior <strong>{tonne(group.priorKg)}</strong></span><span>Volume previsto <strong>{tonne(group.plannedKg)}</strong></span></div>
    {group.name==='Bovinos'&&branches.length>0&&<div className="bex-market-branches">
      {branches.map(branch=><div key={branch.name}><span>{branch.name}</span><strong>{money(branch.plannedAmount)}</strong></div>)}
    </div>}
  </article>
}
function CategoryLine({ group, maxBudget }) {
  return <div className="bex-category-line">
    <div className="bex-category-name"><strong>{group.name}</strong><small>{group.products} {group.products===1?'produto':'produtos'}</small></div>
    <div className="bex-category-metrics">
      <div><small>Faturamento anterior</small><span>{money(group.priorAmount)}</span></div>
      <div><small>Budget</small><strong>{money(group.plannedAmount)}</strong></div>
      <div className={'bex-delta '+deltaClass(group.plannedAmount,group.priorAmount)}>{deltaText(group.plannedAmount,group.priorAmount)}</div>
    </div>
    <div className="bex-category-bar"><span style={{width:Math.min(100,group.plannedAmount/Math.max(maxBudget,1)*100)+'%'}}/></div>
    <div className="bex-category-kg">{tonne(group.priorKg)} anterior <span>·</span> {tonne(group.plannedKg)} previsto</div>
  </div>
}

export default function BudgetExecutiveBreakdown({ cycle, assignments, budgetItems, billedItems,
  products, categories, classifications, sellers, periodStart, periodEnd }) {
  const [sellerId,setSellerId] = useState('all')
  const [allProducts,setAllProducts] = useState(false)
  const factor = (cycle?.months?.length||3)/3
  const sellerById = useMemo(()=>new Map(sellers.map(p=>[p.id,p.name])),[sellers])
  const comparable=useMemo(()=>assignments.filter(a=>
    ['submitted','approved'].includes(a.status)||
    budgetItems.some(row=>row.seller_id===a.seller_id&&Number(row.quantity_kg)>0)),
    [assignments,budgetItems])
  const sellerIds=useMemo(()=>sellerId==='all'
    ? comparable.map(p=>p.seller_id)
    : comparable.some(p=>p.seller_id===sellerId)?[sellerId]:[],
    [comparable,sellerId])
  const rows=useMemo(()=>prepareBudgetComparison({
    budgetItems,billedItems,products,categories,classifications,sellerIds,periodFactor:factor,
  }),[budgetItems,billedItems,products,categories,classifications,sellerIds,factor])
  const markets=useMemo(()=>groupBudgetComparison(rows,'market'),[rows])
  const branches=useMemo(()=>groupBudgetComparison(rows.filter(row=>row.market==='Bovinos'),'branch')
    .filter(row=>row.name!=='Bovinos'),[rows])
  const kinds=useMemo(()=>groupBudgetComparison(rows,'category'),[rows])
  const totals=useMemo(()=>sumBudgetComparison(rows),[rows])
  const maxCategoryAmount=Math.max(...kinds.map(c=>c.plannedAmount),1)
  const displayedProducts=allProducts?rows:rows.slice(0,10)
  const hasInput=sellerIds.length>0
  const labels=periodStart&&periodEnd?new Date(periodStart+'T12:00:00').toLocaleDateString('pt-BR')+
    ' a '+new Date(periodEnd+'T12:00:00').toLocaleDateString('pt-BR'):
    'últimos três meses fechados'

  return <section className="bex-report">
    <header className="bex-report-header">
      <div><span className="bex-kicker">VISÃO GERENCIAL</span><h3>Composição e evolução do budget</h3>
        <p>Veja como o planejamento muda o faturamento por produto, mercado e tipo de suplemento.</p></div>
      <label className="bex-filter"><IconFilter size={16}/>
        <select aria-label="Vendedor analisado" value={sellerId} onChange={e=>{setSellerId(e.target.value);setAllProducts(false)}}>
          <option value="all">Equipe com previsão</option>
          {assignments.map(a=><option key={a.seller_id} value={a.seller_id}>{sellerById.get(a.seller_id)||'Vendedor'}</option>)}
        </select>
      </label>
    </header>
    <div className="bex-method">
      <span>Faturamento anterior: <strong>NF de venda líquida de devoluções</strong>, {labels}</span>
      <span>Budget: <strong>{cycle.months.length} {cycle.months.length===1?'mês':'meses'}</strong>. O histórico é proporcionalizado para o mesmo período.</span>
    </div>
    {!hasInput ? <div className="bex-no-data">
      <IconChartBar size={25}/>
      <strong>Sem previsão preenchida neste filtro</strong>
      <p>O comparativo será exibido assim que o vendedor lançar volumes ou enviar seu budget. Não consideramos valores em branco como queda nas vendas.</p>
    </div> : <>
      <div className="bex-section">
        <div className="bex-section-heading"><div><span className="bex-kicker">01 / PRODUTOS</span><h4>Previsão por produto</h4><p>Faturamento anterior, projeção e crescimento de cada produto.</p></div><small>{rows.length} produtos</small></div>
        <div className="bex-product-table">
          <div className="bex-product-head"><span>Produto</span><span>Faturamento anterior</span><span>Budget previsto</span><span>Variação</span><span>Volume (anterior / previsto)</span></div>
          {displayedProducts.map(row=><div className="bex-product-row" key={row.id}>
            <div className="bex-product-title"><strong>{row.name}</strong><small>{row.category} · {row.market==='Bovinos'?'Bovinos '+row.branch.toLowerCase():row.market}</small></div>
            <span className="bex-money">{money(row.priorAmount)}</span>
            <strong className="bex-money">{money(row.plannedAmount)}</strong>
            <span className={'bex-delta '+deltaClass(row.plannedAmount,row.priorAmount)}>{deltaText(row.plannedAmount,row.priorAmount)}</span>
            <span className="bex-kg">{tonne(row.priorKg)} <IconArrowRight size={12}/> <strong>{tonne(row.plannedKg)}</strong></span>
          </div>)}
          {rows.length===0&&<div className="bex-no-rows">Nenhum produto encontrado neste planejamento.</div>}
          {rows.length>10&&<button className="bex-see-more" onClick={()=>setAllProducts(prev=>!prev)}>
            {allProducts?'Exibir somente os 10 principais':'Ver todos os '+rows.length+' produtos'}
            <IconArrowRight size={15}/>
          </button>}
          {rows.length>0&&<div className="bex-product-total">
            <strong>Total comparável</strong><span>{money(totals.priorAmount)}</span>
            <strong>{money(totals.plannedAmount)}</strong><span className={'bex-delta '+deltaClass(totals.plannedAmount,totals.priorAmount)}>{deltaText(totals.plannedAmount,totals.priorAmount)}</span>
            <span className="bex-kg">{tonne(totals.priorKg)} <IconArrowRight size={12}/> <strong>{tonne(totals.plannedKg)}</strong></span>
          </div>}
        </div>
      </div>
      <div className="bex-section">
        <div className="bex-section-heading"><div><span className="bex-kicker">02 / MERCADO</span><h4>Bovinos e suínos</h4><p>Projeção por espécie, com separação de leite e corte dentro dos bovinos.</p></div></div>
        <div className="bex-market-grid">
          {['Bovinos','Suínos','Multiespécie','A classificar','Outros']
            .filter(m=>['Bovinos','Suínos'].includes(m)||markets.some(v=>v.name===m))
            .map(m=> {
              const group=markets.find(x=>x.name===m)||{name:m,plannedAmount:0,priorAmount:0,plannedKg:0,priorKg:0}
              return <CompareMarketCard key={m} group={group} branches={branches} allPrior={totals.plannedAmount}/>
            })}
        </div>
      </div>
      <div className="bex-section">
        <div className="bex-section-heading"><div><span className="bex-kicker">03 / TIPO</span><h4>Tipos de produto</h4><p>Mineral, Núcleo e Aditivos. As classificações técnicas continuam preservadas no cadastro.</p></div></div>
        <div className="bex-category-list">
          {kinds.map(group=><CategoryLine key={group.name} group={group} maxBudget={maxCategoryAmount}/>)}
          {!kinds.length&&<div className="bex-no-rows">Sem categorias para o período selecionado.</div>}
        </div>
      </div>
      <div className="bex-footnote">
        <IconLayersIntersect size={16}/>
        <span>As linhas com faturamento anterior e sem previsão aparecem com redução provisória enquanto o budget estiver em preenchimento. Notas fiscais são consideradas pelos itens, com devoluções e diferenças de descontos alocadas proporcionalmente. Produtos multiespécie e ainda não classificados não são atribuídos artificialmente a bovinos ou suínos.</span>
      </div>
    </>}
  </section>
}
