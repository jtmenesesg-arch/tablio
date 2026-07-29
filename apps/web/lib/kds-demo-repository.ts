import { randomUUID } from "node:crypto";
import {
  existsSync,
  mkdirSync,
  readFileSync,
  renameSync,
  writeFileSync,
} from "node:fs";
import { dirname, join } from "node:path";
import type {
  KdsBootstrap,
  KdsLatencySummary,
  KdsMutation,
  KdsPrintJob,
  KdsTicket,
  KdsTicketItem,
  KdsTicketState,
} from "./kds-contract";

export const DEMO_TENANT_ID = "00000000-0000-4000-8000-000000000301";
export const DEMO_VENUE_ID = "bar-la-esquina";
export const KDS_STATIONS = Object.freeze([
  { id: "barra", name: "Barra" },
  { id: "cocina", name: "Cocina" },
]);

const SETTINGS = Object.freeze({
  reconciliationIntervalSeconds: 45,
  warningAfterSeconds: 75,
  presenceTimeoutSeconds: 30,
  amberAfterSeconds: 8 * 60,
  criticalAfterSeconds: 15 * 60,
  newTicketSoundEnabled: true,
  criticalSoundEnabled: true,
});

type StoredClient = {
  id: string;
  stationId: string;
  connectedAt: string;
  lastHeartbeatAt: string;
  disconnectedAt?: string;
};

type StoredMetric = {
  ticketId: string;
  confirmedAt: string;
  connectedAtConfirmation: boolean;
  firstVisibleAt?: string;
  firstVisibleClientId?: string;
  source?: "realtime" | "initial_query" | "reconnect" | "safety_poll";
};

type StoredProduct = {
  id: string;
  name: string;
  available: boolean;
  trackStock: boolean;
};

type StoredAudit = {
  id: string;
  action: string;
  entityId: string;
  reason: string;
  occurredAt: string;
};

type StoredTicket = {
  -readonly [Property in keyof KdsTicket]: KdsTicket[Property];
};

type StoredState = {
  schemaVersion: 1;
  tickets: StoredTicket[];
  clients: StoredClient[];
  metrics: StoredMetric[];
  products: StoredProduct[];
  printJobs: KdsPrintJob[];
  audit: StoredAudit[];
};

const PRODUCT_SEED: readonly StoredProduct[] = [
  {
    id: "lager-casa",
    name: "Lager de la casa",
    available: true,
    trackStock: false,
  },
  {
    id: "burger-clasica",
    name: "Hamburguesa clásica",
    available: true,
    trackStock: true,
  },
  {
    id: "papas-romero",
    name: "Papas crujientes",
    available: true,
    trackStock: true,
  },
  {
    id: "spritz-citrico",
    name: "Spritz cítrico",
    available: true,
    trackStock: false,
  },
];

function initialState(): StoredState {
  return {
    schemaVersion: 1,
    tickets: [],
    clients: [],
    metrics: [],
    products: PRODUCT_SEED.map((product) => ({ ...product })),
    printJobs: [],
    audit: [],
  };
}

function percentile(values: number[], quantile: number): number | undefined {
  if (values.length === 0) return undefined;
  const sorted = [...values].sort((left, right) => left - right);
  const index = (sorted.length - 1) * quantile;
  const lower = Math.floor(index);
  const upper = Math.ceil(index);
  if (lower === upper) return sorted[lower];
  const weight = index - lower;
  return Math.round(sorted[lower] * (1 - weight) + sorted[upper] * weight);
}

function nextState(current: KdsTicketState): KdsTicketState | undefined {
  return {
    queued: "acknowledged",
    acknowledged: "in_preparation",
    in_preparation: "ready",
    ready: "completed",
    completed: undefined,
  }[current] as KdsTicketState | undefined;
}

export class KdsConflictError extends Error {
  constructor(
    message: string,
    readonly status = 409,
  ) {
    super(message);
  }
}

export class KdsDemoRepository {
  readonly filePath: string;

  constructor(filePath = KdsDemoRepository.defaultPath()) {
    this.filePath = filePath;
  }

  static defaultPath(): string {
    return (
      process.env.TABLIO_DEMO_STATE_PATH ??
      join(process.cwd(), ".tablio-demo", "kds-state.json")
    );
  }

