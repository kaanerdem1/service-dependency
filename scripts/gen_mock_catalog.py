#!/usr/bin/env python3
"""
Mock katalog üretici.

Ne yapar?
  1) Method + callEdges listesini üretir
  2) Çapraz çağrılardan affectsEdges türetir
  3) server/src/{methods,data}.ts ve web/src/mock/{methods,data}.ts dosyalarını yamar

Ne zaman çalıştır?
  Method / call-graph mock’unu yeniden üretmek istediğinde.
  Sonra API’yi restart et; isteğe bağlı:
    curl -s http://127.0.0.1:4000/api/meta/call-graph-consistency
"""
from __future__ import annotations

from collections import defaultdict
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]

NAMES = {
    "svc-payment": "core_realtime_card_payment_authorization_settlement_gateway",
    "svc-checkout": "retail_checkout_order_cart_orchestration_workflow_engine",
    "svc-billing": "customer_billing_invoice_tax_reconciliation_engine",
    "svc-refund": "customer_refund_chargeback_reversal_settlement_processor",
    "svc-storefront": "digital_storefront_catalog_checkout_experience_api",
    "svc-mobile-bff": "mobile_channel_backend_for_frontend_gateway_adapter",
    "svc-identity": "enterprise_identity_session_directory_access_control",
    "svc-notify": "outbound_multichannel_notification_delivery_router",
    "svc-support-desk": "customer_support_desk_case_routing_orchestrator",
    "svc-customer-care": "customer_care_interaction_history_assistance_portal",
    "svc-report": "enterprise_operational_reporting_analytics_pipeline",
    "svc-finance-batch": "overnight_general_ledger_finance_batch_import_job_runner",
    "svc-ticket-analytics": "support_ticket_analytics_insight_warehouse_service",
}

A = {
    "pay": "svc-payment",
    "chk": "svc-checkout",
    "bil": "svc-billing",
    "ref": "svc-refund",
    "idn": "svc-identity",
    "ntf": "svc-notify",
    "sf": "svc-storefront",
    "bff": "svc-mobile-bff",
    "rpt": "svc-report",
    "fin": "svc-finance-batch",
    "sup": "svc-support-desk",
    "care": "svc-customer-care",
    "tix": "svc-ticket-analytics",
}

methods: list[tuple[str, str, str, str]] = []
edges: list[tuple[str, str, str, str, str, str]] = []
jar_methods = [
    ("proj-commerce", "pkg-payments", "PaymentsSharedContractValidator", "validatePaymentContractEnvelope", "(PaymentContract): ValidationResult"),
    ("proj-commerce", "pkg-orders", "CheckoutOrderEventSchema", "normalizeCheckoutOrderEvent", "(OrderEvent): NormalizedOrderEvent"),
]
jar_edge_lines = [
    "  { callerId: idOf(pay, 'RealtimePaymentAuthorizationFacade', 'executeCardPaymentSettlement'), calleeId: idOfJar(pkgPayments, 'PaymentsSharedContractValidator', 'validatePaymentContractEnvelope') },",
    "  { callerId: idOfJar(pkgPayments, 'PaymentsSharedContractValidator', 'validatePaymentContractEnvelope'), calleeId: idOf(pay, 'PaymentIdempotencyGuardStore', 'beginIdempotentPaymentOperation') },",
    "  { callerId: idOf(chk, 'RetailCheckoutOrchestrationFacade', 'placeConfirmedCustomerOrder'), calleeId: idOfJar(pkgOrders, 'CheckoutOrderEventSchema', 'normalizeCheckoutOrderEvent') },",
    "  { callerId: idOfJar(pkgOrders, 'CheckoutOrderEventSchema', 'normalizeCheckoutOrderEvent'), calleeId: idOf(chk, 'CheckoutOrderQueryService', 'getOrderByReference') },",
]


def add(alias: str, cls: str, name: str, sig: str = "(): void") -> None:
    methods.append((alias, cls, name, sig))


def edge(a: str, c: str, n: str, a2: str, c2: str, n2: str) -> None:
    edges.append((a, c, n, a2, c2, n2))


