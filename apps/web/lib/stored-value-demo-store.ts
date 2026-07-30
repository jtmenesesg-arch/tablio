import "server-only";

import { createHash, randomUUID } from "node:crypto";
import {
  allocateStoredValue,
  decideStoredValueTopUp,
  PaymentEventProcessor,
  splitStoredValueTender,
  type StoredValueAllocation,
  type StoredValueBucket,
  type StoredValueLot,
  type StoredValueSettings,
} from "@tablio/application";
import {
  InMemoryPaymentEventStore,
  SimulatedPaymentGateway,
} from "@tablio/payments-simulated";
import { assertSimulatedPaymentGateway } from "./demo-payment-runtime";

export const STORED_VALUE_TENANT_ID = "00000000-0000-4000-8000-000000000301";
const MERCHANT_ACCOUNT_ID = "demo-merchant:bar-la-esquina:stored-value";

type LedgerType =
  | "topup_loaded_money"
  | "topup_bonus"
  | "order_consumption"
  | "order_refund"
  | "topup_refund"
  | "expiry"
  | "manual_adjustment";

type LedgerEntry = {
  id: string;
  tenantId: string;
  accountId: string;
  profileId: string;
  lotId: string;
  bucket: StoredValueBucket;
  type: LedgerType;
  amountClp: number;
  idempotencyKey: string;
  checkoutQuoteId?: string;
  orderId?: string;
  paymentId?: string;
  reason?: string;
  actorId?: string;
  occurredAt: string;
};

type Lot = {
  id: string;
  accountId: string;
  bucket: StoredValueBucket;
  originalClp: number;
  expiresAt?: string;
  createdAt: string;
};

type Account = {
  id: string;
  tenantId: string;
  profileId: string;
  status: "active" | "frozen_for_recovery" | "wind_down";
  consentedAt: string;
  recoveryReference?: string;
};

type QuoteReservation = {
  quoteId: string;
  accountId: string;
  policyVersion: number;
  allocations: readonly StoredValueAllocation[];
  commercialTotalClp: number;
  storedValueAppliedClp: number;
  externalPaymentDueClp: number;
  expiresAt: string;
  consumedOrderId?: string;
  releasedAt?: string;
};

type TopUpReceipt = {
  id: string;
  accountId: string;
  quoteId: string;
  paymentId: string;
  loadedMoneyClp: number;
  bonusClp: number;
  occurredAt: string;
  refundedAt?: string;
  refundId?: string;
};

type AuditEntry = {
  id: string;
  accountId: string;
  action: string;
  reason: string;
  actorId: string;
  occurredAt: string;
};

type DemoState = {
  settings: StoredValueSettings & {
    loadedMoneyValidityDays?: number;
    bonusValidityDays?: number;
    expiryWarningDays: number;
  };
  accounts: Map<string, Account>;
  lots: Map<string, Lot>;
  ledger: LedgerEntry[];
  reservations: Map<string, QuoteReservation>;
  receipts: TopUpReceipt[];
  audit: AuditEntry[];
  idempotency: Map<string, string>;
  gateway: SimulatedPaymentGateway;
  processor: PaymentEventProcessor;
  tenantStatus: "active" | "suspended" | "cancelled";
};

function createState(): DemoState {
  assertSimulatedPaymentGateway();
  const gateway = new SimulatedPaymentGateway(
    "tablio-stored-value-demo-webhook-secret",
  );
  const eventStore = new InMemoryPaymentEventStore();
  return {
    settings: {
      enabled: true,
      productionValidated: false,
      maxConsumerBalanceClp: 40_000,
      maxVenueLiabilityClp: 200_000,
      bonusBps: 1_500,
      consumptionOrder: "bonus_first_fefo",
      policyVersion: 1,
      loadedMoneyValidityDays: undefined,
      bonusValidityDays: 90,
      expiryWarningDays: 7,
    },
    accounts: new Map(),
    lots: new Map(),
    ledger: [],
    reservations: new Map(),
    receipts: [],
    audit: [],
    idempotency: new Map(),
    gateway,
    processor: new PaymentEventProcessor(gateway, eventStore),
    tenantStatus: "active",
  };
}

