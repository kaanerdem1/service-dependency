import type { AffectedService, ChangeRequest, FlagStatus, ImpactedFlag } from '../types'
import { isApprovalOpen } from '../types'
import { services } from './data'

let seq = 546
let batchSeq = 1
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
  return listChangeRequests().filter(
    (c) => c.targetServiceId === serviceId || c.assigneeServiceId === serviceId,
  )
}

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

/** Her etkilenen servis için ayrı T-xxx task */
export function createChangeRequest(input: {
  targetServiceId: string
  summary: string
  rationale: string
  description?: string
  personId: string
  personName: string
  team?: string
  department?: string
  affected: AffectedService[]
}): ChangeRequest[] {
  const target = services[input.targetServiceId]
  const now = new Date().toISOString()
  const batchId =
    input.affected.length > 1 ? `B-${String(batchSeq++).padStart(3, '0')}` : undefined
  const created: ChangeRequest[] = []

  for (const { service: assignee } of input.affected) {
    const row: ImpactedFlag = {
      serviceId: assignee.id,
      serviceName: assignee.name,
      ownerId: assignee.owner?.id,
      ownerName: assignee.owner?.name,
      team: assignee.owner?.team,
      flag: 'unseen',
    }
    const cr: ChangeRequest = {
      id: `T-${seq++}`,
      batchId,
      targetServiceId: input.targetServiceId,
      targetServiceName: target?.name ?? input.targetServiceId,
      assigneeServiceId: assignee.id,
      assigneeServiceName: assignee.name,
      assigneeTeam: assignee.owner?.team,
      kind: 'change',
      summary: input.summary.trim(),
      rationale: input.rationale.trim(),
      description:
        input.description?.trim() ||
        `${input.summary.trim()}\n\n${input.rationale.trim()}`,
      serviceImpact: `${target?.name} → ${assignee.name} servis etkisi (mock).`,
      dataImpact: `${assignee.name} veri etkisi (mock).`,
      requestedBy: {
        personId: input.personId,
        personName: input.personName,
        team: input.team?.trim() || undefined,
        department: input.department?.trim() || undefined,
      },
      impacted: [row],
      createdAt: now,
      updatedAt: now,
    }
    store.unshift(cr)
    created.push(cr)
  }
  emit()
  return created
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
