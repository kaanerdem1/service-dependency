import { motion } from 'motion/react'
import { layoutSpring } from './config'

type Props = {
  active: boolean
  className?: string
  layoutId: string
}

/** Morphin navbar — hover arka plan morph (layoutId) */
export function MorphHoverIndicator({ active, className = 'morph-hover-indicator', layoutId }: Props) {
  if (!active) return null
  return (
    <motion.span
      className={className}
      layoutId={layoutId}
      transition={layoutSpring}
      aria-hidden
    />
  )
}
