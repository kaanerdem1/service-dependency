import { motion, useReducedMotion } from 'motion/react'
import {
  useEffect,
  useRef,
  useState,
  type DependencyList,
  type ReactNode,
} from 'react'
import { autoHeightSpring } from './config'

type Props = {
  open?: boolean
  deps?: DependencyList
  className?: string
  children: ReactNode
}

/** Animate UI AutoHeight — içerik değişince yükseklik spring */
export function AutoHeight({
  open = true,
  deps = [],
  className,
  children,
}: Props) {
  const reduced = useReducedMotion()
  const innerRef = useRef<HTMLDivElement>(null)
  const [height, setHeight] = useState<number | 'auto'>(open ? 'auto' : 0)

  useEffect(() => {
    if (!open) {
      setHeight(0)
      return
    }
    const el = innerRef.current
    if (!el) return

    const measure = () => setHeight(el.scrollHeight)

    measure()
    const ro = new ResizeObserver(measure)
    ro.observe(el)
    return () => ro.disconnect()
  }, [open, ...deps])

  if (reduced) {
    return open ? <div className={className}>{children}</div> : null
  }

  return (
    <motion.div
      className={className}
      data-motion="auto-height"
      initial={false}
      animate={{
        height: open ? height : 0,
        opacity: open ? 1 : 0,
      }}
      transition={autoHeightSpring}
      style={{ overflow: 'hidden' }}
    >
      <div ref={innerRef}>{children}</div>
    </motion.div>
  )
}
