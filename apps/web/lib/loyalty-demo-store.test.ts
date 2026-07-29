import { beforeEach, describe, expect, it } from "vitest";
import {
  LOYALTY_DEMO_CODE,
  LOYALTY_DEMO_TENANT_ID,
  LoyaltyDemoStore,
} from "./loyalty-demo-store";

const now = new Date("2026-07-29T23:30:00.000Z");
let store: LoyaltyDemoStore;

function enroll(contact = "camila@example.com") {
  const challenge = store.startChallenge({
    tenantId: LOYALTY_DEMO_TENANT_ID,
    purpose: "enroll",
    channel: "email",
    contact,
    identificationConsent: true,
    contactConsent: true,
  });
  return store.verifyChallenge({
    tenantId: LOYALTY_DEMO_TENANT_ID,
    challengeId: challenge.id,
    code: LOYALTY_DEMO_CODE,
  });
}

describe("identidad recurrente y fidelización demo", () => {
  beforeEach(() => {
    store = new LoyaltyDemoStore(() => now);
    store.configureDemo();
  });

  it("mantiene el pago normal cuando no hay consentimiento", () => {
    // Intenta romper el opt-in: el programa no debe crear perfiles por mirar o pagar.
    expect(store.cashierProfiles()).toHaveLength(0);
    store.recordConfirmedPayment({
      orderId: "order-anon",
      paidClp: 12_000,
      productIds: ["lager-casa"],
    });
    expect(store.cashierProfiles()).toHaveLength(0);
  });

  it("recupera los mismos sellos sin la credencial anterior", () => {
    // Si esto falla, limpiar Safari o cambiar de teléfono borraría la fidelización.
    const enrolled = enroll();
    store.recordConfirmedPayment({
      profileId: enrolled.profileId,
      orderId: "order-1",
      paidClp: 12_000,
      productIds: ["lager-casa"],
    });
    const recovery = store.startChallenge({
      tenantId: LOYALTY_DEMO_TENANT_ID,
      purpose: "recover",
      channel: "email",
      contact: "camila@example.com",
      identificationConsent: true,
      contactConsent: true,
    });
    const restored = store.verifyChallenge({
      tenantId: LOYALTY_DEMO_TENANT_ID,
      challengeId: recovery.id,
      code: LOYALTY_DEMO_CODE,
    });
    expect(restored.profileId).toBe(enrolled.profileId);
    expect(store.profile(restored.profileId)?.stamps).toBe(1);
    expect(store.metrics().identityLossRatePercent).toBe(100);
  });

  it("no comparte una identidad entre tenants", () => {
    // Si esto falla, un bar podría reconocer al cliente de otro bar.
    const enrolled = enroll();
    expect(
      store.recognition(
        "00000000-0000-4000-8000-000000009999",
        enrolled.credential,
      ),
    ).toBeUndefined();
  });

  it("deduplica el pago y limita sellos diarios", () => {
    // Si esto falla, webhooks duplicados o compras partidas inflarían el saldo.
    const enrolled = enroll();
    store.recordConfirmedPayment({
      profileId: enrolled.profileId,
      orderId: "order-1",
      paidClp: 10_000,
      productIds: ["lager-casa"],
    });
    store.recordConfirmedPayment({
      profileId: enrolled.profileId,
      orderId: "order-1",
      paidClp: 10_000,
      productIds: ["lager-casa"],
    });
    store.recordConfirmedPayment({
      profileId: enrolled.profileId,
      orderId: "order-2",
      paidClp: 10_000,
      productIds: ["lager-casa"],
    });
    expect(store.profile(enrolled.profileId)?.stamps).toBe(1);
  });

  it("reserva y consume exactamente un premio", () => {
    // Si esto falla, dos dispositivos podrían canjear el mismo saldo.
    const enrolled = enroll();
    store.seedProgress(enrolled.profileId, 5);
    store.reserveReward(enrolled.profileId, "cart-a");
    expect(() => store.reserveReward(enrolled.profileId, "cart-b")).toThrow(
      /otro checkout/,
    );
    store.completeReward({
      profileId: enrolled.profileId,
      cartId: "cart-a",
      referenceValueClp: 5_900,
      optionalUnitCostClp: 1_700,
    });
    expect(store.profile(enrolled.profileId)?.stamps).toBe(0);
    expect(store.metrics()).toMatchObject({
      rewardsRedeemed: 1,
      rewardReferenceValueClp: 5_900,
      rewardKnownCostClp: 1_700,
    });
  });

  it("la restitución asistida exige motivo y queda en métricas", () => {
    // Si esto falla, caja podría fabricar sellos sin responsabilidad.
    const enrolled = enroll();
    expect(() =>
      store.assistedAdjustment({
        profileId: enrolled.profileId,
        stampDelta: 1,
        reason: "",
        actorId: "cashier",
      }),
    ).toThrow(/motivo/);
    store.assistedAdjustment({
      profileId: enrolled.profileId,
      stampDelta: 1,
      reason: "Cliente mostró comprobante",
      actorId: "cashier",
    });
    expect(store.profile(enrolled.profileId)?.stamps).toBe(1);
  });

  it("revocar anonimiza contacto y credenciales sin borrar el hecho financiero", () => {
    // Si esto falla, el cliente no podría salir realmente del programa.
    const enrolled = enroll();
    store.recordConfirmedPayment({
      profileId: enrolled.profileId,
      orderId: "order-audit",
      paidClp: 8_000,
      productIds: ["lager-casa"],
    });
    store.anonymize(enrolled.profileId);
    expect(store.profile(enrolled.profileId)).toBeUndefined();
    expect(
      store.recognition(LOYALTY_DEMO_TENANT_ID, enrolled.credential),
    ).toBeUndefined();
  });
});
