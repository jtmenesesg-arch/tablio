import { describe, expect, it } from "vitest";
import { OWNER_DEMO_TENANT_ID, OwnerDemoStore } from "./owner-demo-store";

describe("OwnerDemoStore", () => {
  it("calcula todas las cifras en servidor y excluye otro tenant", () => {
    const dashboard = new OwnerDemoStore().dashboard({
      tenantId: OWNER_DEMO_TENANT_ID,
    });
    expect(dashboard.metrics.salesClp).toBeLessThan(99_999_999);
    expect(
      dashboard.topProducts.some((item) => item.name === "Dato prohibido"),
    ).toBe(false);
  });

  it("un local nuevo muestra datos actuales y una fecha de comparación", () => {
    const dashboard = new OwnerDemoStore().dashboard({
      tenantId: OWNER_DEMO_TENANT_ID,
      newTenant: true,
    });
    expect(dashboard.metrics.salesClp).toBeGreaterThan(0);
    expect(dashboard.period.comparisonAvailable).toBe(false);
    expect(dashboard.story.historyMessage).toContain(
      "comparaciones aparecerán",
    );
    expect(dashboard.period.comparisonAppearsAt).toBeTruthy();
  });

  it("rechaza una vista de otro tenant", () => {
    expect(() =>
      new OwnerDemoStore().dashboard({
        tenantId: "00000000-0000-4000-8000-000000009999",
      }),
    ).toThrow("otro tenant");
  });
});
