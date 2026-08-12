import type { AffectedService, ChangeRequest, FlagStatus, ImpactedFlag } from '../types'
import { isApprovalOpen } from '../types'
import { services } from './data'

let seq = 1
const store: ChangeRequest[] = []
const listeners = new Set<() => void>()

function emit() {
  for (const l of listeners) l()
}

export function subscribeChangeRequests(listener: () => void) {
  listeners.add(listener)
  return () => {
    listeners.delete(listener)
  }
}

export function listChangeRequests(): ChangeRequest[] {
  return [...store].sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))
}

export function getChangeRequest(id: string): ChangeRequest | undefined {
  return store.find((c) => c.id === id)
}

export function listRequestsForService(serviceId: string): ChangeRequest[] {
  return listChangeRequests().filter((c) => c.targetServiceId === serviceId)
}

/** Inbox: bu owner’ın yanıtlaması gereken (veya tüm) satırlar */
export function listInboxForOwner(ownerId: string): {
  request: ChangeRequest
  row: ImpactedFlag
}[] {
  const out: { request: ChangeRequest; row: ImpactedFlag }[] = []
  for (const request of listChangeRequests()) {
    for (const row of request.impacted) {
      if (row.ownerId === ownerId) out.push({ request, row })
    }
  }
  return out
}

export function pendingInboxCount(ownerId: string): number {
  return listInboxForOwner(ownerId).filter((x) => x.row.flag === 'unseen').length
}

export function createChangeRequest(input: {
  targetServiceId: string
  summary: string
  rationale: string
  personId: string
  personName: string
  team?: string
  department?: string
  affected: AffectedService[]
}): ChangeRequest {
  const target = services[input.targetServiceId]
  const now = new Date().toISOString()
  const impacted: ImpactedFlag[] = input.affected.map(({ service }) => ({
    serviceId: service.id,
    serviceName: service.name,
    ownerId: service.owner?.id,
    ownerName: service.owner?.name,
    team: service.owner?.team,
    flag: 'unseen' as const,
  }))

  const cr: ChangeRequest = {
    id: `CR-${String(seq++).padStart(3, '0')}`,
    targetServiceId: input.targetServiceId,
    targetServiceName: target?.name ?? input.targetServiceId,
    kind: 'change',
    summary: input.summary.trim(),
    rationale: input.rationale.trim(),
    requestedBy: {
      personId: input.personId,
      personName: input.personName,
      team: input.team?.trim() || undefined,
      department: input.department?.trim() || undefined,
    },
    impacted,
    createdAt: now,
    updatedAt: now,
  }
  store.unshift(cr)
  emit()
  return cr
}

export function setFlag(input: {
  requestId: string
  serviceId: string
  flag: FlagStatus
  note?: string
  actorOwnerId: string
}): ChangeRequest | undefined {
  const cr = store.find((c) => c.id === input.requestId)
  if (!cr) return undefined
  const row = cr.impacted.find((i) => i.serviceId === input.serviceId)
  if (!row || row.ownerId !== input.actorOwnerId) return undefined
  if (input.flag === 'rejected' && !input.note?.trim()) {
    throw new Error('Red gerekçesi zorunlu')
  }
  row.flag = input.flag
  row.note = input.note?.trim() || undefined
  cr.updatedAt = new Date().toISOString()
  emit()
  return cr
}

export { isApprovalOpen }
