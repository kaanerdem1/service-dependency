import { useCallback, useRef, type ReactNode } from 'react'
import { useReducedMotion } from 'motion/react'

type Props = {
  className?: string
  vertical?: boolean
  children: ReactNode
}

const SELECTORS = '.map-dock-btn, .map-dock-hop, .map-dock-cascade, .map-dock-project-trigger'

/** MacOS tarzı mesafe eğrisi — komşu dock ikonları birlikte büyür */
export function DockMagnifyRow({ className, vertical = false, children }: Props) {
  const rowRef = useRef<HTMLDivElement>(null)
  const reduced = useReducedMotion()

  const applyMagnify = useCallback(
    (clientX: number, clientY: number) => {
      const row = rowRef.current
      if (!row || reduced) return
      const wraps = row.querySelectorAll<HTMLElement>('.map-dock-wrap, .motion-popover-dock')
      wraps.forEach((wrap) => {
        const btn = wrap.querySelector<HTMLElement>(SELECTORS)
        if (!btn || (btn instanceof HTMLButtonElement && btn.disabled)) return
        const r = wrap.getBoundingClientRect()
        const center = vertical ? r.top + r.height / 2 : r.left + r.width / 2
        const pointer = vertical ? clientY : clientX
        const influence = vertical ? 64 : 76
        const dist = Math.abs(pointer - center)
        const t = Math.max(0, 1 - dist / influence)
        const eased = t * t * (3 - 2 * t)
        const scale = 1 + eased * 0.32
        if (vertical) {
          const shift = eased * 5
          btn.style.transform = `translateX(${shift}px) scale(${scale})`
          btn.style.transformOrigin = 'center center'
        } else {
          const lift = eased * -6
          btn.style.transform = `translateY(${lift}px) scale(${scale})`
          btn.style.transformOrigin = 'center bottom'
        }
      })
    },
    [reduced, vertical],
  )

  const resetMagnify = useCallback(() => {
    rowRef.current?.querySelectorAll<HTMLElement>(SELECTORS).forEach((btn) => {
      btn.style.transform = ''
      btn.style.transformOrigin = ''
    })
  }, [])

  return (
    <div
      ref={rowRef}
      className={`map-dock-group-row map-dock-magnify-row${className ? ` ${className}` : ''}`}
      data-orient={vertical ? 'vertical' : 'horizontal'}
      onMouseMove={(e) => applyMagnify(e.clientX, e.clientY)}
      onMouseLeave={resetMagnify}
    >
      {children}
    </div>
  )
}