const globalStore = globalThis as typeof globalThis & {
  __tablioStoredValueDemo?: DemoState;
};
let state =
  globalStore.__tablioStoredValueDemo ??
  (globalStore.__tablioStoredValueDemo = createState());

const now = () => new Date();

function accountForProfile(profileId: string): Account | undefined {
  return [...state.accounts.values()].find(
    (account) =>
      account.tenantId === STORED_VALUE_TENANT_ID &&
      account.profileId === profileId,
  );
}

function accountBalance(accountId: string, bucket?: StoredValueBucket): number {
  return state.ledger
    .filter(
      (entry) =>
        entry.accountId === accountId &&
        (bucket === undefined || entry.bucket === bucket),
    )
    .reduce((sum, entry) => sum + entry.amountClp, 0);
}

function venueLiability(): number {
  return [...state.accounts.values()].reduce(
    (sum, account) => sum + accountBalance(account.id),
    0,
  );
}

function appendLedger(entry: Omit<LedgerEntry, "id" | "occurredAt">): void {
  if (state.idempotency.has(entry.idempotencyKey)) return;
  const id = randomUUID();
  state.ledger.push({
    ...entry,
    id,
    occurredAt: now().toISOString(),
  });
  state.idempotency.set(entry.idempotencyKey, id);
}

function availableLots(
  accountId: string,
  excludingQuoteId?: string,
): StoredValueLot[] {
  const reservedByLot = new Map<string, number>();
  for (const reservation of state.reservations.values()) {
    if (
      reservation.accountId !== accountId ||
      reservation.quoteId === excludingQuoteId ||
      reservation.releasedAt ||
      reservation.consumedOrderId ||
      Date.parse(reservation.expiresAt) <= now().getTime()
    )
      continue;
    for (const allocation of reservation.allocations) {
      reservedByLot.set(
        allocation.lotId,
        (reservedByLot.get(allocation.lotId) ?? 0) + allocation.amountClp,
      );
    }
  }
  return [...state.lots.values()]
    .filter((lot) => lot.accountId === accountId)
    .map((lot) => ({
      id: lot.id,
      bucket: lot.bucket,
      availableClp: Math.max(
        0,
        state.ledger
          .filter(
            (entry) => entry.accountId === accountId && entry.lotId === lot.id,
          )
          .reduce((sum, entry) => sum + entry.amountClp, 0) -
          (reservedByLot.get(lot.id) ?? 0),
      ),
      expiresAt: lot.expiresAt,
    }));
}

function expiryFor(days?: number): string | undefined {
  return days === undefined
    ? undefined
    : new Date(now().getTime() + days * 86_400_000).toISOString();
}

function processExpirations(): void {
  for (const lot of state.lots.values()) {
    if (!lot.expiresAt || Date.parse(lot.expiresAt) > now().getTime()) continue;
    const available = availableLots(lot.accountId).find(
      (candidate) => candidate.id === lot.id,
    )?.availableClp;
    if (!available) continue;
    const account = state.accounts.get(lot.accountId)!;
    appendLedger({
      tenantId: account.tenantId,
      accountId: account.id,
      profileId: account.profileId,
      lotId: lot.id,
      bucket: lot.bucket,
      type: "expiry",
      amountClp: -available,
      idempotencyKey: `stored-value:expiry:${lot.id}`,
      reason: "Vencimiento según configuración del tenant; hipótesis legal.",
      actorId: "system",
    });
  }
}

function ensureAccount(profileId: string): Account {
  const account = accountForProfile(profileId);
  if (!account) {
    throw new Error(
      "Acepta primero el saldo del local desde tu perfil recuperable.",
    );
  }
  return account;
}

