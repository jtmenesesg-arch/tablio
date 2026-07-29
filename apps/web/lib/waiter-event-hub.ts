import "server-only";

type Listener = (event: string) => void;

type WaiterEventHub = {
  listeners: Set<Listener>;
};

const shared = globalThis as typeof globalThis & {
  __tablioWaiterEventHub?: WaiterEventHub;
};

const hub = shared.__tablioWaiterEventHub ?? {
  listeners: new Set<Listener>(),
};
shared.__tablioWaiterEventHub = hub;

export function publishWaiterEvent(input: {
  type: "task" | "coverage" | "table" | "shift";
  entityId: string;
}): void {
  const event = `event: ${input.type}\ndata: ${JSON.stringify(input)}\n\n`;
  for (const listener of hub.listeners) listener(event);
}

export function subscribeWaiterEvents(listener: Listener): () => void {
  hub.listeners.add(listener);
  return () => hub.listeners.delete(listener);
}
