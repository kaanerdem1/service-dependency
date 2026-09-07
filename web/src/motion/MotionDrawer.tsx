import { AnimatePresence, motion, useReducedMotion } from 'motion/react'
import { useEffect, type ReactNode } from 'react'
import { createPortal } from 'react-dom'
import { layoutSpring } from './config'

type Props = {
  open: boolean
  title: string
  onClose: () => void
  children: ReactNode
  labelledBy?: string
}

/** Sağdan kayan drawer — katalog / favoriler overlay ile aynı dil. */
export function MotionDrawer({ open, title, onClose, children, labelledBy }: Props) {
  const reduced = useReducedMotion()
  const titleId = labelledBy ?? 'motion-drawer-title'

  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault()
        onClose()
      }
    }
    window.addEventListener('keydown', onKey)
    const prev = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => {
      window.removeEventListener('keydown', onKey)
      document.body.style.overflow = prev
    }
  }, [open, onClose])

  if (typeof document === 'undefined') return null

  return createPortal(
    <AnimatePresence>
      {open ? (
        <div className="motion-drawer-root" data-motion="drawer-overlay">
          <motion.button
            type="button"
            className="motion-drawer-scrim"
            aria-label="Kapat"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: reduced ? 0.12 : 0.2 }}
            onClick={onClose}
          />
          <motion.aside
            className="motion-drawer-panel"
            role="dialog"
            aria-modal="true"
            aria-labelledby={titleId}
            initial={reduced ? { opacity: 0 } : { x: '100%', opacity: 0.7 }}
            animate={reduced ? { opacity: 1 } : { x: 0, opacity: 1 }}
            exit={reduced ? { opacity: 0 } : { x: '72%', opacity: 0 }}
            transition={reduced ? { duration: 0.16 } : layoutSpring}
          >
            <header className="motion-drawer-head">
              <h2 id={titleId} className="motion-drawer-title">
                {title}
              </h2>
              <button
                type="button"
                className="motion-drawer-close"
                onClick={onClose}
                aria-label="Kapat"
              >
                ×
              </button>
            </header>
            <div className="motion-drawer-body">{children}</div>
          </motion.aside>
        </div>
      ) : null}
    </AnimatePresence>,
    document.body,
  )
}
