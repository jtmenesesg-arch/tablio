export type DurableEffectMessage = Readonly<{
  outboxMessageId: string;
  tenantId: string;
  topic: string;
  deduplicationKey: string;
  payload: Readonly<Record<string, unknown>>;
}>;

export type EventClaim = Readonly<{
  acquired: boolean;
  lockToken?: string;
}>;

export interface ProcessedEventPort {
  claim(input: {
    tenantId: string;
    consumerName: string;
    eventId: string;
  }): Promise<EventClaim>;

  complete(input: {
    tenantId: string;
    consumerName: string;
    eventId: string;
    lockToken: string;
  }): Promise<void>;
}

export interface OutboxDeliveryPort {
  complete(message: DurableEffectMessage): Promise<void>;
  fail(message: DurableEffectMessage, error: Error): Promise<void>;
}

export interface DurableEffectHandler {
  /**
   * El adaptador externo debe usar esta clave como idempotency key. ProcessedEvent
   * evita repeticiones normales; la clave evita duplicar si el proceso cae justo
   * después del efecto externo y antes del ACK.
   */
  handle(message: DurableEffectMessage, idempotencyKey: string): Promise<void>;
}

export type ConsumeResult =
  | Readonly<{ outcome: "completed" }>
  | Readonly<{ outcome: "duplicate_ignored" }>
  | Readonly<{ outcome: "retry_or_dead_letter"; error: Error }>;

export class IdempotentDurableEffectConsumer {
  constructor(
    private readonly consumerName: string,
    private readonly processedEvents: ProcessedEventPort,
    private readonly deliveries: OutboxDeliveryPort,
    private readonly handler: DurableEffectHandler,
  ) {}

  async consume(message: DurableEffectMessage): Promise<ConsumeResult> {
    const claim = await this.processedEvents.claim({
      tenantId: message.tenantId,
      consumerName: this.consumerName,
      eventId: message.outboxMessageId,
    });

    if (!claim.acquired || !claim.lockToken) {
      return { outcome: "duplicate_ignored" };
    }

    try {
      await this.handler.handle(message, message.deduplicationKey);
      await this.processedEvents.complete({
        tenantId: message.tenantId,
        consumerName: this.consumerName,
        eventId: message.outboxMessageId,
        lockToken: claim.lockToken,
      });
      await this.deliveries.complete(message);
      return { outcome: "completed" };
    } catch (cause) {
      const error =
        cause instanceof Error
          ? cause
          : new Error("Unknown durable effect error");
      await this.deliveries.fail(message, error);
      return { outcome: "retry_or_dead_letter", error };
    }
  }
}
