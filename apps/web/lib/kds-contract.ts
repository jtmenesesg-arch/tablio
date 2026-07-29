export type KdsTicketState =
  "queued" | "acknowledged" | "in_preparation" | "ready" | "completed";

export type KdsStation = Readonly<{
  id: string;
  name: string;
}>;

export type KdsTicketItem = Readonly<{
  id: string;
  name: string;
  quantity: number;
  note?: string;
  isLoyaltyReward?: boolean;
}>;

export type KdsTicket = Readonly<{
  id: string;
  tenantId: string;
  orderId: string;
  orderNumber: number;
  amountClp?: number;
  tableName: string;
  alias: string;
  displayName?: string;
  stationId: string;
  stationName: string;
  state: KdsTicketState;
  version: number;
  paid: true;
  confirmedAt: string;
  acknowledgedAt?: string;
  inPreparationAt?: string;
  readyAt?: string;
  completedAt?: string;
  items: readonly KdsTicketItem[];
}>;

export type KdsLatencySummary = Readonly<{
  connectedSampleCount: number;
  noKdsConnectedCount: number;
  connectedNotYetVisibleCount: number;
  p50Ms?: number;
  p95Ms?: number;
  p99Ms?: number;
}>;

export type KdsPrintJob = Readonly<{
  id: string;
  ticketId: string;
  status: "pending" | "processing" | "printed" | "failed" | "dead_letter";
  attemptCount: number;
  reprintOfJobId?: string;
  reprintReason?: string;
  createdAt: string;
}>;

export type KdsBootstrap = Readonly<{
  demo: true;
  tenantId: string;
  venue: { id: string; name: string };
  stations: readonly KdsStation[];
  selectedStationId: string;
  tickets: readonly KdsTicket[];
  products: readonly {
    id: string;
    name: string;
    available: boolean;
    trackStock: boolean;
  }[];
  printJobs: readonly KdsPrintJob[];
  latency: KdsLatencySummary;
  settings: {
    reconciliationIntervalSeconds: number;
    warningAfterSeconds: number;
    presenceTimeoutSeconds: number;
    amberAfterSeconds: number;
    criticalAfterSeconds: number;
    newTicketSoundEnabled: boolean;
    criticalSoundEnabled: boolean;
  };
  serverTime: string;
}>;

export type KdsMutation =
  | {
      action: "heartbeat";
      clientId: string;
      stationId: string;
    }
  | {
      action: "disconnect";
      clientId: string;
    }
  | {
      action: "ticket.transition";
      ticketId: string;
      expectedState: KdsTicketState;
      expectedVersion: number;
      targetState: KdsTicketState;
    }
  | {
      action: "ticket.visible";
      ticketId: string;
      clientId: string;
      source: "realtime" | "initial_query" | "reconnect" | "safety_poll";
    }
  | {
      action: "product.availability";
      productId: string;
      available: boolean;
      reason: string;
    }
  | {
      action: "print.reprint";
      printJobId: string;
      reason: string;
    };
