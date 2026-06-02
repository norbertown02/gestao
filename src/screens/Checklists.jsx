import Topbar from '../components/Topbar'
export default function Checklists() {
  return (
    <div style={{ flex: 1, display: 'flex', flexDirection: 'column' }}>
      <Topbar title="Checklists" subtitle="Em desenvolvimento — Bloco 2" />
      <div className="page"><div className="empty">Em breve</div></div>
    </div>
  )
}
