import { motion } from 'motion/react'
import { useRef, useState, type ReactNode } from 'react'
import { layoutSpring } from './config'
import { MorphHoverIndicator } from './MorphHover'

export type StageTabId = 'map' | 'affected' | 'overview' | 'screens' | 'processes'

export type StageTabDef<T extends string = StageTabId> = {
  id: T
  label: string
  icon: ReactNode
  count?: number
  group?: string
}

const SCREEN_ICON = (
  <svg width="14" height="14" viewBox="0 0 16 16" fill="none" aria-hidden>
    <rect x="2" y="3" width="12" height="9" rx="1.5" stroke="currentColor" strokeWidth="1.25" />
    <path d="M5 14h6" stroke="currentColor" strokeWidth="1.25" strokeLinecap="round" />
  </svg>
)

const PROCESS_ICON = (
  <svg width="14" height="14" viewBox="0 0 16 16" fill="none" aria-hidden>
    <circle cx="4" cy="4" r="1.75" stroke="currentColor" strokeWidth="1.2" />
    <circle cx="12" cy="8" r="1.75" stroke="currentColor" strokeWidth="1.2" />
    <circle cx="4" cy="12" r="1.75" stroke="currentColor" strokeWidth="1.2" />
    <path d="M5.6 5.1 10.4 7.2M5.6 10.9l4.8-2.1" stroke="currentColor" strokeWidth="1.15" />
  </svg>
)

export const SERVICE_STAGE_TAB_ORDER: StageTabId[] = [
  'map',
  'affected',
  'overview',
  'screens',
  'processes',
]

export function buildServiceStageTabs(counts?: {
  screens?: number
  processes?: number
}): StageTabDef[] {
  const screenCount = counts?.screens ?? 0
  const processCount = counts?.processes ?? 0
  return [
    {
      id: 'map',
      label: 'Harita',
      group: 'impact',
      icon: (
        <svg width="14" height="14" viewBox="0 0 16 16" fill="none" aria-hidden>
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
      label: 'Tablo',
      group: 'impact',
      icon: (
        <svg width="14" height="14" viewBox="0 0 16 16" fill="none" aria-hidden>
          <circle cx="4" cy="4" r="2.25" stroke="currentColor" strokeWidth="1.25" />
          <circle cx="12" cy="12" r="2.25" stroke="currentColor" strokeWidth="1.25" />
          <path d="M5.8 5.5 10.2 10.5" stroke="currentColor" strokeWidth="1.25" />
        </svg>
      ),
    },
    {
      id: 'overview',
      label: 'Servis İşlevi',
      group: 'catalog',
      icon: (
        <svg width="14" height="14" viewBox="0 0 16 16" fill="none" aria-hidden>
          <rect x="2" y="2" width="12" height="12" rx="1.5" stroke="currentColor" strokeWidth="1.25" />
          <path d="M5 5.5h6M5 8h6M5 10.5h4" stroke="currentColor" strokeWidth="1.25" strokeLinecap="round" />
        </svg>
      ),
    },
    {
      id: 'screens',
      label: 'Ekranlar',
      group: 'catalog',
      count: screenCount,
      icon: SCREEN_ICON,
    },
    {
      id: 'processes',
      label: 'Process',
      group: 'catalog',
      count: processCount,
      icon: PROCESS_ICON,
    },
  ]
}

const DEFAULT_TABS = buildServiceStageTabs()

type Props<T extends string = StageTabId> = {
  tab: T
  onSelect: (tab: T) => void
  tabs?: StageTabDef<T>[]
  ariaLabel?: string
}

export function StageTabs<T extends string = StageTabId>({
  tab,
  onSelect,
  tabs,
  ariaLabel = 'Görünüm',
}: Props<T>) {
  const items = tabs ?? (DEFAULT_TABS as StageTabDef<T>[])
  const hoverRef = useRef<T | null>(null)
  const [hover, setHover] = useState<T | null>(null)

  return (
    <nav className="stage-tabs" aria-label={ariaLabel} data-motion="morphin-tab-nav">
      {items.map((t, index) => {
        const on = tab === t.id
        const showMorph = hover === t.id && !on
        const prev = items[index - 1]
        const showDivider = index > 0 && t.group && prev?.group && t.group !== prev.group
        return (
          <span key={t.id} className="stage-tab-wrap">
            {showDivider ? <span className="stage-tab-divider" aria-hidden /> : null}
            <button
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
              <span className="stage-tab-label">{t.label}</span>
              {t.count != null && t.count > 0 ? (
                <span className="stage-tab-count">{t.count}</span>
              ) : null}
            </button>
          </span>
        )
      })}
    </nav>
  )
}
