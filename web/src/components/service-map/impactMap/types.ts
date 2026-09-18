import type { PackageOption, ProjectOption } from '../../../impact/projectFilter'
import type { MapLayout, RadialLabelSide } from '../../../impact/mapLayout'
import type { ImpactGraph, Snapshot } from '../../../types'

export type ImpactMapProps = {
  graph: ImpactGraph
  projectOptions: ProjectOption[]
  packageOptions?: PackageOption[]
  onPivot: (serviceId: string) => void
  /** Metod chip → detay */
  onSelectMethod?: (serviceId: string, methodId: string) => void
  /** +N → servisin Metodlar sekmesi */
  onBrowseMethods?: (serviceId: string) => void
  onClearCenter?: () => void
  onPivotBack?: () => void
  onPivotForward?: () => void
  canPivotBack?: boolean
  canPivotForward?: boolean
  mapExpanded?: boolean
  /** Geri/ileri: bu ziyarette bırakılan katman durumu */
  restoredView?: { visibleMaxHop: number; expandedLayers: number[] }
  onViewStateChange?: (view: {
    visibleMaxHop: number
    expandedLayers: number[]
  }) => void
  navDirection?: 'back' | 'forward' | null
  onNavDirectionConsumed?: () => void
  /** Session kullanıcı — notlar + snapshot */
  sessionUserId?: string
  sessionUserName?: string
  onMapRoot?: (el: HTMLDivElement | null) => void
  onBeforeSnapshot?: () => void
  onSnapshotSaved?: (snapshot: Snapshot) => void
  /** Ağaç / arama ile yeni merkez → LTR'ye dön */
  forceLtrSignal?: number
  /** Hub kırpma banner / cluster → Tablo sekmesi (opsiyonel proje filtresi) */
  onOpenAffectedTab?: (projectId?: string) => void
}

export type ServiceNodeData = {
  label: string
  fullLabel: string
  showTip: boolean
  size: MapLayout['size']
  kind: 'center' | 'service' | 'collapsed' | 'cluster'
  hop: number
  hiddenIds?: string[]
  count?: number
  clusterKey?: string
  /** Filtre dışı ama eşleşmeye giden ara düğüm */
  bridge?: boolean
  /** Proje filtresine uyan etkilenen servis */
  match?: boolean
  /** Görünür not sayısı (rozet) */
  noteCount?: number
  radialDot?: boolean
  radialAngle?: number
  radialCx?: number
  radialCy?: number
  radialLabelSide?: RadialLabelSide
  radialLabelGapBoost?: number
  /** Katman açılışında sıralı giriş (0-based) */
  revealIndex?: number
}

export type MethodBadgeData = {
  serviceId: string
  count: number
  expanded: boolean
}

export type RingGuideData = {
  radius: number
  hop: number
}

export type FanEdgeData = {
  fromId?: string
  toId?: string
  hop?: number
  kind?: 'tree' | 'cascade'
  fanIndex?: number
  fanCount?: number
  sameColumn?: boolean
  /** Radial eğri için halka merkezi */
  cx?: number
  cy?: number
  /** Düğüm merkezleri + daire yarıçapı (kenar handle değil) */
  sx?: number
  sy?: number
  sr?: number
  tx?: number
  ty?: number
  tr?: number
}
