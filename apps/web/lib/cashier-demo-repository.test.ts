import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  CashierConflictError,
  CashierDemoRepository,
  type CashierActor,
} from "./cashier-demo-repository";
import type { CashierExceptionType } from "./cashier-contract";

describe("CashierDemoRepository", () => {
  let directory: string;
  let current: Date;
  let repository: CashierDemoRepository;
  const cashier: CashierActor = {
    id: "cashier-test",
    name: "Valentina",
    canRefund: true,
    canClose: true,
  };

  beforeEach(() => {
    directory = mkdtempSync(join(tmpdir(), "tablio-cashier-"));
    current = new Date("2026-07-29T02:00:00.000Z");
    repository = new CashierDemoRepository(
      join(directory, "state.json"),
      () => current,
    );
    repository.reset();
  });

  afterEach(() => {
    rmSync(directory, { recursive: true, force: true });
  });

  // Intenta repetir cada diferencia del proveedor. Si falla, una misma causa
  // podría llenar la bandeja y obligar al cajero a resolverla varias veces.
  it("crea cada tipo de excepción una sola vez", () => {
    const types: CashierExceptionType[] = [
      "payment_approved_without_order",
      "approved_after_quote_expired",
      "amount_or_currency_mismatch",
      "merchant_or_tenant_mismatch",
      "tax_document_failed",
      "refund_not_reflected",
      "settlement_difference",
    ];
    for (const type of types) {
      const first = repository.createException({
        type,
        deduplicationKey: `test:${type}`,
      });
      const repeated = repository.createException({
        type,
        deduplicationKey: `test:${type}`,
      });
      expect(repeated.id).toBe(first.id);
    }
  });

  // Comprueba que una aprobación tardía se vea antes del cierre. Si falla,
  // un cliente pagado podría esperar mientras el incidente queda escondido.
  it("muestra la aprobación tardía como crítica e inmediata", () => {
    const exception = repository
      .bootstrap(cashier)
      .exceptions.find(
        (candidate) => candidate.type === "approved_after_quote_expired",
      );
    expect(exception).toMatchObject({
      priority: "critical",
      manualProductionAvailable: true,
    });
    expect(exception?.secondsSinceApproval).toBe(5 * 60);
  });

  // Simula un doble clic con la misma clave. Si falla, el proveedor podría
  // devolver dos veces plata por una sola decisión.
  it("hace el reembolso idempotente", () => {
    const input = {
      paymentId: "payment-mesa-8-a",
      amountClp: 5_000,
      idempotencyKey: "refund:double-click",
      reason: "Producto no entregado",
    };
    const first = repository.requestRefund(cashier, input);
    const repeated = repository.requestRefund(cashier, input);
    expect(repeated.refundId).toBe(first.refundId);
    expect(repeated.idempotentReplay).toBe(true);
    expect(repository.getRefundsForTest()).toHaveLength(1);
  });

  it("devuelve el dinero aunque la nota de crédito quede pendiente", () => {
    // Intenta encadenar la plata a una boleta fallida. Si falla, el cliente
    // esperaría su devolución porque el proveedor DTE está caído.
    const result = repository.requestRefund(cashier, {
      paymentId: "payment-mesa-8-b",
      amountClp: 2_000,
      idempotencyKey: "refund:independent-from-dte",
      reason: "Cliente solicita devolución",
    });
    const bootstrap = result.bootstrap;
    expect(
      bootstrap.payments.find((payment) => payment.id === "payment-mesa-8-b")
        ?.refundedClp,
    ).toBe(2_000);
    expect(
      bootstrap.exceptions.some(
        (exception) =>
          exception.type === "tax_credit_note_pending" &&
          exception.status === "open",
      ),
    ).toBe(true);
  });

  // Devuelve una parte de un pago del turno abierto. Si falla, el cierre
  // podría pagar al personal una propina que ya fue devuelta al cliente.
  it("calcula proporcionalmente la propina con turno abierto", () => {
    repository.requestRefund(cashier, {
      paymentId: "payment-mesa-8-a",
      amountClp: 5_000,
      idempotencyKey: "refund:open-shift",
      reason: "Pedido incompleto",
    });
    expect(repository.getRefundsForTest()[0]).toMatchObject({
      tipComponentClp: 500,
      tipRefundedOpenShiftClp: 500,
      localTipAdjustmentClp: 0,
      policy: "open_shift_reduces_tip",
    });
  });

  // Reembolsa después de distribuir propinas. Si falla, Tablio podría
  // descontarle retroactivamente dinero a un trabajador.
  it("deja la propina post-cierre a cargo del local", () => {
    repository.requestRefund(cashier, {
      paymentId: "payment-previous-shift",
      amountClp: 5_000,
      idempotencyKey: "refund:closed-shift",
      reason: "Reclamo posterior",
    });
    expect(repository.getRefundsForTest()[0]).toMatchObject({
      tipComponentClp: 500,
      tipRefundedOpenShiftClp: 0,
      localTipAdjustmentClp: 500,
      policy: "closed_shift_local_absorbs",
    });
    expect(repository.getAdjustmentsForTest()[0]?.amountClp).toBe(500);
  });

  // Cierra con datos sintéticos. Si falla, la promesa de explicar el abono
  // tendría una suma distinta entre la pantalla y el cierre congelado.
  it("cuadra venta menos deducciones con el abono esperado", () => {
    const bootstrap = repository.bootstrap(cashier);
    const result = repository.closeShift(cashier, {
      expectedVersion: bootstrap.shift!.version,
      cashDeclaredClp: 0,
      exceptionOverrideReason: "Incidentes ya escalados al administrador",
    });
    expect(result.closure.expectedPayoutClp).toBe(
      result.closure.grossSalesClp -
        result.closure.refundsClp -
        result.closure.chargebacksClp -
        result.closure.providerFeesClp,
    );
  });

  // Recibe un evento económico de un turno ya cerrado. Si falla, el pago
  // podría aparecer en el turno actual y cambiar cifras que no le pertenecen.
  it("asocia la confirmación post-cierre al turno original", () => {
    const created = repository.recordLateConfirmation({
      paymentId: "payment-previous-shift",
      providerApprovedAt: "2026-07-28T17:00:00.000Z",
      providerReceivedAt: current.toISOString(),
    });
    expect(created).toMatchObject({
      type: "confirmation_after_shift_close",
      shiftId: "cashier-shift-previous",
    });
  });

  // Usa una hora que no cabe en ningún turno. Si falla, el sistema podría
  // inventar una atribución y esconder un desfase del proveedor.
  it("deja sin turno una confirmación que no tiene intervalo válido", () => {
    const created = repository.recordLateConfirmation({
      paymentId: "payment-previous-shift",
      providerApprovedAt: "2026-07-27T02:00:00.000Z",
      providerReceivedAt: current.toISOString(),
    });
    expect(created).toMatchObject({
      type: "confirmation_without_cashier_shift",
      shiftId: undefined,
      providerApprovedAt: "2026-07-27T02:00:00.000Z",
      providerReceivedAt: current.toISOString(),
    });
  });

  // Intenta reembolsar con un cajero sin permiso. Si falla, cualquier persona
  // con acceso al panel podría devolver dinero.
  it("rechaza reembolsos sin permiso", () => {
    expect(() =>
      repository.requestRefund(
        { ...cashier, canRefund: false },
        {
          paymentId: "payment-mesa-8-a",
          amountClp: 1_000,
          idempotencyKey: "refund:no-permission",
          reason: "Intento sin permiso",
        },
      ),
    ).toThrowError(CashierConflictError);
  });

  // Intenta cerrar ignorando alertas abiertas. Si falla, el turno podría
  // presentarse como limpio aunque queden pagos sin explicar.
  it("exige justificación para cerrar con excepciones abiertas", () => {
    const bootstrap = repository.bootstrap(cashier);
    expect(() =>
      repository.closeShift(cashier, {
        expectedVersion: bootstrap.shift!.version,
        cashDeclaredClp: 0,
      }),
    ).toThrowError(/Justifica el cierre/i);
  });

  // Intenta producir un pedido demasiado viejo. Si falla, la barra podría
  // preparar comida para una persona que ya dejó el local.
  it("deshabilita producción manual después de veinte minutos", () => {
    repository.expireManualProductionWindowForTest();
    const exception = repository
      .bootstrap(cashier)
      .exceptions.find(
        (candidate) => candidate.type === "approved_after_quote_expired",
      )!;
    expect(exception.manualProductionAvailable).toBe(false);
    expect(() =>
      repository.produceManually(cashier, {
        exceptionId: exception.id,
        expectedVersion: exception.version,
        reason: "Cliente aún presente",
      }),
    ).toThrowError(/ventana/i);
  });

  // Produce dentro de la ventana y repite la lectura. Si falla, una decisión
  // del cajero podría crear dos pedidos o dejar la excepción abierta.
  it("produce manualmente una sola vez dentro de la ventana", () => {
    const exception = repository
      .bootstrap(cashier)
      .exceptions.find(
        (candidate) => candidate.type === "approved_after_quote_expired",
      )!;
    repository.produceManually(cashier, {
      exceptionId: exception.id,
      expectedVersion: exception.version,
      reason: "Cliente confirmado en Mesa 12",
    });
    expect(
      repository
        .bootstrap(cashier)
        .exceptions.some((candidate) => candidate.id === exception.id),
    ).toBe(false);
    expect(
      repository
        .getAuditForTest()
        .some(
          (entry) => entry.action === "cashier.late_approval_produced_manually",
        ),
    ).toBe(true);
  });

  // Modifica en memoria el objeto devuelto. Si falla, un cierre podría
  // reescribirse después de ejecutado y perder su valor contable.
  it("mantiene el cierre persistido inmutable", () => {
    const bootstrap = repository.bootstrap(cashier);
    const result = repository.closeShift(cashier, {
      expectedVersion: bootstrap.shift!.version,
      cashDeclaredClp: 0,
      exceptionOverrideReason: "Excepciones documentadas",
    });
    (result.closure as { grossSalesClp: number }).grossSalesClp = 1;
    expect(repository.bootstrap(cashier).latestClosure?.grossSalesClp).not.toBe(
      1,
    );
  });

  // Intenta dejar tributación como placeholder. Si falla, caja no puede
  // explicar venta, pasarela y boleta en la misma línea.
  it("completa la tercera columna con el estado tributario real", () => {
    const lines = repository.bootstrap(cashier).reconciliation;
    expect(lines.some((line) => line.taxDocumentStatus === "issued")).toBe(
      true,
    );
    expect(lines.some((line) => line.taxDocumentStatus === "failed")).toBe(
      true,
    );
  });

  // Intenta esconder una caída hasta el cierre. Si falla, el bar acumularía
  // boletas pendientes sin enterarse mientras todavía está atendiendo.
  it("alerta por volumen, antigüedad y caída reciente del proveedor DTE", () => {
    const tax = repository.bootstrap(cashier).taxOperations;
    expect(tax.requiresAttention).toBe(true);
    expect(tax.pendingCount).toBeGreaterThan(10);
    expect(tax.providerStatus).toBe("down");
  });
});
