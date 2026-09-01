/**
 * UI → Express API istemcisi.
 * Vite proxy: `/api/*` → `http://127.0.0.1:4000/api/*`
 * Production: `VITE_API_BASE_URL=https://api.example.com`
 */
import type {
  AffectedService,
  ChangeRequest,
  FlagStatus,
  ImpactGraph,
  ImpactedFlag,
  MethodImpact,
  MethodImpactGraph,
  MethodRef,
  ModuleNode,
  Owner,
  NoteVisibility,
  Service,
  ServiceLocation,
  ServiceNeighbors,
  ServiceNote,
  Snapshot,
  SnapshotClientPayload,
} from '../types'

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL?.replace(/\/$/, '') ?? ''

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`${API_BASE_URL}/api${path}`, {
    headers: { 'Content-Type': 'application/json', ...(init?.headers ?? {}) },
    ...init,
  })
  if (!res.ok) {
    const body = await res.json().catch(() => ({}))
    throw new Error(body.error ?? `HTTP ${res.status}`)
  }
  return res.json() as Promise<T>
}

export function getModuleTree() {
  return request<ModuleNode[]>('/modules')
}

export function getModuleChildren(nodeId: string) {
  return request<ModuleNode[]>(`/modules/${encodeURIComponent(nodeId)}/children`)
}

export function getNonServiceMethods(nodeId: string, limit = 50, offset = 0) {
  const qs = new URLSearchParams({
    limit: String(limit),
    offset: String(offset),
  })
  return request<ModuleNode[]>(
    `/modules/${encodeURIComponent(nodeId)}/non-service-methods?${qs}`,
  )
}

export function getServiceLocations(serviceId: string) {
  return request<ServiceLocation[]>(
    `/services/${encodeURIComponent(serviceId)}/locations`,
  )
}

export function getServiceTreePath(serviceId: string) {
  return request<{ path: ModuleNode[] }>(`/services/${encodeURIComponent(serviceId)}/tree-path`)
}

export function getService(id: string) {
  return request<Service>(`/services/${id}`)
}

export function searchServices(query: string) {
  const q = encodeURIComponent(query.trim())
  return request<Service[]>(`/services?q=${q}`)
}

export function getAffected(serviceId: string) {
  return request<AffectedService[]>(`/services/${serviceId}/affected`)
}

export function getNeighbors(serviceId: string) {
  return request<ServiceNeighbors>(`/services/${serviceId}/neighbors`)
}

export function listMethodsForService(serviceId: string, linkedTo?: string) {
  const q = linkedTo
    ? `?linkedTo=${encodeURIComponent(linkedTo)}`
    : ''
  return request<MethodRef[]>(`/services/${serviceId}/methods${q}`)
}

export function getMethodCallers(methodId: string) {
  return request<MethodRef[]>(`/methods/${encodeURIComponent(methodId)}/callers`)
}

export function getMethodCallees(methodId: string) {
  return request<MethodRef[]>(`/methods/${encodeURIComponent(methodId)}/callees`)
}

export function getMethodImpact(methodId: string) {
  return request<MethodImpact>(`/methods/${encodeURIComponent(methodId)}/impact`)
}

export function getMethodImpactGraph(methodId: string) {
  return request<MethodImpactGraph>(
    `/methods/${encodeURIComponent(methodId)}/impact-graph`,
  )
}

export function searchMethods(query: string) {
  const q = encodeURIComponent(query.trim())
  return request<MethodRef[]>(`/methods?q=${q}`)
}

export function getImpactGraph(serviceId: string) {
  return request<ImpactGraph>(`/services/${serviceId}/impact?mode=advanced`)
}

export function listRequestsForService(serviceId: string) {
  return request<ChangeRequest[]>(`/services/${serviceId}/change-requests`)
}

export function getChangeRequest(id: string) {
  return request<ChangeRequest>(`/change-requests/${id}`)
}

export function createChangeRequest(input: {
  kind?: 'change' | 'new_service'
  targetServiceId?: string
  proposedServiceName?: string
  proposedProjectId?: string
  proposedPackageId?: string
  summary: string
  rationale: string
  description?: string
  /** change: opsiyonel; task “Servis etkisi” sekmesine yazılır */
  serviceImpact?: string
  /** change: opsiyonel; task “Veri etkisi” sekmesine yazılır */
  dataImpact?: string
  personId: string
  personName: string
  team?: string
  department?: string
  affectedServiceIds: string[]
  snapshotContext?: SnapshotClientPayload
}) {
  return request<{ requests: ChangeRequest[]; snapshots: Snapshot[] }>(
    '/change-requests',
    {
      method: 'POST',
      body: JSON.stringify(input),
    },
  )
}

export function getInbox(ownerId: string) {
  return request<{
    actions: { request: ChangeRequest; row: ImpactedFlag }[]
    updates: import('../types').InboxNotification[]
    pending: number
  }>(`/inbox/${ownerId}`)
}

export function markInboxRead(ownerId: string, ids?: string[]) {
  return request<{ updates: import('../types').InboxNotification[] }>(
    `/inbox/${ownerId}/read`,
    {
      method: 'POST',
      body: JSON.stringify({ ids }),
    },
  )
}

export function setFlag(input: {
  requestId: string
  serviceId: string
  flag: FlagStatus
  note?: string
  actorOwnerId: string
  snapshotContext?: SnapshotClientPayload
}) {
  return request<{ request: ChangeRequest; snapshots: Snapshot[] }>(
    `/change-requests/${input.requestId}/flags/${input.serviceId}`,
    {
      method: 'PATCH',
      body: JSON.stringify({
        flag: input.flag,
        note: input.note,
        actorOwnerId: input.actorOwnerId,
        snapshotContext: input.snapshotContext,
      }),
    },
  )
}

export function saveExploreSnapshot(input: {
  personId: string
  personName?: string
  changeRequestId?: string
  client: SnapshotClientPayload
}) {
  return request<Snapshot>('/snapshots', {
    method: 'POST',
    body: JSON.stringify(input),
  })
}

export function getSnapshot(id: string) {
  return request<Snapshot>(`/snapshots/${id}`)
}

export function listSnapshotsForRequest(changeRequestId: string) {
  return request<Snapshot[]>(`/change-requests/${changeRequestId}/snapshots`)
}

export function getSessionUsers() {
  return request<Owner[]>('/session-users')
}

export function listServiceNotes(serviceId: string, viewerId: string) {
  return request<ServiceNote[]>(
    `/services/${serviceId}/notes?viewerId=${encodeURIComponent(viewerId)}`,
  )
}

export function createServiceNote(input: {
  serviceId: string
  authorId: string
  body: string
  visibility?: NoteVisibility
}) {
  return request<ServiceNote>(`/services/${input.serviceId}/notes`, {
    method: 'POST',
    body: JSON.stringify({
      authorId: input.authorId,
      body: input.body,
      visibility: input.visibility ?? 'team',
    }),
  })
}

export function deleteServiceNote(noteId: string, actorId: string) {
  return request<{ ok: boolean }>(
    `/notes/${encodeURIComponent(noteId)}?actorId=${encodeURIComponent(actorId)}`,
    { method: 'DELETE' },
  )
}

/** Görünür düğümler için not sayısı (rozet) */
export function getNoteCounts(serviceIds: string[], viewerId: string) {
  if (!serviceIds.length) return Promise.resolve({} as Record<string, number>)
  const ids = encodeURIComponent(serviceIds.join(','))
  return request<Record<string, number>>(
    `/notes/counts?ids=${ids}&viewerId=${encodeURIComponent(viewerId)}`,
  )
}
