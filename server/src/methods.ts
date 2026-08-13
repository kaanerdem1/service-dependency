/**
 * Mock metod kataloğu + call-graph (Java/framework hissi).
 * Tutarlılık: çapraz servis çağrı ⇒ callee değişince caller affectsEdges’te olmalı.
 */
import { affectsEdges, services } from './data.js'

export type MethodDef = {
  id: string
  serviceId: string
  className: string
  name: string
  /** örn. (PaymentRequest): PaymentResult */
  signature: string
}

/** callerMethodId çağırır → calleeMethodId */
export type CallEdge = { callerId: string; calleeId: string }

function m(
  serviceId: string,
  className: string,
  name: string,
  signature: string,
): MethodDef {
  const id = `m-${serviceId.replace(/^svc-/, '')}-${className}-${name}`
  return { id, serviceId, className, name, signature }
}

const pay = 'svc-payment'
const chk = 'svc-checkout'
const bil = 'svc-billing'
const ref = 'svc-refund'
const idn = 'svc-identity'
const ntf = 'svc-notify'
const sf = 'svc-storefront'
const bff = 'svc-mobile-bff'
const rpt = 'svc-report'
const fin = 'svc-finance-batch'
const sup = 'svc-support-desk'
const care = 'svc-customer-care'
const tix = 'svc-ticket-analytics'

