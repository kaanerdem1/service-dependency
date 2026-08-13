/**
 * Web tarafı mock method kataloğu + call-graph.
 * Asıl kaynak genelde server/src/methods.ts; ikisi scripts/gen_mock_catalog.py ile senkron.
 *
 * Not: UI normalde API kullanır (api/client.ts). Bu dosya offline / mock yedek.
 * Tutarlılık: çapraz servis çağrı ⇒ affectsEdges[callee] içinde caller olmalı.
 */
import { affectsEdges, services } from './data'

export type MethodDef = {
  id: string
  serviceId: string
  className: string
  name: string
  signature: string
}

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
  m(pay, 'RealtimePaymentAuthorizationFacade', 'executeCardPaymentSettlement', '(ChargeCmd): ChargeResult'),
  m(pay, 'RealtimePaymentAuthorizationFacade', 'authorizePendingCardHold', '(AuthCmd): AuthResult'),
  m(pay, 'RealtimePaymentAuthorizationFacade', 'captureAuthorizedCardHold', '(CaptureCmd): CaptureResult'),
  m(pay, 'RealtimePaymentAuthorizationFacade', 'voidAuthorizedCardHold', '(VoidCmd): void'),
  m(pay, 'RealtimePaymentAuthorizationFacade', 'retryFailedSettlementBatch', '(BatchId): BatchResult'),
  m(pay, 'CardNetworkTokenizationProcessor', 'tokenizeSensitiveCardMaterial', '(CardDto): Token'),
  m(pay, 'CardNetworkTokenizationProcessor', 'chargeTokenizedCardInstrument', '(Token, Money): ChargeResult'),
  m(pay, 'CardNetworkTokenizationProcessor', 'validateIssuerBinRangeRules', '(String): boolean'),
  m(pay, 'CardNetworkTokenizationProcessor', 'refreshNetworkTokenLifecycle', '(Token): Token'),
  m(pay, 'DigitalWalletSettlementProcessor', 'chargeLinkedWalletBalance', '(WalletId, Money): ChargeResult'),
  m(pay, 'DigitalWalletSettlementProcessor', 'reserveWalletSpendingLimit', '(WalletId, Money): Reservation'),
  m(pay, 'DigitalWalletSettlementProcessor', 'releaseReservedWalletFunds', '(Reservation): void'),
  m(pay, 'RealtimeFraudScoringGate', 'scoreIncomingPaymentRisk', '(ChargeCmd): FraudScore'),
  m(pay, 'RealtimeFraudScoringGate', 'blockHighRiskPaymentAttempt', '(FraudScore): void'),
  m(pay, 'RealtimeFraudScoringGate', 'enrichRiskWithDeviceSignals', '(ChargeCmd): FraudScore'),
  m(pay, 'PaymentLedgerEntryWriter', 'postSuccessfulSettlementEntry', '(LedgerEntry): void'),
  m(pay, 'PaymentLedgerEntryWriter', 'reversePostedSettlementEntry', '(EntryId): void'),
  m(pay, 'PaymentLedgerEntryWriter', 'appendCompensatingLedgerNote', '(EntryId, Note): void'),
  m(pay, 'PaymentSettlementQueryService', 'findSettlementByPaymentId', '(PaymentId): Payment'),
  m(pay, 'PaymentSettlementQueryService', 'listSettlementsByOrderReference', '(OrderId): List<Payment>'),
  m(pay, 'PaymentSettlementQueryService', 'listFailedSettlementsForRetry', '(Range): List<Payment>'),
  m(pay, 'PaymentIdempotencyGuardStore', 'beginIdempotentPaymentOperation', '(Key): boolean'),
  m(pay, 'PaymentIdempotencyGuardStore', 'completeIdempotentPaymentOperation', '(Key, Result): void'),
  m(pay, 'PaymentNotifyBridgeClient', 'emitPaymentLifecycleNotification', '(PaymentEvent): void'),
  m(chk, 'RetailCheckoutOrchestrationFacade', 'placeConfirmedCustomerOrder', '(CheckoutCmd): Order'),
  m(chk, 'RetailCheckoutOrchestrationFacade', 'previewCheckoutPricingQuote', '(CheckoutCmd): Preview'),
  m(chk, 'RetailCheckoutOrchestrationFacade', 'cancelUncommittedCheckoutDraft', '(DraftId): void'),
  m(chk, 'RetailCheckoutOrchestrationFacade', 'resumeAbandonedCheckoutSession', '(DraftId): Draft'),
  m(chk, 'ShoppingCartPricingService', 'addCatalogItemToCart', '(CartId, Sku): Cart'),
  m(chk, 'ShoppingCartPricingService', 'removeCatalogItemFromCart', '(CartId, Sku): Cart'),
  m(chk, 'ShoppingCartPricingService', 'repriceCartWithPromotions', '(CartId): Cart'),
  m(chk, 'ShoppingCartPricingService', 'mergeGuestAndUserCarts', '(CartId, CartId): Cart'),
  m(chk, 'DownstreamPaymentGatewayClient', 'chargeOrderThroughPaymentGateway', '(Order): ChargeResult'),
  m(chk, 'DownstreamPaymentGatewayClient', 'authorizeOrderThroughPaymentGateway', '(Order): AuthResult'),
  m(chk, 'DownstreamPaymentGatewayClient', 'queryOrderPaymentSettlementStatus', '(OrderId): Status'),
  m(chk, 'InventoryReservationClient', 'reserveStockForCheckoutOrder', '(Order): Reservation'),
  m(chk, 'InventoryReservationClient', 'releaseReservedCheckoutStock', '(Reservation): void'),
  m(chk, 'IdentitySessionResolutionClient', 'resolveUserFromActiveSession', '(Session): User'),
  m(chk, 'OutboundNotificationClient', 'notifyCustomerOrderPlaced', '(Order): void'),
  m(chk, 'OutboundNotificationClient', 'notifyCustomerCheckoutAbandoned', '(Draft): void'),
  m(chk, 'BillingInvoiceHandoffClient', 'openInvoiceForCompletedOrder', '(Order): Invoice'),
  m(chk, 'CheckoutOrderQueryService', 'getOrderByReference', '(OrderId): Order'),
  m(chk, 'CheckoutOrderQueryService', 'listOpenOrdersForUser', '(UserId): List<Order>'),
  m(bil, 'CustomerInvoiceLifecycleService', 'createInvoiceFromFulfilledOrder', '(Order): Invoice'),
  m(bil, 'CustomerInvoiceLifecycleService', 'voidIssuedCustomerInvoice', '(InvoiceId): void'),
  m(bil, 'CustomerInvoiceLifecycleService', 'reissueCorrectedCustomerInvoice', '(InvoiceId): Invoice'),
  m(bil, 'CustomerInvoiceLifecycleService', 'applyCreditMemoToInvoice', '(InvoiceId, Money): Invoice'),
  m(bil, 'BillingBatchSchedulerService', 'runDailyInvoiceCollectionBatch', '(): BatchResult'),
  m(bil, 'BillingBatchSchedulerService', 'retryFailedInvoiceCollectionJobs', '(): BatchResult'),
  m(bil, 'BillingBatchSchedulerService', 'scheduleMidMonthReconciliationSweep', '(): void'),
  m(bil, 'PaymentSettlementReconciler', 'reconcileChargeAgainstOpenInvoice', '(ChargeId): void'),
  m(bil, 'PaymentSettlementReconciler', 'markInvoiceFullyPaidFromSettlement', '(InvoiceId): void'),
  m(bil, 'PaymentSettlementReconciler', 'flagUnmatchedSettlementException', '(ChargeId): Exception'),
  m(bil, 'InvoiceTaxComputationEngine', 'computeTaxLinesForInvoiceDraft', '(InvoiceDraft): TaxLines'),
  m(bil, 'InvoiceTaxComputationEngine', 'validateVatRegistrationIdentifier', '(VatId): boolean'),
  m(bil, 'BillingInvoiceQueryService', 'getInvoiceByIdentifier', '(InvoiceId): Invoice'),
  m(bil, 'BillingInvoiceQueryService', 'listUnpaidInvoicesForAccount', '(AccountId): List<Invoice>'),
  m(bil, 'CheckoutOrderLookupClient', 'fetchOrderSnapshotForInvoicing', '(OrderId): Order'),
  m(bil, 'RefundCreditApplicationClient', 'applyApprovedRefundToInvoice', '(RefundId): void'),
  m(bil, 'BillingNotifyBridgeClient', 'emitInvoiceLifecycleNotification', '(InvoiceEvent): void'),
  m(bil, 'IdentityAccountLookupClient', 'resolveBillingAccountOwner', '(AccountId): User'),
  m(ref, 'CustomerRefundOrchestrationFacade', 'requestCustomerRefundWorkflow', '(RefundCmd): Refund'),
  m(ref, 'CustomerRefundOrchestrationFacade', 'approvePendingRefundWorkflow', '(RefundId): Refund'),
  m(ref, 'CustomerRefundOrchestrationFacade', 'rejectPendingRefundWorkflow', '(RefundId, Reason): void'),
  m(ref, 'CustomerRefundOrchestrationFacade', 'escalateRefundToSupportDesk', '(RefundId): Ticket'),
  m(ref, 'RefundSettlementExecutor', 'executeFullChargeReversal', '(Refund): RefundResult'),
  m(ref, 'RefundSettlementExecutor', 'executePartialChargeReversal', '(Refund, Money): RefundResult'),
  m(ref, 'RefundSettlementExecutor', 'creditWalletAfterChargeReversal', '(Refund): void'),
  m(ref, 'DownstreamPaymentReversalClient', 'reverseSettledChargeOnGateway', '(ChargeId): void'),
  m(ref, 'DownstreamPaymentReversalClient', 'creditWalletOnPaymentGateway', '(WalletId, Money): void'),
  m(ref, 'OutboundRefundNotifyClient', 'publishRefundStatusNotification', '(Refund): void'),
  m(ref, 'BillingCreditMemoClient', 'requestInvoiceCreditForRefund', '(Refund): void'),
  m(ref, 'ReportingRefundFactClient', 'publishRefundVolumeFact', '(Refund): void'),
  m(ref, 'RefundPolicyDecisionEngine', 'evaluateRefundEligibilityRules', '(Order, Money): boolean'),
  m(ref, 'RefundPolicyDecisionEngine', 'evaluateRefundTimeWindowOpen', '(Order): boolean'),
  m(ref, 'RefundCaseQueryService', 'findRefundCaseById', '(RefundId): Refund'),
  m(ref, 'RefundCaseQueryService', 'listRefundsByOrderReference', '(OrderId): List<Refund>'),
  m(idn, 'EnterpriseAuthenticationFacade', 'loginWithPasswordCredentials', '(Creds): Session'),
  m(idn, 'EnterpriseAuthenticationFacade', 'logoutActiveUserSession', '(Session): void'),
  m(idn, 'EnterpriseAuthenticationFacade', 'refreshExpiringAccessSession', '(RefreshToken): Session'),
  m(idn, 'EnterpriseAuthenticationFacade', 'challengeStepUpAuthentication', '(User): Challenge'),
  m(idn, 'AccessTokenIssuanceService', 'issueSignedAccessRefreshTokens', '(User): Tokens'),
  m(idn, 'AccessTokenIssuanceService', 'revokeIssuedAccessToken', '(TokenId): void'),
  m(idn, 'AccessTokenIssuanceService', 'introspectPresentedAccessToken', '(Token): Claims'),
  m(idn, 'EnterpriseUserDirectoryService', 'findUserProfileById', '(UserId): User'),
  m(idn, 'EnterpriseUserDirectoryService', 'findUserProfileByEmail', '(Email): User'),
  m(idn, 'EnterpriseUserDirectoryService', 'updateUserProfilePatch', '(UserId, Patch): User'),
  m(idn, 'EnterpriseUserDirectoryService', 'listUsersInSecurityGroup', '(GroupId): List<User>'),
  m(idn, 'DistributedSessionStore', 'putActiveSessionRecord', '(Session): void'),
  m(idn, 'DistributedSessionStore', 'getActiveSessionRecord', '(SessionId): Session'),
  m(idn, 'DistributedSessionStore', 'evictExpiredSessionRecord', '(SessionId): void'),
  m(idn, 'MultiFactorChallengeService', 'issueMultiFactorChallenge', '(User): Challenge'),
  m(idn, 'MultiFactorChallengeService', 'verifyMultiFactorChallengeCode', '(Challenge, Code): boolean'),
  m(ntf, 'OutboundNotificationDispatchFacade', 'sendSingleChannelNotification', '(NotifyCmd): void'),
  m(ntf, 'OutboundNotificationDispatchFacade', 'sendBulkChannelNotifications', '(List<NotifyCmd>): BulkResult'),
  m(ntf, 'OutboundNotificationDispatchFacade', 'retryFailedNotificationDelivery', '(NotifyId): void'),
  m(ntf, 'EmailDeliveryChannelAdapter', 'deliverRenderedEmailMessage', '(EmailMsg): void'),
  m(ntf, 'EmailDeliveryChannelAdapter', 'renderNotificationEmailTemplate', '(TemplateId, Map): String'),
  m(ntf, 'SmsDeliveryChannelAdapter', 'deliverSmsNotificationMessage', '(SmsMsg): void'),
  m(ntf, 'PushDeliveryChannelAdapter', 'deliverMobilePushNotification', '(PushMsg): void'),
  m(ntf, 'UserNotificationPreferenceStore', 'allowsNotificationOnChannel', '(UserId, Channel): boolean'),
  m(ntf, 'UserNotificationPreferenceStore', 'updateUserNotificationPreferences', '(UserId, Prefs): void'),
  m(ntf, 'NotificationDeliveryQueryService', 'getNotificationDeliveryStatus', '(NotifyId): Status'),
  m(ntf, 'NotificationDeadLetterQueue', 'enqueueFailedNotificationMessage', '(FailedMsg): void'),
  m(ntf, 'NotificationDeadLetterQueue', 'replayDeadLetterNotification', '(DlqId): void'),
  m(ntf, 'RefundEventNotificationHook', 'onRefundLifecycleDomainEvent', '(RefundEvent): void'),
  m(ntf, 'RefundEventNotificationHook', 'fetchRefundSnapshotForNotify', '(RefundId): Refund'),
  m(ntf, 'PaymentEventNotificationHook', 'onPaymentLifecycleDomainEvent', '(PaymentEvent): void'),
  m(ntf, 'BillingEventNotificationHook', 'onInvoiceLifecycleDomainEvent', '(InvoiceEvent): void'),
  m(ntf, 'SupportDeskNotifyBridge', 'onSupportTicketAgentUpdate', '(Ticket): void'),
  m(sf, 'DigitalStorefrontHttpController', 'submitCheckoutFromStorefront', '(HttpReq): HttpRes'),
  m(sf, 'DigitalStorefrontHttpController', 'renderActiveShoppingCart', '(HttpReq): HttpRes'),
  m(sf, 'DigitalStorefrontHttpController', 'renderCustomerLoginExperience', '(HttpReq): HttpRes'),
  m(sf, 'DigitalStorefrontHttpController', 'searchCatalogProductListing', '(HttpReq): HttpRes'),
  m(sf, 'CheckoutOrchestrationGateway', 'placeOrderViaCheckoutEngine', '(CheckoutCmd): Order'),
  m(sf, 'CheckoutOrchestrationGateway', 'previewOrderViaCheckoutEngine', '(CheckoutCmd): Preview'),
  m(sf, 'IdentitySessionGateway', 'resolveCurrentStorefrontUser', '(Cookie): User'),
  m(sf, 'CatalogProductViewAssembler', 'assembleProductDetailPageModel', '(Sku): ProductVm'),
  m(sf, 'CatalogProductViewAssembler', 'searchCatalogProductViewModels', '(Query): List<ProductVm>'),
  m(sf, 'ReportingBrowseAnalyticsClient', 'publishStorefrontBrowseFact', '(BrowseEvent): void'),
  m(sf, 'StorefrontNotifyBridgeClient', 'emitStorefrontLifecycleNotification', '(StorefrontEvent): void'),
  m(bff, 'MobileCheckoutExperienceApi', 'placeOrderFromMobileClient', '(MobileCheckout): Order'),
  m(bff, 'MobileCheckoutExperienceApi', 'previewOrderFromMobileClient', '(MobileCheckout): Preview'),
  m(bff, 'MobileAuthenticationExperienceApi', 'loginMobileDeviceSession', '(MobileCreds): Session'),
  m(bff, 'MobileAuthenticationExperienceApi', 'refreshMobileDeviceSession', '(RefreshToken): Session'),
  m(bff, 'MobileCheckoutOrchestrationGateway', 'placeOrderThroughCheckoutEngine', '(CheckoutCmd): Order'),
  m(bff, 'MobileIdentityResolutionGateway', 'resolveUserFromDeviceSession', '(DeviceSession): User'),
  m(bff, 'MobileShoppingCartSyncApi', 'synchronizeDeviceCartState', '(DeviceCart): Cart'),
  m(bff, 'MobileShoppingCartSyncApi', 'addSkuToDeviceCart', '(Sku): Cart'),
  m(bff, 'MobileNotifyPreferenceBridge', 'registerDevicePushEndpoint', '(DeviceToken): void'),
  m(bff, 'MobileNotifyPreferenceBridge', 'emitMobileLifecycleNotification', '(MobileEvent): void'),
  m(rpt, 'OperationalReportingFacade', 'buildPaymentSettlementSummaryReport', '(Range): Report'),
  m(rpt, 'OperationalReportingFacade', 'buildInvoiceAgingSummaryReport', '(Range): Report'),
  m(rpt, 'OperationalReportingFacade', 'buildRefundVolumeSummaryReport', '(Range): Report'),
  m(rpt, 'OperationalReportingFacade', 'buildSupportTicketVolumeReport', '(Range): Report'),
  m(rpt, 'PaymentSettlementIngestWorker', 'pullChargesFromPaymentGateway', '(Range): List<ChargeRow>'),
  m(rpt, 'PaymentSettlementIngestWorker', 'normalizePaymentChargeFactRow', '(ChargeRow): Fact'),
  m(rpt, 'BillingInvoiceIngestWorker', 'pullInvoicesFromBillingEngine', '(Range): List<InvoiceRow>'),
  m(rpt, 'BillingInvoiceIngestWorker', 'normalizeBillingInvoiceFactRow', '(InvoiceRow): Fact'),
  m(rpt, 'TicketAnalyticsIngestBridge', 'pullTicketFactsFromAnalytics', '(Range): List<TicketFact>'),
  m(rpt, 'AnalyticsCubeBuilderService', 'buildDailyOperationalAnalyticsCube', '(Date): Cube'),
  m(rpt, 'AnalyticsCubeBuilderService', 'publishOperationalAnalyticsCube', '(Cube): void'),
  m(rpt, 'ReportCatalogQueryService', 'getPublishedReportById', '(ReportId): Report'),
  m(rpt, 'ReportCatalogQueryService', 'exportPublishedReportAsCsv', '(ReportId): Stream'),
  m(rpt, 'IdentityAudienceLookupClient', 'resolveReportAudienceUser', '(UserId): User'),
  m(fin, 'OvernightFinanceBatchOrchestrator', 'runNightlyGeneralLedgerImport', '(): BatchResult'),
  m(fin, 'OvernightFinanceBatchOrchestrator', 'runCatchupGeneralLedgerImport', '(Date): BatchResult'),
  m(fin, 'OvernightFinanceBatchOrchestrator', 'runPaymentSettlementCatchupImport', '(Date): BatchResult'),
  m(fin, 'GeneralLedgerImportWorker', 'importLedgerEntriesFromBilling', '(Date): void'),
  m(fin, 'GeneralLedgerImportWorker', 'importLedgerEntriesFromReports', '(Date): void'),
  m(fin, 'GeneralLedgerImportWorker', 'importLedgerEntriesFromPayments', '(Date): void'),
  m(fin, 'GeneralLedgerPostingService', 'postValidatedGeneralLedgerEntry', '(GlEntry): void'),
  m(fin, 'GeneralLedgerPostingService', 'reversePostedGeneralLedgerEntry', '(GlEntryId): void'),
  m(fin, 'FinanceExceptionQueryService', 'computeTrialBalanceSnapshot', '(Date): Balance'),
  m(fin, 'FinanceExceptionQueryService', 'listOpenFinanceExceptions', '(): List<Exception>'),
  m(sup, 'SupportTicketLifecycleService', 'openCustomerSupportTicket', '(TicketCmd): Ticket'),
  m(sup, 'SupportTicketLifecycleService', 'closeCustomerSupportTicket', '(TicketId): void'),
  m(sup, 'SupportTicketLifecycleService', 'escalateCustomerSupportTicket', '(TicketId): void'),
  m(sup, 'SupportTicketLifecycleService', 'reassignTicketToCareQueue', '(TicketId): void'),
  m(sup, 'RefundWorkflowBridgeClient', 'startRefundFromSupportTicket', '(Ticket): Refund'),
  m(sup, 'RefundWorkflowBridgeClient', 'getRefundStatusForSupportTicket', '(RefundId): Status'),
  m(sup, 'SupportNotifyBridgeClient', 'notifyAgentOfTicketUpdate', '(Ticket): void'),
  m(sup, 'IdentityAgentLookupClient', 'resolveAgentUserProfile', '(AgentId): User'),
  m(sup, 'SupportTicketQueryService', 'getSupportTicketById', '(TicketId): Ticket'),
  m(sup, 'SupportTicketQueryService', 'listOpenTicketsForAgent', '(AgentId): List<Ticket>'),
  m(care, 'CustomerCareInteractionFacade', 'handleInboundCustomerCall', '(CallCtx): CareResult'),
  m(care, 'CustomerCareInteractionFacade', 'handleInboundCustomerChat', '(ChatCtx): CareResult'),
  m(care, 'CustomerCareInteractionFacade', 'summarizeCustomerCareHistory', '(CustomerId): Summary'),
  m(care, 'SupportDeskCaseClient', 'openSupportTicketFromCareCase', '(CareCase): Ticket'),
  m(care, 'SupportDeskCaseClient', 'linkCareCaseToSupportTicket', '(CareCase, TicketId): void'),
  m(care, 'CareNotifyBridgeClient', 'emitCareInteractionNotification', '(CareCase): void'),
  m(care, 'CareCaseQueryService', 'listCareHistoryForCustomer', '(CustomerId): List<CareCase>'),
  m(care, 'CareCaseQueryService', 'listActiveCareCasesForAgent', '(AgentId): List<CareCase>'),
  m(tix, 'SupportTicketAnalyticsFacade', 'computeDailyTicketVolumeStats', '(Date): Stats'),
  m(tix, 'SupportTicketAnalyticsFacade', 'computeAgentPerformanceScore', '(AgentId, Range): Score'),
  m(tix, 'SupportTicketAnalyticsFacade', 'publishTicketFactsToReporting', '(Date): void'),
  m(tix, 'CareCaseIngestWorker', 'pullCareCasesForAnalytics', '(Range): List<CaseRow>'),
  m(tix, 'CareCaseIngestWorker', 'normalizeCareCaseFactRow', '(CaseRow): Fact'),
  m(tix, 'TicketAggregationBuilder', 'buildDailyTicketAggregation', '(Date): Agg'),
  m(tix, 'TicketAggregationBuilder', 'publishTicketAggregationCube', '(Agg): void'),
  m(tix, 'TicketAnalyticsQueryService', 'getPublishedTicketStats', '(StatsId): Stats'),
  m(tix, 'ReportingTicketFactPublisher', 'pushTicketFactsIntoReporting', '(Agg): void'),
]

