import { AnimatePresence, motion } from 'motion/react'
import { useLayoutEffect, useRef, useState, type ReactNode } from 'react'
import { createPortal } from 'react-dom'
import { AutoHeight } from '../motion/AutoHeight'
import { popoverSpring } from '../motion/config'

type Props = {
  open: boolean
  anchorRef: React.RefObject<HTMLElement | null>
  children: ReactNode
  className?: string
}

/** Sidebar arama sonuçları — body portal, AutoHeight + spring açılış */
export function SearchHitsPortal({ open, anchorRef, children, className }: Props) {
  const [style, setStyle] = useState<React.CSSProperties>({})
  const [placement, setPlacement] = useState<'top' | 'bottom'>('bottom')
  const shellRef = useRef<HTMLDivElement>(null)

  useLayoutEffect(() => {
    if (!open || !anchorRef.current) return
    const update = () => {
      const anchor = anchorRef.current
      if (!anchor) return
      const r = anchor.getBoundingClientRect()
      const listH = shellRef.current?.offsetHeight ?? 280
      const gap = 6
      const spaceBelow = window.innerHeight - r.bottom - gap
      const spaceAbove = r.top - gap
      const openUp = spaceBelow < Math.min(listH, 320) && spaceAbove > spaceBelow
      setPlacement(openUp ? 'top' : 'bottom')
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
        <motion.div
          ref={shellRef}
          className={['search-hits-shell search-hits-portal', className].filter(Boolean).join(' ')}
          data-motion="search-auto-height"
          data-placement={placement}
          style={style}
          initial={{
            opacity: 0,
            y: placement === 'top' ? 10 : -10,
            scale: 0.96,
          }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          exit={{
            opacity: 0,
            y: placement === 'top' ? 8 : -8,
            scale: 0.98,
          }}
          transition={popoverSpring}
        >
          <AutoHeight deps={[children]} className="search-hits-auto">
            <ul className="search-hits">{children}</ul>
          </AutoHeight>
        </motion.div>
      ) : null}
    </AnimatePresence>,
    document.body,
  )
}
