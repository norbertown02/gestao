import { analyzeDreSection } from './financeAuditStructure'
const n=value=>Number(value||0)
const close=(a,b,tolerance=1)=>Math.abs(n(a)-n(b))<=tolerance
const pctDiff=(a,b)=>Math.abs(n(b))?Math.abs(n(a)-n(b))/Math.abs(n(b))*100:(n(a)?100:0)
const money=value=>n(value).toLocaleString('pt-BR',{style:'currency',currency:'BRL'})

function runBaseFinanceAudit({dre,managerial,balance,accounts=[],dreAccounts=[],previousAccounts=[],previousManagerial,files=[]}) {
  const findings=[]
  const add=(severity,category,title,description,evidence,action)=>findings.push({id:`${category}-${findings.length}`,severity,category,title,description,evidence,action})
  const ok=(category,title,description,evidence)=>add('ok',category,title,description,evidence,'Nenhuma ação necessária.')
  const sourceNames={dre:'DRE Comparativo',gerencial:'Relatório Gerencial',balanco:'Balanço Financeiro',balancete:'Balancete',contas_pagar:'Contas a Pagar',contas_receber:'Contas a Receber'}
  const present=new Set((files||[]).map(file=>file.report_type))
  const hasFullBalance=Boolean(balance&&(n(balance.ativo_total)!==0||n(balance.passivo_total)!==0))

  ;['dre','gerencial','balanco','balancete'].forEach(type=>{
    const structured=type==='dre'?dre:type==='gerencial'?managerial:type==='balanco'?hasFullBalance:accounts.length
    if(structured) ok('Documentação',`${sourceNames[type]} disponível`,'A fonte está estruturada e participa dos cruzamentos.',present.has(type)?'Arquivo processado pela Central.':'Dados existentes no sistema; arquivo não consta na Central.')
    else add('info','Documentação',`${sourceNames[type]} ausente`,`A auditoria desta competência fica limitada sem essa fonte.`,type==='balanco'&&balance?'Há saldos parciais de previsões, mas o Balanço Financeiro completo não foi processado.':present.has(type)?'Existe arquivo, mas não há dados estruturados.':'Nenhum dado estruturado ou arquivo processado.','Enviar e processar o relatório quando estiver disponível.')
  })

  if(dre){
    const checks=[
      ['Margem de contribuição',n(dre.receitas)-n(dre.custos_variaveis),dre.margem_contribuicao,'Receitas - custos variáveis'],
      ['Resultado operacional',n(dre.margem_contribuicao)-n(dre.custos_fixos),dre.resultado_operacional,'Margem - custos fixos'],
      ['Resultado líquido',n(dre.resultado_operacional)-n(dre.extra_operacional),dre.resultado_liquido,'Resultado operacional - extra operacional'],
    ]
    checks.forEach(([label,expected,actual,formula])=>close(expected,actual)?ok('Integridade matemática',`${label} fecha matematicamente`,formula,`Calculado ${money(expected)} | informado ${money(actual)}`):add('critical','Integridade matemática',`${label} não fecha`,`${formula} apresenta diferença.`,`Calculado ${money(expected)} | informado ${money(actual)} | diferença ${money(expected-n(actual))}`,'Revisar a classificação ou o total do DRE no ULTRA.'))
    const sectionTotals={receitas:n(dre.receitas),custos_variaveis:n(dre.custos_variaveis),custos_fixos:n(dre.custos_fixos),extra_operacional:n(dre.extra_operacional)}
    Object.entries(sectionTotals).forEach(([section,total])=>{
      const analysis=analyzeDreSection(dreAccounts,section)
      const accountTotal=analysis.cleanTotal
      if(close(accountTotal,total)) ok('Contas detalhadas',`${section.replaceAll('_',' ')} conciliado`,analysis.subtotals.length?'Conciliação correta após identificar subtotais que repetem valores de contas analíticas.':'A soma das contas corresponde ao total da seção.',`Contas ${money(accountTotal)} | total ${money(total)}${analysis.subtotals.length?' | subtotais não duplicados '+analysis.subtotals.map(s=>s.subtotal.conta+': '+money(s.amount)).join('; '):''}`)
      else add(dreAccounts.some(row=>row.secao===section)?'critical':'info','Contas detalhadas',`Contas não fecham em ${section.replaceAll('_',' ')}`,'Existem valores no total sem correspondência completa nas contas detalhadas.',`Contas ${money(accountTotal)} | total ${money(total)} | diferença ${money(total-accountTotal)}`,'Abrir o DRE no nível mais baixo e localizar a conta ausente ou duplicada.')
    })
  }

  if(hasFullBalance){
    const ar=n(balance.contas_receber_vencido)+n(balance.contas_receber_a_vencer_curto)+n(balance.contas_receber_a_vencer_medio)+n(balance.duplicatas_descontadas)
    const ap=n(balance.contas_pagar_vencido_curto)+n(balance.contas_pagar_vencido_medio)+n(balance.contas_pagar_a_vencer_curto)+n(balance.contas_pagar_a_vencer_medio)+n(balance.contas_pagar_a_vencer_longo)
    const availability=n(balance.caixa)+n(balance.bancos)
    ;[
      ['Ativo e passivo',balance.ativo_total,balance.passivo_total],
      ['Disponibilidades',balance.disponibilidades,availability],
      ['Contas a receber',balance.contas_receber_total,ar],
      ['Contas a pagar',balance.contas_pagar_total,ap],
    ].forEach(([label,reported,calculated])=>close(reported,calculated,Math.max(1,Math.abs(n(reported))*.0001))?ok('Balanço',`${label} conciliado`,'A composição fecha com o total informado.',`Informado ${money(reported)} | composição ${money(calculated)}`):add('critical','Balanço',`${label} não fecha`,'O total informado difere da soma de sua composição.',`Informado ${money(reported)} | composição ${money(calculated)} | diferença ${money(n(reported)-n(calculated))}`,'Revisar filtros, faixas de vencimento e lançamentos que compõem o Balanço.'))
  }

  if(dre&&managerial){
    const salesGap=pctDiff(dre.receitas,managerial.vendas_total)
    if(Math.abs(n(dre.receitas)-n(managerial.vendas_total))<=Math.max(250,n(managerial.vendas_total)*.005))ok('Cruzamento', 'Receita conciliada entre DRE e Gerencial','Os dois relatórios apresentam vendas compatíveis.',`DRE ${money(dre.receitas)} | Gerencial ${money(managerial.vendas_total)}`)
    else add(salesGap>5?'critical':'warning','Cruzamento','Receita diverge entre DRE e Gerencial','Os relatórios apresentam bases diferentes para as vendas do mesmo mês.',`DRE ${money(dre.receitas)} | Gerencial ${money(managerial.vendas_total)} | diferença ${salesGap.toFixed(1)}%`,'Conferir devoluções, data de emissão, cancelamentos e regime utilizado.')
    const cmv=dreAccounts.filter(row=>row.secao==='custos_variaveis'&&row.grupo==='CUSTO').reduce((s,row)=>s+n(row.valor),0)
    if(close(cmv,managerial.custo,Math.max(50,n(managerial.custo)*.005)))ok('Cruzamento','CMV conciliado com o Gerencial','O custo de mercadoria está consistente entre as fontes.',`DRE ${money(cmv)} | Gerencial ${money(managerial.custo)}`)
    else add('warning','Cruzamento','CMV diverge do custo gerencial','O custo reconhecido no DRE não corresponde ao custo das vendas do Gerencial.',`DRE ${money(cmv)} | Gerencial ${money(managerial.custo)} | diferença ${money(Math.abs(cmv-n(managerial.custo)))}`,'Conferir CMV automático, devoluções e custo dos produtos vendidos.')
  }

  // Cruzar apenas saldos comparáveis: estoque e bancos na mesma competência.
  // ar_geradas_ate e ap_geradas_ate não representam necessariamente saldo em aberto;
  // por isso nunca são comparados diretamente ao balanço.
  if(hasFullBalance&&managerial){
    for(const [label,key,balanceKey,managerKey] of [
      ['Estoque','stock','estoque','estoque_valor'],
      ['Saldo bancário','banks','bancos','bancos_saldo']
    ]){
      const left=n(balance[balanceKey]),right=n(managerial[managerKey])
      const delta=Math.abs(left-right)
      const threshold=Math.max(100,Math.max(Math.abs(left),Math.abs(right))*.005)
      if(delta<=threshold)ok('Cruzamento',`${label} conciliado`,'Mesma competência e valores dentro da tolerância.',`Balanço ${money(left)} | Gerencial ${money(right)} | diferença ${money(delta)}`)
      else add('warning','Cruzamento',`${label} diverge entre relatórios`,'Os dois relatórios informam posições de saldo distintas na mesma competência.',`Balanço ${money(left)} | Gerencial ${money(right)} | diferença ${money(delta)}`,'Conferir saldo analítico na mesma data de corte.')
    }
  }

  const rank={critical:0,warning:1,review:2,info:3,ok:4}
  return findings.sort((a,b)=>rank[a.severity]-rank[b.severity])
}