export const methods: MethodDef[] = [
  // —— PaymentService ——
  m(pay, 'PaymentFacade', 'charge', '(ChargeCmd): ChargeResult'),
  m(pay, 'PaymentFacade', 'authorize', '(AuthCmd): AuthResult'),
  m(pay, 'PaymentFacade', 'capture', '(CaptureCmd): CaptureResult'),
  m(pay, 'PaymentFacade', 'voidAuth', '(VoidCmd): void'),
  m(pay, 'CardProcessor', 'tokenize', '(CardDto): Token'),
  m(pay, 'CardProcessor', 'chargeCard', '(Token, Money): ChargeResult'),
  m(pay, 'CardProcessor', 'validateBin', '(String): boolean'),
  m(pay, 'WalletProcessor', 'chargeWallet', '(WalletId, Money): ChargeResult'),
  m(pay, 'WalletProcessor', 'reserve', '(WalletId, Money): Reservation'),
  m(pay, 'FraudGate', 'score', '(ChargeCmd): FraudScore'),
  m(pay, 'FraudGate', 'blockIfNeeded', '(FraudScore): void'),
  m(pay, 'LedgerWriter', 'postEntry', '(LedgerEntry): void'),
  m(pay, 'LedgerWriter', 'reverseEntry', '(EntryId): void'),
  m(pay, 'PaymentQuery', 'findById', '(PaymentId): Payment'),
  m(pay, 'PaymentQuery', 'listByOrder', '(OrderId): List<Payment>'),
  m(pay, 'IdempotencyStore', 'begin', '(Key): boolean'),
  m(pay, 'IdempotencyStore', 'complete', '(Key, Result): void'),

  // —— CheckoutService ——
  m(chk, 'CheckoutOrchestrator', 'placeOrder', '(CheckoutCmd): Order'),
  m(chk, 'CheckoutOrchestrator', 'preview', '(CheckoutCmd): Preview'),
  m(chk, 'CheckoutOrchestrator', 'cancelDraft', '(DraftId): void'),
  m(chk, 'CartService', 'addItem', '(CartId, Sku): Cart'),
  m(chk, 'CartService', 'removeItem', '(CartId, Sku): Cart'),
  m(chk, 'CartService', 'reprice', '(CartId): Cart'),
  m(chk, 'PaymentClient', 'chargeOrder', '(Order): ChargeResult'),
  m(chk, 'PaymentClient', 'authorizeOrder', '(Order): AuthResult'),
  m(chk, 'InventoryClient', 'reserveStock', '(Order): Reservation'),
  m(chk, 'InventoryClient', 'releaseStock', '(Reservation): void'),
  m(chk, 'IdentityClient', 'resolveUser', '(Session): User'),
  m(chk, 'NotifyClient', 'orderPlaced', '(Order): void'),
  m(chk, 'CheckoutQuery', 'getOrder', '(OrderId): Order'),
  m(chk, 'CheckoutQuery', 'listOpen', '(UserId): List<Order>'),

  // —— BillingService ——
  m(bil, 'InvoiceService', 'createInvoice', '(Order): Invoice'),
  m(bil, 'InvoiceService', 'voidInvoice', '(InvoiceId): void'),
  m(bil, 'InvoiceService', 'reissue', '(InvoiceId): Invoice'),
  m(bil, 'BillingScheduler', 'runDaily', '(): BatchResult'),
  m(bil, 'BillingScheduler', 'retryFailed', '(): BatchResult'),
  m(bil, 'PaymentReconciler', 'reconcileCharge', '(ChargeId): void'),
  m(bil, 'PaymentReconciler', 'markPaid', '(InvoiceId): void'),
  m(bil, 'TaxCalculator', 'compute', '(InvoiceDraft): TaxLines'),
  m(bil, 'TaxCalculator', 'validateVat', '(VatId): boolean'),
  m(bil, 'BillingQuery', 'getInvoice', '(InvoiceId): Invoice'),
  m(bil, 'BillingQuery', 'listUnpaid', '(AccountId): List<Invoice>'),

  // —— RefundService ——
  m(ref, 'RefundFacade', 'requestRefund', '(RefundCmd): Refund'),
  m(ref, 'RefundFacade', 'approveRefund', '(RefundId): Refund'),
  m(ref, 'RefundFacade', 'rejectRefund', '(RefundId, Reason): void'),
  m(ref, 'RefundExecutor', 'execute', '(Refund): RefundResult'),
  m(ref, 'RefundExecutor', 'partialRefund', '(Refund, Money): RefundResult'),
  m(ref, 'PaymentClient', 'reverseCharge', '(ChargeId): void'),
  m(ref, 'PaymentClient', 'creditWallet', '(WalletId, Money): void'),
  m(ref, 'NotifyClient', 'refundStatus', '(Refund): void'),
  m(ref, 'RefundQuery', 'findById', '(RefundId): Refund'),
  m(ref, 'RefundQuery', 'listByOrder', '(OrderId): List<Refund>'),
  m(ref, 'PolicyEngine', 'canRefund', '(Order, Money): boolean'),
  m(ref, 'PolicyEngine', 'windowOpen', '(Order): boolean'),

  // —— IdentityService ——
  m(idn, 'AuthService', 'login', '(Creds): Session'),
  m(idn, 'AuthService', 'logout', '(Session): void'),
  m(idn, 'AuthService', 'refresh', '(RefreshToken): Session'),
  m(idn, 'TokenIssuer', 'issue', '(User): Tokens'),
  m(idn, 'TokenIssuer', 'revoke', '(TokenId): void'),
  m(idn, 'UserDirectory', 'findById', '(UserId): User'),
  m(idn, 'UserDirectory', 'findByEmail', '(Email): User'),
  m(idn, 'UserDirectory', 'updateProfile', '(UserId, Patch): User'),
  m(idn, 'SessionStore', 'put', '(Session): void'),
  m(idn, 'SessionStore', 'get', '(SessionId): Session'),
  m(idn, 'MfaService', 'challenge', '(User): Challenge'),
  m(idn, 'MfaService', 'verify', '(Challenge, Code): boolean'),

  // —— NotificationService ——
  m(ntf, 'NotifyFacade', 'send', '(NotifyCmd): void'),
  m(ntf, 'NotifyFacade', 'sendBulk', '(List<NotifyCmd>): BulkResult'),
  m(ntf, 'EmailChannel', 'deliver', '(EmailMsg): void'),
  m(ntf, 'EmailChannel', 'renderTemplate', '(TemplateId, Map): String'),
  m(ntf, 'SmsChannel', 'deliver', '(SmsMsg): void'),
  m(ntf, 'PushChannel', 'deliver', '(PushMsg): void'),
  m(ntf, 'PreferenceStore', 'allows', '(UserId, Channel): boolean'),
  m(ntf, 'PreferenceStore', 'update', '(UserId, Prefs): void'),
  m(ntf, 'NotifyQuery', 'status', '(NotifyId): Status'),
  m(ntf, 'DeadLetter', 'enqueue', '(FailedMsg): void'),
  m(ntf, 'DeadLetter', 'replay', '(DlqId): void'),
  m(ntf, 'RefundHook', 'onRefundEvent', '(RefundEvent): void'),
  m(ntf, 'RefundHook', 'fetchRefund', '(RefundId): Refund'),

  // —— StorefrontApi ——
  m(sf, 'StorefrontController', 'checkout', '(HttpReq): HttpRes'),
  m(sf, 'StorefrontController', 'cart', '(HttpReq): HttpRes'),
  m(sf, 'StorefrontController', 'loginPage', '(HttpReq): HttpRes'),
  m(sf, 'CheckoutGateway', 'place', '(CheckoutCmd): Order'),
  m(sf, 'CheckoutGateway', 'preview', '(CheckoutCmd): Preview'),
  m(sf, 'IdentityGateway', 'currentUser', '(Cookie): User'),
  m(sf, 'CatalogView', 'productPage', '(Sku): ProductVm'),
  m(sf, 'CatalogView', 'search', '(Query): List<ProductVm>'),

  // —— MobileBff ——
  m(bff, 'MobileCheckoutApi', 'placeOrder', '(MobileCheckout): Order'),
  m(bff, 'MobileCheckoutApi', 'preview', '(MobileCheckout): Preview'),
  m(bff, 'MobileAuthApi', 'login', '(MobileCreds): Session'),
  m(bff, 'MobileAuthApi', 'refresh', '(RefreshToken): Session'),
  m(bff, 'CheckoutGateway', 'place', '(CheckoutCmd): Order'),
  m(bff, 'IdentityGateway', 'resolve', '(DeviceSession): User'),
  m(bff, 'MobileCartApi', 'sync', '(DeviceCart): Cart'),
  m(bff, 'MobileCartApi', 'add', '(Sku): Cart'),

  // —— ReportingService ——
  m(rpt, 'ReportFacade', 'paymentSummary', '(Range): Report'),
  m(rpt, 'ReportFacade', 'invoiceAging', '(Range): Report'),
  m(rpt, 'ReportFacade', 'refundVolume', '(Range): Report'),
  m(rpt, 'PaymentIngest', 'pullCharges', '(Range): List<ChargeRow>'),
  m(rpt, 'PaymentIngest', 'normalize', '(ChargeRow): Fact'),
  m(rpt, 'BillingIngest', 'pullInvoices', '(Range): List<InvoiceRow>'),
  m(rpt, 'BillingIngest', 'normalize', '(InvoiceRow): Fact'),
  m(rpt, 'CubeBuilder', 'buildDaily', '(Date): Cube'),
  m(rpt, 'CubeBuilder', 'publish', '(Cube): void'),
  m(rpt, 'ReportQuery', 'get', '(ReportId): Report'),
  m(rpt, 'ReportQuery', 'exportCsv', '(ReportId): Stream'),

  // —— FinanceBatchJob ——
  m(fin, 'FinanceBatch', 'runNightly', '(): BatchResult'),
  m(fin, 'FinanceBatch', 'runCatchup', '(Date): BatchResult'),
  m(fin, 'LedgerImport', 'fromBilling', '(Date): void'),
  m(fin, 'LedgerImport', 'fromReports', '(Date): void'),
  m(fin, 'GlPoster', 'post', '(GlEntry): void'),
  m(fin, 'GlPoster', 'reverse', '(GlEntryId): void'),
  m(fin, 'FinanceQuery', 'trialBalance', '(Date): Balance'),
  m(fin, 'FinanceQuery', 'exceptions', '(): List<Exception>'),

  // —— SupportDeskService ——
  m(sup, 'TicketService', 'openTicket', '(TicketCmd): Ticket'),
  m(sup, 'TicketService', 'closeTicket', '(TicketId): void'),
  m(sup, 'TicketService', 'escalate', '(TicketId): void'),
  m(sup, 'RefundBridge', 'startRefund', '(Ticket): Refund'),
  m(sup, 'RefundBridge', 'status', '(RefundId): Status'),
  m(sup, 'NotifyBridge', 'agentUpdate', '(Ticket): void'),
  m(sup, 'TicketQuery', 'get', '(TicketId): Ticket'),
  m(sup, 'TicketQuery', 'listOpen', '(AgentId): List<Ticket>'),

  // —— CustomerCareService ——
  m(care, 'CareFacade', 'handleCall', '(CallCtx): CareResult'),
  m(care, 'CareFacade', 'handleChat', '(ChatCtx): CareResult'),
  m(care, 'DeskClient', 'openFromCare', '(CareCase): Ticket'),
  m(care, 'DeskClient', 'linkTicket', '(CareCase, TicketId): void'),
  m(care, 'CareQuery', 'history', '(CustomerId): List<CareCase>'),
  m(care, 'CareQuery', 'active', '(AgentId): List<CareCase>'),

  // —— TicketAnalyticsService ——
  m(tix, 'AnalyticsFacade', 'dailyStats', '(Date): Stats'),
  m(tix, 'AnalyticsFacade', 'agentScore', '(AgentId, Range): Score'),
  m(tix, 'CareIngest', 'pullCases', '(Range): List<CaseRow>'),
  m(tix, 'CareIngest', 'normalize', '(CaseRow): Fact'),
  m(tix, 'AggBuilder', 'build', '(Date): Agg'),
  m(tix, 'AggBuilder', 'publish', '(Agg): void'),
  m(tix, 'AnalyticsQuery', 'get', '(StatsId): Stats'),
]