  private read(): StoredState {
    if (!existsSync(this.filePath)) return initialState();
    return JSON.parse(readFileSync(this.filePath, "utf8")) as StoredState;
  }

  private write(state: StoredState): void {
    mkdirSync(dirname(this.filePath), { recursive: true });
    const temporary = `${this.filePath}.${process.pid}.tmp`;
    writeFileSync(temporary, JSON.stringify(state, null, 2), "utf8");
    renameSync(temporary, this.filePath);
  }

  reset(): void {
    this.write(initialState());
  }

  bootstrap(stationId: string): KdsBootstrap {
    const state = this.read();
    const selected = stationId === "all" ? "all" : stationId;
    const tickets = state.tickets
      .filter(
        (ticket) =>
          ticket.state !== "completed" &&
          (selected === "all" || ticket.stationId === selected),
      )
      .sort(
        (left, right) =>
          Date.parse(left.confirmedAt) - Date.parse(right.confirmedAt),
      );
    return {
      demo: true,
      tenantId: DEMO_TENANT_ID,
      venue: { id: DEMO_VENUE_ID, name: "Bar La Esquina" },
      stations: KDS_STATIONS,
      selectedStationId: selected,
      tickets,
      products: state.products,
      printJobs: state.printJobs,
      latency: this.latencySummary(state),
      settings: SETTINGS,
      serverTime: new Date().toISOString(),
    };
  }

  appendPaidOrder(input: {
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
  }): KdsTicket[] {
    const state = this.read();
    const inserted: KdsTicket[] = [];
    for (const candidate of input.tickets) {
      if (state.tickets.some((ticket) => ticket.id === candidate.id)) continue;
      const confirmedAtMs = Date.parse(input.confirmedAt);
      const connected = state.clients.some((client) => {
        const heartbeatAge = confirmedAtMs - Date.parse(client.lastHeartbeatAt);
        return (
          !client.disconnectedAt &&
          Date.parse(client.connectedAt) <= confirmedAtMs &&
          heartbeatAge >= 0 &&
          heartbeatAge <= SETTINGS.presenceTimeoutSeconds * 1000 &&
          (client.stationId === "all" ||
            client.stationId === candidate.stationId)
        );
      });
      const ticket: KdsTicket = {
        id: candidate.id,
        tenantId: DEMO_TENANT_ID,
        orderId: input.orderId,
        orderNumber: input.orderNumber,
        amountClp: input.amountClp,
        tableName: input.tableName,
        alias: input.alias,
        displayName: input.displayName,
        stationId: candidate.stationId,
        stationName: candidate.stationName,
        state: "queued",
        version: 0,
        paid: true,
        confirmedAt: input.confirmedAt,
        items: candidate.items,
      };
      state.tickets.push(ticket);
      state.metrics.push({
        ticketId: ticket.id,
        confirmedAt: ticket.confirmedAt,
        connectedAtConfirmation: connected,
      });
      state.printJobs.push({
        id: randomUUID(),
        ticketId: ticket.id,
        status: "pending",
        attemptCount: 0,
        createdAt: input.confirmedAt,
      });
      inserted.push(ticket);
    }
    if (inserted.length > 0) this.write(state);
    return inserted;
  }

  ticketStates(ids: readonly string[]): Map<string, KdsTicketState> {
    const wanted = new Set(ids);
    return new Map(
      this.read()
        .tickets.filter((ticket) => wanted.has(ticket.id))
        .map((ticket) => [ticket.id, ticket.state]),
    );
  }

  productAvailability(productId: string): boolean | undefined {
    return this.read().products.find((product) => product.id === productId)
      ?.available;
  }