const numeric=value=>Number(value||0)
const normalize=value=>String(value||'').trim().normalize('NFD').replace(/[\u0300-\u036f]/g,'').toUpperCase()
const isoMonth=value=>String(value||'').slice(0,7)
const diff=(a,b)=>Math.abs(numeric(a)-numeric(b))
const amountBR=value=>numeric(value).toLocaleString('pt-BR',{style:'currency',currency:'BRL'})
const issue=(id,severity,category,title,description,evidence,action,amount=null,source='Relatórios importados')=>({id,severity,category,title,description,evidence,action,amount,source})
const tolerance=(base=0)=>Math.max(1,Math.abs(numeric(base))*.001)

export function runFinanceAudit(input) {
  const base=runBaseFinanceAudit(input)
  const extra=[]
  const {year,month,accounts=[],previousAccounts=[],managerial,previousManagerial,dre,files=[],allAccounts=[],orders=[],orderItems=[],maturities=[],balance}=input
  const competence=year&&month?`${year}-${String(month).padStart(2,'0')}`:''
  const uniqueRows=new Map()
  const append=(...args)=>extra.push(issue(...args))

  // Conferir identidade e periodo antes de comparar saldos ou movimentos.
  const current=accounts.filter(r=>isoMonth(r.competencia_date)===competence)
  const dateStart=`${competence}-01`,dateEnd=new Date(year,month,0).toISOString().slice(0,10)
  const ranges=[...new Set(current.map(r=>`${r.period_start||'?'} / ${r.period_end||'?'}`))]
  if(current.some(r=>r.period_start!==dateStart||r.period_end!==dateEnd)){
    append('period-balancete','info','Origem dos dados','Balancete não corresponde ao mês civil','O arquivo possui período acumulado, parcial ou diferente da competência selecionada.',`Período esperado: ${dateStart} a ${dateEnd}. Encontrado: ${ranges.join('; ')}`,'Reimportar o balancete mensal ou utilizar a comparação de acumulados compatíveis. Não cruzar movimentações de bases distintas.',null,'Balancete')
  }
  const periodCompatible=current.length>0 && current.every(r=>r.period_start===dateStart&&r.period_end===dateEnd)
  for(const file of files){
    if(file.status!=='processado')append(`file-${file.id}`,'info','Importação','Arquivo financeiro não processado',`${file.file_name||file.report_type}: ${file.status||'sem status'}`,file.validation_message||'Processamento pendente','Verificar a importação original antes de interpretar as conciliações.',null,'Central de importação')
  }
  const processed=new Map()
  for(const file of files.filter(f=>f.status==='processado'))processed.set(file.report_type,(processed.get(file.report_type)||0)+1)
  for(const [type,count] of processed)if(count>1)append(`duplicate-files-${type}`,'info','Importação',`Mais de um arquivo ${type} processado`,`${count} arquivos do mesmo tipo constam da competência.`,files.filter(f=>f.report_type===type).map(f=>f.file_name).join(' · '),'Identificar a versão vigente e evitar somar importações substituídas.',null,'Central de importação')

  if(periodCompatible){
    for(const row of current){
      const key=`${row.tipo||''}|${row.codigo||row.grupo+'|'+row.conta}`
      if(uniqueRows.has(key))append(`duplicate-account-${key}`,'warning','Balancete','Conta repetida no mesmo balancete',`${row.conta} consta mais de uma vez na mesma competência.`,`Conta ${row.codigo||row.conta} · ${ranges.join('; ')}`,'Conferir se são centros de custo distintos ou duplicação de importação.',null,'Balancete')
      uniqueRows.set(key,row)
      const previous=numeric(row.saldo_anterior),debit=numeric(row.debito),credit=numeric(row.credito),actual=numeric(row.saldo_atual)
      const d=diff(actual,previous+debit-credit),c=diff(actual,previous-debit+credit)
      if(Math.min(d,c)>tolerance(actual))append(`account-rollforward-${key}`,'critical','Integridade contábil',`Movimentação não reconcilia: ${row.conta}`,'Saldo anterior e movimentações não explicam o saldo final sob nenhuma das duas convenções de sinal.',`Anterior ${amountBR(previous)} · Débito ${amountBR(debit)} · Crédito ${amountBR(credit)} · Final ${amountBR(actual)} · menor diferença ${amountBR(Math.min(d,c))}`,'Verificar sinal, natureza da conta, saldos e a origem do balancete.',Math.min(d,c),'Balancete')
    }
    if(previousAccounts.length && previousAccounts.every(r=>r.period_start && r.period_end && isoMonth(r.period_start)===isoMonth(r.period_end))){
      const prior=new Map(previousAccounts.filter(r=>isoMonth(r.competencia_date)!=='' ).map(r=>[`${r.tipo||''}|${r.codigo||r.grupo+'|'+r.conta}`,r]))
      for(const [key,row] of uniqueRows){
        const previousRow=prior.get(key);if(!previousRow)continue
        const gap=diff(row.saldo_anterior,previousRow.saldo_atual)
        if(gap>tolerance(previousRow.saldo_atual))append(`account-continuity-${key}`,'warning','Continuidade dos saldos',`Saldo de abertura diverge: ${row.conta}`,'O saldo inicial não corresponde ao encerramento anterior.',`Abertura ${amountBR(row.saldo_anterior)} · encerramento anterior ${amountBR(previousRow.saldo_atual)} · diferença ${amountBR(gap)}`,'Verificar fechamento, reclassificações e se as duas fontes têm a mesma janela de apuração.',gap,'Balancete')
      }
    }
  }
  if(dre){
    const rows=input.dreAccounts||[]
    for(const section of ['receitas','custos_variaveis','custos_fixos','extra_operacional']){
      const analysis=analyzeDreSection(rows,section)
      if(analysis.subtotals.length) append(`subtotal-resolved-${section}`,'ok','Conciliação estrutural',`Subtotal não duplicado em ${section.replaceAll('_',' ')}`,'O relatório contém um total intermediário e sua conta detalhada; a soma foi normalizada sem excluir movimentações reais.',analysis.subtotals.map(x=>`${x.subtotal.conta} ${money(x.amount)} = ${x.children.map(y=>y.conta).join(' + ')}`).join('; '),'Nenhuma correção contábil necessária: a origem foi a hierarquia da importação.',null,'DRE detalhada')
    }
    const neutral=['APORTE SOCIOS','DEVOLUCAO DE APORTE AOS SOCIOS','EMPRESTIMO/FINANCIAMENTO','ADIANTAMENTO A FORNECEDOR']
    for(const row of rows.filter(r=>neutral.some(t=>normalize(r.conta).includes(t))&&r.secao!=='extra_operacional')){
      append(`neutral-${normalize(row.conta)}-${row.secao}`,'warning','Classificação de despesas','Possível movimentação patrimonial no resultado',`${row.conta} aparece em ${row.secao}.`,`${row.conta}: ${amountBR(row.valor)}`,'Conferir com a contabilidade se se trata de principal, capital, juros, estorno ou despesa efetiva.',Math.abs(numeric(row.valor)),'DRE detalhada')
    }
  }
  if(managerial){
    const salesExpected=numeric(managerial.vendas_a_vista)+numeric(managerial.vendas_a_prazo)
    const salesGap=diff(managerial.vendas_total,salesExpected)
    if(salesGap>tolerance(managerial.vendas_total))append('managerial-sales-split','warning','Integridade gerencial','Vendas à vista e a prazo não conciliam com o total','A composição de vendas não corresponde ao total gerencial.',`Total ${amountBR(managerial.vendas_total)} · composição ${amountBR(salesExpected)} · diferença ${amountBR(salesGap)}`,'Verificar descontos, devoluções e a definição de cada campo do Gerencial.',salesGap,'Relatório Gerencial')
    const profitGap=diff(managerial.lucro_bruto,numeric(managerial.vendas_total)-numeric(managerial.custo))
    if(profitGap>tolerance(managerial.vendas_total))append('managerial-gross-profit','warning','Integridade gerencial','Lucro bruto não reconcilia com vendas e custos','O resultado gerencial não corresponde à subtração direta de vendas menos custo.',`Diferença ${amountBR(profitGap)}`,'Conferir descontos, tributos, devoluções e demais componentes antes de classificar como erro.',profitGap,'Relatório Gerencial')

  }
  // Cobertura insuficiente não equivale a erro: indicadores de lacuna ficam em seção separada.
  if(!orderItems.length || !orderItems.some(x=>isoMonth(x.sale_date)===competence)){
    append('coverage-order-items','info','Cobertura','Itens comerciais não disponíveis para o mês','Não há itens vinculados às vendas da competência consultada.','A auditoria não consegue decompor custos por produto sem as transações correspondentes.','Disponibilizar itens fiscais e custo histórico, se a análise por produto for necessária.',null,'Integração Ultra')
  }
  append('coverage-historical-cmv','info','Cobertura','Custo histórico por item não integrado','A base de pedidos possui valores comerciais, mas não contém o custo histórico fiscal de cada produto.','Não é um erro no custo contabilizado. É uma limitação da análise de CMV por produto.','Consultar detalhamento de custo por item na integração do Ultra.',null,'Integração Ultra')
  append('coverage-titles','info','Cobertura','Títulos individuais ainda não integrados','As previsões estão agregadas por faixas de vencimento.','Sem ID, cliente e baixa de cada título não é possível identificar a origem de algumas diferenças.','Integrar títulos individualizados quando disponível.',null,'Contas a receber e pagar')
  if(!balance)append('missing-balance','info','Cobertura financeira','Balanço completo ausente','Não é possível validar os saldos finais do período.', 'Nenhuma linha de balanço encontrada.','Importar balanço completo.',null,'Balanço')
  // Consolidar diferenças de continuidade em um único diagnóstico rastreável.
  // Manter apenas diferenças financeiramente relevantes: maior que R$ 500
  // e pelo menos 0,5% do saldo anterior (ou saldo anterior zerado).
  const continuity=extra.filter(x=>x.id.startsWith('account-continuity-') && x.amount>=500)
  const importantContinuity=continuity.filter(x=>{
    const key=x.id.replace('account-continuity-','')
    const previous=previousAccounts.find(p=>`${p.tipo||''}|${p.codigo||p.grupo+'|'+p.conta}`===key)
    return !previous || x.amount>=Math.abs(numeric(previous.saldo_atual))*.005
  }).sort((a,b)=>(b.amount||0)-(a.amount||0))
  for(let ix=extra.length-1;ix>=0;ix--)if(extra[ix].id.startsWith('account-continuity-'))extra.splice(ix,1)
  if(importantContinuity.length){
    const total=importantContinuity.reduce((s,f)=>s+(f.amount||0),0)
    append('continuity-summary','warning','Continuidade de saldos',
      `${importantContinuity.length} contas com abertura diferente do fechamento anterior`,
      'As movimentações do mês atual fecham, mas o saldo inicial de algumas contas difere do encerramento importado no mês anterior.',
      importantContinuity.slice(0,12).map(f=>f.title.replace('Saldo de abertura diverge: ','')+': '+amountBR(f.amount)).join(' | '),
      'Investigar primeiro as maiores alterações entre agosto e setembro e verificar se houve reprocessamento, ajuste retroativo ou mudança de versão do relatório.',
      null,'Balancetes consecutivos')
  }

  // Não contabilizar duas vezes a mesma divergência apontada em cruzamentos diferentes.
  const all=[...base,...extra].map(row=>({...row,amount:Number.isFinite(Number(row.amount))&&row.amount!==null?Number(row.amount):null,source:row.source||'Relatórios financeiros',fingerprint:`${competence}:${row.id}`}))
  const rank={critical:0,warning:1,review:2,info:3,ok:4}
  return all.sort((a,b)=>rank[a.severity]-rank[b.severity]||(b.amount||0)-(a.amount||0))
}
