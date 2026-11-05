import { useState } from 'react'
import { NavLink, useLocation } from 'react-router-dom'
import {
  IconLayoutDashboard,
  IconReceipt,
  IconChartBar,
  IconMenu2,
  IconX,
  IconMapPin,
  IconBuildingStore,
  IconBox,
  IconPresentation,
  IconReportMoney,
  IconFileInvoice,
  IconChartPie,
  IconUsers,
  IconRoute,
  IconClipboardList,
  IconSettings,
  IconTruckDelivery,
  IconCurrencyDollar,
} from '@tabler/icons-react'
import { useAuth } from '../lib/useAuth'

const MAIN = [
  { to: '/', label: 'Dashboard', Icon: IconLayoutDashboard },
  { to: '/vendas', label: 'Comercial', Icon: IconReceipt },
  { to: '/vendedores', label: 'Equipe', Icon: IconUsers },
]

const MORE = [
  { section: 'Comercial' },
  { to: '/cotacoes', label: 'Oportunidades', Icon: IconChartPie },
  { to: '/regioes', label: 'Regiões', Icon: IconMapPin },
  { to: '/produtos', label: 'Produtos', Icon: IconBuildingStore },
  { to: '/clientes-inteligencia', label: 'Inteligência de Clientes', Icon: IconChartBar },
  { to: '/budget', label: 'Previsão de Vendas', Icon: IconChartBar, roles: ['admin','gestor','gestor_comercial'] },
  { to: '/fechamentos', label: 'Apresentações', Icon: IconPresentation, roles: ['admin','gestor','gestor_comercial','gestor_financeiro'] },
  { section: 'Logística' },
  { to: '/rotas-entrega', label: 'Rotas de Entrega', Icon: IconTruckDelivery },
  { section: 'Financeiro' },
  { to: '/financeiro', label: 'Financeiro', Icon: IconReportMoney, roles: ['admin','gestor','gestor_comercial','gestor_financeiro'] },
  { to: '/dre', label: 'DRE', Icon: IconFileInvoice, roles: ['admin','gestor','gestor_comercial','gestor_financeiro'] },
  { to: '/tabela-precos', label: 'Tabela de Preços', Icon: IconCurrencyDollar, roles: ['gestor','gestor_financeiro'] },
  { section: 'Estoque e campo' },
  { to: '/estoque', label: 'Estoque', Icon: IconBox },
  { to: '/visitas', label: 'Visitas', Icon: IconRoute },
  { to: '/checklists', label: 'Diagnósticos', Icon: IconClipboardList },
  { section: 'Sistema' },
  { to: '/config', label: 'Configurações', Icon: IconSettings },
]

export default function MobileNav() {
  const [open, setOpen] = useState(false)
  const { user } = useAuth()
  const location = useLocation()
  const more = MORE.filter(item => !item.roles || item.roles.includes(user?.role)).filter((item, index, list) => !item.section || list.slice(index + 1).some(next => !next.section && !next.roles || !next.section && next.roles?.includes(user?.role)))
  const moreActive = more.some(item => item.to && (location.pathname === item.to || location.pathname.startsWith(`${item.to}/`)))

  return (
    <>
      {open && <button className="mobile-nav-backdrop" aria-label="Fechar menu" onClick={() => setOpen(false)} />}
      <aside className={`mobile-more-sheet${open ? ' open' : ''}`} aria-hidden={!open}>
        <div className="mobile-more-head">
          <div><span>Nutrialle Gestão</span><strong>Mais áreas</strong></div>
          <button type="button" onClick={() => setOpen(false)} aria-label="Fechar"><IconX size={20} /></button>
        </div>
        <nav className="mobile-more-grid">
          {more.map(item => item.section ? (
            <div key={item.section} className="mobile-more-section" style={{ gridColumn: '1 / -1', fontSize: 11, fontWeight: 800, letterSpacing: '0.08em', textTransform: 'uppercase', opacity: 0.58, marginTop: 12 }}>{item.section}</div>
          ) : (
            <NavLink key={item.to} to={item.to} onClick={() => setOpen(false)} className={({isActive}) => `mobile-more-item${isActive ? ' active' : ''}`}>
              <item.Icon size={19} />
              <span>{item.label}</span>
            </NavLink>
          ))}
        </nav>
        <p className="mobile-more-note">Auditoria financeira e importação de documentos ficam disponíveis apenas no desktop.</p>
      </aside>

      <nav className="mobile-bottom-nav" aria-label="Navegação principal">
        {MAIN.map(item => (
          <NavLink key={item.to} to={item.to} end={item.to === '/'} className={({isActive}) => `mobile-bottom-item${isActive ? ' active' : ''}`}>
            <item.Icon size={20} />
            <span>{item.label}</span>
          </NavLink>
        ))}
        <button type="button" aria-expanded={open} className={`mobile-bottom-item${open || moreActive ? ' active' : ''}`} onClick={() => setOpen(value => !value)}>
          <IconMenu2 size={20} />
          <span>Mais</span>
        </button>
      </nav>
    </>
  )
}
