/**
 * UI domain tipleri (API cevaplarıyla hizalı).
 *
 * Kavramlar:
 * - Service / AffectedService → servis bağımlılığı (affectsEdges)
 * - MethodRef / MethodImpact* → call-graph (callEdges)
 * - ImpactGraph → harita BFS (hop 1 = onay kümesi)
 * - ChangeRequest / FlagStatus → onay akışı
 */
export type TeamRole = 'lead' | 'member'

export type Owner = {
  id: string
  name: string
  team?: string
  /** lead = ekip lideri, member = ekip çalışanı */
  role?: TeamRole
}

export type Service = {
  id: string
  name: string
  projectId: string
  packageId: string
  owner?: Owner
  /** Bu servisi çağıran sayısı (değişince etkilenenler) */
  affectedCount: number
  /** Bu servisin çağırdığı servis sayısı */
  dependsOnCount: number
}

export type AffectedService = {
  service: Service
  /** Görünüm hop’u (1 = doğrudan). Onay listesi yalnız hop === 1 kullanır. */
  hop?: number
}

/**
 * Ürün dili (etki): Downstream = beni çağıranlar · Upstream = çağırdıklarım.
 * APM (istek yönü) bunun tersidir; UI Türkçe etiket kullanır.
 */
export type ServiceNeighbors = {
  upstream: AffectedService[]
  downstream: AffectedService[]
}

/** Katalog metodu (call-graph düğümü) */
export type MethodRef = {
  id: string
  serviceId: string
  serviceName: string
  className: string
  name: string
  signature: string
  callerCount: number
  calleeCount: number
}

export type MethodImpact = {
  methodId: string
  methodCount: number
  serviceCount: number
  serviceIds: string[]
  methodIds: string[]
}

export type MethodImpactNode = {
  method: MethodRef
  hop: number
}

export type MethodImpactEdge = {
  fromId: string
  toId: string
  hop: number
}

/** Merkez metod → çağıranlar (blast), katmanlı */
export type MethodImpactGraph = {
  center: MethodRef
  nodes: MethodImpactNode[]
  edges: MethodImpactEdge[]
  hopsDrawn: number
  truncated: boolean
  reason?: string
}

export type ImpactNode = {
  service: Service
  hop: number
}

export type ImpactEdge = {
  fromId: string
  toId: string
  hop: number
}

export type ImpactGraph = {
  center: Service
  /** BFS ile eklenen düğümler (merkez hariç), hop >= 1 */
  nodes: ImpactNode[]
  edges: ImpactEdge[]
  hopsDrawn: number
  truncated: boolean
  reason?: string
}

/** Servis notu (MVP) — team | all görünürlük */
export type NoteVisibility = 'team' | 'all'

export type ServiceNote = {
  id: string
  serviceId: string
  authorId: string
  authorName: string
  authorTeam?: string
  authorRole?: TeamRole
  body: string
  visibility: NoteVisibility
  createdAt: string
}

export type FlagStatus =
  | 'accepted'
  | 'rejected'
  | 'hold_editing'
  | 'unseen'

export type ImpactedFlag = {
  serviceId: string
  serviceName: string
  ownerId?: string
  ownerName?: string
  team?: string
  flag: FlagStatus
  note?: string
}

export type ChangeRequest = {
  id: string
  batchId?: string
  targetServiceId: string
  targetServiceName: string
  assigneeServiceId: string
  assigneeServiceName: string
  assigneeTeam?: string
  kind: 'change' | 'new_service'
  proposedServiceName?: string
  proposedProjectId?: string
  proposedPackageId?: string
  summary: string
  rationale: string
  description?: string
  serviceImpact?: string
  dataImpact?: string
  /** new_service: çağıracağı servisler (onaycı değil) */
  dependsOnServiceIds?: string[]
  dependsOnServiceNames?: string[]
  requestedBy: {
    personId: string
    personName: string
    team?: string
    department?: string
  }
  impacted: ImpactedFlag[]
  createdAt: string
  updatedAt: string
}

export type RequestBatchGroup = {
  key: string
  batchId?: string
  kind: 'change' | 'new_service'
  title: string
  summary: string
  updatedAt: string
  items: ChangeRequest[]
}