export class StoredValueDemoStore {
  reset(): void {
    state = createState();
    globalStore.__tablioStoredValueDemo = state;
  }

  consent(profileId: string): void {
    if (accountForProfile(profileId)) return;
    const account: Account = {
      id: randomUUID(),
      tenantId: STORED_VALUE_TENANT_ID,
      profileId,
      status: "active",
      consentedAt: now().toISOString(),
    };
    state.accounts.set(account.id, account);
  }

  async topUp(input: {
    profileId: string;
    loadedMoneyClp: number;
    idempotencyKey: string;
  }): Promise<void> {
    const account = ensureAccount(input.profileId);
    if (account.status !== "active" || state.tenantStatus !== "active") {
      throw new Error(
        "Este local pausó nuevas recargas. Tu saldo sigue disponible para usar o devolver.",
      );
    }
    const scopedKey = `${STORED_VALUE_TENANT_ID}:${input.idempotencyKey}`;
    if (state.idempotency.has(`stored-value:topup:${scopedKey}:money`)) return;
    const decision = decideStoredValueTopUp({
      settings: state.settings,
      currentConsumerBalanceClp: accountBalance(account.id),
      currentVenueLiabilityClp: venueLiability(),
      loadedMoneyClp: input.loadedMoneyClp,
      allowSimulatedMode: true,
    });
    if (!decision.allowed) throw new Error(decision.message);

    const quoteId = randomUUID();
    const attempt = await state.gateway.createPaymentAttempt({
      tenantId: STORED_VALUE_TENANT_ID,
      merchantAccountId: MERCHANT_ACCOUNT_ID,
      amount: { amount: decision.loadedMoneyClp, currency: "CLP" },
      checkoutQuoteId: quoteId,
      idempotencyKey: scopedKey,
      returnUrl: "/mesa/demo-mesa-8",
    });
    state.gateway.setPaymentOutcome(
      {
        tenantId: STORED_VALUE_TENANT_ID,
        merchantAccountId: MERCHANT_ACCOUNT_ID,
      },
      attempt.providerPaymentId,
      "confirmed",
    );
    const signed = state.gateway.createSignedWebhook({
      providerPaymentId: attempt.providerPaymentId,
      eventKind: "payment.confirmed",
    });
    const confirmed = await state.processor.handle(
      {
        tenantId: STORED_VALUE_TENANT_ID,
        merchantAccountId: MERCHANT_ACCOUNT_ID,
      },
      signed.envelope,
    );
    if (confirmed.payment.status !== "confirmed") {
      throw new Error("La recarga no fue confirmada por el servidor.");
    }

    const moneyLot: Lot = {
      id: randomUUID(),
      accountId: account.id,
      bucket: "loaded_money",
      originalClp: decision.loadedMoneyClp,
      expiresAt: expiryFor(state.settings.loadedMoneyValidityDays),
      createdAt: now().toISOString(),
    };
    state.lots.set(moneyLot.id, moneyLot);
    appendLedger({
      tenantId: account.tenantId,
      accountId: account.id,
      profileId: account.profileId,
      lotId: moneyLot.id,
      bucket: "loaded_money",
      type: "topup_loaded_money",
      amountClp: decision.loadedMoneyClp,
      idempotencyKey: `stored-value:topup:${scopedKey}:money`,
      checkoutQuoteId: quoteId,
      paymentId: confirmed.payment.providerPaymentId,
    });

    if (decision.bonusClp > 0) {
      const bonusLot: Lot = {
        id: randomUUID(),
        accountId: account.id,
        bucket: "bonus",
        originalClp: decision.bonusClp,
        expiresAt: expiryFor(state.settings.bonusValidityDays),
        createdAt: now().toISOString(),
      };
      state.lots.set(bonusLot.id, bonusLot);
      appendLedger({
        tenantId: account.tenantId,
        accountId: account.id,
        profileId: account.profileId,
        lotId: bonusLot.id,
        bucket: "bonus",
        type: "topup_bonus",
        amountClp: decision.bonusClp,
        idempotencyKey: `stored-value:topup:${scopedKey}:bonus`,
        checkoutQuoteId: quoteId,
        paymentId: confirmed.payment.providerPaymentId,
      });
    }
    state.receipts.push({
      id: randomUUID(),
      accountId: account.id,
      quoteId,
      paymentId: confirmed.payment.providerPaymentId,
      loadedMoneyClp: decision.loadedMoneyClp,
      bonusClp: decision.bonusClp,
      occurredAt: now().toISOString(),
    });
  }

