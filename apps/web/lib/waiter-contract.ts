export type WaiterTaskType =
  "delivery_ready" | "service_request" | "waiter_payment_request";

export type WaiterTask = Readonly<{
  id: string;
  sourceId: string;
  type: WaiterTaskType;
  status: "pending";
  version: number;
  tableSessionId: string;
  tableName: string;
  zoneId: string;
  zoneName: string;
  groupId?: string;
  groupLabel?: string;
  groupVersion?: number;
  alias?: string;
  displayName?: string;
  orderNumber?: number;
  amountClp?: number;
  title: string;
  detail: string;
  items: readonly {
    name: string;
    quantity: number;
    note?: string;
  }[];
  paid: boolean;
  requestedAt: string;
  critical: boolean;
  unassignedZone: boolean;
  adminEscalated: boolean;
  effectivePriority: number;
  actionLabel: "Entregado" | "Atendido";
}>;

export type WaiterTable = Readonly<{
  sessionId: string;
  tableName: string;
  zoneId: string;
  zoneName: string;
  peopleCount: number;
  active: true;
  groupId?: string;
  groupLabel?: string;
  groupVersion?: number;
  assignedEmployeeId?: string;
  credit?: {
    status:
      "open" | "bill_requested" | "expired" | "settled" | "closed_with_loss";
    prepaidByAppClp: number;
    outstandingClp: number;
    expiresAt: string;
  };
  orders: readonly {
    orderNumber: number;
    alias?: string;
    displayName?: string;
    amountClp: number;
    tickets: readonly {
      stationName: string;
      state: string;
      items: readonly string[];
    }[];
  }[];
}>;

export type PendingTaskSummary = Readonly<{
  total: number;
  deliveryReady: number;
  serviceRequest: number;
  waiterPaymentRequest: number;
}>;

export type WaiterBootstrap = Readonly<{
  demo: true;
  authenticated: boolean;
  venue: {
    id: string;
    name: string;
  };
  employee?: {
    id: string;
    name: string;
  };
  shift?: {
    id: string;
    version: number;
    startedAt: string;
    idleExpiresAt: string;
    absoluteExpiresAt: string;
  };
  zones: readonly {
    id: string;
    name: string;
    activeTableCount: number;
    selected: boolean;
  }[];
  tasks: readonly WaiterTask[];
  tables: readonly WaiterTable[];
  activeWaiters: readonly {
    id: string;
    name: string;
  }[];
  pending: PendingTaskSummary;
  oldestPendingAt?: string;
  settings: {
    reconciliationIntervalSeconds: number;
    warningAfterSeconds: number;
    amberAfterSeconds: number;
    criticalAfterSeconds: number;
    absoluteCriticalAfterSeconds: number;
    orphanAdminAlertAfterSeconds: number;
  };
  serverTime: string;
}>;

export type WaiterMutation =
  | {
      action: "login";
      pin: string;
      clientFingerprint: string;
    }
  | {
      action: "zones.set";
      zoneIds: string[];
    }
  | {
      action: "task.resolve";
      taskId: string;
      expectedVersion: number;
      resolution: "completed" | "dismissed";
      reason?: string;
    }
  | {
      action: "group.create";
      tableSessionIds: string[];
    }
  | {
      action: "group.separate";
      groupId: string;
      expectedVersion: number;
      reason: string;
    }
  | {
      action: "table.transfer";
      tableSessionId: string;
      targetEmployeeId: string;
      reason: string;
    }
  | {
      action: "zone.transfer";
      zoneId: string;
      targetEmployeeId: string;
      reason: string;
    }
  | {
      action: "table.incident";
      tableSessionId: string;
      reason: string;
    }
  | {
      action: "shift.close";
      expectedVersion: number;
    };
