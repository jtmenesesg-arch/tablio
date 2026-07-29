import {
  createHash,
  randomUUID,
  scryptSync,
  timingSafeEqual,
} from "node:crypto";
import {
  existsSync,
  mkdirSync,
  readFileSync,
  renameSync,
  writeFileSync,
} from "node:fs";
import { dirname, join } from "node:path";
import type { KdsTicket } from "./kds-contract";
import type {
  PendingTaskSummary,
  WaiterBootstrap,
  WaiterTable,
  WaiterTask,
  WaiterTaskType,
} from "./waiter-contract";

export const WAITER_DEMO_TENANT_ID = "00000000-0000-4000-8000-000000000301";
export const WAITER_DEMO_VENUE_ID = "bar-la-esquina";

const SETTINGS = Object.freeze({
  reconciliationIntervalSeconds: 45,
  warningAfterSeconds: 75,
  amberAfterSeconds: 3 * 60,
  criticalAfterSeconds: 8 * 60,
  absoluteCriticalAfterSeconds: 12 * 60,
  orphanAdminAlertAfterSeconds: 2 * 60,
  pinMaxAttempts: 5,
  pinAttemptWindowSeconds: 10 * 60,
  pinLockSeconds: 15 * 60,
  sessionIdleSeconds: 60 * 60,
  sessionAbsoluteSeconds: 12 * 60 * 60,
  waiterPaymentRequestTtlSeconds: 30 * 60,
});

type StoredEmployee = {
  id: string;
  name: string;
  pinSalt: string;
  pinHash: string;
};

type StoredZone = {
  id: string;
  name: string;
};

type StoredTable = {
  sessionId: string;
  tableName: string;
  zoneId: string;
  peopleCount: number;
  active: true;
};

type StoredShift = {
  id: string;
  employeeId: string;
  tokenHash: string;
  state: "active" | "closed";
  version: number;
  startedAt: string;
  lastSeenAt: string;
  idleExpiresAt: string;
  absoluteExpiresAt: string;
  closedAt?: string;
  selectedZoneIds: string[];
};

type StoredTask = {
  id: string;
  sourceId: string;
  type: WaiterTaskType;
  status: "pending" | "completed" | "dismissed" | "expired";
  version: number;
  tableSessionId: string;
  zoneId: string;
  assignedEmployeeId?: string;
  alias?: string;
  displayName?: string;
  orderNumber?: number;
  amountClp?: number;
  title: string;
  detail: string;
  items: Array<{ name: string; quantity: number; note?: string }>;
  paid: boolean;
  basePriority: number;
  requestedAt: string;
  expiresAt?: string;
  completedAt?: string;
  completedByEmployeeId?: string;
  resolution?: string;
};

type StoredGroup = {
  id: string;
  label: string;
  state: "active" | "separated";
  version: number;
  tableSessionIds: string[];
  createdByEmployeeId: string;
  createdAt: string;
  separatedAt?: string;
  separationReason?: string;
};

type StoredTableAssignment = {
  tableSessionId: string;
  employeeId: string;
  assignedByEmployeeId: string;
  assignedAt: string;
  releasedAt?: string;
};

type StoredPinAttempt = {
  fingerprintHash: string;
  successful: boolean;
  occurredAt: string;
};

type StoredAudit = {
  id: string;
  action: string;
  actorEmployeeId?: string;
  targetId: string;
  reason: string;
  data?: Record<string, unknown>;
  occurredAt: string;
};

type StoredAdminAlert = {
  taskId: string;
  status: "scheduled" | "resolved";
  escalateAt: string;
  resolvedAt?: string;
};

type StoredCloseSnapshot = {
  id: string;
  shiftId: string;
  employeeId: string;
  summary: PendingTaskSummary;
  acknowledged: true;
  createdAt: string;
};

type StoredOrder = WaiterTable["orders"][number] & {
  tableSessionId: string;
};

type StoredState = {
  schemaVersion: 1;
  employees: StoredEmployee[];
  zones: StoredZone[];
  tables: StoredTable[];
  shifts: StoredShift[];
  tasks: StoredTask[];
  groups: StoredGroup[];
  tableAssignments: StoredTableAssignment[];
  pinAttempts: StoredPinAttempt[];
  audits: StoredAudit[];
  adminAlerts: StoredAdminAlert[];
  closeSnapshots: StoredCloseSnapshot[];
  orders: StoredOrder[];
};

const EMPLOYEES: StoredEmployee[] = [
  {
    id: "waiter-camila",
    name: "Camila",
    pinSalt: "tablio-demo-camila-v1",
    pinHash: "efaa6f5c7dbf809d7b46050a3e67c0528931f92c7c58674c24f4b0f792449f6f",
  },
  {
    id: "waiter-diego",
    name: "Diego",
    pinSalt: "tablio-demo-diego-v1",
    pinHash: "50ac21661e2b5b1c818c30bc7047e8bf4e29beae80070e7cc704e26facc6b05c",
  },
];

