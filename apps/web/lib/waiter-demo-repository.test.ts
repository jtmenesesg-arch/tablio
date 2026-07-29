import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import type { KdsTicket } from "./kds-contract";
import {
  WaiterConflictError,
  WaiterDemoRepository,
} from "./waiter-demo-repository";

const directories: string[] = [];

function repository(clock?: () => Date) {
  const directory = mkdtempSync(join(tmpdir(), "tablio-waiter-"));
  directories.push(directory);
  return new WaiterDemoRepository(join(directory, "state.json"), clock);
}

function readyTicket(id = "ticket-ready", orderNumber = 201): KdsTicket {
  const readyAt = new Date().toISOString();
  return {
    id,
    tenantId: "00000000-0000-4000-8000-000000000301",
    orderId: `order-${id}`,
    orderNumber,
    amountClp: 14_400,
    tableName: "Mesa 8",
    alias: "Zorro Azul",
    displayName: "Cata",
    stationId: "barra",
    stationName: "Barra",
    state: "ready",
    version: 3,
    paid: true,
    confirmedAt: readyAt,
    readyAt,
    items: [{ id: "beer", name: "Lager de la casa", quantity: 2 }],
  };
}

function login(
  store: WaiterDemoRepository,
  pin = "2468",
  fingerprint = "device-camila",
) {
  return store.login(pin, fingerprint).token;
}

afterEach(() => {
  while (directories.length) {
    rmSync(directories.pop()!, { recursive: true, force: true });
  }
});

