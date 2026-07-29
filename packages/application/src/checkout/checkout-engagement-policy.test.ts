import { describe, expect, it } from "vitest";
import {
  assertInvitationCapacity,
  assertWaiterTipRecipient,
  canCancelInvitation,
  canClaimInvitation,
  freezePromotion,
  invitationExpiresAt,
  invitationWarningAt,
  selectUpsells,
} from "./checkout-engagement-policy";

const products = [
  { id: "beer", categoryId: "drinks", available: true, priceClp: 4_500 },
  {
    id: "fries",
    categoryId: "food",
    available: true,
    priceClp: 3_900,
    unitCostClp: 1_200,
  },
  { id: "sold", categoryId: "food", available: false, priceClp: 2_000 },
];

describe("reglas deterministas del momento de pago", () => {
  it("sugiere en prioridad estable, nunca agotados ni algo ya presente", () => {
    const result = selectUpsells({
      rules: [
        {
          id: "b",
          enabled: true,
          priority: 2,
          kind: "manual",
          suggestionProductId: "sold",
        },
        {
          id: "a",
          enabled: true,
          priority: 1,
          kind: "product",
          sourceProductId: "beer",
          suggestionProductId: "fries",
        },
      ],
      products,
      cartProductIds: ["beer"],
      cartCategoryIds: ["drinks"],
      minuteOfDay: 1_200,
      maxSuggestions: 2,
    });
    expect(result.map((product) => product.id)).toEqual(["fries"]);
  });

  it("la regla de margen no inventa costo cuando el dueño no lo informó", () => {
    expect(
      selectUpsells({
        rules: [
          {
            id: "margin",
            enabled: true,
            priority: 1,
            kind: "margin",
            minimumMarginClp: 1_000,
            suggestionProductId: "beer",
          },
        ],
        products,
        cartProductIds: [],
        cartCategoryIds: [],
        minuteOfDay: 1,
        maxSuggestions: 1,
      }),
    ).toEqual([]);
  });

  it("congela promoción por versión y no depende de cambios posteriores", () => {
    const frozen = freezePromotion({
      promotion: {
        id: "happy",
        version: 7,
        enabled: true,
        kind: "percentage",
        percentageBps: 2_000,
        productIds: ["beer"],
        categoryIds: [],
        startsAt: "2026-07-29T20:00:00.000Z",
        endsAt: "2026-07-30T02:00:00.000Z",
      },
      product: products[0]!,
      quantity: 1,
      now: "2026-07-29T21:00:00.000Z",
    });
    expect(frozen).toMatchObject({
      promotionId: "happy",
      version: 7,
      unitDiscountClp: 900,
    });
  });

  it("una promoción fuera de horario no toca el precio", () => {
    expect(
      freezePromotion({
        promotion: {
          id: "happy",
          version: 1,
          enabled: true,
          kind: "special_price",
          specialPriceClp: 3_000,
          productIds: ["beer"],
          categoryIds: [],
          startsAt: "2026-07-29T20:00:00.000Z",
          endsAt: "2026-07-29T21:00:00.000Z",
        },
        product: products[0]!,
        quantity: 1,
        now: "2026-07-29T22:00:00.000Z",
      }),
    ).toBeUndefined();
  });

  it("la invitación dura 60 minutos por defecto y avisa diez minutos antes", () => {
    const expiresAt = invitationExpiresAt({
      now: "2026-07-29T20:00:00.000Z",
    });
    expect(expiresAt).toBe("2026-07-29T21:00:00.000Z");
    expect(invitationWarningAt(expiresAt)).toBe("2026-07-29T20:50:00.000Z");
  });

  it("el cierre de la mesa destino acorta la invitación", () => {
    expect(
      invitationExpiresAt({
        now: "2026-07-29T20:00:00.000Z",
        ttlMinutes: 90,
        destinationTableClosesAt: "2026-07-29T20:40:00.000Z",
      }),
    ).toBe("2026-07-29T20:40:00.000Z");
  });

  it("solo una invitación aún no reclamada puede cancelarse", () => {
    expect(canCancelInvitation("pending_claim")).toBe(true);
    expect(canCancelInvitation("claimed")).toBe(false);
    expect(canCancelInvitation("refund_pending")).toBe(false);
  });

  it("el límite antiabuso cuenta unidades anteriores y las del carrito", () => {
    expect(() =>
      assertInvitationCapacity({
        previousInvitedUnits: 1,
        cartInvitedUnits: 1,
        requestedUnits: 2,
        maxInvitedUnitsPerDeviceSession: 3,
      }),
    ).toThrow(/máximo de invitaciones/);
    expect(() =>
      assertInvitationCapacity({
        previousInvitedUnits: 1,
        cartInvitedUnits: 1,
        requestedUnits: 1,
        maxInvitedUnitsPerDeviceSession: 3,
      }),
    ).not.toThrow();
  });

  it("otra persona de la misma mesa puede reclamar, pero el pagador no", () => {
    const base = {
      state: "pending_claim" as const,
      payerDeviceSessionId: "device-a",
      destinationTableSessionId: "table-session-8",
      claimantTableSessionId: "table-session-8",
      expiresAt: "2026-07-29T21:00:00.000Z",
      now: "2026-07-29T20:30:00.000Z",
    };
    expect(
      canClaimInvitation({
        ...base,
        claimantDeviceSessionId: "device-b",
      }),
    ).toBe(true);
    expect(
      canClaimInvitation({
        ...base,
        claimantDeviceSessionId: "device-a",
      }),
    ).toBe(false);
  });

  it("rechaza propina cruzada de tenant, zona o turno cerrado", () => {
    expect(() =>
      assertWaiterTipRecipient({
        quoteTenantId: "tenant-a",
        tableZoneId: "terraza",
        recipientTenantId: "tenant-b",
        recipientZoneIds: ["terraza"],
        employeeSessionState: "active",
      }),
    ).toThrow(/no está activo/);
    expect(() =>
      assertWaiterTipRecipient({
        quoteTenantId: "tenant-a",
        tableZoneId: "terraza",
        recipientTenantId: "tenant-a",
        recipientZoneIds: ["salon"],
        employeeSessionState: "active",
      }),
    ).toThrow(/no está activo/);
  });
});
