import { NavLink } from 'react-router-dom'
import logo from '../assets/logo-nutrialle.png'
import {
  IconLayoutDashboard,
  IconReceipt,
  IconClipboardList,
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
  IconArrowLeft,
} from '@tabler/icons-react'
import { useAuth } from '../lib/useAuth'
import { supabase } from '../lib/supabase'

// Mesmo dominio de verdade do Painel (painel.nutrialle.com.br) -- quando o
// Gestao ja esta rodando atras do proxy (/gestao) a volta e so um caminho
// relativo (mesma origem, mesma sessao); fora daqui (acesso direto) levamos
// a sessao junto no hash pra nao pedir login de novo.
const APP_PAINEL_URL = 'https://painel.nutrialle.com.br'

async function voltarAoPainel() {
  const sobGestao = window.location.pathname.indexOf('/gestao') === 0
  const destino = sobGestao ? '/' : APP_PAINEL_URL
  const { data: { session } } = await supabase.auth.getSession()
  if (session) {
    window.location.href = destino + '#sso_at=' + encodeURIComponent(session.access_token) + '&sso_rt=' + encodeURIComponent(session.refresh_token)
  } else {
    window.location.href = destino
  }
}

const NAV = [
  { section: 'Geral' },
  { to: '/', label: 'Dashboard', Icon: IconLayoutDashboard },

  { section: 'Operação comercial' },
  { to: '/vendas', label: 'Gestão Comercial', Icon: IconReceipt },
  { to: '/cotacoes', label: 'Oportunidades', Icon: IconChartPie },

  { section: 'Equipe e metas' },
  { to: '/metas', label: 'Metas', Icon: IconTarget },
  { to: '/vendedores', label: 'Equipe Comercial', Icon: IconUsers },

  { section: 'Análises' },
  { to: '/regioes', label: 'Regiões', Icon: IconMapPin },
  { to: '/produtos', label: 'Produtos', Icon: IconBuildingStore },
  { to: '/relatorio', label: 'Relatório Executivo', Icon: IconFileText },

  { section: 'Execução em campo' },
  { to: '/carteira', label: 'Carteira de Clientes', Icon: IconChartBar },
  { to: '/visitas', label: 'Visitas', Icon: IconRoute },
  { to: '/checklists', label: 'Diagnósticos', Icon: IconClipboardList },

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

      <button
        type="button"
        onClick={voltarAoPainel}
        className="nav-item"
        style={{ marginBottom: 6 }}
      >
        <IconArrowLeft size={18} />
        <span>Voltar ao Painel</span>
      </button>

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