const byId = Object.fromEntries(methods.map((x) => [x.id, x]))

function idOf(serviceId: string, className: string, name: string) {
  return m(serviceId, className, name, '').id
}

export const callEdges: CallEdge[] = [
  { callerId: idOf(pay, 'RealtimePaymentAuthorizationFacade', 'executeCardPaymentSettlement'), calleeId: idOf(pay, 'PaymentIdempotencyGuardStore', 'beginIdempotentPaymentOperation') },
  { callerId: idOf(pay, 'RealtimePaymentAuthorizationFacade', 'executeCardPaymentSettlement'), calleeId: idOf(pay, 'RealtimeFraudScoringGate', 'scoreIncomingPaymentRisk') },
  { callerId: idOf(pay, 'RealtimePaymentAuthorizationFacade', 'executeCardPaymentSettlement'), calleeId: idOf(pay, 'RealtimeFraudScoringGate', 'blockHighRiskPaymentAttempt') },
  { callerId: idOf(pay, 'RealtimePaymentAuthorizationFacade', 'executeCardPaymentSettlement'), calleeId: idOf(pay, 'CardNetworkTokenizationProcessor', 'chargeTokenizedCardInstrument') },
  { callerId: idOf(pay, 'RealtimePaymentAuthorizationFacade', 'executeCardPaymentSettlement'), calleeId: idOf(pay, 'DigitalWalletSettlementProcessor', 'chargeLinkedWalletBalance') },
  { callerId: idOf(pay, 'RealtimePaymentAuthorizationFacade', 'executeCardPaymentSettlement'), calleeId: idOf(pay, 'PaymentLedgerEntryWriter', 'postSuccessfulSettlementEntry') },
  { callerId: idOf(pay, 'RealtimePaymentAuthorizationFacade', 'executeCardPaymentSettlement'), calleeId: idOf(pay, 'PaymentIdempotencyGuardStore', 'completeIdempotentPaymentOperation') },
  { callerId: idOf(pay, 'RealtimePaymentAuthorizationFacade', 'executeCardPaymentSettlement'), calleeId: idOf(pay, 'PaymentNotifyBridgeClient', 'emitPaymentLifecycleNotification') },
  { callerId: idOf(pay, 'RealtimePaymentAuthorizationFacade', 'authorizePendingCardHold'), calleeId: idOf(pay, 'RealtimeFraudScoringGate', 'scoreIncomingPaymentRisk') },
  { callerId: idOf(pay, 'RealtimePaymentAuthorizationFacade', 'authorizePendingCardHold'), calleeId: idOf(pay, 'CardNetworkTokenizationProcessor', 'tokenizeSensitiveCardMaterial') },
  { callerId: idOf(pay, 'RealtimePaymentAuthorizationFacade', 'captureAuthorizedCardHold'), calleeId: idOf(pay, 'PaymentLedgerEntryWriter', 'postSuccessfulSettlementEntry') },
  { callerId: idOf(pay, 'RealtimePaymentAuthorizationFacade', 'voidAuthorizedCardHold'), calleeId: idOf(pay, 'PaymentLedgerEntryWriter', 'reversePostedSettlementEntry') },
  { callerId: idOf(pay, 'RealtimePaymentAuthorizationFacade', 'retryFailedSettlementBatch'), calleeId: idOf(pay, 'PaymentSettlementQueryService', 'listFailedSettlementsForRetry') },
  { callerId: idOf(pay, 'CardNetworkTokenizationProcessor', 'chargeTokenizedCardInstrument'), calleeId: idOf(pay, 'CardNetworkTokenizationProcessor', 'validateIssuerBinRangeRules') },
  { callerId: idOf(pay, 'CardNetworkTokenizationProcessor', 'tokenizeSensitiveCardMaterial'), calleeId: idOf(pay, 'CardNetworkTokenizationProcessor', 'refreshNetworkTokenLifecycle') },
  { callerId: idOf(pay, 'DigitalWalletSettlementProcessor', 'chargeLinkedWalletBalance'), calleeId: idOf(pay, 'DigitalWalletSettlementProcessor', 'reserveWalletSpendingLimit') },
  { callerId: idOf(pay, 'RealtimeFraudScoringGate', 'blockHighRiskPaymentAttempt'), calleeId: idOf(pay, 'RealtimeFraudScoringGate', 'enrichRiskWithDeviceSignals') },
  { callerId: idOf(pay, 'RealtimeFraudScoringGate', 'enrichRiskWithDeviceSignals'), calleeId: idOf(pay, 'RealtimeFraudScoringGate', 'scoreIncomingPaymentRisk') },
  { callerId: idOf(pay, 'RealtimePaymentAuthorizationFacade', 'executeCardPaymentSettlement'), calleeId: idOf(idn, 'DistributedSessionStore', 'getActiveSessionRecord') },
  { callerId: idOf(pay, 'RealtimePaymentAuthorizationFacade', 'authorizePendingCardHold'), calleeId: idOf(idn, 'EnterpriseUserDirectoryService', 'findUserProfileById') },
  { callerId: idOf(pay, 'PaymentNotifyBridgeClient', 'emitPaymentLifecycleNotification'), calleeId: idOf(ntf, 'PaymentEventNotificationHook', 'onPaymentLifecycleDomainEvent') },
  { callerId: idOf(chk, 'RetailCheckoutOrchestrationFacade', 'placeConfirmedCustomerOrder'), calleeId: idOf(chk, 'ShoppingCartPricingService', 'repriceCartWithPromotions') },
  { callerId: idOf(chk, 'RetailCheckoutOrchestrationFacade', 'placeConfirmedCustomerOrder'), calleeId: idOf(chk, 'IdentitySessionResolutionClient', 'resolveUserFromActiveSession') },
  { callerId: idOf(chk, 'RetailCheckoutOrchestrationFacade', 'placeConfirmedCustomerOrder'), calleeId: idOf(chk, 'InventoryReservationClient', 'reserveStockForCheckoutOrder') },
  { callerId: idOf(chk, 'RetailCheckoutOrchestrationFacade', 'placeConfirmedCustomerOrder'), calleeId: idOf(chk, 'DownstreamPaymentGatewayClient', 'chargeOrderThroughPaymentGateway') },
  { callerId: idOf(chk, 'RetailCheckoutOrchestrationFacade', 'placeConfirmedCustomerOrder'), calleeId: idOf(chk, 'OutboundNotificationClient', 'notifyCustomerOrderPlaced') },
  { callerId: idOf(chk, 'RetailCheckoutOrchestrationFacade', 'placeConfirmedCustomerOrder'), calleeId: idOf(chk, 'BillingInvoiceHandoffClient', 'openInvoiceForCompletedOrder') },
  { callerId: idOf(chk, 'RetailCheckoutOrchestrationFacade', 'previewCheckoutPricingQuote'), calleeId: idOf(chk, 'ShoppingCartPricingService', 'repriceCartWithPromotions') },
  { callerId: idOf(chk, 'RetailCheckoutOrchestrationFacade', 'previewCheckoutPricingQuote'), calleeId: idOf(chk, 'DownstreamPaymentGatewayClient', 'authorizeOrderThroughPaymentGateway') },
  { callerId: idOf(chk, 'RetailCheckoutOrchestrationFacade', 'cancelUncommittedCheckoutDraft'), calleeId: idOf(chk, 'InventoryReservationClient', 'releaseReservedCheckoutStock') },
  { callerId: idOf(chk, 'RetailCheckoutOrchestrationFacade', 'resumeAbandonedCheckoutSession'), calleeId: idOf(chk, 'OutboundNotificationClient', 'notifyCustomerCheckoutAbandoned') },
  { callerId: idOf(chk, 'ShoppingCartPricingService', 'addCatalogItemToCart'), calleeId: idOf(chk, 'ShoppingCartPricingService', 'repriceCartWithPromotions') },
  { callerId: idOf(chk, 'ShoppingCartPricingService', 'removeCatalogItemFromCart'), calleeId: idOf(chk, 'ShoppingCartPricingService', 'repriceCartWithPromotions') },
  { callerId: idOf(chk, 'ShoppingCartPricingService', 'mergeGuestAndUserCarts'), calleeId: idOf(chk, 'ShoppingCartPricingService', 'repriceCartWithPromotions') },
  { callerId: idOf(chk, 'DownstreamPaymentGatewayClient', 'chargeOrderThroughPaymentGateway'), calleeId: idOf(pay, 'RealtimePaymentAuthorizationFacade', 'executeCardPaymentSettlement') },
  { callerId: idOf(chk, 'DownstreamPaymentGatewayClient', 'authorizeOrderThroughPaymentGateway'), calleeId: idOf(pay, 'RealtimePaymentAuthorizationFacade', 'authorizePendingCardHold') },
  { callerId: idOf(chk, 'DownstreamPaymentGatewayClient', 'queryOrderPaymentSettlementStatus'), calleeId: idOf(pay, 'PaymentSettlementQueryService', 'findSettlementByPaymentId') },
  { callerId: idOf(chk, 'IdentitySessionResolutionClient', 'resolveUserFromActiveSession'), calleeId: idOf(idn, 'DistributedSessionStore', 'getActiveSessionRecord') },
  { callerId: idOf(chk, 'IdentitySessionResolutionClient', 'resolveUserFromActiveSession'), calleeId: idOf(idn, 'EnterpriseUserDirectoryService', 'findUserProfileById') },
  { callerId: idOf(chk, 'OutboundNotificationClient', 'notifyCustomerOrderPlaced'), calleeId: idOf(ntf, 'OutboundNotificationDispatchFacade', 'sendSingleChannelNotification') },
  { callerId: idOf(chk, 'OutboundNotificationClient', 'notifyCustomerCheckoutAbandoned'), calleeId: idOf(ntf, 'OutboundNotificationDispatchFacade', 'sendSingleChannelNotification') },
  { callerId: idOf(chk, 'BillingInvoiceHandoffClient', 'openInvoiceForCompletedOrder'), calleeId: idOf(bil, 'CustomerInvoiceLifecycleService', 'createInvoiceFromFulfilledOrder') },
  { callerId: idOf(bil, 'CustomerInvoiceLifecycleService', 'createInvoiceFromFulfilledOrder'), calleeId: idOf(bil, 'InvoiceTaxComputationEngine', 'computeTaxLinesForInvoiceDraft') },
  { callerId: idOf(bil, 'CustomerInvoiceLifecycleService', 'createInvoiceFromFulfilledOrder'), calleeId: idOf(bil, 'InvoiceTaxComputationEngine', 'validateVatRegistrationIdentifier') },
  { callerId: idOf(bil, 'CustomerInvoiceLifecycleService', 'createInvoiceFromFulfilledOrder'), calleeId: idOf(bil, 'CheckoutOrderLookupClient', 'fetchOrderSnapshotForInvoicing') },
  { callerId: idOf(bil, 'CustomerInvoiceLifecycleService', 'reissueCorrectedCustomerInvoice'), calleeId: idOf(bil, 'CustomerInvoiceLifecycleService', 'voidIssuedCustomerInvoice') },
  { callerId: idOf(bil, 'CustomerInvoiceLifecycleService', 'reissueCorrectedCustomerInvoice'), calleeId: idOf(bil, 'CustomerInvoiceLifecycleService', 'createInvoiceFromFulfilledOrder') },
  { callerId: idOf(bil, 'CustomerInvoiceLifecycleService', 'applyCreditMemoToInvoice'), calleeId: idOf(bil, 'RefundCreditApplicationClient', 'applyApprovedRefundToInvoice') },
  { callerId: idOf(bil, 'BillingBatchSchedulerService', 'runDailyInvoiceCollectionBatch'), calleeId: idOf(bil, 'BillingInvoiceQueryService', 'listUnpaidInvoicesForAccount') },
  { callerId: idOf(bil, 'BillingBatchSchedulerService', 'runDailyInvoiceCollectionBatch'), calleeId: idOf(bil, 'PaymentSettlementReconciler', 'reconcileChargeAgainstOpenInvoice') },
  { callerId: idOf(bil, 'BillingBatchSchedulerService', 'retryFailedInvoiceCollectionJobs'), calleeId: idOf(bil, 'PaymentSettlementReconciler', 'markInvoiceFullyPaidFromSettlement') },
  { callerId: idOf(bil, 'BillingBatchSchedulerService', 'scheduleMidMonthReconciliationSweep'), calleeId: idOf(bil, 'PaymentSettlementReconciler', 'flagUnmatchedSettlementException') },
  { callerId: idOf(bil, 'PaymentSettlementReconciler', 'reconcileChargeAgainstOpenInvoice'), calleeId: idOf(pay, 'PaymentSettlementQueryService', 'findSettlementByPaymentId') },
  { callerId: idOf(bil, 'PaymentSettlementReconciler', 'markInvoiceFullyPaidFromSettlement'), calleeId: idOf(pay, 'PaymentSettlementQueryService', 'listSettlementsByOrderReference') },
  { callerId: idOf(bil, 'PaymentSettlementReconciler', 'reconcileChargeAgainstOpenInvoice'), calleeId: idOf(pay, 'PaymentLedgerEntryWriter', 'postSuccessfulSettlementEntry') },
  { callerId: idOf(bil, 'CheckoutOrderLookupClient', 'fetchOrderSnapshotForInvoicing'), calleeId: idOf(chk, 'CheckoutOrderQueryService', 'getOrderByReference') },
  { callerId: idOf(bil, 'RefundCreditApplicationClient', 'applyApprovedRefundToInvoice'), calleeId: idOf(ref, 'RefundCaseQueryService', 'findRefundCaseById') },
  { callerId: idOf(bil, 'BillingNotifyBridgeClient', 'emitInvoiceLifecycleNotification'), calleeId: idOf(ntf, 'BillingEventNotificationHook', 'onInvoiceLifecycleDomainEvent') },
  { callerId: idOf(bil, 'IdentityAccountLookupClient', 'resolveBillingAccountOwner'), calleeId: idOf(idn, 'EnterpriseUserDirectoryService', 'findUserProfileById') },
  { callerId: idOf(ref, 'CustomerRefundOrchestrationFacade', 'requestCustomerRefundWorkflow'), calleeId: idOf(ref, 'RefundPolicyDecisionEngine', 'evaluateRefundEligibilityRules') },
  { callerId: idOf(ref, 'CustomerRefundOrchestrationFacade', 'requestCustomerRefundWorkflow'), calleeId: idOf(ref, 'RefundPolicyDecisionEngine', 'evaluateRefundTimeWindowOpen') },
  { callerId: idOf(ref, 'CustomerRefundOrchestrationFacade', 'approvePendingRefundWorkflow'), calleeId: idOf(ref, 'RefundSettlementExecutor', 'executeFullChargeReversal') },
  { callerId: idOf(ref, 'CustomerRefundOrchestrationFacade', 'approvePendingRefundWorkflow'), calleeId: idOf(ref, 'OutboundRefundNotifyClient', 'publishRefundStatusNotification') },
  { callerId: idOf(ref, 'CustomerRefundOrchestrationFacade', 'approvePendingRefundWorkflow'), calleeId: idOf(ref, 'BillingCreditMemoClient', 'requestInvoiceCreditForRefund') },
  { callerId: idOf(ref, 'CustomerRefundOrchestrationFacade', 'approvePendingRefundWorkflow'), calleeId: idOf(ref, 'ReportingRefundFactClient', 'publishRefundVolumeFact') },
  { callerId: idOf(ref, 'CustomerRefundOrchestrationFacade', 'escalateRefundToSupportDesk'), calleeId: idOf(sup, 'SupportTicketLifecycleService', 'openCustomerSupportTicket') },
  { callerId: idOf(ref, 'RefundSettlementExecutor', 'executeFullChargeReversal'), calleeId: idOf(ref, 'DownstreamPaymentReversalClient', 'reverseSettledChargeOnGateway') },
  { callerId: idOf(ref, 'RefundSettlementExecutor', 'executePartialChargeReversal'), calleeId: idOf(ref, 'DownstreamPaymentReversalClient', 'creditWalletOnPaymentGateway') },
  { callerId: idOf(ref, 'RefundSettlementExecutor', 'creditWalletAfterChargeReversal'), calleeId: idOf(ref, 'DownstreamPaymentReversalClient', 'creditWalletOnPaymentGateway') },
  { callerId: idOf(ref, 'DownstreamPaymentReversalClient', 'reverseSettledChargeOnGateway'), calleeId: idOf(pay, 'RealtimePaymentAuthorizationFacade', 'voidAuthorizedCardHold') },
  { callerId: idOf(ref, 'DownstreamPaymentReversalClient', 'reverseSettledChargeOnGateway'), calleeId: idOf(pay, 'PaymentLedgerEntryWriter', 'reversePostedSettlementEntry') },
  { callerId: idOf(ref, 'DownstreamPaymentReversalClient', 'creditWalletOnPaymentGateway'), calleeId: idOf(pay, 'DigitalWalletSettlementProcessor', 'chargeLinkedWalletBalance') },
  { callerId: idOf(ref, 'OutboundRefundNotifyClient', 'publishRefundStatusNotification'), calleeId: idOf(ntf, 'OutboundNotificationDispatchFacade', 'sendSingleChannelNotification') },
  { callerId: idOf(ref, 'BillingCreditMemoClient', 'requestInvoiceCreditForRefund'), calleeId: idOf(bil, 'CustomerInvoiceLifecycleService', 'applyCreditMemoToInvoice') },
  { callerId: idOf(ref, 'ReportingRefundFactClient', 'publishRefundVolumeFact'), calleeId: idOf(rpt, 'OperationalReportingFacade', 'buildRefundVolumeSummaryReport') },
  { callerId: idOf(idn, 'EnterpriseAuthenticationFacade', 'loginWithPasswordCredentials'), calleeId: idOf(idn, 'EnterpriseUserDirectoryService', 'findUserProfileByEmail') },
  { callerId: idOf(idn, 'EnterpriseAuthenticationFacade', 'loginWithPasswordCredentials'), calleeId: idOf(idn, 'MultiFactorChallengeService', 'issueMultiFactorChallenge') },
  { callerId: idOf(idn, 'EnterpriseAuthenticationFacade', 'loginWithPasswordCredentials'), calleeId: idOf(idn, 'AccessTokenIssuanceService', 'issueSignedAccessRefreshTokens') },
  { callerId: idOf(idn, 'EnterpriseAuthenticationFacade', 'loginWithPasswordCredentials'), calleeId: idOf(idn, 'DistributedSessionStore', 'putActiveSessionRecord') },
  { callerId: idOf(idn, 'EnterpriseAuthenticationFacade', 'refreshExpiringAccessSession'), calleeId: idOf(idn, 'AccessTokenIssuanceService', 'issueSignedAccessRefreshTokens') },
  { callerId: idOf(idn, 'EnterpriseAuthenticationFacade', 'logoutActiveUserSession'), calleeId: idOf(idn, 'AccessTokenIssuanceService', 'revokeIssuedAccessToken') },
  { callerId: idOf(idn, 'EnterpriseAuthenticationFacade', 'challengeStepUpAuthentication'), calleeId: idOf(idn, 'MultiFactorChallengeService', 'issueMultiFactorChallenge') },
  { callerId: idOf(idn, 'MultiFactorChallengeService', 'issueMultiFactorChallenge'), calleeId: idOf(idn, 'MultiFactorChallengeService', 'verifyMultiFactorChallengeCode') },
  { callerId: idOf(ntf, 'OutboundNotificationDispatchFacade', 'sendSingleChannelNotification'), calleeId: idOf(ntf, 'UserNotificationPreferenceStore', 'allowsNotificationOnChannel') },
  { callerId: idOf(ntf, 'OutboundNotificationDispatchFacade', 'sendSingleChannelNotification'), calleeId: idOf(ntf, 'EmailDeliveryChannelAdapter', 'renderNotificationEmailTemplate') },
  { callerId: idOf(ntf, 'OutboundNotificationDispatchFacade', 'sendSingleChannelNotification'), calleeId: idOf(ntf, 'EmailDeliveryChannelAdapter', 'deliverRenderedEmailMessage') },
  { callerId: idOf(ntf, 'OutboundNotificationDispatchFacade', 'sendSingleChannelNotification'), calleeId: idOf(ntf, 'SmsDeliveryChannelAdapter', 'deliverSmsNotificationMessage') },
  { callerId: idOf(ntf, 'OutboundNotificationDispatchFacade', 'sendSingleChannelNotification'), calleeId: idOf(ntf, 'PushDeliveryChannelAdapter', 'deliverMobilePushNotification') },
  { callerId: idOf(ntf, 'OutboundNotificationDispatchFacade', 'sendBulkChannelNotifications'), calleeId: idOf(ntf, 'OutboundNotificationDispatchFacade', 'sendSingleChannelNotification') },
  { callerId: idOf(ntf, 'OutboundNotificationDispatchFacade', 'retryFailedNotificationDelivery'), calleeId: idOf(ntf, 'NotificationDeadLetterQueue', 'replayDeadLetterNotification') },
  { callerId: idOf(ntf, 'EmailDeliveryChannelAdapter', 'deliverRenderedEmailMessage'), calleeId: idOf(ntf, 'NotificationDeadLetterQueue', 'enqueueFailedNotificationMessage') },
  { callerId: idOf(ntf, 'RefundEventNotificationHook', 'onRefundLifecycleDomainEvent'), calleeId: idOf(ntf, 'RefundEventNotificationHook', 'fetchRefundSnapshotForNotify') },
  { callerId: idOf(ntf, 'RefundEventNotificationHook', 'fetchRefundSnapshotForNotify'), calleeId: idOf(ref, 'RefundCaseQueryService', 'findRefundCaseById') },
  { callerId: idOf(ntf, 'RefundEventNotificationHook', 'onRefundLifecycleDomainEvent'), calleeId: idOf(ntf, 'OutboundNotificationDispatchFacade', 'sendSingleChannelNotification') },
  { callerId: idOf(ntf, 'PaymentEventNotificationHook', 'onPaymentLifecycleDomainEvent'), calleeId: idOf(ntf, 'OutboundNotificationDispatchFacade', 'sendSingleChannelNotification') },
  { callerId: idOf(ntf, 'BillingEventNotificationHook', 'onInvoiceLifecycleDomainEvent'), calleeId: idOf(ntf, 'OutboundNotificationDispatchFacade', 'sendSingleChannelNotification') },
  { callerId: idOf(ntf, 'SupportDeskNotifyBridge', 'onSupportTicketAgentUpdate'), calleeId: idOf(ntf, 'OutboundNotificationDispatchFacade', 'sendSingleChannelNotification') },
  { callerId: idOf(sf, 'DigitalStorefrontHttpController', 'submitCheckoutFromStorefront'), calleeId: idOf(sf, 'CheckoutOrchestrationGateway', 'placeOrderViaCheckoutEngine') },
  { callerId: idOf(sf, 'DigitalStorefrontHttpController', 'renderActiveShoppingCart'), calleeId: idOf(sf, 'CatalogProductViewAssembler', 'assembleProductDetailPageModel') },
  { callerId: idOf(sf, 'DigitalStorefrontHttpController', 'renderCustomerLoginExperience'), calleeId: idOf(sf, 'IdentitySessionGateway', 'resolveCurrentStorefrontUser') },
  { callerId: idOf(sf, 'DigitalStorefrontHttpController', 'searchCatalogProductListing'), calleeId: idOf(sf, 'CatalogProductViewAssembler', 'searchCatalogProductViewModels') },
  { callerId: idOf(sf, 'CheckoutOrchestrationGateway', 'placeOrderViaCheckoutEngine'), calleeId: idOf(chk, 'RetailCheckoutOrchestrationFacade', 'placeConfirmedCustomerOrder') },
  { callerId: idOf(sf, 'CheckoutOrchestrationGateway', 'previewOrderViaCheckoutEngine'), calleeId: idOf(chk, 'RetailCheckoutOrchestrationFacade', 'previewCheckoutPricingQuote') },
  { callerId: idOf(sf, 'IdentitySessionGateway', 'resolveCurrentStorefrontUser'), calleeId: idOf(idn, 'DistributedSessionStore', 'getActiveSessionRecord') },
  { callerId: idOf(sf, 'IdentitySessionGateway', 'resolveCurrentStorefrontUser'), calleeId: idOf(idn, 'EnterpriseAuthenticationFacade', 'refreshExpiringAccessSession') },
  { callerId: idOf(sf, 'CatalogProductViewAssembler', 'searchCatalogProductViewModels'), calleeId: idOf(sf, 'CatalogProductViewAssembler', 'assembleProductDetailPageModel') },
  { callerId: idOf(sf, 'ReportingBrowseAnalyticsClient', 'publishStorefrontBrowseFact'), calleeId: idOf(rpt, 'OperationalReportingFacade', 'buildPaymentSettlementSummaryReport') },
  { callerId: idOf(sf, 'StorefrontNotifyBridgeClient', 'emitStorefrontLifecycleNotification'), calleeId: idOf(ntf, 'OutboundNotificationDispatchFacade', 'sendSingleChannelNotification') },
  { callerId: idOf(bff, 'MobileCheckoutExperienceApi', 'placeOrderFromMobileClient'), calleeId: idOf(bff, 'MobileCheckoutOrchestrationGateway', 'placeOrderThroughCheckoutEngine') },
  { callerId: idOf(bff, 'MobileCheckoutExperienceApi', 'previewOrderFromMobileClient'), calleeId: idOf(chk, 'RetailCheckoutOrchestrationFacade', 'previewCheckoutPricingQuote') },
  { callerId: idOf(bff, 'MobileAuthenticationExperienceApi', 'loginMobileDeviceSession'), calleeId: idOf(idn, 'EnterpriseAuthenticationFacade', 'loginWithPasswordCredentials') },
  { callerId: idOf(bff, 'MobileAuthenticationExperienceApi', 'refreshMobileDeviceSession'), calleeId: idOf(idn, 'EnterpriseAuthenticationFacade', 'refreshExpiringAccessSession') },
  { callerId: idOf(bff, 'MobileCheckoutOrchestrationGateway', 'placeOrderThroughCheckoutEngine'), calleeId: idOf(chk, 'RetailCheckoutOrchestrationFacade', 'placeConfirmedCustomerOrder') },
  { callerId: idOf(bff, 'MobileIdentityResolutionGateway', 'resolveUserFromDeviceSession'), calleeId: idOf(idn, 'DistributedSessionStore', 'getActiveSessionRecord') },
  { callerId: idOf(bff, 'MobileShoppingCartSyncApi', 'addSkuToDeviceCart'), calleeId: idOf(bff, 'MobileShoppingCartSyncApi', 'synchronizeDeviceCartState') },
  { callerId: idOf(bff, 'MobileShoppingCartSyncApi', 'synchronizeDeviceCartState'), calleeId: idOf(chk, 'ShoppingCartPricingService', 'addCatalogItemToCart') },
  { callerId: idOf(bff, 'MobileNotifyPreferenceBridge', 'registerDevicePushEndpoint'), calleeId: idOf(ntf, 'UserNotificationPreferenceStore', 'updateUserNotificationPreferences') },
  { callerId: idOf(bff, 'MobileNotifyPreferenceBridge', 'emitMobileLifecycleNotification'), calleeId: idOf(ntf, 'OutboundNotificationDispatchFacade', 'sendSingleChannelNotification') },
  { callerId: idOf(rpt, 'OperationalReportingFacade', 'buildPaymentSettlementSummaryReport'), calleeId: idOf(rpt, 'PaymentSettlementIngestWorker', 'pullChargesFromPaymentGateway') },
  { callerId: idOf(rpt, 'OperationalReportingFacade', 'buildPaymentSettlementSummaryReport'), calleeId: idOf(rpt, 'AnalyticsCubeBuilderService', 'buildDailyOperationalAnalyticsCube') },
  { callerId: idOf(rpt, 'OperationalReportingFacade', 'buildInvoiceAgingSummaryReport'), calleeId: idOf(rpt, 'BillingInvoiceIngestWorker', 'pullInvoicesFromBillingEngine') },
  { callerId: idOf(rpt, 'OperationalReportingFacade', 'buildRefundVolumeSummaryReport'), calleeId: idOf(rpt, 'PaymentSettlementIngestWorker', 'normalizePaymentChargeFactRow') },
  { callerId: idOf(rpt, 'OperationalReportingFacade', 'buildSupportTicketVolumeReport'), calleeId: idOf(rpt, 'TicketAnalyticsIngestBridge', 'pullTicketFactsFromAnalytics') },
  { callerId: idOf(rpt, 'PaymentSettlementIngestWorker', 'pullChargesFromPaymentGateway'), calleeId: idOf(pay, 'PaymentSettlementQueryService', 'listSettlementsByOrderReference') },
  { callerId: idOf(rpt, 'PaymentSettlementIngestWorker', 'normalizePaymentChargeFactRow'), calleeId: idOf(pay, 'PaymentSettlementQueryService', 'findSettlementByPaymentId') },
  { callerId: idOf(rpt, 'BillingInvoiceIngestWorker', 'pullInvoicesFromBillingEngine'), calleeId: idOf(bil, 'BillingInvoiceQueryService', 'getInvoiceByIdentifier') },
  { callerId: idOf(rpt, 'BillingInvoiceIngestWorker', 'normalizeBillingInvoiceFactRow'), calleeId: idOf(bil, 'BillingInvoiceQueryService', 'listUnpaidInvoicesForAccount') },
  { callerId: idOf(rpt, 'TicketAnalyticsIngestBridge', 'pullTicketFactsFromAnalytics'), calleeId: idOf(tix, 'TicketAnalyticsQueryService', 'getPublishedTicketStats') },
  { callerId: idOf(rpt, 'AnalyticsCubeBuilderService', 'buildDailyOperationalAnalyticsCube'), calleeId: idOf(rpt, 'AnalyticsCubeBuilderService', 'publishOperationalAnalyticsCube') },
  { callerId: idOf(rpt, 'ReportCatalogQueryService', 'exportPublishedReportAsCsv'), calleeId: idOf(rpt, 'ReportCatalogQueryService', 'getPublishedReportById') },
  { callerId: idOf(rpt, 'IdentityAudienceLookupClient', 'resolveReportAudienceUser'), calleeId: idOf(idn, 'EnterpriseUserDirectoryService', 'findUserProfileById') },
  { callerId: idOf(fin, 'OvernightFinanceBatchOrchestrator', 'runNightlyGeneralLedgerImport'), calleeId: idOf(fin, 'GeneralLedgerImportWorker', 'importLedgerEntriesFromBilling') },
  { callerId: idOf(fin, 'OvernightFinanceBatchOrchestrator', 'runNightlyGeneralLedgerImport'), calleeId: idOf(fin, 'GeneralLedgerImportWorker', 'importLedgerEntriesFromReports') },
  { callerId: idOf(fin, 'OvernightFinanceBatchOrchestrator', 'runNightlyGeneralLedgerImport'), calleeId: idOf(fin, 'GeneralLedgerImportWorker', 'importLedgerEntriesFromPayments') },
  { callerId: idOf(fin, 'OvernightFinanceBatchOrchestrator', 'runNightlyGeneralLedgerImport'), calleeId: idOf(fin, 'GeneralLedgerPostingService', 'postValidatedGeneralLedgerEntry') },
  { callerId: idOf(fin, 'OvernightFinanceBatchOrchestrator', 'runCatchupGeneralLedgerImport'), calleeId: idOf(fin, 'FinanceExceptionQueryService', 'listOpenFinanceExceptions') },
  { callerId: idOf(fin, 'OvernightFinanceBatchOrchestrator', 'runPaymentSettlementCatchupImport'), calleeId: idOf(fin, 'GeneralLedgerImportWorker', 'importLedgerEntriesFromPayments') },
  { callerId: idOf(fin, 'GeneralLedgerImportWorker', 'importLedgerEntriesFromBilling'), calleeId: idOf(bil, 'BillingInvoiceQueryService', 'listUnpaidInvoicesForAccount') },
  { callerId: idOf(fin, 'GeneralLedgerImportWorker', 'importLedgerEntriesFromBilling'), calleeId: idOf(bil, 'CustomerInvoiceLifecycleService', 'createInvoiceFromFulfilledOrder') },
  { callerId: idOf(fin, 'GeneralLedgerImportWorker', 'importLedgerEntriesFromReports'), calleeId: idOf(rpt, 'OperationalReportingFacade', 'buildPaymentSettlementSummaryReport') },
  { callerId: idOf(fin, 'GeneralLedgerImportWorker', 'importLedgerEntriesFromReports'), calleeId: idOf(rpt, 'AnalyticsCubeBuilderService', 'publishOperationalAnalyticsCube') },
  { callerId: idOf(fin, 'GeneralLedgerImportWorker', 'importLedgerEntriesFromPayments'), calleeId: idOf(pay, 'PaymentSettlementQueryService', 'listFailedSettlementsForRetry') },
  { callerId: idOf(fin, 'GeneralLedgerImportWorker', 'importLedgerEntriesFromPayments'), calleeId: idOf(pay, 'PaymentLedgerEntryWriter', 'postSuccessfulSettlementEntry') },
  { callerId: idOf(fin, 'GeneralLedgerPostingService', 'reversePostedGeneralLedgerEntry'), calleeId: idOf(fin, 'FinanceExceptionQueryService', 'computeTrialBalanceSnapshot') },
  { callerId: idOf(sup, 'SupportTicketLifecycleService', 'openCustomerSupportTicket'), calleeId: idOf(sup, 'SupportTicketQueryService', 'getSupportTicketById') },
  { callerId: idOf(sup, 'SupportTicketLifecycleService', 'escalateCustomerSupportTicket'), calleeId: idOf(sup, 'SupportNotifyBridgeClient', 'notifyAgentOfTicketUpdate') },
  { callerId: idOf(sup, 'SupportTicketLifecycleService', 'closeCustomerSupportTicket'), calleeId: idOf(sup, 'SupportNotifyBridgeClient', 'notifyAgentOfTicketUpdate') },
  { callerId: idOf(sup, 'SupportTicketLifecycleService', 'reassignTicketToCareQueue'), calleeId: idOf(sup, 'SupportNotifyBridgeClient', 'notifyAgentOfTicketUpdate') },
  { callerId: idOf(sup, 'RefundWorkflowBridgeClient', 'startRefundFromSupportTicket'), calleeId: idOf(ref, 'CustomerRefundOrchestrationFacade', 'requestCustomerRefundWorkflow') },
  { callerId: idOf(sup, 'RefundWorkflowBridgeClient', 'getRefundStatusForSupportTicket'), calleeId: idOf(ref, 'RefundCaseQueryService', 'findRefundCaseById') },
  { callerId: idOf(sup, 'SupportNotifyBridgeClient', 'notifyAgentOfTicketUpdate'), calleeId: idOf(ntf, 'SupportDeskNotifyBridge', 'onSupportTicketAgentUpdate') },
  { callerId: idOf(sup, 'IdentityAgentLookupClient', 'resolveAgentUserProfile'), calleeId: idOf(idn, 'EnterpriseUserDirectoryService', 'findUserProfileById') },
  { callerId: idOf(care, 'CustomerCareInteractionFacade', 'handleInboundCustomerCall'), calleeId: idOf(care, 'SupportDeskCaseClient', 'openSupportTicketFromCareCase') },
  { callerId: idOf(care, 'CustomerCareInteractionFacade', 'handleInboundCustomerChat'), calleeId: idOf(care, 'SupportDeskCaseClient', 'linkCareCaseToSupportTicket') },
  { callerId: idOf(care, 'CustomerCareInteractionFacade', 'handleInboundCustomerCall'), calleeId: idOf(care, 'CareCaseQueryService', 'listCareHistoryForCustomer') },
  { callerId: idOf(care, 'CustomerCareInteractionFacade', 'summarizeCustomerCareHistory'), calleeId: idOf(care, 'CareCaseQueryService', 'listCareHistoryForCustomer') },
  { callerId: idOf(care, 'SupportDeskCaseClient', 'openSupportTicketFromCareCase'), calleeId: idOf(sup, 'SupportTicketLifecycleService', 'openCustomerSupportTicket') },
  { callerId: idOf(care, 'SupportDeskCaseClient', 'linkCareCaseToSupportTicket'), calleeId: idOf(sup, 'SupportTicketQueryService', 'getSupportTicketById') },
  { callerId: idOf(care, 'CareNotifyBridgeClient', 'emitCareInteractionNotification'), calleeId: idOf(ntf, 'OutboundNotificationDispatchFacade', 'sendSingleChannelNotification') },
  { callerId: idOf(tix, 'SupportTicketAnalyticsFacade', 'computeDailyTicketVolumeStats'), calleeId: idOf(tix, 'CareCaseIngestWorker', 'pullCareCasesForAnalytics') },
  { callerId: idOf(tix, 'SupportTicketAnalyticsFacade', 'computeDailyTicketVolumeStats'), calleeId: idOf(tix, 'TicketAggregationBuilder', 'buildDailyTicketAggregation') },
  { callerId: idOf(tix, 'SupportTicketAnalyticsFacade', 'computeAgentPerformanceScore'), calleeId: idOf(tix, 'CareCaseIngestWorker', 'normalizeCareCaseFactRow') },
  { callerId: idOf(tix, 'SupportTicketAnalyticsFacade', 'publishTicketFactsToReporting'), calleeId: idOf(tix, 'ReportingTicketFactPublisher', 'pushTicketFactsIntoReporting') },
  { callerId: idOf(tix, 'CareCaseIngestWorker', 'pullCareCasesForAnalytics'), calleeId: idOf(care, 'CareCaseQueryService', 'listCareHistoryForCustomer') },
  { callerId: idOf(tix, 'CareCaseIngestWorker', 'normalizeCareCaseFactRow'), calleeId: idOf(care, 'CareCaseQueryService', 'listActiveCareCasesForAgent') },
  { callerId: idOf(tix, 'TicketAggregationBuilder', 'buildDailyTicketAggregation'), calleeId: idOf(tix, 'TicketAggregationBuilder', 'publishTicketAggregationCube') },
  { callerId: idOf(tix, 'ReportingTicketFactPublisher', 'pushTicketFactsIntoReporting'), calleeId: idOf(rpt, 'OperationalReportingFacade', 'buildSupportTicketVolumeReport') },
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

/**
 * Etki haritası “bağlı metodlar”: pivot servisle çapraz çağrısı olan metodlar.
 * - Aynı servis: dışarı çağıran / dışarı çağırılan
 * - Diğer servis: pivot’u çağıran veya pivot tarafından çağrılan
 */
export function listMethodsLinkedToPivot(
  serviceId: string,
  pivotServiceId: string,
): MethodRef[] {
  return listMethodRefsForService(serviceId).filter((m) => {
    const callers = callersIndex.get(m.id) ?? []
    const callees = calleesIndex.get(m.id) ?? []
    if (serviceId === pivotServiceId) {
      const extCaller = callers.some(
        (id) => byId[id]?.serviceId !== pivotServiceId,
      )
      const extCallee = callees.some(
        (id) => byId[id]?.serviceId !== pivotServiceId,
      )
      return extCaller || extCallee
    }
    const callsPivot = callees.some(
      (id) => byId[id]?.serviceId === pivotServiceId,
    )
    const calledByPivot = callers.some(
      (id) => byId[id]?.serviceId === pivotServiceId,
    )
    return callsPivot || calledByPivot
  })
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
  const dot = q.indexOf('.')
  const classPart = dot >= 0 ? q.slice(0, dot) : ''
  const namePart = dot >= 0 ? q.slice(dot + 1) : ''
  return methods
    .filter((m) => {
      const cn = m.className.toLowerCase()
      const mn = m.name.toLowerCase()
      const full = `${cn}.${mn}`
      const svc = (services[m.serviceId]?.name ?? '').toLowerCase()
      if (full.includes(q) || m.id.toLowerCase().includes(q) || svc.includes(q)) {
        return true
      }
      // CardProcessor.charge → nokta sonrası da öneri kalsın
      if (dot >= 0) {
        return (
          (!classPart || cn.includes(classPart)) &&
          (!namePart || mn.includes(namePart) || mn.startsWith(namePart))
        )
      }
      return mn.includes(q) || cn.includes(q)
    })
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
