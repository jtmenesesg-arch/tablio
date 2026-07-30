import { beforeEach, describe, expect, it } from "vitest";
import { StoredValueDemoStore } from "./stored-value-demo-store";

const profileId = "profile-stored-value-test";
let store: StoredValueDemoStore;

describe("saldo prepagado demo", () => {
  beforeEach(() => {
    store = new StoredValueDemoStore();
    store.reset();
    store.consent(profileId);
  });

  it("acredita una recarga sólo después de confirmarla en servidor", async () => {
    // Intenta saltarse la verdad del proveedor: sin confirmación no puede aparecer saldo.
    expect(store.snapshot(profileId).balanceClp).toBe(0);
    await store.topUp({
      profileId,
      loadedMoneyClp: 20_000,
      idempotencyKey: "topup-server-confirmed",
    });
    expect(store.snapshot(profileId)).toMatchObject({
      loadedMoneyClp: 20_000,
      bonusClp: 3_000,
      balanceClp: 23_000,
    });
  });

  it("ignora una recarga duplicada con la misma idempotencia", async () => {
    // Si esto falla, un webhook repetido regalaría dinero dos veces.
    const input = {
      profileId,
      loadedMoneyClp: 10_000,
      idempotencyKey: "same-topup",
    };
    await store.topUp(input);
    await store.topUp(input);
    expect(store.snapshot(profileId).balanceClp).toBe(11_500);
  });

  it("bloquea recargas que superan el tope conservador por comensal", async () => {
    // Si esto falla, el bar podría acumular una exposición individual excesiva.
    await store.topUp({
      profileId,
      loadedMoneyClp: 30_000,
      idempotencyKey: "first-topup",
    });
    await expect(
      store.topUp({
        profileId,
        loadedMoneyClp: 10_000,
        idempotencyKey: "over-cap",
      }),
    ).rejects.toThrow("máximo de saldo");
    expect(store.snapshot(profileId).balanceClp).toBe(34_500);
  });

  it("congela el saldo en el quote y consume bono antes que dinero", async () => {
    // Intenta cambiar la mezcla después de cotizar: el pedido debe respetar el snapshot.
    await store.topUp({
      profileId,
      loadedMoneyClp: 20_000,
      idempotencyKey: "mixed-topup",
    });
    const reservation = store.reserveForQuote({
      profileId,
      quoteId: "quote-mixed",
      commercialTotalClp: 8_000,
      requestedStoredValueClp: 5_000,
      expiresAt: new Date(Date.now() + 15 * 60_000).toISOString(),
    });
    expect(reservation.externalPaymentDueClp).toBe(3_000);
    expect(reservation.allocations[0]?.bucket).toBe("bonus");
    store.consumeForOrder({
      profileId,
      quoteId: "quote-mixed",
      orderId: "order-mixed",
    });
    expect(store.snapshot(profileId)).toMatchObject({
      loadedMoneyClp: 18_000,
      bonusClp: 0,
      balanceClp: 18_000,
    });
  });

  it("devuelve una recarga intacta y no elimina evidencia", async () => {
    // Si esto falla, caja podría devolver dinero ya consumido o borrar el historial.
    await store.topUp({
      profileId,
      loadedMoneyClp: 10_000,
      idempotencyKey: "refundable-topup",
    });
    const receiptId = store.snapshot(profileId).latestReceipt!.id;
    await store.refundTopUp({
      receiptId,
      actorId: "cashier-test",
      reason: "Cliente se arrepintió antes de consumir",
      idempotencyKey: "refund-intact-topup",
    });
    expect(store.snapshot(profileId).balanceClp).toBe(0);
    expect(
      store
        .snapshot(profileId)
        .history.filter((entry) => entry.type === "topup_refund"),
    ).toHaveLength(2);
  });

  it("congela saldo al eliminar identidad y conserva referencia", async () => {
    // Si esto falla, revocar datos personales haría desaparecer plata del cliente.
    await store.topUp({
      profileId,
      loadedMoneyClp: 10_000,
      idempotencyKey: "identity-delete-topup",
    });
    const reference = store.freezeForIdentityDeletion(profileId);
    expect(reference).toMatch(/^SALDO-[A-F0-9]{8}$/);
    expect(store.snapshot(profileId)).toMatchObject({
      status: "frozen_for_recovery",
      balanceClp: 11_500,
      recoveryReference: reference,
    });
  });
});
