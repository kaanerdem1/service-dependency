export type SnapshotType =
  | 'explore'
  | 'cr_open'
  | 'approval'
  | 'gate_open'
  | 'incident'

export type UiChromeState = {
  activeTab: 'map' | 'affected' | 'overview'
  drawerOpen: boolean
  /** Panel geniş mi (pin, hover veya ilk yükleme) */
  sidebarOpen: boolean
  /** Paneli Sabitle açık mı */
  sidebarPinned?: boolean
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
  detail?: string
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
  sha256: string
  /** PNG ayrı endpoint — JSON'da base64 yok */
  url: string
}

/** İstemci → sunucu yükleme (createSnapshot sırasında tüketilir) */
export type SnapshotScreenshotUpload = {
  surface: SnapshotScreenshot['surface']
  capturedAt: string
  dataUrl: string
  sha256?: string
}

export type SnapshotClientPayload = {
  navigationTrail: TrailEntry[]
  uiChrome: UiChromeState
  viewState: SnapshotViewState
  focus: SnapshotFocus
  screenshots?: SnapshotScreenshotUpload[]
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
    /** Merkezin çağırdığı servisler (upstream); hop1 onay kümesine girmez */
    upstream?: ImpactRow[]
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
  screenshots?: SnapshotScreenshot[]
  manifest?: {
    files: Array<{ name: string; sha256: string; role: 'json' | 'png' | 'other' }>
    packSha256: string
  }
}
