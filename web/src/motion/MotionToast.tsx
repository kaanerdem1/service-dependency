import { AnimatePresence, motion } from 'motion/react'
import type { ReactNode } from 'react'
import { springSoft, springSnappy } from './config'

type ToastProps = {
  open: boolean
  className?: string
  role?: 'status' | 'alert'
  children: ReactNode
}

/** Alt sabit bildirim — snapshot kaydı vb. */
export function MotionToast({ open, className = 'snapshot-toast', role = 'status', children }: ToastProps) {
  return (
    <AnimatePresence>
      {open ? (
        <motion.div
          className={`${className} motion-toast-shell`}
          role={role}
          style={{ left: '50%' }}
          initial={{ opacity: 0, y: 28, x: '-50%', scale: 0.94 }}
          animate={{ opacity: 1, y: 0, x: '-50%', scale: 1 }}
          exit={{ opacity: 0, y: 18, x: '-50%', scale: 0.97 }}
          transition={springSoft}
        >
          {children}
        </motion.div>
      ) : null}
    </AnimatePresence>
  )
}

type BannerProps = {
  open: boolean
  className?: string
  children: ReactNode
}

/** Üst API / hata şeridi — yukarıdan spring giriş */
export function MotionBanner({ open, className = 'api-banner', children }: BannerProps) {
  return (
    <AnimatePresence initial={false}>
      {open ? (
        <motion.div
          className={className}
          role="alert"
          aria-live="assertive"
          initial={{ opacity: 0, y: -14 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: -10 }}
          transition={springSnappy}
        >
          {children}
        </motion.div>
      ) : null}
    </AnimatePresence>
  )
}
