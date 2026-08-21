import { AnimatePresence, motion } from 'motion/react'
import {
  useEffect,
  useId,
  useRef,
  type ReactNode,
} from 'react'
import { popoverSpring } from './config'
import { AutoHeight } from './AutoHeight'

type Props = {
  open: boolean
  onOpenChange: (open: boolean) => void
  trigger: ReactNode
  children: ReactNode
  className?: string
  panelClassName?: string
  placement?: 'top' | 'bottom'
  label?: string
}

/** Animate UI Popover — spring açılış + AutoHeight içerik */
export function MotionPopover({
  open,
  onOpenChange,
  trigger,
  children,
  className = 'motion-popover',
  panelClassName = 'motion-popover-panel',
  placement = 'top',
  label,
}: Props) {
  const wrapRef = useRef<HTMLSpanElement>(null)
  const panelId = useId()

  useEffect(() => {
    if (!open) return
    const onDoc = (e: MouseEvent) => {
      if (!wrapRef.current?.contains(e.target as Node)) onOpenChange(false)
    }
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onOpenChange(false)
    }
    document.addEventListener('mousedown', onDoc)
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('mousedown', onDoc)
      document.removeEventListener('keydown', onKey)
    }
  }, [open, onOpenChange])

  return (
    <span
      ref={wrapRef}
      className={className}
      data-motion="animate-ui-popover"
      data-placement={placement}
    >
      {trigger}
      <AnimatePresence initial={false}>
        {open ? (
          <motion.div
            id={panelId}
            role="dialog"
            aria-label={label}
            className={panelClassName}
            initial={{ opacity: 0, y: placement === 'top' ? 8 : -8, scale: 0.96 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: placement === 'top' ? 6 : -6, scale: 0.98 }}
            transition={popoverSpring}
          >
            <AutoHeight deps={[children]}>{children}</AutoHeight>
          </motion.div>
        ) : null}
      </AnimatePresence>
    </span>
  )
}
