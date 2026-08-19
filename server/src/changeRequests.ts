/**
 * Değişiklik talebi + onay bayrakları + inbox (bellekte mock store).
 *
 * Akış özeti:
 * 1) Requester talep açar → her etkilenen servis için ayrı task (batchId ile gruplanabilir)
 * 2) Etkilenen owner flag atar: unseen → accepted | rejected | hold_editing
 * 3) Hepsi accepted → onay açık (isApprovalOpen)
 *
 * new_service: bağımlılık beyanı onaycı listesi değildir; paket ekip lideri onaylar.
 */
import type { ChangeRequest, FlagStatus, ImpactedFlag } from './data.js'
import { SESSION_USERS, services } from './data.js'

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
  relatedTasks?: { id: string; serviceName: string }[]
  read: boolean
  createdAt: string
}

const FLAG_MSG: Record<FlagStatus, string> = {
  accepted: 'kabul edildi',
  rejected: 'reddedildi',
  hold_editing: 'düzenleniyor (bekletildi)',
  unseen: 'yanıt bekliyor',
}

let seq = 546
let batchSeq = 1
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
  const svc = services[serviceId]
  return listChangeRequests().filter((c) => {
    if (c.targetServiceId === serviceId || c.assigneeServiceId === serviceId) return true
    // Yeni servis talebi: aynı paket bağlamında görünsün
    if (
      c.kind === 'new_service' &&
      svc &&
      c.proposedPackageId &&
      c.proposedPackageId === svc.packageId
    ) {
      return true
    }
    return false
  })
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

/**
 * change: her etkilenen servis için ayrı task (onay = o servisin owner’ı).
 * new_service: bağımlılık beyanı ayrı; onay = ekip lideri (çağrılan servis owner’ı değil).
 */
export function createChangeRequest(input: {
  kind?: 'change' | 'new_service'
  targetServiceId?: string
  proposedServiceName?: string
  proposedProjectId?: string
  proposedPackageId?: string
  summary: string
  rationale: string
  description?: string
  /** change: kullanıcı notu; yoksa otomatik metin */
  serviceImpact?: string
  dataImpact?: string
  personId: string
  personName: string
  team?: string
  department?: string
  /** change: etkilenenler · new_service: çağıracağı servisler (depends-on) */
  affectedServiceIds: string[]
}): ChangeRequest[] {
  const kind = input.kind ?? 'change'
  const now = new Date().toISOString()

  if (kind === 'new_service') {
    return createNewServiceRequest(input, now)
  }

  const batchId =
    input.affectedServiceIds.length > 1
      ? `B-${String(batchSeq++).padStart(3, '0')}`
      : undefined

  if (!input.targetServiceId) throw new Error('target_required')
  const target = services[input.targetServiceId]
  const targetServiceId = input.targetServiceId
  const targetServiceName = target?.name ?? input.targetServiceId

  const created: ChangeRequest[] = []

  for (const affectedId of input.affectedServiceIds) {
    const assignee = services[affectedId]
    if (!assignee) continue

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
      targetServiceId,
      targetServiceName,
      assigneeServiceId: assignee.id,
      assigneeServiceName: assignee.name,
      assigneeTeam: assignee.owner?.team,
      kind: 'change',
      summary: input.summary.trim(),
      rationale: input.rationale.trim(),
      description:
        input.description?.trim() ||
        `${input.summary.trim()}\n\n${input.rationale.trim()}`,
      serviceImpact:
        input.serviceImpact?.trim() ||
        `${targetServiceName} değişikliği, ${assignee.name} servisinin runtime / API sözleşmesini etkileyebilir.`,
      dataImpact:
        input.dataImpact?.trim() ||
        `${assignee.name} üzerinden okunan/yazılan veri sözleşmeleri gözden geçirilmeli. (Mock veri etkisi.)`,
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

    if (row.ownerId) {
      pushNotif({
        userId: row.ownerId,
        kind: 'approval_needed',
        requestId: cr.id,
        title: `${cr.id} · ${assignee.name} onay bekleniyor`,
        body: `${targetServiceName} → ${assignee.name} için yanıt gerekiyor.`,
        serviceName: assignee.name,
        flag: 'unseen',
      })
    }
  }

  if (created.length > 0) {
    const relatedTasks = created.map((c) => ({
      id: c.id,
      serviceName: c.assigneeServiceName,
    }))
    pushNotif({
      userId: input.personId,
      kind: 'flag_update',
      requestId: created[0]!.id,
      title: batchId
        ? `${created.length} task açıldı · ${batchId}`
        : `${created.length} task açıldı`,
      body: `${targetServiceName} değişikliği · ${relatedTasks.map((t) => `${t.id} (${t.serviceName})`).join(' · ')}`,
      batchId,
      relatedTasks,
    })
  }

  return created
}

