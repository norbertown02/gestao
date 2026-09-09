from pathlib import Path

jsx = Path('src/screens/Fechamentos.jsx')
s = jsx.read_text()
old = '<Slide key="client-health" page={8} total={total}>'
new = '<Slide key="client-health" page={8} total={total} className="deck-client-health">'
if old in s:
    s = s.replace(old, new, 1)
elif new not in s:
    raise SystemExit('client-health slide marker not found')
jsx.write_text(s)

css = Path('src/screens/FechamentosFinance.css')
c = css.read_text()
marker = '/* compact client health: 10 rows fit inside slide */'
block = '''
/* compact client health: 10 rows fit inside slide */
.deck-client-health{padding-top:44px!important;padding-bottom:30px!important;overflow:hidden!important}
.deck-client-health .deck-title{margin-bottom:8px!important}
.deck-client-health .deck-title h2{font-size:25px!important;line-height:1.06!important;margin-top:3px!important}
.deck-client-health .deck-title small{font-size:8px!important}
.deck-client-health .deck-metric-strip{margin:0 0 7px!important;gap:8px!important}
.deck-client-health .deck-metric-strip>div{padding:8px 12px!important;min-height:50px!important}
.deck-client-health .deck-metric-strip span{font-size:7px!important}
.deck-client-health .deck-metric-strip strong{font-size:18px!important;margin-top:2px!important}
.deck-client-health .deck-metric-strip small{font-size:7px!important;margin-top:1px!important}
.deck-client-health .deck-forgotten-summary{margin:4px 0 6px!important;padding:7px 11px!important;min-height:0!important}
.deck-client-health .deck-forgotten-summary strong{font-size:14px!important}
.deck-client-health .deck-forgotten-summary span,.deck-client-health .deck-forgotten-summary p{font-size:7.5px!important;line-height:1.15!important;margin:0!important}
.deck-client-health .deck-forgotten-head{min-height:18px!important;height:18px!important;padding:0 8px!important;font-size:7px!important}
.deck-client-health .deck-forgotten-list{margin:0!important}
.deck-client-health .deck-forgotten-list>div{min-height:27px!important;height:27px!important;padding:0 8px!important;gap:7px!important}
.deck-client-health .deck-forgotten-list>div>b{font-size:7px!important}
.deck-client-health .deck-forgotten-list>div>span>strong{font-size:8.5px!important;line-height:1!important;display:block!important;white-space:nowrap!important;overflow:hidden!important;text-overflow:ellipsis!important}
.deck-client-health .deck-forgotten-list>div>span>small{font-size:6px!important;line-height:1!important;display:block!important;margin-top:1px!important}
.deck-client-health .deck-forgotten-list>div>strong,.deck-client-health .deck-forgotten-list>div>span,.deck-client-health .deck-forgotten-list>div>em{font-size:7.5px!important}
.deck-client-health .deck-forgotten-note{margin-top:4px!important;font-size:6px!important}
'''
if marker not in c:
    css.write_text(c + block)
