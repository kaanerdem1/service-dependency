import { motion } from 'motion/react'
import type { ReactNode, MouseEvent } from 'react'
import { useEffect } from 'react'
import { modalSpring } from './config'

type BackdropProps = {
  onClose: () => void
  children: ReactNode
}

export function MotionModalBackdrop({ onClose, children }: BackdropProps) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault()
        onClose()
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  return (
    <motion.div
      className="modal-backdrop"
      role="presentation"
      data-motion="modal-backdrop"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.18 }}
      onClick={onClose}
    >
      {children}
    </motion.div>
  )
}

type PanelProps = {
  className?: string
  children: ReactNode
  id?: string
  labelledBy?: string
  onClick?: (e: MouseEvent<HTMLDivElement>) => void
}

export function MotionModalPanel({
  className,
  children,
  id,
  labelledBy,
  onClick,
}: PanelProps) {
  return (
    <motion.div
      className={className}
      role="dialog"
      id={id}
      aria-labelledby={labelledBy}
      data-motion="modal-panel"
      initial={{ opacity: 0, y: 18, scale: 0.985 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      exit={{ opacity: 0, y: 10, scale: 0.99 }}
      transition={modalSpring}
      onClick={onClick ?? ((e) => e.stopPropagation())}
    >
      {children}
    </motion.div>
  )
}
