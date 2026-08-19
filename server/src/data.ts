/**
 * Mock servis kataloğu (statik).
 *
 * affectsEdges[callee] = [caller1, caller2, ...]
 *   → “callee değişince etkilenenler” = onu çağıran servisler (downstream).
 *   Onay listesi yalnız bu 1. katmanı kullanır.
 *
 * Yön özeti:
 * - Downstream (affected) = beni çağıranlar
 * - Upstream              = benim çağırdıklarım
 */
export type Owner = { id: string; name: string; team?: string; role?: 'lead' | 'member' }
export type Service = {
  id: string
  name: string
  projectId: string
  packageId: string
  owner?: Owner
  affectedCount: number
  dependsOnCount: number
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
  'svc-payment': ['svc-checkout', 'svc-billing', 'svc-refund', 'svc-report', 'svc-finance-batch'],
  'svc-checkout': ['svc-billing', 'svc-storefront', 'svc-mobile-bff'],
  'svc-billing': ['svc-checkout', 'svc-refund', 'svc-report', 'svc-finance-batch'],
  'svc-refund': ['svc-billing', 'svc-notify', 'svc-support-desk'],
  'svc-storefront': [],
  'svc-mobile-bff': [],
  'svc-identity': ['svc-payment', 'svc-checkout', 'svc-billing', 'svc-storefront', 'svc-mobile-bff', 'svc-support-desk', 'svc-report'],
  'svc-notify': ['svc-payment', 'svc-checkout', 'svc-billing', 'svc-refund', 'svc-storefront', 'svc-mobile-bff', 'svc-support-desk', 'svc-customer-care'],
  'svc-support-desk': ['svc-refund', 'svc-customer-care'],
  'svc-customer-care': ['svc-ticket-analytics'],
  'svc-report': ['svc-refund', 'svc-storefront', 'svc-finance-batch', 'svc-ticket-analytics'],
  'svc-finance-batch': [],
  'svc-ticket-analytics': ['svc-report'],
}

function dependsOnIds(serviceId: string): string[] {
  return Object.entries(affectsEdges)
    .filter(([, callers]) => callers.includes(serviceId))
    .map(([calleeId]) => calleeId)
}

const serviceDefs: Omit<Service, 'affectedCount' | 'dependsOnCount'>[] = [
  { id: 'svc-payment', name: 'core_realtime_card_payment_authorization_settlement_gateway', projectId: 'proj-commerce', packageId: 'pkg-payments', owner: owners.o1 },
  { id: 'svc-checkout', name: 'retail_checkout_order_cart_orchestration_workflow_engine', projectId: 'proj-commerce', packageId: 'pkg-orders', owner: owners.o2 },
  { id: 'svc-billing', name: 'customer_billing_invoice_tax_reconciliation_engine', projectId: 'proj-commerce', packageId: 'pkg-payments', owner: owners.o1 },
  { id: 'svc-refund', name: 'customer_refund_chargeback_reversal_settlement_processor', projectId: 'proj-commerce', packageId: 'pkg-payments', owner: owners.o1 },
  { id: 'svc-identity', name: 'enterprise_identity_session_directory_access_control', projectId: 'proj-platform', packageId: 'pkg-identity', owner: owners.o3 },
  { id: 'svc-notify', name: 'outbound_multichannel_notification_delivery_router', projectId: 'proj-platform', packageId: 'pkg-notify', owner: owners.o4 },
  { id: 'svc-storefront', name: 'digital_storefront_catalog_checkout_experience_api', projectId: 'proj-commerce', packageId: 'pkg-orders', owner: owners.o2 },
  { id: 'svc-mobile-bff', name: 'mobile_channel_backend_for_frontend_gateway_adapter', projectId: 'proj-commerce', packageId: 'pkg-orders', owner: owners.o2 },
  { id: 'svc-report', name: 'enterprise_operational_reporting_analytics_pipeline', projectId: 'proj-data', packageId: 'pkg-reporting', owner: owners.o5 },
  { id: 'svc-finance-batch', name: 'overnight_general_ledger_finance_batch_import_job_runner', projectId: 'proj-data', packageId: 'pkg-reporting', owner: owners.o5 },
  { id: 'svc-support-desk', name: 'customer_support_desk_case_routing_orchestrator', projectId: 'proj-platform', packageId: 'pkg-notify', owner: owners.o4 },
  { id: 'svc-customer-care', name: 'customer_care_interaction_history_assistance_portal', projectId: 'proj-platform', packageId: 'pkg-notify', owner: owners.o4 },
  { id: 'svc-ticket-analytics', name: 'support_ticket_analytics_insight_warehouse_service', projectId: 'proj-data', packageId: 'pkg-reporting', owner: owners.o5 },
]

