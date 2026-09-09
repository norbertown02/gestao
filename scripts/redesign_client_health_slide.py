from pathlib import Path

jsx = Path('src/screens/Fechamentos.jsx')
s = jsx.read_text()
old = '''      <div className="deck-forgotten-summary"><div><span>PRIORIDADES DE RETOMADA</span><strong>{cur.forgottenClients.length} clientes sem pedido</strong></div><p>Ordenados pelo total histórico comprado, com a recência como contexto para a abordagem comercial.</p></div>\n      <div className="deck-forgotten-head"><span>Cliente</span><span>Total já comprado</span><span>Último pedido</span><span>Sem comprar</span></div><div className="deck-forgotten-list">{cur.forgottenClients.slice(0,10).map((client,index)=><div key={client.key}><b>{String(index+1).padStart(2,'0')}</b><span><strong>{client.name}</strong><small>{index < 3 ? 'prioridade alta pelo histórico' : 'oportunidade de retomada'}</small></span><strong>{shortMoney(client.historicalValue)}</strong><span>{new Date(`${client.lastOrder}T12:00:00`).toLocaleDateString('pt-BR')}</span><em>{client.age} dias</em></div>)}</div>\n      <div className="deck-forgotten-note">Total comprado considera o faturamento líquido acumulado disponível desde janeiro de 2026.</div>'''
new = '''      <div className="deck-forgotten-summary"><div><span>PRIORIDADES DE RETOMADA</span><strong>{cur.forgottenClients.length} clientes sem pedido</strong></div><p>Top 10 por histórico comprado, com recência para orientar a retomada comercial.</p></div>\n      <div className="deck-retention-grid">\n        {[cur.forgottenClients.slice(0,5), cur.forgottenClients.slice(5,10)].map((group, groupIndex) => <div className="deck-retention-column" key={groupIndex}>\n          <div className="deck-retention-head"><span>Cliente</span><span>Histórico</span><span>Sem comprar</span></div>\n          {group.map((client,index)=>{ const rank = groupIndex * 5 + index; return <div className="deck-retention-row" key={client.key}>\n            <b>{String(rank+1).padStart(2,'0')}</b>\n            <div><strong>{client.name}</strong><small>último pedido {new Date(`${client.lastOrder}T12:00:00`).toLocaleDateString('pt-BR')}</small></div>\n            <strong>{shortMoney(client.historicalValue)}</strong>\n            <em>{client.age} dias</em>\n          </div>})}\n        </div>)}\n      </div>\n      <div className="deck-forgotten-note">Total comprado considera o faturamento líquido acumulado disponível desde janeiro de 2026.</div>'''
if old not in s:
    raise SystemExit('target JSX block not found')
s = s.replace(old, new, 1)
jsx.write_text(s)

css = Path('src/screens/FechamentosFinance.css')
c = css.read_text()
block = r'''

/* client health v3: presentation-first two-column layout */
.deck-client-health{padding-top:58px!important;padding-bottom:44px!important;overflow:hidden!important}
.deck-client-health .deck-title{margin-bottom:16px!important}
.deck-client-health .deck-title h2{font-size:38px!important;line-height:1.08!important;letter-spacing:-.035em!important;margin-top:7px!important;max-width:1080px!important}
.deck-client-health .deck-title small{font-size:10px!important}
.deck-client-health .deck-metric-strip{margin:0 0 16px!important;gap:0!important}
.deck-client-health .deck-metric-strip>div{padding:13px 18px!important;min-height:72px!important}
.deck-client-health .deck-metric-strip span{font-size:8px!important}
.deck-client-health .deck-metric-strip strong{font-size:25px!important;margin-top:4px!important}
.deck-client-health .deck-metric-strip small{font-size:8px!important;margin-top:3px!important}
.deck-client-health .deck-forgotten-summary{margin:0 0 14px!important;padding:11px 16px!important;min-height:0!important;display:grid!important;grid-template-columns:260px 1fr!important;align-items:center!important;gap:20px!important}
.deck-client-health .deck-forgotten-summary strong{font-size:20px!important;line-height:1.05!important}
.deck-client-health .deck-forgotten-summary span{font-size:8px!important}
.deck-client-health .deck-forgotten-summary p{font-size:9px!important;line-height:1.35!important;margin:0!important;text-align:right!important}
.deck-retention-grid{display:grid;grid-template-columns:1fr 1fr;gap:28px;margin-top:2px}
.deck-retention-column{min-width:0;border-top:1px solid #d9d0c8}
.deck-retention-head{display:grid;grid-template-columns:minmax(0,1fr) 92px 82px;gap:12px;padding:8px 10px 7px 46px;border-bottom:1px solid #ded6cf;color:#8b8179;font-size:7.5px;font-weight:900;letter-spacing:.12em;text-transform:uppercase}
.deck-retention-head span:nth-child(n+2){text-align:right}
.deck-retention-row{display:grid;grid-template-columns:28px minmax(0,1fr) 92px 82px;gap:12px;align-items:center;min-height:53px;padding:0 10px;border-bottom:1px solid #e4ddd7}
.deck-retention-row>b{font-size:9px;color:#a39890}
.deck-retention-row>div{min-width:0}
.deck-retention-row>div>strong{display:block;font-size:12px;line-height:1.08;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;color:#2d2926}
.deck-retention-row>div>small{display:block;margin-top:4px;font-size:8px;color:#948981}
.deck-retention-row>strong{text-align:right;font-size:12px;white-space:nowrap;color:#2d2926}
.deck-retention-row>em{text-align:right;font-style:normal;font-size:11px;font-weight:900;color:#e87722;white-space:nowrap}
.deck-client-health .deck-forgotten-note{margin-top:10px!important;font-size:7.5px!important;text-align:right!important;color:#a49a92!important}
'''
marker = '/* client health v3: presentation-first two-column layout */'
if marker in c:
    c = c[:c.index(marker)]
css.write_text(c.rstrip() + block)
