/**
 * Ana uygulama kabuğu (ince giriş).
 *
 * State ve wiring: `./app/useServiceCatalogShell.ts`
 *
 * Seçim modeli:
 * - pivotId          → odak servis (geri/ileri geçmişi ile)
 * - selectedMethodId → odak metod (method haritası)
 * - tab              → 'map' | 'affected' | 'overview' | 'screens' | 'processes'
 */
import { LayoutGroup } from 'motion/react'
import { MotionBanner } from './motion/MotionToast'
import { DwhPage } from './dwh/DwhPage'
import { AppMasthead } from './components/shell/AppMasthead'
import { AppShellOverlays } from './components/shell/AppShellOverlays'
import { ServicesWorkspace } from './components/shell/ServicesWorkspace'
import { useServiceCatalogShell } from './app/useServiceCatalogShell'
import './styles/App.css'
import './styles/responsive.css'

export default function App() {
  const {
    apiError,
    liveStatus,
    appTheme,
    setAppTheme,
    appFrameClassName,
    appFrameStyle,
    surface,
    setSurface,
    trail,
    session,
    inboxPending,
    openInbox,
    workspaceRef,
    workspaceSidebar,
    workspaceStage,
    shellOverlays,
  } = useServiceCatalogShell()

  return (
    <LayoutGroup id="app-shell">
      <div className="app" data-theme={appTheme}>
        <MotionBanner open={!!apiError}>
          <div className="api-banner-inner">
            {apiError}
            <span className="api-banner-hint">
              {' '}
              Sunucunun çalıştığından emin olun (<code>npm run dev</code>) ve sayfayı yenileyin.
            </span>
          </div>
        </MotionBanner>
        <div
          role="status"
          aria-live="polite"
          aria-atomic="true"
          className="app-status-live sr-only"
        >
          {liveStatus}
        </div>

        <div className={appFrameClassName} style={appFrameStyle}>
          <AppMasthead
            surface={surface}
            onSurfaceChange={setSurface}
            appTheme={appTheme}
            onThemeChange={setAppTheme}
            trail={trail}
            session={session}
            inboxPending={inboxPending}
            onOpenInbox={openInbox}
          />

          <div className="app-frame-body">
            {surface === 'dwh' ? (
              <div className="workspace-column dwh-workspace-column">
                <div className="workspace">
                  <DwhPage surface={surface} onSurfaceChange={setSurface} />
                </div>
              </div>
            ) : (
              <ServicesWorkspace
                workspaceRef={workspaceRef}
                sidebar={workspaceSidebar}
                stage={workspaceStage}
              />
            )}
          </div>
        </div>

        <AppShellOverlays {...shellOverlays} />
      </div>
    </LayoutGroup>
  )
}
