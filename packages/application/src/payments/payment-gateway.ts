export type Currency = "CLP";

export type Money = Readonly<{
  amount: number;
  currency: Currency;
}>;

export type PaymentStatus =
  | "created"
  | "pending"
  | "confirmed"
  | "rejected"
  | "partially_refunded"
  | "refunded"
  | "cancelled";

export type PaymentEventKind =
  | "payment.pending"
  | "payment.confirmed"
  | "payment.rejected"
  | "payment.cancelled"
  | "refund.completed";

export type MerchantScope = Readonly<{
  tenantId: string;
  merchantAccountId: string;
}>;

export type MerchantConnection = Readonly<{
  authorizationUrl: string;
  state: string;
}>;

export type PaymentAttempt = MerchantScope &
  Readonly<{
    attemptId: string;
    providerPaymentId: string;
    checkoutUrl: string;
    amount: Money;
    status: PaymentStatus;
  }>;

export type ConfirmedPayment = MerchantScope &
  Readonly<{
    attemptId: string;
    providerPaymentId: string;
    amount: Money;
    refundedAmount: Money;
    status: PaymentStatus;
    occurredAt: string;
  }>;

export type VerifiedWebhook = Readonly<{
  eventId: string;
  eventKind: PaymentEventKind;
  resourceId: string;
  providerPaymentId: string;
  occurredAt: string;
  payload: unknown;
}>;

export type WebhookEnvelope = Readonly<{
  body: string;
  headers: Readonly<Record<string, string | undefined>>;
}>;

export type Refund = MerchantScope &
  Readonly<{
    refundId: string;
    providerPaymentId: string;
    amount: Money;
    status: "pending" | "completed" | "rejected";
    occurredAt: string;
  }>;

export type SavedPaymentMethod = MerchantScope &
  Readonly<{
    savedMethodId: string;
    customerReference: string;
    displayLabel: string;
    status: "active" | "deleted";
  }>;

export type SettlementEntryType =
  "sale" | "refund" | "chargeback" | "fee" | "deposit";

export type SettlementEntry = MerchantScope &
  Readonly<{
    entryId: string;
    providerPaymentId?: string;
    type: SettlementEntryType;
    grossAmount: Money;
    feeAmount: Money;
    netAmount: Money;
    occurredAt: string;
    availableAt?: string;
    depositReference?: string;
  }>;

export type GatewayCapabilities = Readonly<{
  merchantOAuth: boolean;
  signedWebhooks: boolean;
  savedPaymentMethods: boolean;
  partialRefunds: boolean;
  settlementApi: boolean;
}>;

export interface PaymentGateway {
  readonly name: string;
  readonly mode: "demo" | "test" | "production";
  readonly capabilities: GatewayCapabilities;

  beginMerchantConnection(input: {
    tenantId: string;
    returnUrl: string;
    state: string;
  }): Promise<MerchantConnection>;

  completeMerchantConnection(input: {
    tenantId: string;
    callbackCode: string;
    state: string;
  }): Promise<MerchantScope>;

  createPaymentAttempt(
    input: MerchantScope & {
      amount: Money;
      checkoutQuoteId: string;
      idempotencyKey: string;
      returnUrl: string;
      savedMethodId?: string;
    },
  ): Promise<PaymentAttempt>;

  verifyWebhook(envelope: WebhookEnvelope): Promise<VerifiedWebhook>;

  confirmServerSide(
    input: MerchantScope & {
      providerPaymentId: string;
    },
  ): Promise<ConfirmedPayment>;

  getPaymentStatus(
    input: MerchantScope & {
      providerPaymentId: string;
    },
  ): Promise<ConfirmedPayment>;

  refund(
    input: MerchantScope & {
      providerPaymentId: string;
      idempotencyKey: string;
      amount?: Money;
    },
  ): Promise<Refund>;

  enrollSavedPaymentMethod(
    input: MerchantScope & {
      customerReference: string;
      enrollmentToken: string;
    },
  ): Promise<SavedPaymentMethod>;

  deleteSavedPaymentMethod(
    input: MerchantScope & {
      savedMethodId: string;
    },
  ): Promise<void>;

  listSettlementEntries(
    input: MerchantScope & {
      from: string;
      to: string;
      cursor?: string;
    },
  ): Promise<
    Readonly<{
      entries: readonly SettlementEntry[];
      nextCursor?: string;
    }>
  >;
}