  reserveForQuote(input: {
    profileId: string;
    quoteId: string;
    commercialTotalClp: number;
    requestedStoredValueClp: number;
    expiresAt: string;
  }) {
    processExpirations();
    const account = ensureAccount(input.profileId);
    const existing = state.reservations.get(input.quoteId);
    if (existing) return existing;
    const split = splitStoredValueTender({
      commercialTotalClp: input.commercialTotalClp,
      requestedStoredValueClp: input.requestedStoredValueClp,
      lots: availableLots(account.id),
      now: now().toISOString(),
      order: state.settings.consumptionOrder,
    });
    if (
      split.storedValueAppliedClp <
      Math.min(input.requestedStoredValueClp, input.commercialTotalClp)
    ) {
      throw new Error(
        `Tu saldo disponible es $${accountBalance(account.id).toLocaleString(
          "es-CL",
        )}. Elige un monto menor antes de confirmar.`,
      );
    }
    const reservation: QuoteReservation = {
      quoteId: input.quoteId,
      accountId: account.id,
      policyVersion: state.settings.policyVersion,
      allocations: split.allocations,
      commercialTotalClp: split.commercialTotalClp,
      storedValueAppliedClp: split.storedValueAppliedClp,
      externalPaymentDueClp: split.externalPaymentDueClp,
      expiresAt: input.expiresAt,
    };
    state.reservations.set(input.quoteId, reservation);
    return reservation;
  }

  consumeForOrder(input: {
    profileId: string;
    quoteId: string;
    orderId: string;
  }): number {
    const account = ensureAccount(input.profileId);
    const reservation = state.reservations.get(input.quoteId);
    if (!reservation || reservation.accountId !== account.id) {
      throw new Error("La reserva de saldo del quote no existe.");
    }
    if (reservation.consumedOrderId) {
      return reservation.storedValueAppliedClp;
    }
    for (const allocation of reservation.allocations) {
      appendLedger({
        tenantId: account.tenantId,
        accountId: account.id,
        profileId: account.profileId,
        lotId: allocation.lotId,
        bucket: allocation.bucket,
        type: "order_consumption",
        amountClp: -allocation.amountClp,
        idempotencyKey: `stored-value:consume:${input.quoteId}:${allocation.lotId}`,
        checkoutQuoteId: input.quoteId,
        orderId: input.orderId,
      });
    }
    reservation.consumedOrderId = input.orderId;
    return reservation.storedValueAppliedClp;
  }

  releaseQuote(quoteId: string): void {
    const reservation = state.reservations.get(quoteId);
    if (reservation && !reservation.consumedOrderId) {
      reservation.releasedAt = now().toISOString();
    }
  }

