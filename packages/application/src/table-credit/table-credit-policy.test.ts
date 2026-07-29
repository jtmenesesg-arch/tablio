import { describe, expect, it } from "vitest";
import {
  decideCreditOrder,
  mixedTableSummary,
  remainingCreditBalance,
} from "./table-credit-policy";

const settings = {
  enabled: true,
  maxPerTableClp: 60_000,
  maxVenueExposureClp: 180_000,
  expiresAfterMinutes: 180,
} as const;

describe("table credit policy", () => {
  it("rechaza crédito cuando el local no lo habilitó", () => {
    expect(
      decideCreditOrder(
        { ...settings, enabled: false },
        { accountOutstandingClp: 0, venueOutstandingClp: 0 },
        10_000,
      ),
    ).toMatchObject({ allowed: false, reason: "disabled" });
  });

  it("corta pedidos nuevos al alcanzar el límite de la mesa", () => {
    expect(
      decideCreditOrder(
        settings,
        { accountOutstandingClp: 55_000, venueOutstandingClp: 80_000 },
        6_000,
      ),
    ).toMatchObject({ allowed: false, reason: "table_limit" });
  });

  it("corta pedidos nuevos al alcanzar la exposición total", () => {
    expect(
      decideCreditOrder(
        settings,
        { accountOutstandingClp: 20_000, venueOutstandingClp: 175_000 },
        6_000,
      ),
    ).toMatchObject({ allowed: false, reason: "venue_limit" });
  });

  it("un pago parcial libera exposición sin tocar prepago", () => {
    expect(remainingCreditBalance(30_000, 12_000)).toBe(18_000);
    expect(
      mixedTableSummary({ prepaidClp: 32_000, creditOutstandingClp: 18_500 }),
    ).toBe("32000 pagados por app · 18500 en crédito");
  });
});
