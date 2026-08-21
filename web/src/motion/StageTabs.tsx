import { motion } from 'motion/react'
import { useRef, useState } from 'react'
import { layoutSpring } from './config'
import { MorphHoverIndicator } from './MorphHover'

export type StageTabId = 'map' | 'affected' | 'overview'

type TabDef = {
  id: StageTabId
  label: string
  icon: React.ReactNode
}

const TABS: TabDef[] = [
  {
    id: 'map',
    label: 'Harita',
    icon: (
      <svg width="14" height="14" viewBox="0 0 16 16" fill="none">
        <circle cx="8" cy="8" r="2" stroke="currentColor" strokeWidth="1.25" />
        <circle cx="3.5" cy="4" r="1.5" stroke="currentColor" strokeWidth="1.1" />
        <circle cx="12.5" cy="4" r="1.5" stroke="currentColor" strokeWidth="1.1" />
        <circle cx="8" cy="13.5" r="1.5" stroke="currentColor" strokeWidth="1.1" />
        <path
          d="M6.2 6.6 4.4 5M9.8 6.6l1.8-1.6M8 10v1.8"
          stroke="currentColor"
          strokeWidth="1.1"
          strokeLinecap="round"
        />
      </svg>
    ),
  },
  {
    id: 'affected',
    label: 'İlişkiler',
    icon: (
      <svg width="14" height="14" viewBox="0 0 16 16" fill="none">
        <circle cx="4" cy="4" r="2.25" stroke="currentColor" strokeWidth="1.25" />
        <circle cx="12" cy="12" r="2.25" stroke="currentColor" strokeWidth="1.25" />
        <path d="M5.8 5.5 10.2 10.5" stroke="currentColor" strokeWidth="1.25" />
      </svg>
    ),
  },
  {
    id: 'overview',
    label: 'Servis İşlevi',
    icon: (
      <svg width="14" height="14" viewBox="0 0 16 16" fill="none">
        <rect x="2" y="2" width="12" height="12" rx="1.5" stroke="currentColor" strokeWidth="1.25" />
        <path d="M5 5.5h6M5 8h6M5 10.5h4" stroke="currentColor" strokeWidth="1.25" strokeLinecap="round" />
      </svg>
    ),
  },
]

type Props = {
  tab: StageTabId
  onSelect: (tab: StageTabId) => void
}

/** Motion + Morphin morph hover — sekme pill + hover arka plan */
export function StageTabs({ tab, onSelect }: Props) {
  const hoverRef = useRef<StageTabId | null>(null)
  const [hover, setHover] = useState<StageTabId | null>(null)

  return (
    <nav className="stage-tabs" aria-label="Görünüm" data-motion="morphin-tab-nav">
      {TABS.map((t) => {
        const on = tab === t.id
        const showMorph = hover === t.id && !on
        return (
          <button
            key={t.id}
            type="button"
            role="tab"
            aria-selected={on}
            className={`stage-tab${on ? ' on' : ''}`}
            onMouseEnter={() => {
              hoverRef.current = t.id
              setHover(t.id)
            }}
            onMouseLeave={() => {
              if (hoverRef.current === t.id) {
                hoverRef.current = null
                setHover(null)
              }
            }}
            onClick={() => onSelect(t.id)}
          >
            {on ? (
              <motion.span
                className="stage-tab-indicator"
                layoutId="stage-tab-pill"
                transition={layoutSpring}
              />
            ) : null}
            <MorphHoverIndicator
              active={showMorph}
              layoutId="stage-tab-hover"
              className="stage-tab-hover-morph"
            />
            <span className="stage-tab-icon" aria-hidden>
              {t.icon}
            </span>
            {t.label}
          </button>
        )
      })}
    </nav>
  )
}