export const services: Record<string, Service> = Object.fromEntries(
  serviceDefs.map((s) => [
    s.id,
    {
      ...s,
      affectedCount: affectsEdges[s.id]?.length ?? 0,
      dependsOnCount: dependsOnIds(s.id).length,
    },
  ]),
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
  return dependsOnIds(serviceId)
}

export const moduleTree: ModuleNode[] = [
  {
    id: 'proj-commerce',
    kind: 'project',
    name: 'HAZINE',
    children: [
      {
        id: 'pkg-payments',
        kind: 'package',
        name: 'com.hazine.payments',
        children: [
          { id: 'node-payment', kind: 'service', name: 'core_realtime_card_payment_authorization_settlement_gateway', serviceId: 'svc-payment' },
          { id: 'node-billing', kind: 'service', name: 'customer_billing_invoice_tax_reconciliation_engine', serviceId: 'svc-billing' },
          { id: 'node-refund', kind: 'service', name: 'customer_refund_chargeback_reversal_settlement_processor', serviceId: 'svc-refund' },
        ],
      },
      {
        id: 'pkg-orders',
        kind: 'package',
        name: 'com.hazine.orders',
        children: [
          { id: 'node-checkout', kind: 'service', name: 'retail_checkout_order_cart_orchestration_workflow_engine', serviceId: 'svc-checkout' },
          { id: 'node-storefront', kind: 'service', name: 'digital_storefront_catalog_checkout_experience_api', serviceId: 'svc-storefront' },
          { id: 'node-mobile', kind: 'service', name: 'mobile_channel_backend_for_frontend_gateway_adapter', serviceId: 'svc-mobile-bff' },
        ],
      },
    ],
  },
  {
    id: 'proj-platform',
    kind: 'project',
    name: 'MEVDUAT',
    children: [
      {
        id: 'pkg-identity',
        kind: 'package',
        name: 'com.mevduat.identity',
        children: [
          { id: 'node-identity', kind: 'service', name: 'enterprise_identity_session_directory_access_control', serviceId: 'svc-identity' },
        ],
      },
      {
        id: 'pkg-notify',
        kind: 'package',
        name: 'com.mevduat.notify',
        children: [
          { id: 'node-notify', kind: 'service', name: 'outbound_multichannel_notification_delivery_router', serviceId: 'svc-notify' },
          { id: 'node-support', kind: 'service', name: 'customer_support_desk_case_routing_orchestrator', serviceId: 'svc-support-desk' },
          { id: 'node-care', kind: 'service', name: 'customer_care_interaction_history_assistance_portal', serviceId: 'svc-customer-care' },
        ],
      },
    ],
  },
  {
    id: 'proj-data',
    kind: 'project',
    name: 'KREDI',
    children: [
      {
        id: 'pkg-reporting',
        kind: 'package',
        name: 'com.kredi.reporting',
        children: [
          { id: 'node-report', kind: 'service', name: 'enterprise_operational_reporting_analytics_pipeline', serviceId: 'svc-report' },
          { id: 'node-finance', kind: 'service', name: 'overnight_general_ledger_finance_batch_import_job_runner', serviceId: 'svc-finance-batch' },
          { id: 'node-ticket', kind: 'service', name: 'support_ticket_analytics_insight_warehouse_service', serviceId: 'svc-ticket-analytics' },
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