describe("WaiterDemoRepository", () => {
  it("hace visible una tarea huérfana a todos y la escala", () => {
    // Intenta dejar una entrega en una zona sin garzón. Si falla, comida ya
    // pagada podría quedar invisible y enfriarse sin que nadie lo advierta.
    let instant = new Date("2026-07-28T22:00:00.000Z");
    const store = repository(() => instant);
    const camila = login(store);
    store.setZones(camila, ["salon"]);
    store.syncReadyTickets([readyTicket()]);
    const initial = store.bootstrap(camila);
    expect(initial.tasks[0]).toMatchObject({
      unassignedZone: true,
      adminEscalated: false,
    });
    instant = new Date("2026-07-28T22:02:01.000Z");
    expect(store.bootstrap(camila).tasks[0]).toMatchObject({
      unassignedZone: true,
      adminEscalated: true,
    });
  });

  it("sube una tarea antigua por encima de una entrega nueva", () => {
    // Intenta provocar inanición con entregas constantes. Si falla, un llamado
    // viejo podría no llegar nunca a la parte visible de la cola.
    const store = repository();
    const token = login(store);
    store.setZones(token, ["terraza"]);
    store.appendServiceRequest({
      id: "call-old",
      actionId: "call-waiter",
      label: "Llamar al garzón",
      description: "Para pedir ayuda en la mesa",
      alias: "Zorro Azul",
      requestedAt: new Date().toISOString(),
    });
    store.syncReadyTickets([readyTicket()]);
    const call = store.taskBySource("call-old")!;
    store.ageTask(call.id, 12 * 60 + 1);
    const queue = store.bootstrap(token).tasks;
    expect(queue[0]).toMatchObject({
      sourceId: "call-old",
      critical: true,
      effectivePriority: 1000,
    });
    expect(queue[1].type).toBe("delivery_ready");
  });

  it("deduplica llamados y rechaza dos resoluciones concurrentes", () => {
    // Intenta crear siete tareas por siete toques y atender dos veces la misma.
    // Si falla, el equipo recibe ruido y pierde un historial confiable.
    const store = repository();
    const token = login(store);
    store.setZones(token, ["terraza"]);
    const request = {
      id: "same-request",
      actionId: "water",
      label: "Pedir agua",
      description: "Avisamos al equipo",
      alias: "Faro Verde",
      requestedAt: new Date().toISOString(),
    };
    store.appendServiceRequest(request);
    store.appendServiceRequest(request);
    const task = store.bootstrap(token).tasks[0];
    store.resolveTask(token, {
      taskId: task.id,
      expectedVersion: task.version,
      resolution: "completed",
    });
    expect(() =>
      store.resolveTask(token, {
        taskId: task.id,
        expectedVersion: task.version,
        resolution: "completed",
      }),
    ).toThrow(WaiterConflictError);
    expect(store.taskBySource("same-request")?.version).toBe(1);
  });

  it("une y separa mesas sin mezclar pedidos ni tareas", () => {
    // Intenta convertir un grupo visual en una cuenta compartida. Si falla,
    // separar mesas podría mover pagos, pedidos o comandas entre sesiones.
    const store = repository();
    const token = login(store);
    store.setZones(token, ["salon"]);
    const before = store.bootstrap(token);
    const grouped = store.createGroup(token, [
      "table-session-5",
      "table-session-6",
    ]);
    const group = grouped.tables.find(
      (table) => table.sessionId === "table-session-5",
    )!;
    expect(group.groupLabel).toBe("Mesas 5-6");
    const separated = store.separateGroup(
      token,
      group.groupId!,
      group.groupVersion!,
      "Las mesas vuelven a su distribución original",
    );
    expect(separated.tables.every((table) => !table.groupId)).toBe(true);
    expect(separated.pending).toEqual(before.pending);
    expect(separated.tables.flatMap((table) => table.orders)).toEqual([]);
  });

  it("transfiere la mesa y sus tareas pendientes al otro garzón", () => {
    // Intenta dejar tareas con el dueño anterior tras una transferencia. Si
    // falla, dos garzones podrían asumir que el otro hará la entrega.
    const store = repository();
    const camila = login(store);
    const diego = login(store, "1357", "device-diego");
    store.setZones(camila, ["terraza"]);
    store.setZones(diego, ["terraza"]);
    store.appendServiceRequest({
      id: "transfer-call",
      actionId: "problem",
      label: "Reportar un problema",
      description: "Alguien se acercará",
      alias: "Faro Verde",
      requestedAt: new Date().toISOString(),
    });
    store.transferTable(
      camila,
      "table-session-8",
      "waiter-diego",
      "Cambio de sector",
    );
    expect(store.bootstrap(camila).tasks).toHaveLength(0);
    expect(store.bootstrap(diego).tasks[0].sourceId).toBe("transfer-call");
  });

  it("transfiere una zona completa con sus tareas asignadas", () => {
    // Intenta cambiar la cobertura sin mover el trabajo ya asignado. Si falla,
    // la app mostraría la zona a Diego pero dejaría pendientes con Camila.
    const store = repository();
    const camila = login(store);
    const diego = login(store, "1357", "device-diego");
    store.setZones(camila, ["terraza"]);
    store.setZones(diego, ["salon"]);
    store.appendServiceRequest({
      id: "zone-transfer-call",
      actionId: "problem",
      label: "Reportar un problema",
      description: "Alguien se acercará",
      alias: "Faro Verde",
      requestedAt: new Date().toISOString(),
    });
    store.transferTable(
      camila,
      "table-session-8",
      "waiter-camila",
      "Asignación explícita previa",
    );
    store.transferZone(
      camila,
      "terraza",
      "waiter-diego",
      "Diego toma la terraza",
    );
    expect(store.bootstrap(camila).tasks).toHaveLength(0);
    expect(store.bootstrap(diego).tasks[0].sourceId).toBe("zone-transfer-call");
  });

  it("pagar con garzón crea sólo una tarea NO PAGADA", () => {
    // Intenta confundir una solicitud manual con una venta confirmada. Si
    // falla, la barra podría preparar algo que nunca fue pagado.
    const store = repository();
    const token = login(store);
    store.setZones(token, ["terraza"]);
    store.appendPaymentRequest({
      id: "pay-with-waiter",
      alias: "Zorro Azul",
      requestedAt: new Date().toISOString(),
      items: [{ name: "Lager de la casa", quantity: 1 }],
    });
    const snapshot = store.bootstrap(token);
    expect(snapshot.tasks[0]).toMatchObject({
      type: "waiter_payment_request",
      paid: false,
      detail: "NO PAGADO · nada fue enviado a la barra",
    });
    expect(snapshot.tables.flatMap((table) => table.orders)).toEqual([]);
  });

  it("cierra con resumen auditado y libera las tareas sin borrarlas", () => {
    // Intenta cerrar turno a ciegas o borrar el trabajo pendiente. Si falla,
    // una salida de personal podría mandar tareas pagadas a un limbo.
    const store = repository();
    const camila = login(store);
    const diego = login(store, "1357", "device-diego");
    store.setZones(camila, ["terraza"]);
    store.setZones(diego, ["salon"]);
    store.syncReadyTickets([readyTicket()]);
    const shift = store.bootstrap(camila).shift!;
    const closed = store.closeShift(camila, shift.version);
    expect(closed.summary).toMatchObject({ total: 1, deliveryReady: 1 });
    expect(store.bootstrap(diego).tasks[0]).toMatchObject({
      type: "delivery_ready",
      unassignedZone: true,
    });
    expect(
      store
        .auditEntries()
        .some(
          (entry) =>
            entry.action === "waiter.shift_closed_with_pending_snapshot" &&
            entry.data?.deliveryReady === 1,
        ),
    ).toBe(true);
  });

  it("recupera cola, grupos y turnos después de reiniciar el proceso", () => {
    // Intenta perder el estado al reiniciar el servidor. Si falla, la tablet
    // mostraría una noche tranquila aunque todavía existan tareas pendientes.
    const store = repository();
    const token = login(store);
    store.setZones(token, ["terraza"]);
    store.appendServiceRequest({
      id: "durable-call",
      actionId: "water",
      label: "Pedir agua",
      description: "Avisamos al equipo",
      alias: "Faro Verde",
      requestedAt: new Date().toISOString(),
    });
    const restarted = new WaiterDemoRepository(store.filePath);
    expect(restarted.bootstrap(token).tasks[0].sourceId).toBe("durable-call");
  });
});
