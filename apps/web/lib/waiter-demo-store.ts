import "server-only";

import { getKdsBootstrap, mutateKds } from "./kds-demo-store";
import {
  WaiterConflictError,
  WaiterDemoRepository,
} from "./waiter-demo-repository";
import { publishWaiterEvent } from "./waiter-event-hub";
import type { WaiterMutation } from "./waiter-contract";

const shared = globalThis as typeof globalThis & {
  __tablioWaiterDemoRepository?: WaiterDemoRepository;
};

const repository =
  shared.__tablioWaiterDemoRepository ?? new WaiterDemoRepository();
shared.__tablioWaiterDemoRepository = repository;

export { WaiterConflictError };

function syncKds(): void {
  repository.syncReadyTickets(getKdsBootstrap("all").tickets);
}

export function getWaiterBootstrap(token: string | undefined) {
  syncKds();
  return repository.bootstrap(token);
}

export function loginWaiter(pin: string, fingerprint: string) {
  const login = repository.login(pin, fingerprint);
  publishWaiterEvent({ type: "shift", entityId: "started" });
  return {
    token: login.token,
    bootstrap: getWaiterBootstrap(login.token),
  };
}

export function mutateWaiter(
  token: string,
  mutation: Exclude<WaiterMutation, { action: "login" }>,
) {
  syncKds();
  let bootstrap;
  switch (mutation.action) {
    case "zones.set":
      bootstrap = repository.setZones(token, mutation.zoneIds);
      publishWaiterEvent({ type: "coverage", entityId: "zones" });
      return { bootstrap };
    case "task.resolve":
      bootstrap = repository.resolveTask(token, mutation, (ticketId) => {
        const ticket = getKdsBootstrap("all").tickets.find(
          (candidate) => candidate.id === ticketId,
        );
        if (!ticket) {
          throw new WaiterConflictError(
            "La comanda ya no existe en producción.",
            404,
          );
        }
        mutateKds({
          action: "ticket.transition",
          ticketId,
          expectedState: "ready",
          expectedVersion: ticket.version,
          targetState: "completed",
        });
      });
      publishWaiterEvent({ type: "task", entityId: mutation.taskId });
      return { bootstrap };
    case "group.create":
      bootstrap = repository.createGroup(token, mutation.tableSessionIds);
      publishWaiterEvent({ type: "table", entityId: "group" });
      return { bootstrap };
    case "group.separate":
      bootstrap = repository.separateGroup(
        token,
        mutation.groupId,
        mutation.expectedVersion,
        mutation.reason,
      );
      publishWaiterEvent({ type: "table", entityId: mutation.groupId });
      return { bootstrap };
    case "table.transfer":
      bootstrap = repository.transferTable(
        token,
        mutation.tableSessionId,
        mutation.targetEmployeeId,
        mutation.reason,
      );
      publishWaiterEvent({ type: "table", entityId: mutation.tableSessionId });
      return { bootstrap };
    case "zone.transfer":
      bootstrap = repository.transferZone(
        token,
        mutation.zoneId,
        mutation.targetEmployeeId,
        mutation.reason,
      );
      publishWaiterEvent({ type: "coverage", entityId: mutation.zoneId });
      return { bootstrap };
    case "table.incident":
      bootstrap = repository.reportTableIncident(
        token,
        mutation.tableSessionId,
        mutation.reason,
      );
      publishWaiterEvent({ type: "table", entityId: mutation.tableSessionId });
      return { bootstrap };
    case "shift.close": {
      const closed = repository.closeShift(token, mutation.expectedVersion);
      publishWaiterEvent({ type: "shift", entityId: "closed" });
      return { bootstrap: closed.bootstrap, closedSummary: closed.summary };
    }
  }
}

export function appendDinerServiceTask(input: {
  id: string;
  actionId: string;
  label: string;
  description: string;
  alias: string;
  displayName?: string;
  requestedAt: string;
}): void {
  repository.appendServiceRequest(input);
  publishWaiterEvent({ type: "task", entityId: input.id });
}

export function appendDinerPaymentTask(input: {
  id: string;
  alias: string;
  displayName?: string;
  requestedAt: string;
  items: readonly { name: string; quantity: number; note?: string }[];
}): void {
  repository.appendPaymentRequest(input);
  publishWaiterEvent({ type: "task", entityId: input.id });
}

export function resetWaiterForTest(): void {
  if (process.env.TABLIO_E2E !== "1") {
    throw new WaiterConflictError("Ruta disponible solo en pruebas.", 404);
  }
  repository.reset();
  publishWaiterEvent({ type: "shift", entityId: "reset" });
}

export function ageWaiterTaskForTest(taskId: string, seconds: number): void {
  if (process.env.TABLIO_E2E !== "1") {
    throw new WaiterConflictError("Ruta disponible solo en pruebas.", 404);
  }
  repository.ageTask(taskId, seconds);
  publishWaiterEvent({ type: "task", entityId: taskId });
}
