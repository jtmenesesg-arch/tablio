export type CashierTableState =
  | "free"
  | "active"
  | "new_orders"
  | "preparing"
  | "requires_delivery"
  | "requires_attention"
  | "inactive"
  | "closed";

export type CashierExceptionType =
  | "payment_approved_without_order"
  | "approved_after_quote_expired"
  | "amount_or_currency_mismatch"
  | "merchant_or_tenant_mismatch"
  | "tax_document_failed"
  | "tax_credit_note_pending"
  | "tax_credit_note_failed"
  | "refund_not_reflected"
  | "settlement_difference"
  | "confirmation_after_shift_close"
  | "confirmation_without_cashier_shift";

export type CashierExceptionStatus =
  "open" | "in_review" | "resolved" | "escalated";

export type CashierTable = Readonly<{
  id: string;
  name: string;
  sessionId?: string;
  state: CashierTableState;
  groupLabel?: string;
  peopleCount: number;
  orderCount: number;
  processedClp: number;
  preparingCount: number;
  readyCount: number;
  attentionCount: number;
  lastActivityAt?: string;
  waiterName?: string;
}>;

export type CashierException = Readonly<{
  id: string;
  deduplicationKey: string;
  type: CashierExceptionType;
  status: CashierExceptionStatus;
  priority: "normal" | "high" | "critical";
  version: number;
  message: string;
  amountClp: number;
  createdAt: string;
  tableName?: string;
  personLabel?: string;
  paymentId?: string;
  shiftId?: string;
  providerApprovedAt?: string;
  providerReceivedAt?: string;
  manualProductionDeadlineAt?: string;
  manualProductionAvailable: boolean;
  secondsSinceApproval?: number;
  resolutionOptions: readonly (
    | "refund"
    | "produce_manually"
    | "investigate"
    | "escalate"
    | "retry_tax_document"
  )[];
  resolutionReason?: string;
}>;

export type CashierPayment = Readonly<{
  id: string;
  provider: "simulated";
  method: "Tarjeta demo" | "Efectivo";
  orderNumber?: number;
  tableName: string;
  personLabel: string;
  amountClp: number;
  tipClp: number;
  refundedClp: number;
  sourceShiftId?: string;
  providerApprovedAt: string;
  providerReceivedAt: string;
}>;

export type CashierReconciliationLine = Readonly<{
  paymentId: string;
  orderNumber?: number;
  providerPaymentId: string;
  tableName: string;
  personLabel: string;
  tablioSaleClp: number;
  refundedClp: number;
  providerGrossClp?: number;
  providerFeeClp?: number;
  providerNetClp?: number;
  depositedClp?: number;
  depositReference?: string;
  status: "matched" | "difference" | "pending";
  taxDocumentStatus: "pending" | "issued" | "failed" | "voucher" | "review";
  taxDocumentId?: string;
  taxFolio?: string;
  taxDocumentAmountClp?: number;
  taxRepresentationUrl?: string;
}>;

export type CashierClosure = Readonly<{
  id: string;
  shiftId: string;
  closedAt: string;
  closedBy: string;
  grossSalesClp: number;
  refundsClp: number;
  chargebacksClp: number;
  providerFeesClp: number;
  expectedPayoutClp: number;
  digitalProcessedClp: number;
  cashDeclaredClp: number;
  tipEarnedClp: number;
  tipRefundedOpenShiftClp: number;
  localTipAdjustmentsClp: number;
  orderCount: number;
  averageTicketClp: number;
  openExceptionCount: number;
  exceptionOverrideReason?: string;
  paymentMethods: readonly {
    method: string;
    grossClp: number;
    refundsClp: number;
    providerFeesClp: number;
    expectedPayoutClp: number;
    transactionCount: number;
  }[];
  tipsByWaiter: readonly {
    waiterName: string;
    earnedClp: number;
    refundedWhileOpenClp: number;
    distributableClp: number;
  }[];
  adjustments: readonly {
    id: string;
    amountClp: number;
    explanation: string;
  }[];
}>;

export type CashierBootstrap = Readonly<{
  demo: true;
  actor: {
    id: string;
    name: string;
    canRefund: boolean;
    canClose: boolean;
  };
  venue: { id: string; name: string };
  shift?: {
    id: string;
    version: number;
    status: "open";
    openedAt: string;
  };
  settings: {
    manualProductionWindowSeconds: number;
    reconciliationIntervalSeconds: number;
    warningAfterSeconds: number;
  };
  metrics: {
    grossSalesClp: number;
    refundsClp: number;
    orderCount: number;
    averageTicketClp: number;
    tipEarnedClp: number;
    tipRefundedOpenShiftClp: number;
    localTipAdjustmentsClp: number;
    openExceptionCount: number;
  };
  tables: readonly CashierTable[];
  exceptions: readonly CashierException[];
  payments: readonly CashierPayment[];
  reconciliation: readonly CashierReconciliationLine[];
  taxOperations: {
    pendingCount: number;
    oldestPendingAt?: string;
    requiresAttention: boolean;
    providerStatus: "working" | "degraded" | "down" | "unknown";
    recentFailureRate: number;
    pendingAlertCount: number;
    pendingAlertAgeSeconds: number;
  };
  tableCredit?: {
    enabled: boolean;
    openExposureClp: number;
    maxVenueExposureClp: number;
    currentShiftLossClp: number;
    currentShiftLossCount: number;
    accounts: readonly {
      id: string;
      tableName: string;
      status:
        "open" | "bill_requested" | "expired" | "settled" | "closed_with_loss";
      prepaidByAppClp: number;
      outstandingClp: number;
      expiresAt: string;
    }[];
  };
  loyalty: Readonly<{
    identityLossRatePercent: number;
    identityRecoveries: number;
    profiles: readonly {
      id: string;
      maskedIdentity: string;
      contactMasked: string;
      stamps: number;
    }[];
  }>;
  tipReport: readonly Readonly<{
    workerName: string;
    workerSessionId?: string;
    paymentMethod: string;
    amountClp: number;
    occurredAt: string;
    note: string;
  }>[];
  latestClosure?: CashierClosure;
  serverTime: string;
}>;

export type CashierMutation =
  | {
      action: "refund.request";
      paymentId: string;
      amountClp: number;
      idempotencyKey: string;
      reason: string;
    }
  | {
      action: "exception.transition";
      exceptionId: string;
      expectedVersion: number;
      transition: "start_review" | "escalate" | "resolve_investigated";
      reason?: string;
    }
  | {
      action: "exception.produce";
      exceptionId: string;
      expectedVersion: number;
      reason: string;
    }
  | {
      action: "tax.retry";
      taxDocumentId: string;
      reason: string;
    }
  | {
      action: "shift.close";
      expectedVersion: number;
      cashDeclaredClp: number;
      exceptionOverrideReason?: string;
    }
  | {
      action: "loyalty.adjust";
      profileId: string;
      stampDelta: number;
      reason: string;
    };
