import "server-only";

import type { CashierMutation } from "./cashier-contract";
import {
  CashierConflictError,
  CashierDemoRepository,
  type CashierActor,
} from "./cashier-demo-repository";
import { publishCashierEvent } from "./cashier-event-hub";

const actor: CashierActor = {
  id: "cashier-valentina",
  name: "Valentina",
  canRefund: true,
  canClose: true,
};

const shared = globalThis as typeof globalThis & {
  __tablioCashierDemoRepository?: CashierDemoRepository;
};

const repository =
  shared.__tablioCashierDemoRepository ?? new CashierDemoRepository();
shared.__tablioCashierDemoRepository = repository;

export { CashierConflictError };

export function getCashierBootstrap() {
  return repository.bootstrap(actor);
}

export function mutateCashier(mutation: CashierMutation) {
  switch (mutation.action) {
    case "refund.request": {
      const result = repository.requestRefund(actor, mutation);
      publishCashierEvent({ type: "refund", entityId: result.refundId });
      return result;
    }
    case "exception.transition": {
      const bootstrap = repository.transitionException(actor, mutation);
      publishCashierEvent({
        type: "exception",
        entityId: mutation.exceptionId,
      });
      return { bootstrap };
    }
    case "exception.produce": {
      const bootstrap = repository.produceManually(actor, mutation);
      publishCashierEvent({
        type: "exception",
        entityId: mutation.exceptionId,
      });
      return { bootstrap };
    }
    case "shift.close": {
      const result = repository.closeShift(actor, mutation);
      publishCashierEvent({ type: "shift", entityId: result.closure.id });
      return result;
    }
  }
}

export function exportCashierCsv(kind: "closure" | "exceptions"): string {
  return kind === "closure"
    ? repository.exportLatestClosureCsv()
    : repository.exportExceptionsCsv();
}

function assertTestMode(): void {
  if (process.env.TABLIO_E2E !== "1") {
    throw new CashierConflictError("Ruta disponible sólo en pruebas.", 404);
  }
}

export function resetCashierForTest(): void {
  assertTestMode();
  repository.reset();
  publishCashierEvent({ type: "shift", entityId: "reset" });
}

export function seedCashierExceptionForTest(input: {
  type:
    | "payment_approved_without_order"
    | "approved_after_quote_expired"
    | "amount_or_currency_mismatch"
    | "merchant_or_tenant_mismatch"
    | "tax_document_failed"
    | "refund_not_reflected"
    | "settlement_difference";
  deduplicationKey: string;
}): void {
  assertTestMode();
  const created = repository.createException(input);
  publishCashierEvent({ type: "exception", entityId: created.id });
}

export function expireManualProductionForTest(): void {
  assertTestMode();
  repository.expireManualProductionWindowForTest();
  publishCashierEvent({ type: "exception", entityId: "expired-window" });
}
