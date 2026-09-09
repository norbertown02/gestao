from pathlib import Path
import re

path = Path('src/screens/Fechamentos.jsx')
s = path.read_text()

start = s.index('function CFOFinancialSlides(')
end = s.index('\nfunction aggregateCommercialPeriod', start)
seg = s[start:end]

# 1) Remove ponto de equilíbrio slide and capital de giro slide.
seg, n1 = re.subn(r'\n\s*<Slide key="breakeven".*?</Slide>,', '', seg, count=1, flags=re.S)
seg, n2 = re.subn(r'\n\s*<Slide key="working".*?</Slide>,', '', seg, count=1, flags=re.S)
if n1 != 1 or n2 != 1:
    raise SystemExit(f'Could not remove target slides: breakeven={n1}, working={n2}')

# 2) Presentation now has 15 slides.
seg = seg.replace('const total = 17', 'const total = 15', 1)

# 3) Replace trajectory chart: revenue black, total cost orange, net result as line.
pattern = r'<Slide key="evolution".*?</Slide>,'
match = re.search(pattern, seg, flags=re.S)
if not match:
    raise SystemExit('Evolution slide not found')
new_evolution = '''<Slide key="evolution" page={8} total={total}>{title('evolution','TRAJETÓRIA DO RESULTADO','Receita, custo total e resultado líquido mostram a evolução mensal da operação.',`${cur.monthsAboveBreakEven} de ${cur.monthCount||1} meses acima do equilíbrio`)}<MetricStrip items={[{label:'Receita',value:shortMoney(cur.revenue)},{label:'Custo total',value:shortMoney(cur.variableCosts+cur.fixedCosts)},{label:'Resultado operacional',value:shortMoney(cur.operatingResult)},{label:'Resultado líquido',value:shortMoney(cur.result)}]} /><div className="deck-chart-stage"><ResponsiveContainer width="100%" height="100%"><ComposedChart data={series} margin={{top:35,right:18,left:8,bottom:0}}><CartesianGrid vertical={false} stroke="#e9e1da" strokeDasharray="3 7"/><XAxis dataKey="label" axisLine={false} tickLine={false}/><YAxis axisLine={false} tickLine={false} tickFormatter={v=>`${Math.round(v/1000)}k`}/><Tooltip formatter={v=>money(v)}/><Bar dataKey="Receita" fill="#292623" radius={[7,7,0,0]}><LabelList dataKey="Receita" position="top" formatter={chartLabel} className="deck-bar-label"/></Bar><Bar dataKey="Custo total" fill="#f47b20" radius={[7,7,0,0]}><LabelList dataKey="Custo total" position="top" formatter={chartLabel} className="deck-bar-label orange"/></Bar><Line type="monotone" dataKey="Resultado" stroke="#68a57a" strokeWidth={3.5} dot={{r:4,fill:'#68a57a',stroke:'#fff',strokeWidth:2}}/></ComposedChart></ResponsiveContainer></div><div className="deck-chart-legend"><i className="ink"/> Receita <i className="orange"/> Custo total <i className="result-line"/> Resultado líquido</div></Slide>,'''
seg = seg[:match.start()] + new_evolution + seg[match.end():]

# 4) Renumber all remaining CFO slides sequentially (cover is page 1).
page = 2
def repl_slide(m):
    global page
    key = m.group(1)
    out = f'<Slide key="{key}" page={{{repl_slide.page}}}'
    repl_slide.page += 1
    return out
repl_slide.page = 2
seg = re.sub(r'<Slide key="([^"]+)" page=\{\d+\}', repl_slide, seg)
seg = re.sub(r'<IntegratedExecutiveSlide key="integrated" page=\{\d+\}', lambda m: f'<IntegratedExecutiveSlide key="integrated" page={{{repl_slide.page}}}', seg, count=1)

s = s[:start] + seg + s[end:]

# 5) Add total cost to each monthly series row.
needle = "          Receita: number(row.receitas),\n          Resultado: number(row.resultado_liquido),"
replacement = "          Receita: number(row.receitas),\n          'Custo total': number(row.custos_variaveis) + number(row.custos_fixos),\n          Resultado: number(row.resultado_liquido),"
if needle not in s:
    raise SystemExit('Financial series mapping not found')
s = s.replace(needle, replacement, 1)

path.write_text(s)

# Add legend styling for result line if absent.
css_path = Path('src/screens/FechamentosFinance.css')
css = css_path.read_text()
rule = '.deck-chart-legend .result-line{height:3px;background:#68a57a}'
if rule not in css:
    css += '\n' + rule + '\n'
css_path.write_text(css)
