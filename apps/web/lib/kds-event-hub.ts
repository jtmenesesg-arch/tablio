import "server-only";

type Listener = (event: string) => void;

type KdsEventHub = {
  listeners: Set<Listener>;
};

const shared = globalThis as typeof globalThis & {
  __tablioKdsEventHub?: KdsEventHub;
};

const hub = shared.__tablioKdsEventHub ?? { listeners: new Set<Listener>() };
shared.__tablioKdsEventHub = hub;

export function publishKdsEvent(event: {
  type: "ticket" | "product" | "connection";
  tenantId: string;
  stationId?: string;
  entityId: string;
}): void {
  const encoded = `event: ${event.type}\ndata: ${JSON.stringify(event)}\n\n`;
  for (const listener of hub.listeners) listener(encoded);
}

export function subscribeKdsEvents(listener: Listener): () => void {
  hub.listeners.add(listener);
  return () => hub.listeners.delete(listener);
}
