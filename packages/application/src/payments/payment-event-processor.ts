import type {
  ConfirmedPayment,
  MerchantScope,
  PaymentGateway,
  PaymentStatus,
  WebhookEnvelope,
} from "./payment-gateway";

export type StoredPaymentEvent = Readonly<{
  eventId: string;
  providerPaymentId: string;
  eventKind: string;
  occurredAt: string;
  receivedAt: string;
}>;

export type OutboxMessage = Readonly<{
  id: string;
  topic: "payment.confirmed" | "payment.rejected" | "payment.refunded";
  aggregateId: string;
  deduplicationKey: string;
  createdAt: string;
}>;

export type ProcessedWebhook = Readonly<{
  duplicate: boolean;
  payment: ConfirmedPayment;
  outboxMessage?: OutboxMessage;
}>;

export interface PaymentEventStore {
  recordAtomically(input: {
    event: StoredPaymentEvent;
    outboxMessage?: OutboxMessage;
  }): Promise<Readonly<{ duplicate: boolean; outboxAppended: boolean }>>;
}

function topicFor(status: PaymentStatus): OutboxMessage["topic"] | undefined {
  if (status === "confirmed") return "payment.confirmed";
  if (status === "rejected") return "payment.rejected";
  if (status === "partially_refunded" || status === "refunded") {
    return "payment.refunded";
  }
  return undefined;
}

export class PaymentEventProcessor {
  constructor(
    private readonly gateway: PaymentGateway,
    private readonly store: PaymentEventStore,
    private readonly now: () => Date = () => new Date(),
  ) {}

  async handle(
    scope: MerchantScope,
    envelope: WebhookEnvelope,
  ): Promise<ProcessedWebhook> {
    const verified = await this.gateway.verifyWebhook(envelope);
    const payment = await this.gateway.confirmServerSide({
      ...scope,
      providerPaymentId: verified.providerPaymentId,
    });

    const storedEvent: StoredPaymentEvent = {
      eventId: verified.eventId,
      providerPaymentId: verified.providerPaymentId,
      eventKind: verified.eventKind,
      occurredAt: verified.occurredAt,
      receivedAt: this.now().toISOString(),
    };

    const topic = topicFor(payment.status);
    const message = topic
      ? {
          id: `outbox:${topic}:${verified.resourceId}`,
          topic,
          aggregateId: payment.providerPaymentId,
          deduplicationKey: `${topic}:${verified.resourceId}`,
          createdAt: this.now().toISOString(),
        }
      : undefined;
    const stored = await this.store.recordAtomically({
      event: storedEvent,
      outboxMessage: message,
    });

    return {
      duplicate: stored.duplicate,
      payment,
      outboxMessage: stored.outboxAppended ? message : undefined,
    };
  }
}
