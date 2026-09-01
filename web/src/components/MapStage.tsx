/**
 * Harita çerçevesi.
 * Yeşil macOS tarzı büyüt: aynı sayfada tam ekran overlay (yeni sekme değil).
 * Escape veya yeşil düğme ile kapanır. Sayfa karartılmaz — harita kaplar.
 *
 * Stage her zaman document.body’de portal’dadır (overflow:hidden ebeveyn
 * position:fixed’i kırpmasın). Slot yalnızca yer tutar; expanded değişince
 * React ağacı aynı kalır — layout / katman state’i sıfırlanmaz.
 */
import { useEffect, useId, useLayoutEffect, useRef, useState, type CSSProperties, type ReactNode } from 'react'
import { createPortal } from 'react-dom'

type Props = {
  title: string
  expanded: boolean
  onExpandedChange: (expanded: boolean) => void
  /** Harita sekmesi dışındayken gizle — portal body’de kalır, sekmeleri örtmesin */
  active?: boolean
  children: ReactNode
}

export function MapStage({
  title,
  expanded,
  onExpandedChange,
  active = true,
  children,
}: Props) {
  const titleId = useId()
  const slotRef = useRef<HTMLDivElement>(null)
  const [frame, setFrame] = useState({
    top: 0,
    left: 0,
    width: 0,
    height: 0,
    stageTopH: 96,
  })

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

  useLayoutEffect(() => {
    const slot = slotRef.current
    if (!slot) return
    let raf1 = 0
    let raf2 = 0
    let settleTimer = 0
    const measure = () => {
      const r = slot.getBoundingClientRect()
      const stageTop = document.querySelector('.stage-top')
      const lift = stageTop
        ? Math.max(0, Math.round(r.top - stageTop.getBoundingClientRect().top))
        : 96
      setFrame({
        top: r.top,
        left: r.left,
        width: r.width,
        height: r.height,
        stageTopH: lift || 96,
      })
    }
    const measureAfterLayout = () => {
      cancelAnimationFrame(raf1)
      cancelAnimationFrame(raf2)
      window.clearTimeout(settleTimer)
      raf1 = requestAnimationFrame(() => {
        measure()
        raf2 = requestAnimationFrame(measure)
      })
      settleTimer = window.setTimeout(measure, 180)
    }
    measure()
    measureAfterLayout()
    const ro = new ResizeObserver(measure)
    ro.observe(slot)
    window.addEventListener('resize', measureAfterLayout)
    window.addEventListener('scroll', measureAfterLayout, true)
    return () => {
      cancelAnimationFrame(raf1)
      cancelAnimationFrame(raf2)
      window.clearTimeout(settleTimer)
      ro.disconnect()
      window.removeEventListener('resize', measureAfterLayout)
      window.removeEventListener('scroll', measureAfterLayout, true)
    }
  }, [active, expanded])

  const dockedStyle: CSSProperties | undefined = !active
    ? { display: 'none' }
    : expanded
      ? undefined
      : {
          position: 'fixed',
          top: frame.top,
          left: frame.left,
          width: frame.width,
          height: frame.height,
          zIndex: 5,
          overflow: 'visible',
          ['--sd-stage-top-h' as string]: `${frame.stageTopH}px`,
        }

  const stage = (
    <div
      className={`map-stage ${expanded ? 'is-expanded' : 'is-docked'}${active ? '' : ' is-inactive'}`}
      style={dockedStyle}
      hidden={!active}
      role={expanded && active ? 'dialog' : undefined}
      aria-modal={expanded && active ? true : undefined}
      aria-labelledby={expanded && active ? titleId : undefined}
    >
      <div className={`map-stage-chrome${expanded ? '' : ' is-compact'}`}>
        <div className="tl-zoom-wrap">
          <button
            type="button"
            className="tl-zoom"
            title={expanded ? 'Küçült (Esc)' : 'Haritayı tam ekran aç'}
            aria-label={expanded ? 'Haritayı küçült' : 'Haritayı tam ekran aç'}
            onClick={() => onExpandedChange(!expanded)}
          >
            <span className="tl-zoom-glyph" aria-hidden>
              {expanded ? (
                <svg viewBox="0 0 12 12" width="10" height="10">
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
                <svg viewBox="0 0 12 12" width="10" height="10">
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
          {!expanded && (
            <span className="tl-zoom-label">Tam ekran</span>
          )}
        </div>
        {expanded && (
          <span id={titleId} className="map-stage-title">
            {title}
          </span>
        )}
      </div>
      <div className="map-stage-body">{children}</div>
    </div>
  )

  return (
    <>
      <div ref={slotRef} className="map-stage-slot" aria-hidden={expanded || undefined} />
      {createPortal(stage, document.body)}
    </>
  )
}