const byId = Object.fromEntries(methods.map((x) => [x.id, x]))

function idOf(serviceId: string, className: string, name: string) {
  return m(serviceId, className, name, '').id
}

/** Call edges: bol iç + çapraz (affectsEdges ile hizalı) */
export const callEdges: CallEdge[] = [
  // Payment iç
  { callerId: idOf(pay, 'PaymentFacade', 'charge'), calleeId: idOf(pay, 'IdempotencyStore', 'begin') },
  { callerId: idOf(pay, 'PaymentFacade', 'charge'), calleeId: idOf(pay, 'FraudGate', 'score') },
  { callerId: idOf(pay, 'PaymentFacade', 'charge'), calleeId: idOf(pay, 'FraudGate', 'blockIfNeeded') },
  { callerId: idOf(pay, 'PaymentFacade', 'charge'), calleeId: idOf(pay, 'CardProcessor', 'chargeCard') },
  { callerId: idOf(pay, 'PaymentFacade', 'charge'), calleeId: idOf(pay, 'WalletProcessor', 'chargeWallet') },
  { callerId: idOf(pay, 'PaymentFacade', 'charge'), calleeId: idOf(pay, 'LedgerWriter', 'postEntry') },
  { callerId: idOf(pay, 'PaymentFacade', 'charge'), calleeId: idOf(pay, 'IdempotencyStore', 'complete') },
  { callerId: idOf(pay, 'PaymentFacade', 'authorize'), calleeId: idOf(pay, 'FraudGate', 'score') },
  { callerId: idOf(pay, 'PaymentFacade', 'authorize'), calleeId: idOf(pay, 'CardProcessor', 'tokenize') },
  { callerId: idOf(pay, 'PaymentFacade', 'capture'), calleeId: idOf(pay, 'LedgerWriter', 'postEntry') },
  { callerId: idOf(pay, 'PaymentFacade', 'voidAuth'), calleeId: idOf(pay, 'LedgerWriter', 'reverseEntry') },
  { callerId: idOf(pay, 'CardProcessor', 'chargeCard'), calleeId: idOf(pay, 'CardProcessor', 'validateBin') },
  { callerId: idOf(pay, 'WalletProcessor', 'chargeWallet'), calleeId: idOf(pay, 'WalletProcessor', 'reserve') },
  { callerId: idOf(pay, 'FraudGate', 'blockIfNeeded'), calleeId: idOf(pay, 'FraudGate', 'score') },
  // Payment → Identity (affectsEdges: identity → payment)
  { callerId: idOf(pay, 'PaymentFacade', 'charge'), calleeId: idOf(idn, 'SessionStore', 'get') },
  { callerId: idOf(pay, 'PaymentFacade', 'authorize'), calleeId: idOf(idn, 'UserDirectory', 'findById') },

  // Checkout → Payment / Identity / Notify + iç
  { callerId: idOf(chk, 'CheckoutOrchestrator', 'placeOrder'), calleeId: idOf(chk, 'CartService', 'reprice') },
  { callerId: idOf(chk, 'CheckoutOrchestrator', 'placeOrder'), calleeId: idOf(chk, 'IdentityClient', 'resolveUser') },
  { callerId: idOf(chk, 'CheckoutOrchestrator', 'placeOrder'), calleeId: idOf(chk, 'InventoryClient', 'reserveStock') },
  { callerId: idOf(chk, 'CheckoutOrchestrator', 'placeOrder'), calleeId: idOf(chk, 'PaymentClient', 'chargeOrder') },
  { callerId: idOf(chk, 'CheckoutOrchestrator', 'placeOrder'), calleeId: idOf(chk, 'NotifyClient', 'orderPlaced') },
  { callerId: idOf(chk, 'CheckoutOrchestrator', 'preview'), calleeId: idOf(chk, 'CartService', 'reprice') },
  { callerId: idOf(chk, 'CheckoutOrchestrator', 'preview'), calleeId: idOf(chk, 'PaymentClient', 'authorizeOrder') },
  { callerId: idOf(chk, 'CheckoutOrchestrator', 'cancelDraft'), calleeId: idOf(chk, 'InventoryClient', 'releaseStock') },
  { callerId: idOf(chk, 'CartService', 'addItem'), calleeId: idOf(chk, 'CartService', 'reprice') },
  { callerId: idOf(chk, 'CartService', 'removeItem'), calleeId: idOf(chk, 'CartService', 'reprice') },
  { callerId: idOf(chk, 'PaymentClient', 'chargeOrder'), calleeId: idOf(pay, 'PaymentFacade', 'charge') },
  { callerId: idOf(chk, 'PaymentClient', 'authorizeOrder'), calleeId: idOf(pay, 'PaymentFacade', 'authorize') },
  { callerId: idOf(chk, 'IdentityClient', 'resolveUser'), calleeId: idOf(idn, 'SessionStore', 'get') },
  { callerId: idOf(chk, 'IdentityClient', 'resolveUser'), calleeId: idOf(idn, 'UserDirectory', 'findById') },
  { callerId: idOf(chk, 'NotifyClient', 'orderPlaced'), calleeId: idOf(ntf, 'NotifyFacade', 'send') },

  // Billing → Payment + iç
  { callerId: idOf(bil, 'InvoiceService', 'createInvoice'), calleeId: idOf(bil, 'TaxCalculator', 'compute') },
  { callerId: idOf(bil, 'InvoiceService', 'createInvoice'), calleeId: idOf(bil, 'TaxCalculator', 'validateVat') },
  { callerId: idOf(bil, 'InvoiceService', 'reissue'), calleeId: idOf(bil, 'InvoiceService', 'voidInvoice') },
  { callerId: idOf(bil, 'InvoiceService', 'reissue'), calleeId: idOf(bil, 'InvoiceService', 'createInvoice') },
  { callerId: idOf(bil, 'BillingScheduler', 'runDaily'), calleeId: idOf(bil, 'BillingQuery', 'listUnpaid') },
  { callerId: idOf(bil, 'BillingScheduler', 'runDaily'), calleeId: idOf(bil, 'PaymentReconciler', 'reconcileCharge') },
  { callerId: idOf(bil, 'BillingScheduler', 'retryFailed'), calleeId: idOf(bil, 'PaymentReconciler', 'markPaid') },
  { callerId: idOf(bil, 'PaymentReconciler', 'reconcileCharge'), calleeId: idOf(pay, 'PaymentQuery', 'findById') },
  { callerId: idOf(bil, 'PaymentReconciler', 'markPaid'), calleeId: idOf(pay, 'PaymentQuery', 'listByOrder') },
  { callerId: idOf(bil, 'PaymentReconciler', 'reconcileCharge'), calleeId: idOf(pay, 'LedgerWriter', 'postEntry') },

  // Refund → Payment / Notify + iç
  { callerId: idOf(ref, 'RefundFacade', 'requestRefund'), calleeId: idOf(ref, 'PolicyEngine', 'canRefund') },
  { callerId: idOf(ref, 'RefundFacade', 'requestRefund'), calleeId: idOf(ref, 'PolicyEngine', 'windowOpen') },
  { callerId: idOf(ref, 'RefundFacade', 'approveRefund'), calleeId: idOf(ref, 'RefundExecutor', 'execute') },
  { callerId: idOf(ref, 'RefundFacade', 'approveRefund'), calleeId: idOf(ref, 'NotifyClient', 'refundStatus') },
  { callerId: idOf(ref, 'RefundExecutor', 'execute'), calleeId: idOf(ref, 'PaymentClient', 'reverseCharge') },
  { callerId: idOf(ref, 'RefundExecutor', 'partialRefund'), calleeId: idOf(ref, 'PaymentClient', 'creditWallet') },
  { callerId: idOf(ref, 'PaymentClient', 'reverseCharge'), calleeId: idOf(pay, 'PaymentFacade', 'voidAuth') },
  { callerId: idOf(ref, 'PaymentClient', 'reverseCharge'), calleeId: idOf(pay, 'LedgerWriter', 'reverseEntry') },
  { callerId: idOf(ref, 'PaymentClient', 'creditWallet'), calleeId: idOf(pay, 'WalletProcessor', 'chargeWallet') },
  { callerId: idOf(ref, 'NotifyClient', 'refundStatus'), calleeId: idOf(ntf, 'NotifyFacade', 'send') },

  // Identity iç
  { callerId: idOf(idn, 'AuthService', 'login'), calleeId: idOf(idn, 'UserDirectory', 'findByEmail') },
  { callerId: idOf(idn, 'AuthService', 'login'), calleeId: idOf(idn, 'MfaService', 'challenge') },
  { callerId: idOf(idn, 'AuthService', 'login'), calleeId: idOf(idn, 'TokenIssuer', 'issue') },
  { callerId: idOf(idn, 'AuthService', 'login'), calleeId: idOf(idn, 'SessionStore', 'put') },
  { callerId: idOf(idn, 'AuthService', 'refresh'), calleeId: idOf(idn, 'TokenIssuer', 'issue') },
  { callerId: idOf(idn, 'AuthService', 'logout'), calleeId: idOf(idn, 'TokenIssuer', 'revoke') },
  { callerId: idOf(idn, 'MfaService', 'challenge'), calleeId: idOf(idn, 'MfaService', 'verify') },

  // Notify iç
  { callerId: idOf(ntf, 'NotifyFacade', 'send'), calleeId: idOf(ntf, 'PreferenceStore', 'allows') },
  { callerId: idOf(ntf, 'NotifyFacade', 'send'), calleeId: idOf(ntf, 'EmailChannel', 'renderTemplate') },
  { callerId: idOf(ntf, 'NotifyFacade', 'send'), calleeId: idOf(ntf, 'EmailChannel', 'deliver') },
  { callerId: idOf(ntf, 'NotifyFacade', 'send'), calleeId: idOf(ntf, 'SmsChannel', 'deliver') },
  { callerId: idOf(ntf, 'NotifyFacade', 'send'), calleeId: idOf(ntf, 'PushChannel', 'deliver') },
  { callerId: idOf(ntf, 'NotifyFacade', 'sendBulk'), calleeId: idOf(ntf, 'NotifyFacade', 'send') },
  { callerId: idOf(ntf, 'EmailChannel', 'deliver'), calleeId: idOf(ntf, 'DeadLetter', 'enqueue') },
  // Notify → Refund (affectsEdges: refund → notify)
  { callerId: idOf(ntf, 'RefundHook', 'onRefundEvent'), calleeId: idOf(ntf, 'RefundHook', 'fetchRefund') },
  { callerId: idOf(ntf, 'RefundHook', 'fetchRefund'), calleeId: idOf(ref, 'RefundQuery', 'findById') },
  { callerId: idOf(ntf, 'RefundHook', 'onRefundEvent'), calleeId: idOf(ntf, 'NotifyFacade', 'send') },

  // Storefront → Checkout / Identity
  { callerId: idOf(sf, 'StorefrontController', 'checkout'), calleeId: idOf(sf, 'CheckoutGateway', 'place') },
  { callerId: idOf(sf, 'StorefrontController', 'cart'), calleeId: idOf(sf, 'CatalogView', 'productPage') },
  { callerId: idOf(sf, 'StorefrontController', 'loginPage'), calleeId: idOf(sf, 'IdentityGateway', 'currentUser') },
  { callerId: idOf(sf, 'CheckoutGateway', 'place'), calleeId: idOf(chk, 'CheckoutOrchestrator', 'placeOrder') },
  { callerId: idOf(sf, 'CheckoutGateway', 'preview'), calleeId: idOf(chk, 'CheckoutOrchestrator', 'preview') },
  { callerId: idOf(sf, 'IdentityGateway', 'currentUser'), calleeId: idOf(idn, 'SessionStore', 'get') },
  { callerId: idOf(sf, 'IdentityGateway', 'currentUser'), calleeId: idOf(idn, 'AuthService', 'refresh') },
  { callerId: idOf(sf, 'CatalogView', 'search'), calleeId: idOf(sf, 'CatalogView', 'productPage') },

  // MobileBff → Checkout / Identity
  { callerId: idOf(bff, 'MobileCheckoutApi', 'placeOrder'), calleeId: idOf(bff, 'CheckoutGateway', 'place') },
  { callerId: idOf(bff, 'MobileCheckoutApi', 'preview'), calleeId: idOf(chk, 'CheckoutOrchestrator', 'preview') },
  { callerId: idOf(bff, 'MobileAuthApi', 'login'), calleeId: idOf(idn, 'AuthService', 'login') },
  { callerId: idOf(bff, 'MobileAuthApi', 'refresh'), calleeId: idOf(idn, 'AuthService', 'refresh') },
  { callerId: idOf(bff, 'CheckoutGateway', 'place'), calleeId: idOf(chk, 'CheckoutOrchestrator', 'placeOrder') },
  { callerId: idOf(bff, 'IdentityGateway', 'resolve'), calleeId: idOf(idn, 'SessionStore', 'get') },
  { callerId: idOf(bff, 'MobileCartApi', 'add'), calleeId: idOf(bff, 'MobileCartApi', 'sync') },
  { callerId: idOf(bff, 'MobileCartApi', 'sync'), calleeId: idOf(chk, 'CartService', 'addItem') },

  // Report → Payment / Billing + iç
  { callerId: idOf(rpt, 'ReportFacade', 'paymentSummary'), calleeId: idOf(rpt, 'PaymentIngest', 'pullCharges') },
  { callerId: idOf(rpt, 'ReportFacade', 'paymentSummary'), calleeId: idOf(rpt, 'CubeBuilder', 'buildDaily') },
  { callerId: idOf(rpt, 'ReportFacade', 'invoiceAging'), calleeId: idOf(rpt, 'BillingIngest', 'pullInvoices') },
  { callerId: idOf(rpt, 'ReportFacade', 'refundVolume'), calleeId: idOf(rpt, 'PaymentIngest', 'normalize') },
  { callerId: idOf(rpt, 'PaymentIngest', 'pullCharges'), calleeId: idOf(pay, 'PaymentQuery', 'listByOrder') },
  { callerId: idOf(rpt, 'PaymentIngest', 'normalize'), calleeId: idOf(pay, 'PaymentQuery', 'findById') },
  { callerId: idOf(rpt, 'BillingIngest', 'pullInvoices'), calleeId: idOf(bil, 'BillingQuery', 'getInvoice') },
  { callerId: idOf(rpt, 'BillingIngest', 'normalize'), calleeId: idOf(bil, 'BillingQuery', 'listUnpaid') },
  { callerId: idOf(rpt, 'CubeBuilder', 'buildDaily'), calleeId: idOf(rpt, 'CubeBuilder', 'publish') },
  { callerId: idOf(rpt, 'ReportQuery', 'exportCsv'), calleeId: idOf(rpt, 'ReportQuery', 'get') },

  // Finance → Billing / Report
  { callerId: idOf(fin, 'FinanceBatch', 'runNightly'), calleeId: idOf(fin, 'LedgerImport', 'fromBilling') },
  { callerId: idOf(fin, 'FinanceBatch', 'runNightly'), calleeId: idOf(fin, 'LedgerImport', 'fromReports') },
  { callerId: idOf(fin, 'FinanceBatch', 'runNightly'), calleeId: idOf(fin, 'GlPoster', 'post') },
  { callerId: idOf(fin, 'FinanceBatch', 'runCatchup'), calleeId: idOf(fin, 'FinanceQuery', 'exceptions') },
  { callerId: idOf(fin, 'LedgerImport', 'fromBilling'), calleeId: idOf(bil, 'BillingQuery', 'listUnpaid') },
  { callerId: idOf(fin, 'LedgerImport', 'fromBilling'), calleeId: idOf(bil, 'InvoiceService', 'createInvoice') },
  { callerId: idOf(fin, 'LedgerImport', 'fromReports'), calleeId: idOf(rpt, 'ReportFacade', 'paymentSummary') },
  { callerId: idOf(fin, 'LedgerImport', 'fromReports'), calleeId: idOf(rpt, 'CubeBuilder', 'publish') },
  { callerId: idOf(fin, 'GlPoster', 'reverse'), calleeId: idOf(fin, 'FinanceQuery', 'trialBalance') },

  // Support → Refund / Notify
  { callerId: idOf(sup, 'TicketService', 'openTicket'), calleeId: idOf(sup, 'TicketQuery', 'get') },
  { callerId: idOf(sup, 'TicketService', 'escalate'), calleeId: idOf(sup, 'NotifyBridge', 'agentUpdate') },
  { callerId: idOf(sup, 'RefundBridge', 'startRefund'), calleeId: idOf(ref, 'RefundFacade', 'requestRefund') },
  { callerId: idOf(sup, 'RefundBridge', 'status'), calleeId: idOf(ref, 'RefundQuery', 'findById') },
  { callerId: idOf(sup, 'NotifyBridge', 'agentUpdate'), calleeId: idOf(ntf, 'NotifyFacade', 'send') },
  { callerId: idOf(sup, 'TicketService', 'closeTicket'), calleeId: idOf(sup, 'NotifyBridge', 'agentUpdate') },

  // Care → Support
  { callerId: idOf(care, 'CareFacade', 'handleCall'), calleeId: idOf(care, 'DeskClient', 'openFromCare') },
  { callerId: idOf(care, 'CareFacade', 'handleChat'), calleeId: idOf(care, 'DeskClient', 'linkTicket') },
  { callerId: idOf(care, 'DeskClient', 'openFromCare'), calleeId: idOf(sup, 'TicketService', 'openTicket') },
  { callerId: idOf(care, 'DeskClient', 'linkTicket'), calleeId: idOf(sup, 'TicketQuery', 'get') },
  { callerId: idOf(care, 'CareFacade', 'handleCall'), calleeId: idOf(care, 'CareQuery', 'history') },

  // Ticket analytics → Care
  { callerId: idOf(tix, 'AnalyticsFacade', 'dailyStats'), calleeId: idOf(tix, 'CareIngest', 'pullCases') },
  { callerId: idOf(tix, 'AnalyticsFacade', 'dailyStats'), calleeId: idOf(tix, 'AggBuilder', 'build') },
  { callerId: idOf(tix, 'AnalyticsFacade', 'agentScore'), calleeId: idOf(tix, 'CareIngest', 'normalize') },
  { callerId: idOf(tix, 'CareIngest', 'pullCases'), calleeId: idOf(care, 'CareQuery', 'history') },
  { callerId: idOf(tix, 'CareIngest', 'normalize'), calleeId: idOf(care, 'CareQuery', 'active') },
  { callerId: idOf(tix, 'AggBuilder', 'build'), calleeId: idOf(tix, 'AggBuilder', 'publish') },
]

