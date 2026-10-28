// Catálogo único de motivos para coleta e análise das visitas.
export const VISIT_PURPOSES = [
 ['prospeccao','Prospecção de novo cliente'],
 ['negociacao','Negociação comercial / cotação'],
 ['pedido','Fechamento de pedido'],
 ['pos_venda','Pós-venda e acompanhamento técnico'],
 ['diagnostico','Diagnóstico da propriedade'],
 ['recompra','Recompra e manutenção da carteira'],
 ['problema','Resolução de problema ou reclamação'],
]
export const VISIT_REASONS = {
 positiva: [
 ['pedido_fechado','Pedido fechado durante a visita'],['interesse_compra','Cliente demonstrou interesse em comprar'],['cotacao_solicitada','Cotação solicitada ou negociação iniciada'],['intencao_recompra','Cliente sinalizou intenção de recompra'],['aumento_mix','Aumento de volume ou ampliação do mix'],['novo_produto','Oportunidade de introduzir novo produto'],['satisfacao_produto','Cliente satisfeito com os produtos Nutrialle'],['resultado_tecnico','Resultados técnicos ou produtivos positivos'],['melhoria_tecnica','Melhoria de desempenho após recomendação técnica'],['relacionamento','Relacionamento fortalecido com o cliente'],['indicacao','Nova oportunidade ou indicação de cliente']
 ],
 neutra: [
 ['avaliando','Cliente ainda está avaliando a proposta'],['cotacao_aguardando','Cotação enviada, aguardando decisão'],['estoque_cliente','Cliente possui estoque e não precisa comprar agora'],['compra_futura','Próxima compra prevista para outra data'],['teste_produto','Cliente deseja testar o produto antes de decidir'],['comparando','Cliente está comparando com concorrentes'],['decisor_ausente','Decisor não estava presente'],['acompanhamento','Visita de acompanhamento, sem demanda comercial'],['tecnico_estavel','Acompanhamento técnico sem alteração relevante'],['retorno_futuro','Cliente solicitou retorno em outra ocasião'],['aprovacao_interna','Negociação depende de aprovação interna']
 ],
 negativa: [
 ['preco_alto','Preço acima da expectativa do cliente'],['concorrente_condicao','Concorrente apresentou melhor condição comercial'],['pagamento','Prazo ou condição de pagamento inadequada'],['frete','Frete ou custo logístico inviabilizou a venda'],['prazo_entrega','Prazo de entrega incompatível com a necessidade'],['sem_estoque','Produto indisponível ou sem estoque'],['portfolio','Portfólio não atende à necessidade do cliente'],['insatisfacao_resultado','Cliente insatisfeito com resultado do produto'],['qualidade','Problema de qualidade, embalagem ou apresentação'],['problema_tecnico','Problema técnico ou produtivo após utilização'],['falha_suporte','Cliente relatou falha no atendimento ou suporte'],['perdeu_concorrente','Cliente comprou de outro fornecedor'],['sem_interesse','Cliente não demonstrou interesse'],['financeiro','Problema financeiro ou restrição de crédito'],['reclamacao_pendente','Reclamação ou problema anterior ainda não resolvido']
 ]
}
export const visitPurposeLabel = id => VISIT_PURPOSES.find(x=>x[0]===id)?.[1] || id || 'Não informado'
export const visitReasonLabel = id => Object.values(VISIT_REASONS).flat().find(x=>x[0]===id)?.[1] || id || 'Não informado'