/** Aynı formdan açılan task’ları batchId ile grupla */
export function groupRequestsByBatch(requests: ChangeRequest[]): RequestBatchGroup[] {
  const map = new Map<string, ChangeRequest[]>()
  for (const r of requests) {
    const key = r.batchId ?? `single:${r.id}`
    const list = map.get(key) ?? []
    list.push(r)
    map.set(key, list)
  }
  const groups: RequestBatchGroup[] = []
  for (const [key, items] of map) {
    const sorted = [...items].sort((a, b) => a.id.localeCompare(b.id))
    const head = sorted[0]!
    const batchId = head.batchId
    const title = batchId
      ? `Grup ${batchId} · ${sorted.length} task`
      : taskHeadline(head)
    groups.push({
      key,
      batchId,
      kind: head.kind,
      title,
      summary: head.summary,
      updatedAt: sorted.reduce((m, x) => (x.updatedAt > m ? x.updatedAt : m), head.updatedAt),
      items: sorted,
    })
  }
  return groups.sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))
}

/** Örn. T-546 — ReportingService */
export function taskHeadline(cr: ChangeRequest): string {
  if (cr.kind === 'new_service') {
    const neu = cr.proposedServiceName ?? cr.targetServiceName
    return `${cr.id} — Yeni: ${neu}`
  }
  return `${cr.id} — ${cr.assigneeServiceName}`
}

/** Onay bekleyen servis (kişi/ekip adı yok) */
export function taskApprover(cr: ChangeRequest): { name: string; team?: string; label: string } {
  const name = cr.impacted[0]?.serviceName ?? cr.assigneeServiceName
  return { name, label: name }
}

export function isApprovalOpen(cr: ChangeRequest): boolean {
  if (cr.impacted.length === 0) return false
  return cr.impacted.every((i) => i.flag === 'accepted')
}

export function approvalSummary(cr: ChangeRequest) {
  const counts = { accepted: 0, rejected: 0, hold_editing: 0, unseen: 0 }
  for (const i of cr.impacted) counts[i.flag]++
  return counts
}

export const FLAG_LABEL: Record<FlagStatus, string> = {
  accepted: 'Kabul edildi',
  rejected: 'Reddedildi',
  hold_editing: 'Düzenleniyor',
  unseen: 'Görülmedi',
}

export type InboxNotification = {
  id: string
  userId: string
  kind: 'approval_needed' | 'flag_update' | 'approval_open' | 'approval_blocked'
  requestId: string
  title: string
  body: string
  flag?: FlagStatus
  serviceName?: string
  batchId?: string
  /** Grup bildirimi: tüm task satırları (I3) */
  relatedTasks?: { id: string; serviceName: string }[]
  read: boolean
  createdAt: string
}

export type ModuleNode = {
  id: string
  kind: 'project' | 'package' | 'service' | 'method'
  name: string
  serviceId?: string
  /** kind === 'method' */
  methodId?: string
  children?: ModuleNode[]
}

export type SnapshotType =
  | 'explore'
  | 'cr_open'
  | 'approval'
  | 'gate_open'
  | 'incident'

export type UiChromeState = {
  activeTab: 'map' | 'affected' | 'overview'
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
  | 'theme_toggle'
  | 'method_popover_open'

export type TrailEntry = {
  at: string
  action: TrailAction
  target?: { level: 'service' | 'method'; id: string; label: string }
  /** İnsan okunur açıklama (ör. "Katman açıldı", "Yan bağ kapatıldı") */
  detail?: string
  uiAfter: UiChromeState
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
    hop1: Array<{
      id: string
      label: string
      hop: number
      direction: 'caller' | 'callee'
      edgeKind: 'tree' | 'cascade'
      ownerId?: string
    }>
    deeper?: Array<{
      id: string
      label: string
      hop: number
      direction: 'caller' | 'callee'
      edgeKind: 'tree' | 'cascade'
      ownerId?: string
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

export const SNAPSHOT_TYPE_LABEL: Record<SnapshotType, string> = {
  explore: 'Keşif',
  cr_open: 'Talep açılışı',
  approval: 'Onay',
  gate_open: 'Kapı açık',
  incident: 'Olay',
}
