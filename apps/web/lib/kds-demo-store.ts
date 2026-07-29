import "server-only";

import { randomUUID } from "node:crypto";
import type { KdsTicketItem } from "./kds-contract";
import {
  DEMO_TENANT_ID,
  KdsConflictError,
  KdsDemoRepository,
} from "./kds-demo-repository";
import { publishKdsEvent } from "./kds-event-hub";

const shared = globalThis as typeof globalThis & {
  __tablioKdsDemoRepository?: KdsDemoRepository;
};

const repository = shared.__tablioKdsDemoRepository ?? new KdsDemoRepository();
shared.__tablioKdsDemoRepository = repository;

export { KdsConflictError };

export function getKdsBootstrap(stationId = "all") {
  return repository.bootstrap(stationId);
}

export function mutateKds(
  mutation: Parameters<KdsDemoRepository["mutate"]>[0],
) {
  const bootstrap = repository.mutate(mutation);
  const stationId =
    mutation.action === "heartbeat" ? mutation.stationId : undefined;
  const entityId =
    "ticketId" in mutation
      ? mutation.ticketId
      : "productId" in mutation
        ? mutation.productId
        : "clientId" in mutation
          ? mutation.clientId
          : mutation.printJobId;
  publishKdsEvent({
    type:
      mutation.action === "product.availability"
        ? "product"
        : mutation.action === "heartbeat" || mutation.action === "disconnect"
          ? "connection"
          : "ticket",
    tenantId: DEMO_TENANT_ID,
    stationId,
    entityId,
  });
  return bootstrap;
}

export function appendPaidOrderToKds(input: {
  orderId: string;
  orderNumber: number;
  amountClp?: number;
  tableName: string;
  alias: string;
  displayName?: string;
  confirmedAt: string;
  tickets: readonly {
    id: string;
    stationId: string;
    stationName: string;
    items: readonly KdsTicketItem[];
  }[];
}): void {
  const inserted = repository.appendPaidOrder(input);
  for (const ticket of inserted) {
    publishKdsEvent({
      type: "ticket",
      tenantId: DEMO_TENANT_ID,
      stationId: ticket.stationId,
      entityId: ticket.id,
    });
  }
}

export function kdsTicketStates(ids: readonly string[]) {
  return repository.ticketStates(ids);
}

export function kdsProductAvailability(productId: string) {
  return repository.productAvailability(productId);
}

export function resetKdsForTest(): void {
  if (process.env.TABLIO_E2E !== "1") {
    throw new KdsConflictError("Ruta disponible solo en pruebas.", 404);
  }
  repository.reset();
  publishKdsEvent({
    type: "connection",
    tenantId: DEMO_TENANT_ID,
    entityId: "reset",
  });
}

export function createPaidTicketForLatencyTest(input: {
  stationId: "barra" | "cocina";
  orderNumber?: number;
}): string {
  if (process.env.TABLIO_E2E !== "1") {
    throw new KdsConflictError("Ruta disponible solo en pruebas.", 404);
  }
  const orderId = randomUUID();
  const ticketId = randomUUID();
  const stationName = input.stationId === "barra" ? "Barra" : "Cocina";
  appendPaidOrderToKds({
    orderId,
    orderNumber: input.orderNumber ?? Math.floor(100 + Math.random() * 800),
    amountClp: 14_400,
    tableName: "Mesa 8",
    alias: "Zorro Azul",
    displayName: "Prueba",
    confirmedAt: new Date().toISOString(),
    tickets: [
      {
        id: ticketId,
        stationId: input.stationId,
        stationName,
        items: [
          {
            id: randomUUID(),
            name:
              input.stationId === "barra"
                ? "Lager de la casa"
                : "Hamburguesa clásica",
            quantity: 1,
            note: input.stationId === "barra" ? "Sin espuma" : "Sin pepinillos",
          },
        ],
      },
    ],
  });
  return ticketId;
}
