import Topbar from '../components/Topbar'
export default function Vendedores() {
  return (
    <div style={{ flex: 1, display: 'flex', flexDirection: 'column' }}>
      <Topbar title="Vendedores" subtitle="Em desenvolvimento — Bloco 2" />
      <div className="page"><div className="empty">Em breve</div></div>
    </div>
  )
}
