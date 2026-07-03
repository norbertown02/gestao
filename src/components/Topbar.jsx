import { IconCalendar } from '@tabler/icons-react'

function capitalizarPrimeiraLetra(texto) {
  if (!texto) return ''
  return texto.charAt(0).toUpperCase() + texto.slice(1)
}

export default function Topbar({ title, subtitle, children }) {
  const hoje = capitalizarPrimeiraLetra(
    new Date().toLocaleDateString('pt-BR', {
      weekday: 'long',
      day: 'numeric',
      month: 'long',
      year: 'numeric',
    })
  )

  return (
    <header className="topbar">
      <div>
        <div className="topbar-title">{title}</div>
        {subtitle && <div className="topbar-subtitle">{subtitle}</div>}
      </div>

      <div className="topbar-actions">
        {children}

        <div className="topbar-date">
          <IconCalendar size={15} />
          <span>{hoje}</span>
        </div>
      </div>
    </header>
  )
}