def build() -> None:
    # —— Payment ——
    add("pay", "RealtimePaymentAuthorizationFacade", "executeCardPaymentSettlement", "(ChargeCmd): ChargeResult")
    add("pay", "RealtimePaymentAuthorizationFacade", "authorizePendingCardHold", "(AuthCmd): AuthResult")
    add("pay", "RealtimePaymentAuthorizationFacade", "captureAuthorizedCardHold", "(CaptureCmd): CaptureResult")
    add("pay", "RealtimePaymentAuthorizationFacade", "voidAuthorizedCardHold", "(VoidCmd): void")
    add("pay", "RealtimePaymentAuthorizationFacade", "retryFailedSettlementBatch", "(BatchId): BatchResult")
    add("pay", "CardNetworkTokenizationProcessor", "tokenizeSensitiveCardMaterial", "(CardDto): Token")
    add("pay", "CardNetworkTokenizationProcessor", "chargeTokenizedCardInstrument", "(Token, Money): ChargeResult")
    add("pay", "CardNetworkTokenizationProcessor", "validateIssuerBinRangeRules", "(String): boolean")
    add("pay", "CardNetworkTokenizationProcessor", "refreshNetworkTokenLifecycle", "(Token): Token")
    add("pay", "DigitalWalletSettlementProcessor", "chargeLinkedWalletBalance", "(WalletId, Money): ChargeResult")
    add("pay", "DigitalWalletSettlementProcessor", "reserveWalletSpendingLimit", "(WalletId, Money): Reservation")
    add("pay", "DigitalWalletSettlementProcessor", "releaseReservedWalletFunds", "(Reservation): void")
    add("pay", "RealtimeFraudScoringGate", "scoreIncomingPaymentRisk", "(ChargeCmd): FraudScore")
    add("pay", "RealtimeFraudScoringGate", "blockHighRiskPaymentAttempt", "(FraudScore): void")
    add("pay", "RealtimeFraudScoringGate", "enrichRiskWithDeviceSignals", "(ChargeCmd): FraudScore")
    add("pay", "PaymentLedgerEntryWriter", "postSuccessfulSettlementEntry", "(LedgerEntry): void")
    add("pay", "PaymentLedgerEntryWriter", "reversePostedSettlementEntry", "(EntryId): void")
    add("pay", "PaymentLedgerEntryWriter", "appendCompensatingLedgerNote", "(EntryId, Note): void")
    add("pay", "PaymentSettlementQueryService", "findSettlementByPaymentId", "(PaymentId): Payment")
    add("pay", "PaymentSettlementQueryService", "listSettlementsByOrderReference", "(OrderId): List<Payment>")
    add("pay", "PaymentSettlementQueryService", "listFailedSettlementsForRetry", "(Range): List<Payment>")
    add("pay", "PaymentIdempotencyGuardStore", "beginIdempotentPaymentOperation", "(Key): boolean")
    add("pay", "PaymentIdempotencyGuardStore", "completeIdempotentPaymentOperation", "(Key, Result): void")
    add("pay", "PaymentNotifyBridgeClient", "emitPaymentLifecycleNotification", "(PaymentEvent): void")

    # —— Checkout ——
    add("chk", "RetailCheckoutOrchestrationFacade", "placeConfirmedCustomerOrder", "(CheckoutCmd): Order")
    add("chk", "RetailCheckoutOrchestrationFacade", "previewCheckoutPricingQuote", "(CheckoutCmd): Preview")
    add("chk", "RetailCheckoutOrchestrationFacade", "cancelUncommittedCheckoutDraft", "(DraftId): void")
    add("chk", "RetailCheckoutOrchestrationFacade", "resumeAbandonedCheckoutSession", "(DraftId): Draft")
    add("chk", "ShoppingCartPricingService", "addCatalogItemToCart", "(CartId, Sku): Cart")
    add("chk", "ShoppingCartPricingService", "removeCatalogItemFromCart", "(CartId, Sku): Cart")
    add("chk", "ShoppingCartPricingService", "repriceCartWithPromotions", "(CartId): Cart")
    add("chk", "ShoppingCartPricingService", "mergeGuestAndUserCarts", "(CartId, CartId): Cart")
    add("chk", "DownstreamPaymentGatewayClient", "chargeOrderThroughPaymentGateway", "(Order): ChargeResult")
    add("chk", "DownstreamPaymentGatewayClient", "authorizeOrderThroughPaymentGateway", "(Order): AuthResult")
    add("chk", "DownstreamPaymentGatewayClient", "queryOrderPaymentSettlementStatus", "(OrderId): Status")
    add("chk", "InventoryReservationClient", "reserveStockForCheckoutOrder", "(Order): Reservation")
    add("chk", "InventoryReservationClient", "releaseReservedCheckoutStock", "(Reservation): void")
    add("chk", "IdentitySessionResolutionClient", "resolveUserFromActiveSession", "(Session): User")
    add("chk", "OutboundNotificationClient", "notifyCustomerOrderPlaced", "(Order): void")
    add("chk", "OutboundNotificationClient", "notifyCustomerCheckoutAbandoned", "(Draft): void")
    add("chk", "BillingInvoiceHandoffClient", "openInvoiceForCompletedOrder", "(Order): Invoice")
    add("chk", "CheckoutOrderQueryService", "getOrderByReference", "(OrderId): Order")
    add("chk", "CheckoutOrderQueryService", "listOpenOrdersForUser", "(UserId): List<Order>")

    # —— Billing ——
    add("bil", "CustomerInvoiceLifecycleService", "createInvoiceFromFulfilledOrder", "(Order): Invoice")
    add("bil", "CustomerInvoiceLifecycleService", "voidIssuedCustomerInvoice", "(InvoiceId): void")
    add("bil", "CustomerInvoiceLifecycleService", "reissueCorrectedCustomerInvoice", "(InvoiceId): Invoice")
    add("bil", "CustomerInvoiceLifecycleService", "applyCreditMemoToInvoice", "(InvoiceId, Money): Invoice")
    add("bil", "BillingBatchSchedulerService", "runDailyInvoiceCollectionBatch", "(): BatchResult")
    add("bil", "BillingBatchSchedulerService", "retryFailedInvoiceCollectionJobs", "(): BatchResult")
    add("bil", "BillingBatchSchedulerService", "scheduleMidMonthReconciliationSweep", "(): void")
    add("bil", "PaymentSettlementReconciler", "reconcileChargeAgainstOpenInvoice", "(ChargeId): void")
    add("bil", "PaymentSettlementReconciler", "markInvoiceFullyPaidFromSettlement", "(InvoiceId): void")
    add("bil", "PaymentSettlementReconciler", "flagUnmatchedSettlementException", "(ChargeId): Exception")
    add("bil", "InvoiceTaxComputationEngine", "computeTaxLinesForInvoiceDraft", "(InvoiceDraft): TaxLines")
    add("bil", "InvoiceTaxComputationEngine", "validateVatRegistrationIdentifier", "(VatId): boolean")
    add("bil", "BillingInvoiceQueryService", "getInvoiceByIdentifier", "(InvoiceId): Invoice")
    add("bil", "BillingInvoiceQueryService", "listUnpaidInvoicesForAccount", "(AccountId): List<Invoice>")
    add("bil", "CheckoutOrderLookupClient", "fetchOrderSnapshotForInvoicing", "(OrderId): Order")
    add("bil", "RefundCreditApplicationClient", "applyApprovedRefundToInvoice", "(RefundId): void")
    add("bil", "BillingNotifyBridgeClient", "emitInvoiceLifecycleNotification", "(InvoiceEvent): void")
    add("bil", "IdentityAccountLookupClient", "resolveBillingAccountOwner", "(AccountId): User")

    # —— Refund ——
    add("ref", "CustomerRefundOrchestrationFacade", "requestCustomerRefundWorkflow", "(RefundCmd): Refund")
    add("ref", "CustomerRefundOrchestrationFacade", "approvePendingRefundWorkflow", "(RefundId): Refund")
    add("ref", "CustomerRefundOrchestrationFacade", "rejectPendingRefundWorkflow", "(RefundId, Reason): void")
    add("ref", "CustomerRefundOrchestrationFacade", "escalateRefundToSupportDesk", "(RefundId): Ticket")
    add("ref", "RefundSettlementExecutor", "executeFullChargeReversal", "(Refund): RefundResult")
    add("ref", "RefundSettlementExecutor", "executePartialChargeReversal", "(Refund, Money): RefundResult")
    add("ref", "RefundSettlementExecutor", "creditWalletAfterChargeReversal", "(Refund): void")
    add("ref", "DownstreamPaymentReversalClient", "reverseSettledChargeOnGateway", "(ChargeId): void")
    add("ref", "DownstreamPaymentReversalClient", "creditWalletOnPaymentGateway", "(WalletId, Money): void")
    add("ref", "OutboundRefundNotifyClient", "publishRefundStatusNotification", "(Refund): void")
    add("ref", "BillingCreditMemoClient", "requestInvoiceCreditForRefund", "(Refund): void")
    add("ref", "ReportingRefundFactClient", "publishRefundVolumeFact", "(Refund): void")
    add("ref", "RefundPolicyDecisionEngine", "evaluateRefundEligibilityRules", "(Order, Money): boolean")
    add("ref", "RefundPolicyDecisionEngine", "evaluateRefundTimeWindowOpen", "(Order): boolean")
    add("ref", "RefundCaseQueryService", "findRefundCaseById", "(RefundId): Refund")
    add("ref", "RefundCaseQueryService", "listRefundsByOrderReference", "(OrderId): List<Refund>")

    # —— Identity ——
    add("idn", "EnterpriseAuthenticationFacade", "loginWithPasswordCredentials", "(Creds): Session")
    add("idn", "EnterpriseAuthenticationFacade", "logoutActiveUserSession", "(Session): void")
    add("idn", "EnterpriseAuthenticationFacade", "refreshExpiringAccessSession", "(RefreshToken): Session")
    add("idn", "EnterpriseAuthenticationFacade", "challengeStepUpAuthentication", "(User): Challenge")
    add("idn", "AccessTokenIssuanceService", "issueSignedAccessRefreshTokens", "(User): Tokens")
    add("idn", "AccessTokenIssuanceService", "revokeIssuedAccessToken", "(TokenId): void")
    add("idn", "AccessTokenIssuanceService", "introspectPresentedAccessToken", "(Token): Claims")
    add("idn", "EnterpriseUserDirectoryService", "findUserProfileById", "(UserId): User")
    add("idn", "EnterpriseUserDirectoryService", "findUserProfileByEmail", "(Email): User")
    add("idn", "EnterpriseUserDirectoryService", "updateUserProfilePatch", "(UserId, Patch): User")
    add("idn", "EnterpriseUserDirectoryService", "listUsersInSecurityGroup", "(GroupId): List<User>")
    add("idn", "DistributedSessionStore", "putActiveSessionRecord", "(Session): void")
    add("idn", "DistributedSessionStore", "getActiveSessionRecord", "(SessionId): Session")
    add("idn", "DistributedSessionStore", "evictExpiredSessionRecord", "(SessionId): void")
    add("idn", "MultiFactorChallengeService", "issueMultiFactorChallenge", "(User): Challenge")
    add("idn", "MultiFactorChallengeService", "verifyMultiFactorChallengeCode", "(Challenge, Code): boolean")

    # —— Notify ——
    add("ntf", "OutboundNotificationDispatchFacade", "sendSingleChannelNotification", "(NotifyCmd): void")
    add("ntf", "OutboundNotificationDispatchFacade", "sendBulkChannelNotifications", "(List<NotifyCmd>): BulkResult")
    add("ntf", "OutboundNotificationDispatchFacade", "retryFailedNotificationDelivery", "(NotifyId): void")
    add("ntf", "EmailDeliveryChannelAdapter", "deliverRenderedEmailMessage", "(EmailMsg): void")
    add("ntf", "EmailDeliveryChannelAdapter", "renderNotificationEmailTemplate", "(TemplateId, Map): String")
    add("ntf", "SmsDeliveryChannelAdapter", "deliverSmsNotificationMessage", "(SmsMsg): void")
    add("ntf", "PushDeliveryChannelAdapter", "deliverMobilePushNotification", "(PushMsg): void")
    add("ntf", "UserNotificationPreferenceStore", "allowsNotificationOnChannel", "(UserId, Channel): boolean")
    add("ntf", "UserNotificationPreferenceStore", "updateUserNotificationPreferences", "(UserId, Prefs): void")
    add("ntf", "NotificationDeliveryQueryService", "getNotificationDeliveryStatus", "(NotifyId): Status")
    add("ntf", "NotificationDeadLetterQueue", "enqueueFailedNotificationMessage", "(FailedMsg): void")
    add("ntf", "NotificationDeadLetterQueue", "replayDeadLetterNotification", "(DlqId): void")
    add("ntf", "RefundEventNotificationHook", "onRefundLifecycleDomainEvent", "(RefundEvent): void")
    add("ntf", "RefundEventNotificationHook", "fetchRefundSnapshotForNotify", "(RefundId): Refund")
    add("ntf", "PaymentEventNotificationHook", "onPaymentLifecycleDomainEvent", "(PaymentEvent): void")
    add("ntf", "BillingEventNotificationHook", "onInvoiceLifecycleDomainEvent", "(InvoiceEvent): void")
    add("ntf", "SupportDeskNotifyBridge", "onSupportTicketAgentUpdate", "(Ticket): void")

    # —— Storefront ——
    add("sf", "DigitalStorefrontHttpController", "submitCheckoutFromStorefront", "(HttpReq): HttpRes")
    add("sf", "DigitalStorefrontHttpController", "renderActiveShoppingCart", "(HttpReq): HttpRes")
    add("sf", "DigitalStorefrontHttpController", "renderCustomerLoginExperience", "(HttpReq): HttpRes")
    add("sf", "DigitalStorefrontHttpController", "searchCatalogProductListing", "(HttpReq): HttpRes")
    add("sf", "CheckoutOrchestrationGateway", "placeOrderViaCheckoutEngine", "(CheckoutCmd): Order")
    add("sf", "CheckoutOrchestrationGateway", "previewOrderViaCheckoutEngine", "(CheckoutCmd): Preview")
    add("sf", "IdentitySessionGateway", "resolveCurrentStorefrontUser", "(Cookie): User")
    add("sf", "CatalogProductViewAssembler", "assembleProductDetailPageModel", "(Sku): ProductVm")
    add("sf", "CatalogProductViewAssembler", "searchCatalogProductViewModels", "(Query): List<ProductVm>")
    add("sf", "ReportingBrowseAnalyticsClient", "publishStorefrontBrowseFact", "(BrowseEvent): void")
    add("sf", "StorefrontNotifyBridgeClient", "emitStorefrontLifecycleNotification", "(StorefrontEvent): void")

    # —— Mobile ——
    add("bff", "MobileCheckoutExperienceApi", "placeOrderFromMobileClient", "(MobileCheckout): Order")
    add("bff", "MobileCheckoutExperienceApi", "previewOrderFromMobileClient", "(MobileCheckout): Preview")
    add("bff", "MobileAuthenticationExperienceApi", "loginMobileDeviceSession", "(MobileCreds): Session")
    add("bff", "MobileAuthenticationExperienceApi", "refreshMobileDeviceSession", "(RefreshToken): Session")
    add("bff", "MobileCheckoutOrchestrationGateway", "placeOrderThroughCheckoutEngine", "(CheckoutCmd): Order")
    add("bff", "MobileIdentityResolutionGateway", "resolveUserFromDeviceSession", "(DeviceSession): User")
    add("bff", "MobileShoppingCartSyncApi", "synchronizeDeviceCartState", "(DeviceCart): Cart")
    add("bff", "MobileShoppingCartSyncApi", "addSkuToDeviceCart", "(Sku): Cart")
    add("bff", "MobileNotifyPreferenceBridge", "registerDevicePushEndpoint", "(DeviceToken): void")
    add("bff", "MobileNotifyPreferenceBridge", "emitMobileLifecycleNotification", "(MobileEvent): void")

    # —— Report ——
    add("rpt", "OperationalReportingFacade", "buildPaymentSettlementSummaryReport", "(Range): Report")
    add("rpt", "OperationalReportingFacade", "buildInvoiceAgingSummaryReport", "(Range): Report")
    add("rpt", "OperationalReportingFacade", "buildRefundVolumeSummaryReport", "(Range): Report")
    add("rpt", "OperationalReportingFacade", "buildSupportTicketVolumeReport", "(Range): Report")
    add("rpt", "PaymentSettlementIngestWorker", "pullChargesFromPaymentGateway", "(Range): List<ChargeRow>")
    add("rpt", "PaymentSettlementIngestWorker", "normalizePaymentChargeFactRow", "(ChargeRow): Fact")
    add("rpt", "BillingInvoiceIngestWorker", "pullInvoicesFromBillingEngine", "(Range): List<InvoiceRow>")
    add("rpt", "BillingInvoiceIngestWorker", "normalizeBillingInvoiceFactRow", "(InvoiceRow): Fact")
    add("rpt", "TicketAnalyticsIngestBridge", "pullTicketFactsFromAnalytics", "(Range): List<TicketFact>")
    add("rpt", "AnalyticsCubeBuilderService", "buildDailyOperationalAnalyticsCube", "(Date): Cube")
    add("rpt", "AnalyticsCubeBuilderService", "publishOperationalAnalyticsCube", "(Cube): void")
    add("rpt", "ReportCatalogQueryService", "getPublishedReportById", "(ReportId): Report")
    add("rpt", "ReportCatalogQueryService", "exportPublishedReportAsCsv", "(ReportId): Stream")
    add("rpt", "IdentityAudienceLookupClient", "resolveReportAudienceUser", "(UserId): User")

    # —— Finance ——
    add("fin", "OvernightFinanceBatchOrchestrator", "runNightlyGeneralLedgerImport", "(): BatchResult")
    add("fin", "OvernightFinanceBatchOrchestrator", "runCatchupGeneralLedgerImport", "(Date): BatchResult")
    add("fin", "OvernightFinanceBatchOrchestrator", "runPaymentSettlementCatchupImport", "(Date): BatchResult")
    add("fin", "GeneralLedgerImportWorker", "importLedgerEntriesFromBilling", "(Date): void")
    add("fin", "GeneralLedgerImportWorker", "importLedgerEntriesFromReports", "(Date): void")
    add("fin", "GeneralLedgerImportWorker", "importLedgerEntriesFromPayments", "(Date): void")
    add("fin", "GeneralLedgerPostingService", "postValidatedGeneralLedgerEntry", "(GlEntry): void")
    add("fin", "GeneralLedgerPostingService", "reversePostedGeneralLedgerEntry", "(GlEntryId): void")
    add("fin", "FinanceExceptionQueryService", "computeTrialBalanceSnapshot", "(Date): Balance")
    add("fin", "FinanceExceptionQueryService", "listOpenFinanceExceptions", "(): List<Exception>")

    # —— Support ——
    add("sup", "SupportTicketLifecycleService", "openCustomerSupportTicket", "(TicketCmd): Ticket")
    add("sup", "SupportTicketLifecycleService", "closeCustomerSupportTicket", "(TicketId): void")
    add("sup", "SupportTicketLifecycleService", "escalateCustomerSupportTicket", "(TicketId): void")
    add("sup", "SupportTicketLifecycleService", "reassignTicketToCareQueue", "(TicketId): void")
    add("sup", "RefundWorkflowBridgeClient", "startRefundFromSupportTicket", "(Ticket): Refund")
    add("sup", "RefundWorkflowBridgeClient", "getRefundStatusForSupportTicket", "(RefundId): Status")
    add("sup", "SupportNotifyBridgeClient", "notifyAgentOfTicketUpdate", "(Ticket): void")
    add("sup", "IdentityAgentLookupClient", "resolveAgentUserProfile", "(AgentId): User")
    add("sup", "SupportTicketQueryService", "getSupportTicketById", "(TicketId): Ticket")
    add("sup", "SupportTicketQueryService", "listOpenTicketsForAgent", "(AgentId): List<Ticket>")

    # —— Care ——
    add("care", "CustomerCareInteractionFacade", "handleInboundCustomerCall", "(CallCtx): CareResult")
    add("care", "CustomerCareInteractionFacade", "handleInboundCustomerChat", "(ChatCtx): CareResult")
    add("care", "CustomerCareInteractionFacade", "summarizeCustomerCareHistory", "(CustomerId): Summary")
    add("care", "SupportDeskCaseClient", "openSupportTicketFromCareCase", "(CareCase): Ticket")
    add("care", "SupportDeskCaseClient", "linkCareCaseToSupportTicket", "(CareCase, TicketId): void")
    add("care", "CareNotifyBridgeClient", "emitCareInteractionNotification", "(CareCase): void")
    add("care", "CareCaseQueryService", "listCareHistoryForCustomer", "(CustomerId): List<CareCase>")
    add("care", "CareCaseQueryService", "listActiveCareCasesForAgent", "(AgentId): List<CareCase>")

    # —— Ticket analytics ——
    add("tix", "SupportTicketAnalyticsFacade", "computeDailyTicketVolumeStats", "(Date): Stats")
    add("tix", "SupportTicketAnalyticsFacade", "computeAgentPerformanceScore", "(AgentId, Range): Score")
    add("tix", "SupportTicketAnalyticsFacade", "publishTicketFactsToReporting", "(Date): void")
    add("tix", "CareCaseIngestWorker", "pullCareCasesForAnalytics", "(Range): List<CaseRow>")
    add("tix", "CareCaseIngestWorker", "normalizeCareCaseFactRow", "(CaseRow): Fact")
    add("tix", "TicketAggregationBuilder", "buildDailyTicketAggregation", "(Date): Agg")
    add("tix", "TicketAggregationBuilder", "publishTicketAggregationCube", "(Agg): void")
    add("tix", "TicketAnalyticsQueryService", "getPublishedTicketStats", "(StatsId): Stats")
    add("tix", "ReportingTicketFactPublisher", "pushTicketFactsIntoReporting", "(Agg): void")

    # edges — payment
    edge("pay", "RealtimePaymentAuthorizationFacade", "executeCardPaymentSettlement", "pay", "PaymentIdempotencyGuardStore", "beginIdempotentPaymentOperation")
    edge("pay", "RealtimePaymentAuthorizationFacade", "executeCardPaymentSettlement", "pay", "RealtimeFraudScoringGate", "scoreIncomingPaymentRisk")
    edge("pay", "RealtimePaymentAuthorizationFacade", "executeCardPaymentSettlement", "pay", "RealtimeFraudScoringGate", "blockHighRiskPaymentAttempt")
    edge("pay", "RealtimePaymentAuthorizationFacade", "executeCardPaymentSettlement", "pay", "CardNetworkTokenizationProcessor", "chargeTokenizedCardInstrument")
    edge("pay", "RealtimePaymentAuthorizationFacade", "executeCardPaymentSettlement", "pay", "DigitalWalletSettlementProcessor", "chargeLinkedWalletBalance")
    edge("pay", "RealtimePaymentAuthorizationFacade", "executeCardPaymentSettlement", "pay", "PaymentLedgerEntryWriter", "postSuccessfulSettlementEntry")
    edge("pay", "RealtimePaymentAuthorizationFacade", "executeCardPaymentSettlement", "pay", "PaymentIdempotencyGuardStore", "completeIdempotentPaymentOperation")
    edge("pay", "RealtimePaymentAuthorizationFacade", "executeCardPaymentSettlement", "pay", "PaymentNotifyBridgeClient", "emitPaymentLifecycleNotification")
    edge("pay", "RealtimePaymentAuthorizationFacade", "authorizePendingCardHold", "pay", "RealtimeFraudScoringGate", "scoreIncomingPaymentRisk")
    edge("pay", "RealtimePaymentAuthorizationFacade", "authorizePendingCardHold", "pay", "CardNetworkTokenizationProcessor", "tokenizeSensitiveCardMaterial")
    edge("pay", "RealtimePaymentAuthorizationFacade", "captureAuthorizedCardHold", "pay", "PaymentLedgerEntryWriter", "postSuccessfulSettlementEntry")
    edge("pay", "RealtimePaymentAuthorizationFacade", "voidAuthorizedCardHold", "pay", "PaymentLedgerEntryWriter", "reversePostedSettlementEntry")
    edge("pay", "RealtimePaymentAuthorizationFacade", "retryFailedSettlementBatch", "pay", "PaymentSettlementQueryService", "listFailedSettlementsForRetry")
    edge("pay", "CardNetworkTokenizationProcessor", "chargeTokenizedCardInstrument", "pay", "CardNetworkTokenizationProcessor", "validateIssuerBinRangeRules")
    edge("pay", "CardNetworkTokenizationProcessor", "tokenizeSensitiveCardMaterial", "pay", "CardNetworkTokenizationProcessor", "refreshNetworkTokenLifecycle")
    edge("pay", "DigitalWalletSettlementProcessor", "chargeLinkedWalletBalance", "pay", "DigitalWalletSettlementProcessor", "reserveWalletSpendingLimit")
    edge("pay", "RealtimeFraudScoringGate", "blockHighRiskPaymentAttempt", "pay", "RealtimeFraudScoringGate", "enrichRiskWithDeviceSignals")
    edge("pay", "RealtimeFraudScoringGate", "enrichRiskWithDeviceSignals", "pay", "RealtimeFraudScoringGate", "scoreIncomingPaymentRisk")
    edge("pay", "RealtimePaymentAuthorizationFacade", "executeCardPaymentSettlement", "idn", "DistributedSessionStore", "getActiveSessionRecord")
    edge("pay", "RealtimePaymentAuthorizationFacade", "authorizePendingCardHold", "idn", "EnterpriseUserDirectoryService", "findUserProfileById")
    edge("pay", "PaymentNotifyBridgeClient", "emitPaymentLifecycleNotification", "ntf", "PaymentEventNotificationHook", "onPaymentLifecycleDomainEvent")

    # checkout
    edge("chk", "RetailCheckoutOrchestrationFacade", "placeConfirmedCustomerOrder", "chk", "ShoppingCartPricingService", "repriceCartWithPromotions")
    edge("chk", "RetailCheckoutOrchestrationFacade", "placeConfirmedCustomerOrder", "chk", "IdentitySessionResolutionClient", "resolveUserFromActiveSession")
    edge("chk", "RetailCheckoutOrchestrationFacade", "placeConfirmedCustomerOrder", "chk", "InventoryReservationClient", "reserveStockForCheckoutOrder")
    edge("chk", "RetailCheckoutOrchestrationFacade", "placeConfirmedCustomerOrder", "chk", "DownstreamPaymentGatewayClient", "chargeOrderThroughPaymentGateway")
    edge("chk", "RetailCheckoutOrchestrationFacade", "placeConfirmedCustomerOrder", "chk", "OutboundNotificationClient", "notifyCustomerOrderPlaced")
    edge("chk", "RetailCheckoutOrchestrationFacade", "placeConfirmedCustomerOrder", "chk", "BillingInvoiceHandoffClient", "openInvoiceForCompletedOrder")
    edge("chk", "RetailCheckoutOrchestrationFacade", "previewCheckoutPricingQuote", "chk", "ShoppingCartPricingService", "repriceCartWithPromotions")
    edge("chk", "RetailCheckoutOrchestrationFacade", "previewCheckoutPricingQuote", "chk", "DownstreamPaymentGatewayClient", "authorizeOrderThroughPaymentGateway")
    edge("chk", "RetailCheckoutOrchestrationFacade", "cancelUncommittedCheckoutDraft", "chk", "InventoryReservationClient", "releaseReservedCheckoutStock")
    edge("chk", "RetailCheckoutOrchestrationFacade", "resumeAbandonedCheckoutSession", "chk", "OutboundNotificationClient", "notifyCustomerCheckoutAbandoned")
    edge("chk", "ShoppingCartPricingService", "addCatalogItemToCart", "chk", "ShoppingCartPricingService", "repriceCartWithPromotions")
    edge("chk", "ShoppingCartPricingService", "removeCatalogItemFromCart", "chk", "ShoppingCartPricingService", "repriceCartWithPromotions")
    edge("chk", "ShoppingCartPricingService", "mergeGuestAndUserCarts", "chk", "ShoppingCartPricingService", "repriceCartWithPromotions")
    edge("chk", "DownstreamPaymentGatewayClient", "chargeOrderThroughPaymentGateway", "pay", "RealtimePaymentAuthorizationFacade", "executeCardPaymentSettlement")
    edge("chk", "DownstreamPaymentGatewayClient", "authorizeOrderThroughPaymentGateway", "pay", "RealtimePaymentAuthorizationFacade", "authorizePendingCardHold")
    edge("chk", "DownstreamPaymentGatewayClient", "queryOrderPaymentSettlementStatus", "pay", "PaymentSettlementQueryService", "findSettlementByPaymentId")
    edge("chk", "IdentitySessionResolutionClient", "resolveUserFromActiveSession", "idn", "DistributedSessionStore", "getActiveSessionRecord")
    edge("chk", "IdentitySessionResolutionClient", "resolveUserFromActiveSession", "idn", "EnterpriseUserDirectoryService", "findUserProfileById")
    edge("chk", "OutboundNotificationClient", "notifyCustomerOrderPlaced", "ntf", "OutboundNotificationDispatchFacade", "sendSingleChannelNotification")
    edge("chk", "OutboundNotificationClient", "notifyCustomerCheckoutAbandoned", "ntf", "OutboundNotificationDispatchFacade", "sendSingleChannelNotification")
    edge("chk", "BillingInvoiceHandoffClient", "openInvoiceForCompletedOrder", "bil", "CustomerInvoiceLifecycleService", "createInvoiceFromFulfilledOrder")

    # billing
    edge("bil", "CustomerInvoiceLifecycleService", "createInvoiceFromFulfilledOrder", "bil", "InvoiceTaxComputationEngine", "computeTaxLinesForInvoiceDraft")
    edge("bil", "CustomerInvoiceLifecycleService", "createInvoiceFromFulfilledOrder", "bil", "InvoiceTaxComputationEngine", "validateVatRegistrationIdentifier")
    edge("bil", "CustomerInvoiceLifecycleService", "createInvoiceFromFulfilledOrder", "bil", "CheckoutOrderLookupClient", "fetchOrderSnapshotForInvoicing")
    edge("bil", "CustomerInvoiceLifecycleService", "reissueCorrectedCustomerInvoice", "bil", "CustomerInvoiceLifecycleService", "voidIssuedCustomerInvoice")
    edge("bil", "CustomerInvoiceLifecycleService", "reissueCorrectedCustomerInvoice", "bil", "CustomerInvoiceLifecycleService", "createInvoiceFromFulfilledOrder")
    edge("bil", "CustomerInvoiceLifecycleService", "applyCreditMemoToInvoice", "bil", "RefundCreditApplicationClient", "applyApprovedRefundToInvoice")
    edge("bil", "BillingBatchSchedulerService", "runDailyInvoiceCollectionBatch", "bil", "BillingInvoiceQueryService", "listUnpaidInvoicesForAccount")
    edge("bil", "BillingBatchSchedulerService", "runDailyInvoiceCollectionBatch", "bil", "PaymentSettlementReconciler", "reconcileChargeAgainstOpenInvoice")
    edge("bil", "BillingBatchSchedulerService", "retryFailedInvoiceCollectionJobs", "bil", "PaymentSettlementReconciler", "markInvoiceFullyPaidFromSettlement")
    edge("bil", "BillingBatchSchedulerService", "scheduleMidMonthReconciliationSweep", "bil", "PaymentSettlementReconciler", "flagUnmatchedSettlementException")
    edge("bil", "PaymentSettlementReconciler", "reconcileChargeAgainstOpenInvoice", "pay", "PaymentSettlementQueryService", "findSettlementByPaymentId")
    edge("bil", "PaymentSettlementReconciler", "markInvoiceFullyPaidFromSettlement", "pay", "PaymentSettlementQueryService", "listSettlementsByOrderReference")
    edge("bil", "PaymentSettlementReconciler", "reconcileChargeAgainstOpenInvoice", "pay", "PaymentLedgerEntryWriter", "postSuccessfulSettlementEntry")
    edge("bil", "CheckoutOrderLookupClient", "fetchOrderSnapshotForInvoicing", "chk", "CheckoutOrderQueryService", "getOrderByReference")
    edge("bil", "RefundCreditApplicationClient", "applyApprovedRefundToInvoice", "ref", "RefundCaseQueryService", "findRefundCaseById")
    edge("bil", "BillingNotifyBridgeClient", "emitInvoiceLifecycleNotification", "ntf", "BillingEventNotificationHook", "onInvoiceLifecycleDomainEvent")
    edge("bil", "IdentityAccountLookupClient", "resolveBillingAccountOwner", "idn", "EnterpriseUserDirectoryService", "findUserProfileById")

    # refund
    edge("ref", "CustomerRefundOrchestrationFacade", "requestCustomerRefundWorkflow", "ref", "RefundPolicyDecisionEngine", "evaluateRefundEligibilityRules")
    edge("ref", "CustomerRefundOrchestrationFacade", "requestCustomerRefundWorkflow", "ref", "RefundPolicyDecisionEngine", "evaluateRefundTimeWindowOpen")
    edge("ref", "CustomerRefundOrchestrationFacade", "approvePendingRefundWorkflow", "ref", "RefundSettlementExecutor", "executeFullChargeReversal")
    edge("ref", "CustomerRefundOrchestrationFacade", "approvePendingRefundWorkflow", "ref", "OutboundRefundNotifyClient", "publishRefundStatusNotification")
    edge("ref", "CustomerRefundOrchestrationFacade", "approvePendingRefundWorkflow", "ref", "BillingCreditMemoClient", "requestInvoiceCreditForRefund")
    edge("ref", "CustomerRefundOrchestrationFacade", "approvePendingRefundWorkflow", "ref", "ReportingRefundFactClient", "publishRefundVolumeFact")
    edge("ref", "CustomerRefundOrchestrationFacade", "escalateRefundToSupportDesk", "sup", "SupportTicketLifecycleService", "openCustomerSupportTicket")
    edge("ref", "RefundSettlementExecutor", "executeFullChargeReversal", "ref", "DownstreamPaymentReversalClient", "reverseSettledChargeOnGateway")
    edge("ref", "RefundSettlementExecutor", "executePartialChargeReversal", "ref", "DownstreamPaymentReversalClient", "creditWalletOnPaymentGateway")
    edge("ref", "RefundSettlementExecutor", "creditWalletAfterChargeReversal", "ref", "DownstreamPaymentReversalClient", "creditWalletOnPaymentGateway")
    edge("ref", "DownstreamPaymentReversalClient", "reverseSettledChargeOnGateway", "pay", "RealtimePaymentAuthorizationFacade", "voidAuthorizedCardHold")
    edge("ref", "DownstreamPaymentReversalClient", "reverseSettledChargeOnGateway", "pay", "PaymentLedgerEntryWriter", "reversePostedSettlementEntry")
    edge("ref", "DownstreamPaymentReversalClient", "creditWalletOnPaymentGateway", "pay", "DigitalWalletSettlementProcessor", "chargeLinkedWalletBalance")
    edge("ref", "OutboundRefundNotifyClient", "publishRefundStatusNotification", "ntf", "OutboundNotificationDispatchFacade", "sendSingleChannelNotification")
    edge("ref", "BillingCreditMemoClient", "requestInvoiceCreditForRefund", "bil", "CustomerInvoiceLifecycleService", "applyCreditMemoToInvoice")
    edge("ref", "ReportingRefundFactClient", "publishRefundVolumeFact", "rpt", "OperationalReportingFacade", "buildRefundVolumeSummaryReport")

    # identity
    edge("idn", "EnterpriseAuthenticationFacade", "loginWithPasswordCredentials", "idn", "EnterpriseUserDirectoryService", "findUserProfileByEmail")
    edge("idn", "EnterpriseAuthenticationFacade", "loginWithPasswordCredentials", "idn", "MultiFactorChallengeService", "issueMultiFactorChallenge")
    edge("idn", "EnterpriseAuthenticationFacade", "loginWithPasswordCredentials", "idn", "AccessTokenIssuanceService", "issueSignedAccessRefreshTokens")
    edge("idn", "EnterpriseAuthenticationFacade", "loginWithPasswordCredentials", "idn", "DistributedSessionStore", "putActiveSessionRecord")
    edge("idn", "EnterpriseAuthenticationFacade", "refreshExpiringAccessSession", "idn", "AccessTokenIssuanceService", "issueSignedAccessRefreshTokens")
    edge("idn", "EnterpriseAuthenticationFacade", "logoutActiveUserSession", "idn", "AccessTokenIssuanceService", "revokeIssuedAccessToken")
    edge("idn", "EnterpriseAuthenticationFacade", "challengeStepUpAuthentication", "idn", "MultiFactorChallengeService", "issueMultiFactorChallenge")
    edge("idn", "MultiFactorChallengeService", "issueMultiFactorChallenge", "idn", "MultiFactorChallengeService", "verifyMultiFactorChallengeCode")

    # notify
    edge("ntf", "OutboundNotificationDispatchFacade", "sendSingleChannelNotification", "ntf", "UserNotificationPreferenceStore", "allowsNotificationOnChannel")
    edge("ntf", "OutboundNotificationDispatchFacade", "sendSingleChannelNotification", "ntf", "EmailDeliveryChannelAdapter", "renderNotificationEmailTemplate")
    edge("ntf", "OutboundNotificationDispatchFacade", "sendSingleChannelNotification", "ntf", "EmailDeliveryChannelAdapter", "deliverRenderedEmailMessage")
    edge("ntf", "OutboundNotificationDispatchFacade", "sendSingleChannelNotification", "ntf", "SmsDeliveryChannelAdapter", "deliverSmsNotificationMessage")
    edge("ntf", "OutboundNotificationDispatchFacade", "sendSingleChannelNotification", "ntf", "PushDeliveryChannelAdapter", "deliverMobilePushNotification")
    edge("ntf", "OutboundNotificationDispatchFacade", "sendBulkChannelNotifications", "ntf", "OutboundNotificationDispatchFacade", "sendSingleChannelNotification")
    edge("ntf", "OutboundNotificationDispatchFacade", "retryFailedNotificationDelivery", "ntf", "NotificationDeadLetterQueue", "replayDeadLetterNotification")
    edge("ntf", "EmailDeliveryChannelAdapter", "deliverRenderedEmailMessage", "ntf", "NotificationDeadLetterQueue", "enqueueFailedNotificationMessage")
    edge("ntf", "RefundEventNotificationHook", "onRefundLifecycleDomainEvent", "ntf", "RefundEventNotificationHook", "fetchRefundSnapshotForNotify")
    edge("ntf", "RefundEventNotificationHook", "fetchRefundSnapshotForNotify", "ref", "RefundCaseQueryService", "findRefundCaseById")
    edge("ntf", "RefundEventNotificationHook", "onRefundLifecycleDomainEvent", "ntf", "OutboundNotificationDispatchFacade", "sendSingleChannelNotification")
    edge("ntf", "PaymentEventNotificationHook", "onPaymentLifecycleDomainEvent", "ntf", "OutboundNotificationDispatchFacade", "sendSingleChannelNotification")
    edge("ntf", "BillingEventNotificationHook", "onInvoiceLifecycleDomainEvent", "ntf", "OutboundNotificationDispatchFacade", "sendSingleChannelNotification")
    edge("ntf", "SupportDeskNotifyBridge", "onSupportTicketAgentUpdate", "ntf", "OutboundNotificationDispatchFacade", "sendSingleChannelNotification")

    # storefront
    edge("sf", "DigitalStorefrontHttpController", "submitCheckoutFromStorefront", "sf", "CheckoutOrchestrationGateway", "placeOrderViaCheckoutEngine")
    edge("sf", "DigitalStorefrontHttpController", "renderActiveShoppingCart", "sf", "CatalogProductViewAssembler", "assembleProductDetailPageModel")
    edge("sf", "DigitalStorefrontHttpController", "renderCustomerLoginExperience", "sf", "IdentitySessionGateway", "resolveCurrentStorefrontUser")
    edge("sf", "DigitalStorefrontHttpController", "searchCatalogProductListing", "sf", "CatalogProductViewAssembler", "searchCatalogProductViewModels")
    edge("sf", "CheckoutOrchestrationGateway", "placeOrderViaCheckoutEngine", "chk", "RetailCheckoutOrchestrationFacade", "placeConfirmedCustomerOrder")
    edge("sf", "CheckoutOrchestrationGateway", "previewOrderViaCheckoutEngine", "chk", "RetailCheckoutOrchestrationFacade", "previewCheckoutPricingQuote")
    edge("sf", "IdentitySessionGateway", "resolveCurrentStorefrontUser", "idn", "DistributedSessionStore", "getActiveSessionRecord")
    edge("sf", "IdentitySessionGateway", "resolveCurrentStorefrontUser", "idn", "EnterpriseAuthenticationFacade", "refreshExpiringAccessSession")
    edge("sf", "CatalogProductViewAssembler", "searchCatalogProductViewModels", "sf", "CatalogProductViewAssembler", "assembleProductDetailPageModel")
    edge("sf", "ReportingBrowseAnalyticsClient", "publishStorefrontBrowseFact", "rpt", "OperationalReportingFacade", "buildPaymentSettlementSummaryReport")
    edge("sf", "StorefrontNotifyBridgeClient", "emitStorefrontLifecycleNotification", "ntf", "OutboundNotificationDispatchFacade", "sendSingleChannelNotification")

    # mobile
    edge("bff", "MobileCheckoutExperienceApi", "placeOrderFromMobileClient", "bff", "MobileCheckoutOrchestrationGateway", "placeOrderThroughCheckoutEngine")
    edge("bff", "MobileCheckoutExperienceApi", "previewOrderFromMobileClient", "chk", "RetailCheckoutOrchestrationFacade", "previewCheckoutPricingQuote")
    edge("bff", "MobileAuthenticationExperienceApi", "loginMobileDeviceSession", "idn", "EnterpriseAuthenticationFacade", "loginWithPasswordCredentials")
    edge("bff", "MobileAuthenticationExperienceApi", "refreshMobileDeviceSession", "idn", "EnterpriseAuthenticationFacade", "refreshExpiringAccessSession")
    edge("bff", "MobileCheckoutOrchestrationGateway", "placeOrderThroughCheckoutEngine", "chk", "RetailCheckoutOrchestrationFacade", "placeConfirmedCustomerOrder")
    edge("bff", "MobileIdentityResolutionGateway", "resolveUserFromDeviceSession", "idn", "DistributedSessionStore", "getActiveSessionRecord")
    edge("bff", "MobileShoppingCartSyncApi", "addSkuToDeviceCart", "bff", "MobileShoppingCartSyncApi", "synchronizeDeviceCartState")
    edge("bff", "MobileShoppingCartSyncApi", "synchronizeDeviceCartState", "chk", "ShoppingCartPricingService", "addCatalogItemToCart")
    edge("bff", "MobileNotifyPreferenceBridge", "registerDevicePushEndpoint", "ntf", "UserNotificationPreferenceStore", "updateUserNotificationPreferences")
    edge("bff", "MobileNotifyPreferenceBridge", "emitMobileLifecycleNotification", "ntf", "OutboundNotificationDispatchFacade", "sendSingleChannelNotification")

    # report
    edge("rpt", "OperationalReportingFacade", "buildPaymentSettlementSummaryReport", "rpt", "PaymentSettlementIngestWorker", "pullChargesFromPaymentGateway")
    edge("rpt", "OperationalReportingFacade", "buildPaymentSettlementSummaryReport", "rpt", "AnalyticsCubeBuilderService", "buildDailyOperationalAnalyticsCube")
    edge("rpt", "OperationalReportingFacade", "buildInvoiceAgingSummaryReport", "rpt", "BillingInvoiceIngestWorker", "pullInvoicesFromBillingEngine")
    edge("rpt", "OperationalReportingFacade", "buildRefundVolumeSummaryReport", "rpt", "PaymentSettlementIngestWorker", "normalizePaymentChargeFactRow")
    edge("rpt", "OperationalReportingFacade", "buildSupportTicketVolumeReport", "rpt", "TicketAnalyticsIngestBridge", "pullTicketFactsFromAnalytics")
    edge("rpt", "PaymentSettlementIngestWorker", "pullChargesFromPaymentGateway", "pay", "PaymentSettlementQueryService", "listSettlementsByOrderReference")
    edge("rpt", "PaymentSettlementIngestWorker", "normalizePaymentChargeFactRow", "pay", "PaymentSettlementQueryService", "findSettlementByPaymentId")
    edge("rpt", "BillingInvoiceIngestWorker", "pullInvoicesFromBillingEngine", "bil", "BillingInvoiceQueryService", "getInvoiceByIdentifier")
    edge("rpt", "BillingInvoiceIngestWorker", "normalizeBillingInvoiceFactRow", "bil", "BillingInvoiceQueryService", "listUnpaidInvoicesForAccount")
    edge("rpt", "TicketAnalyticsIngestBridge", "pullTicketFactsFromAnalytics", "tix", "TicketAnalyticsQueryService", "getPublishedTicketStats")
    edge("rpt", "AnalyticsCubeBuilderService", "buildDailyOperationalAnalyticsCube", "rpt", "AnalyticsCubeBuilderService", "publishOperationalAnalyticsCube")
    edge("rpt", "ReportCatalogQueryService", "exportPublishedReportAsCsv", "rpt", "ReportCatalogQueryService", "getPublishedReportById")
    edge("rpt", "IdentityAudienceLookupClient", "resolveReportAudienceUser", "idn", "EnterpriseUserDirectoryService", "findUserProfileById")

    # finance
    edge("fin", "OvernightFinanceBatchOrchestrator", "runNightlyGeneralLedgerImport", "fin", "GeneralLedgerImportWorker", "importLedgerEntriesFromBilling")
    edge("fin", "OvernightFinanceBatchOrchestrator", "runNightlyGeneralLedgerImport", "fin", "GeneralLedgerImportWorker", "importLedgerEntriesFromReports")
    edge("fin", "OvernightFinanceBatchOrchestrator", "runNightlyGeneralLedgerImport", "fin", "GeneralLedgerImportWorker", "importLedgerEntriesFromPayments")
    edge("fin", "OvernightFinanceBatchOrchestrator", "runNightlyGeneralLedgerImport", "fin", "GeneralLedgerPostingService", "postValidatedGeneralLedgerEntry")
    edge("fin", "OvernightFinanceBatchOrchestrator", "runCatchupGeneralLedgerImport", "fin", "FinanceExceptionQueryService", "listOpenFinanceExceptions")
    edge("fin", "OvernightFinanceBatchOrchestrator", "runPaymentSettlementCatchupImport", "fin", "GeneralLedgerImportWorker", "importLedgerEntriesFromPayments")
    edge("fin", "GeneralLedgerImportWorker", "importLedgerEntriesFromBilling", "bil", "BillingInvoiceQueryService", "listUnpaidInvoicesForAccount")
    edge("fin", "GeneralLedgerImportWorker", "importLedgerEntriesFromBilling", "bil", "CustomerInvoiceLifecycleService", "createInvoiceFromFulfilledOrder")
    edge("fin", "GeneralLedgerImportWorker", "importLedgerEntriesFromReports", "rpt", "OperationalReportingFacade", "buildPaymentSettlementSummaryReport")
    edge("fin", "GeneralLedgerImportWorker", "importLedgerEntriesFromReports", "rpt", "AnalyticsCubeBuilderService", "publishOperationalAnalyticsCube")
    edge("fin", "GeneralLedgerImportWorker", "importLedgerEntriesFromPayments", "pay", "PaymentSettlementQueryService", "listFailedSettlementsForRetry")
    edge("fin", "GeneralLedgerImportWorker", "importLedgerEntriesFromPayments", "pay", "PaymentLedgerEntryWriter", "postSuccessfulSettlementEntry")
    edge("fin", "GeneralLedgerPostingService", "reversePostedGeneralLedgerEntry", "fin", "FinanceExceptionQueryService", "computeTrialBalanceSnapshot")

    # support — care calls support (not support→care for reassign: notify care queue via care facade would invert; use care notify only)
    edge("sup", "SupportTicketLifecycleService", "openCustomerSupportTicket", "sup", "SupportTicketQueryService", "getSupportTicketById")
    edge("sup", "SupportTicketLifecycleService", "escalateCustomerSupportTicket", "sup", "SupportNotifyBridgeClient", "notifyAgentOfTicketUpdate")
    edge("sup", "SupportTicketLifecycleService", "closeCustomerSupportTicket", "sup", "SupportNotifyBridgeClient", "notifyAgentOfTicketUpdate")
    edge("sup", "SupportTicketLifecycleService", "reassignTicketToCareQueue", "sup", "SupportNotifyBridgeClient", "notifyAgentOfTicketUpdate")
    edge("sup", "RefundWorkflowBridgeClient", "startRefundFromSupportTicket", "ref", "CustomerRefundOrchestrationFacade", "requestCustomerRefundWorkflow")
    edge("sup", "RefundWorkflowBridgeClient", "getRefundStatusForSupportTicket", "ref", "RefundCaseQueryService", "findRefundCaseById")
    edge("sup", "SupportNotifyBridgeClient", "notifyAgentOfTicketUpdate", "ntf", "SupportDeskNotifyBridge", "onSupportTicketAgentUpdate")
    edge("sup", "IdentityAgentLookupClient", "resolveAgentUserProfile", "idn", "EnterpriseUserDirectoryService", "findUserProfileById")

    # care
    edge("care", "CustomerCareInteractionFacade", "handleInboundCustomerCall", "care", "SupportDeskCaseClient", "openSupportTicketFromCareCase")
    edge("care", "CustomerCareInteractionFacade", "handleInboundCustomerChat", "care", "SupportDeskCaseClient", "linkCareCaseToSupportTicket")
    edge("care", "CustomerCareInteractionFacade", "handleInboundCustomerCall", "care", "CareCaseQueryService", "listCareHistoryForCustomer")
    edge("care", "CustomerCareInteractionFacade", "summarizeCustomerCareHistory", "care", "CareCaseQueryService", "listCareHistoryForCustomer")
    edge("care", "SupportDeskCaseClient", "openSupportTicketFromCareCase", "sup", "SupportTicketLifecycleService", "openCustomerSupportTicket")
    edge("care", "SupportDeskCaseClient", "linkCareCaseToSupportTicket", "sup", "SupportTicketQueryService", "getSupportTicketById")
    edge("care", "CareNotifyBridgeClient", "emitCareInteractionNotification", "ntf", "OutboundNotificationDispatchFacade", "sendSingleChannelNotification")

    # ticket analytics
    edge("tix", "SupportTicketAnalyticsFacade", "computeDailyTicketVolumeStats", "tix", "CareCaseIngestWorker", "pullCareCasesForAnalytics")
    edge("tix", "SupportTicketAnalyticsFacade", "computeDailyTicketVolumeStats", "tix", "TicketAggregationBuilder", "buildDailyTicketAggregation")
    edge("tix", "SupportTicketAnalyticsFacade", "computeAgentPerformanceScore", "tix", "CareCaseIngestWorker", "normalizeCareCaseFactRow")
    edge("tix", "SupportTicketAnalyticsFacade", "publishTicketFactsToReporting", "tix", "ReportingTicketFactPublisher", "pushTicketFactsIntoReporting")
    edge("tix", "CareCaseIngestWorker", "pullCareCasesForAnalytics", "care", "CareCaseQueryService", "listCareHistoryForCustomer")
    edge("tix", "CareCaseIngestWorker", "normalizeCareCaseFactRow", "care", "CareCaseQueryService", "listActiveCareCasesForAgent")
    edge("tix", "TicketAggregationBuilder", "buildDailyTicketAggregation", "tix", "TicketAggregationBuilder", "publishTicketAggregationCube")
    edge("tix", "ReportingTicketFactPublisher", "pushTicketFactsIntoReporting", "rpt", "OperationalReportingFacade", "buildSupportTicketVolumeReport")


