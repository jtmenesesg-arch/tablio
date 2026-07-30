import { describe, expect, it } from "vitest";
import {
  allocateStoredValue,
  calculateTopUpBonus,
  decideStoredValueTopUp,
  splitStoredValueTender,
  storedValueWindDown,
  type StoredValueSettings,
} from "./stored-value-policy";

const settings: StoredValueSettings = {
  enabled: true,
  productionValidated: false,
  maxConsumerBalanceClp: 40_000,
  maxVenueLiabilityClp: 120_000,
  bonusBps: 1_500,
  consumptionOrder: "bonus_first_fefo",
  policyVersion: 1,
};

describe("política de saldo prepagado", () => {
  it("calcula el bono como CLP entero sin inventar decimales", () => {
    expect(calculateTopUpBonus(20_000, 1_500)).toBe(3_000);
  });

  it("bloquea producción real mientras la hipótesis legal no está validada", () => {
    expect(
      decideStoredValueTopUp({
        settings,
        currentConsumerBalanceClp: 0,
        currentVenueLiabilityClp: 0,
        loadedMoneyClp: 20_000,
      }),
    ).toMatchObject({ allowed: false, reason: "production_blocked" });
  });

  it("permite el simulador y separa dinero cargado de bono", () => {
    expect(
      decideStoredValueTopUp({
        settings,
        currentConsumerBalanceClp: 0,
        currentVenueLiabilityClp: 0,
        loadedMoneyClp: 20_000,
        allowSimulatedMode: true,
      }),
    ).toEqual({
      allowed: true,
      loadedMoneyClp: 20_000,
      bonusClp: 3_000,
      nextConsumerBalanceClp: 23_000,
      nextVenueLiabilityClp: 23_000,
    });
  });

  it("impide superar el tope del comensal incluyendo el bono", () => {
    expect(
      decideStoredValueTopUp({
        settings,
        currentConsumerBalanceClp: 35_000,
        currentVenueLiabilityClp: 50_000,
        loadedMoneyClp: 5_000,
        allowSimulatedMode: true,
      }),
    ).toMatchObject({ allowed: false, reason: "consumer_limit" });
  });

  it("impide superar el tope total opcional del local", () => {
    expect(
      decideStoredValueTopUp({
        settings,
        currentConsumerBalanceClp: 0,
        currentVenueLiabilityClp: 115_000,
        loadedMoneyClp: 5_000,
        allowSimulatedMode: true,
      }),
    ).toMatchObject({ allowed: false, reason: "venue_limit" });
  });

  it("consume primero bono y luego dinero, FEFO dentro de cada componente", () => {
    expect(
      allocateStoredValue({
        lots: [
          {
            id: "money",
            bucket: "loaded_money",
            availableClp: 10_000,
          },
          {
            id: "bonus-late",
            bucket: "bonus",
            availableClp: 2_000,
            expiresAt: "2026-10-01T00:00:00.000Z",
          },
          {
            id: "bonus-soon",
            bucket: "bonus",
            availableClp: 3_000,
            expiresAt: "2026-09-01T00:00:00.000Z",
          },
        ],
        requestedClp: 7_000,
        now: "2026-07-29T00:00:00.000Z",
        order: "bonus_first_fefo",
      }).allocations,
    ).toEqual([
      { lotId: "bonus-soon", bucket: "bonus", amountClp: 3_000 },
      { lotId: "bonus-late", bucket: "bonus", amountClp: 2_000 },
      { lotId: "money", bucket: "loaded_money", amountClp: 2_000 },
    ]);
  });

  it("ignora lotes vencidos", () => {
    expect(
      allocateStoredValue({
        lots: [
          {
            id: "expired",
            bucket: "bonus",
            availableClp: 10_000,
            expiresAt: "2026-07-01T00:00:00.000Z",
          },
        ],
        requestedClp: 5_000,
        now: "2026-07-29T00:00:00.000Z",
        order: "bonus_first_fefo",
      }).appliedClp,
    ).toBe(0);
  });

  it("congela un pago mixto sin alterar el total comercial", () => {
    expect(
      splitStoredValueTender({
        commercialTotalClp: 12_000,
        requestedStoredValueClp: 8_000,
        lots: [
          { id: "bonus", bucket: "bonus", availableClp: 3_000 },
          { id: "money", bucket: "loaded_money", availableClp: 10_000 },
        ],
        now: "2026-07-29T00:00:00.000Z",
        order: "bonus_first_fefo",
      }),
    ).toMatchObject({
      commercialTotalClp: 12_000,
      storedValueAppliedClp: 8_000,
      externalPaymentDueClp: 4_000,
    });
  });

  it("una suspensión bloquea recargas pero no devoluciones ni borra pasivos", () => {
    expect(
      storedValueWindDown({
        subscriptionStatus: "suspended",
        outstandingLiabilityClp: 23_000,
      }),
    ).toEqual({
      topUpsAllowed: false,
      redemptionAllowed: true,
      refundsAllowed: true,
      tenantDeletionAllowed: false,
    });
  });
});
