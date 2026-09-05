from pathlib import Path
import re

p = Path('src/screens/Fechamentos.jsx')
s = p.read_text()

def rep(old, new, count=1, label='trecho'):
    global s
    if old not in s:
        raise SystemExit(f'{label} not found')
    s = s.replace(old, new, count)

s = s.replace('aria-label="Mapa do faturamento líquido por estado"', 'aria-label="Mapa dos pedidos por estado"')
s = s.replace('<span>menor faturamento</span><b>maior faturamento</b>', '<span>menor volume de pedidos</span><b>maior volume de pedidos</b>')
rep('const total = 13\n  const { current: cur, previous: prev, trajectory, trajectoryDaily } = data', 'const total = 12\n  const { current: cur, previous: prev, trajectory, trajectoryDaily } = data', label='commercial total')
s = s.replace('  const maxSegment = Math.max(...cur.segments.map(item => item.value), 1)\n', '', 1)

rep('''    <Slide key="clients" page={7} total={total}>
      <SlideTitle eyebrow="CARTEIRA DE CLIENTES" aside={`${cur.billedClients} clientes faturados`} editKey="comercial.clients.title" editor={editor}>{cur.clients.length ? `Os cinco maiores clientes representam ${pct(cur.top5ClientShare)} do faturamento.` : 'Ainda não há clientes faturados no período.'}</SlideTitle>
      <MetricStrip items={[{ label: 'Maior cliente', value: pct(cur.topClientShare), note: 'participação na receita' }, { label: 'Top 3', value: pct(cur.top3ClientShare), note: 'concentração da receita' }, { label: 'Top 5', value: pct(cur.top5ClientShare), note: 'concentração da receita' }, { label: 'Clientes faturados', value: cur.billedClients, note: `vs. ${prev.billedClients} no ${comparisonNoun}` }]} />
      <div className="deck-client-bars">{cur.clients.slice(0, 7).map((client, index) => <div key={client.name}><b>{String(index + 1).padStart(2, '0')}</b><span>{client.name}</span><i><em style={{ width: `${client.value / maxClient * 100}%` }} /></i><strong>{shortMoney(client.value)}</strong><small>{pct(client.share)}</small></div>)}</div>
    </Slide>,''', '''    <Slide key="clients" page={7} total={total}>
      <SlideTitle eyebrow="CARTEIRA DE CLIENTES" aside={`${cur.orderClientCount} clientes com pedidos`} editKey="comercial.clients.title" editor={editor}>{cur.clients.length ? `Os cinco maiores clientes representam ${pct(cur.top5ClientShare)} dos pedidos do período.` : 'Ainda não há clientes com pedidos no período.'}</SlideTitle>
      <MetricStrip items={[{ label: 'Maior cliente', value: pct(cur.topClientShare), note: 'participação nos pedidos' }, { label: 'Top 3', value: pct(cur.top3ClientShare), note: 'concentração dos pedidos' }, { label: 'Top 5', value: pct(cur.top5ClientShare), note: 'concentração dos pedidos' }, { label: 'Clientes com pedidos', value: cur.orderClientCount, note: `vs. ${prev.orderClientCount} no ${comparisonNoun}` }]} />
      <div className="deck-client-bars">{cur.clients.slice(0, 7).map((client, index) => <div key={client.name}><b>{String(index + 1).padStart(2, '0')}</b><span>{client.name}</span><i><em style={{ width: `${client.value / maxClient * 100}%` }} /></i><strong>{shortMoney(client.value)}</strong><small>{pct(client.share)}</small></div>)}</div>
    </Slide>,''', label='clients slide')

rep('''    <Slide key="products" page={9} total={total} tone="dark">
      <SlideTitle eyebrow="MIX DE PRODUTOS" aside="faturamento líquido" editKey="comercial.products.title" editor={editor}>Produtos que formaram o faturamento líquido do período.</SlideTitle>
      <div className="deck-products"><div className="deck-product-hero"><span>PRODUTO LÍDER</span><h3>{cur.products[0]?.name || 'Sem faturamento'}</h3><strong>{shortMoney(cur.products[0]?.value)}</strong><small>{cur.billing ? pct((cur.products[0]?.value || 0) / cur.billing * 100) : '0%'} do faturamento{prev.products[0]?.name === cur.products[0]?.name ? ' · mesmo líder do período anterior' : ''}</small></div><div className="deck-product-bars">{cur.products.slice(1, 6).map(product => <div key={product.name}><span>{product.name}</span><i><em style={{ width: `${product.value / maxProduct * 100}%`, background: '#F1D58A' }} /></i><strong>{shortMoney(product.value)}</strong></div>)}</div></div>
    </Slide>,''', '''    <Slide key="products" page={9} total={total} tone="dark">
      <SlideTitle eyebrow="MIX DE PRODUTOS" aside="pedidos do período" editKey="comercial.products.title" editor={editor}>Produtos que formaram os pedidos do período.</SlideTitle>
      <div className="deck-products"><div className="deck-product-hero"><span>PRODUTO LÍDER</span><h3>{cur.products[0]?.name || 'Sem pedidos'}</h3><strong>{shortMoney(cur.products[0]?.value)}</strong><small>{cur.ordersValue ? pct((cur.products[0]?.value || 0) / cur.ordersValue * 100) : '0%'} dos pedidos{prev.products[0]?.name === cur.products[0]?.name ? ' · mesmo líder do período anterior' : ''}</small></div><div className="deck-product-bars">{cur.products.slice(1, 6).map(product => <div key={product.name}><span>{product.name}</span><i><em style={{ width: `${product.value / maxProduct * 100}%`, background: '#F1D58A' }} /></i><strong>{shortMoney(product.value)}</strong></div>)}</div></div>
    </Slide>,''', label='products slide')

