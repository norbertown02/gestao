import { NavLink } from 'react-router-dom'
import logo from '../assets/logo-nutrialle.png'
import {
  IconLayoutDashboard,
  IconReceipt,
  IconClipboardList,
  IconTargetArrow,
  IconFileText,
  IconChartBar,
  IconSettings,
  IconLogout,
  IconRoute,
  IconUsers,
  IconMapPin,
  IconBuildingStore,
  IconChartPie,
  IconTarget,
} from '@tabler/icons-react'
import { useAuth } from '../lib/useAuth'

const NAV = [
  { section: 'Geral' },
  { to: '/', label: 'Dashboard', Icon: IconLayoutDashboard },

  { section: 'Comercial' },
  { to: '/vendas', label: 'Vendas', Icon: IconReceipt },
  { to: '/cotacoes', label: 'Cotações', Icon: IconChartPie },
  { to: '/pipeline', label: 'Pipeline', Icon: IconTargetArrow },
  { to: '/relatorio', label: 'Relatório de Vendas', Icon: IconFileText },

  { section: 'Performance' },
  { to: '/metas', label: 'Metas', Icon: IconTarget },
  { to: '/vendedores', label: 'Vendedores', Icon: IconUsers },
  { to: '/time', label: 'Dashboard do Time', Icon: IconChartBar },
  { to: '/regioes', label: 'Regiões', Icon: IconMapPin },
  { to: '/produtos', label: 'Produtos', Icon: IconBuildingStore },

  { section: 'Campo' },
  { to: '/carteira', label: 'Carteira de Fazendas', Icon: IconChartBar },
  { to: '/visitas', label: 'Visitas', Icon: IconRoute },
  { to: '/checklists', label: 'Checklists', Icon: IconClipboardList },

  { section: 'Sistema' },
  { to: '/config', label: 'Configurações', Icon: IconSettings },
]

function iniciais(nome, email) {
  const base = nome || email || 'Nutrialle'
  const partes = String(base).trim().split(' ').filter(Boolean)

  if (partes.length >= 2) {
    return `${partes[0][0]}${partes[1][0]}`.toUpperCase()
  }

  return String(base).slice(0, 2).toUpperCase()
}

export default function Sidebar() {
  const { user, logout } = useAuth()

  return (
    <aside className="sidebar">
      <div className="sidebar-logo">
        <img src={logo} alt="Nutrialle" className="sidebar-logo-mark" />

      
      </div>

      <nav className="sidebar-nav">
        {NAV.map((item, i) =>
          item.section ? (
            <div key={`section-${i}`} className="sidebar-section">
              {item.section}
            </div>
          ) : (
            <NavLink
              key={item.to}
              to={item.to}
              end={item.to === '/'}
              className={({ isActive }) =>
                `nav-item${isActive ? ' active' : ''}`
              }
            >
              <item.Icon size={18} />
              <span>{item.label}</span>
            </NavLink>
          )
        )}
      </nav>

      <div className="sidebar-user">
        <div className="sidebar-user-card">
          <div className="sidebar-user-avatar">
            {iniciais(user?.name, user?.email)}
          </div>

          <div style={{ minWidth: 0 }}>
            <div className="sidebar-user-name">
              {user?.name || 'Usuário Nutrialle'}
            </div>
            <div className="sidebar-user-email">
              {user?.email || 'gestao@nutrialle.com.br'}
            </div>
          </div>
        </div>

        <button
          type="button"
          onClick={logout}
          className="nav-item sidebar-logout"
        >
          <IconLogout size={18} />
          <span>Sair</span>
        </button>
      </div>
    </aside>
  )
}