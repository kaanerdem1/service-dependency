import { motion, useReducedMotion } from 'motion/react'
import {
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type ReactNode,
} from 'react'
import { accordionSpring } from './config'

type Props = {
  open: boolean
  children: ReactNode
  /** Virtual scroll satır yüksekliği güncellensin (metod listesi açılınca) */
  onHeightSettled?: () => void
}

/**
 * Ağaç alt dalları — ölçülen px yüksekliği ile accordion.
 * height: 'auto' → 0 exit takılmasını önler; kapanınca unmount eder.
 */
export function TreeAccordion({ open, children, onHeightSettled }: Props) {
  const reduced = useReducedMotion()
  const innerRef = useRef<HTMLDivElement>(null)
  const [height, setHeight] = useState(0)
  const [mounted, setMounted] = useState(open)

  useEffect(() => {
    if (open) setMounted(true)
  }, [open])

  useLayoutEffect(() => {
    if (!mounted) return
    const el = innerRef.current
    if (!el) return

    if (!open) {
      // Kapanırken son yüksekliği dondur — ResizeObserver mid-exit güncellemesin
      setHeight(el.scrollHeight)
      return
    }

    const measure = () => setHeight(el.scrollHeight)
    measure()
    const ro = new ResizeObserver(measure)
    ro.observe(el)
    return () => ro.disconnect()
  }, [children, open, mounted])

  if (reduced) {
    return open ? (
      <div className="tree-accordion-body" data-motion="tree-accordion">
        {children}
      </div>
    ) : null
  }

  if (!mounted) return null

  return (
    <motion.div
      className="tree-accordion-body"
      data-motion="tree-accordion"
      initial={false}
      animate={{
        height: open ? height : 0,
        opacity: open ? 1 : 0,
      }}
      transition={
        open
          ? accordionSpring
          : { type: 'tween', duration: 0.2, ease: [0.4, 0, 0.2, 1] }
      }
      style={{ overflow: 'hidden' }}
      onAnimationComplete={() => {
        if (!open) {
          setMounted(false)
          setHeight(0)
          return
        }
        onHeightSettled?.()
      }}
    >
      <div ref={innerRef} className="tree-accordion-inner">
        {children}
      </div>
    </motion.div>
  )
}
