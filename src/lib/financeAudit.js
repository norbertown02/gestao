const n=value=>Number(value||0)
const close=(a,b,tolerance=1)=>Math.abs(n(a)-n(b))<=tolerance
const pctDiff=(a,b)=>Math.abs(n(b))?Math.abs(n(a)-n(b))/Math.abs(n(b))*100:(n(a)?100:0)
const money=value=>n(value).toLocaleString('pt-BR',{style:'currency',currency:'BRL'})

export function runFinanceAudit({dre,managerial,balance,accounts=[],dreAccounts=[],previousAccounts=[],previousManagerial,files=[]}) {
  const findings=[]
  const add=(severity,category,title,description,evidence,action)=>findings.push({id:`${category}-${findings.length}`,severity,category,title,description,evidence,action})
  const ok=(category,title,description,evidence)=>add('ok',category,title,description,evidence,'Nenhuma ação necessária.')
  const sourceNames={dre:'DRE Comparativo',gerencial:'Relatório Gerencial',balanco:'Balanço Financeiro',balancete:'Balancete',contas_pagar:'Contas a Pagar',contas_receber:'Contas a Receber'}
  const present=new Set((files||[]).map(file=>file.report_type))
  const hasFullBalance=Boolean(balance&&(n(balance.ativo_total)!==0||n(balance.passivo_total)!==0))

  ;['dre','gerencial','balanco','balancete'].forEach(type=>{
    const structured=type==='dre'?dre:type==='gerencial'?managerial:type==='balanco'?hasFullBalance:accounts.length
    if(structured) ok('Documentação',`${sourceNames[type]} disponível`,'A fonte está estruturada e participa dos cruzamentos.',present.has(type)?'Arquivo processado pela Central.':'Dados existentes no sistema; arquivo não consta na Central.')
    else add('review','Documentação',`${sourceNames[type]} ausente`,`A auditoria desta competência fica limitada sem essa fonte.`,type==='balanco'&&balance?'Há saldos parciais de previsões, mas o Balanço Financeiro completo não foi processado.':present.has(type)?'Existe arquivo, mas não há dados estruturados.':'Nenhum dado estruturado ou arquivo processado.','Enviar e processar o relatório quando estiver disponível.')
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
      const accountTotal=dreAccounts.filter(row=>row.secao===section).reduce((sum,row)=>sum+n(row.valor),0)
      if(close(accountTotal,total)) ok('Contas detalhadas',`${section.replaceAll('_',' ')} conciliado`,'A soma das contas corresponde ao total da seção.',`Contas ${money(accountTotal)} | total ${money(total)}`)
      else add('critical','Contas detalhadas',`Contas não fecham em ${section.replaceAll('_',' ')}`,'Existem valores no total sem correspondência completa nas contas detalhadas.',`Contas ${money(accountTotal)} | total ${money(total)} | diferença ${money(total-accountTotal)}`,'Abrir o DRE no nível mais baixo e localizar a conta ausente ou duplicada.')
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
    ].forEach(([label,reported,calculated])=>close(reported,calculated)?ok('Balanço',`${label} conciliado`,'A composição fecha com o total informado.',`Informado ${money(reported)} | composição ${money(calculated)}`):add('critical','Balanço',`${label} não fecha`,'O total informado difere da soma de sua composição.',`Informado ${money(reported)} | composição ${money(calculated)} | diferença ${money(n(reported)-n(calculated))}`,'Revisar filtros, faixas de vencimento e lançamentos que compõem o Balanço.'))
  }

  if(dre&&managerial){
    const salesGap=pctDiff(dre.receitas,managerial.vendas_total)
    if(salesGap<=1)ok('Cruzamento', 'Receita conciliada entre DRE e Gerencial','Os dois relatórios apresentam vendas compatíveis.',`DRE ${money(dre.receitas)} | Gerencial ${money(managerial.vendas_total)}`)
    else add(salesGap>5?'critical':'warning','Cruzamento','Receita diverge entre DRE e Gerencial','Os relatórios apresentam bases diferentes para as vendas do mesmo mês.',`DRE ${money(dre.receitas)} | Gerencial ${money(managerial.vendas_total)} | diferença ${salesGap.toFixed(1)}%`,'Conferir devoluções, data de emissão, cancelamentos e regime utilizado.')
    const cmv=dreAccounts.filter(row=>row.secao==='custos_variaveis'&&row.grupo==='CUSTO').reduce((s,row)=>s+n(row.valor),0)
    if(close(cmv,managerial.custo,Math.max(10,n(managerial.custo)*.01)))ok('Cruzamento','CMV conciliado com o Gerencial','O custo de mercadoria está consistente entre as fontes.',`DRE ${money(cmv)} | Gerencial ${money(managerial.custo)}`)
    else add('warning','Cruzamento','CMV diverge do custo gerencial','O custo reconhecido no DRE não corresponde ao custo das vendas do Gerencial.',`DRE ${money(cmv)} | Gerencial ${money(managerial.custo)} | diferença ${money(Math.abs(cmv-n(managerial.custo)))}`,'Conferir CMV automático, devoluções e custo dos produtos vendidos.')
  }

  if(hasFullBalance&&managerial){
    ;[['Estoque',balance.estoque,managerial.estoque_valor],['Saldo bancário',balance.bancos,managerial.bancos_saldo],['Contas a receber',balance.contas_receber_total,managerial.ar_geradas_ate],['Contas a pagar',balance.contas_pagar_total,managerial.ap_geradas_ate]].forEach(([label,a,b])=>{
      const gap=pctDiff(a,b)
      if(gap<=1)ok('Cruzamento',`${label} conciliado`,'Os saldos são compatíveis entre Balanço e Gerencial.',`Balanço ${money(a)} | Gerencial ${money(b)}`)
      else add(gap>10?'warning':'review','Cruzamento',`${label} diverge entre relatórios`,'Pode haver diferença de data de emissão, filtro ou lançamento pendente.',`Balanço ${money(a)} | Gerencial ${money(b)} | diferença ${gap.toFixed(1)}%`,'Conferir se os relatórios foram emitidos na mesma data e com os mesmos filtros.')
    })
  }

  if(balance&&managerial&&present.has('contas_receber')&&n(balance.contas_receber_total)){
    const gap=pctDiff(balance.contas_receber_total,managerial.ar_geradas_ate)
    if(gap<=1)ok('Cruzamento','Contas a receber conciliadas','A previsão de recebimentos é compatível com o saldo gerencial.',`Previsão ${money(balance.contas_receber_total)} | Gerencial ${money(managerial.ar_geradas_ate)}`)
    else add(gap>10?'warning':'review','Cruzamento','Contas a receber divergem entre relatórios','A previsão financeira e o saldo gerencial apresentam bases diferentes.',`Previsão ${money(balance.contas_receber_total)} | Gerencial ${money(managerial.ar_geradas_ate)} | diferença ${gap.toFixed(1)}%`,'Conferir data de emissão, títulos baixados, renegociações e filtros da previsão.')
  }

  if(balance&&managerial&&present.has('contas_pagar')&&n(balance.contas_pagar_total)){
    const gap=pctDiff(balance.contas_pagar_total,managerial.ap_geradas_ate)
    if(gap<=1)ok('Cruzamento','Contas a pagar conciliadas','A previsão de pagamentos é compatível com o saldo gerencial.',`Previsão ${money(balance.contas_pagar_total)} | Gerencial ${money(managerial.ap_geradas_ate)}`)
    else add(gap>10?'warning':'review','Cruzamento','Contas a pagar divergem entre relatórios','A previsão financeira e o saldo gerencial apresentam bases diferentes.',`Previsão ${money(balance.contas_pagar_total)} | Gerencial ${money(managerial.ap_geradas_ate)} | diferença ${gap.toFixed(1)}%`,'Conferir data de emissão, títulos baixados, renegociações e filtros da previsão.')
  }

  if(previousManagerial&&managerial){
    const stockVariation=n(previousManagerial.estoque_valor)?(n(managerial.estoque_valor)-n(previousManagerial.estoque_valor))/Math.abs(n(previousManagerial.estoque_valor))*100:0
    if(Math.abs(stockVariation)>30)add('review','Variações',`Estoque variou ${stockVariation>=0?'+':''}${stockVariation.toFixed(1)}%`,'Movimento relevante em relação ao mês anterior.',`Anterior ${money(previousManagerial.estoque_valor)} | atual ${money(managerial.estoque_valor)}`,'Validar compras, baixas, inventário e produtos sem movimentação.')
  }

  if(previousAccounts.length&&accounts.length){
    const previousSet=new Set(previousAccounts.filter(row=>n(row.credito)||n(row.debito)).map(row=>`${row.tipo}|${row.grupo}|${row.conta}`))
    const currentSet=new Set(accounts.filter(row=>n(row.credito)||n(row.debito)).map(row=>`${row.tipo}|${row.grupo}|${row.conta}`))
    const missing=[...previousSet].filter(key=>!currentSet.has(key)).map(key=>key.split('|')[2]).slice(0,12)
    if(missing.length)add('review','Contas possivelmente ausentes',`${missing.length} contas movimentadas no mês anterior não aparecem agora`,'A ausência pode ser normal, mas também pode indicar lançamento ainda não realizado.',missing.join(' · '),'Confirmar se essas despesas ou receitas realmente não ocorreram no mês.')
  }

  const rank={critical:0,warning:1,review:2,ok:3}
  return findings.sort((a,b)=>rank[a.severity]-rank[b.severity])
}
