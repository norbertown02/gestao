import { useState } from 'react'
import { NavLink } from 'react-router-dom'
import {
  IconLayoutDashboard,
  IconReceipt,
  IconTarget,
  IconChartBar,
  IconMenu2,
  IconX,
  IconMapPin,
  IconBuildingStore,
  IconBox,
  IconFileText,
  IconReportMoney,
  IconFileInvoice,
  IconChartPie,
  IconUsers,
  IconRoute,
  IconClipboardList,
  IconSettings,
} from '@tabler/icons-react'
import { useAuth } from '../lib/useAuth'

const MAIN = [
  { to: '/', label: 'Dashboard', Icon: IconLayoutDashboard },
  { to: '/vendas', label: 'Comercial', Icon: IconReceipt },
  { to: '/metas', label: 'Metas', Icon: IconTarget },
  { to: '/relatorio', label: 'Análises', Icon: IconChartBar },
]

const MORE = [
  { to: '/cotacoes', label: 'Oportunidades', Icon: IconChartPie },
  { to: '/vendedores', label: 'Equipe Comercial', Icon: IconUsers },
  { to: '/regioes', label: 'Regiões', Icon: IconMapPin },
  { to: '/produtos', label: 'Produtos', Icon: IconBuildingStore },
  { to: '/estoque', label: 'Estoque', Icon: IconBox },
  { to: '/relatorio', label: 'Relatório Executivo', Icon: IconFileText },
  { to: '/financeiro', label: 'Financeiro', Icon: IconReportMoney, roles: ['admin','gestor','gestor_comercial'] },
  { to: '/dre', label: 'DRE', Icon: IconFileInvoice, roles: ['admin','gestor','gestor_comercial'] },
  { to: '/carteira', label: 'Carteira de Clientes', Icon: IconChartBar },
  { to: '/visitas', label: 'Visitas', Icon: IconRoute },
  { to: '/checklists', label: 'Diagnósticos', Icon: IconClipboardList },
  { to: '/config', label: 'Configurações', Icon: IconSettings },
]

export default function MobileNav() {
  const [open, setOpen] = useState(false)
  const { user } = useAuth()
  const more = MORE.filter(item => !item.roles || item.roles.includes(user?.role))

  return (
    <>
      {open && <button className="mobile-nav-backdrop" aria-label="Fechar menu" onClick={() => setOpen(false)} />}
      <aside className={`mobile-more-sheet${open ? ' open' : ''}`} aria-hidden={!open}>
        <div className="mobile-more-head">
          <div><span>Nutrialle Gestão</span><strong>Mais áreas</strong></div>
          <button type="button" onClick={() => setOpen(false)} aria-label="Fechar"><IconX size={20} /></button>
        </div>
        <nav className="mobile-more-grid">
          {more.map(item => (
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
        <button type="button" className={`mobile-bottom-item${open ? ' active' : ''}`} onClick={() => setOpen(value => !value)}>
          <IconMenu2 size={20} />
          <span>Mais</span>
        </button>
      </nav>
    </>
  )
}
