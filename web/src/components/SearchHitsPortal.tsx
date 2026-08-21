import { AnimatePresence } from 'motion/react'
import { useLayoutEffect, useRef, useState, type ReactNode } from 'react'
import { createPortal } from 'react-dom'

type Props = {
  open: boolean
  anchorRef: React.RefObject<HTMLElement | null>
  children: ReactNode
}

/** Sidebar arama sonuçları — body portal, sidebar overflow'un üstünde */
export function SearchHitsPortal({ open, anchorRef, children }: Props) {
  const [style, setStyle] = useState<React.CSSProperties>({})
  const listRef = useRef<HTMLUListElement>(null)

  useLayoutEffect(() => {
    if (!open || !anchorRef.current) return
    const update = () => {
      const anchor = anchorRef.current
      if (!anchor) return
      const r = anchor.getBoundingClientRect()
      const listH = listRef.current?.offsetHeight ?? 280
      const gap = 6
      const spaceBelow = window.innerHeight - r.bottom - gap
      const spaceAbove = r.top - gap
      const openUp = spaceBelow < Math.min(listH, 320) && spaceAbove > spaceBelow
      const maxH = Math.min(
        360,
        openUp ? Math.max(120, spaceAbove - 8) : Math.max(120, spaceBelow - 8),
      )
      setStyle({
        position: 'fixed',
        left: r.left,
        top: openUp ? undefined : r.bottom + gap,
        bottom: openUp ? window.innerHeight - r.top + gap : undefined,
        width: Math.min(440, r.width),
        maxHeight: maxH,
        zIndex: 200,
      })
    }
    update()
    window.addEventListener('resize', update)
    window.addEventListener('scroll', update, true)
    return () => {
      window.removeEventListener('resize', update)
      window.removeEventListener('scroll', update, true)
    }
  }, [open, anchorRef, children])

  if (typeof document === 'undefined') return null

  return createPortal(
    <AnimatePresence>
      {open ? (
        <ul
          ref={listRef}
          className="search-hits search-hits-portal"
          data-motion="search-list"
          style={style}
        >
          {children}
        </ul>
      ) : null}
    </AnimatePresence>,
    document.body,
  )
}
