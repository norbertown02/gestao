import { useState, useEffect, useCallback, createContext, useContext } from 'react'
import { supabase } from './supabase'

const AuthContext = createContext(null)

// SSO entre apps Nutrialle (Painel <-> Gestao): cada app pode rodar num
// dominio Vercel diferente (gestao-three-virid.vercel.app fora do proxy),
// entao a sessao do Supabase (localStorage) nao atravessa sozinha. Quando o
// Painel manda o usuario pra ca ele leva a sessao ativa no hash da URL
// (#sso_at=...&sso_rt=...) -- aplicamos ela aqui antes de checar getSession().
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

export function AuthProvider({ children }) {
  const [user,    setUser]    = useState(null)
  const [loading, setLoading] = useState(true)
  const [error,   setError]   = useState(null)
  const [showSplash, setShowSplash] = useState(false)

  useEffect(() => {
    processarHandoffSSO().then(() => {
      supabase.auth.getSession().then(({ data: { session } }) => {
        if (session?.user) setUser({
          id:    session.user.id,
          email: session.user.email,
          name:  session.user.user_metadata?.name || session.user.email.split('@')[0],
          role:  session.user.user_metadata?.role || 'admin',
        })
        setLoading(false)
      })
    })
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_e, session) => {
      setUser(session?.user ? {
        id:    session.user.id,
        email: session.user.email,
        name:  session.user.user_metadata?.name || session.user.email.split('@')[0],
        role:  session.user.user_metadata?.role || 'admin',
      } : null)
    })
    return () => subscription.unsubscribe()
  }, [])

  const login = useCallback(async (email, password) => {
    setError(null)
    setShowSplash(true)

    const { error } = await supabase.auth.signInWithPassword({ email, password })

    if (error) {
      setError('E-mail ou senha incorretos')
      setShowSplash(false)
      return false
    }

    setTimeout(() => {
      setShowSplash(false)
    }, 1200)

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