const ZONES: StoredZone[] = [
  { id: "terraza", name: "Terraza" },
  { id: "salon", name: "Salón" },
  { id: "barra-zone", name: "Barra" },
];

const TABLES: StoredTable[] = [
  {
    sessionId: "table-session-8",
    tableName: "Mesa 8",
    zoneId: "terraza",
    peopleCount: 5,
    active: true,
  },
  {
    sessionId: "table-session-5",
    tableName: "Mesa 5",
    zoneId: "salon",
    peopleCount: 5,
    active: true,
  },
  {
    sessionId: "table-session-6",
    tableName: "Mesa 6",
    zoneId: "salon",
    peopleCount: 4,
    active: true,
  },
  {
    sessionId: "table-session-7",
    tableName: "Mesa 7",
    zoneId: "salon",
    peopleCount: 6,
    active: true,
  },
];

function initialState(): StoredState {
  return {
    schemaVersion: 1,
    employees: EMPLOYEES.map((employee) => ({ ...employee })),
    zones: ZONES.map((zone) => ({ ...zone })),
    tables: TABLES.map((table) => ({ ...table })),
    shifts: [],
    tasks: [],
    groups: [],
    tableAssignments: [],
    pinAttempts: [],
    audits: [],
    adminAlerts: [],
    closeSnapshots: [],
    orders: [],
  };
}

function hashToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

function hashFingerprint(fingerprint: string): string {
  return createHash("sha256").update(fingerprint).digest("hex");
}

function verifyPin(pin: string, employee: StoredEmployee): boolean {
  const candidate = scryptSync(pin, employee.pinSalt, 32);
  const expected = Buffer.from(employee.pinHash, "hex");
  return (
    candidate.length === expected.length && timingSafeEqual(candidate, expected)
  );
}

function summary(tasks: readonly StoredTask[]): PendingTaskSummary {
  const pending = tasks.filter((task) => task.status === "pending");
  return {
    total: pending.length,
    deliveryReady: pending.filter((task) => task.type === "delivery_ready")
      .length,
    serviceRequest: pending.filter((task) => task.type === "service_request")
      .length,
    waiterPaymentRequest: pending.filter(
      (task) => task.type === "waiter_payment_request",
    ).length,
  };
}

export class WaiterConflictError extends Error {
  constructor(
    message: string,
    readonly status = 409,
  ) {
    super(message);
  }
}

export class WaiterDemoRepository {
  readonly filePath: string;

  constructor(
    filePath = WaiterDemoRepository.defaultPath(),
    private readonly clock: () => Date = () => new Date(),
  ) {
    this.filePath = filePath;
  }

  static defaultPath(): string {
    return (
      process.env.TABLIO_WAITER_DEMO_STATE_PATH ??
      join(process.cwd(), ".tablio-demo", "waiter-state.json")
    );
  }