const callersIndex = new Map<string, string[]>()
const calleesIndex = new Map<string, string[]>()
for (const e of callEdges) {
  const callers = callersIndex.get(e.calleeId) ?? []
  callers.push(e.callerId)
  callersIndex.set(e.calleeId, callers)
  const callees = calleesIndex.get(e.callerId) ?? []
  callees.push(e.calleeId)
  calleesIndex.set(e.callerId, callees)
}

export function getMethod(id: string): MethodDef | undefined {
  return byId[id]
}

export function listMethodsForService(serviceId: string): MethodDef[] {
  return methods.filter((x) => x.serviceId === serviceId)
}

export type MethodRef = MethodDef & {
  serviceName: string
  callerCount: number
  calleeCount: number
}

function toRef(method: MethodDef): MethodRef {
  return {
    ...method,
    serviceName: services[method.serviceId]?.name ?? method.serviceId,
    callerCount: (callersIndex.get(method.id) ?? []).length,
    calleeCount: (calleesIndex.get(method.id) ?? []).length,
  }
}

export function listMethodRefsForService(serviceId: string): MethodRef[] {
  return listMethodsForService(serviceId).map(toRef)
}

/** Lazy: bir hop çağıranlar */
export function getCallerRefs(methodId: string): MethodRef[] {
  return (callersIndex.get(methodId) ?? [])
    .map((id) => byId[id])
    .filter(Boolean)
    .map((m) => toRef(m!))
}

