function WelcomeIcon() {
  return (
    <span className="welcome-icon" aria-hidden>
      <svg viewBox="0 0 48 48" width="28" height="28" fill="none">
        <circle cx="24" cy="24" r="7" fill="currentColor" opacity="0.95" />
        <circle cx="10" cy="16" r="4.5" fill="currentColor" opacity="0.55" />
        <circle cx="38" cy="16" r="4.5" fill="currentColor" opacity="0.55" />
        <circle cx="10" cy="34" r="4.5" fill="currentColor" opacity="0.55" />
        <circle cx="38" cy="34" r="4.5" fill="currentColor" opacity="0.55" />
        <path
          d="M14 18l7 4M34 18l-7 4M14 30l7-4M34 30l-7-4"
          stroke="currentColor"
          strokeWidth="1.8"
          strokeLinecap="round"
          opacity="0.7"
        />
      </svg>
    </span>
  )
}

function StepIcon({ kind }: { kind: 'search' | 'map' | 'links' }) {
  if (kind === 'search') {
    return (
      <svg viewBox="0 0 24 24" width="20" height="20" aria-hidden>
        <circle cx="10.5" cy="10.5" r="6" fill="none" stroke="currentColor" strokeWidth="1.8" />
        <path d="M15 15l5 5" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
      </svg>
    )
  }
  if (kind === 'map') {
    return (
      <svg viewBox="0 0 24 24" width="20" height="20" aria-hidden>
        <path
          d="M4 7l6-2 4 2 6-2v12l-6 2-4-2-6 2V7z"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.6"
          strokeLinejoin="round"
        />
        <path d="M10 5v12M14 7v12" stroke="currentColor" strokeWidth="1.4" />
      </svg>
    )
  }
  return (
    <svg viewBox="0 0 24 24" width="20" height="20" aria-hidden>
      <circle cx="6" cy="12" r="2.2" fill="currentColor" />
      <circle cx="18" cy="12" r="2.2" fill="currentColor" />
      <path
        d="M8.4 12h7.2"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.6"
        strokeLinecap="round"
      />
    </svg>
  )
}

export function WelcomeScreen() {
  return (
    <div className="welcome-screen">
      <WelcomeIcon />
      <h1 className="welcome-title">Bir servis seçerek başlayın</h1>
      <p className="welcome-lede">
        Soldaki arama kısmına istediğiniz servisin adını yazın veya altındaki
        hiyerarşi ağacından bir servis seçin; bağımlılık haritasını ve etki
        zincirini görün.
      </p>
      <div className="welcome-steps">
        <article className="welcome-step">
          <span className="welcome-step-icon">
            <StepIcon kind="search" />
          </span>
          <strong>Servis seç</strong>
          <span className="welcome-step-sub">Ara veya ağaçtan tıkla</span>
        </article>
        <article className="welcome-step">
          <span className="welcome-step-icon">
            <StepIcon kind="map" />
          </span>
          <strong>Haritaya bak</strong>
          <span className="welcome-step-sub">Etki zincirini incele</span>
        </article>
        <article className="welcome-step">
          <span className="welcome-step-icon">
            <StepIcon kind="links" />
          </span>
          <strong>İlişkileri gör</strong>
          <span className="welcome-step-sub">Komşu servislere bak</span>
        </article>
      </div>
    </div>
  )
}
