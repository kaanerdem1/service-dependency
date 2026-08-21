import { motion, useReducedMotion } from 'motion/react'
import { springSnappy } from './config'

type Props = {
  value: number
  className?: string
}

/** Motion+ AnimateNumber yerine — sayı değişiminde spring tick */
export function AnimatedNumber({ value, className }: Props) {
  const reduced = useReducedMotion()
  if (reduced) {
    return <span className={className}>{value}</span>
  }
  return (
    <motion.span
      key={value}
      className={className}
      initial={{ opacity: 0, y: 8, filter: 'blur(2px)' }}
      animate={{ opacity: 1, y: 0, filter: 'blur(0px)' }}
      transition={springSnappy}
    >
      {value}
    </motion.span>
  )
}

type PairProps = {
  left: number
  right: number
  className?: string
  sep?: string
}

export function AnimatedNumberPair({
  left,
  right,
  className,
  sep = '/',
}: PairProps) {
  return (
    <span className={className}>
      <AnimatedNumber value={left} />
      {sep}
      <AnimatedNumber value={right} />
    </span>
  )
}
