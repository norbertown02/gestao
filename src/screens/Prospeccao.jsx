import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { useAuth } from '../lib/useAuth'
import { IconPlus, IconFileText, IconCheck, IconX, IconClock, IconChevronRight } from '@tabler/icons-react'

const STATUS_CFG = {
  rascunho:   { label: 'Rascunho',   color: 'var(--text-faint)', bg: 'var(--surface-2)' },
  enviada:    { label: 'Enviada',    color: 'var(--amber)',      bg: 'var(--amber-bg)'   },
  convertida: { label: 'Convertida', color: 'var(--green)',      bg: 'var(--green-bg)'   },
  cancelada:  { label: 'Cancelada',  color: 'var(--red)',        bg: 'var(--red-bg)'     },
}

function fmt(n) { return Number(n||0).toLocaleString('pt-BR',{minimumFractionDigits:2,maximumFractionDigits:2}) }
function fmtK(n) { if(n>=1000000) return `R$ ${(n/1000000).toFixed(1)}M`; if(n>=1000) return `R$ ${(n/1000).toFixed(1)}k`; return `R$ ${fmt(n)}` }

export default function Prospeccao() {
  const navigate = useNavigate()
  const { seller } = useAuth()
  const [quotes, setQuotes] = useState([])
  const [farms, setFarms] = useState([])
  const [loading, setLoading] = useState(true)
  const [filtro, setFiltro] = useState('todos')

  useEffect(() => { carregar() }, [])

  async function carregar() {
    setLoading(true)
    const [rQuotes, rFarms] = await Promise.all([
      supabase.from('quotes').select('*').eq('seller_id', seller?.id).order('created_at', {ascending: false}),
      supabase.from('farms').select('id,name,segment,prospect'),
    ])
    setQuotes(rQuotes.data || [])
    setFarms(rFarms.data || [])
    setLoading(false)
  }

  const filtrados = quotes.filter(q => filtro === 'todos' || q.status === filtro)

  const totais = {
    rascunho:   quotes.filter(q => q.status === 'rascunho').length,
    enviada:    quotes.filter(q => q.status === 'enviada').length,
    convertida: quotes.filter(q => q.status === 'convertida').length,
    cancelada:  quotes.filter(q => q.status === 'cancelada').length,
  }

  return (
    <div className="screen-content">
      <div style={{padding:'16px 16px 0'}}>
        <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',marginBottom:16}}>
          <div>
            <div style={{fontSize:18,fontWeight:700}}>Prospecção</div>
            <div style={{fontSize:12,color:'var(--text-faint)'}}>{quotes.length} cotações no total</div>
          </div>
          <button className="btn btn-primary btn-sm" onClick={() => navigate('/prospeccao/nova')}>
            <IconPlus size={15}/> Nova Cotação
          </button>
        </div>

        {/* KPIs */}
        <div style={{display:'grid',gridTemplateColumns:'repeat(4,1fr)',gap:8,marginBottom:16}}>
          {Object.entries(totais).map(([status, count]) => {
            const cfg = STATUS_CFG[status]
            return (
              <div key={status} onClick={() => setFiltro(filtro === status ? 'todos' : status)}
                style={{background: filtro===status ? cfg.bg : 'var(--surface-2)', border: `1px solid ${filtro===status ? cfg.color : 'var(--line)'}`, borderRadius:10, padding:'10px 8px', textAlign:'center', cursor:'pointer', transition:'all .15s'}}>
                <div style={{fontSize:20,fontWeight:700,color:cfg.color}}>{count}</div>
                <div style={{fontSize:10,color:'var(--text-faint)'}}>{cfg.label}</div>
              </div>
            )
          })}
        </div>
      </div>

      {loading ? (
        <div style={{textAlign:'center',padding:40,color:'var(--text-faint)'}}>Carregando...</div>
      ) : filtrados.length === 0 ? (
        <div style={{textAlign:'center',padding:40,color:'var(--text-faint)'}}>
          <IconFileText size={32} style={{marginBottom:8,opacity:.3}}/>
          <div>Nenhuma cotação {filtro !== 'todos' ? STATUS_CFG[filtro]?.label.toLowerCase() : ''}</div>
          <button className="btn btn-primary btn-sm" style={{marginTop:12}} onClick={() => navigate('/prospeccao/nova')}>
            Criar primeira cotação
          </button>
        </div>
      ) : (
        <div style={{padding:'0 16px 100px'}}>
          {filtrados.map(q => {
            const farm = farms.find(f => f.id === q.farm_id)
            const cfg = STATUS_CFG[q.status] || STATUS_CFG.rascunho
            const valido = q.valid_until && new Date(q.valid_until) >= new Date()
            return (
              <div key={q.id} onClick={() => navigate(`/prospeccao/${q.id}`)}
                style={{background:'var(--surface-1)',border:'1px solid var(--line)',borderRadius:12,padding:14,marginBottom:10,cursor:'pointer'}}>
                <div style={{display:'flex',justifyContent:'space-between',alignItems:'flex-start',marginBottom:8}}>
                  <div style={{flex:1}}>
                    <div style={{fontWeight:600,fontSize:14}}>{farm?.name || '—'}</div>
                    <div style={{fontSize:11,color:'var(--text-faint)',marginTop:2,textTransform:'capitalize'}}>{farm?.segment} · {farm?.prospect ? 'Prospecto' : 'Cliente ativo'}</div>
                  </div>
                  <span style={{background:cfg.bg,color:cfg.color,borderRadius:20,padding:'3px 10px',fontSize:11,fontWeight:600,flexShrink:0}}>{cfg.label}</span>
                </div>
                <div style={{display:'flex',justifyContent:'space-between',alignItems:'center'}}>
                  <div>
                    <div style={{fontSize:16,fontWeight:700,color:'var(--orange)'}}>{fmtK(q.total)}</div>
                    <div style={{fontSize:11,color:'var(--text-faint)'}}>{q.payment_term_label || '—'}</div>
                  </div>
                  <div style={{textAlign:'right',display:'flex',flexDirection:'column',alignItems:'flex-end',gap:4}}>
                    {q.valid_until && (
                      <div style={{fontSize:11,color: valido ? 'var(--text-faint)' : 'var(--red)',display:'flex',alignItems:'center',gap:3}}>
                        <IconClock size={11}/>
                        {valido ? `válida até ${new Date(q.valid_until+'T12:00:00').toLocaleDateString('pt-BR',{day:'2-digit',month:'short'})}` : 'Expirada'}
                      </div>
                    )}
                    <div style={{fontSize:11,color:'var(--text-faint)'}}>
                      {new Date(q.created_at).toLocaleDateString('pt-BR',{day:'2-digit',month:'short'})}
                    </div>
                  </div>
                </div>
                {q.notes && <div style={{fontSize:11,color:'var(--text-dim)',marginTop:8,borderTop:'1px solid var(--line)',paddingTop:6}}>{q.notes}</div>}
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
