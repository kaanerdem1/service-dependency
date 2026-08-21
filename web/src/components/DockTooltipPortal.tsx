import { AnimatePresence, motion } from 'motion/react'
import { useLayoutEffect, useState, type RefObject, type ReactNode } from 'react'
import { createPortal } from 'react-dom'
import { tooltipSpring } from '../motion/config'

type Props = {
  open: boolean
  anchorRef: RefObject<HTMLElement | null>
  children: ReactNode
}

const TIP_GAP = 10

/** Dock ipuçları — body portal; hover lift sonrası üst ortada */
export function DockTooltipPortal({ open, anchorRef, children }: Props) {
  const [pos, setPos] = useState<{ left: number; top: number } | null>(null)

  useLayoutEffect(() => {
    if (!open) {
      setPos(null)
      return
    }

    const update = () => {
      const anchor = anchorRef.current
      if (!anchor) return
      const r = anchor.getBoundingClientRect()
      setPos({
        left: r.left + r.width / 2,
        top: r.top - TIP_GAP,
      })
    }

    update()
    let frame = 0
    const loop = () => {
      update()
      frame = requestAnimationFrame(loop)
    }
    frame = requestAnimationFrame(loop)
    window.addEventListener('scroll', update, true)
    window.addEventListener('resize', update)

    return () => {
      cancelAnimationFrame(frame)
      window.removeEventListener('scroll', update, true)
      window.removeEventListener('resize', update)
    }
  }, [open, anchorRef])

  if (typeof document === 'undefined' || !pos) return null

  return createPortal(
    <div
      className="map-dock-tip-portal-anchor"
      style={{
        position: 'fixed',
        left: pos.left,
        top: pos.top,
        transform: 'translate(-50%, -100%)',
        zIndex: 600,
        pointerEvents: 'none',
      }}
    >
      <AnimatePresence>
        {open ? (
          <motion.div
            className="map-dock-tip-portal"
            role="tooltip"
            initial={{ opacity: 0, y: 5, scale: 0.96 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 3, scale: 0.98 }}
            transition={tooltipSpring}
          >
            {children}
          </motion.div>
        ) : null}
      </AnimatePresence>
    </div>,
    document.body,
  )
}
