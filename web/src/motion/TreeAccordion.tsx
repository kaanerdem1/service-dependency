import { AnimatePresence, motion } from 'motion/react'
import type { ReactNode } from 'react'
import { accordionSpring } from './config'

type Props = {
  open: boolean
  children: ReactNode
  /** Virtual scroll satır yüksekliği güncellensin (metod listesi açılınca) */
  onHeightSettled?: () => void
}

/** Ağaç alt dalları — spring height accordion */
export function TreeAccordion({ open, children, onHeightSettled }: Props) {
  return (
    <AnimatePresence initial={false}>
      {open ? (
        <motion.div
          className="tree-accordion-body"
          data-motion="tree-accordion"
          initial={{ height: 0 }}
          animate={{ height: 'auto' }}
          exit={{ height: 0 }}
          transition={accordionSpring}
          style={{ overflow: 'hidden' }}
          onAnimationComplete={onHeightSettled}
        >
          {children}
        </motion.div>
      ) : null}
    </AnimatePresence>
  )
}
