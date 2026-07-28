import { createHmac, randomUUID, timingSafeEqual } from "node:crypto";
import type {
  ConfirmedPayment,
  GatewayCapabilities,
  MerchantConnection,
  MerchantScope,
  Money,
  PaymentAttempt,
  PaymentEventKind,
  PaymentGateway,
  PaymentStatus,
  Refund,
  SavedPaymentMethod,
  SettlementEntry,
  VerifiedWebhook,
  WebhookEnvelope,
} from "@tablio/application";

type PaymentRecord = {
  attemptId: string;
  providerPaymentId: string;
  tenantId: string;
  merchantAccountId: string;
  amount: Money;
  refundedAmount: number;
  status: PaymentStatus;
  occurredAt: string;
};

type SignedDemoWebhook = Readonly<{
  envelope: WebhookEnvelope;
  event: VerifiedWebhook;
}>;

function assertMoney(money: Money, label: string): void {
  if (
    money.currency !== "CLP" ||
    !Number.isSafeInteger(money.amount) ||
    money.amount <= 0
  ) {
    throw new Error(`${label} must be a positive integer amount in CLP`);
  }
}

export class SimulatedPaymentGateway implements PaymentGateway {
  readonly name = "Tablio Simulated Gateway";
  readonly mode = "demo" as const;
  readonly capabilities: GatewayCapabilities = {
    merchantOAuth: true,
    signedWebhooks: true,
    savedPaymentMethods: true,
    partialRefunds: true,
    settlementApi: true,
  };

  private readonly payments = new Map<string, PaymentRecord>();
  private readonly paymentIdempotency = new Map<string, string>();
  private readonly refundIdempotency = new Map<string, Refund>();
  private readonly savedMethods = new Map<string, SavedPaymentMethod>();
  private readonly settlements: SettlementEntry[] = [];

  constructor(
    private readonly webhookSecret: string,
    private readonly now: () => Date = () => new Date(),
  ) {
    if (webhookSecret.length < 16) {
      throw new Error(
        "Demo webhook secret must contain at least 16 characters",
      );
    }
  }

  async beginMerchantConnection(input: {
    tenantId: string;
    returnUrl: string;
    state: string;
  }): Promise<MerchantConnection> {
    const url = new URL("https://payments.demo.tablio.invalid/connect");
    url.searchParams.set("tenant_id", input.tenantId);
    url.searchParams.set("return_url", input.returnUrl);
    url.searchParams.set("state", input.state);
    return { authorizationUrl: url.toString(), state: input.state };
  }

  async completeMerchantConnection(input: {
    tenantId: string;
    callbackCode: string;
    state: string;
  }): Promise<MerchantScope> {
    if (!input.callbackCode || !input.state) {
      throw new Error("Invalid simulated merchant connection callback");
    }
    return {
      tenantId: input.tenantId,
      merchantAccountId: `demo-merchant:${input.tenantId}`,
    };
  }

  async createPaymentAttempt(
    input: MerchantScope & {
      amount: Money;
      checkoutQuoteId: string;
      idempotencyKey: string;
      returnUrl: string;
      savedMethodId?: string;
    },
  ): Promise<PaymentAttempt> {
    assertMoney(input.amount, "Payment amount");
    this.assertScope(input);

    if (input.savedMethodId) {
      const method = this.savedMethods.get(input.savedMethodId);
      if (
        !method ||
        method.status !== "active" ||
        method.tenantId !== input.tenantId ||
        method.merchantAccountId !== input.merchantAccountId
      ) {
        throw new Error("Saved payment method is not valid for this merchant");
      }
    }

    const scopedKey = [
      input.tenantId,
      input.merchantAccountId,
      input.idempotencyKey,
    ].join(":");
    const existingId = this.paymentIdempotency.get(scopedKey);
    if (existingId) return this.toAttempt(this.mustPayment(existingId));

    const providerPaymentId = `demo-pay:${randomUUID()}`;
    const record: PaymentRecord = {
      attemptId: `attempt:${randomUUID()}`,
      providerPaymentId,
      tenantId: input.tenantId,
      merchantAccountId: input.merchantAccountId,
      amount: input.amount,
      refundedAmount: 0,
      status: "pending",
      occurredAt: this.now().toISOString(),
    };
    this.payments.set(providerPaymentId, record);
    this.paymentIdempotency.set(scopedKey, providerPaymentId);
    return this.toAttempt(record);
  }