s, n = re.subn(r'\n    <Slide key="segments" page=\{10\} total=\{total\} tone="dark">.*?\n    </Slide>,', '', s, count=1, flags=re.S)
if n != 1: raise SystemExit('segments slide not found')

rep('''    <Slide key="regions" page={11} total={total}>
      <SlideTitle eyebrow="PRESENÇA DE MERCADO" aside={`${cur.activeClients} clientes ativos`} editKey="comercial.regions.title" editor={editor}>Distribuição do faturamento líquido por estado{leaderChanged ? ' — liderança mudou no período' : ''}.</SlideTitle>
      <MetricStrip items={[{ label: 'Estado líder', value: cur.regions[0]?.name || '—', note: shortMoney(cur.regions[0]?.value) }, { label: 'Participação do líder', value: cur.billing ? pct((cur.regions[0]?.value || 0) / cur.billing * 100) : '—' }, { label: `Líder — ${comparisonNoun}`, value: prev.regions[0]?.name || '—' }, { label: 'Estados faturados', value: cur.regions.length }]} />
      <div className="deck-region-layout map"><BrazilSalesMap regions={cur.regions} /><div className="deck-region-list">{cur.regions.slice(0, 6).map((region, index) => <div key={region.name}><i style={{ background: COLORS[index % COLORS.length] }} /><strong>{region.name}</strong><span>{shortMoney(region.value)}</span><small>{cur.billing ? pct(region.value / cur.billing * 100) : '0%'}</small></div>)}</div></div>
    </Slide>,
    <Slide key="close" page={12} total={total} tone="dark" className="deck-close">''', '''    <Slide key="regions" page={10} total={total}>
      <SlideTitle eyebrow="PRESENÇA DE MERCADO" aside={`${cur.orderClientCount} clientes com pedidos`} editKey="comercial.regions.title" editor={editor}>Distribuição dos pedidos por estado{leaderChanged ? ' — liderança mudou no período' : ''}.</SlideTitle>
      <MetricStrip items={[{ label: 'Estado líder', value: cur.regions[0]?.name || '—', note: shortMoney(cur.regions[0]?.value) }, { label: 'Participação do líder', value: cur.ordersValue ? pct((cur.regions[0]?.value || 0) / cur.ordersValue * 100) : '—' }, { label: `Líder — ${comparisonNoun}`, value: prev.regions[0]?.name || '—' }, { label: 'Estados com pedidos', value: cur.regions.length }]} />
      <div className="deck-region-layout map"><BrazilSalesMap regions={cur.regions} /><div className="deck-region-list">{cur.regions.slice(0, 6).map((region, index) => <div key={region.name}><i style={{ background: COLORS[index % COLORS.length] }} /><strong>{region.name}</strong><span>{shortMoney(region.value)}</span><small>{cur.ordersValue ? pct(region.value / cur.ordersValue * 100) : '0%'}</small></div>)}</div></div>
    </Slide>,
    <Slide key="close" page={11} total={total} tone="dark" className="deck-close">''', label='regions slide')
s = s.replace('<IntegratedExecutiveSlide key="integrated" page={13} total={total} commercial={cur}', '<IntegratedExecutiveSlide key="integrated" page={12} total={total} commercial={cur}', 1)

