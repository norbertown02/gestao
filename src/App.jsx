import { BrowserRouter, Routes, Route } from 'react-router-dom'
import { AuthProvider, useAuth } from './lib/useAuth'
import Sidebar from './components/Sidebar'
import Login from './screens/Login'
import Dashboard from './screens/Dashboard'
import Vendas from './screens/Vendas'
import Visitas from './screens/Visitas'
import Checklists from './screens/Checklists'
import Carteira from './screens/Carteira'
import Vendedores from './screens/Vendedores'
import Produtos from './screens/Produtos'
import Regioes from './screens/Regioes'
import Config from './screens/Config'
import Pipeline from './screens/Pipeline'
import RelatorioMensal from './screens/RelatorioMensal'

function AppContent() {
  const { user, loading } = useAuth()
  if (loading) return <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100vh', color: 'var(--text-dim)' }}>Carregando...</div>
  if (!user)   return <Login />
  return (
    <div className="layout">
      <Sidebar />
      <div className="main">
        <Routes>
          <Route path="/"           element={<Dashboard />} />
          <Route path="/vendas"     element={<Vendas />} />
          <Route path="/visitas"    element={<Visitas />} />
          <Route path="/checklists" element={<Checklists />} />
          <Route path="/carteira"   element={<Carteira />} />
          <Route path="/vendedores" element={<Vendedores />} />
          <Route path="/produtos"   element={<Produtos />} />
          <Route path="/regioes"    element={<Regioes />} />
          <Route path="/pipeline" element={<Pipeline />} />
          <Route path="/relatorio" element={<RelatorioMensal />} />
          <Route path="/config"     element={<Config />} />
        </Routes>
      </div>
    </div>
  )
}

export default function App() {
  return (
    <AuthProvider>
      <BrowserRouter>
        <AppContent />
      </BrowserRouter>
    </AuthProvider>
  )
}
