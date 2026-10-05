import { useEffect, useMemo, useState } from 'react'
import { IconDeviceFloppy, IconSearch, IconTag } from '@tabler/icons-react'
import Topbar from '../components/Topbar'
import { supabase } from '../lib/supabase'

function fmt(value) {
  return Number(value || 0).toLocaleString('pt-BR', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })
}

function parseMoney(value) {
  const normalized = String(value ?? '')
    .replace(/\s/g, '')
    .replace(/\./g, '')
    .replace(',', '.')
  const number = Number(normalized)
  return Number.isFinite(number) ? number : null
}

export default function TabelaPrecos() {
  const [products, setProducts] = useState([])
  const [drafts, setDrafts] = useState({})
  const [loading, setLoading] = useState(true)
  const [savingId, setSavingId] = useState(null)
  const [busca, setBusca] = useState('')
  const [segmento, setSegmento] = useState('todos')
  const [message, setMessage] = useState(null)

  async function load() {
    setLoading(true)
    const { data, error } = await supabase
      .from('products')
      .select('id,name,segment,price_kg,price,bag_kg,active')
      .eq('active', true)
      .order('name')

    if (error) {
      setMessage({ type: 'error', text: 'Não foi possível carregar a tabela de preços.' })
      setProducts([])
    } else {
      setProducts(data || [])
      setDrafts(Object.fromEntries((data || []).map(p => [p.id, fmt(p.price_kg)])))
    }
    setLoading(false)
  }

  useEffect(() => { load() }, [])

  const segmentos = useMemo(() => {
    const values = [...new Set(products.map(p => p.segment).filter(Boolean))]
    return ['todos', ...values]
  }, [products])

  const filtrados = products.filter(p => {
    const term = busca.trim().toLowerCase()
    const matchesSearch = !term || p.name?.toLowerCase().includes(term)
    const matchesSegment = segmento === 'todos' || p.segment === segmento
    return matchesSearch && matchesSegment
  })

  async function savePrice(product) {
    const priceKg = parseMoney(drafts[product.id])
    if (priceKg === null || priceKg < 0) {
      setMessage({ type: 'error', text: 'Informe um preço por kg válido.' })
      return
    }

    setSavingId(product.id)
    setMessage(null)
    const { data, error } = await supabase
      .from('products')
      .update({ price_kg: priceKg })
      .eq('id', product.id)
      .select('id,price_kg,price,bag_kg')
      .single()

    if (error) {
      setMessage({ type: 'error', text: error.message || 'Não foi possível salvar o preço.' })
    } else {
      setProducts(prev => prev.map(p => p.id === product.id ? { ...p, ...data } : p))
      setDrafts(prev => ({ ...prev, [product.id]: fmt(data.price_kg) }))
      setMessage({ type: 'success', text: `${product.name}: preço atualizado. O App Campo já passa a usar este valor.` })
    }
    setSavingId(null)
  }

  return (
    <div style={{flex:1,overflow:'hidden',display:'flex',flexDirection:'column'}}>
      <Topbar title="Tabela de Preços" subtitle="Fonte oficial dos preços exibidos no App Campo"/>
      <div className="page" style={{overflowY:'auto'}}>
        <div className="card" style={{marginBottom:16}}>
          <div style={{display:'flex',justifyContent:'space-between',gap:16,alignItems:'flex-start',flexWrap:'wrap'}}>
            <div>
              <div className="section-title" style={{marginBottom:4}}>Preços de venda</div>
              <div style={{fontSize:12,color:'var(--text-faint)'}}>
                Cadastre o valor em R$/kg. O preço por saco é calculado automaticamente conforme o peso cadastrado do produto.
              </div>
            </div>
            <div style={{fontSize:12,color:'var(--text-dim)',background:'var(--surface-2)',border:'1px solid var(--line)',padding:'8px 10px',borderRadius:9}}>
              {products.length} produtos ativos
            </div>
          </div>
        </div>

        {message && (
          <div style={{
            marginBottom:14,padding:'10px 12px',borderRadius:10,fontSize:12,
            color:message.type==='error'?'var(--red)':'var(--green)',
            background:message.type==='error'?'var(--red-bg)':'var(--green-bg)',
            border:`1px solid ${message.type==='error'?'var(--red)':'var(--green)'}`
          }}>
            {message.text}
          </div>
        )}

        <div style={{display:'flex',gap:10,marginBottom:14,flexWrap:'wrap'}}>
          <div style={{position:'relative',flex:'1 1 300px'}}>
            <IconSearch size={16} style={{position:'absolute',left:11,top:'50%',transform:'translateY(-50%)',color:'var(--text-faint)'}}/>
            <input
              value={busca}
              onChange={e=>setBusca(e.target.value)}
              placeholder="Buscar produto..."
              style={{width:'100%',paddingLeft:34}}
            />
          </div>
          <select value={segmento} onChange={e=>setSegmento(e.target.value)} style={{minWidth:160}}>
            {segmentos.map(s => <option key={s} value={s}>{s === 'todos' ? 'Todos os segmentos' : s}</option>)}
          </select>
        </div>

        <div className="card" style={{padding:0,overflow:'hidden'}}>
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Produto</th>
                  <th>Segmento</th>
                  <th>Kg/saco</th>
                  <th style={{minWidth:150}}>Preço R$/kg</th>
                  <th>Preço/saco</th>
                  <th style={{width:110}}>Ação</th>
                </tr>
              </thead>
              <tbody>
                {loading ? (
                  <tr><td colSpan={6} style={{textAlign:'center',padding:28,color:'var(--text-faint)'}}>Carregando...</td></tr>
                ) : filtrados.length === 0 ? (
                  <tr>
                    <td colSpan={6} style={{textAlign:'center',padding:32,color:'var(--text-faint)'}}>
                      <IconTag size={28} style={{opacity:.35,marginBottom:6}}/>
                      <div>Nenhum produto encontrado</div>
                    </td>
                  </tr>
                ) : filtrados.map(product => {
                  const draftValue = drafts[product.id] ?? ''
                  const draftNumber = parseMoney(draftValue)
                  const current = Number(product.price_kg || 0)
                  const changed = draftNumber !== null && Math.abs(draftNumber - current) > 0.0001
                  const bagPrice = draftNumber === null ? Number(product.price || 0) : draftNumber * Number(product.bag_kg || 25)

                  return (
                    <tr key={product.id}>
                      <td style={{fontWeight:600}}>{product.name}</td>
                      <td><span className="pill pill-gray" style={{textTransform:'capitalize'}}>{product.segment || '—'}</span></td>
                      <td>{Number(product.bag_kg || 25).toLocaleString('pt-BR')} kg</td>
                      <td>
                        <div style={{display:'flex',alignItems:'center',gap:6}}>
                          <span style={{fontSize:12,color:'var(--text-faint)'}}>R$</span>
                          <input
                            inputMode="decimal"
                            value={draftValue}
                            onChange={e=>setDrafts(prev=>({...prev,[product.id]:e.target.value}))}
                            style={{
                              width:100,padding:'6px 8px',fontWeight:600,
                              borderColor:changed?'var(--orange)':'var(--line)'
                            }}
                          />
                        </div>
                      </td>
                      <td style={{fontWeight:600}}>R$ {fmt(bagPrice)}</td>
                      <td>
                        <button
                          className="btn btn-primary btn-sm"
                          disabled={!changed || savingId===product.id}
                          onClick={()=>savePrice(product)}
                          style={{whiteSpace:'nowrap'}}
                        >
                          <IconDeviceFloppy size={14}/>
                          {savingId===product.id?'Salvando':'Salvar'}
                        </button>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </div>
  )
}
