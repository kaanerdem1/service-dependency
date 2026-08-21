import { AnimatePresence, motion } from 'motion/react'
import type { ReactNode } from 'react'
import { accordionSpring } from './config'

type Props = {
  open: boolean
  children: ReactNode
}

/** Ağaç alt dalları — spring height accordion */
export function TreeAccordion({ open, children }: Props) {
  return (
    <AnimatePresence initial={false}>
      {open ? (
        <motion.div
          className="tree-accordion-body"
          data-motion="tree-accordion"
          initial={{ height: 0, opacity: 0 }}
          animate={{ height: 'auto', opacity: 1 }}
          exit={{ height: 0, opacity: 0 }}
          transition={accordionSpring}
          style={{ overflow: 'hidden' }}
        >
          {children}
        </motion.div>
      ) : null}
    </AnimatePresence>
  )
}
