export type Owner = { id: string; name: string; team?: string; role?: 'lead' | 'member' }
export type Service = {
  id: string
  name: string
  projectId: string
  packageId: string
  owner?: Owner
  affectedCount: number
}
export type ModuleNode = {
  id: string
  kind: 'project' | 'package' | 'service' | 'method'
  name: string
  serviceId?: string
  methodId?: string
  children?: ModuleNode[]
}
export type FlagStatus = 'accepted' | 'rejected' | 'hold_editing' | 'unseen'
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
  /** Aynı formdan açılan task grubu */
  batchId?: string
  targetServiceId: string
  targetServiceName: string
  /** Bu task’ın muhatabı (tek etkilenen servis) */
  assigneeServiceId: string
  assigneeServiceName: string
  assigneeTeam?: string
  kind: 'change' | 'new_service'
  /** new_service: henüz katalogda olmayan ad */
  proposedServiceName?: string
  proposedProjectId?: string
  proposedPackageId?: string
  summary: string
  rationale: string
  /** Genel sekme — serbest açıklama */
  description?: string
  /** Servis etkisi sekmesi (mock metin) */
  serviceImpact?: string
  /** Veri etkisi sekmesi (mock metin) */
  dataImpact?: string
  /** new_service: çağıracağı servisler (bağımlılık beyanı; onaycı değil) */
  dependsOnServiceIds?: string[]
  dependsOnServiceNames?: string[]
  requestedBy: {
    personId: string
    personName: string
    team?: string
    department?: string
  }
  /** Her task’ta tek satır (assignee) */
  impacted: ImpactedFlag[]
  createdAt: string
  updatedAt: string
}

export const owners: Record<string, Owner> = {
  o1: { id: 'o1', name: 'Ayşe Yılmaz', team: 'Payments', role: 'lead' },
  o1m: { id: 'o1m', name: 'Burak Çelik', team: 'Payments', role: 'member' },
  o2: { id: 'o2', name: 'Can Demir', team: 'Orders', role: 'lead' },
  o2m: { id: 'o2m', name: 'Deniz Kaya', team: 'Orders', role: 'member' },
  o3: { id: 'o3', name: 'Elif Kara', team: 'Identity', role: 'lead' },
  o4: { id: 'o4', name: 'Mert Şahin', team: 'Notifications', role: 'lead' },
  o5: { id: 'o5', name: 'Zeynep Ak', team: 'Platform', role: 'lead' },
}

/** serviceId → etkilenen servisler (değişince) */
export const affectsEdges: Record<string, string[]> = {
  'svc-payment': ['svc-checkout', 'svc-billing', 'svc-refund', 'svc-report'],
  'svc-checkout': ['svc-storefront', 'svc-mobile-bff'],
  'svc-billing': ['svc-finance-batch', 'svc-report'],
  // Refund zinciri: 3 katmana kadar demo
  'svc-refund': ['svc-support-desk', 'svc-notify'],
  'svc-support-desk': ['svc-customer-care'],
  'svc-customer-care': ['svc-ticket-analytics'],
  'svc-ticket-analytics': [],
  'svc-identity': ['svc-payment', 'svc-checkout', 'svc-storefront', 'svc-mobile-bff'],
  'svc-notify': ['svc-checkout', 'svc-refund', 'svc-support-desk'],
  'svc-storefront': [],
  'svc-mobile-bff': [],
  // Billing→Report→FinanceBatch: haritada FinanceBatch 2. katman (en uzun yol)
  'svc-report': ['svc-finance-batch'],
  'svc-finance-batch': [],
}

