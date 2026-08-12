import type { ChangeRequest, FlagStatus, ImpactedFlag } from './data.js'
import { services } from './data.js'

export type InboxNotification = {
  id: string
  userId: string
  kind: 'approval_needed' | 'flag_update' | 'approval_open' | 'approval_blocked'
  requestId: string
  title: string
  body: string
  flag?: FlagStatus
  serviceName?: string
  read: boolean
  createdAt: string
}

const FLAG_MSG: Record<FlagStatus, string> = {
  accepted: 'kabul edildi',
  rejected: 'reddedildi',
  hold_editing: 'düzenleniyor (bekletildi)',
  unseen: 'yanıt bekliyor',
}

let seq = 1
let notifSeq = 1
const store: ChangeRequest[] = []
const notifications: InboxNotification[] = []

function pushNotif(
  partial: Omit<InboxNotification, 'id' | 'read' | 'createdAt'>,
) {
  notifications.unshift({
    ...partial,
    id: `N-${String(notifSeq++).padStart(3, '0')}`,
    read: false,
    createdAt: new Date().toISOString(),
  })
}

export function isApprovalOpen(cr: ChangeRequest) {
  if (cr.impacted.length === 0) return false
  return cr.impacted.every((i) => i.flag === 'accepted')
}

export function listChangeRequests() {
  return [...store].sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))
}

export function getChangeRequest(id: string) {
  return store.find((c) => c.id === id)
}

export function listRequestsForService(serviceId: string) {
  return listChangeRequests().filter((c) => c.targetServiceId === serviceId)
}

export function listInboxForOwner(ownerId: string) {
  const out: { request: ChangeRequest; row: ImpactedFlag }[] = []
  for (const request of listChangeRequests()) {
    for (const row of request.impacted) {
      if (row.ownerId === ownerId) out.push({ request, row })
    }
  }
  return out
}

export function listNotificationsForUser(userId: string) {
  return notifications
    .filter((n) => n.userId === userId)
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
}

export function pendingInboxCount(userId: string) {
  const actionPending = listInboxForOwner(userId).filter((x) => x.row.flag === 'unseen').length
  const unreadNotifs = listNotificationsForUser(userId).filter((n) => !n.read).length
  return actionPending + unreadNotifs
}

export function getInbox(userId: string) {
  return {
    actions: listInboxForOwner(userId),
    updates: listNotificationsForUser(userId),
    pending: pendingInboxCount(userId),
  }
}

export function markNotificationsRead(userId: string, ids?: string[]) {
  for (const n of notifications) {
    if (n.userId !== userId) continue
    if (!ids || ids.includes(n.id)) n.read = true
  }
  return listNotificationsForUser(userId)
}

export function createChangeRequest(input: {
  targetServiceId: string
  summary: string
  rationale: string
  personId: string
  personName: string
  team?: string
  department?: string
  affectedServiceIds: string[]
}) {
  const target = services[input.targetServiceId]
  const now = new Date().toISOString()
  const impacted: ImpactedFlag[] = input.affectedServiceIds
    .map((id) => services[id])
    .filter(Boolean)
    .map((service) => ({
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

  // Owner’lara: onay gerekli
  const notifiedOwners = new Set<string>()
  for (const row of impacted) {
    if (!row.ownerId || notifiedOwners.has(row.ownerId)) continue
    notifiedOwners.add(row.ownerId)
    pushNotif({
      userId: row.ownerId,
      kind: 'approval_needed',
      requestId: cr.id,
      title: `${cr.id} · onay bekleniyor`,
      body: `${cr.targetServiceName} değişikliği için ${row.serviceName} adına yanıtın gerekiyor.`,
      serviceName: row.serviceName,
      flag: 'unseen',
    })
  }

  // Requester’a: talep oluşturuldu özeti
  pushNotif({
    userId: input.personId,
    kind: 'flag_update',
    requestId: cr.id,
    title: `${cr.id} · talep gönderildi`,
    body: `${impacted.length} etkilenen owner’a onay gitti. Yanıtlar bu inbox’ta görünecek.`,
  })

  return cr
}

export function setFlag(input: {
  requestId: string
  serviceId: string
  flag: FlagStatus
  note?: string
  actorOwnerId: string
}) {
  const cr = store.find((c) => c.id === input.requestId)
  if (!cr) return undefined
  const row = cr.impacted.find((i) => i.serviceId === input.serviceId)
  if (!row || row.ownerId !== input.actorOwnerId) return undefined
  if (input.flag === 'rejected' && !input.note?.trim()) {
    throw new Error('Red gerekçesi zorunlu')
  }
  const prev = row.flag
  row.flag = input.flag
  row.note = input.note?.trim() || undefined
  cr.updatedAt = new Date().toISOString()

  const actor = services[input.serviceId]?.owner?.name ?? input.actorOwnerId
  const msg = FLAG_MSG[input.flag]

  // Talep sahibine her flag değişiminde bildirim (kendi satırı olsa bile)
  pushNotif({
    userId: cr.requestedBy.personId,
    kind: input.flag === 'rejected' ? 'approval_blocked' : 'flag_update',
    requestId: cr.id,
    title: `${cr.id} · ${row.serviceName} ${msg}`,
    body:
      input.flag === 'rejected'
        ? `${actor}: reddetti.${row.note ? ` Gerekçe: ${row.note}` : ''}`
        : input.flag === 'hold_editing'
          ? `${actor}: düzenleme yapıyor / bekletti.`
          : input.flag === 'accepted'
            ? `${actor}: kabul etti.`
            : `${actor}: durum güncellendi (${prev} → ${input.flag}).`,
    flag: input.flag,
    serviceName: row.serviceName,
  })

  if (isApprovalOpen(cr)) {
    pushNotif({
      userId: cr.requestedBy.personId,
      kind: 'approval_open',
      requestId: cr.id,
      title: `${cr.id} · Onay açık`,
      body: `Tüm etkilenenler kabul etti. ${cr.targetServiceName} değişikliği yapılabilir.`,
    })
  }

  return cr
}
