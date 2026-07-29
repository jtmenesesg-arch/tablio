export type UpsellRule = Readonly<{
  id: string;
  enabled: boolean;
  priority: number;
  kind: "product" | "category" | "schedule" | "margin" | "manual";
  suggestionProductId: string;
  sourceProductId?: string;
  sourceCategoryId?: string;
  startsAtMinute?: number;
  endsAtMinute?: number;
  minimumMarginClp?: number;
}>;

export type UpsellProduct = Readonly<{
  id: string;
  categoryId: string;
  available: boolean;
  priceClp: number;
  unitCostClp?: number;
}>;

export type Promotion = Readonly<{
  id: string;
  version: number;
  enabled: boolean;
  kind: "two_for_one" | "percentage" | "special_price";
  productIds: readonly string[];
  categoryIds: readonly string[];
  percentageBps?: number;
  specialPriceClp?: number;
  startsAt: string;
  endsAt: string;
}>;

export type FrozenPromotion = Readonly<{
  promotionId: string;
  version: number;
  unitDiscountClp: number;
  explanation: string;
}>;

export type InvitationState =
  "pending_claim" | "claimed" | "refund_pending" | "refunded" | "expired";

export function selectUpsells(input: {
  rules: readonly UpsellRule[];
  products: readonly UpsellProduct[];
  cartProductIds: readonly string[];
  cartCategoryIds: readonly string[];
  minuteOfDay: number;
  maxSuggestions: number;
}): readonly UpsellProduct[] {
  if (input.maxSuggestions <= 0) return [];
  const products = new Map(
    input.products.map((product) => [product.id, product]),
  );
  const cartProducts = new Set(input.cartProductIds);
  const cartCategories = new Set(input.cartCategoryIds);
  const selected = new Set<string>();

  return [...input.rules]
    .filter((rule) => rule.enabled)
    .sort(
      (left, right) =>
        left.priority - right.priority || left.id.localeCompare(right.id),
    )
    .flatMap((rule) => {
      const product = products.get(rule.suggestionProductId);
      if (
        !product ||
        !product.available ||
        cartProducts.has(product.id) ||
        selected.has(product.id)
      ) {
        return [];
      }
      const matches =
        rule.kind === "manual" ||
        (rule.kind === "product" &&
          Boolean(
            rule.sourceProductId && cartProducts.has(rule.sourceProductId),
          )) ||
        (rule.kind === "category" &&
          Boolean(
            rule.sourceCategoryId && cartCategories.has(rule.sourceCategoryId),
          )) ||
        (rule.kind === "schedule" &&
          rule.startsAtMinute !== undefined &&
          rule.endsAtMinute !== undefined &&
          input.minuteOfDay >= rule.startsAtMinute &&
          input.minuteOfDay < rule.endsAtMinute) ||
        (rule.kind === "margin" &&
          product.unitCostClp !== undefined &&
          product.priceClp - product.unitCostClp >=
            (rule.minimumMarginClp ?? 0));
      if (!matches) return [];
      selected.add(product.id);
      return [product];
    })
    .slice(0, Math.min(2, input.maxSuggestions));
}

export function freezePromotion(input: {
  promotion: Promotion;
  product: Pick<UpsellProduct, "id" | "categoryId" | "priceClp">;
  quantity: number;
  now: string;
}): FrozenPromotion | undefined {
  const instant = Date.parse(input.now);
  if (
    !input.promotion.enabled ||
    instant < Date.parse(input.promotion.startsAt) ||
    instant >= Date.parse(input.promotion.endsAt) ||
    (!input.promotion.productIds.includes(input.product.id) &&
      !input.promotion.categoryIds.includes(input.product.categoryId))
  ) {
    return undefined;
  }
  let unitDiscountClp = 0;
  if (input.promotion.kind === "percentage") {
    unitDiscountClp = Math.floor(
      (input.product.priceClp * (input.promotion.percentageBps ?? 0)) / 10_000,
    );
  } else if (input.promotion.kind === "special_price") {
    unitDiscountClp = Math.max(
      0,
      input.product.priceClp -
        (input.promotion.specialPriceClp ?? input.product.priceClp),
    );
  } else if (input.quantity >= 2) {
    unitDiscountClp =
      (Math.floor(input.quantity / 2) * input.product.priceClp) /
      input.quantity;
    unitDiscountClp = Math.floor(unitDiscountClp);
  }
  if (unitDiscountClp <= 0) return undefined;
  return {
    promotionId: input.promotion.id,
    version: input.promotion.version,
    unitDiscountClp,
    explanation: `${input.promotion.kind} v${input.promotion.version} congelada en el quote`,
  };
}

export function invitationExpiresAt(input: {
  now: string;
  ttlMinutes?: number;
  destinationTableClosesAt?: string;
}): string {
  const ttlMinutes = input.ttlMinutes ?? 60;
  if (!Number.isInteger(ttlMinutes) || ttlMinutes < 45 || ttlMinutes > 90) {
    throw new Error(
      "La vigencia de una invitación debe estar entre 45 y 90 minutos.",
    );
  }
  const byTtl = Date.parse(input.now) + ttlMinutes * 60_000;
  const tableClose = input.destinationTableClosesAt
    ? Date.parse(input.destinationTableClosesAt)
    : Number.POSITIVE_INFINITY;
  return new Date(Math.min(byTtl, tableClose)).toISOString();
}

export function invitationWarningAt(
  expiresAt: string,
  warningMinutes = 10,
): string {
  return new Date(
    Date.parse(expiresAt) - warningMinutes * 60_000,
  ).toISOString();
}

export function canCancelInvitation(state: InvitationState): boolean {
  return state === "pending_claim";
}

export function assertInvitationCapacity(input: {
  previousInvitedUnits: number;
  cartInvitedUnits: number;
  requestedUnits: number;
  maxInvitedUnitsPerDeviceSession: number;
}): void {
  const values = [
    input.previousInvitedUnits,
    input.cartInvitedUnits,
    input.requestedUnits,
    input.maxInvitedUnitsPerDeviceSession,
  ];
  if (
    values.some((value) => !Number.isSafeInteger(value) || value < 0) ||
    input.requestedUnits < 1 ||
    input.maxInvitedUnitsPerDeviceSession < 1
  ) {
    throw new Error("El límite de invitaciones no es válido.");
  }
  if (
    input.previousInvitedUnits + input.cartInvitedUnits + input.requestedUnits >
    input.maxInvitedUnitsPerDeviceSession
  ) {
    throw new Error("Alcanzaste el máximo de invitaciones para esta sesión.");
  }
}

export function canClaimInvitation(input: {
  state: InvitationState;
  payerDeviceSessionId: string;
  claimantDeviceSessionId: string;
  destinationTableSessionId: string;
  claimantTableSessionId: string;
  expiresAt: string;
  now: string;
}): boolean {
  return (
    input.state === "pending_claim" &&
    input.payerDeviceSessionId !== input.claimantDeviceSessionId &&
    input.destinationTableSessionId === input.claimantTableSessionId &&
    Date.parse(input.expiresAt) > Date.parse(input.now)
  );
}

export function assertWaiterTipRecipient(input: {
  quoteTenantId: string;
  tableZoneId: string;
  recipientTenantId: string;
  recipientZoneIds: readonly string[];
  employeeSessionState: "active" | "closed" | "expired";
}): void {
  if (
    input.quoteTenantId !== input.recipientTenantId ||
    input.employeeSessionState !== "active" ||
    !input.recipientZoneIds.includes(input.tableZoneId)
  ) {
    throw new Error("El garzón no está activo en la zona de esta mesa.");
  }
}