def derive_affects() -> dict[str, list[str]]:
    aff: dict[str, set[str]] = defaultdict(set)
    for sid in NAMES:
        aff[sid]  # ensure key
    for a, _c, _n, a2, _c2, _n2 in edges:
        caller, callee = A[a], A[a2]
        if caller != callee:
            aff[callee].add(caller)
    # stable order
    order = list(NAMES.keys())
    return {k: sorted(aff[k], key=order.index) for k in order}


def emit_methods_ts(import_path: str) -> str:
    lines = [
        "/**",
        " * Mock method kataloğu + call-graph (üretici: scripts/gen_mock_catalog.py).",
        " * Tutarlılık: çapraz servis çağrı ⇒ callee değişince caller affectsEdges’te olmalı.",
        " */",
        f"import {{ affectsEdges, moduleTree, services }} from '{import_path}'",
        "",
        "export type MethodDef = {",
        "  id: string",
        "  serviceId?: string",
        "  projectId: string",
        "  packageId: string",
        "  className: string",
        "  name: string",
        "  signature: string",
        "}",
        "",
        "export type CallEdge = { callerId: string; calleeId: string }",
        "",
        "function m(",
        "  serviceId: string,",
        "  className: string,",
        "  name: string,",
        "  signature: string,",
        "): MethodDef {",
        "  const id = `m-${serviceId.replace(/^svc-/, '')}-${className}-${name}`",
        "  const service = services[serviceId]",
        "  return {",
        "    id,",
        "    serviceId,",
        "    projectId: service?.projectId ?? 'unknown-project',",
        "    packageId: service?.packageId ?? 'unknown-package',",
        "    className,",
        "    name,",
        "    signature,",
        "  }",
        "}",
        "",
        "function jm(",
        "  projectId: string,",
        "  packageId: string,",
        "  className: string,",
        "  name: string,",
        "  signature: string,",
        "): MethodDef {",
        "  const id = `m-${packageId.replace(/^pkg-/, 'jar-')}-${className}-${name}`",
        "  return { id, projectId, packageId, className, name, signature }",
        "}",
        "",
        "const pay = 'svc-payment'",
        "const chk = 'svc-checkout'",
        "const bil = 'svc-billing'",
        "const ref = 'svc-refund'",
        "const idn = 'svc-identity'",
        "const ntf = 'svc-notify'",
        "const sf = 'svc-storefront'",
        "const bff = 'svc-mobile-bff'",
        "const rpt = 'svc-report'",
        "const fin = 'svc-finance-batch'",
        "const sup = 'svc-support-desk'",
        "const care = 'svc-customer-care'",
        "const tix = 'svc-ticket-analytics'",
        "const pkgPayments = 'pkg-payments'",
        "const pkgOrders = 'pkg-orders'",
        "",
        "export const methods: MethodDef[] = [",
    ]
    for project, package, cls, name, sig in jar_methods:
        lines.append(f"  jm('{project}', '{package}', '{cls}', '{name}', '{sig}'),")
    for alias, cls, name, sig in methods:
        lines.append(f"  m({alias}, '{cls}', '{name}', '{sig}'),")
    lines += [
        "]",
        "",
        "const byId = Object.fromEntries(methods.map((x) => [x.id, x]))",
        "",
        "function idOf(serviceId: string, className: string, name: string) {",
        "  return m(serviceId, className, name, '').id",
        "}",
        "",
        "function idOfJar(packageId: string, className: string, name: string) {",
        "  return `m-${packageId.replace(/^pkg-/, 'jar-')}-${className}-${name}`",
        "}",
        "",
        "export const callEdges: CallEdge[] = [",
    ]
    lines.extend(jar_edge_lines)
    for a, c, n, a2, c2, n2 in edges:
        lines.append(
            f"  {{ callerId: idOf({a}, '{c}', '{n}'), calleeId: idOf({a2}, '{c2}', '{n2}') }},"
        )
    # append rest of file from template marker in existing server methods (helpers)
    helper = (ROOT / "server/src/methods.ts").read_text()
    idx = helper.index("const callersIndex")
    lines.append("]")
    lines.append("")
    lines.append(helper[idx:])
    return "\n".join(lines)


