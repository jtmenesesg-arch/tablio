import type {
  OutboxMessage,
  PaymentEventStore,
  StoredPaymentEvent,
} from "@tablio/application";

export class InMemoryPaymentEventStore implements PaymentEventStore {
  readonly providerEvents: StoredPaymentEvent[] = [];
  readonly outbox: OutboxMessage[] = [];

  async recordAtomically(input: {
    event: StoredPaymentEvent;
    outboxMessage?: OutboxMessage;
  }): Promise<Readonly<{ duplicate: boolean; outboxAppended: boolean }>> {
    if (
      this.providerEvents.some((event) => event.eventId === input.event.eventId)
    ) {
      return { duplicate: true, outboxAppended: false };
    }

    this.providerEvents.push(input.event);
    const exists =
      input.outboxMessage &&
      this.outbox.some(
        (message) =>
          message.deduplicationKey === input.outboxMessage?.deduplicationKey,
      );

    if (input.outboxMessage && !exists) {
      this.outbox.push(input.outboxMessage);
    }

    return {
      duplicate: false,
      outboxAppended: Boolean(input.outboxMessage && !exists),
    };
  }

  reset(): void {
    this.providerEvents.splice(0);
    this.outbox.splice(0);
  }
}
