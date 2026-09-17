/**
 * Üst masthead — yüzey seçici, marka, tema, gelen kutusu.
 */
import { SurfaceSwitch, type AppSurface } from './SurfaceSwitch'
import { ThemeSwitch } from './ThemeSwitch'
import { themeLabel, type AppTheme } from '../../theme'
import type { TrailAction, TrailEntry } from '../../types'
import { InboxIcon } from './sidebarIcons'

type TrailRecorder = {
  record: (action: TrailAction, target?: TrailEntry['target'], detail?: string) => void
}

type Props = {
  surface: AppSurface
  onSurfaceChange: (surface: AppSurface) => void
  appTheme: AppTheme
  onThemeChange: (theme: AppTheme) => void
  trail: TrailRecorder
  session?: { id: string }
  inboxPending?: number
  onOpenInbox: () => void
}

export function AppMasthead({
  surface,
  onSurfaceChange,
  appTheme,
  onThemeChange,
  trail,
  session,
  inboxPending,
  onOpenInbox,
}: Props) {
  return (
    <header className="app-masthead">
      <div className="app-masthead-left">
        <SurfaceSwitch surface={surface} onSurfaceChange={onSurfaceChange} />
      </div>
      <div className="app-masthead-brand-wrap">
        <div className="app-brand">
          <img className="brand-mark brand-logo" src="/dwh-logo.png" alt="" aria-hidden />
          <div className="app-brand-copy">
            <strong>{surface === 'dwh' ? 'DWH Katalog' : 'Servis Kataloğu'}</strong>
            <span className="brand-tagline">
              {surface === 'dwh'
                ? 'Tablo, kolon ve rapor lineage kataloğu'
                : 'Servis bağımlılıkları ve değişiklik etkisi'}
            </span>
          </div>
        </div>
      </div>
      <div className="app-masthead-actions">
        <ThemeSwitch
          theme={appTheme}
          onChange={(next) => {
            trail.record('theme_toggle', undefined, `${themeLabel(appTheme)} → ${themeLabel(next)}`)
            onThemeChange(next)
          }}
        />
        {surface === 'services' && session ? (
          <button
            type="button"
            className="masthead-icon-btn"
            aria-label={
              inboxPending && inboxPending > 0
                ? `Gelen kutusu, ${inboxPending} okunmamış`
                : 'Gelen kutusu'
            }
            title="Gelen kutusu"
            onClick={onOpenInbox}
          >
            <InboxIcon />
            {inboxPending && inboxPending > 0 ? (
              <span className="masthead-icon-badge">{inboxPending}</span>
            ) : null}
          </button>
        ) : null}
      </div>
    </header>
  )
}