function createNewServiceRequest(
  input: {
    proposedServiceName?: string
    proposedProjectId?: string
    proposedPackageId?: string
    summary: string
    rationale: string
    description?: string
    personId: string
    personName: string
    team?: string
    department?: string
    affectedServiceIds: string[]
  },
  now: string,
): ChangeRequest[] {
  const name = input.proposedServiceName?.trim()
  if (!name) throw new Error('proposed_name_required')

  const requesterTeam =
    input.team?.trim() ||
    SESSION_USERS.find((u) => u.id === input.personId)?.team
  const lead =
    SESSION_USERS.find((u) => u.team === requesterTeam && u.role === 'lead') ??
    SESSION_USERS.find((u) => u.id === input.personId)

  if (!lead) throw new Error('no_team_lead')

  const dependsOnServiceIds = input.affectedServiceIds.filter((id) => services[id])
  const dependsOnServiceNames = dependsOnServiceIds.map((id) => services[id]!.name)
  const dependsLabel =
    dependsOnServiceNames.length > 0
      ? dependsOnServiceNames.join(', ')
      : 'henüz seçilmedi'

  const targetServiceId = `proposed:${name.toLowerCase().replace(/\s+/g, '-')}`

  const row: ImpactedFlag = {
    serviceId: targetServiceId,
    serviceName: name,
    ownerId: lead.id,
    ownerName: lead.name,
    team: lead.team,
    flag: 'unseen',
  }

  const cr: ChangeRequest = {
    id: `T-${seq++}`,
    targetServiceId,
    targetServiceName: name,
    assigneeServiceId: targetServiceId,
    assigneeServiceName: name,
    assigneeTeam: lead.team,
    kind: 'new_service',
    proposedServiceName: name,
    proposedProjectId: input.proposedProjectId,
    proposedPackageId: input.proposedPackageId,
    dependsOnServiceIds,
    dependsOnServiceNames,
    summary: input.summary.trim(),
    rationale: input.rationale.trim(),
    description:
      input.description?.trim() ||
      `${input.summary.trim()}\n\n${input.rationale.trim()}`,
    serviceImpact: `Yeni servis “${name}” onayı bekliyor. Çağıracağı servisler (bilgi): ${dependsLabel}.`,
    dataImpact: `Yeni servis veri sözleşmeleri gözden geçirilmeli. Bağımlı servisler: ${dependsLabel}. (Mock)`,
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

  pushNotif({
    userId: lead.id,
    kind: 'approval_needed',
    requestId: cr.id,
    title: `${cr.id} · ${name} · Yeni Servis onayı`,
    body: `“${name}” için onay gerekiyor. Çağıracakları: ${dependsLabel}.`,
    serviceName: name,
    flag: 'unseen',
  })

  if (lead.id !== input.personId) {
    pushNotif({
      userId: input.personId,
      kind: 'flag_update',
      requestId: cr.id,
      title: `Yeni Servis Talebi · ${cr.id}`,
      body: `“${name}” için onay bekleniyor.`,
    })
  }

  return [cr]
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

  const msg = FLAG_MSG[input.flag]
  const svcLabel = row.serviceName

  pushNotif({
    userId: cr.requestedBy.personId,
    kind: input.flag === 'rejected' ? 'approval_blocked' : 'flag_update',
    requestId: cr.id,
    title: `${cr.id} · ${svcLabel} ${msg}`,
    body:
      input.flag === 'rejected'
        ? `${svcLabel} reddetti.${row.note ? ` Gerekçe: ${row.note}` : ''}`
        : input.flag === 'hold_editing'
          ? `${svcLabel} düzenleme / bekletme durumunda.`
          : input.flag === 'accepted'
            ? `${svcLabel} kabul etti.`
            : `${svcLabel} durumu güncellendi (${prev} → ${input.flag}).`,
    flag: input.flag,
    serviceName: row.serviceName,
  })

  if (isApprovalOpen(cr)) {
    pushNotif({
      userId: cr.requestedBy.personId,
      kind: 'approval_open',
      requestId: cr.id,
      title: `${cr.id} · Onay açık`,
      body: `${cr.assigneeServiceName} kabul etti. Bu task için kapı açık.`,
    })
  }

  return cr
}
