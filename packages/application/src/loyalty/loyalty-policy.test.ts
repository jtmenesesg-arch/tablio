import { describe, expect, it } from "vitest";
import {
  assertExplicitLoyaltyConsent,
  canRedeemReward,
  eligibleStampCount,
  favoriteSuggestion,
  identityLossRate,
  maskLoyaltyRecognition,
  refundLoyaltyEffect,
  rewardEconomics,
  type LoyaltyProgram,
} from "./loyalty-policy";

const program: LoyaltyProgram = {
  enabled: true,
  visitsRequired: 5,
  minimumEligibleClp: 5_000,
  maxVisitsPerDay: 1,
  rewardProductId: "papas",
};

describe("política de fidelización", () => {
  it("no crea identidad si falta uno de los consentimientos explícitos", () => {
    // Intenta romper la regla de consentimiento: sin recuperación aceptada no debe existir un perfil frágil.
    expect(() =>
      assertExplicitLoyaltyConsent({
        identificationAccepted: true,
        contactAccepted: false,
      }),
    ).toThrow(/recuperar tus sellos/);
  });

  it("no entrega sellos por retorno del navegador ni pago pendiente", () => {
    // Si esto falla, el frontend podría fabricar visitas sin confirmación del proveedor.
    expect(
      eligibleStampCount({
        program,
        confirmedServerSide: false,
        paidAmountClp: 20_000,
        visitsAlreadyToday: 0,
      }),
    ).toBe(0);
  });

  it("limita a una visita elegible por día", () => {
    // Si esto falla, dividir una compra permitiría inflar sellos artificialmente.
    expect(
      eligibleStampCount({
        program,
        confirmedServerSide: true,
        paidAmountClp: 20_000,
        visitsAlreadyToday: 1,
      }),
    ).toBe(0);
  });

  it("no expone el nombre al reconocer un dispositivo compartido", () => {
    // Si esto falla, otra persona con el teléfono podría leer el nombre del titular.
    expect(maskLoyaltyRecognition("Club Camila 482")).toBe("Perfil •482");
  });

  it("solo ofrece un favorito que siga disponible", () => {
    // Si esto falla, “Tu de siempre” podría agregar un producto agotado.
    expect(
      favoriteSuggestion([
        { id: "agotado", available: false },
        { id: "lager", available: true },
      ]),
    ).toEqual({ id: "lager", available: true });
  });

  it("habilita el premio únicamente con saldo y stock", () => {
    // Si esto falla, se podría canjear sin sellos o regalar un producto agotado.
    expect(
      canRedeemReward({
        program,
        stampBalance: 5,
        rewardAvailable: true,
      }),
    ).toBe(true);
    expect(
      canRedeemReward({
        program,
        stampBalance: 4,
        rewardAvailable: true,
      }),
    ).toBe(false);
  });

  it("usa costo opcional y no inventa margen cuando falta", () => {
    // Si esto falla, el panel presentaría como costo un dato que el dueño nunca informó.
    expect(rewardEconomics({ referenceValueClp: 5_900 })).toEqual({
      referenceValueClp: 5_900,
      explanation:
        "Valor de referencia según precio de lista. El local no informó costo; no se calcula margen.",
    });
    expect(
      rewardEconomics({
        referenceValueClp: 5_900,
        optionalUnitCostClp: 1_700,
      }).marginClp,
    ).toBe(4_200);
  });

  it("mide recuperaciones tras perder la credencial", () => {
    // Si esto falla, el dueño no podría detectar que la identidad persistente está fallando.
    expect(
      identityLossRate({
        recognizedAttempts: 40,
        recoveredAfterMissingCredential: 5,
      }),
    ).toBe(12.5);
  });

  it("revierte visita y restaura premio solo cuando corresponde al reembolso", () => {
    // Si esto falla, un reembolso podría dejar sellos o consumir dos veces un premio.
    expect(
      refundLoyaltyEffect({
        eligibleAmountClp: 5_000,
        netPaidAfterRefundClp: 0,
        visitPreviouslyGranted: true,
        rewardRedeemed: true,
      }),
    ).toEqual({ reverseVisit: true, restoreReward: true });
  });
});
