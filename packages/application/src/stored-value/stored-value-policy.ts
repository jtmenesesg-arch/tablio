export type StoredValueBucket = "loaded_money" | "bonus";

export type StoredValueSettings = Readonly<{
  enabled: boolean;
  productionValidated: boolean;
  maxConsumerBalanceClp: number;
  maxVenueLiabilityClp?: number;
  bonusBps: number;
  consumptionOrder: "bonus_first_fefo" | "loaded_money_first_fefo";
  policyVersion: number;
}>;

export type StoredValueLot = Readonly<{
  id: string;
  bucket: StoredValueBucket;
  availableClp: number;
  expiresAt?: string;
}>;

export type StoredValueAllocation = Readonly<{
  lotId: string;
  bucket: StoredValueBucket;
  amountClp: number;
}>;

function clp(value: number, label: string): number {
  if (!Number.isSafeInteger(value) || value < 0) {
    throw new Error(`${label} debe ser un entero CLP no negativo.`);
  }
  return value;
}

export function calculateTopUpBonus(
  loadedMoneyClp: number,
  bonusBps: number,
): number {
  const loaded = clp(loadedMoneyClp, "loadedMoneyClp");
  if (!Number.isSafeInteger(bonusBps) || bonusBps < 0 || bonusBps > 10_000) {
    throw new Error("bonusBps debe estar entre 0 y 10000.");
  }
  return Math.floor((loaded * bonusBps) / 10_000);
}

export type TopUpDecision =
  | Readonly<{
      allowed: true;
      loadedMoneyClp: number;
      bonusClp: number;
      nextConsumerBalanceClp: number;
      nextVenueLiabilityClp: number;
    }>
  | Readonly<{
      allowed: false;
      reason:
        "disabled" | "production_blocked" | "consumer_limit" | "venue_limit";
      message: string;
    }>;

export function decideStoredValueTopUp(input: {
  settings: StoredValueSettings;
  currentConsumerBalanceClp: number;
  currentVenueLiabilityClp: number;
  loadedMoneyClp: number;
  allowSimulatedMode?: boolean;
}): TopUpDecision {
  const consumer = clp(
    input.currentConsumerBalanceClp,
    "currentConsumerBalanceClp",
  );
  const venue = clp(input.currentVenueLiabilityClp, "currentVenueLiabilityClp");
  const loaded = clp(input.loadedMoneyClp, "loadedMoneyClp");
  if (!input.settings.enabled) {
    return {
      allowed: false,
      reason: "disabled",
      message: "El saldo prepagado está desactivado en este local.",
    };
  }
  if (!input.settings.productionValidated && !input.allowSimulatedMode) {
    return {
      allowed: false,
      reason: "production_blocked",
      message:
        "Las recargas reales siguen bloqueadas hasta validar su tratamiento legal y tributario.",
    };
  }
  const bonusClp = calculateTopUpBonus(loaded, input.settings.bonusBps);
  const credited = loaded + bonusClp;
  const nextConsumerBalanceClp = consumer + credited;
  if (nextConsumerBalanceClp > input.settings.maxConsumerBalanceClp) {
    return {
      allowed: false,
      reason: "consumer_limit",
      message:
        "Alcanzaste el máximo de saldo de este local. Usa parte antes de volver a cargar.",
    };
  }
  const nextVenueLiabilityClp = venue + credited;
  if (
    input.settings.maxVenueLiabilityClp !== undefined &&
    nextVenueLiabilityClp > input.settings.maxVenueLiabilityClp
  ) {
    return {
      allowed: false,
      reason: "venue_limit",
      message:
        "El local alcanzó su límite total de saldo pendiente y pausó nuevas recargas.",
    };
  }
  return {
    allowed: true,
    loadedMoneyClp: loaded,
    bonusClp,
    nextConsumerBalanceClp,
    nextVenueLiabilityClp,
  };
}

const expiry = (lot: StoredValueLot): number =>
  lot.expiresAt ? Date.parse(lot.expiresAt) : Number.POSITIVE_INFINITY;

export function allocateStoredValue(input: {
  lots: readonly StoredValueLot[];
  requestedClp: number;
  now: string;
  order: StoredValueSettings["consumptionOrder"];
}): Readonly<{
  allocations: readonly StoredValueAllocation[];
  appliedClp: number;
  remainingDueClp: number;
}> {
  const requested = clp(input.requestedClp, "requestedClp");
  const now = Date.parse(input.now);
  const bucketRank: Record<StoredValueBucket, number> =
    input.order === "bonus_first_fefo"
      ? { bonus: 0, loaded_money: 1 }
      : { loaded_money: 0, bonus: 1 };
  const candidates = input.lots
    .filter(
      (lot) => clp(lot.availableClp, "availableClp") > 0 && expiry(lot) > now,
    )
    .sort(
      (left, right) =>
        bucketRank[left.bucket] - bucketRank[right.bucket] ||
        expiry(left) - expiry(right) ||
        left.id.localeCompare(right.id),
    );
  let remaining = requested;
  const allocations: StoredValueAllocation[] = [];
  for (const lot of candidates) {
    if (remaining === 0) break;
    const amountClp = Math.min(remaining, lot.availableClp);
    allocations.push({ lotId: lot.id, bucket: lot.bucket, amountClp });
    remaining -= amountClp;
  }
  return {
    allocations,
    appliedClp: requested - remaining,
    remainingDueClp: remaining,
  };
}

export function splitStoredValueTender(input: {
  commercialTotalClp: number;
  requestedStoredValueClp: number;
  lots: readonly StoredValueLot[];
  now: string;
  order: StoredValueSettings["consumptionOrder"];
}) {
  const commercialTotalClp = clp(
    input.commercialTotalClp,
    "commercialTotalClp",
  );
  const requested = Math.min(
    commercialTotalClp,
    clp(input.requestedStoredValueClp, "requestedStoredValueClp"),
  );
  const allocated = allocateStoredValue({
    lots: input.lots,
    requestedClp: requested,
    now: input.now,
    order: input.order,
  });
  return {
    commercialTotalClp,
    storedValueAppliedClp: allocated.appliedClp,
    externalPaymentDueClp: commercialTotalClp - allocated.appliedClp,
    allocations: allocated.allocations,
  } as const;
}

export function storedValueWindDown(input: {
  subscriptionStatus: "active" | "suspended" | "cancelled";
  outstandingLiabilityClp: number;
}) {
  const liability = clp(
    input.outstandingLiabilityClp,
    "outstandingLiabilityClp",
  );
  if (input.subscriptionStatus === "active") {
    return {
      topUpsAllowed: true,
      redemptionAllowed: true,
      refundsAllowed: true,
      tenantDeletionAllowed: liability === 0,
    } as const;
  }
  return {
    topUpsAllowed: false,
    redemptionAllowed: input.subscriptionStatus === "suspended",
    refundsAllowed: true,
    tenantDeletionAllowed: liability === 0,
  } as const;
}