  refundOrder(input: {
    orderId: string;
    amountClp: number;
    idempotencyKey: string;
  }): number {
    const consumed = state.ledger.filter(
      (entry) =>
        entry.orderId === input.orderId && entry.type === "order_consumption",
    );
    const alreadyRestored = state.ledger
      .filter(
        (entry) =>
          entry.orderId === input.orderId && entry.type === "order_refund",
      )
      .reduce((sum, entry) => sum + entry.amountClp, 0);
    const consumedTotal = -consumed.reduce(
      (sum, entry) => sum + entry.amountClp,
      0,
    );
    let remaining = Math.min(
      input.amountClp,
      Math.max(0, consumedTotal - alreadyRestored),
    );
    for (const source of consumed) {
      if (remaining === 0) break;
      const amountClp = Math.min(remaining, -source.amountClp);
      appendLedger({
        tenantId: source.tenantId,
        accountId: source.accountId,
        profileId: source.profileId,
        lotId: source.lotId,
        bucket: source.bucket,
        type: "order_refund",
        amountClp,
        idempotencyKey: `${input.idempotencyKey}:${source.id}`,
        orderId: input.orderId,
        reason: "Devuelto al mismo componente de saldo usado en el pedido.",
      });
      remaining -= amountClp;
    }
    return Math.min(input.amountClp, consumedTotal - alreadyRestored);
  }

  async refundTopUp(input: {
    receiptId: string;
    reason: string;
    actorId: string;
    idempotencyKey: string;
  }): Promise<void> {
    if (!input.reason.trim()) throw new Error("El motivo es obligatorio.");
    const receipt = state.receipts.find(
      (candidate) => candidate.id === input.receiptId,
    );
    if (!receipt) throw new Error("La recarga no existe.");
    if (receipt.refundedAt) return;
    const topUpEntries = state.ledger.filter(
      (entry) =>
        entry.accountId === receipt.accountId &&
        entry.checkoutQuoteId === receipt.quoteId &&
        (entry.type === "topup_loaded_money" || entry.type === "topup_bonus"),
    );
    const fullyAvailable = topUpEntries.every((entry) => {
      const available =
        availableLots(receipt.accountId).find((lot) => lot.id === entry.lotId)
          ?.availableClp ?? 0;
      return available >= entry.amountClp;
    });
    if (!fullyAvailable) {
      throw new Error(
        "Sólo se puede devolver una recarga que todavía no fue consumida.",
      );
    }
    const moneyEntry = topUpEntries.find(
      (entry) => entry.type === "topup_loaded_money",
    );
    if (!moneyEntry?.paymentId) {
      throw new Error("La recarga no tiene pago confirmado asociado.");
    }
    const refund = await state.gateway.refund({
      tenantId: STORED_VALUE_TENANT_ID,
      merchantAccountId: MERCHANT_ACCOUNT_ID,
      providerPaymentId: moneyEntry.paymentId,
      amount: { amount: receipt.loadedMoneyClp, currency: "CLP" },
      idempotencyKey: input.idempotencyKey,
    });
    for (const entry of topUpEntries) {
      appendLedger({
        tenantId: entry.tenantId,
        accountId: entry.accountId,
        profileId: entry.profileId,
        lotId: entry.lotId,
        bucket: entry.bucket,
        type: "topup_refund",
        amountClp: -entry.amountClp,
        idempotencyKey: `${input.idempotencyKey}:${entry.id}`,
        checkoutQuoteId: receipt.quoteId,
        paymentId: receipt.paymentId,
        reason: input.reason.trim(),
        actorId: input.actorId,
      });
    }
    receipt.refundedAt = now().toISOString();
    receipt.refundId = refund.refundId;
    state.audit.push({
      id: randomUUID(),
      accountId: receipt.accountId,
      action: "stored_value.topup_refund",
      reason: input.reason.trim(),
      actorId: input.actorId,
      occurredAt: receipt.refundedAt,
    });
  }

