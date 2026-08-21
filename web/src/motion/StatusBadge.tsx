import { motion, useReducedMotion } from 'motion/react'
import type { ReactNode } from 'react'
import { springSnappy } from './config'

type Tone = 'new' | 'pending' | 'ok' | 'warn'

type Props = {
  tone?: Tone
  pulse?: boolean
  className?: string
  children: ReactNode
}

/** Morphin Animated Status Badge — inbox / liste durum rozeti */
export function StatusBadge({
  tone = 'new',
  pulse = false,
  className = '',
  children,
}: Props) {
  const reduced = useReducedMotion()
  const cls = `status-badge-morph is-${tone}${pulse ? ' is-pulse' : ''}${className ? ` ${className}` : ''}`

  if (reduced) {
    return <span className={cls}>{children}</span>
  }

  return (
    <motion.span
      className={cls}
      data-motion="morphin-status-badge"
      initial={{ scale: 0.82, opacity: 0 }}
      animate={{
        scale: 1,
        opacity: 1,
        ...(pulse
          ? {
              boxShadow: [
                '0 0 0 0 rgba(47, 93, 74, 0.35)',
                '0 0 0 6px rgba(47, 93, 74, 0)',
              ],
            }
          : {}),
      }}
      transition={
        pulse
          ? { scale: springSnappy, opacity: springSnappy, boxShadow: { duration: 1.4, repeat: Infinity } }
          : springSnappy
      }
    >
      {children}
    </motion.span>
  )
}