/** Lazy: bir hop çağırılanlar */
export function getCalleeRefs(methodId: string): MethodRef[] {
  return (calleesIndex.get(methodId) ?? [])
    .map((id) => byId[id])
    .filter(Boolean)
    .map((m) => toRef(m!))
}

/** Metod blast: çağıranlar BFS (maxDepth) */
export function methodImpact(methodId: string, maxDepth = 6) {
  const root = byId[methodId]
  if (!root) return undefined
  const methodIds = new Set<string>()
  const serviceIds = new Set<string>()
  let frontier = [methodId]
  for (let d = 1; d <= maxDepth; d++) {
    const next: string[] = []
    for (const id of frontier) {
      for (const callerId of callersIndex.get(id) ?? []) {
        if (methodIds.has(callerId)) continue
        methodIds.add(callerId)
        const m = byId[callerId]
        if (m) serviceIds.add(m.serviceId)
        next.push(callerId)
      }
    }
    if (next.length === 0) break
    frontier = next
  }
  return {
    methodId,
    methodCount: methodIds.size,
    serviceCount: serviceIds.size,
    serviceIds: [...serviceIds],
    methodIds: [...methodIds],
  }
}

export type MethodImpactNode = {
  method: MethodRef
  hop: number
}

export type MethodImpactEdge = {
  fromId: string
  toId: string
  hop: number
}

