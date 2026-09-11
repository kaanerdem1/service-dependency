import type { ServiceScreenLink } from '../types'

function pageTypeLabel(pageType: string): string {
  if (pageType === 'region') return 'Region'
  if (pageType === 'page') return 'Page'
  return pageType
}

export function ProcessFlowScreens({ screens }: { screens: ServiceScreenLink[] }) {
  if (screens.length === 0) return null

  return (
    <section className="pf-map-screens" aria-label="İlgili ekranlar">
      <h2 className="pf-map-screens-title">İlgili ekranlar</h2>
      <ul className="pf-map-screens-list">
        {screens.map((screen) => (
          <li key={screen.oid} className="pf-map-screens-item">
            <span className="pf-map-screens-name">{screen.name}</span>
            <span className="pf-map-screens-type">{pageTypeLabel(screen.pageType)}</span>
            {screen.descriptionTr ? (
              <span className="pf-map-screens-desc">{screen.descriptionTr}</span>
            ) : null}
          </li>
        ))}
      </ul>
    </section>
  )
}
