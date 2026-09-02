import { motion } from 'motion/react'
import { layoutSpring } from '../motion/config'
import { MorphHoverIndicator } from '../motion/MorphHover'
import { useRef, useState } from 'react'

export type AppSurface = 'services' | 'dwh'

const ITEMS: Array<{ id: AppSurface; label: string }> = [
  { id: 'services', label: 'Servis' },
  { id: 'dwh', label: 'DWH' },
]

type Props = {
  surface: AppSurface
  onSurfaceChange: (next: AppSurface) => void
  className?: string
}

/** Servis / DWH — Morphin layoutId pill (StageTabs ile aynı kalıp) */
export function SurfaceSwitch({ surface, onSurfaceChange, className }: Props) {
  const hoverRef = useRef<AppSurface | null>(null)
  const [hover, setHover] = useState<AppSurface | null>(null)

  return (
    <div
      className={`app-surface-switch${className ? ` ${className}` : ''}`}
      role="tablist"
      aria-label="Uygulama alanı"
    >
      {ITEMS.map((item) => {
        const on = surface === item.id
        const showMorph = hover === item.id && !on
        return (
          <button
            key={item.id}
            type="button"
            role="tab"
            aria-selected={on}
            className={on ? 'is-active' : undefined}
            onMouseEnter={() => {
              hoverRef.current = item.id
              setHover(item.id)
            }}
            onMouseLeave={() => {
              if (hoverRef.current === item.id) {
                hoverRef.current = null
                setHover(null)
              }
            }}
            onClick={() => onSurfaceChange(item.id)}
          >
            {on ? (
              <motion.span
                className="app-surface-switch-pill"
                layoutId="app-surface-switch-pill"
                transition={layoutSpring}
              />
            ) : null}
            <MorphHoverIndicator
              active={showMorph}
              layoutId="app-surface-switch-hover"
              className="app-surface-switch-hover"
            />
            <span className="app-surface-switch-label">{item.label}</span>
          </button>
        )
      })}
    </div>
  )
}