/** Merkez metod değişince etkilenen çağıranlar (BFS). Ok: merkez → çağıran. */
export type MethodImpactGraph = {
  center: MethodRef
  nodes: MethodImpactNode[]
  edges: MethodImpactEdge[]
  hopsDrawn: number
  truncated: boolean
  reason?: string
}

export function buildMethodImpactGraph(
  methodId: string,
  maxNodes = 48,
  maxHops = 6,
): MethodImpactGraph | undefined {
  const root = byId[methodId]
  if (!root) return undefined
  const center = toRef(root)
  const nodes: MethodImpactNode[] = []
  const edges: MethodImpactEdge[] = []
  const depth = new Map<string, number>([[methodId, 0]])
  let frontier = [methodId]
  let hopsDrawn = 0
  let truncated = false
  let reason: string | undefined

  for (let hop = 1; hop <= maxHops; hop++) {
    const nextIds: string[] = []
    const seenThisHop = new Set<string>()

    for (const fromId of frontier) {
      for (const callerId of callersIndex.get(fromId) ?? []) {
        edges.push({ fromId, toId: callerId, hop })
        if (depth.has(callerId) || seenThisHop.has(callerId)) continue
        seenThisHop.add(callerId)
        nextIds.push(callerId)
      }
    }

    if (nextIds.length === 0) break

    if (nodes.length + nextIds.length > maxNodes) {
      truncated = true
      reason = `${hop}. katman eklenmedi — görünüm bütçesi (~${maxNodes} düğüm).`
      break
    }

    for (const id of nextIds) {
      const m = byId[id]
      if (!m) continue
      depth.set(id, hop)
      nodes.push({ method: toRef(m), hop })
    }

    frontier = nextIds
    hopsDrawn = hop
  }

  return { center, nodes, edges, hopsDrawn, truncated, reason }
}

