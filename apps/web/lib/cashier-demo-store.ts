import "server-only";

import type { CashierMutation } from "./cashier-contract";
import {
  CashierConflictError,
  CashierDemoRepository,
  type CashierActor,
} from "./cashier-demo-repository";
import { publishCashierEvent } from "./cashier-event-hub";
import {
  creditDemoActor,
  tableCreditDemoStore,
} from "./table-credit-demo-store";
import { loyaltyDemoStore } from "./loyalty-demo-store";
import { checkoutEngagementDemoMetrics } from "./diner-demo-store";
import { storedValueDemoStore } from "./stored-value-demo-store";

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
  const bootstrap = repository.bootstrap(actor);
  const credit = tableCreditDemoStore.bootstrap(creditDemoActor);
  const liveAccountIds = new Set(credit.accounts.map((account) => account.id));
  const currentShiftLosses = credit.losses.filter((loss) =>
    liveAccountIds.has(loss.accountId),
  );
  const engagement = checkoutEngagementDemoMetrics();
  const storedValue = storedValueDemoStore.metrics();
  const loyaltyProfiles = loyaltyDemoStore.cashierProfiles();
  return {
    ...bootstrap,
    tableCredit: {
      enabled: credit.settings.enabled,
      openExposureClp: credit.exposure.openClp,
      maxVenueExposureClp: credit.settings.maxVenueExposureClp,
      currentShiftLossClp: currentShiftLosses.reduce(
        (total, loss) => total + loss.amountClp,
        0,
      ),
      currentShiftLossCount: currentShiftLosses.length,
      accounts: credit.accounts.map((account) => ({
        id: account.id,
        tableName: account.tableName,
        status: account.status,
        prepaidByAppClp: account.prepaidByAppClp,
        outstandingClp: account.outstandingClp,
        expiresAt: account.expiresAt,
      })),
    },
    loyalty: {
      identityLossRatePercent:
        loyaltyDemoStore.metrics().identityLossRatePercent,
      identityRecoveries: loyaltyDemoStore.metrics().identityRecoveries,
      profiles: loyaltyProfiles,
    },
    storedValue: {
      liabilityClp: storedValue.liabilityClp,
      topUpsCashInClp: storedValue.topUpsCashInClp,
      consumedRevenueClp: storedValue.consumedRevenueClp,
      expiredClp: storedValue.expiredClp,
      maxVenueLiabilityClp: storedValue.maxVenueLiabilityClp,
      accounts: storedValueDemoStore.accountsForCashier().map((account) => ({
        ...account,
        maskedIdentity:
          loyaltyProfiles.find((profile) => profile.id === account.profileId)
            ?.maskedIdentity ?? "Perfil financiero anonimizado",
      })),
    },
    tipReport: engagement.tipAllocations.map((tip) => ({
      workerName: tip.employeeName,
      workerSessionId: tip.employeeSessionId,
      paymentMethod: tip.paymentMethod,
      amountClp: tip.amountClp,
      occurredAt: tip.occurredAt,
      note:
        tip.employeeName === "Equipo"
          ? "Distribución al equipo"
          : "Destinatario congelado al crear el quote",
    })),
  };
}

export async function mutateCashier(mutation: CashierMutation) {
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
    case "tax.retry": {
      const bootstrap = repository.retryTaxDocument(actor, mutation);
      publishCashierEvent({
        type: "exception",
        entityId: mutation.taxDocumentId,
      });
      return { bootstrap };
    }
    case "shift.close": {
      const result = repository.closeShift(actor, mutation);
      publishCashierEvent({ type: "shift", entityId: result.closure.id });
      return result;
    }
    case "loyalty.adjust": {
      loyaltyDemoStore.assistedAdjustment({
        profileId: mutation.profileId,
        stampDelta: mutation.stampDelta,
        reason: mutation.reason,
        actorId: actor.id,
      });
      publishCashierEvent({
        type: "exception",
        entityId: mutation.profileId,
      });
      return { bootstrap: getCashierBootstrap() };
    }
    case "stored_value.adjust": {
      storedValueDemoStore.manualAdjust({
        profileId: mutation.profileId,
        bucket: mutation.bucket,
        deltaClp: mutation.deltaClp,
        reason: mutation.reason,
        actorId: actor.id,
        idempotencyKey: mutation.idempotencyKey,
      });
      publishCashierEvent({
        type: "exception",
        entityId: mutation.profileId,
      });
      return { bootstrap: getCashierBootstrap() };
    }
    case "stored_value.topup_refund": {
      await storedValueDemoStore.refundTopUp({
        receiptId: mutation.receiptId,
        reason: mutation.reason,
        actorId: actor.id,
        idempotencyKey: mutation.idempotencyKey,
      });
      publishCashierEvent({
        type: "refund",
        entityId: mutation.receiptId,
      });
      return { bootstrap: getCashierBootstrap() };
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