  manualAdjust(input: {
    profileId: string;
    bucket: StoredValueBucket;
    deltaClp: number;
    reason: string;
    actorId: string;
    idempotencyKey: string;
  }): void {
    if (!input.reason.trim()) throw new Error("El motivo es obligatorio.");
    if (!Number.isSafeInteger(input.deltaClp) || input.deltaClp === 0) {
      throw new Error("El ajuste debe ser un monto CLP distinto de cero.");
    }
    const account = ensureAccount(input.profileId);
    if (
      input.deltaClp < 0 &&
      accountBalance(account.id, input.bucket) < -input.deltaClp
    ) {
      throw new Error("El ajuste no puede dejar saldo negativo.");
    }
    if (input.deltaClp > 0) {
      const lot: Lot = {
        id: randomUUID(),
        accountId: account.id,
        bucket: input.bucket,
        originalClp: input.deltaClp,
        createdAt: now().toISOString(),
      };
      state.lots.set(lot.id, lot);
      appendLedger({
        tenantId: account.tenantId,
        accountId: account.id,
        profileId: account.profileId,
        lotId: lot.id,
        bucket: input.bucket,
        type: "manual_adjustment",
        amountClp: input.deltaClp,
        idempotencyKey: input.idempotencyKey,
        reason: input.reason.trim(),
        actorId: input.actorId,
      });
    } else {
      const debit = allocateStoredValue({
        lots: availableLots(account.id).filter(
          (candidate) => candidate.bucket === input.bucket,
        ),
        requestedClp: -input.deltaClp,
        now: now().toISOString(),
        order: state.settings.consumptionOrder,
      });
      if (debit.appliedClp !== -input.deltaClp) {
        throw new Error("No existe saldo suficiente del componente elegido.");
      }
      for (const allocation of debit.allocations) {
        appendLedger({
          tenantId: account.tenantId,
          accountId: account.id,
          profileId: account.profileId,
          lotId: allocation.lotId,
          bucket: input.bucket,
          type: "manual_adjustment",
          amountClp: -allocation.amountClp,
          idempotencyKey: `${input.idempotencyKey}:${allocation.lotId}`,
          reason: input.reason.trim(),
          actorId: input.actorId,
        });
      }
    }
    state.audit.push({
      id: randomUUID(),
      accountId: account.id,
      action: "stored_value.manual_adjustment",
      reason: input.reason.trim(),
      actorId: input.actorId,
      occurredAt: now().toISOString(),
    });
  }

  freezeForIdentityDeletion(profileId: string): string | undefined {
    const account = accountForProfile(profileId);
    if (!account || accountBalance(account.id) === 0) return undefined;
    account.status = "frozen_for_recovery";
    account.recoveryReference = `SALDO-${createHash("sha256")
      .update(account.id)
      .digest("hex")
      .slice(0, 8)
      .toUpperCase()}`;
    return account.recoveryReference;
  }

  setTenantStatus(status: "active" | "suspended" | "cancelled"): void {
    state.tenantStatus = status;
    for (const account of state.accounts.values()) {
      if (status !== "active" && account.status === "active") {
        account.status = "wind_down";
      } else if (status === "active" && account.status === "wind_down") {
        account.status = "active";
      }
    }
  }

  snapshot(profileId?: string) {
    processExpirations();
    const account = profileId ? accountForProfile(profileId) : undefined;
    const lots = account ? availableLots(account.id) : [];
    const moneyClp = account ? accountBalance(account.id, "loaded_money") : 0;
    const bonusClp = account ? accountBalance(account.id, "bonus") : 0;
    const warningBoundary =
      now().getTime() + state.settings.expiryWarningDays * 86_400_000;
    return {
      enabled: state.settings.enabled,
      productionBlocked: !state.settings.productionValidated,
      consented: Boolean(account),
      status: account?.status,
      balanceClp: moneyClp + bonusClp,
      loadedMoneyClp: moneyClp,
      bonusClp,
      maxConsumerBalanceClp: state.settings.maxConsumerBalanceClp,
      maxVenueLiabilityClp: state.settings.maxVenueLiabilityClp,
      bonusBps: state.settings.bonusBps,
      policyVersion: state.settings.policyVersion,
      expiring: lots
        .filter(
          (lot) =>
            lot.expiresAt &&
            Date.parse(lot.expiresAt) <= warningBoundary &&
            lot.availableClp > 0,
        )
        .map((lot) => ({
          bucket: lot.bucket,
          amountClp: lot.availableClp,
          expiresAt: lot.expiresAt!,
        })),
      latestReceipt: account
        ? [...state.receipts]
            .reverse()
            .find((receipt) => receipt.accountId === account.id)
        : undefined,
      recoveryReference: account?.recoveryReference,
      history: account
        ? state.ledger
            .filter((entry) => entry.accountId === account.id)
            .slice(-12)
            .reverse()
            .map((entry) => ({
              id: entry.id,
              type: entry.type,
              bucket: entry.bucket,
              amountClp: entry.amountClp,
              reason: entry.reason,
              occurredAt: entry.occurredAt,
            }))
        : [],
    } as const;
  }

