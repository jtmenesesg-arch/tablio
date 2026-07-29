export type TableCreditSettings = Readonly<{
  enabled: boolean;
  maxPerTableClp: number;
  maxVenueExposureClp: number;
  expiresAfterMinutes: number;
}>;

export type TableCreditExposure = Readonly<{
  accountOutstandingClp: number;
  venueOutstandingClp: number;
}>;

export type CreditOrderDecision =
  | Readonly<{ allowed: true; nextAccountClp: number; nextVenueClp: number }>
  | Readonly<{
      allowed: false;
      reason: "disabled" | "table_limit" | "venue_limit";
      message: string;
    }>;

function clp(value: number, label: string): number {
  if (!Number.isSafeInteger(value) || value < 0) {
    throw new Error(`${label} must be a non-negative CLP integer`);
  }
  return value;
}

export function decideCreditOrder(
  settings: TableCreditSettings,
  exposure: TableCreditExposure,
  orderAmountClp: number,
): CreditOrderDecision {
  const amount = clp(orderAmountClp, "orderAmountClp");
  const account = clp(exposure.accountOutstandingClp, "accountOutstandingClp");
  const venue = clp(exposure.venueOutstandingClp, "venueOutstandingClp");
  if (!settings.enabled) {
    return {
      allowed: false,
      reason: "disabled",
      message: "El crédito de mesa está desactivado.",
    };
  }
  const nextAccountClp = account + amount;
  if (nextAccountClp > settings.maxPerTableClp) {
    return {
      allowed: false,
      reason: "table_limit",
      message:
        "La mesa alcanzó su límite. Cobra una parte antes de enviar otro pedido.",
    };
  }
  const nextVenueClp = venue + amount;
  if (nextVenueClp > settings.maxVenueExposureClp) {
    return {
      allowed: false,
      reason: "venue_limit",
      message:
        "El local alcanzó su exposición máxima. Cobra crédito antes de abrir más saldo.",
    };
  }
  return { allowed: true, nextAccountClp, nextVenueClp };
}

export function remainingCreditBalance(
  chargesClp: number,
  paymentsClp: number,
): number {
  return Math.max(
    0,
    clp(chargesClp, "chargesClp") - clp(paymentsClp, "paymentsClp"),
  );
}

export function mixedTableSummary(input: {
  prepaidClp: number;
  creditOutstandingClp: number;
}): string {
  return `${clp(input.prepaidClp, "prepaidClp")} pagados por app · ${clp(
    input.creditOutstandingClp,
    "creditOutstandingClp",
  )} en crédito`;
}
