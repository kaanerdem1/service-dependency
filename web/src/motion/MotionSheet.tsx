import { AnimatePresence, motion } from 'motion/react'
import type { ReactNode } from 'react'
import { autoHeightSpring } from './config'

type Props = {
  open: boolean
  className?: string
  children: ReactNode
}

/** Animate UI Sheet gövdesi — daralt/aç spring height */
export function MotionSheetBody({ open, className, children }: Props) {
  return (
    <AnimatePresence initial={false}>
      {open ? (
        <motion.div
          className={className}
          data-motion="animate-ui-sheet"
          initial={{ height: 0, opacity: 0, x: 14 }}
          animate={{ height: 'auto', opacity: 1, x: 0 }}
          exit={{ height: 0, opacity: 0, x: 10 }}
          transition={autoHeightSpring}
          style={{ overflow: 'hidden' }}
        >
          {children}
        </motion.div>
      ) : null}
    </AnimatePresence>
  )
}