  private now(): Date {
    return this.clock();
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

  login(pin: string, clientFingerprint: string): { token: string } {
    if (!/^\d{4,8}$/.test(pin)) {
      throw new WaiterConflictError("Ingresa un PIN válido.", 400);
    }
    if (!clientFingerprint.trim()) {
      throw new WaiterConflictError(
        "No pudimos identificar el dispositivo.",
        400,
      );
    }
    const state = this.read();
    const current = this.now();
    const fingerprintHash = hashFingerprint(clientFingerprint);
    const windowStart =
      current.getTime() - SETTINGS.pinAttemptWindowSeconds * 1000;
    const recentFailures = state.pinAttempts.filter(
      (attempt) =>
        attempt.fingerprintHash === fingerprintHash &&
        !attempt.successful &&
        Date.parse(attempt.occurredAt) >= windowStart,
    );
    if (recentFailures.length >= SETTINGS.pinMaxAttempts) {
      const lastFailure = recentFailures.at(-1)!;
      const unlockAt =
        Date.parse(lastFailure.occurredAt) + SETTINGS.pinLockSeconds * 1000;
      if (current.getTime() < unlockAt) {
        state.audits.push({
          id: randomUUID(),
          action: "waiter.pin_locked",
          targetId: fingerprintHash,
          reason: "Máximo de intentos fallidos superado",
          occurredAt: current.toISOString(),
        });
        this.write(state);
        throw new WaiterConflictError(
          "Demasiados intentos. Espera 15 minutos.",
          429,
        );
      }
    }

    const employee = state.employees.find((candidate) =>
      verifyPin(pin, candidate),
    );
    state.pinAttempts.push({
      fingerprintHash,
      successful: Boolean(employee),
      occurredAt: current.toISOString(),
    });
    if (!employee) {
      state.audits.push({
        id: randomUUID(),
        action: "waiter.pin_failed",
        targetId: fingerprintHash,
        reason: "PIN inválido",
        occurredAt: current.toISOString(),
      });
      this.write(state);
      throw new WaiterConflictError("PIN incorrecto.", 403);
    }

    const token = randomUUID();
    const absoluteExpiresAt = new Date(
      current.getTime() + SETTINGS.sessionAbsoluteSeconds * 1000,
    );
    state.shifts
      .filter(
        (shift) => shift.employeeId === employee.id && shift.state === "active",
      )
      .forEach((shift) => {
        shift.state = "closed";
        shift.closedAt = current.toISOString();
      });
    state.shifts.push({
      id: randomUUID(),
      employeeId: employee.id,
      tokenHash: hashToken(token),
      state: "active",
      version: 0,
      startedAt: current.toISOString(),
      lastSeenAt: current.toISOString(),
      idleExpiresAt: new Date(
        current.getTime() + SETTINGS.sessionIdleSeconds * 1000,
      ).toISOString(),
      absoluteExpiresAt: absoluteExpiresAt.toISOString(),
      selectedZoneIds: [],
    });
    state.audits.push({
      id: randomUUID(),
      action: "waiter.shift_started",
      actorEmployeeId: employee.id,
      targetId: employee.id,
      reason: "PIN verificado",
      occurredAt: current.toISOString(),
    });
    this.write(state);
    return { token };
  }

  private activeShift(
    state: StoredState,
    token: string | undefined,
  ): StoredShift {
    if (!token) throw new WaiterConflictError("Ingresa tu PIN.", 401);
    const current = this.now();
    const shift = state.shifts.find(
      (candidate) =>
        candidate.tokenHash === hashToken(token) &&
        candidate.state === "active",
    );
    if (
      !shift ||
      Date.parse(shift.idleExpiresAt) <= current.getTime() ||
      Date.parse(shift.absoluteExpiresAt) <= current.getTime()
    ) {
      if (shift) {
        shift.state = "closed";
        shift.closedAt = current.toISOString();
        this.write(state);
      }
      throw new WaiterConflictError(
        "Tu turno venció. Ingresa el PIN otra vez.",
        401,
      );
    }
    shift.lastSeenAt = current.toISOString();
    shift.idleExpiresAt = new Date(
      Math.min(
        current.getTime() + SETTINGS.sessionIdleSeconds * 1000,
        Date.parse(shift.absoluteExpiresAt),
      ),
    ).toISOString();
    return shift;
  }

  private zoneCovered(state: StoredState, zoneId: string): boolean {
    const current = this.now().getTime();
    return state.shifts.some(
      (shift) =>
        shift.state === "active" &&
        Date.parse(shift.idleExpiresAt) > current &&
        Date.parse(shift.absoluteExpiresAt) > current &&
        shift.selectedZoneIds.includes(zoneId),
    );
  }

  private taskVisible(
    state: StoredState,
    shift: StoredShift,
    task: StoredTask,
  ): boolean {
    return (
      task.assignedEmployeeId === shift.employeeId ||
      (!task.assignedEmployeeId &&
        shift.selectedZoneIds.includes(task.zoneId)) ||
      !this.zoneCovered(state, task.zoneId)
    );
  }

  private groupForTable(
    state: StoredState,
    tableSessionId: string,
  ): StoredGroup | undefined {
    return state.groups.find(
      (group) =>
        group.state === "active" &&
        group.tableSessionIds.includes(tableSessionId),
    );
  }

  private refreshOrphanAlerts(state: StoredState): void {
    const current = this.now();
    for (const task of state.tasks.filter(
      (candidate) => candidate.status === "pending",
    )) {
      const orphan = !this.zoneCovered(state, task.zoneId);
      const existing = state.adminAlerts.find(
        (alert) => alert.taskId === task.id && alert.status === "scheduled",
      );
      if (orphan && !existing) {
        state.adminAlerts.push({
          taskId: task.id,
          status: "scheduled",
          escalateAt: new Date(
            current.getTime() + SETTINGS.orphanAdminAlertAfterSeconds * 1000,
          ).toISOString(),
        });
      } else if (!orphan && existing) {
        existing.status = "resolved";
        existing.resolvedAt = current.toISOString();
      }
    }
  }

  private expirePaymentRequests(state: StoredState): void {
    const current = this.now().getTime();
    for (const task of state.tasks) {
      if (
        task.type === "waiter_payment_request" &&
        task.status === "pending" &&
        task.expiresAt &&
        Date.parse(task.expiresAt) <= current
      ) {
        task.status = "expired";
        task.version += 1;
        task.completedAt = this.now().toISOString();
        task.resolution = "Solicitud expirada";
      }
    }
  }

  bootstrap(token: string | undefined): WaiterBootstrap {
    const state = this.read();
    if (!token) return this.publicBootstrap();
    const shift = this.activeShift(state, token);
    this.expirePaymentRequests(state);
    this.refreshOrphanAlerts(state);
    const employee = state.employees.find(
      (candidate) => candidate.id === shift.employeeId,
    )!;
    const current = this.now().getTime();
    const tasks: WaiterTask[] = state.tasks
      .filter(
        (task) =>
          task.status === "pending" && this.taskVisible(state, shift, task),
      )
      .map((task) => {
        const table = state.tables.find(
          (candidate) => candidate.sessionId === task.tableSessionId,
        )!;
        const zone = state.zones.find(
          (candidate) => candidate.id === task.zoneId,
        )!;
        const group = this.groupForTable(state, task.tableSessionId);
        const critical =
          current - Date.parse(task.requestedAt) >=
          SETTINGS.absoluteCriticalAfterSeconds * 1000;
        const unassignedZone = !this.zoneCovered(state, task.zoneId);
        const alert = state.adminAlerts.find(
          (candidate) =>
            candidate.taskId === task.id && candidate.status === "scheduled",
        );
        return {
          id: task.id,
          sourceId: task.sourceId,
          type: task.type,
          status: "pending" as const,
          version: task.version,
          tableSessionId: task.tableSessionId,
          tableName: table.tableName,
          zoneId: zone.id,
          zoneName: zone.name,
          groupId: group?.id,
          groupLabel: group?.label,
          groupVersion: group?.version,
          alias: task.alias,
          displayName: task.displayName,
          orderNumber: task.orderNumber,
          amountClp: task.amountClp,
          title: task.title,
          detail: task.detail,
          items: task.items,
          paid: task.paid,
          requestedAt: task.requestedAt,
          critical,
          unassignedZone,
          adminEscalated: Boolean(
            alert && Date.parse(alert.escalateAt) <= current,
          ),
          effectivePriority: critical ? 1000 : task.basePriority,
          actionLabel:
            task.type === "delivery_ready"
              ? ("Entregado" as const)
              : ("Atendido" as const),
        };
      })
      .sort(
        (left, right) =>
          right.effectivePriority - left.effectivePriority ||
          Date.parse(left.requestedAt) - Date.parse(right.requestedAt),
      );
    const pending = summary(
      state.tasks.filter((task) => this.taskVisible(state, shift, task)),
    );
    const tables = this.tablesForShift(state, shift);
    this.write(state);
    return {
      demo: true,
      authenticated: true,
      venue: { id: WAITER_DEMO_VENUE_ID, name: "Bar La Esquina" },
      employee: { id: employee.id, name: employee.name },
      shift: {
        id: shift.id,
        version: shift.version,
        startedAt: shift.startedAt,
        idleExpiresAt: shift.idleExpiresAt,
        absoluteExpiresAt: shift.absoluteExpiresAt,
      },
      zones: state.zones.map((zone) => ({
        id: zone.id,
        name: zone.name,
        activeTableCount: state.tables.filter(
          (table) => table.active && table.zoneId === zone.id,
        ).length,
        selected: shift.selectedZoneIds.includes(zone.id),
      })),
      tasks,
      tables,
      activeWaiters: state.shifts
        .filter((candidate) => candidate.state === "active")
        .map((candidate) => {
          const activeEmployee = state.employees.find(
            (item) => item.id === candidate.employeeId,
          )!;
          return { id: activeEmployee.id, name: activeEmployee.name };
        }),
      pending,
      oldestPendingAt:
        tasks.length > 0
          ? tasks.reduce((oldest, task) =>
              Date.parse(task.requestedAt) < Date.parse(oldest.requestedAt)
                ? task
                : oldest,
            ).requestedAt
          : undefined,
      settings: SETTINGS,
      serverTime: this.now().toISOString(),
    };
  }

  private publicBootstrap(): WaiterBootstrap {
    return {
      demo: true,
      authenticated: false,
      venue: { id: WAITER_DEMO_VENUE_ID, name: "Bar La Esquina" },
      zones: [],
      tasks: [],
      tables: [],
      activeWaiters: [],
      pending: {
        total: 0,
        deliveryReady: 0,
        serviceRequest: 0,
        waiterPaymentRequest: 0,
      },
      settings: SETTINGS,
      serverTime: this.now().toISOString(),
    };
  }

  private tablesForShift(
    state: StoredState,
    shift: StoredShift,
  ): WaiterTable[] {
    return state.tables
      .filter(
        (table) =>
          table.active &&
          (shift.selectedZoneIds.includes(table.zoneId) ||
            !this.zoneCovered(state, table.zoneId) ||
            state.tableAssignments.some(
              (assignment) =>
                !assignment.releasedAt &&
                assignment.tableSessionId === table.sessionId &&
                assignment.employeeId === shift.employeeId,
            )),
      )
      .map((table) => {
        const zone = state.zones.find(
          (candidate) => candidate.id === table.zoneId,
        )!;
        const group = this.groupForTable(state, table.sessionId);
        const assignment = state.tableAssignments.find(
          (candidate) =>
            candidate.tableSessionId === table.sessionId &&
            !candidate.releasedAt,
        );
        return {
          ...table,
          zoneName: zone.name,
          groupId: group?.id,
          groupLabel: group?.label,
          groupVersion: group?.version,
          assignedEmployeeId: assignment?.employeeId,
          orders: state.orders
            .filter((order) => order.tableSessionId === table.sessionId)
            .map((order) => ({
              orderNumber: order.orderNumber,
              alias: order.alias,
              displayName: order.displayName,
              amountClp: order.amountClp,
              tickets: order.tickets,
            })),
        };
      });
  }

  setZones(token: string, zoneIds: readonly string[]): WaiterBootstrap {
    const state = this.read();
    const shift = this.activeShift(state, token);
    const unique = [...new Set(zoneIds)];
    if (unique.length === 0) {
      throw new WaiterConflictError("Selecciona al menos una zona.", 400);
    }
    if (
      unique.some(
        (zoneId) => !state.zones.some((candidate) => candidate.id === zoneId),
      )
    ) {
      throw new WaiterConflictError("Esa zona no pertenece al local.", 403);
    }
    shift.selectedZoneIds = unique;
    shift.version += 1;
    state.audits.push({
      id: randomUUID(),
      action: "waiter.zones_changed",
      actorEmployeeId: shift.employeeId,
      targetId: shift.id,
      reason: "Selección de zonas actualizada",
      data: { zoneIds: unique },
      occurredAt: this.now().toISOString(),
    });
    this.refreshOrphanAlerts(state);
    this.write(state);
    return this.bootstrap(token);
  }

  syncReadyTickets(tickets: readonly KdsTicket[]): void {
    const state = this.read();
    let changed = false;
    for (const ticket of tickets) {
      const existing = state.tasks.find(
        (task) => task.type === "delivery_ready" && task.sourceId === ticket.id,
      );
      if (ticket.state === "ready" && !existing) {
        const table =
          state.tables.find(
            (candidate) => candidate.tableName === ticket.tableName,
          ) ?? state.tables[0];
        state.tasks.push({
          id: randomUUID(),
          sourceId: ticket.id,
          type: "delivery_ready",
          status: "pending",
          version: 0,
          tableSessionId: table.sessionId,
          zoneId: table.zoneId,
          assignedEmployeeId: state.tableAssignments.find(
            (assignment) =>
              assignment.tableSessionId === table.sessionId &&
              !assignment.releasedAt,
          )?.employeeId,
          alias: ticket.alias,
          displayName: ticket.displayName,
          orderNumber: ticket.orderNumber,
          title: `${table.tableName} · ${ticket.displayName ?? ticket.alias} · Pedido ${ticket.orderNumber} · LISTO`,
          detail: `${ticket.stationName} · ${ticket.items
            .map((item) => `${item.quantity}× ${item.name}`)
            .join(" · ")}`,
          items: ticket.items.map((item) => ({ ...item })),
          paid: true,
          amountClp: ticket.amountClp,
          basePriority: 100,
          requestedAt: ticket.readyAt ?? this.now().toISOString(),
        });
        const existingOrder = state.orders.find(
          (order) =>
            order.tableSessionId === table.sessionId &&
            order.orderNumber === ticket.orderNumber,
        );
        const orderTicket = {
          stationName: ticket.stationName,
          state: ticket.state,
          items: ticket.items.map((item) => `${item.quantity}× ${item.name}`),
        };
        if (existingOrder) {
          existingOrder.amountClp = ticket.amountClp ?? existingOrder.amountClp;
          existingOrder.tickets = [
            ...existingOrder.tickets.filter(
              (candidate) => candidate.stationName !== ticket.stationName,
            ),
            orderTicket,
          ];
        } else {
          state.orders.push({
            tableSessionId: table.sessionId,
            orderNumber: ticket.orderNumber,
            alias: ticket.alias,
            displayName: ticket.displayName,
            amountClp: ticket.amountClp ?? 0,
            tickets: [orderTicket],
          });
        }
        changed = true;
      } else if (
        existing?.status === "pending" &&
        ticket.state === "completed"
      ) {
        existing.status = "completed";
        existing.version += 1;
        existing.completedAt = ticket.completedAt ?? this.now().toISOString();
        existing.resolution = "Entregada desde KDS";
        changed = true;
      }
    }
    if (changed) {
      this.refreshOrphanAlerts(state);
      this.write(state);
    }
  }

  appendServiceRequest(input: {
    id: string;
    actionId: string;
    label: string;
    description: string;
    alias: string;
    displayName?: string;
    requestedAt: string;
  }): void {
    const state = this.read();
    if (state.tasks.some((task) => task.sourceId === input.id)) return;
    const table = state.tables.find(
      (candidate) => candidate.sessionId === "table-session-8",
    )!;
    state.tasks.push({
      id: randomUUID(),
      sourceId: input.id,
      type: "service_request",
      status: "pending",
      version: 0,
      tableSessionId: table.sessionId,
      zoneId: table.zoneId,
      alias: input.alias,
      displayName: input.displayName,
      title: `${table.tableName} · ${input.label}`,
      detail: input.description,
      items: [],
      paid: false,
      basePriority: input.actionId === "problem" ? 80 : 50,
      requestedAt: input.requestedAt,
    });
    this.refreshOrphanAlerts(state);
    this.write(state);
  }

  appendPaymentRequest(input: {
    id: string;
    alias: string;
    displayName?: string;
    requestedAt: string;
    items: readonly { name: string; quantity: number; note?: string }[];
  }): void {
    const state = this.read();
    if (state.tasks.some((task) => task.sourceId === input.id)) return;
    const table = state.tables.find(
      (candidate) => candidate.sessionId === "table-session-8",
    )!;
    state.tasks.push({
      id: randomUUID(),
      sourceId: input.id,
      type: "waiter_payment_request",
      status: "pending",
      version: 0,
      tableSessionId: table.sessionId,
      zoneId: table.zoneId,
      alias: input.alias,
      displayName: input.displayName,
      title: `${table.tableName} · ${input.displayName ?? input.alias} · PAGO PENDIENTE`,
      detail: "NO PAGADO · nada fue enviado a la barra",
      items: input.items.map((item) => ({ ...item })),
      paid: false,
      basePriority: 70,
      requestedAt: input.requestedAt,
      expiresAt: new Date(
        Date.parse(input.requestedAt) +
          SETTINGS.waiterPaymentRequestTtlSeconds * 1000,
      ).toISOString(),
    });
    this.refreshOrphanAlerts(state);
    this.write(state);
  }

  resolveTask(
    token: string,
    input: {
      taskId: string;
      expectedVersion: number;
      resolution: "completed" | "dismissed";
      reason?: string;
    },
    onDelivery?: (sourceId: string) => void,
  ): WaiterBootstrap {
    const state = this.read();
    const shift = this.activeShift(state, token);
    const task = state.tasks.find((candidate) => candidate.id === input.taskId);
    if (!task || !this.taskVisible(state, shift, task)) {
      throw new WaiterConflictError(
        "La tarea no pertenece a tu cobertura.",
        403,
      );
    }
    if (task.status !== "pending" || task.version !== input.expectedVersion) {
      throw new WaiterConflictError(
        "Otro garzón ya actualizó esta tarea. Recargamos la cola.",
      );
    }
    if (
      input.resolution === "dismissed" &&
      task.type !== "waiter_payment_request"
    ) {
      throw new WaiterConflictError(
        "Sólo una solicitud de pago puede descartarse.",
        403,
      );
    }
    if (input.resolution === "dismissed" && !input.reason?.trim()) {
      throw new WaiterConflictError("Indica por qué se descarta.", 400);
    }
    if (task.type === "delivery_ready") onDelivery?.(task.sourceId);

    task.status = input.resolution;
    task.version += 1;
    task.completedAt = this.now().toISOString();
    task.completedByEmployeeId = shift.employeeId;
    task.resolution =
      input.resolution === "completed"
        ? "Atendida"
        : `Descartada: ${input.reason!.trim()}`;
    const alert = state.adminAlerts.find(
      (candidate) =>
        candidate.taskId === task.id && candidate.status === "scheduled",
    );
    if (alert) {
      alert.status = "resolved";
      alert.resolvedAt = this.now().toISOString();
    }
    state.audits.push({
      id: randomUUID(),
      action:
        input.resolution === "completed"
          ? "waiter.task_completed"
          : "waiter.payment_request_dismissed",
      actorEmployeeId: shift.employeeId,
      targetId: task.id,
      reason: input.reason?.trim() || "Atendida",
      data: { previousVersion: input.expectedVersion, version: task.version },
      occurredAt: this.now().toISOString(),
    });
    this.write(state);
    return this.bootstrap(token);
  }

  createGroup(
    token: string,
    tableSessionIds: readonly string[],
  ): WaiterBootstrap {
    const state = this.read();
    const shift = this.activeShift(state, token);
    const unique = [...new Set(tableSessionIds)];
    if (unique.length < 2) {
      throw new WaiterConflictError("Elige al menos dos mesas.", 400);
    }
    if (
      unique.some(
        (id) =>
          !state.tables.some(
            (table) => table.sessionId === id && table.active,
          ) || this.groupForTable(state, id),
      )
    ) {
      throw new WaiterConflictError(
        "Una mesa no está activa o ya pertenece a otro grupo.",
      );
    }
    const labels = state.tables
      .filter((table) => unique.includes(table.sessionId))
      .map((table) => table.tableName.replace("Mesa ", ""))
      .sort((left, right) => Number(left) - Number(right));
    const group: StoredGroup = {
      id: randomUUID(),
      label: `Mesas ${labels.join("-")}`,
      state: "active",
      version: 0,
      tableSessionIds: unique,
      createdByEmployeeId: shift.employeeId,
      createdAt: this.now().toISOString(),
    };
    state.groups.push(group);
    state.audits.push({
      id: randomUUID(),
      action: "table_group.created",
      actorEmployeeId: shift.employeeId,
      targetId: group.id,
      reason: "Mesas unidas para visibilidad operativa",
      data: { tableSessionIds: unique },
      occurredAt: this.now().toISOString(),
    });
    this.write(state);
    return this.bootstrap(token);
  }

  separateGroup(
    token: string,
    groupId: string,
    expectedVersion: number,
    reason: string,
  ): WaiterBootstrap {
    const state = this.read();
    const shift = this.activeShift(state, token);
    const group = state.groups.find((candidate) => candidate.id === groupId);
    if (
      !group ||
      group.state !== "active" ||
      group.version !== expectedVersion
    ) {
      throw new WaiterConflictError("Otro garzón ya modificó este grupo.");
    }
    if (!reason.trim()) {
      throw new WaiterConflictError("Indica por qué se separan.", 400);
    }
    group.state = "separated";
    group.version += 1;
    group.separatedAt = this.now().toISOString();
    group.separationReason = reason.trim();
    state.audits.push({
      id: randomUUID(),
      action: "table_group.separated",
      actorEmployeeId: shift.employeeId,
      targetId: group.id,
      reason: reason.trim(),
      occurredAt: this.now().toISOString(),
    });
    this.write(state);
    return this.bootstrap(token);
  }

  transferTable(
    token: string,
    tableSessionId: string,
    targetEmployeeId: string,
    reason: string,
  ): WaiterBootstrap {
    const state = this.read();
    const shift = this.activeShift(state, token);
    if (
      !state.tables.some((table) => table.sessionId === tableSessionId) ||
      !state.shifts.some(
        (candidate) =>
          candidate.employeeId === targetEmployeeId &&
          candidate.state === "active",
      ) ||
      !reason.trim()
    ) {
      throw new WaiterConflictError(
        "Selecciona un garzón activo e indica el motivo.",
        400,
      );
    }
    state.tableAssignments
      .filter(
        (assignment) =>
          assignment.tableSessionId === tableSessionId &&
          !assignment.releasedAt,
      )
      .forEach((assignment) => {
        assignment.releasedAt = this.now().toISOString();
      });
    state.tableAssignments.push({
      tableSessionId,
      employeeId: targetEmployeeId,
      assignedByEmployeeId: shift.employeeId,
      assignedAt: this.now().toISOString(),
    });
    state.tasks
      .filter(
        (task) =>
          task.tableSessionId === tableSessionId && task.status === "pending",
      )
      .forEach((task) => {
        task.assignedEmployeeId = targetEmployeeId;
        task.version += 1;
      });
    state.audits.push({
      id: randomUUID(),
      action: "waiter.table_transferred",
      actorEmployeeId: shift.employeeId,
      targetId: tableSessionId,
      reason: reason.trim(),
      data: { targetEmployeeId },
      occurredAt: this.now().toISOString(),
    });
    this.write(state);
    return this.bootstrap(token);
  }

  transferZone(
    token: string,
    zoneId: string,
    targetEmployeeId: string,
    reason: string,
  ): WaiterBootstrap {
    const state = this.read();
    const shift = this.activeShift(state, token);
    const targetShift = state.shifts.find(
      (candidate) =>
        candidate.employeeId === targetEmployeeId &&
        candidate.state === "active",
    );
    if (
      !shift.selectedZoneIds.includes(zoneId) ||
      !targetShift ||
      targetShift.employeeId === shift.employeeId ||
      !reason.trim()
    ) {
      throw new WaiterConflictError(
        "Selecciona una zona propia, otro garzón activo y un motivo.",
        400,
      );
    }
    shift.selectedZoneIds = shift.selectedZoneIds.filter(
      (candidate) => candidate !== zoneId,
    );
    targetShift.selectedZoneIds = [
      ...new Set([...targetShift.selectedZoneIds, zoneId]),
    ];
    const zoneTables = new Set(
      state.tables
        .filter((table) => table.zoneId === zoneId)
        .map((table) => table.sessionId),
    );
    state.tableAssignments
      .filter(
        (assignment) =>
          !assignment.releasedAt &&
          assignment.employeeId === shift.employeeId &&
          zoneTables.has(assignment.tableSessionId),
      )
      .forEach((assignment) => {
        assignment.releasedAt = this.now().toISOString();
        state.tableAssignments.push({
          tableSessionId: assignment.tableSessionId,
          employeeId: targetEmployeeId,
          assignedByEmployeeId: shift.employeeId,
          assignedAt: this.now().toISOString(),
        });
      });
    state.tasks
      .filter(
        (task) =>
          task.status === "pending" &&
          task.zoneId === zoneId &&
          task.assignedEmployeeId === shift.employeeId,
      )
      .forEach((task) => {
        task.assignedEmployeeId = targetEmployeeId;
        task.version += 1;
      });
    shift.version += 1;
    targetShift.version += 1;
    state.audits.push({
      id: randomUUID(),
      action: "waiter.zone_transferred",
      actorEmployeeId: shift.employeeId,
      targetId: zoneId,
      reason: reason.trim(),
      data: { targetEmployeeId },
      occurredAt: this.now().toISOString(),
    });
    this.refreshOrphanAlerts(state);
    this.write(state);
    return this.bootstrap(token);
  }

  reportTableIncident(
    token: string,
    tableSessionId: string,
    reason: string,
  ): WaiterBootstrap {
    const state = this.read();
    const shift = this.activeShift(state, token);
    const table = state.tables.find(
      (candidate) => candidate.sessionId === tableSessionId && candidate.active,
    );
    if (
      !table ||
      !reason.trim() ||
      (!shift.selectedZoneIds.includes(table.zoneId) &&
        !state.tableAssignments.some(
          (assignment) =>
            !assignment.releasedAt &&
            assignment.tableSessionId === tableSessionId &&
            assignment.employeeId === shift.employeeId,
        ))
    ) {
      throw new WaiterConflictError(
        "La mesa no pertenece a tu cobertura o falta el detalle.",
        403,
      );
    }
    state.audits.push({
      id: randomUUID(),
      action: "waiter.table_incident_reported",
      actorEmployeeId: shift.employeeId,
      targetId: tableSessionId,
      reason: reason.trim(),
      occurredAt: this.now().toISOString(),
    });
    this.write(state);
    return this.bootstrap(token);
  }

  pendingSummary(token: string): PendingTaskSummary {
    const state = this.read();
    const shift = this.activeShift(state, token);
    return summary(
      state.tasks.filter((task) => this.taskVisible(state, shift, task)),
    );
  }

  closeShift(
    token: string,
    expectedVersion: number,
  ): { summary: PendingTaskSummary; bootstrap: WaiterBootstrap } {
    const state = this.read();
    const shift = this.activeShift(state, token);
    if (shift.version !== expectedVersion) {
      throw new WaiterConflictError("El turno cambió. Revisa antes de cerrar.");
    }
    const pending = summary(
      state.tasks.filter((task) => this.taskVisible(state, shift, task)),
    );
    state.closeSnapshots.push({
      id: randomUUID(),
      shiftId: shift.id,
      employeeId: shift.employeeId,
      summary: pending,
      acknowledged: true,
      createdAt: this.now().toISOString(),
    });
    state.tableAssignments
      .filter(
        (assignment) =>
          assignment.employeeId === shift.employeeId && !assignment.releasedAt,
      )
      .forEach((assignment) => {
        assignment.releasedAt = this.now().toISOString();
      });
    state.tasks
      .filter(
        (task) =>
          task.assignedEmployeeId === shift.employeeId &&
          task.status === "pending",
      )
      .forEach((task) => {
        task.assignedEmployeeId = undefined;
        task.version += 1;
      });
    shift.selectedZoneIds = [];
    shift.state = "closed";
    shift.version += 1;
    shift.closedAt = this.now().toISOString();
    this.refreshOrphanAlerts(state);
    state.audits.push({
      id: randomUUID(),
      action: "waiter.shift_closed_with_pending_snapshot",
      actorEmployeeId: shift.employeeId,
      targetId: shift.id,
      reason: `Cierre consciente con ${pending.total} tarea(s) pendiente(s)`,
      data: pending,
      occurredAt: this.now().toISOString(),
    });
    this.write(state);
    return { summary: pending, bootstrap: this.publicBootstrap() };
  }

  ageTask(taskId: string, seconds: number): void {
    const state = this.read();
    const task = state.tasks.find((candidate) => candidate.id === taskId);
    if (!task) throw new WaiterConflictError("Tarea no encontrada.", 404);
    task.requestedAt = new Date(
      Date.parse(task.requestedAt) - seconds * 1000,
    ).toISOString();
    const alert = state.adminAlerts.find(
      (candidate) => candidate.taskId === task.id,
    );
    if (alert) {
      alert.escalateAt = new Date(
        Date.parse(alert.escalateAt) - seconds * 1000,
      ).toISOString();
    }
    this.write(state);
  }

  auditEntries(): readonly StoredAudit[] {
    return this.read().audits;
  }

  taskBySource(sourceId: string): StoredTask | undefined {
    return this.read().tasks.find((task) => task.sourceId === sourceId);
  }
}
