import { AnimatePresence, motion } from 'motion/react'
import type { ReactNode } from 'react'
import { listItemTransition } from './config'

type ItemProps = {
  id: string
  index: number
  className?: string
  children: ReactNode
}

export function MotionListItem({ id, index, className, children }: ItemProps) {
  return (
    <motion.li
      key={id}
      className={className}
      data-motion="list-item"
      layout
      initial={{ opacity: 0, x: -10, height: 0 }}
      animate={{ opacity: 1, x: 0, height: 'auto' }}
      exit={{ opacity: 0, x: 8, height: 0 }}
      transition={listItemTransition(index)}
    >
      {children}
    </motion.li>
  )
}

type ListProps = {
  children: ReactNode
  className?: string
}

export function MotionList({ children, className }: ListProps) {
  return (
    <AnimatePresence initial={false} mode="popLayout">
      <ul className={className} data-motion="motion-list">
        {children}
      </ul>
    </AnimatePresence>
  )
}
