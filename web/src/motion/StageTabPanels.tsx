import { motion, useReducedMotion } from 'motion/react'
import { useRef, type ReactNode } from 'react'
import { springSoft } from './config'
import type { StageTabId } from './StageTabs'

const TAB_INDEX: Record<StageTabId, number> = {
  map: 0,
  affected: 1,
  overview: 2,
}

type Props = {
  tab: StageTabId
  mapOnly?: boolean
  children: ReactNode
}

/** Yön farkında kaydırma — velocity spring ile ileri/geri ayrımı */
export function StageTabPanels({ tab, mapOnly, children }: Props) {
  const reduced = useReducedMotion()
  const prevTab = useRef(tab)
  const direction = TAB_INDEX[tab] - TAB_INDEX[prevTab.current]
  prevTab.current = tab

  if (mapOnly) {
    return (
      <div className="stage-panels stage-panels-motion is-map-only">{children}</div>
    )
  }

  const index = TAB_INDEX[tab]
  const shift = `-${index * (100 / 3)}%`

  if (reduced) {
    return (
      <div
        className={`stage-panels stage-panels-motion is-tab-${tab}`}
        style={{ transform: `translateX(${shift})` }}
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
