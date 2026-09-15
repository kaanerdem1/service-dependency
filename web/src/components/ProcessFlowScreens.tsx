import { useEffect, useRef } from 'react'
import type { ServiceScreenLink } from '../types'

function pageTypeLabel(pageType: string): string {
  if (pageType === 'region') return 'Region'
  if (pageType === 'page') return 'Page'
  return pageType
}

export function ProcessFlowScreens({
  screens,
  highlightOid,
}: {
  screens: ServiceScreenLink[]
  highlightOid?: string
}) {
  const listRef = useRef<HTMLUListElement>(null)

  useEffect(() => {
    if (!highlightOid || !listRef.current) return
    const el = listRef.current.querySelector(`[data-screen-oid="${highlightOid}"]`)
    if (el instanceof HTMLElement) {
      el.scrollIntoView({ block: 'nearest', behavior: 'smooth' })
    }
  }, [highlightOid])

  if (screens.length === 0) return null

  return (
    <section className="pf-map-screens" aria-label="İlgili ekranlar">
      <h2 className="pf-map-screens-title">İlgili ekranlar</h2>
      <ul ref={listRef} className="pf-map-screens-list">
        {screens.map((screen) => (
          <li
            key={screen.oid}
            data-screen-oid={screen.oid}
            className={`pf-map-screens-item${highlightOid === screen.oid ? ' is-highlighted' : ''}`}
          >
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
