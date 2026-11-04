import { useNavigate } from 'react-router-dom'
import { IconArrowLeft, IconSitemap } from '@tabler/icons-react'
import Topbar from '../components/Topbar'
import EstruturaComercial from '../components/EstruturaComercial'

export default function EstruturaComercialPage() {
  const navigate = useNavigate()
  return <div style={{ flex: 1, minWidth: 0, overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>
    <Topbar title="Estrutura Comercial" subtitle="Supervisores, promotores e vendedores">
      <button type="button" className="btn btn-ghost btn-sm" onClick={() => navigate('/vendedores')}>
        <IconArrowLeft size={17}/> Voltar para Equipe e Metas
      </button>
    </Topbar>
    <main className="page" style={{ overflowY: 'auto', minWidth: 0, paddingBottom: 40 }}>
      <div style={{ maxWidth: 1120, margin: '0 auto', width: '100%', minWidth: 0 }}>
        <div style={{ display:'flex', alignItems:'center', gap:12, margin:'12px 0 20px' }}>
          <span style={{ display:'grid', placeItems:'center',width:44,height:44,background:'#fff1e6',borderRadius:14,color:'#e87722' }}><IconSitemap size={23}/></span>
          <div><h2 style={{fontSize:23, margin:0, color:'#24201e'}}>Organização das equipes</h2><p style={{fontSize:13,color:'#777',margin:'5px 0 0'}}>Cadastre o supervisor responsável e organize os profissionais que aparecem no Campo.</p></div>
        </div>
        <EstruturaComercial />
      </div>
    </main>
  </div>
}
