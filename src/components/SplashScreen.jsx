import logoNutrialle from '../assets/logo-nutrialle.png'

export default function SplashScreen() {
  return (
    <div className="nutrialle-loading">
      <div className="nutrialle-loading-card">
        <img
          src={logoNutrialle}
          alt="Nutrialle"
          className="official-logo loading-official-logo"
        />

        <div className="loading-line">
          <span />
        </div>
      </div>
    </div>
  )
}
