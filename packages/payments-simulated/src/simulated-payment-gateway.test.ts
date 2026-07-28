import { describe, expect, it } from "vitest";
import { PaymentEventProcessor } from "@tablio/application";
import { InMemoryPaymentEventStore } from "./in-memory-payment-event-store";
import { SimulatedPaymentGateway } from "./simulated-payment-gateway";
import { SimulatedPaymentLab } from "./simulated-payment-lab";

const fixedNow = () => new Date("2026-07-28T12:00:00.000Z");
const scope = {
  tenantId: "tenant-a",
  merchantAccountId: "merchant-a",
};

async function createConfirmedPayment(gateway: SimulatedPaymentGateway) {
  const attempt = await gateway.createPaymentAttempt({
    ...scope,
    amount: { amount: 10_000, currency: "CLP" },
    checkoutQuoteId: "quote-a",
    idempotencyKey: "create-a",
    returnUrl: "http://localhost/demo",
  });
  gateway.setPaymentOutcome(scope, attempt.providerPaymentId, "confirmed");
  return attempt;
}

describe("SimulatedPaymentGateway contract", () => {
  it("creates one payment for repeated idempotent requests", async () => {
    const gateway = new SimulatedPaymentGateway(
      "a-long-test-secret-value",
      fixedNow,
    );
    const input = {
      ...scope,
      amount: { amount: 10_000, currency: "CLP" as const },
      checkoutQuoteId: "quote-a",
      idempotencyKey: "same-key",
      returnUrl: "http://localhost/demo",
    };

    const first = await gateway.createPaymentAttempt(input);
    const second = await gateway.createPaymentAttempt(input);

    expect(second.providerPaymentId).toBe(first.providerPaymentId);
    expect(second.attemptId).toBe(first.attemptId);
  });

  it("rejects a tampered signed webhook", async () => {
    const gateway = new SimulatedPaymentGateway(
      "a-long-test-secret-value",
      fixedNow,
    );
    const attempt = await createConfirmedPayment(gateway);
    const signed = gateway.createSignedWebhook({
      providerPaymentId: attempt.providerPaymentId,
      eventKind: "payment.confirmed",
    });

    await expect(
      gateway.verifyWebhook({
        ...signed.envelope,
        body: signed.envelope.body.replace("confirmed", "rejected"),
      }),
    ).rejects.toThrow("Invalid demo webhook signature");

    const futureGateway = new SimulatedPaymentGateway(
      "a-long-test-secret-value",
      () => new Date("2026-07-28T12:10:01.000Z"),
    );
    await expect(futureGateway.verifyWebhook(signed.envelope)).rejects.toThrow(
      "Expired demo webhook signature",
    );
  });

  it("deduplicates eight webhook deliveries and writes one outbox message", async () => {
    const gateway = new SimulatedPaymentGateway(
      "a-long-test-secret-value",
      fixedNow,
    );
    const store = new InMemoryPaymentEventStore();
    const processor = new PaymentEventProcessor(gateway, store, fixedNow);
    const attempt = await createConfirmedPayment(gateway);
    const signed = gateway.createSignedWebhook({
      providerPaymentId: attempt.providerPaymentId,
      eventKind: "payment.confirmed",
      eventId: "provider-event-001",
    });

    const results = await Promise.all(
      Array.from({ length: 8 }, () => processor.handle(scope, signed.envelope)),
    );

    expect(results.filter((result) => !result.duplicate)).toHaveLength(1);
    expect(store.providerEvents).toHaveLength(1);
    expect(store.outbox).toHaveLength(1);
    expect(store.outbox[0]?.topic).toBe("payment.confirmed");
  });

  it("does not let an old pending event downgrade a confirmed payment", async () => {
    const lab = new SimulatedPaymentLab("a-long-test-secret-value", fixedNow);

    const result = await lab.run("out_of_order");

    expect(result.providerEvents).toHaveLength(2);
    expect(result.outbox).toHaveLength(1);
    expect(result.outbox[0]?.topic).toBe("payment.confirmed");
    expect(result.log.at(-1)?.detail).toContain("no degradó");
  });

  it("handles rejected and late scenarios through server-side status", async () => {
    const rejectedLab = new SimulatedPaymentLab(
      "a-long-test-secret-value",
      fixedNow,
    );
    const lateLab = new SimulatedPaymentLab(
      "a-long-test-secret-value",
      fixedNow,
    );

    const rejected = await rejectedLab.run("rejected");
    const late = await lateLab.run("late");

    expect(rejected.outbox[0]?.topic).toBe("payment.rejected");
    expect(late.outbox[0]?.topic).toBe("payment.confirmed");
    expect(late.providerEvents[0]?.occurredAt).toBe("2026-07-28T10:00:00.000Z");
  });

  it("supports idempotent partial and total refunds", async () => {
    const gateway = new SimulatedPaymentGateway(
      "a-long-test-secret-value",
      fixedNow,
    );
    const attempt = await createConfirmedPayment(gateway);
    const partialInput = {
      ...scope,
      providerPaymentId: attempt.providerPaymentId,
      idempotencyKey: "refund-partial",
      amount: { amount: 4_000, currency: "CLP" as const },
    };

    const partial = await gateway.refund(partialInput);
    const repeated = await gateway.refund(partialInput);
    const restInput = {
      ...scope,
      providerPaymentId: attempt.providerPaymentId,
      idempotencyKey: "refund-rest",
    };
    const rest = await gateway.refund(restInput);
    const repeatedRest = await gateway.refund(restInput);
    const payment = await gateway.getPaymentStatus({
      ...scope,
      providerPaymentId: attempt.providerPaymentId,
    });

    expect(repeated.refundId).toBe(partial.refundId);
    expect(repeatedRest.refundId).toBe(rest.refundId);
    expect(rest.amount.amount).toBe(6_000);
    expect(payment.status).toBe("refunded");
    expect(payment.refundedAmount.amount).toBe(10_000);
  });

  it("creates one durable effect per distinct partial refund", async () => {
    const gateway = new SimulatedPaymentGateway(
      "a-long-test-secret-value",
      fixedNow,
    );
    const store = new InMemoryPaymentEventStore();
    const processor = new PaymentEventProcessor(gateway, store, fixedNow);
    const attempt = await createConfirmedPayment(gateway);
    const confirmed = gateway.createSignedWebhook({
      providerPaymentId: attempt.providerPaymentId,
      eventKind: "payment.confirmed",
      eventId: "event-confirmed",
    });
    await processor.handle(scope, confirmed.envelope);

    for (const [index, amount] of [2_000, 3_000].entries()) {
      const refund = await gateway.refund({
        ...scope,
        providerPaymentId: attempt.providerPaymentId,
        idempotencyKey: `refund-${index}`,
        amount: { amount, currency: "CLP" },
      });
      const webhook = gateway.createSignedWebhook({
        providerPaymentId: attempt.providerPaymentId,
        eventKind: "refund.completed",
        eventId: `event-refund-${index}`,
        resourceId: refund.refundId,
      });
      await processor.handle(scope, webhook.envelope);
    }

    expect(store.outbox).toHaveLength(3);
    expect(
      new Set(store.outbox.map((message) => message.deduplicationKey)).size,
    ).toBe(3);
  });

  it("scopes saved payment methods and payments to one merchant", async () => {
    const gateway = new SimulatedPaymentGateway(
      "a-long-test-secret-value",
      fixedNow,
    );
    const method = await gateway.enrollSavedPaymentMethod({
      ...scope,
      customerReference: "customer-a",
      enrollmentToken: "token-a",
    });

    await expect(
      gateway.createPaymentAttempt({
        tenantId: "tenant-b",
        merchantAccountId: "merchant-b",
        amount: { amount: 10_000, currency: "CLP" },
        checkoutQuoteId: "quote-b",
        idempotencyKey: "create-b",
        returnUrl: "http://localhost/demo",
        savedMethodId: method.savedMethodId,
      }),
    ).rejects.toThrow("not valid for this merchant");
  });

  it("exposes gross, provider fee, net and deposit references for reconciliation", async () => {
    const gateway = new SimulatedPaymentGateway(
      "a-long-test-secret-value",
      fixedNow,
    );
    await createConfirmedPayment(gateway);

    const result = await gateway.listSettlementEntries({
      ...scope,
      from: "2026-07-28T00:00:00.000Z",
      to: "2026-07-29T00:00:00.000Z",
    });

    expect(result.entries.map((entry) => entry.type)).toEqual([
      "sale",
      "deposit",
    ]);
    expect(result.entries[0]).toMatchObject({
      grossAmount: { amount: 10_000 },
      feeAmount: { amount: 290 },
      netAmount: { amount: 9_710 },
    });
    expect(result.entries[1]?.depositReference).toMatch(/^DEMO-ABONO-/);
  });
});
