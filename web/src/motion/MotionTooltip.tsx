import { AnimatePresence, motion } from 'motion/react'
import { tooltipSpring } from './config'

type Props = {
  open: boolean
  children: React.ReactNode
  className?: string
  style?: React.CSSProperties
  role?: string
}

export function MotionTooltip({
  open,
  children,
  className,
  style,
  role = 'tooltip',
}: Props) {
  return (
    <AnimatePresence>
      {open ? (
        <motion.div
          className={className}
          style={style}
          role={role}
          data-motion="spring-tooltip"
          initial={{ opacity: 0, y: 6, scale: 0.96 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          exit={{ opacity: 0, y: 3, scale: 0.98 }}
          transition={tooltipSpring}
        >
          {children}
        </motion.div>
      ) : null}
    </AnimatePresence>
  )
}
