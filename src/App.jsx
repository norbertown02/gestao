import { BrowserRouter, Routes, Route } from 'react-router-dom'
import { AuthProvider, useAuth } from './lib/useAuth'
import Sidebar from './components/Sidebar'
import SplashScreen from './components/SplashScreen'
import Login from './screens/Login'
import Dashboard from './screens/Dashboard'
import VendasFiltradas from './screens/VendasFiltradas'
import Visitas from './screens/Visitas'
import Checklists from './screens/Checklists'
import Carteira from './screens/Carteira'
import Vendedores from './screens/Vendedores'
import Produtos from './screens/Produtos'
import Regioes from './screens/Regioes'
import Config from './screens/Config'
import Pipeline from './screens/Pipeline'
import RelatorioMensalFiltrado from './screens/RelatorioMensalFiltrado'
import Cotacoes from './screens/Cotacoes'
import DashboardTime from './screens/DashboardTime'
import Metas from './screens/Metas'
import Estoque from './screens/Estoque'
import Fechamentos from './screens/Fechamentos'
import Financeiro from './screens/Financeiro'
import DRE from './screens/DRE'
import ImportarFechamento from './screens/ImportarFechamento'
import AuditoriaFinanceira from './screens/AuditoriaFinanceira'

function AppContent() {
  const { user, loading, showSplash } = useAuth()
  if (loading || showSplash) return <SplashScreen />
  if (!user)   return <Login />
  return (
    <div className="layout">
      <Sidebar />
      <div className="main">
        <Routes>
          <Route path="/"           element={<Dashboard />} />
          <Route path="/vendas"     element={<VendasFiltradas />} />
          <Route path="/visitas"    element={<Visitas />} />
          <Route path="/checklists" element={<Checklists />} />
          <Route path="/carteira"   element={<Carteira />} />
          <Route path="/vendedores" element={<Vendedores />} />
          <Route path="/produtos"   element={<Produtos />} />
          <Route path="/estoque"    element={<Estoque />} />
          <Route path="/financeiro" element={<Financeiro />} />
          <Route path="/dre"        element={<DRE />} />
          <Route path="/financeiro/importar" element={<ImportarFechamento />} />
          <Route path="/financeiro/auditoria" element={<AuditoriaFinanceira />} />
          <Route path="/regioes"    element={<Regioes />} />
          <Route path="/pipeline" element={<Pipeline />} />
          <Route path="/time" element={<DashboardTime />} />
          <Route path="/metas" element={<Metas />} />
          <Route path="/relatorio" element={<RelatorioMensalFiltrado />} />
          <Route path="/fechamentos" element={<Fechamentos />} />
          <Route path="/cotacoes" element={<Cotacoes />} />
          <Route path="/config"     element={<Config />} />
        </Routes>
      </div>
    </div>
  )
}

const basename = window.location.pathname.indexOf('/gestao') === 0 ? '/gestao' : '/'

export default function App() {
  return (
    <AuthProvider>
      <BrowserRouter basename={basename}>
        <AppContent />
      </BrowserRouter>
    </AuthProvider>
  )
}
