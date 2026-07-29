import { describe, expect, it } from "vitest";
import {
  dinerOrderingContract,
  operationalAccessFor,
  recommendPlan,
} from "../index";

describe("política comercial SaaS", () => {
  it("clasifica principalmente por mesas dentro del beachhead", () => {
    // Intenta dejar casi todos los bares en un único plan. Si falla, el
    // pricing no distinguiría un local chico de uno grande.
    expect(recommendPlan({ tables: 12, zones: 3, stations: 3 }).code).toBe(
      "starter",
    );
    expect(recommendPlan({ tables: 13, zones: 2, stations: 2 }).code).toBe(
      "flow",
    );
    expect(recommendPlan({ tables: 31, zones: 3, stations: 3 }).code).toBe(
      "high_flow",
    );
    expect(recommendPlan({ tables: 61, zones: 4, stations: 4 }).code).toBe(
      "custom",
    );
  });

  it("no castiga un layout con muchas zonas salvo exceso conjunto claro", () => {
    // Intenta subir un bar chico sólo por tener terraza y patio. Si falla,
    // el layout físico se cobraría como si fueran más mesas.
    expect(recommendPlan({ tables: 10, zones: 5, stations: 3 }).code).toBe(
      "starter",
    );
    expect(recommendPlan({ tables: 10, zones: 5, stations: 5 }).code).toBe(
      "flow",
    );
  });

  it("oculta la causa comercial al comensal y separa acceso operativo", () => {
    // Intenta filtrar morosidad al QR. Si falla, el cliente final sabría que
    // el bar no pagó y se dañaría la relación comercial.
    expect(operationalAccessFor("admin_restricted")).toBe("admin_restricted");
    const diner = dinerOrderingContract("suspended");
    expect(diner.orderingAvailable).toBe(false);
    expect(JSON.stringify(diner)).not.toMatch(/deuda|moros|cobro|suscrip/i);
  });
});