  mutate(mutation: KdsMutation): KdsBootstrap {
    const state = this.read();
    const now = new Date().toISOString();
    let selectedStation = "all";

    switch (mutation.action) {
      case "heartbeat": {
        selectedStation = mutation.stationId;
        const existing = state.clients.find(
          (client) => client.id === mutation.clientId,
        );
        if (existing) {
          existing.stationId = mutation.stationId;
          existing.lastHeartbeatAt = now;
          existing.disconnectedAt = undefined;
        } else {
          state.clients.push({
            id: mutation.clientId,
            stationId: mutation.stationId,
            connectedAt: now,
            lastHeartbeatAt: now,
          });
        }
        break;
      }
      case "disconnect": {
        const client = state.clients.find(
          (candidate) => candidate.id === mutation.clientId,
        );
        if (client) {
          client.disconnectedAt = now;
          selectedStation = client.stationId;
        }
        break;
      }
      case "ticket.transition": {
        const ticket = state.tickets.find(
          (candidate) => candidate.id === mutation.ticketId,
        );
        if (!ticket) throw new KdsConflictError("Comanda no encontrada.", 404);
        selectedStation = ticket.stationId;
        if (ticket.state === mutation.targetState) break;
        if (
          ticket.state !== mutation.expectedState ||
          ticket.version !== mutation.expectedVersion
        ) {
          throw new KdsConflictError(
            "Otra pantalla ya actualizó esta comanda. Se recargó el estado.",
          );
        }
        if (nextState(ticket.state) !== mutation.targetState) {
          throw new KdsConflictError("La transición solicitada no es válida.");
        }
        ticket.state = mutation.targetState;
        ticket.version += 1;
        if (ticket.state === "acknowledged") ticket.acknowledgedAt = now;
        if (ticket.state === "in_preparation") ticket.inPreparationAt = now;
        if (ticket.state === "ready") ticket.readyAt = now;
        if (ticket.state === "completed") ticket.completedAt = now;
        state.audit.push({
          id: randomUUID(),
          action: `ticket.${ticket.state}`,
          entityId: ticket.id,
          reason: "Cambio operativo desde KDS",
          occurredAt: now,
        });
        break;
      }
      case "ticket.visible": {
        const metric = state.metrics.find(
          (candidate) => candidate.ticketId === mutation.ticketId,
        );
        const client = state.clients.find(
          (candidate) => candidate.id === mutation.clientId,
        );
        if (!metric || !client) {
          throw new KdsConflictError(
            "No se pudo registrar la visibilidad de la comanda.",
            404,
          );
        }
        selectedStation = client.stationId;
        if (!metric.firstVisibleAt) {
          metric.firstVisibleAt = now;
          metric.firstVisibleClientId = mutation.clientId;
          metric.source = mutation.source;
        }
        break;
      }
      case "product.availability": {
        const product = state.products.find(
          (candidate) => candidate.id === mutation.productId,
        );
        if (!product)
          throw new KdsConflictError("Producto no encontrado.", 404);
        product.available = mutation.available;
        state.audit.push({
          id: randomUUID(),
          action: mutation.available
            ? "catalog.product_restocked"
            : "catalog.product_sold_out",
          entityId: product.id,
          reason: mutation.reason,
          occurredAt: now,
        });
        break;
      }
      case "print.reprint": {
        const source = state.printJobs.find(
          (candidate) => candidate.id === mutation.printJobId,
        );
        if (!source)
          throw new KdsConflictError(
            "Trabajo de impresión no encontrado.",
            404,
          );
        if (!mutation.reason.trim()) {
          throw new KdsConflictError("La reimpresión requiere un motivo.", 400);
        }
        state.printJobs.push({
          id: randomUUID(),
          ticketId: source.ticketId,
          status: "pending",
          attemptCount: 0,
          reprintOfJobId: source.id,
          reprintReason: mutation.reason.trim(),
          createdAt: now,
        });
        state.audit.push({
          id: randomUUID(),
          action: "print.reprint_requested",
          entityId: source.ticketId,
          reason: mutation.reason.trim(),
          occurredAt: now,
        });
        break;
      }
    }
    this.write(state);
    return this.bootstrap(selectedStation);
  }

  private latencySummary(state: StoredState): KdsLatencySummary {
    const connected = state.metrics.filter(
      (metric) =>
        metric.connectedAtConfirmation && metric.firstVisibleAt !== undefined,
    );
    const values = connected.map((metric) =>
      Math.max(
        0,
        Date.parse(metric.firstVisibleAt!) - Date.parse(metric.confirmedAt),
      ),
    );
    return {
      connectedSampleCount: connected.length,
      noKdsConnectedCount: state.metrics.filter(
        (metric) => !metric.connectedAtConfirmation,
      ).length,
      connectedNotYetVisibleCount: state.metrics.filter(
        (metric) => metric.connectedAtConfirmation && !metric.firstVisibleAt,
      ).length,
      p50Ms: percentile(values, 0.5),
      p95Ms: percentile(values, 0.95),
      p99Ms: percentile(values, 0.99),
    };
  }
}
