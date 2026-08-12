import type { ModuleNode, Owner, Service } from '../types'

export const owners: Record<string, Owner> = {
  o1: { id: 'o1', name: 'Ayşe Yılmaz', team: 'Payments' },
  o2: { id: 'o2', name: 'Can Demir', team: 'Orders' },
  o3: { id: 'o3', name: 'Elif Kara', team: 'Identity' },
  o4: { id: 'o4', name: 'Mert Şahin', team: 'Notifications' },
  o5: { id: 'o5', name: 'Zeynep Ak', team: 'Platform' },
}

/** serviceId → list of serviceIds affected if it changes (inbound consumers) */
export const affectsEdges: Record<string, string[]> = {
  'svc-payment': ['svc-checkout', 'svc-billing', 'svc-refund', 'svc-report'],
  'svc-checkout': ['svc-storefront', 'svc-mobile-bff'],
  'svc-billing': ['svc-finance-batch', 'svc-report'],
  'svc-refund': ['svc-support-desk'],
  'svc-identity': ['svc-payment', 'svc-checkout', 'svc-storefront', 'svc-mobile-bff'],
  'svc-notify': ['svc-checkout', 'svc-refund', 'svc-support-desk'],
  'svc-storefront': [],
  'svc-mobile-bff': [],
  'svc-report': ['svc-finance-batch'],
  'svc-finance-batch': [],
  'svc-support-desk': [],
}

const serviceDefs: Omit<Service, 'affectedCount'>[] = [
  {
    id: 'svc-payment',
    name: 'PaymentService',
    projectId: 'proj-commerce',
    packageId: 'pkg-payments',
    owner: owners.o1,
  },
  {
    id: 'svc-checkout',
    name: 'CheckoutService',
    projectId: 'proj-commerce',
    packageId: 'pkg-orders',
    owner: owners.o2,
  },
  {
    id: 'svc-billing',
    name: 'BillingService',
    projectId: 'proj-commerce',
    packageId: 'pkg-payments',
    owner: owners.o1,
  },
  {
    id: 'svc-refund',
    name: 'RefundService',
    projectId: 'proj-commerce',
    packageId: 'pkg-payments',
    owner: owners.o1,
  },
  {
    id: 'svc-identity',
    name: 'IdentityService',
    projectId: 'proj-platform',
    packageId: 'pkg-identity',
    owner: owners.o3,
  },
  {
    id: 'svc-notify',
    name: 'NotificationService',
    projectId: 'proj-platform',
    packageId: 'pkg-notify',
    owner: owners.o4,
  },
  {
    id: 'svc-storefront',
    name: 'StorefrontApi',
    projectId: 'proj-commerce',
    packageId: 'pkg-orders',
    owner: owners.o2,
  },
  {
    id: 'svc-mobile-bff',
    name: 'MobileBff',
    projectId: 'proj-commerce',
    packageId: 'pkg-orders',
    owner: owners.o2,
  },
  {
    id: 'svc-report',
    name: 'ReportingService',
    projectId: 'proj-data',
    packageId: 'pkg-reporting',
    owner: owners.o5,
  },
  {
    id: 'svc-finance-batch',
    name: 'FinanceBatchJob',
    projectId: 'proj-data',
    packageId: 'pkg-reporting',
    owner: owners.o5,
  },
  {
    id: 'svc-support-desk',
    name: 'SupportDeskService',
    projectId: 'proj-platform',
    packageId: 'pkg-notify',
    owner: owners.o4,
  },
]

export const services: Record<string, Service> = Object.fromEntries(
  serviceDefs.map((s) => [
    s.id,
    { ...s, affectedCount: affectsEdges[s.id]?.length ?? 0 },
  ]),
)

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
        ],
      },
    ],
  },
]
