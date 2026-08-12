export type Owner = {
  id: string
  name: string
  team?: string
}

export type Service = {
  id: string
  name: string
  projectId: string
  packageId: string
  owner?: Owner
  affectedCount: number
}

export type AffectedService = {
  service: Service
  /** Görünüm hop’u (1 = doğrudan). Onay listesi yalnız hop === 1 kullanır. */
  hop?: number
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
  targetServiceId: string
  targetServiceName: string
  kind: 'change' | 'new_service'
  summary: string
  rationale: string
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
  read: boolean
  createdAt: string
}

export type ModuleNode = {
  id: string
  kind: 'project' | 'package' | 'service'
  name: string
  serviceId?: string
  children?: ModuleNode[]
}

export type ViewMode = 'simple' | 'advanced'
