import { NavLink } from 'react-router-dom'
import {
  IconLayoutDashboard, IconReceipt, IconRoute, IconClipboardList, IconTargetArrow, IconFileText,
  IconChartBar, IconUsers, IconBuildingStore, IconMapPin,
  IconSettings, IconLogout
} from '@tabler/icons-react'
import { useAuth } from '../lib/useAuth'

const NAV = [
  { section: 'Relatórios' },
  { to: '/',           label: 'Dashboard',   Icon: IconLayoutDashboard },
  { to: '/vendas',     label: 'Vendas',       Icon: IconReceipt },
  { to: '/visitas',    label: 'Visitas',       Icon: IconRoute },
  { to: '/checklists', label: 'Checklists',    Icon: IconClipboardList },
  { to: '/carteira',   label: 'Carteira',      Icon: IconChartBar },
  { to: '/vendedores', label: 'Vendedores',    Icon: IconUsers },
  { to: '/produtos',   label: 'Produtos',      Icon: IconBuildingStore },
  { to: '/regioes',    label: 'Regiões',       Icon: IconMapPin },
  { section: 'Sistema' },
  { to: '/pipeline',   label: 'Pipeline',      Icon: IconTargetArrow },
  { to: '/relatorio',  label: 'Rel. Mensal',   Icon: IconFileText },
  { section: 'Sistema' },
  { to: '/config',     label: 'Configurações', Icon: IconSettings },
]

export default function Sidebar() {
  const { user, logout } = useAuth()
  return (
    <div className="sidebar">
      <div className="sidebar-logo" style={{ display: 'flex', alignItems: 'center' }}>
        <div style={{ width: 36, height: 36, borderRadius: 8, background: 'var(--orange)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#fff', fontWeight: 700, fontSize: 16, flexShrink: 0 }}>N</div>
        <div style={{ marginLeft: 10 }}>
          <div style={{ fontWeight: 700, fontSize: 14 }}>Nutrialle</div>
          <div style={{ fontSize: 11, color: 'var(--text-faint)' }}>Gestão</div>
        </div>
      </div>
      <div style={{ flex: 1, padding: '8px 0' }}>
        {NAV.map((item, i) => item.section
          ? <div key={i} className="sidebar-section">{item.section}</div>
          : <NavLink key={item.to} to={item.to} end={item.to === '/'} className={({ isActive }) => 'nav-item' + (isActive ? ' active' : '')}>
              <item.Icon size={17} />{item.label}
            </NavLink>
        )}
      </div>
      <div style={{ padding: '12px 8px', borderTop: '1px solid var(--line)' }}>
        <div style={{ padding: '8px 12px', marginBottom: 4 }}>
          <div style={{ fontSize: 13, fontWeight: 500 }}>{user?.name}</div>
          <div style={{ fontSize: 11, color: 'var(--text-faint)' }}>{user?.email}</div>
        </div>
        <button onClick={logout} className="nav-item" style={{ width: '100%', background: 'none', border: 'none', color: 'var(--red)', cursor: 'pointer' }}>
          <IconLogout size={17} /> Sair
        </button>
      </div>
    </div>
  )
}
