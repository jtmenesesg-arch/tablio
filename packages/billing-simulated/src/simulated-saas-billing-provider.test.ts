import { describe, expect, it } from "vitest";
import { SimulatedSaasBillingProvider } from "./simulated-saas-billing-provider";

describe("SimulatedSaasBillingProvider", () => {
  it("cobra setup y mensualidad sin mezclarlos con pagos del bar", async () => {
    // Intenta reutilizar el flujo de ventas para cobrar Tablio. Si falla, se
    // mezclarían fondos del bar con la mensualidad del software.
    const provider = new SimulatedSaasBillingProvider();
    const account = await provider.connectAccount({
      tenantId: "tenant-a",
      ownerEmail: "dueno@bar.cl",
      idempotencyKey: "connect:a",
    });
    const setup = await provider.charge({
      tenantId: "tenant-a",
      billingAccountId: account.id,
      kind: "setup",
      amount: { amount: 199_000, currency: "CLP" },
      idempotencyKey: "setup:a",
    });
    const recurring = await provider.charge({
      tenantId: "tenant-a",
      billingAccountId: account.id,
      kind: "subscription",
      amount: { amount: 99_000, currency: "CLP" },
      idempotencyKey: "month:a:2026-08",
    });
    expect(setup.kind).toBe("setup");
    expect(recurring.kind).toBe("subscription");
    expect(recurring.status).toBe("succeeded");
  });

  it("reintenta un cobro fallido sin suspender por sí mismo", async () => {
    // Intenta convertir un rechazo en suspensión inmediata. Si falla, una
    // tarjeta sin cupo podría cortar el bar durante el servicio.
    const provider = new SimulatedSaasBillingProvider();
    const account = await provider.connectAccount({
      tenantId: "tenant-a",
      ownerEmail: "dueno@bar.cl",
      idempotencyKey: "connect:a",
    });
    const failed = await provider.charge({
      tenantId: "tenant-a",
      billingAccountId: account.id,
      kind: "subscription",
      amount: { amount: 99_000, currency: "CLP" },
      idempotencyKey: "month:a:failed",
      simulateFailure: true,
    });
    const recovered = await provider.retryCharge({
      tenantId: "tenant-a",
      chargeId: failed.id,
      idempotencyKey: "month:a:retry:1",
    });
    expect(failed.status).toBe("failed");
    expect(recovered).toMatchObject({ status: "succeeded", attemptNumber: 2 });
  });

  it("deduplica cargos y rechaza cuentas de otro tenant", async () => {
    // Repite el mismo cargo y cruza tenants. Si falla, Tablio podría cobrar
    // dos veces o usar el medio de pago de otro local.
    const provider = new SimulatedSaasBillingProvider();
    const account = await provider.connectAccount({
      tenantId: "tenant-a",
      ownerEmail: "dueno@bar.cl",
      idempotencyKey: "connect:a",
    });
    const input = {
      tenantId: "tenant-a",
      billingAccountId: account.id,
      kind: "subscription" as const,
      amount: { amount: 99_000, currency: "CLP" as const },
      idempotencyKey: "same-charge",
    };
    const first = await provider.charge(input);
    const repeated = await provider.charge(input);
    expect(repeated.id).toBe(first.id);
    await expect(
      provider.charge({
        ...input,
        tenantId: "tenant-b",
        idempotencyKey: "cross-tenant",
      }),
    ).rejects.toThrow("not ready for this tenant");
  });
});
