import "server-only";

type Listener = (event: string) => void;

const shared = globalThis as typeof globalThis & {
  __tablioCashierListeners?: Set<Listener>;
};

const listeners =
  shared.__tablioCashierListeners ??
  (shared.__tablioCashierListeners = new Set());

export function publishCashierEvent(input: {
  type: "exception" | "refund" | "shift" | "table" | "settlement";
  entityId: string;
}): void {
  const event = `event: ${input.type}\ndata: ${JSON.stringify({
    entityId: input.entityId,
    at: new Date().toISOString(),
  })}\n\n`;
  for (const listener of listeners) listener(event);
}

export function subscribeCashierEvents(listener: Listener): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}