def patch_data(path: Path, affects: dict[str, list[str]]) -> None:
    import re

    text = path.read_text()
    start = text.index("export const affectsEdges")
    end = text.index("\nconst serviceDefs")
    aff_lines = ["export const affectsEdges: Record<string, string[]> = {"]
    for k, vs in affects.items():
        inner = ", ".join(f"'{v}'" for v in vs)
        aff_lines.append(f"  '{k}': [{inner}],")
    aff_lines.append("}\n")
    text = text[:start] + "\n".join(aff_lines) + text[end:]

    for sid, name in NAMES.items():
        text = re.sub(
            rf"(\{{ id: '{sid}', name: ')[^']+(')",
            rf"\g<1>{name}\2",
            text,
        )
        text = re.sub(
            rf"(kind: 'service', name: ')[^']+(', serviceId: '{sid}')",
            rf"\g<1>{name}\2",
            text,
        )
        text = re.sub(
            rf"(id: '{sid}',\n\s*name: ')[^']+(')",
            rf"\g<1>{name}\2",
            text,
        )

    text = text.replace("name: 'commerce'", "name: 'HAZINE'")
    text = text.replace("name: 'platform'", "name: 'MEVDUAT'")
    text = text.replace("name: 'data'", "name: 'KREDI'")
    # already-patched runs
    text = text.replace("name: 'HAZINE'", "name: 'HAZINE'")
    text = text.replace("com.example.payments", "com.hazine.payments")
    text = text.replace("com.example.orders", "com.hazine.orders")
    text = text.replace("com.example.identity", "com.mevduat.identity")
    text = text.replace("com.example.notify", "com.mevduat.notify")
    text = text.replace("com.example.reporting", "com.kredi.reporting")
    path.write_text(text)


def main() -> None:
    build()
    known = {(a, c, n) for a, c, n, _ in methods}
    for e in edges:
        assert (e[0], e[1], e[2]) in known, e
        assert (e[3], e[4], e[5]) in known, e
    affects = derive_affects()
    print("methods", len(methods), "edges", len(edges))
    print("affects totals", {k: len(v) for k, v in affects.items()})

    server_methods = ROOT / "server/src/methods.ts"
    web_methods = ROOT / "web/src/mock/methods.ts"
    server_methods.write_text(emit_methods_ts("./data.js"))
    web_methods.write_text(emit_methods_ts("./data"))

    patch_data(ROOT / "server/src/data.ts", affects)
    patch_data(ROOT / "web/src/mock/data.ts", affects)
    print("patched data + methods")


if __name__ == "__main__":
    main()
