import { describe, expect, it, vi } from "vitest";
import {
  IdempotentDurableEffectConsumer,
  type DurableEffectMessage,
} from "./durable-effect-consumer";

const message: DurableEffectMessage = {
  outboxMessageId: "outbox-1",
  tenantId: "tenant-1",
  topic: "print.order_confirmed",
  deduplicationKey: "order:1:print",
  payload: { orderId: "order-1" },
};

describe("IdempotentDurableEffectConsumer", () => {
  it("passes the durable deduplication key to the external adapter", async () => {
    // Intenta perder la clave al imprimir; si falla, un crash entre impresión y ACK duplicaría la comanda.
    const processedEvents = {
      claim: vi.fn().mockResolvedValue({ acquired: true, lockToken: "lock-1" }),
      complete: vi.fn().mockResolvedValue(undefined),
    };
    const deliveries = {
      complete: vi.fn().mockResolvedValue(undefined),
      fail: vi.fn().mockResolvedValue(undefined),
    };
    const handler = { handle: vi.fn().mockResolvedValue(undefined) };
    const consumer = new IdempotentDurableEffectConsumer(
      "printer",
      processedEvents,
      deliveries,
      handler,
    );

    await expect(consumer.consume(message)).resolves.toEqual({
      outcome: "completed",
    });
    expect(handler.handle).toHaveBeenCalledWith(message, "order:1:print");
    expect(deliveries.complete).toHaveBeenCalledOnce();
  });

  it("ignores a delivery already claimed or completed", async () => {
    // Intenta repetir un mensaje procesado; si falla, se repetiría un efecto comercial.
    const handler = { handle: vi.fn() };
    const consumer = new IdempotentDurableEffectConsumer(
      "printer",
      {
        claim: vi.fn().mockResolvedValue({ acquired: false }),
        complete: vi.fn(),
      },
      { complete: vi.fn(), fail: vi.fn() },
      handler,
    );

    await expect(consumer.consume(message)).resolves.toEqual({
      outcome: "duplicate_ignored",
    });
    expect(handler.handle).not.toHaveBeenCalled();
  });

  it("hands failures back to the retry and DLQ controller", async () => {
    // Intenta tragarse una falla; si falla, el mensaje quedaría perdido sin backoff ni DLQ.
    const failure = new Error("printer offline");
    const deliveries = {
      complete: vi.fn(),
      fail: vi.fn().mockResolvedValue(undefined),
    };
    const consumer = new IdempotentDurableEffectConsumer(
      "printer",
      {
        claim: vi
          .fn()
          .mockResolvedValue({ acquired: true, lockToken: "lock-1" }),
        complete: vi.fn(),
      },
      deliveries,
      { handle: vi.fn().mockRejectedValue(failure) },
    );

    await expect(consumer.consume(message)).resolves.toEqual({
      outcome: "retry_or_dead_letter",
      error: failure,
    });
    expect(deliveries.fail).toHaveBeenCalledWith(message, failure);
  });
});
