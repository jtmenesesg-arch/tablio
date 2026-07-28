export const DEFAULT_QUOTE_TTL_SECONDS = 10 * 60;
export const MIN_QUOTE_TTL_SECONDS = 5 * 60;
export const MAX_QUOTE_TTL_SECONDS = 20 * 60;

export type StockPolicyProduct = Readonly<{
  productId: string;
  trackStock: boolean;
  quantity: number;
}>;

export type QuoteClock = Readonly<{
  createdAt: string;
  expiresAt: string;
}>;

export function quoteClock(
  createdAt: Date,
  ttlSeconds = DEFAULT_QUOTE_TTL_SECONDS,
): QuoteClock {
  if (
    !Number.isSafeInteger(ttlSeconds) ||
    ttlSeconds < MIN_QUOTE_TTL_SECONDS ||
    ttlSeconds > MAX_QUOTE_TTL_SECONDS
  ) {
    throw new Error("Quote TTL must be between 5 and 20 minutes");
  }

  return {
    createdAt: createdAt.toISOString(),
    expiresAt: new Date(createdAt.getTime() + ttlSeconds * 1000).toISOString(),
  };
}

export function stockReservationsFor(
  products: readonly StockPolicyProduct[],
): readonly StockPolicyProduct[] {
  return products.filter((product) => product.trackStock);
}

export function isQuoteExpired(clock: QuoteClock, now: Date): boolean {
  return now.getTime() >= new Date(clock.expiresAt).getTime();
}

export const LATE_APPROVAL_DECISION = {
  message: "requiere decisión: reembolsar o producir manualmente",
  options: ["refund", "produce_manually"],
  visibleToCashier: true,
  priority: "critical",
} as const;
