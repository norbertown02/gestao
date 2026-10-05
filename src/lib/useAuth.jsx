import { useState, useEffect, useCallback, createContext, useContext } from 'react'
import { supabase } from './supabase'

const AuthContext = createContext(null)

async function processarHandoffSSO() {
  const hash = window.location.hash || ''
  if (hash.indexOf('sso_at=') === -1) return
  const params = new URLSearchParams(hash.replace(/^#/, ''))
  const at = params.get('sso_at')
  const rt = params.get('sso_rt')
  history.replaceState(null, '', window.location.pathname + window.location.search)
  if (!at || !rt) return
  try {
    const { error } = await supabase.auth.setSession({ access_token: at, refresh_token: rt })
    if (error) console.error('Falha ao aplicar sessao recebida do Painel:', error)
  } catch (e) {
    console.error('Falha ao aplicar sessao recebida do Painel:', e)
  }
}

async function montarUsuario(authUser) {
  if (!authUser) return null

  const { data: profile } = await supabase
    .from('profiles')
    .select('id,name,email,role,active')
    .eq('id', authUser.id)
    .maybeSingle()

  return {
    id: authUser.id,
    email: profile?.email || authUser.email,
    name: profile?.name || authUser.user_metadata?.name || authUser.email?.split('@')[0] || 'Usuário',
    role: profile?.role || authUser.user_metadata?.role || 'vendedor',
    active: profile?.active !== false,
    profile: profile || null,
  }
}

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [showSplash, setShowSplash] = useState(false)

  useEffect(() => {
    let active = true

    async function aplicarSessao(session) {
      if (!active) return
      if (!session?.user) {
        setUser(null)
        return
      }
      try {
        const usuario = await montarUsuario(session.user)
        if (active) setUser(usuario?.active ? usuario : null)
      } catch (err) {
        console.error('Falha ao carregar perfil do usuário:', err)
        if (active) setUser(null)
      }
    }

    processarHandoffSSO()
      .then(() => supabase.auth.getSession())
      .then(({ data: { session } }) => aplicarSessao(session))
      .finally(() => { if (active) setLoading(false) })

    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      aplicarSessao(session)
    })

    return () => {
      active = false
      subscription.unsubscribe()
    }
  }, [])

  const login = useCallback(async (email, password) => {
    setError(null)
    setShowSplash(true)

    const { data, error } = await supabase.auth.signInWithPassword({ email, password })

    if (error) {
      setError('E-mail ou senha incorretos')
      setShowSplash(false)
      return false
    }

    const usuario = await montarUsuario(data.user)
    if (!usuario?.active) {
      await supabase.auth.signOut()
      setError('Usuário sem acesso ao sistema')
      setShowSplash(false)
      return false
    }

    setUser(usuario)
    setTimeout(() => setShowSplash(false), 1200)
    return true
  }, [])

  const logout = useCallback(async () => {
    await supabase.auth.signOut()
    setUser(null)
  }, [])

  return (
    <AuthContext.Provider value={{ user, loading, error, login, logout, showSplash }}>
      {children}
    </AuthContext.Provider>
  )
}

export function useAuth() { return useContext(AuthContext) }
