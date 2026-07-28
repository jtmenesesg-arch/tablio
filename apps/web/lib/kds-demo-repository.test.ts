import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { KdsConflictError, KdsDemoRepository } from "./kds-demo-repository";

const temporaryDirectories: string[] = [];

function repository() {
  const directory = mkdtempSync(join(tmpdir(), "tablio-kds-"));
  temporaryDirectories.push(directory);
  return new KdsDemoRepository(join(directory, "state.json"));
}

function appendOrder(
  store: KdsDemoRepository,
  input?: { orderId?: string; confirmedAt?: string },
) {
  return store.appendPaidOrder({
    orderId: input?.orderId ?? "order-1",
    orderNumber: 104,
    tableName: "Mesa 8",
    alias: "Zorro Azul",
    displayName: "Cata",
    confirmedAt: input?.confirmedAt ?? "2026-07-28T20:00:00.000Z",
    tickets: [
      {
        id: `${input?.orderId ?? "order-1"}:barra`,
        stationId: "barra",
        stationName: "Barra",
        items: [
          {
            id: "item-beer",
            name: "Lager de la casa",
            quantity: 2,
            note: "Una sin espuma",
          },
        ],
      },
      {
        id: `${input?.orderId ?? "order-1"}:cocina`,
        stationId: "cocina",
        stationName: "Cocina",
        items: [
          {
            id: "item-food",
            name: "Hamburguesa clásica",
            quantity: 1,
          },
        ],
      },
    ],
  });
}

afterEach(() => {
  while (temporaryDirectories.length > 0) {
    rmSync(temporaryDirectories.pop()!, { recursive: true, force: true });
  }
});

describe("KdsDemoRepository", () => {
  it("recupera todas las comandas después de recrear el servidor", () => {
    // Intenta romper la durabilidad. Si falla, reiniciar el proceso podría
    // dejar a la barra sin un pedido que el cliente ya pagó.
    const firstProcess = repository();
    appendOrder(firstProcess);
    const secondProcess = new KdsDemoRepository(firstProcess.filePath);
    expect(secondProcess.bootstrap("all").tickets).toHaveLength(2);
    expect(secondProcess.bootstrap("barra").tickets[0]).toMatchObject({
      stationId: "barra",
      paid: true,
    });
  });

  it("un evento duplicado no crea comandas ni impresiones duplicadas", () => {
    // Intenta entregar dos veces la misma confirmación. Si falla, la barra
    // podría preparar e imprimir dos veces un solo pedido.
    const store = repository();
    expect(appendOrder(store)).toHaveLength(2);
    expect(appendOrder(store)).toHaveLength(0);
    const snapshot = store.bootstrap("all");
    expect(snapshot.tickets).toHaveLength(2);
    expect(snapshot.printJobs).toHaveLength(2);
  });

  it("dos estaciones avanzan de forma independiente", () => {
    // Intenta acoplar Barra y Cocina. Si falla, marcar una cerveza lista podría
    // hacer parecer lista una comida que todavía sigue en preparación.
    const store = repository();
    appendOrder(store);
    const barra = store.bootstrap("barra").tickets[0];
    store.mutate({
      action: "ticket.transition",
      ticketId: barra.id,
      expectedState: "queued",
      expectedVersion: 0,
      targetState: "acknowledged",
    });
    expect(store.bootstrap("barra").tickets[0].state).toBe("acknowledged");
    expect(store.bootstrap("cocina").tickets[0].state).toBe("queued");
  });

  it("rechaza una escritura concurrente con versión obsoleta", () => {
    // Intenta que dos pantallas cambien la misma comanda al mismo tiempo. Si
    // falla, el estado podría saltar o retroceder sin que nadie lo note.
    const store = repository();
    appendOrder(store);
    const ticket = store.bootstrap("barra").tickets[0];
    store.mutate({
      action: "ticket.transition",
      ticketId: ticket.id,
      expectedState: "queued",
      expectedVersion: 0,
      targetState: "acknowledged",
    });
    expect(() =>
      store.mutate({
        action: "ticket.transition",
        ticketId: ticket.id,
        expectedState: "queued",
        expectedVersion: 0,
        targetState: "in_preparation",
      }),
    ).toThrow(KdsConflictError);
  });

  it("separa latencia con KDS conectado de casos sin pantalla", () => {
    // Intenta contaminar el p95 con una tablet apagada. Si falla, la métrica
    // culparía al sistema por minutos u horas en que nadie estaba mirando.
    const store = repository();
    store.mutate({
      action: "heartbeat",
      clientId: "client-barra",
      stationId: "barra",
    });
    const confirmedAt = new Date().toISOString();
    appendOrder(store, { confirmedAt });
    const barra = store.bootstrap("barra").tickets[0];
    store.mutate({
      action: "ticket.visible",
      ticketId: barra.id,
      clientId: "client-barra",
      source: "realtime",
    });
    const summary = store.bootstrap("all").latency;
    expect(summary.connectedSampleCount).toBe(1);
    expect(summary.noKdsConnectedCount).toBe(1);
    expect(summary.p95Ms).toBeTypeOf("number");
  });

  it("agotar y reponer queda persistido para la carta", () => {
    // Intenta dejar la carta vendiendo algo marcado como agotado. Si falla,
    // nuevas personas podrían agregar un producto que la barra ya no tiene.
    const store = repository();
    store.mutate({
      action: "product.availability",
      productId: "burger-clasica",
      available: false,
      reason: "Se terminó la producción del día",
    });
    expect(store.productAvailability("burger-clasica")).toBe(false);
    const restarted = new KdsDemoRepository(store.filePath);
    expect(restarted.productAvailability("burger-clasica")).toBe(false);
  });

  it("la reimpresión crea otro trabajo sin alterar el original", () => {
    // Intenta sobrescribir el trabajo original. Si falla, se perdería la
    // evidencia de quién reimprimió y por qué.
    const store = repository();
    appendOrder(store);
    const original = store.bootstrap("barra").printJobs[0];
    store.mutate({
      action: "print.reprint",
      printJobId: original.id,
      reason: "Papel mojado",
    });
    const jobs = store
      .bootstrap("barra")
      .printJobs.filter((job) => job.ticketId === original.ticketId);
    expect(jobs).toHaveLength(2);
    expect(jobs[1]).toMatchObject({
      reprintOfJobId: original.id,
      reprintReason: "Papel mojado",
    });
  });
});
