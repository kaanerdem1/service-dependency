import { motion, useReducedMotion } from 'motion/react'
import { useMemo, useRef, type CSSProperties, type ReactNode } from 'react'
import { springSoft } from './config'
import type { StageTabId } from './StageTabs'

const TAB_INDEX: Record<StageTabId, number> = {
  map: 0,
  affected: 1,
  overview: 2,
}

const DEFAULT_TAB_ORDER: StageTabId[] = ['map', 'affected', 'overview']

type Props<T extends string = StageTabId> = {
  tab: T
  tabOrder?: readonly T[]
  mapOnly?: boolean
  children: ReactNode
}

/** Yön farkında kaydırma — velocity spring ile ileri/geri ayrımı */
export function StageTabPanels<T extends string = StageTabId>({
  tab,
  tabOrder,
  mapOnly,
  children,
}: Props<T>) {
  const reduced = useReducedMotion()
  const order = tabOrder ?? (DEFAULT_TAB_ORDER as unknown as readonly T[])
  const tabIndex = useMemo(() => {
    const entries = order.map((id, index) => [id, index] as const)
    return new Map<T, number>(entries)
  }, [order])
  const prevTab = useRef(tab)
  const count = Math.max(order.length, 1)
  const index = tabIndex.get(tab) ?? (TAB_INDEX[tab as StageTabId] ?? 0)
  const prevIndex = tabIndex.get(prevTab.current) ?? (TAB_INDEX[prevTab.current as StageTabId] ?? 0)
  const direction = index - prevIndex
  prevTab.current = tab
  const panelStyle = tabOrder
    ? ({
        width: `${count * 100}%`,
        ['--stage-tab-count' as string]: count,
      } as CSSProperties)
    : undefined

  if (mapOnly) {
    return (
      <div className="stage-panels stage-panels-motion is-map-only" style={panelStyle}>{children}</div>
    )
  }

  const shift = `-${index * (100 / count)}%`

  if (reduced) {
    return (
      <div
        className={`stage-panels stage-panels-motion is-tab-${tab}`}
        style={{ ...panelStyle, transform: `translateX(${shift})` }}
      >
        {children}
      </div>
    )
  }

  return (
    <motion.div
      className="stage-panels stage-panels-motion"
      data-motion="tab-slide-directional"
      data-direction={direction >= 0 ? 'forward' : 'back'}
      style={panelStyle}
      animate={{ x: shift, opacity: 1 }}
      transition={{
        ...springSoft,
        velocity: direction * 140,
      }}
    >
      {children}
    </motion.div>
  )
}
