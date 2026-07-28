export const TABLE_SESSION_TRANSITIONS = {
  active: ["paused", "closed", "expired"],
  paused: ["active", "closed", "expired"],
  closed: [],
  expired: [],
} as const;

export const CART_TRANSITIONS = {
  open: ["checkout_started", "expired"],
  checkout_started: ["open", "expired", "converted_to_order"],
  expired: [],
  converted_to_order: [],
} as const;

export const PAYMENT_INTENT_TRANSITIONS = {
  created: ["redirected"],
  redirected: ["processing", "rejected", "expired", "cancelled"],
  processing: ["approved", "rejected", "expired", "cancelled"],
  approved: [],
  rejected: [],
  expired: [],
  cancelled: [],
} as const;

export const ORDER_TRANSITIONS = {
  awaiting_payment: ["confirmed"],
  confirmed: ["accepted", "cancelled"],
  accepted: ["in_preparation", "cancelled"],
  in_preparation: ["ready", "cancelled"],
  ready: ["delivered", "cancelled"],
  delivered: [],
  cancelled: [],
} as const;

export const TICKET_TRANSITIONS = {
  queued: ["acknowledged"],
  acknowledged: ["in_preparation"],
  in_preparation: ["ready"],
  ready: ["completed"],
  completed: [],
} as const;

type StateGraph = Readonly<Record<string, readonly string[]>>;

export function canTransition(
  graph: StateGraph,
  from: string,
  to: string,
): boolean {
  return graph[from]?.includes(to) ?? false;
}

export function assertTransition(
  graph: StateGraph,
  from: string,
  to: string,
  aggregateName: string,
): void {
  if (!canTransition(graph, from, to)) {
    throw new Error(`Invalid ${aggregateName} transition: ${from} -> ${to}`);
  }
}
