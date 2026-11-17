import { useMemo } from 'react'
import { Bar, BarChart, CartesianGrid, Legend, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'
import { IconAlertTriangle, IconArrowRight, IconChartBar, IconCircleCheck, IconClock, IconInfoCircle, IconTargetArrow } from '@tabler/icons-react'
import { VISIT_REASONS, visitPurposeLabel, visitReasonLabel } from '../data/visitReasons'

const GROUPS = [
  { id: 'positiva', label: 'Oportunidades e pontos positivos', short: 'Positivas', className: 'positive', key: 'Positivas', color: '#23864A' },
  { id: 'neutra', label: 'Pendências e acompanhamento', short: 'Neutras', className: 'neutral', key: 'Neutras', color: '#C18A38' },
  { id: 'negativa', label: 'Problemas e obstáculos', short: 'Negativas', className: 'negative', key: 'Negativas', color: '#C93A32' },
]
const REASON_GROUP = new Map(Object.entries(VISIT_REASONS).flatMap(([group, reasons]) => reasons.map(([id]) => [id, group])))
const format = n => Number(n || 0).toLocaleString('pt-BR')
const percent = (part, total) => total ? Math.round(part * 100 / total) : 0

function timelineBucket(date, periodo) {
  if (!date || !/^\d{4}-\d{2}-\d{2}$/.test(date)) return null
  if (periodo !== 'mes') {
    const key = date.slice(0, 7)
    const label = new Date(key + '-01T12:00:00').toLocaleDateString('pt-BR', { month: 'short', year: '2-digit' })
    return { key, label }
  }
  const d = new Date(date + 'T12:00:00Z')
  if (Number.isNaN(d.getTime())) return null
  const day = d.getUTCDay() || 7
  d.setUTCDate(d.getUTCDate() - day + 1)
  const key = d.toISOString().slice(0, 10)
  return { key, label: 'Semana ' + key.slice(8, 10) + '/' + key.slice(5, 7) }
}

function ReasonBoard({ group, rows, denominator, active, onReasonChange }) {
  const max = Math.max(1, ...rows.map(row => row.count))
  return (
    <article className={'field-intel-reasons ' + group.className}>
      <div className="field-intel-reasons-head">
        <span className="field-intel-dot" />
        <div>
          <h4>{group.label}</h4>
          <p>{rows.length ? 'Motivos relatados pelos vendedores' : 'Sem motivos classificados neste grupo'}</p>
        </div>
      </div>
      {rows.length ? (
        <div className="field-intel-reason-rows">
          {rows.slice(0, 6).map((row, index) => (
            <button
              type="button"
              key={row.id}
              className={'field-intel-reason ' + (active === row.id ? 'selected' : '')}
              aria-pressed={active === row.id}
              title="Filtrar histórico por este motivo"
              onClick={() => onReasonChange(row.id)}
            >
              <span className="field-intel-reason-line"><span className="field-intel-reason-index">{String(index + 1).padStart(2, '0')}</span><strong>{row.label}</strong><b>{row.count}</b></span>
              <span className="field-intel-track"><span style={{ width: (row.count / max * 100) + '%' }} /></span>
              <span className="field-intel-reason-detail">
                <span>{percent(row.count, denominator)}% das visitas classificadas neste grupo</span>
                <span>Ver visitas <IconArrowRight size={13} /></span>
              </span>
            </button>
          ))}
        </div>
      ) : (
        <div className="field-intel-no-reasons">Aguardando registros com motivos estruturados no Campo.</div>
      )}
    </article>
  )
}

function StackedMeter({ positive, neutral, negative, total, className = '' }) {
  return (
    <div
      className={'field-intel-meter ' + className}
      role="img"
      aria-label={positive + ' positivas, ' + neutral + ' neutras e ' + negative + ' negativas'}
    >
      {total > 0 ? (
        <>
          {positive > 0 && <span className="positive" style={{ width: (positive * 100 / total) + '%' }} />}
          {neutral > 0 && <span className="neutral" style={{ width: (neutral * 100 / total) + '%' }} />}
          {negative > 0 && <span className="negative" style={{ width: (negative * 100 / total) + '%' }} />}
        </>
      ) : <span className="empty" style={{ width: '100%' }} />}
    </div>
  )
}

export default function FieldInsights({
  visits = [],
  periodo,
  motivoAtivo = 'todos',
  resultadoAtivo = 'todos',
  vendedorAtivo = 'todos',
  onReasonChange,
  onOutcomeChange,
  onSellerChange,
  onResetFilters,
}) {
  const insights = useMemo(() => {
    const counts = { positiva: 0, neutra: 0, negativa: 0 }
    const reasons = { positiva: new Map(), neutra: new Map(), negativa: new Map() }
    const purposeCounts = new Map()
    const timeMap = new Map()
    const sellerMap = new Map()
    const segmentMap = new Map()
    let classified = 0

    for (const visit of visits) {
      const status = ['positiva', 'neutra', 'negativa'].includes(visit.outcomeNorm) ? visit.outcomeNorm : 'neutra'
      counts[status] += 1
      const uniqueReasons = [...new Set(Array.isArray(visit.outcome_reasons) ? visit.outcome_reasons.filter(Boolean) : [])]
      if (uniqueReasons.length > 0) classified += 1
      for (const id of uniqueReasons) {
        const group = REASON_GROUP.get(id) || status
        const current = reasons[group].get(id) || { id, label: visitReasonLabel(id), count: 0 }
        current.count += 1
        reasons[group].set(id, current)
      }
      if (visit.visit_purpose) purposeCounts.set(visit.visit_purpose, (purposeCounts.get(visit.visit_purpose) || 0) + 1)

      const bucket = timelineBucket(visit.visit_date, periodo)
      if (bucket) {
        const current = timeMap.get(bucket.key) || { ...bucket, Positivas: 0, Neutras: 0, Negativas: 0 }
        const target = GROUPS.find(g => g.id === status)
        current[target.key] += 1
        timeMap.set(bucket.key, current)
      }

      const sellerId = visit.seller_id || visit.user_id || visit.created_by || 'sem_vendedor'
      const seller = sellerMap.get(sellerId) || { id: sellerId, label: visit.sellerName || 'Sem vendedor', total: 0, positiva: 0, neutra: 0, negativa: 0 }
      seller.total += 1
      seller[status] += 1
      sellerMap.set(sellerId, seller)

      const segmentName = visit.farmSegment || 'Não informado'
      const segment = segmentMap.get(segmentName) || { label: segmentName, total: 0, positiva: 0, neutra: 0, negativa: 0 }
      segment.total += 1
      segment[status] += 1
      segmentMap.set(segmentName, segment)
    }
    const ranked = Object.fromEntries(GROUPS.map(group => [
      group.id,
      [...reasons[group.id].values()].sort((a, b) => b.count - a.count || a.label.localeCompare(b.label, 'pt-BR')),
    ]))
    return {
      counts,
      ranked,
      total: visits.length,
      classified,
      timeline: [...timeMap.values()].sort((a, b) => a.key.localeCompare(b.key)),
      sellers: [...sellerMap.values()].sort((a, b) => b.total - a.total).slice(0, 8),
      segments: [...segmentMap.values()].sort((a, b) => b.total - a.total),
      purposes: [...purposeCounts].sort((a, b) => b[1] - a[1]).slice(0, 5).map(([id, count]) => ({ id, label: visitPurposeLabel(id), count })),
    }
  }, [visits, periodo])

  const { total, counts, classified, ranked } = insights
  const focus = motivoAtivo !== 'todos' || resultadoAtivo !== 'todos' || vendedorAtivo !== 'todos'
  const topProblem = ranked.negativa[0]
  const topOpportunity = ranked.positiva[0]
  const topPending = ranked.neutra[0]
  const purposeMax = Math.max(1, ...insights.purposes.map(p => p.count))

  return (
    <section className="field-intel" aria-labelledby="field-intel-heading">
      <div className="field-intel-header">
        <div>
          <span className="visitas-eyebrow">Inteligência de Campo</span>
          <h2 id="field-intel-heading">O que realmente está acontecendo nas visitas</h2>
          <p>Motivos relatados pela equipe, pontos fortes e obstáculos que merecem atenção. Todos os gráficos respeitam os filtros da página.</p>
        </div>
        <div className="field-intel-header-actions">
          <span className="field-intel-sample">{format(classified)} de {format(total)} visitas com motivo ({percent(classified, total)}%)</span>
          {focus && <button type="button" className="field-intel-reset" onClick={onResetFilters}>Limpar filtros de análise</button>}
        </div>
      </div>

      {!total ? (
        <div className="field-intel-empty"><IconInfoCircle size={22} /> Nenhuma visita encontrada neste recorte. Ajuste os filtros para ver a análise do campo.</div>
      ) : (
        <>
          <div className="field-intel-outcomes">
            {GROUPS.map(group => (
              <button
                key={group.id}
                type="button"
                className={'field-intel-outcome ' + group.className + (resultadoAtivo === group.id ? ' active' : '')}
                aria-pressed={resultadoAtivo === group.id}
                onClick={() => onOutcomeChange(group.id)}
              >
                <span className="field-intel-outcome-title">{group.short}</span>
                <span className="field-intel-outcome-num">{format(counts[group.id])}<small>{percent(counts[group.id], total)}%</small></span>
                <span className="field-intel-outcome-track"><span style={{ width: percent(counts[group.id], total) + '%' }} /></span>
              </button>
            ))}
          </div>

          <div className="field-intel-brief">
            <div className="field-intel-brief-item negative"><IconAlertTriangle size={21} /><div><small>Principal obstáculo relatado</small><strong>{topProblem ? topProblem.label : 'Sem problema classificado'}</strong><span>{topProblem ? format(topProblem.count) + ' visita(s) com esse motivo' : 'Não há motivos negativos neste recorte'}</span></div></div>
            <div className="field-intel-brief-item positive"><IconCircleCheck size={21} /><div><small>Principal ponto positivo</small><strong>{topOpportunity ? topOpportunity.label : 'Sem oportunidade classificada'}</strong><span>{topOpportunity ? format(topOpportunity.count) + ' visita(s) com esse motivo' : 'Não há motivos positivos neste recorte'}</span></div></div>
            <div className="field-intel-brief-item neutral"><IconClock size={21} /><div><small>Principal pendência</small><strong>{topPending ? topPending.label : 'Sem pendência classificada'}</strong><span>{topPending ? format(topPending.count) + ' visita(s) com esse motivo' : 'Não há motivos neutros neste recorte'}</span></div></div>
          </div>

          <div className="field-intel-reasons-grid">
            {GROUPS.map(group => (
              <ReasonBoard
                key={group.id}
                group={group}
                rows={ranked[group.id]}
                denominator={counts[group.id]}
                active={motivoAtivo}
                onReasonChange={onReasonChange}
              />
            ))}
          </div>

          <div className="field-intel-analysis-grid">
            <article className="field-intel-panel">
              <div className="field-intel-panel-head">
                <div><span className="visitas-eyebrow">Tendência</span><h3>Evolução dos resultados</h3><p>Volume de visitas positivas, neutras e negativas ao longo do período</p></div>
                <IconChartBar size={19} />
              </div>
              {insights.timeline.length > 0 && (
                <div className="field-intel-chart">
                  <ResponsiveContainer width="100%" height={262}>
                    <BarChart data={insights.timeline} margin={{ top: 8, right: 6, left: -22, bottom: 4 }} barCategoryGap="28%">
                      <CartesianGrid stroke="#ECE6DE" vertical={false} strokeDasharray="3 5" />
                      <XAxis dataKey="label" tickLine={false} axisLine={false} tick={{ fill: '#736B63', fontSize: 11 }} />
                      <YAxis allowDecimals={false} tickLine={false} axisLine={false} tick={{ fill: '#736B63', fontSize: 11 }} />
                      <Tooltip formatter={value => [format(value), 'Visitas']} cursor={{ fill: '#F7F2EB' }} contentStyle={{ borderRadius: 12, borderColor: '#E6DFD7' }} />
                      <Legend wrapperStyle={{ fontSize: 12 }} />
                      <Bar dataKey="Positivas" stackId="visitas" fill="#23864A" maxBarSize={68} />
                      <Bar dataKey="Neutras" stackId="visitas" fill="#C18A38" maxBarSize={68} />
                      <Bar dataKey="Negativas" stackId="visitas" fill="#C93A32" radius={[5, 5, 0, 0]} maxBarSize={68} />
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              )}
              <div className="field-intel-chart-summary">
                <span>Composição do período</span>
                <StackedMeter total={total} positive={counts.positiva} neutral={counts.neutra} negative={counts.negativa} />
                <span>{format(total)} visitas</span>
              </div>
            </article>

            <article className="field-intel-panel">
              <div className="field-intel-panel-head">
                <div><span className="visitas-eyebrow">Comparativo</span><h3>Resultado por vendedor</h3><p>Não apenas quantidade: proporção de resultados de cada profissional</p></div>
                <IconTargetArrow size={19} />
              </div>
              {insights.sellers.length ? (
                <div className="field-intel-comparison">
                  {insights.sellers.map(s => (
                    <button key={s.id} className={'field-intel-comparison-row ' + (vendedorAtivo === s.id ? 'selected' : '')} type="button" onClick={() => onSellerChange(s.id)} aria-pressed={vendedorAtivo === s.id}>
                      <span className="field-intel-comparison-title"><strong title={s.label}>{s.label}</strong><span>{format(s.total)} visitas</span></span>
                      <StackedMeter total={s.total} positive={s.positiva} neutral={s.neutra} negative={s.negativa} />
                      <small>{percent(s.positiva, s.total)}% positivas</small>
                    </button>
                  ))}
                </div>
              ) : <p className="field-intel-no-reasons">Nenhuma visita atribuída a vendedores.</p>}
            </article>
          </div>

          <div className="field-intel-analysis-grid">
            <article className="field-intel-panel">
              <div className="field-intel-panel-head"><div><span className="visitas-eyebrow">Segmentos</span><h3>Onde estão os problemas e oportunidades</h3><p>Composição dos resultados por segmento atendido</p></div></div>
              <div className="field-intel-comparison">
                {insights.segments.map(s => (
                  <div key={s.label} className="field-intel-comparison-row static">
                    <span className="field-intel-comparison-title"><strong>{s.label}</strong><span>{format(s.total)} visitas</span></span>
                    <StackedMeter total={s.total} positive={s.positiva} neutral={s.neutra} negative={s.negativa} />
                    <small>{format(s.negativa)} negativas</small>
                  </div>
                ))}
              </div>
            </article>
            <article className="field-intel-panel">
              <div className="field-intel-panel-head"><div><span className="visitas-eyebrow">Agenda comercial</span><h3>Principais objetivos das visitas</h3><p>Em que a equipe está concentrando seu trabalho</p></div></div>
              <div className="field-intel-purposes">
                {insights.purposes.length ? insights.purposes.map(p => (
                  <div className="field-intel-purpose" key={p.id}>
                    <div><strong>{p.label}</strong><b>{p.count}</b></div>
                    <span><span style={{ width: (p.count / purposeMax * 100) + '%' }} /></span>
                  </div>
                )) : <p className="field-intel-no-reasons">Nenhum objetivo informado.</p>}
              </div>
            </article>
          </div>

          <p className="field-intel-method">
            <IconInfoCircle size={15} /> Os indicadores representam registros de visitas, não vendas efetivas. Uma visita pode ter vários motivos; cada motivo conta no máximo uma vez por visita. Os percentuais de cada grupo usam todas as visitas daquele resultado, incluindo as sem motivo. {classified < total ? (format(total - classified) + ' visita(s) ainda sem motivo estruturado.') : ''}
          </p>
        </>
      )}
    </section>
  )
}
