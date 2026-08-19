export type SnapshotType =
  | 'explore'
  | 'cr_open'
  | 'approval'
  | 'gate_open'
  | 'incident'

export type UiChromeState = {
  activeTab: 'map' | 'affected'
  drawerOpen: boolean
  sidebarOpen: boolean
  searchOpen?: boolean
  selectedMethodId?: string | null
}

export type SnapshotViewState = {
  layout: 'ltr' | 'radial'
  visibleMaxHop: number
  maxHopAvailable: number
  showCascadeEdges: boolean
  viewport?: { x: number; y: number; zoom: number }
  focusEdgeId?: string
}

export type SnapshotFocus = {
  level: 'service' | 'method'
  id: string
  label: string
  treePath: string[]
  serviceId: string
}

export type TrailAction =
  | 'tree_select'
  | 'map_select'
  | 'search_select'
  | 'tab_change'
  | 'nav_back'
  | 'nav_forward'
  | 'drawer_toggle'
  | 'sidebar_toggle'
  | 'layer_change'
  | 'cascade_toggle'
  | 'layout_toggle'
  | 'method_popover_open'

export type TrailEntry = {
  at: string
  action: TrailAction
  target?: { level: 'service' | 'method'; id: string; label: string }
  uiAfter: UiChromeState
}

export type ImpactRow = {
  id: string
  label: string
  hop: number
  direction: 'caller' | 'callee'
  edgeKind: 'tree' | 'cascade'
  ownerId?: string
}

export type SnapshotScreenshot = {
  surface: 'map' | 'affected' | 'drawer' | 'full_app'
  capturedAt: string
  dataUrl: string
  sha256?: string
}

export type SnapshotClientPayload = {
  navigationTrail: TrailEntry[]
  uiChrome: UiChromeState
  viewState: SnapshotViewState
  focus: SnapshotFocus
  screenshots?: SnapshotScreenshot[]
  changeSummary?: { title?: string; reason?: string }
}

export type Snapshot = {
  id: string
  type: SnapshotType
  createdAt: string
  actor: { userId: string; displayName?: string }
  changeRequestId?: string
  relatedRequestIds?: string[]
  batchId?: string
  catalogRevision: string
  focus: SnapshotFocus
  navigationTrail: TrailEntry[]
  uiChrome: UiChromeState
  viewState: SnapshotViewState
  impact: {
    hop1: ImpactRow[]
    deeper?: ImpactRow[]
    cascadeEdges?: Array<{
      fromId: string
      toId: string
      fromLabel: string
      toLabel: string
    }>
  }
  approvals?: Array<{
    ownerId: string
    serviceId: string
    flag: string
    note?: string
    at: string
  }>
  changeSummary?: { title?: string; reason?: string }
  imageUrl?: string
  screenshots?: SnapshotScreenshot[]
  manifest?: {
    files: Array<{ name: string; sha256: string; role: 'json' | 'png' | 'other' }>
    packSha256: string
  }
}