export function searchMethods(query: string): MethodRef[] {
  const q = query.trim().toLowerCase()
  if (!q) return []
  return methods
    .filter(
      (m) =>
        m.name.toLowerCase().includes(q) ||
        m.className.toLowerCase().includes(q) ||
        m.id.toLowerCase().includes(q) ||
        (services[m.serviceId]?.name ?? '').toLowerCase().includes(q),
    )
    .slice(0, 40)
    .map(toRef)
}

export type ConsistencyIssue = {
  code: string
  message: string
}

/** Call-graph ↔ affectsEdges tutarlılık kontrolü */
export function checkCallGraphConsistency(): ConsistencyIssue[] {
  const issues: ConsistencyIssue[] = []
  const known = new Set(methods.map((x) => x.id))

  for (const e of callEdges) {
    if (!known.has(e.callerId)) {
      issues.push({ code: 'unknown_caller', message: e.callerId })
    }
    if (!known.has(e.calleeId)) {
      issues.push({ code: 'unknown_callee', message: e.calleeId })
    }
    const caller = byId[e.callerId]
    const callee = byId[e.calleeId]
    if (!caller || !callee) continue
    if (caller.serviceId === callee.serviceId) continue
    const affected = affectsEdges[callee.serviceId] ?? []
    if (!affected.includes(caller.serviceId)) {
      issues.push({
        code: 'cross_call_missing_affects',
        message: `${caller.serviceId} → ${callee.serviceId} çağırıyor ama affectsEdges[${callee.serviceId}] içinde ${caller.serviceId} yok (${caller.className}.${caller.name} → ${callee.className}.${callee.name})`,
      })
    }
  }

  for (const [calleeSvc, consumers] of Object.entries(affectsEdges)) {
    for (const callerSvc of consumers) {
      const hasEdge = callEdges.some((e) => {
        const caller = byId[e.callerId]
        const callee = byId[e.calleeId]
        return (
          caller?.serviceId === callerSvc && callee?.serviceId === calleeSvc
        )
      })
      if (!hasEdge) {
        issues.push({
          code: 'affects_without_method_call',
          message: `affectsEdges[${calleeSvc}]∋${callerSvc} ama metod çağrısı yok`,
        })
      }
    }
  }

  return issues
}
