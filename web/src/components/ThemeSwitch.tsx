import type { AppTheme } from '../theme'
import { MorphHoverButton } from '../motion/MorphHoverButton'

type Props = {
  theme: AppTheme
  onChange: (theme: AppTheme) => void
}

function MoonIcon() {
  return (
    <svg viewBox="0 0 24 24" width="24" height="24" aria-hidden>
      <path
        fill="#FFFFFF"
        d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"
      />
    </svg>
  )
}

function SunIcon() {
  return (
    <svg viewBox="0 0 24 24" width="24" height="24" aria-hidden>
      <circle cx="12" cy="12" r="5.2" fill="#FBBF24" />
      <path
        d="M12 1.8v2.8M12 19.4v2.8M3.8 3.8l2 2M18.2 18.2l2 2M1.8 12h2.8M19.4 12h2.8M3.8 20.2l2-2M18.2 5.8l2-2"
        stroke="#F97316"
        strokeWidth="2.4"
        strokeLinecap="round"
        fill="none"
      />
    </svg>
  )
}

/** iOS tarzı toggle + yanında aktif modu gösteren ikon */
export function ThemeSwitch({ theme, onChange }: Props) {
  const isLight = theme === 'white'
  const label = isLight ? 'Açık Tema' : 'Kapalı Tema'
  const switchLabel = isLight ? 'Kapalı Temaya geç' : 'Açık Temaya geç'

  return (
    <div
      className={`theme-switch-wrap${isLight ? ' is-light' : ''}`}
      title={label}
    >
      <span className="theme-switch-mark" aria-hidden title={label}>
        {isLight ? <SunIcon /> : <MoonIcon />}
      </span>
      <MorphHoverButton
        className={`theme-switch${isLight ? ' is-light' : ''}`}
        layoutId="theme-switch-hover"
        morphClassName="theme-switch-hover-morph"
        role="switch"
        aria-checked={isLight}
        aria-label={`${label}. ${switchLabel}`}
        title={label}
        onClick={() => onChange(isLight ? 'mixed' : 'white')}
      >
        <span className="theme-switch-track" aria-hidden>
          <span className="theme-switch-thumb" />
        </span>
      </MorphHoverButton>
    </div>
  )
}
