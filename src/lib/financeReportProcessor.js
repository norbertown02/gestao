import * as pdfjs from 'pdfjs-dist'
import workerUrl from 'pdfjs-dist/build/pdf.worker.min.mjs?url'

pdfjs.GlobalWorkerOptions.workerSrc = workerUrl

const MONEY = /\(?-?\d{1,3}(?:\.\d{3})*,\d{2}\)?/g
const NUMBER = /\(?-?\d{1,3}(?:\.\d{3})*(?:,\d{2})?\)?/g
const MONTH_NUMBER = { JANEIRO:1, FEVEREIRO:2, MARÇO:3, ABRIL:4, MAIO:5, JUNHO:6, JULHO:7, AGOSTO:8, SETEMBRO:9, OUTUBRO:10, NOVEMBRO:11, DEZEMBRO:12 }
const SECTION_MAP = { '1':'receitas', '2':'custos_variaveis', '4':'custos_fixos', '6':'extra_operacional' }
const DRE_GROUPS = new Set(['VENDAS','CUSTO','IMPOSTOS','COMPRAS','FUNCIONAMENTO','FUNCIONARIOS','ADMINISTRATIVAS','BANCARIAS','PROPAGANDA E PUBLICIDADE','TRANSPORTE','TRIBUTARIAS','VEICULOS','ADIANTAMENTOS','JUROS/MULTAS/DESCONTOS'])

const assertCompetence = (competence, ano, mes, reportName) => {
  const expectedYear = Number(competence.slice(0, 4)), expectedMonth = Number(competence.slice(5, 7))
  if (Number(ano) !== expectedYear || Number(mes) !== expectedMonth) {
    const found = `${String(mes).padStart(2, '0')}/${ano}`
    const expected = `${String(expectedMonth).padStart(2, '0')}/${expectedYear}`
    throw new Error(`${reportName}: o arquivo é de ${found}, mas a competência selecionada é ${expected}.`)
  }
}

export const moneyNumber = value => {
  const raw = String(value || '').trim()
  const negative = raw.startsWith('(') || raw.startsWith('-')
  const number = Number(raw.replace(/[()]/g, '').replace(/\./g, '').replace(',', '.')) || 0
  return negative ? -Math.abs(number) : number
}

export async function extractPdfLines(blob) {
  const data = new Uint8Array(await blob.arrayBuffer())
  const pdf = await pdfjs.getDocument({ data }).promise
  const lines = []
  for (let pageNumber = 1; pageNumber <= pdf.numPages; pageNumber += 1) {
    const page = await pdf.getPage(pageNumber)
    const content = await page.getTextContent()
    const rows = new Map()
    content.items.forEach(item => {
      const y = Math.round(item.transform[5] * 2) / 2
      if (!rows.has(y)) rows.set(y, [])
      rows.get(y).push({ x: item.transform[4], text: item.str })
    })
    ;[...rows.entries()].sort((a, b) => b[0] - a[0]).forEach(([, items]) => {
      const text = items.sort((a, b) => a.x - b.x).map(item => item.text.trim()).filter(Boolean).join(' ').replace(/\s+/g, ' ').trim()
      if (text) lines.push(text)
    })
  }
  return lines
}

const findValue = (lines, pattern, occurrence = 0) => {
  const matches = lines.filter(line => pattern.test(line))
  const values = matches[occurrence]?.match(MONEY) || []
  return moneyNumber(values.at(-1))
}

