import { motion, useReducedMotion } from 'motion/react'

type Props = {
  active?: boolean
  className?: string
}

/** Animate UI Progress — ince üst yükleme çubuğu */
export function MotionProgress({ active = false, className = 'motion-progress' }: Props) {
  const reduced = useReducedMotion()
  if (!active) return null

  return (
    <div className={className} role="progressbar" aria-busy="true" data-motion="animate-ui-progress">
      {reduced ? (
        <span className="motion-progress-bar is-static" />
      ) : (
        <motion.span
          className="motion-progress-bar"
          animate={{ x: ['-120%', '220%'] }}
          transition={{
            duration: 1.15,
            repeat: Infinity,
            ease: 'easeInOut',
          }}
        />
      )}
    </div>
  )
}