  async verifyWebhook(envelope: WebhookEnvelope): Promise<VerifiedWebhook> {
    const timestamp = envelope.headers["x-tablio-demo-timestamp"];
    const supplied = envelope.headers["x-tablio-demo-signature"];
    if (!timestamp || !supplied)
      throw new Error("Missing demo webhook signature");
    const timestampMs = Number(timestamp);
    if (
      !Number.isSafeInteger(timestampMs) ||
      Math.abs(this.now().getTime() - timestampMs) > 300_000
    ) {
      throw new Error("Expired demo webhook signature");
    }

    const expected = this.sign(timestamp, envelope.body);
    const actualBuffer = Buffer.from(supplied);
    const expectedBuffer = Buffer.from(expected);
    if (
      actualBuffer.length !== expectedBuffer.length ||
      !timingSafeEqual(actualBuffer, expectedBuffer)
    ) {
      throw new Error("Invalid demo webhook signature");
    }

    const parsed = JSON.parse(envelope.body) as Partial<VerifiedWebhook>;
    if (
      !parsed.eventId ||
      !parsed.eventKind ||
      !parsed.resourceId ||
      !parsed.providerPaymentId ||
      !parsed.occurredAt
    ) {
      throw new Error("Malformed demo webhook");
    }
    return {
      eventId: parsed.eventId,
      eventKind: parsed.eventKind,
      resourceId: parsed.resourceId,
      providerPaymentId: parsed.providerPaymentId,
      occurredAt: parsed.occurredAt,
      payload: parsed.payload,
    };
  }

  async confirmServerSide(
    input: MerchantScope & { providerPaymentId: string },
  ): Promise<ConfirmedPayment> {
    return this.toConfirmed(this.scopedPayment(input));
  }

  async getPaymentStatus(
    input: MerchantScope & { providerPaymentId: string },
  ): Promise<ConfirmedPayment> {
    return this.toConfirmed(this.scopedPayment(input));
  }

  async refund(
    input: MerchantScope & {
      providerPaymentId: string;
      idempotencyKey: string;
      amount?: Money;
    },
  ): Promise<Refund> {
    const payment = this.scopedPayment(input);
    const scopedKey = [
      input.tenantId,
      input.merchantAccountId,
      input.idempotencyKey,
    ].join(":");
    const existing = this.refundIdempotency.get(scopedKey);
    if (existing) return existing;
    if (
      payment.status !== "confirmed" &&
      payment.status !== "partially_refunded"
    ) {
      throw new Error("Only a confirmed payment can be refunded");
    }

    const refundable = payment.amount.amount - payment.refundedAmount;
    const requested = input.amount?.amount ?? refundable;
    if (input.amount) assertMoney(input.amount, "Refund amount");
    if (input.amount && input.amount.currency !== payment.amount.currency) {
      throw new Error("Refund currency must match payment currency");
    }
    if (requested > refundable) {
      throw new Error("Refund exceeds the remaining payment balance");
    }

    payment.refundedAmount += requested;
    payment.status =
      payment.refundedAmount === payment.amount.amount
        ? "refunded"
        : "partially_refunded";
    payment.occurredAt = this.now().toISOString();

    const refund: Refund = {
      refundId: `demo-refund:${randomUUID()}`,
      providerPaymentId: payment.providerPaymentId,
      tenantId: payment.tenantId,
      merchantAccountId: payment.merchantAccountId,
      amount: { amount: requested, currency: payment.amount.currency },
      status: "completed",
      occurredAt: payment.occurredAt,
    };
    this.refundIdempotency.set(scopedKey, refund);
    this.settlements.push({
      entryId: `settlement-refund:${refund.refundId}`,
      providerPaymentId: payment.providerPaymentId,
      tenantId: payment.tenantId,
      merchantAccountId: payment.merchantAccountId,
      type: "refund",
      grossAmount: { amount: -requested, currency: payment.amount.currency },
      feeAmount: { amount: 0, currency: payment.amount.currency },
      netAmount: { amount: -requested, currency: payment.amount.currency },
      occurredAt: payment.occurredAt,
    });
    return refund;
  }

  async enrollSavedPaymentMethod(
    input: MerchantScope & {
      customerReference: string;
      enrollmentToken: string;
    },
  ): Promise<SavedPaymentMethod> {
    this.assertScope(input);
    if (!input.enrollmentToken) throw new Error("Enrollment token is required");
    const method: SavedPaymentMethod = {
      tenantId: input.tenantId,
      merchantAccountId: input.merchantAccountId,
      savedMethodId: `demo-card:${randomUUID()}`,
      customerReference: input.customerReference,
      displayLabel: "•••• 4242",
      status: "active",
    };
    this.savedMethods.set(method.savedMethodId, method);
    return method;
  }

  async deleteSavedPaymentMethod(
    input: MerchantScope & { savedMethodId: string },
  ): Promise<void> {
    const method = this.savedMethods.get(input.savedMethodId);
    if (
      !method ||
      method.tenantId !== input.tenantId ||
      method.merchantAccountId !== input.merchantAccountId
    ) {
      throw new Error("Saved payment method is not valid for this merchant");
    }
    this.savedMethods.set(input.savedMethodId, {
      ...method,
      status: "deleted",
    });
  }