function parseDre(lines) {
  const reportText = lines.join(' ')
  const periodDates = reportText.match(/\d{2}\s*\/\s*\d{2}\s*\/\s*\d{4}/g) || []
  if (periodDates.length < 2) throw new Error('Período do DRE não identificado.')
  const startParts = periodDates[0].replace(/\s/g,'').split('/'), endParts = periodDates[1].replace(/\s/g,'').split('/')
  const mes = Number(startParts[1]), ano = Number(startParts[2])
  if (startParts[1] !== endParts[1] || startParts[2] !== endParts[2]) throw new Error('O DRE deve conter uma única competência mensal.')
  const totals = {}
  const accounts = []
  const detail = { custos_variaveis:{}, custos_fixos:{}, extra_operacional:{} }
  let section = '', group = '', pendingCode = ''
  lines.forEach(line => {
    const total = line.match(/^([1246])\s+(RECEITAS|CUSTOS VARIÁVEIS|CUSTOS FIXOS|EXTRA OPERACIONAL)\s+([()]?-?[\d.]+,\d{2}[)]?)/i)
    if (total) { section = SECTION_MAP[total[1]]; totals[section] = moneyNumber(total[3]); group = ''; return }
    const subtotal = line.match(/^(3 MARGEM DE CONTRIBUIÇÃO|5 RESULTADO OPERACIONAL|7 RESULTADO LÍQUIDO|8 PONTO DE EQUILÍBRIO).*?([()]?-?[\d.]+,\d{2}[)]?)(?:\s|$)/i)
    if (subtotal) {
      const label = subtotal[1][0]
      totals[label === '3' ? 'margem_contribuicao' : label === '5' ? 'resultado_operacional' : label === '7' ? 'resultado_liquido' : 'ponto_equilibrio'] = moneyNumber(subtotal[2]); return
    }
    if (!section) return
    if (/^\d+$/.test(line)) { pendingCode = line; return }
    const groupLine = line.match(/^([A-ZÁÀÂÃÉÊÍÓÔÕÚÇ/* -]+?)\*?\s+([()]?-?[\d.]+,\d{2}[)]?)(?:\s+-?[\d(]|$)/)
    const possibleGroup = groupLine?.[1].replace(/\*$/, '').trim()
    if (!pendingCode && groupLine && DRE_GROUPS.has(possibleGroup) && !/^TOTAL /.test(line) && !/^\d/.test(line)) {
      group = possibleGroup
      if (detail[section]) detail[section][group.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '')] = moneyNumber(groupLine[2])
      return
    }
    const account = line.match(/^(?:([0-9]+)\s+)?(.+?)\s+([()]?-?[\d.]+,\d{2}[)]?)\s+(?:\(?-?[\d.,]+\)?\s*)%/)
    if (account && group) accounts.push({ ano, mes, secao:section, grupo:group, conta:account[2].trim(), valor:moneyNumber(account[3]) })
    pendingCode = ''
  })
  const monthly = { ano, mes, receitas:totals.receitas, custos_variaveis:totals.custos_variaveis, margem_contribuicao:totals.margem_contribuicao, custos_fixos:totals.custos_fixos, resultado_operacional:totals.resultado_operacional, extra_operacional:totals.extra_operacional, resultado_liquido:totals.resultado_liquido, ponto_equilibrio:totals.ponto_equilibrio, custos_variaveis_detail:detail.custos_variaveis, custos_fixos_detail:detail.custos_fixos, extra_operacional_detail:detail.extra_operacional }
  if (!monthly.receitas || monthly.resultado_liquido === undefined || accounts.length < 5) throw new Error('O DRE não passou na validação de totais e contas.')
  return { type:'dre', monthly, accounts, title:`DRE ${String(mes).padStart(2,'0')}/${ano}`, metrics:[['Receitas',monthly.receitas],['Margem de contribuição',monthly.margem_contribuicao],['Resultado líquido',monthly.resultado_liquido],['Contas detalhadas',accounts.length]] }
}

function parseBalanco(lines, competence) {
  const reference = lines.map(line => line.match(/(?:^|\s)(\d{2})\/(\d{2})\/(\d{4})(?:\s|$)/)).find(Boolean)
  if (!reference) throw new Error('Competência do Balanço Financeiro não identificada.')
  assertCompetence(competence, Number(reference[3]), Number(reference[2]), 'Balanço Financeiro')
  const field = pattern => {
    const index = lines.findIndex(line => pattern.test(line))
    if (index < 0) return 0
    const sameLine = lines[index].match(MONEY) || []
    if (sameLine.length) return moneyNumber(sameLine.at(-1))
    const previousLine = lines[index - 1]?.match(MONEY) || []
    return moneyNumber(previousLine.at(-1))
  }
  const row = {
    competencia_date:competence,
    ativo_total:field(/^ATIVO\s/i), caixa:field(/^CAIXA\s/i), bancos:field(/^BANCOS\s/i), disponibilidades:field(/^DISPONIBILIDADES\s/i),
    contas_receber_total:field(/^CONTAS A RECEBER\s/i), contas_receber_vencido:field(/^VENCIDO CURTO PRAZO/i), contas_receber_a_vencer_curto:field(/^A VENCER CURTO PRAZO/i), contas_receber_a_vencer_medio:field(/^A VENCER MEDIO PRAZO/i), duplicatas_descontadas:field(/^DUPLICATAS DESCONTADAS/i),
    estoque:field(/^ESTOQUE\s/i), compras_entrega_futura:field(/^SALDO COMPRAS ENTREGA FUTURA/i), passivo_total:field(/^PASSIVO\s/i), contas_pagar_total:field(/^CONTAS A PAGAR\s/i),
    contas_pagar_vencido_curto:findValue(lines,/^VENCIDO CURTO PRAZO/i,1), contas_pagar_vencido_medio:0, contas_pagar_a_vencer_curto:findValue(lines,/^A VENCER CURTO PRAZO/i,1), contas_pagar_a_vencer_medio:findValue(lines,/^A VENCER MEDIO PRAZO/i,1), contas_pagar_a_vencer_longo:field(/^A VENCER LONGO PRAZO/i), vendas_entrega_futura:field(/^SALDO VENDAS ENTREGA FUTURA/i), lucro_prejuizo_acumulado:field(/^(LUCRO \/ PREJUIZO ACUMULADO|PREJUIZO ACUMULADO)/i),
  }
  if (!row.ativo_total || !row.passivo_total) throw new Error('Totais do Balanço Financeiro não identificados.')
  return { type:'balanco', row, title:'Balanço Financeiro', metrics:[['Ativo total',row.ativo_total],['Contas a receber',row.contas_receber_total],['Contas a pagar',row.contas_pagar_total],['Estoque',row.estoque]] }
}

function parseBalancete(lines, competence) {
  const period = lines.find(line => /\d{2}\/\d{2}\/\d{2,4}\s+(?:à|a)\s+\d{2}\/\d{2}\/\d{2,4}/i.test(line)) || ''
  const dates = period.match(/(\d{2})\/(\d{2})\/(\d{2,4}).*?(\d{2})\/(\d{2})\/(\d{2,4})/)
  if (!dates) throw new Error('Período do Balancete não identificado.')
  assertCompetence(competence, Number(`20${dates[6].slice(-2)}`), Number(dates[5]), 'Balancete')
  let tipo = '', grupo = ''
  const accounts = []
  lines.forEach(line => {
    if (line === 'RECEITAS' || line === 'DESPESAS') { tipo = line.toLowerCase().replace('despesas','despesa').replace('receitas','receita'); grupo=''; return }
    if (!tipo || /^TOTAL |^Descrição |^NUTRIALLE|^Balancete|^Filial:|^Página|^RECEITAS - DESPESAS/.test(line)) return
    const row = line.match(/^(.+?)\s+(\d+)\s+([()]?-?[\d.]+,\d{2}[)]?)\s+([()]?-?[\d.]+,\d{2}[)]?)\s+([()]?-?[\d.]+,\d{2}[)]?)\s+([()]?-?[\d.]+,\d{2}[)]?)$/)
    if (row) accounts.push({ competencia_date:competence, period_start:dates ? `20${dates[3].slice(-2)}-${dates[2]}-${dates[1]}` : competence, period_end:dates ? `20${dates[6].slice(-2)}-${dates[5]}-${dates[4]}` : competence, tipo, grupo, conta:row[1].trim(), codigo:row[2], saldo_anterior:moneyNumber(row[3]), debito:moneyNumber(row[4]), credito:moneyNumber(row[5]), saldo_atual:moneyNumber(row[6]) })
    else if (/^[A-ZÁÀÂÃÉÊÍÓÔÕÚÇ ]+$/.test(line) && !/^TOTAL/.test(line)) grupo = line.normalize('NFD').replace(/[\u0300-\u036f]/g,'')
  })
  if (accounts.length < 5) throw new Error('As contas do Balancete não foram identificadas.')
  const entradas = accounts.filter(r=>r.tipo==='receita').reduce((s,r)=>s+r.debito,0), saidas = accounts.filter(r=>r.tipo==='despesa').reduce((s,r)=>s+r.credito,0)
  return { type:'balancete', accounts, title:'Balancete', metrics:[['Contas identificadas',accounts.length],['Entradas do período',entradas],['Saídas do período',saidas]] }
}

const MANAGERIAL_FIELDS = {
  'Total de Vendas':'vendas_total','Vendas à Vista':'vendas_a_vista','Vendas à Prazo':'vendas_a_prazo','Descontos':'vendas_descontos','Custo':'custo','Lucro Bruto':'lucro_bruto','% Margem Bruta':'margem_bruta_pct','Lucro Líquido':'lucro_liquido','% Margem Líquida':'margem_liquida_pct','Qtd Clientes':'qtd_clientes','Qtd Novos Clientes':'qtd_novos_clientes','Qtd Vendas':'qtd_vendas','Ticket Médio/Venda':'ticket_medio_venda','Ticket Médio/Cliente':'ticket_medio_cliente','Prazo Médio':'prazo_medio','Prazo Médio Ponderado':'prazo_medio_ponderado','Valor de Compras':'compras_valor','Valor do Estoque':'estoque_valor','Vencimento no Mês':'period_vencimento','Geradas no Mês':'period_geradas','Geradas até':'period_geradas_ate','Valor de Recebimentos':'caixa_recebimentos','em Bancos':'caixa_recebimentos_bancos','Juros Recebidos':'caixa_juros_recebidos','Descontos Concedidos':'caixa_descontos_concedidos','Valor de Pagamentos':'caixa_pagamentos','Dif. entre Receb. e Pagtos':'caixa_diferenca','Saldo de Bancos Atual':'bancos_saldo','PMRV':'pmrv','PMPF':'pmpf','PMRE':'pmre','Ciclo de Caixa':'ciclo_caixa','Ciclo Operacional':'ciclo_operacional'
}

function parseManagerial(lines) {
  const header = lines.find(line => /^Descrição .*\d{2}\/\d{4}/.test(line))
  const periods = (header?.split(/\s+/).filter(value => /^\d{2}\/\d{4}$/.test(value)) || []).map(value => ({ mes:Number(value.slice(0,2)), ano:Number(value.slice(3)) }))
  if (!periods.length) throw new Error('Colunas mensais do Relatório Gerencial não identificadas.')
  const rows = Object.fromEntries(periods.map(p=>[`${p.ano}-${p.mes}`,{...p}]))
  let section = ''
  lines.forEach(line => {
    if (/^Contas a Receber em Aberto/.test(line)) section='ar'
    else if (/^Contas a Pagar em Aberto/.test(line)) section='ap'
    const label = Object.keys(MANAGERIAL_FIELDS).find(key => line.startsWith(`${key} `))
    let field = label ? MANAGERIAL_FIELDS[label] : null
    if (label === 'Vencimento no Mês') field = section === 'ar' ? 'ar_vencimento_mes' : 'ap_vencimento_mes'
    if (label === 'Geradas no Mês') field = section === 'ar' ? 'ar_geradas_mes' : 'ap_geradas_mes'
    if (label === 'Geradas até') field = section === 'ar' ? 'ar_geradas_ate' : 'ap_geradas_ate'
    if (!field) return
    const values = line.slice(label.length).match(NUMBER) || []
    const monthlyValues = values.length > periods.length ? values.slice(1, periods.length + 1) : values.slice(0, periods.length)
    periods.forEach((p,index) => { rows[`${p.ano}-${p.mes}`][field] = moneyNumber(monthlyValues[index]) })
  })
  const monthly = Object.values(rows).filter(row=>row.mes>0 && row.vendas_total !== undefined)
  if (!monthly.length) throw new Error('Indicadores mensais do Relatório Gerencial não identificados.')
  const last = monthly[0]
  return { type:'gerencial', monthly, reference:periods[0], title:'Relatório Gerencial', metrics:[['Competência identificada',`${String(periods[0].mes).padStart(2,'0')}/${periods[0].ano}`],['Meses identificados',monthly.length],['Vendas do último mês',last.vendas_total],['Estoque do último mês',last.estoque_valor],['Ciclo de caixa',last.ciclo_caixa]] }
}

function parseReceivable(lines, competence) {
  const totalLine = lines.find(line=>/^Total Geral/i.test(line)) || ''
  const total = moneyNumber((totalLine.match(MONEY)||[])[0])
  const vencidoLine = lines.find(line=>/^Total Vencido:/i.test(line)) || ''
  const vencido = moneyNumber((vencidoLine.match(MONEY)||[])[0])
  const months = lines.map(line => {
    const name = Object.keys(MONTH_NUMBER).find(month => line.startsWith(`${month} `))
    if (!name) return null
    const values = line.match(MONEY) || []
    return { mes:MONTH_NUMBER[name], valor:moneyNumber(values[0]) }
  }).filter(Boolean)
  if (!total) throw new Error('Total das Contas a Receber não identificado.')
  const referenceMonth=Number(competence.slice(5,7)), future=months.filter(item=>item.mes>referenceMonth)
  return { type:'contas_receber', values:{ contas_receber_total:total, contas_receber_vencido:vencido, contas_receber_a_vencer_curto:future.slice(0,3).reduce((s,m)=>s+m.valor,0), contas_receber_a_vencer_medio:future.slice(3).reduce((s,m)=>s+m.valor,0) }, title:'Contas a Receber', metrics:[['Total a receber',total],['Vencido',vencido],['A vencer',total-vencido]] }
}

function parsePayable(lines, competence) {
  const header = lines.find(line => /^Previsão Financeira do Contas a Pagar/i.test(line)) || ''
  const headerDates = header.match(/\d{2}\/\d{2}\/\d{4}/g) || []
  if (!headerDates.length) throw new Error('Competência das Contas a Pagar não identificada.')
  const referenceParts = headerDates.at(-1).split('/').map(Number)
  assertCompetence(competence, referenceParts[2], referenceParts[1], 'Contas a Pagar')
  const ref = new Date(`${competence}T12:00:00`); ref.setMonth(ref.getMonth()+1,0); const day90 = new Date(ref); day90.setDate(day90.getDate()+90); const day360=new Date(ref); day360.setDate(day360.getDate()+360)
  const buckets = { vencido:0, curto:0, medio:0, longo:0 }
  lines.forEach(line => {
    const match=line.match(/^Total do Dia:\s*(\d{2})\/(\d{2})\/(\d{4})\s+([()]?[\d.]+,\d{2}[)]?)/i); if(!match)return
    const date=new Date(`${match[3]}-${match[2]}-${match[1]}T12:00:00`), value=moneyNumber(match[4])
    if(date<ref)buckets.vencido+=value; else if(date<=day90)buckets.curto+=value; else if(date<=day360)buckets.medio+=value; else buckets.longo+=value
  })
  if (!Object.values(buckets).some(Boolean)) {
    let futureSection = false, pendingPeriod = ''
    lines.forEach(line => {
      if (/^Total vencido:/i.test(line)) { buckets.vencido=moneyNumber((line.match(MONEY)||[])[0]); futureSection=true; pendingPeriod=''; return }
      if (/^Total a vencer:/i.test(line)) { futureSection=false; pendingPeriod=''; return }
      if (!futureSection) return
      const period = line.match(/^([A-ZÇÁÀÂÃÉÊÍÓÔÕÚ]+|20\d{2})\s+\d+$/)
      if (period) { pendingPeriod=period[1]; return }
      if (!pendingPeriod) return
      const value = moneyNumber((line.match(MONEY)||[])[0])
      if (!value) { pendingPeriod=''; return }
      let dueDate
      if (/^20\d{2}$/.test(pendingPeriod)) dueDate=new Date(Number(pendingPeriod),11,31,12)
      else dueDate=new Date(ref.getFullYear(),MONTH_NUMBER[pendingPeriod],0,12)
      if (dueDate<=day90) buckets.curto+=value
      else if (dueDate<=day360) buckets.medio+=value
      else buckets.longo+=value
      pendingPeriod=''
    })
  }
  const total=Object.values(buckets).reduce((s,v)=>s+v,0); if(!total) throw new Error('Vencimentos das Contas a Pagar não identificados.')
  return { type:'contas_pagar', values:{ contas_pagar_total:total, contas_pagar_vencido_curto:buckets.vencido, contas_pagar_vencido_medio:0, contas_pagar_a_vencer_curto:buckets.curto, contas_pagar_a_vencer_medio:buckets.medio, contas_pagar_a_vencer_longo:buckets.longo }, title:'Contas a Pagar', metrics:[['Total a pagar',total],['Vencido',buckets.vencido],['Até 90 dias',buckets.curto],['Longo prazo',buckets.longo]] }
}

export function parseFinanceReport(type, lines, competence) {
  if (type==='dre') { const result=parseDre(lines); assertCompetence(competence,result.monthly.ano,result.monthly.mes,'DRE'); return result }
  if (type==='balanco') return parseBalanco(lines,competence)
  if (type==='balancete') return parseBalancete(lines,competence)
  if (type==='gerencial') { const result=parseManagerial(lines); assertCompetence(competence,result.reference.ano,result.reference.mes,'Relatório Gerencial'); return result }
  if (type==='contas_receber') return parseReceivable(lines,competence)
  if (type==='contas_pagar') return parsePayable(lines,competence)
  throw new Error('Tipo de relatório não reconhecido.')
}

export async function applyFinanceReport(supabase, result, competence) {
  if(result.type==='dre') {
    let response=await supabase.from('finance_dre_monthly').upsert(result.monthly,{onConflict:'ano,mes'}); if(response.error)throw response.error
    response=await supabase.from('finance_dre_accounts').delete().eq('ano',result.monthly.ano).eq('mes',result.monthly.mes); if(response.error)throw response.error
    response=await supabase.from('finance_dre_accounts').insert(result.accounts); if(response.error)throw response.error
  } else if(result.type==='gerencial') { const response=await supabase.from('finance_managerial_monthly').upsert(result.monthly,{onConflict:'ano,mes'}); if(response.error)throw response.error
  } else if(result.type==='balancete') { let response=await supabase.from('finance_balancete_accounts').delete().eq('competencia_date',competence); if(response.error)throw response.error; response=await supabase.from('finance_balancete_accounts').insert(result.accounts); if(response.error)throw response.error
  } else {
    const {data:current}=await supabase.from('finance_balanco').select('*').eq('competencia_date',competence).maybeSingle()
    const patch=result.row || result.values
    const safeCurrent={...(current || {})}; delete safeCurrent.id; delete safeCurrent.created_at
    const response=await supabase.from('finance_balanco').upsert({...safeCurrent,...patch,competencia_date:competence},{onConflict:'competencia_date'}); if(response.error)throw response.error
  }
}
