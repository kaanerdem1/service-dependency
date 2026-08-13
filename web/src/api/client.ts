/**
 * UI → Express API istemcisi.
 * Vite proxy: `/api/*` → `http://127.0.0.1:4000/api/*`
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
  Service,
  ServiceNeighbors,
} from '../types'

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`/api${path}`, {
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

export function getImpactGraph(serviceId: string, mode: 'simple' | 'advanced') {
  return request<ImpactGraph>(`/services/${serviceId}/impact?mode=${mode}`)
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
}) {
  return request<ChangeRequest[]>('/change-requests', {
    method: 'POST',
    body: JSON.stringify(input),
  })
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
}) {
  return request<ChangeRequest>(
    `/change-requests/${input.requestId}/flags/${input.serviceId}`,
    {
      method: 'PATCH',
      body: JSON.stringify({
        flag: input.flag,
        note: input.note,
        actorOwnerId: input.actorOwnerId,
      }),
    },
  )
}

export function getSessionUsers() {
  return request<Owner[]>('/session-users')
}
