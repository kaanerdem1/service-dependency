import {
  useRef,
  useState,
  type CSSProperties,
  type PointerEvent as ReactPointerEvent,
  type ReactNode,
} from 'react'
import { useReducedMotion } from 'motion/react'

type Props = {
  className?: string
  children: ReactNode
}

/** React Bits Spotlight Card — imleçle hafif radial ışık */
export function MotionSpotlight({ className, children }: Props) {
  const ref = useRef<HTMLDivElement>(null)
  const reduced = useReducedMotion()
  const [spot, setSpot] = useState({ x: 42, y: 28 })

  const onPointerMove = (e: ReactPointerEvent<HTMLDivElement>) => {
    const el = ref.current
    if (!el || reduced) return
    const r = el.getBoundingClientRect()
    if (r.width < 1 || r.height < 1) return
    setSpot({
      x: ((e.clientX - r.left) / r.width) * 100,
      y: ((e.clientY - r.top) / r.height) * 100,
    })
  }

  const onPointerLeave = () => {
    if (reduced) return
    setSpot({ x: 42, y: 28 })
  }

  const glowStyle = {
    '--spot-x': `${spot.x}%`,
    '--spot-y': `${spot.y}%`,
  } as CSSProperties

  return (
    <div
      ref={ref}
      className={`motion-spotlight${className ? ` ${className}` : ''}`}
      data-motion="spotlight-card"
      onPointerMove={onPointerMove}
      onPointerLeave={onPointerLeave}
    >
      {!reduced ? (
        <span
          className="motion-spotlight-glow"
          style={glowStyle}
          aria-hidden
        />
      ) : null}
      {children}
    </div>
  )
}
