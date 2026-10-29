import { useEffect, useMemo, useState } from 'react'
import { supabaseAdmin } from '../lib/supabase'
import '../cancellation-reasons.css'

function moedaCompacta(n) {
  const valor = Number(n || 0)
  const fmt = num => num.toLocaleString('pt-BR', { maximumFractionDigits: 1 })
  if (valor >= 1000000) return `R$ ${fmt(valor / 1000000)} mi`
  if (valor >= 1000) return `R$ ${fmt(valor / 1000)} mil`
  return valor.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })
}

function formatarData(data) {
  if (!data) return '—'
  return new Date(data).toLocaleDateString('pt-BR')
}

function classificar(motivos) {
  if (!motivos.length) return 'historico'
  if (motivos.every(m => m === 'Cotação substituída / duplicada')) return 'operacional'
  if (motivos.every(m => m === 'Cliente adiou a compra' || m === 'Sem retorno do cliente')) return 'recuperavel'
  return 'perda'
}

export default function CancellationInsights({ inicio, fim, filtroSegmento, farms, sellers }) {
  const [cancelamentos, setCancelamentos] = useState([])
  const [carregando, setCarregando] = useState(true)
  const [erro, setErro] = useState(false)

  useEffect(() => {
    let ativo = true
    async function carregar() {
      setCarregando(true)
      setErro(false)
      try {
        // Os novos cancelamentos usam a data da decisão. Para o histórico,
        // que não possui cancelled_at, considera-se a data de criação.
        const [atuais, antigos] = await Promise.all([
          supabaseAdmin.from('quotes').select('*')
            .eq('status', 'cancelada')
            .gte('cancelled_at', `${inicio}T00:00:00`)
            .lte('cancelled_at', `${fim}T23:59:59.999`),
          supabaseAdmin.from('quotes').select('*')
            .eq('status', 'cancelada')
            .is('cancelled_at', null)
            .gte('created_at', `${inicio}T00:00:00`)
            .lte('created_at', `${fim}T23:59:59.999`),
        ])
        if (atuais.error || antigos.error) throw atuais.error || antigos.error
        if (ativo) setCancelamentos([...(atuais.data || []), ...(antigos.data || [])])
      } catch (error) {
        console.error('Falha ao carregar motivos de cancelamento:', error)
        if (ativo) { setErro(true); setCancelamentos([]) }
      } finally {
        if (ativo) setCarregando(false)
      }
    }
    carregar()
    return () => { ativo = false }
  }, [inicio, fim])

  const dados = useMemo(() => {
    const fazendas = new Map(farms.map(f => [f.id, f]))
    const vendedores = new Map(sellers.map(s => [s.id, s]))
    const filtrados = cancelamentos
      .filter(q => filtroSegmento === 'todos' || String(fazendas.get(q.farm_id)?.segment || '').toLowerCase() === filtroSegmento)
      .map(q => {
        const motivos = Array.isArray(q.cancellation_reasons)
          ? [...new Set(q.cancellation_reasons.filter(Boolean))] : []
        return {
          ...q,
          motivos,
          tipo: classificar(motivos),
          valor: Number(q.total || 0),
          cliente: fazendas.get(q.farm_id)?.name || 'Cliente não identificado',
          vendedor: vendedores.get(q.seller_id)?.name || 'Sem vendedor',
        }
      })
    const somar = itens => itens.reduce((acc, q) => acc + q.valor, 0)
    const recuperaveis = filtrados.filter(q => q.tipo === 'recuperavel')
    const operacionais = filtrados.filter(q => q.tipo === 'operacional')
    const historicos = filtrados.filter(q => q.tipo === 'historico')
    const comerciais = filtrados.filter(q => q.tipo === 'perda' || q.tipo === 'recuperavel')

    const mapaMotivos = new Map()
    filtrados.forEach(q => {
      const lista = q.motivos.length ? q.motivos : ['Sem motivo informado (histórico)']
      lista.forEach(motivo => {
        const anterior = mapaMotivos.get(motivo) || { motivo, quantidade: 0, valor: 0 }
        mapaMotivos.set(motivo, {
          ...anterior,
          quantidade: anterior.quantidade + 1,
          valor: anterior.valor + q.valor,
        })
      })
    })
    const motivos = [...mapaMotivos.values()]
      .sort((a, b) => b.quantidade - a.quantidade || b.valor - a.valor)
    const recentes = [...filtrados]
      .sort((a, b) => String(b.cancelled_at || b.created_at).localeCompare(String(a.cancelled_at || a.created_at)))
      .slice(0, 8)

    return {
      total: filtrados.length,
      totalComercial: somar(comerciais),
      quantidadeRecuperavel: recuperaveis.length,
      valorRecuperavel: somar(recuperaveis),
      operacionais: operacionais.length,
      historicos: historicos.length,
      motivos,
      recentes,
    }
  }, [cancelamentos, farms, sellers, filtroSegmento])

  return (
    <section className="pipeline-card cancellation-insights">
      <div className="pipeline-card-head">
        <div>
          <span className="pipeline-eyebrow">Inteligência comercial</span>
          <h3>Motivos de cancelamento</h3>
        </div>
        <small>{dados.total} cancelamento{dados.total === 1 ? '' : 's'} no período</small>
      </div>
      <p className="cancellation-insights-description">
        Resultados por data de cancelamento, com os filtros de período e segmento do painel.
        As cotações antigas sem data de cancelamento utilizam a data de criação.
      </p>

      {erro ? (
        <p className="cancellation-insights-empty">Não foi possível carregar os cancelamentos. Reabra o painel para tentar novamente.</p>
      ) : carregando ? (
        <p className="cancellation-insights-empty">Carregando motivos de cancelamento...</p>
      ) : (
        <>
          <div className="cancellation-insights-kpis">
            <div><span>Potencial não convertido</span><strong>{moedaCompacta(dados.totalComercial)}</strong><small>Exclui registros operacionais e históricos sem motivo</small></div>
            <div><span>Recuperáveis</span><strong>{dados.quantidadeRecuperavel}</strong><small>{moedaCompacta(dados.valorRecuperavel)} em potencial</small></div>
            <div><span>Operacionais</span><strong>{dados.operacionais}</strong><small>Cotações duplicadas ou substituídas</small></div>
            <div><span>Histórico sem motivo</span><strong>{dados.historicos}</strong><small>Cancelamentos anteriores ao novo formulário</small></div>
          </div>

          <div className="cancellation-insights-columns">
            <div>
              <h4>Principais motivos</h4>
              {dados.motivos.length ? dados.motivos.map(item => (
                <div className="cancellation-insights-reason" key={item.motivo}>
                  <div className="cancellation-insights-reason-title">
                    <strong>{item.motivo}</strong>
                    <span>{item.quantidade} · {moedaCompacta(item.valor)}</span>
                  </div>
                  <div className="cancellation-insights-track">
                    <span style={{ width: `${Math.max(4, (item.quantidade / dados.motivos[0].quantidade) * 100)}%` }} />
                  </div>
                </div>
              )) : <p className="cancellation-insights-empty">Nenhum cancelamento no período.</p>}
              <p className="cancellation-insights-note">O vendedor pode selecionar vários motivos. Por isso, a soma por motivo pode superar o número e o valor total das cotações. Os indicadores financeiros acima não duplicam valores.</p>
            </div>
            <div>
              <h4>Cancelamentos recentes</h4>
              {dados.recentes.length ? dados.recentes.map(q => (
                <article key={q.id} className="cancellation-insights-entry">
                  <div><strong>{q.cliente}</strong><b>{moedaCompacta(q.valor)}</b></div>
                  <span>{q.vendedor} · {formatarData(q.cancelled_at || q.created_at)}</span>
                  <div className="cancellation-insights-tags">
                    {(q.motivos.length ? q.motivos : ['Sem motivo informado']).map(m => <small key={m}>{m}</small>)}
                  </div>
                </article>
              )) : <p className="cancellation-insights-empty">Sem cancelamentos para exibir.</p>}
            </div>
          </div>
        </>
      )}
    </section>
  )
}
