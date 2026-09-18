import type { MapLayout, RadialLabelSide } from '../../../impact/mapLayout'
import type { MethodImpactGraph } from '../../../types'

export type MethodImpactMapProps = {
  graph: MethodImpactGraph
  onSelectMethod: (serviceId: string, methodId: string) => void
  onSelectService: (serviceId: string) => void
  onClearMethod: () => void
  onPivotBack?: () => void
  onPivotForward?: () => void
  canPivotBack?: boolean
  canPivotForward?: boolean
}

/** Servis özeti ↔ method detayı geçişi (üst toolbar). */
export type ViewMode = 'services' | 'methods'

export type MapNodeData = {
  label: string
  fullLabel: string
  showTip: boolean
  size: MapLayout['size']
  sub: string
  kind: 'center' | 'service' | 'method' | 'collapsed'
  hop: number
  serviceId?: string
  methodId?: string
  count?: number
  hiddenIds?: string[]
  radialDot?: boolean
  radialAngle?: number
  radialCx?: number
  radialCy?: number
  radialLabelSide?: RadialLabelSide
  radialLabelGapBoost?: number
}

export type LayerItem = {
  id: string
  hop: number
  label: string
  sub: string
  kind: 'service' | 'method'
  serviceId: string
  methodId?: string
  methodCount?: number
}
