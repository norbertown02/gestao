import { useState } from 'react'
import { useAuth } from '../lib/useAuth'
import { IconMail, IconLock, IconEye, IconEyeOff } from '@tabler/icons-react'

export default function Login() {
  const { login, error } = useAuth()
  const [email,   setEmail]   = useState('')
  const [senha,   setSenha]   = useState('')
  const [showPw,  setShowPw]  = useState(false)
  const [loading, setLoading] = useState(false)

  async function handleSubmit(e) {
    e.preventDefault()
    setLoading(true)
    await login(email.trim(), senha)
    setLoading(false)
  }

  return (
    <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'var(--bg)', padding: 24 }}>
      <div style={{ width: '100%', maxWidth: 400 }}>
        <div style={{ textAlign: 'center', marginBottom: 36 }}>
          <div style={{ width: 56, height: 56, borderRadius: 14, background: 'var(--orange)', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 14px', fontSize: 24, fontWeight: 700, color: '#fff' }}>N</div>
          <div style={{ fontSize: 22, fontWeight: 700 }}>Nutrialle Gestão</div>
          <div style={{ fontSize: 13, color: 'var(--text-dim)', marginTop: 4 }}>Painel administrativo</div>
        </div>
        <div className="card">
          <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
            <div>
              <label>E-mail</label>
              <div style={{ position: 'relative' }}>
                <IconMail size={15} style={{ position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)', color: 'var(--text-faint)' }} />
                <input type="email" value={email} onChange={e => setEmail(e.target.value)} placeholder="seu@nutrialle.com.br" style={{ paddingLeft: 32 }} required />
              </div>
            </div>
            <div>
              <label>Senha</label>
              <div style={{ position: 'relative' }}>
                <IconLock size={15} style={{ position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)', color: 'var(--text-faint)' }} />
                <input type={showPw ? 'text' : 'password'} value={senha} onChange={e => setSenha(e.target.value)} placeholder="••••••••" style={{ paddingLeft: 32, paddingRight: 36 }} required />
                <button type="button" onClick={() => setShowPw(p => !p)} style={{ position: 'absolute', right: 10, top: '50%', transform: 'translateY(-50%)', background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-faint)' }}>
                  {showPw ? <IconEyeOff size={15} /> : <IconEye size={15} />}
                </button>
              </div>
            </div>
            {error && <div style={{ background: 'var(--red-bg)', color: 'var(--red)', padding: '8px 12px', borderRadius: 8, fontSize: 13 }}>{error}</div>}
            <button type="submit" className="btn btn-primary" disabled={loading} style={{ width: '100%', justifyContent: 'center', padding: '10px' }}>
              {loading ? 'Entrando...' : 'Entrar'}
            </button>
          </form>
        </div>
        <p style={{ textAlign: 'center', fontSize: 12, color: 'var(--text-faint)', marginTop: 20 }}>Acesso restrito à equipe Nutrialle</p>
      </div>
    </div>
  )
}
