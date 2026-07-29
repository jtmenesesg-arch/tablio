export type SubscriptionStatus =
  | "trialing"
  | "active"
  | "past_due"
  | "grace"
  | "admin_restricted"
  | "suspension_scheduled"
  | "suspended"
  | "cancelled";

export type OperationalAccess =
  | "full"
  | "admin_restricted"
  | "order_suspension_scheduled"
  | "order_suspended";

export type DunningSettings = Readonly<{
  noticeDaysBeforeCharge: number;
  graceDays: number;
  retryDelaysHours: readonly number[];
  suspensionNoticeHours: number;
  lowTrafficTimezone: string;
  lowTrafficWeekday: number;
  lowTrafficHour: number;
}>;

export const DEFAULT_DUNNING_SETTINGS: DunningSettings = Object.freeze({
  noticeDaysBeforeCharge: 5,
  graceDays: 10,
  retryDelaysHours: [24, 72, 120],
  suspensionNoticeHours: 48,
  lowTrafficTimezone: "America/Santiago",
  lowTrafficWeekday: 1,
  lowTrafficHour: 12,
});

export function operationalAccessFor(
  status: SubscriptionStatus,
): OperationalAccess {
  if (status === "admin_restricted") return "admin_restricted";
  if (status === "suspension_scheduled") return "order_suspension_scheduled";
  if (status === "suspended" || status === "cancelled")
    return "order_suspended";
  return "full";
}

export function canCreateNewOrder(status: SubscriptionStatus): boolean {
  return operationalAccessFor(status) !== "order_suspended";
}

export function dinerOrderingContract(status: SubscriptionStatus): Readonly<{
  orderingAvailable: boolean;
  message?: string;
}> {
  if (canCreateNewOrder(status)) return { orderingAvailable: true };
  return {
    orderingAvailable: false,
    message:
      "Este local no está recibiendo pedidos por aquí en este momento. Consulta al equipo del local.",
  };
}