const serviceDefs: Omit<Service, 'affectedCount'>[] = [
  { id: 'svc-payment', name: 'PaymentService', projectId: 'proj-commerce', packageId: 'pkg-payments', owner: owners.o1 },
  { id: 'svc-checkout', name: 'CheckoutService', projectId: 'proj-commerce', packageId: 'pkg-orders', owner: owners.o2 },
  { id: 'svc-billing', name: 'BillingService', projectId: 'proj-commerce', packageId: 'pkg-payments', owner: owners.o1 },
  { id: 'svc-refund', name: 'RefundService', projectId: 'proj-commerce', packageId: 'pkg-payments', owner: owners.o1 },
  { id: 'svc-identity', name: 'IdentityService', projectId: 'proj-platform', packageId: 'pkg-identity', owner: owners.o3 },
  { id: 'svc-notify', name: 'NotificationService', projectId: 'proj-platform', packageId: 'pkg-notify', owner: owners.o4 },
  { id: 'svc-storefront', name: 'StorefrontApi', projectId: 'proj-commerce', packageId: 'pkg-orders', owner: owners.o2 },
  { id: 'svc-mobile-bff', name: 'MobileBff', projectId: 'proj-commerce', packageId: 'pkg-orders', owner: owners.o2 },
  { id: 'svc-report', name: 'ReportingService', projectId: 'proj-data', packageId: 'pkg-reporting', owner: owners.o5 },
  { id: 'svc-finance-batch', name: 'FinanceBatchJob', projectId: 'proj-data', packageId: 'pkg-reporting', owner: owners.o5 },
  { id: 'svc-support-desk', name: 'SupportDeskService', projectId: 'proj-platform', packageId: 'pkg-notify', owner: owners.o4 },
  { id: 'svc-customer-care', name: 'CustomerCareService', projectId: 'proj-platform', packageId: 'pkg-notify', owner: owners.o4 },
  { id: 'svc-ticket-analytics', name: 'TicketAnalyticsService', projectId: 'proj-data', packageId: 'pkg-reporting', owner: owners.o5 },
]

export const services: Record<string, Service> = Object.fromEntries(
  serviceDefs.map((s) => [s.id, { ...s, affectedCount: affectsEdges[s.id]?.length ?? 0 }]),
)

/** Değişince etkilenenler = bu servisi çağıranlar (downstream / tüketiciler) */
export function getDownstreamIds(serviceId: string): string[] {
  return affectsEdges[serviceId] ?? []
}

/**
 * Bu servisin çağırdıkları (upstream / bağımlılıklar).
 * affectsEdges[X] ⊇ serviceId ⇒ service, X’i çağırır.
 */
export function getUpstreamIds(serviceId: string): string[] {
  return Object.entries(affectsEdges)
    .filter(([, tos]) => tos.includes(serviceId))
    .map(([fromId]) => fromId)
}

export const moduleTree: ModuleNode[] = [
  {
    id: 'proj-commerce',
    kind: 'project',
    name: 'commerce',
    children: [
      {
        id: 'pkg-payments',
        kind: 'package',
        name: 'com.example.payments',
        children: [
          { id: 'node-payment', kind: 'service', name: 'PaymentService', serviceId: 'svc-payment' },
          { id: 'node-billing', kind: 'service', name: 'BillingService', serviceId: 'svc-billing' },
          { id: 'node-refund', kind: 'service', name: 'RefundService', serviceId: 'svc-refund' },
        ],
      },
      {
        id: 'pkg-orders',
        kind: 'package',
        name: 'com.example.orders',
        children: [
          { id: 'node-checkout', kind: 'service', name: 'CheckoutService', serviceId: 'svc-checkout' },
          { id: 'node-storefront', kind: 'service', name: 'StorefrontApi', serviceId: 'svc-storefront' },
          { id: 'node-mobile', kind: 'service', name: 'MobileBff', serviceId: 'svc-mobile-bff' },
        ],
      },
    ],
  },
  {
    id: 'proj-platform',
    kind: 'project',
    name: 'platform',
    children: [
      {
        id: 'pkg-identity',
        kind: 'package',
        name: 'com.example.identity',
        children: [
          { id: 'node-identity', kind: 'service', name: 'IdentityService', serviceId: 'svc-identity' },
        ],
      },
      {
        id: 'pkg-notify',
        kind: 'package',
        name: 'com.example.notify',
        children: [
          { id: 'node-notify', kind: 'service', name: 'NotificationService', serviceId: 'svc-notify' },
          { id: 'node-support', kind: 'service', name: 'SupportDeskService', serviceId: 'svc-support-desk' },
          { id: 'node-care', kind: 'service', name: 'CustomerCareService', serviceId: 'svc-customer-care' },
        ],
      },
    ],
  },
  {
    id: 'proj-data',
    kind: 'project',
    name: 'data',
    children: [
      {
        id: 'pkg-reporting',
        kind: 'package',
        name: 'com.example.reporting',
        children: [
          { id: 'node-report', kind: 'service', name: 'ReportingService', serviceId: 'svc-report' },
          { id: 'node-finance', kind: 'service', name: 'FinanceBatchJob', serviceId: 'svc-finance-batch' },
          { id: 'node-ticket', kind: 'service', name: 'TicketAnalyticsService', serviceId: 'svc-ticket-analytics' },
        ],
      },
    ],
  },
]

export const SESSION_USERS = [
  owners.o1,
  owners.o1m,
  owners.o2,
  owners.o2m,
  owners.o3,
  owners.o4,
  owners.o5,
]
