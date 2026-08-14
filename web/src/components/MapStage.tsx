/**
 * Harita çerçevesi.
 * Yeşil macOS tarzı büyüt: aynı sayfada tam ekran overlay (yeni sekme değil).
 * Escape veya yeşil düğme ile kapanır. Sayfa karartılmaz — harita kaplar.
 */
import { useEffect, useId, type ReactNode } from 'react'
import { createPortal } from 'react-dom'

type Props = {
  title: string
  expanded: boolean
  onExpandedChange: (expanded: boolean) => void
  children: ReactNode
}

export function MapStage({
  title,
  expanded,
  onExpandedChange,
  children,
}: Props) {
  const titleId = useId()

  useEffect(() => {
    if (!expanded) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onExpandedChange(false)
    }
    window.addEventListener('keydown', onKey)
    const prev = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => {
      window.removeEventListener('keydown', onKey)
      document.body.style.overflow = prev
    }
  }, [expanded, onExpandedChange])

  const stage = (
    <div
      className={`map-stage ${expanded ? 'is-expanded' : ''}`}
      role={expanded ? 'dialog' : undefined}
      aria-modal={expanded || undefined}
      aria-labelledby={expanded ? titleId : undefined}
    >
      <div className="map-stage-chrome">
        <button
          type="button"
          className="tl-zoom"
          title={expanded ? 'Küçült (Esc)' : 'Büyüt'}
          aria-label={expanded ? 'Haritayı küçült' : 'Haritayı büyüt'}
          onClick={() => onExpandedChange(!expanded)}
        >
          <span className="tl-zoom-glyph" aria-hidden>
            {expanded ? (
              <svg viewBox="0 0 12 12" width="8" height="8">
                <path
                  d="M4.5 1.5H1.5v3M7.5 1.5h3v3M1.5 7.5v3h3M10.5 7.5v3h-3"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="1.4"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
                <path
                  d="M1.5 1.5l3 3M10.5 1.5l-3 3M1.5 10.5l3-3M10.5 10.5l-3-3"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="1.4"
                  strokeLinecap="round"
                />
              </svg>
            ) : (
              <svg viewBox="0 0 12 12" width="8" height="8">
                <path
                  d="M1.5 4.5V1.5h3M10.5 4.5V1.5h-3M1.5 7.5v3h3M10.5 7.5v3h-3"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="1.4"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
                <path
                  d="M4.5 1.5L1.5 4.5M7.5 1.5l3 3M4.5 10.5L1.5 7.5M7.5 10.5l3-3"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="1.4"
                  strokeLinecap="round"
                />
              </svg>
            )}
          </span>
        </button>
        <span id={titleId} className="map-stage-title">
          {title}
        </span>
      </div>
      <div className="map-stage-body">{children}</div>
    </div>
  )

  return (
    <>
      {expanded && <div className="map-stage-slot" aria-hidden />}
      {expanded ? createPortal(stage, document.body) : stage}
    </>
  )
}