  async listSettlementEntries(
    input: MerchantScope & { from: string; to: string; cursor?: string },
  ): Promise<
    Readonly<{ entries: readonly SettlementEntry[]; nextCursor?: string }>
  > {
    this.assertScope(input);
    const from = Date.parse(input.from);
    const to = Date.parse(input.to);
    return {
      entries: this.settlements.filter(
        (entry) =>
          entry.tenantId === input.tenantId &&
          entry.merchantAccountId === input.merchantAccountId &&
          Date.parse(entry.occurredAt) >= from &&
          Date.parse(entry.occurredAt) <= to,
      ),
    };
  }

  setPaymentOutcome(
    scope: MerchantScope,
    providerPaymentId: string,
    status: "confirmed" | "rejected" | "cancelled",
  ): ConfirmedPayment {
    const payment = this.scopedPayment({ ...scope, providerPaymentId });
    payment.status = status;
    payment.occurredAt = this.now().toISOString();

    if (status === "confirmed") {
      const fee = Math.round(payment.amount.amount * 0.029);
      const net = payment.amount.amount - fee;
      const base = {
        providerPaymentId,
        tenantId: payment.tenantId,
        merchantAccountId: payment.merchantAccountId,
        occurredAt: payment.occurredAt,
      };
      this.settlements.push(
        {
          ...base,
          entryId: `settlement-sale:${providerPaymentId}`,
          type: "sale",
          grossAmount: payment.amount,
          feeAmount: { amount: fee, currency: payment.amount.currency },
          netAmount: { amount: net, currency: payment.amount.currency },
        },
        {
          ...base,
          entryId: `settlement-deposit:${providerPaymentId}`,
          type: "deposit",
          grossAmount: { amount: net, currency: payment.amount.currency },
          feeAmount: { amount: 0, currency: payment.amount.currency },
          netAmount: { amount: net, currency: payment.amount.currency },
          availableAt: payment.occurredAt,
          depositReference: `DEMO-ABONO-${providerPaymentId.slice(-8)}`,
        },
      );
    }
    return this.toConfirmed(payment);
  }

  createSignedWebhook(input: {
    providerPaymentId: string;
    eventKind: PaymentEventKind;
    eventId?: string;
    resourceId?: string;
    occurredAt?: string;
  }): SignedDemoWebhook {
    this.mustPayment(input.providerPaymentId);
    const event: VerifiedWebhook = {
      eventId: input.eventId ?? `demo-event:${randomUUID()}`,
      eventKind: input.eventKind,
      resourceId: input.resourceId ?? input.providerPaymentId,
      providerPaymentId: input.providerPaymentId,
      occurredAt: input.occurredAt ?? this.now().toISOString(),
      payload: {
        demo: true,
        warning: "SIMULATION ONLY — NO REAL MONEY",
      },
    };
    const body = JSON.stringify(event);
    const timestamp = String(this.now().getTime());
    return {
      event,
      envelope: {
        body,
        headers: {
          "content-type": "application/json",
          "x-tablio-demo-timestamp": timestamp,
          "x-tablio-demo-signature": this.sign(timestamp, body),
        },
      },
    };
  }

  reset(): void {
    this.payments.clear();
    this.paymentIdempotency.clear();
    this.refundIdempotency.clear();
    this.savedMethods.clear();
    this.settlements.splice(0);
  }

  private sign(timestamp: string, body: string): string {
    return `sha256=${createHmac("sha256", this.webhookSecret)
      .update(`${timestamp}.${body}`)
      .digest("hex")}`;
  }

  private assertScope(scope: MerchantScope): void {
    if (!scope.tenantId || !scope.merchantAccountId) {
      throw new Error("Tenant and merchant account are required");
    }
  }

  private mustPayment(providerPaymentId: string): PaymentRecord {
    const payment = this.payments.get(providerPaymentId);
    if (!payment) throw new Error("Unknown simulated payment");
    return payment;
  }

  private scopedPayment(
    input: MerchantScope & { providerPaymentId: string },
  ): PaymentRecord {
    this.assertScope(input);
    const payment = this.mustPayment(input.providerPaymentId);
    if (
      payment.tenantId !== input.tenantId ||
      payment.merchantAccountId !== input.merchantAccountId
    ) {
      throw new Error("Payment does not belong to this merchant");
    }
    return payment;
  }

  private toAttempt(payment: PaymentRecord): PaymentAttempt {
    return {
      attemptId: payment.attemptId,
      providerPaymentId: payment.providerPaymentId,
      tenantId: payment.tenantId,
      merchantAccountId: payment.merchantAccountId,
      amount: payment.amount,
      status: payment.status,
      checkoutUrl: `https://payments.demo.tablio.invalid/pay/${encodeURIComponent(payment.providerPaymentId)}`,
    };
  }

  private toConfirmed(payment: PaymentRecord): ConfirmedPayment {
    return {
      attemptId: payment.attemptId,
      providerPaymentId: payment.providerPaymentId,
      tenantId: payment.tenantId,
      merchantAccountId: payment.merchantAccountId,
      amount: payment.amount,
      refundedAmount: {
        amount: payment.refundedAmount,
        currency: payment.amount.currency,
      },
      status: payment.status,
      occurredAt: payment.occurredAt,
    };
  }
}
