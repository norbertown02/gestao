import { useState } from 'react'
import { useAuth } from '../lib/useAuth'
import { IconMail, IconLock, IconEye, IconEyeOff } from '@tabler/icons-react'
import logo from '../assets/logo-nutrialle.jpg'

export default function Login() {
  const { login, error } = useAuth()

  const [email, setEmail] = useState('')
  const [senha, setSenha] = useState('')
  const [showPw, setShowPw] = useState(false)
  const [loading, setLoading] = useState(false)

  async function handleSubmit(e) {
    e.preventDefault()

    setLoading(true)
    await login(email.trim(), senha)
    setLoading(false)
  }

  return (
    <main className="login-page">
      <section className="login-shell">
        <div className="login-brand">
          <div>
            <img src={logo} alt="Nutrialle" className="login-logo" />

            <h1>Gestão comercial com visão de campo.</h1>

            <p>
              Acompanhe vendas, visitas, cotações, carteira e desempenho do
              time em um painel executivo conectado à operação da Nutrialle.
            </p>
          </div>

          <div className="login-brand-footer">
            <div className="login-mini">
              <strong>360°</strong>
              <span>Gestão</span>
            </div>

            <div className="login-mini">
              <strong>BI</strong>
              <span>Comercial</span>
            </div>

            <div className="login-mini">
              <strong>Campo</strong>
              <span>Performance</span>
            </div>
          </div>
        </div>

        <div className="login-form-side">
          <div className="login-form-head">
            <h2>Acessar Gestão</h2>
            <p>
              Entre com seu e-mail corporativo para acessar o painel
              administrativo da Nutrialle.
            </p>
          </div>

          <form onSubmit={handleSubmit} className="login-form">
            <div>
              <label>E-mail</label>

              <div className="login-input-wrap">
                <IconMail size={16} />
                <input
                  type="email"
                  value={email}
                  onChange={e => setEmail(e.target.value)}
                  placeholder="seu@nutrialle.com.br"
                  autoComplete="email"
                  required
                />
              </div>
            </div>

            <div>
              <label>Senha</label>

              <div className="login-input-wrap">
                <IconLock size={16} />

                <input
                  type={showPw ? 'text' : 'password'}
                  value={senha}
                  onChange={e => setSenha(e.target.value)}
                  placeholder="Digite sua senha"
                  autoComplete="current-password"
                  required
                  style={{ paddingRight: 44 }}
                />

                <button
                  type="button"
                  className="login-password-btn"
                  onClick={() => setShowPw(v => !v)}
                  aria-label={showPw ? 'Ocultar senha' : 'Mostrar senha'}
                >
                  {showPw ? <IconEyeOff size={16} /> : <IconEye size={16} />}
                </button>
              </div>
            </div>

            {error && <div className="login-error">{error}</div>}

            <button
              type="submit"
              className="btn btn-primary login-submit"
              disabled={loading}
            >
              {loading ? 'Entrando...' : 'Entrar no painel'}
            </button>
          </form>

          <div className="login-note">
            Ambiente interno Nutrialle. O acesso é restrito aos usuários
            autorizados.
          </div>
        </div>
      </section>
    </main>
  )
}