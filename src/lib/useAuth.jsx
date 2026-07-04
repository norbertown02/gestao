import { useState, useEffect, useCallback, createContext, useContext } from 'react'
import { supabase } from './supabase'

const AuthContext = createContext(null)

export function AuthProvider({ children }) {
  const [user,    setUser]    = useState(null)
  const [loading, setLoading] = useState(true)
  const [error,   setError]   = useState(null)
  const [showSplash, setShowSplash] = useState(false)

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      if (session?.user) setUser({
        id:    session.user.id,
        email: session.user.email,
        name:  session.user.user_metadata?.name || session.user.email.split('@')[0],
        role:  session.user.user_metadata?.role || 'admin',
      })
      setLoading(false)
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