  accountsForCashier() {
    processExpirations();
    return [...state.accounts.values()].map((account) => {
      const latestReceipt = [...state.receipts]
        .reverse()
        .find(
          (receipt) => receipt.accountId === account.id && !receipt.refundedAt,
        );
      const receiptEntries = latestReceipt
        ? state.ledger.filter(
            (entry) =>
              entry.accountId === account.id &&
              entry.checkoutQuoteId === latestReceipt.quoteId &&
              (entry.type === "topup_loaded_money" ||
                entry.type === "topup_bonus"),
          )
        : [];
      const latestTopUpRefundable =
        Boolean(latestReceipt) &&
        receiptEntries.length > 0 &&
        receiptEntries.every(
          (entry) =>
            (availableLots(account.id).find((lot) => lot.id === entry.lotId)
              ?.availableClp ?? 0) >= entry.amountClp,
        );
      return {
        id: account.id,
        profileId: account.profileId,
        status: account.status,
        loadedMoneyClp: accountBalance(account.id, "loaded_money"),
        bonusClp: accountBalance(account.id, "bonus"),
        balanceClp: accountBalance(account.id),
        latestTopUpReceiptId: latestReceipt?.id,
        latestTopUpRefundable,
        lastMovementAt:
          [...state.ledger]
            .reverse()
            .find((entry) => entry.accountId === account.id)?.occurredAt ??
          account.consentedAt,
      };
    });
  }

  metrics() {
    processExpirations();
    const topUps = state.ledger.filter(
      (entry) =>
        entry.type === "topup_loaded_money" || entry.type === "topup_bonus",
    );
    const consumption = state.ledger.filter(
      (entry) => entry.type === "order_consumption",
    );
    const expired = state.ledger.filter((entry) => entry.type === "expiry");
    return {
      liabilityClp: venueLiability(),
      loadedMoneyLiabilityClp: [...state.accounts.values()].reduce(
        (sum, account) => sum + accountBalance(account.id, "loaded_money"),
        0,
      ),
      bonusLiabilityClp: [...state.accounts.values()].reduce(
        (sum, account) => sum + accountBalance(account.id, "bonus"),
        0,
      ),
      topUpsCashInClp: topUps
        .filter((entry) => entry.type === "topup_loaded_money")
        .reduce((sum, entry) => sum + entry.amountClp, 0),
      topUpBonusClp: topUps
        .filter((entry) => entry.type === "topup_bonus")
        .reduce((sum, entry) => sum + entry.amountClp, 0),
      consumedRevenueClp: -consumption.reduce(
        (sum, entry) => sum + entry.amountClp,
        0,
      ),
      expiredClp: -expired.reduce((sum, entry) => sum + entry.amountClp, 0),
      accountCount: state.accounts.size,
      maxConsumerBalanceClp: state.settings.maxConsumerBalanceClp,
      maxVenueLiabilityClp: state.settings.maxVenueLiabilityClp,
      tenantStatus: state.tenantStatus,
      auditCount: state.audit.length,
    };
  }
}

export const storedValueDemoStore = new StoredValueDemoStore();
