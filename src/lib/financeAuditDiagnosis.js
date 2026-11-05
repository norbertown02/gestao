import { analyzeDreSection } from './financeAuditStructure'
// Diagnóstico determinístico: cada conclusão deve estar apoiada nos dados importados.
const num = v => Number(v || 0)
const brl = v => num(v).toLocaleString('pt-BR',{style:'currency',currency:'BRL'})
const sum = (rows, pred) => rows.filter(pred).reduce((s,r)=>s+num(r.valor),0)
const r2 = v => Math.round(num(v)*100)/100
const norm = v => String(v||'').normalize('NFD').replace(/[\u0300-\u036f]/g,'').toUpperCase()

function comparison({dre,managerial,dreAccounts=[]}) {
  if (!dre || !managerial) return null
  const gross = num(managerial.vendas_total)-num(managerial.custo)
  const extraVariable=num(dre.custos_variaveis)-sum(analyzeDreSection(dreAccounts,'custos_variaveis').rows,r=>r.grupo==='CUSTO')
  const revenueGap=num(dre.receitas)-num(managerial.vendas_total)
  const cmvGap=num(managerial.custo)-sum(dreAccounts,r=>r.secao==='custos_variaveis'&&r.grupo==='CUSTO')
  const administrative=num(dre.custos_fixos)
  const extraordinary=num(dre.extra_operacional)
  const unexplained=r2(num(managerial.lucro_liquido)-num(dre.resultado_liquido)-(extraVariable+administrative+extraordinary+cmvGap-revenueGap)+(gross-num(managerial.lucro_liquido)))
  // Explain the bridge from managerial reported net (not just gross).
  const netBridge=[
    {label:'Lucro apresentado no Gerencial',value:r2(managerial.lucro_liquido),type:'base'},
    {label:'Ajuste receita DRE versus Gerencial',value:r2(revenueGap),type:'adjustment'},
    {label:'Diferença de CMV',value:r2(cmvGap),type:'adjustment'},
    {label:'Outros custos variáveis da DRE',value:r2(-extraVariable),type:'adjustment'},
    {label:'Custos fixos da DRE',value:r2(-administrative),type:'adjustment'},
    {label:'Resultado extraoperacional da DRE',value:r2(-extraordinary),type:'adjustment'},
    {label:'Ajuste entre lucro bruto e líquido gerencial',value:r2(gross-num(managerial.lucro_liquido)),type:'adjustment'},
    {label:'Resultado líquido calculado para a DRE',value:r2(num(dre.resultado_liquido)),type:'result'}
  ]
  // Verificação independente da soma das parcelas da ponte.
  const calculated=r2(netBridge.slice(0,-1).reduce((s,x)=>s+x.value,0))
  const residual=r2(num(dre.resultado_liquido)-calculated)
  return {gross,netBridge,residual,extraVariable,administrative,extraordinary,revenueGap,cmvGap}
}
function driversBySection(rows,section,limit=7) {
  return rows.filter(r=>r.secao===section).sort((a,b)=>Math.abs(num(b.valor))-Math.abs(num(a.valor))).slice(0,limit)
    .map(r=>({label:`${r.conta} · ${r.grupo}`,value:r2(r.valor),source:'DRE · Conta detalhada'}))
}
function newDiagnosis(summary,details,causes,verification,{confidence='Média',limitations=[],impact='Diferença entre fontes; não é perda confirmada'}={}) {
  return {summary,details,causes,verification,confidence,limitations,impact}
}
export function diagnoseFinanceFinding(f,input) {
  if(f.id?.startsWith('subtotal-resolved-')){
    const section=f.id.replace('subtotal-resolved-','')
    const result=analyzeDreSection(input.dreAccounts||[],section)
    return newDiagnosis(
      `O alerta aparente era uma contagem dupla na importação. A soma bruta é ${brl(result.aggregate)}, mas o total correto das contas analíticas é ${brl(result.cleanTotal)}. Foram identificados ${brl(result.excludedAmount)} em subtotais repetidos.`,
      [
        {label:'Soma bruta com subtotais',value:r2(result.aggregate),source:'Linhas importadas'},
        ...result.subtotals.flatMap(x=>[
          {label:'Subtotal: '+x.subtotal.conta,value:r2(x.amount),source:'Linha de agrupamento (não somar)'},
          ...x.children.map(y=>({label:'Conta analítica: '+y.conta,value:r2(y.valor),source:'Composição do subtotal'}))
        ]),
        {label:'Subtotal repetido retirado',value:r2(-result.excludedAmount),source:'Normalização estrutural'},
        {label:'Soma reconciliada',value:r2(result.cleanTotal),source:'Contas analíticas'}
      ],
      ['A mesma movimentação estava aparecendo como subtotal e como conta individual. Isso gera falsa inconsistência quando ambos são somados.','A exclusão é aplicada somente quando o subtotal marcado encontra correspondência exata com a conta detalhada dentro do mesmo grupo.'],
      ['Nenhuma alteração de lançamento é necessária por causa dessa diferença.','Manter a identificação de subtotais nas próximas importações.'],
      {confidence:'Alta: reconciliação matemática exata',limitations:['A regra identifica a estrutura importada; não certifica a operação fiscal que originou a conta.'],impact:'Erro de somatório da auditoria, não perda financeira'}
    )
  }

  const {dre,managerial,balance,accounts=[],dreAccounts=[],previousAccounts=[],previousManagerial,files=[],maturities=[]}=input
  const title=norm(f.title)
  const bridge=comparison(input)
  if(bridge && (title.includes('LUCRO') || title.includes('RESULTADO') || title.includes('CMV DIVERGE') || (title.includes('RECEITA')&&title.includes('DIVERGE')))){
    if(title.includes('CMV')){
      const cmvRows=dreAccounts.filter(r=>r.secao==='custos_variaveis'&&r.grupo==='CUSTO')
      const cmv=cmvRows.reduce((s,r)=>s+num(r.valor),0)
      return newDiagnosis(
        `O CMV da DRE é ${brl(cmv)} e o custo do Gerencial é ${brl(managerial.custo)}: diferença de ${brl(cmv-num(managerial.custo))}.`,
        [...cmvRows.map(r=>({label:r.conta,value:r2(r.valor),source:'DRE · CUSTO'})),{label:'Custo informado no Gerencial',value:r2(managerial.custo),source:'Relatório Gerencial'},{label:'Diferença DRE menos Gerencial',value:r2(cmv-num(managerial.custo)),source:'Conciliação'}],
        [`A diferença nominal é ${brl(Math.abs(cmv-num(managerial.custo)))}. Uma divergência pequena pode decorrer de arredondamento, mas precisa respeitar a precisão dos dados originais.`],
        ['Comparar custo registrado por venda e eventuais devoluções no mesmo intervalo.','Checar se o Gerencial considera pedidos ou notas efetivamente faturadas.'],
        {confidence:'Alta para os totais; não verificada para a causa',limitations:['Não foram disponibilizados custos históricos por item fiscal nesta auditoria.'],impact:'Diferença de bases do CMV'}
      )
    }
    if(title.includes('RECEITA')){
      return newDiagnosis(`A receita da DRE é ${brl(dre.receitas)} e as vendas do Gerencial são ${brl(managerial.vendas_total)}.`,
        [{label:'Receita DRE',value:r2(dre.receitas),source:'DRE'},{label:'Vendas gerenciais',value:r2(managerial.vendas_total),source:'Gerencial'},{label:'Diferença',value:r2(num(dre.receitas)-num(managerial.vendas_total)),source:'Comparação'}],
        [Math.abs(bridge.revenueGap)<=1?'As fontes estão conciliadas em valor; o apontamento pode derivar de um critério percentual anterior.':'Não é possível determinar se a diferença vem de devoluções, descontos ou competência apenas com totais.'],
        ['Confrontar a emissão das notas fiscais com a competência da DRE.','Separar devoluções e cancelamentos por documento.'],
        {confidence:'Alta para valores; limitada para origem',limitations:['Sem itens das notas fiscais para explicar cada diferença.']})
    }
  }
  if (bridge && f.category!=='Integridade matemática' && (title.includes('LUCRO') || title.includes('RESULTADO') || title.includes('CROSS-RESULT'))) {
    return newDiagnosis(
      `O Gerencial apresenta ${brl(managerial.lucro_liquido)} de lucro líquido, enquanto a DRE apresenta ${brl(dre.resultado_liquido)}. A diferença principal é explicada por custos variáveis adicionais, custos fixos e despesas extraoperacionais reconhecidos na DRE.`,
      [...bridge.netBridge.map(x=>({label:x.label,value:x.value,source:x.type==='base'?'Gerencial':x.type==='result'?'DRE':'Ponte entre relatórios'})),...driversBySection(dreAccounts,'custos_fixos',5),...driversBySection(dreAccounts,'extra_operacional',4)],
      [`O lucro líquido do Gerencial (${brl(managerial.lucro_liquido)}) está próximo do lucro bruto de vendas (${brl(bridge.gross)}), indicando que a rubrica pode não considerar todas as despesas da empresa.`,`Os custos variáveis não classificados como CMV são ${brl(bridge.extraVariable)}; custos fixos ${brl(bridge.administrative)} e extraoperacionais ${brl(bridge.extraordinary)}.`,Math.abs(bridge.residual)<2?'A ponte reconcilia os resultados dentro de R$ 2 de arredondamento.':`A ponte ainda apresenta saldo não explicado de ${brl(bridge.residual)}.`],
      ['Tratar lucro gerencial de vendas e resultado líquido contábil como indicadores diferentes.','Confirmar se a composição das despesas da DRE é apropriada; evitar concluir que o Gerencial está incorreto apenas pela diferença.'],
      {confidence:'Alta para a ponte aritmética; média para a classificação',limitations:['Relatórios de mesma competência não comprovam que todos os lançamentos tenham o mesmo regime e período de corte.'],impact:'Divergência conceitual entre indicadores, não prejuízo apurado'}
    )
  }
  if(title.includes('CONTAS NAO FECHAM')){
    const section=['receitas','custos_variaveis','custos_fixos','extra_operacional'].find(x=>title.includes(norm(x.replaceAll('_',' '))))
    if(section && dre){
      const total=num(dre[section]),detail=analyzeDreSection(dreAccounts,section).cleanTotal
      return newDiagnosis(
        `A seção ${section.replaceAll('_',' ')} registra ${brl(total)} no resumo, mas as contas detalhadas somam ${brl(detail)}. Diferença de ${brl(total-detail)}.`,
        [...driversBySection(analyzeDreSection(dreAccounts,section).rows,section,10),{label:'Total das contas detalhadas',value:r2(detail),source:'DRE detalhada'},{label:'Total do resumo',value:r2(total),source:'DRE mensal'},{label:'Resíduo',value:r2(total-detail),source:'Cálculo'}],
        [dreAccounts.some(r=>r.secao===section)?'Existem contas detalhadas, mas a soma não coincide com o resumo. Pode haver linha omitida, reprocessamento parcial ou diferença de filtros.':'Não existem contas detalhadas dessa seção: o total não pode ser auditado.'],
        ['Conferir as contas apresentadas acima na fonte importada.','Comparar se resumo e detalhe foram processados na mesma versão e competência.'],
        {confidence:'Alta para a diferença, não para a origem',limitations:['Os relatórios possuem valores agregados por conta; o documento individual não está vinculado.']})
    }
  }
  if(title.includes('ATIVO E PASSIVO') && balance){
    return newDiagnosis(
      `Ativo total ${brl(balance.ativo_total)} versus passivo total ${brl(balance.passivo_total)}: diferença de ${brl(num(balance.ativo_total)-num(balance.passivo_total))}.`,
      [{label:'Ativo',value:r2(balance.ativo_total),source:'Balanço'},{label:'Passivo',value:r2(balance.passivo_total),source:'Balanço'},{label:'Diferença',value:r2(num(balance.ativo_total)-num(balance.passivo_total)),source:'Conciliação'}],
      ['A divergência pode indicar conceito de balanço financeiro diferente de balanço patrimonial, ou ausência de grupos na importação.'],
      ['Conferir a definição de ativo/passivo usada pelo relatório Ultra.','Reconstituir os grupos que compõem ambos os totais.'],
      {confidence:'Alta para valores; baixa para a causa',limitations:['Não há razão contábil ou plano de contas patrimonial completo nesta visão.']})
  }
  if(title.includes('NAO FECHA') && balance){
    const keys=title.includes('DISPONIBILIDADES')?[
      ['Caixa',balance.caixa],['Bancos',balance.bancos],['Disponibilidades reportadas',balance.disponibilidades]
    ]:title.includes('CONTAS A RECEBER')?[
      ['Receber vencido',balance.contas_receber_vencido],['A vencer curto',balance.contas_receber_a_vencer_curto],['A vencer médio',balance.contas_receber_a_vencer_medio],['Duplicatas descontadas',balance.duplicatas_descontadas],['Total reportado',balance.contas_receber_total]
    ]:title.includes('CONTAS A PAGAR')?[
      ['Pagar vencido curto',balance.contas_pagar_vencido_curto],['Pagar vencido médio',balance.contas_pagar_vencido_medio],['A vencer curto',balance.contas_pagar_a_vencer_curto],['A vencer médio',balance.contas_pagar_a_vencer_medio],['A vencer longo',balance.contas_pagar_a_vencer_longo],['Total reportado',balance.contas_pagar_total]
    ]:[]
    if(keys.length && title.includes('CONTAS A RECEBER')){
      const schedule=maturities.filter(x=>x.nature==='receber')
      const scheduleTotal=schedule.reduce((s,x)=>s+num(x.amount),0)
      const components=num(balance.contas_receber_vencido)+num(balance.contas_receber_a_vencer_curto)+num(balance.contas_receber_a_vencer_medio)+num(balance.duplicatas_descontadas)
      const remainder=r2(num(balance.contas_receber_total)-components)
      const scheduleMatch=Math.abs(scheduleTotal-components)<.02
      return newDiagnosis(
        `O Balanço informa ${brl(balance.contas_receber_total)}, mas suas quatro parcelas disponíveis somam apenas ${brl(components)}. A diferença é ${brl(remainder)}. ${scheduleMatch?'A previsão de recebimentos confirma exatamente as parcelas do Balanço: a diferença está no total consolidado ou em uma parcela ausente da estrutura importada.':'As próprias previsões também divergem da composição do Balanço.'}`,
        [
          ...keys.map(([label,value])=>({label,value:r2(value),source:'Balanço financeiro'})),
          ...schedule.map(x=>({label:'Previsão: '+x.bucket_key,value:r2(x.amount),source:'Contas a receber · vencimentos'})),
          {label:'Soma das faixas de vencimento',value:r2(scheduleTotal),source:'Previsão de recebimentos'},
          {label:'Valor não explicado pelas faixas',value:remainder,source:'Total do Balanço menos composição'}
        ],
        [
          scheduleMatch?'O valor de cada faixa está confirmado por duas bases agregadas independentes: composição do Balanço e previsão financeira.':'Há divergência também na previsão das faixas de vencimento.',
          'As possibilidades ainda abertas são: parcela ou faixa não importada, título considerado somente no total consolidado, ou total com data de corte diferente. Não há evidência para escolher uma dessas hipóteses.',
          'Uma diferença de saldo não deve ser classificada como perda ou título incorreto até que seu detalhamento seja encontrado.'
        ],
        [
          'Comparar o total e os grupos no arquivo Balanço Financeiro.pdf original.',
          'Confrontar as parcelas no arquivo Contas a receber.pdf e conferir a mesma data-base.',
          'Se o arquivo original repetir a diferença, obter os títulos individualizados que compõem os R$ '+remainder.toLocaleString('pt-BR',{minimumFractionDigits:2,maximumFractionDigits:2})+'.'
        ],
        {confidence:scheduleMatch?'Alta para localização da diferença; causa transacional não confirmada':'Média para localização da diferença',limitations:['Os registros disponíveis agregam os títulos por faixa de vencimento, sem código do título, cliente ou baixa correspondente.'],impact:'Saldo de contas a receber não explicado pela composição, não prejuízo comprovado'}
      )
    }
    if(keys.length)return newDiagnosis(
      'O total informado no balanço não coincide com seus componentes. Abaixo estão os valores que foram efetivamente utilizados na comparação.',
      keys.map(([label,value])=>({label,value:r2(value),source:'Balanço financeiro'})),
      ['Algum componente pode estar ausente, ter sinal invertido ou utilizar filtro diferente.',title.includes('RECEBER')?'Duplicatas descontadas exigem verificação do tratamento de sinal e do critério de inclusão.':'A natureza de cada saldo precisa ser confirmada na origem.'],
      ['Refazer a composição a partir dos valores acima e conferir o sinal das rubricas.','Verificar a mesma data-base e filtros no relatório de origem.'],
      {confidence:'Alta para composição; causa pendente',limitations:['Sem títulos individualizados, não é possível indicar a parcela específica.']})
  }
  if(title.includes('DIVERGE ENTRE RELATORIOS')&&balance&&managerial){
    const matches=[
      ['ESTOQUE',balance.estoque,managerial.estoque_valor],
      ['SALDO BANCARIO',balance.bancos,managerial.bancos_saldo],
      ['CONTAS A RECEBER',balance.contas_receber_total,managerial.ar_geradas_ate],
      ['CONTAS A PAGAR',balance.contas_pagar_total,managerial.ap_geradas_ate]
    ]
    const match=matches.find(x=>title.includes(x[0]))
    if(match)return newDiagnosis(
      `${match[0]}: o Balanço traz ${brl(match[1])} e o Gerencial traz ${brl(match[2])}, diferença de ${brl(num(match[1])-num(match[2]))}.`,
      [{label:'Balanço',value:r2(match[1]),source:'Balanço financeiro'},{label:'Gerencial',value:r2(match[2]),source:'Gerencial mensal'},{label:'Diferença absoluta',value:r2(Math.abs(num(match[1])-num(match[2]))),source:'Cálculo'}],
      ['Os saldos podem ter datas de corte ou conceitos diferentes; a divergência não prova um lançamento indevido.'],
      ['Confirmar se o Gerencial representa posição final ou soma gerada até o período.','Conferir o saldo na data final do balanço e respectivas contas/títulos.'],
      {confidence:'Alta para diferença; baixa para explicação',limitations:['Sem títulos, extratos e snapshots por data-base não se identifica a transação individual.']})
  }
  if(title.includes('SALDO DE ABERTURA DIVERGE')){
    const key=f.id.replace('account-continuity-',''),row=accounts.find(r=>`${r.tipo||''}|${r.codigo||r.grupo+'|'+r.conta}`===key)
    const prior=previousAccounts.find(r=>`${r.tipo||''}|${r.codigo||r.grupo+'|'+r.conta}`===key)
    if(row&&prior)return newDiagnosis(
      `A conta ${row.conta} (código ${row.codigo||'não informado'}) abriu com ${brl(row.saldo_anterior)}, enquanto o fechamento anterior era ${brl(prior.saldo_atual)}.`,
      [{label:'Fechamento anterior',value:r2(prior.saldo_atual),source:'Balancete anterior'},{label:'Abertura atual',value:r2(row.saldo_anterior),source:'Balancete atual'},{label:'Diferença',value:r2(num(row.saldo_anterior)-num(prior.saldo_atual)),source:'Comparação'}],
      ['Pode ter ocorrido ajuste após encerramento, mudança de período ou alteração de classificação da conta.'],
      ['Conferir o código da conta nos dois meses.','Verificar lançamentos de ajuste no primeiro dia da competência.'],
      {confidence:'Alta para comparação',limitations:['O histórico de alterações do Ultra não está vinculado ao balancete importado.']})
  }
  if(title.includes('MOVIMENTACAO NAO RECONCILIA')){
    const key=f.id.replace('account-rollforward-',''),row=accounts.find(r=>`${r.tipo||''}|${r.codigo||r.grupo+'|'+r.conta}`===key)
    if(row)return newDiagnosis(
      `A conta ${row.conta} (código ${row.codigo||'sem código'}) não fecha pela movimentação informada.`,
      [{label:'Saldo anterior',value:r2(row.saldo_anterior),source:'Balancete'},{label:'Débitos',value:r2(row.debito),source:'Balancete'},{label:'Créditos',value:r2(row.credito),source:'Balancete'},{label:'Saldo atual',value:r2(row.saldo_atual),source:'Balancete'}],
      [`Pelo sinal débito-crédito: ${brl(num(row.saldo_anterior)+num(row.debito)-num(row.credito))}.`,`Pelo sinal crédito-débito: ${brl(num(row.saldo_anterior)-num(row.debito)+num(row.credito))}.`],
      ['Verificar a natureza do saldo no Ultra e o saldo atual da mesma conta.','Se nenhum cálculo corresponder, verificar ajustes e linhas omitidas.'],
      {confidence:'Alta para cálculo, pendente a natureza contábil',limitations:['Balancete apresenta agregados; não há razão analítico da conta.']})
  }
  if(title.includes('VARIACAO EXPRESSIVA')||title.includes('ESTOQUE VARIOU')){
    const key=f.id.replace('unusual-','')
    const field=key==='custo'?'custo':key==='estoque_valor'?'estoque_valor':key==='compras_valor'?'compras_valor':key==='caixa_pagamentos'?'caixa_pagamentos':'bancos_saldo'
    if(previousManagerial&&managerial&&typeof managerial[field]!=='undefined'){
      const previous=num(previousManagerial[field]),current=num(managerial[field])
      const pct=previous?((current-previous)/Math.abs(previous))*100:null
      return newDiagnosis(
        `A variável passou de ${brl(previous)} para ${brl(current)} (${pct==null?'sem base percentual':pct.toFixed(1)+'%'}). A mudança é real nos relatórios; a causa ainda não foi comprovada.`,
        [{label:'Mês anterior',value:r2(previous),source:'Gerencial anterior'},{label:'Mês atual',value:r2(current),source:'Gerencial atual'},{label:'Variação absoluta',value:r2(current-previous),source:'Comparação'}],
        ['Variação pode decorrer de volume comercial, estoque, evento não recorrente ou critérios de corte distintos.','Comparação de dois meses não permite afirmar anomalia estatística ou erro.'],
        ['Comparar a evolução de pelo menos 6 competências e as contas responsáveis.','Validar documentos do período que concentram a variação.'],
        {confidence:'Alta para variação; baixa para causa',limitations:['Não existe vínculo com transações individuais para decompor esta oscilação.'],impact:'Mudança de indicador; não é divergência necessariamente irregular'})
    }
  }
  if(title.includes('CLASSIFICACAO')||title.includes('MOVIMENTACAO PATRIMONIAL')){
    const row=dreAccounts.find(r=>norm(f.evidence).includes(norm(r.conta)))
    return newDiagnosis(
      row?`A rubrica ${row.conta} aparece em ${row.secao}, no valor de ${brl(row.valor)}. A natureza pode ser patrimonial em vez de despesa do período.`:f.description,
      row?[{label:row.conta,value:r2(row.valor),source:`DRE · ${row.secao}`}]:[],
      ['Movimentações de principal, adiantamentos e aportes normalmente exigem distinção de receitas ou despesas operacionais; rendimentos, encargos e perdas podem ter tratamento diferente.'],
      ['Identificar contrato, comprovante, natureza de cada parcela e conta contábil utilizada.','Separar principal de juros e demais despesas reconhecíveis.'],
      {confidence:'Média para classificação suspeita; não é parecer contábil',limitations:['Sem documento da operação, não se pode determinar a classificação definitiva.']})
  }
  if(title.includes('ARQUIVO')||title.includes('BALANCETE NAO CORRESPONDE')){
    const ranges=[...new Set(accounts.map(r=>`${r.period_start||'sem início'} até ${r.period_end||'sem fim'}`))]
    return newDiagnosis(
      `A cobertura documental requer conferência de período e versão. ${f.description}`,
      [...ranges.slice(0,5).map(r=>({label:'Período efetivo do balancete',value:r,source:'Balancete'})),...files.filter(x=>x.status!=='processado').slice(0,5).map(x=>({label:x.file_name||x.report_type,value:x.status,source:'Central de importação'}))],
      ['A comparação pode produzir falso alerta quando o balancete está acumulado e o demonstrativo é mensal.'],
      ['Identificar início e fim do período de cada documento.','Usar apenas documentos compatíveis ou comparar movimentações equivalentes.'],
      {confidence:'Alta para metadados de período',limitations:['Os metadados não comprovam que as linhas internas estejam completas.'],impact:'Risco de leitura incorreta, sem perda quantificada'})
  }

  if(title.includes('NAO FECHA')&&dre&&f.category==='Integridade matemática'){
    const checks=[
      ['MARGEM DE CONTRIBUICAO',num(dre.receitas)-num(dre.custos_variaveis),num(dre.margem_contribuicao),[['Receitas',dre.receitas],['Custos variáveis',-num(dre.custos_variaveis)]]],
      ['RESULTADO OPERACIONAL',num(dre.margem_contribuicao)-num(dre.custos_fixos),num(dre.resultado_operacional),[['Margem de contribuição',dre.margem_contribuicao],['Custos fixos',-num(dre.custos_fixos)]]],
      ['RESULTADO LIQUIDO',num(dre.resultado_operacional)-num(dre.extra_operacional),num(dre.resultado_liquido),[['Resultado operacional',dre.resultado_operacional],['Extraoperacional',-num(dre.extra_operacional)]]]
    ]
    const match=checks.find(x=>title.includes(x[0]))
    if(match)return newDiagnosis(
      `A fórmula do ${match[0].toLowerCase()} produz ${brl(match[1])}, mas o DRE informa ${brl(match[2])}. Resíduo ${brl(num(match[1])-num(match[2]))}.`,
      [...match[3].map(([label,value])=>({label,value:r2(value),source:'DRE'})),{label:'Valor calculado',value:r2(match[1]),source:'Fórmula do DRE'},{label:'Valor informado',value:r2(match[2]),source:'DRE mensal'},{label:'Diferença',value:r2(num(match[1])-num(match[2])),source:'Conciliação'}],
      ['A fórmula e o campo publicado não estão conciliados. Uma diferença pequena pode ser arredondamento de importação; uma diferença grande pode indicar conta omitida ou classificação divergente.'],
      ['Comparar a composição de cada subtotal no DRE de origem.','Confirmar sinal de estornos e valores negativos.'],
      {confidence:'Alta para cálculo matemático',limitations:['A fórmula não identifica isoladamente a transação que produziu o erro.']})
  }
  if(f.category==='Documentação'||title.includes('AUSENTE')){
    const kind=title.includes('BALANCETE')?'balancete':title.includes('BALANCO')?'balanco':title.includes('DRE')?'dre':title.includes('GERENCIAL')?'gerencial':null
    const matched=kind?files.filter(x=>x.report_type===kind):[]
    return newDiagnosis(
      `A fonte necessária não está estruturada para realizar esta verificação. ${f.description}`,
      [...matched.map(x=>({label:x.file_name||x.report_type,value:x.status,source:'Central de importação'})),{label:'Registros encontrados',value:kind==='balancete'?accounts.length:kind==='dre'?(dre?1:0):kind==='gerencial'?(managerial?1:0):kind==='balanco'?(balance?1:0):'não avaliados',source:'Banco de dados'}],
      [matched.length?'Existe registro de arquivo, mas pode não haver extração válida.':'Não há arquivo processado deste tipo na competência.','Sem essa fonte não se pode classificar o teste como conciliado nem como erro contábil.'],
      ['Confirmar competência, tipo de relatório e status da importação.','Processar a fonte faltante e executar novamente a auditoria.'],
      {confidence:'Alta para verificação de cobertura',limitations:['O teste contábil não foi executado por falta de fonte.'],impact:'Lacuna de dados, não inconsistência monetária'})
  }
  if(title.includes('CONTAS MOVIMENTADAS')||title.includes('NAO APARECEM AGORA')){
    const current=new Set(accounts.filter(x=>num(x.credito)||num(x.debito)).map(x=>`${x.tipo}|${x.grupo}|${x.conta}`))
    const missing=previousAccounts.filter(x=>(num(x.credito)||num(x.debito))&&!current.has(`${x.tipo}|${x.grupo}|${x.conta}`))
    return newDiagnosis(
      `${missing.length} contas que tiveram movimento no mês anterior não aparecem movimentadas na competência atual. Isso pode ser legítimo e não representa despesa omitida confirmada.`,
      missing.sort((a,b)=>Math.max(Math.abs(num(b.debito)),Math.abs(num(b.credito)))-Math.max(Math.abs(num(a.debito)),Math.abs(num(a.credito)))).slice(0,15).map(x=>({label:x.conta,value:r2(Math.max(Math.abs(num(x.debito)),Math.abs(num(x.credito)))),source:'Movimento no balancete anterior'})),
      ['Conta sem movimento atual não é necessariamente erro; é necessário verificar se houve obrigação recorrente ou pagamento em outra competência.'],
      ['Identificar despesas com contrato recorrente dentre as contas acima.','Conferir se o período atual está completo antes de concluir ausência.'],
      {confidence:'Alta para comparação de contas; baixa para suspeita de omissão',limitations:['Não há contrato ou título por conta para comprovar recorrência.']})
  }
  if(title.includes('PEDIDO COM DADOS')||title.includes('CUSTO INDIVIDUAL')||title.includes('CONCILIACAO INDIVIDUAL')){
    return newDiagnosis(
      f.description,
      [{label:'Evidência gerada pela regra',value:f.evidence||'Sem detalhes',source:f.source||f.category}],
      [title.includes('PEDIDO')?'O cadastro comercial informa qualidade incompleta ou não canônica para os itens daquele pedido; não comprova diferença financeira.':'O conjunto de dados disponível contém apenas totais ou valores comerciais, sem custo histórico ou títulos e baixas de pagamento individualizados.'],
      [title.includes('PEDIDO')?'Abrir o pedido mencionado e comparar itens, valores e número da venda na origem.':'Disponibilizar registros transacionais e a data de cada movimento antes de classificar erro financeiro.'],
      {confidence:'Alta para identificação da lacuna; não conclusiva para irregularidade',limitations:['A fonte transacional necessária não foi disponibilizada.'],impact:'Cobertura insuficiente para diagnóstico de lançamento'})
  }
  return newDiagnosis(
    f.description || 'Ocorrência detectada pelas regras de conciliação.',
    [{label:'Evidência disponível',value:f.evidence||'Sem evidência detalhada',source:f.source||f.category}],
    [f.evidence?'A regra encontrou esta evidência, mas o conjunto atual não permite atribuir causa definitiva.':'A fonte ou a regra ainda não oferece decomposição transacional suficiente.'],
    [f.action||'Obter o documento de origem e identificar as parcelas que compõem o total.'],
    {confidence:'Limitada — requer fonte adicional',limitations:['A auditoria não possui os lançamentos individualizados desta ocorrência.'],impact:'Não quantificado como perda'}
  )
}