rep('''  const productMap = new Map()
  periodDocs.forEach(doc => (doc.fiscal_document_items || []).forEach(item => {
    const name = item.product_name || 'Produto não identificado'
    const sign = Math.sign(fiscalDocumentValue(doc))
    productMap.set(name, (productMap.get(name) || 0) + Math.abs(number(item.product_total)) * sign)
  }))''', '''  const productMap = new Map()
  periodOrders.forEach(order => {
    const items = Array.isArray(order.items) ? order.items : []
    const itemValue = item => {
      const direct = number(item?.product_total ?? item?.subtotal ?? item?.total ?? item?.value)
      if (direct) return Math.abs(direct)
      return Math.abs(number(item?.quantity ?? item?.qty) * number(item?.unitPrice ?? item?.unit_price))
    }
    const grossItems = items.reduce((sum, item) => sum + itemValue(item), 0)
    const scale = grossItems ? netOrderValue(order) / grossItems : 0
    items.forEach(item => {
      const rawName = item?.productName || item?.product_name || item?.name || item?.product || 'Produto não identificado'
      const name = String(rawName).replace(/\\s+-\\s*$/, '').trim()
      productMap.set(name, (productMap.get(name) || 0) + itemValue(item) * scale)
    })
  })''', label='products aggregation')

rep('''  const regionMap = new Map()
  const clientMap = new Map()
  const segmentMap = new Map()
  periodDocs.forEach(doc => {
    const farm = ctx.farmByPartner.get(number(doc.partner_id))
    const stateName = farm?.state || 'Sem UF'
    const clientName = doc.partner_name || 'Cliente não identificado'
    const segmentName = farm?.segment || 'Sem segmento'
    const value = fiscalDocumentValue(doc)
    regionMap.set(stateName, (regionMap.get(stateName) || 0) + fiscalDocumentValue(doc))
    clientMap.set(clientName, (clientMap.get(clientName) || 0) + value)
    const segment = segmentMap.get(segmentName) || { name: segmentName, value: 0, clients: new Set() }
    segment.value += value
    if (doc.partner_id) segment.clients.add(doc.partner_id)
    segmentMap.set(segmentName, segment)
  })''', '''  const regionMap = new Map()
  const clientMap = new Map()
  const segmentMap = new Map()
  periodOrders.forEach(order => {
    const farm = ctx.farmById.get(order.farm_id)
    const stateName = farm?.state || 'Sem UF'
    const clientName = order.customer_name || order.partner_name || 'Cliente não identificado'
    const value = netOrderValue(order)
    regionMap.set(stateName, (regionMap.get(stateName) || 0) + value)
    clientMap.set(clientName, (clientMap.get(clientName) || 0) + value)
  })
  periodDocs.forEach(doc => {
    const farm = ctx.farmByPartner.get(number(doc.partner_id))
    const segmentName = farm?.segment || 'Sem segmento'
    const value = fiscalDocumentValue(doc)
    const segment = segmentMap.get(segmentName) || { name: segmentName, value: 0, clients: new Set() }
    segment.value += value
    if (doc.partner_id) segment.clients.add(doc.partner_id)
    segmentMap.set(segmentName, segment)
  })''', label='clients regions aggregation')

rep('ordersValue, billing, goal, returns, billedClients, clientIds, newClientIds, newClientCount: newClientIds.length,', 'ordersValue, billing, goal, returns, billedClients, orderClientCount: currentOrderClients.size, clientIds, newClientIds, newClientCount: newClientIds.length,', label='order client count')

rep('''        const orders = ordersRes.data || []
        const docs = docsRes.data || []''', '''        const rawOrders = ordersRes.data || []
        const orderIds = rawOrders.map(row => row.id).filter(Boolean)
        const orderItemsById = new Map()
        for (let offset = 0; offset < orderIds.length; offset += 250) {
          const chunk = orderIds.slice(offset, offset + 250)
          const salesItemsRes = await supabaseAdmin.from('sales').select('id,items').in('id', chunk)
          if (salesItemsRes.error) throw salesItemsRes.error
          ;(salesItemsRes.data || []).forEach(row => {
            let items = row.items
            if (typeof items === 'string') {
              try { items = JSON.parse(items) } catch { items = [] }
            }
            orderItemsById.set(String(row.id), Array.isArray(items) ? items : [])
          })
        }
        const orders = rawOrders.map(row => ({ ...row, items: orderItemsById.get(String(row.id)) || [] }))
        const docs = docsRes.data || []''', label='order items setup')

rep('''        const farmByPartner = new Map(farms.filter(row => row.ultra_partner_id).map(row => [number(row.ultra_partner_id), row]))
        const ctx = {
          orders, docs, goals, profileById, profileByUltra, farmByPartner, vendedoresById,''', '''        const farmByPartner = new Map(farms.filter(row => row.ultra_partner_id).map(row => [number(row.ultra_partner_id), row]))
        const farmById = new Map(farms.map(row => [row.id, row]))
        const ctx = {
          orders, docs, goals, profileById, profileByUltra, farmByPartner, farmById, vendedoresById,''', label='farm id map')

p.write_text(s)
