import { describe, expect, it } from "vitest";
import {
  TableCreditDemoStore,
  type CreditActor,
} from "./table-credit-demo-store";

const admin: CreditActor = {
  id: "admin",
  name: "Admin",
  tenantId: "00000000-0000-4000-8000-000000000401",
  canOpen: true,
  canCharge: true,
  canCloseWithLoss: true,
};
const waiter = { ...admin, id: "waiter", canOpen: false };

describe("TableCreditDemoStore", () => {
  it("un tenant nuevo parte con crédito desactivado", () => {
    expect(
      new TableCreditDemoStore(false).bootstrap(admin).settings.enabled,
    ).toBe(false);
  });

  it("un rol sin permiso no puede abrir crédito", () => {
    const store = new TableCreditDemoStore(false);
    store.mutate(admin, {
      action: "settings.enable",
      enabled: true,
      reason: "Política aprobada",
    });
    expect(() =>
      store.mutate(waiter, {
        action: "account.open",
        tableId: "m1",
        tableName: "Mesa 1",
        reason: "Solicitud",
      }),
    ).toThrow("No tienes permiso");
  });

  it("prepago y crédito coexisten sin mezclar saldos", () => {
    const store = new TableCreditDemoStore(true);
    const account = store.bootstrap(admin).accounts[0]!;
    expect(account.prepaidByAppClp).toBe(32_000);
    expect(account.outstandingClp).toBe(18_500);
  });

  it("pago parcial libera saldo e idempotencia evita duplicarlo", () => {
    const store = new TableCreditDemoStore(true);
    const id = store.bootstrap(admin).accounts[0]!.id;
    const mutation = {
      action: "payment.add" as const,
      accountId: id,
      amountClp: 8_500,
      method: "digital" as const,
      idempotencyKey: "payment-1",
    };
    store.mutate(admin, mutation);
    store.mutate(admin, mutation);
    expect(store.bootstrap(admin).accounts[0]!.outstandingClp).toBe(10_000);
    expect(store.bootstrap(admin).printSpool).toHaveLength(1);
  });

  it("código inventado falla y el código real sólo sirve una vez", () => {
    const store = new TableCreditDemoStore(true);
    const id = store.bootstrap(admin).accounts[0]!.id;
    store.mutate(admin, {
      action: "payment.add",
      accountId: id,
      amountClp: 18_500,
      method: "in_person",
      idempotencyKey: "settle",
    });
    const issued = store.mutate(admin, {
      action: "verification.issue",
      accountId: id,
    });
    const code = issued.accounts[0]!.verification!.code;
    expect(() =>
      store.mutate(admin, {
        action: "verification.validate",
        accountId: id,
        code: "000000",
      }),
    ).toThrow("Código inválido");
    store.mutate(admin, {
      action: "verification.validate",
      accountId: id,
      code,
    });
    expect(() =>
      store.mutate(admin, {
        action: "verification.validate",
        accountId: id,
        code,
      }),
    ).toThrow("ya utilizado");
  });

  it("cerrar con fuga registra pérdida y deja saldo en cero", () => {
    const store = new TableCreditDemoStore(true);
    const id = store.bootstrap(admin).accounts[0]!.id;
    const result = store.mutate(admin, {
      action: "account.close_loss",
      accountId: id,
      reason: "La mesa se retiró",
    });
    expect(result.accounts[0]).toMatchObject({
      status: "closed_with_loss",
      outstandingClp: 0,
    });
    expect(result.losses.at(-1)?.amountClp).toBe(18_500);
  });
});
