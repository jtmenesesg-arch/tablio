export type TableState =
  "available" | "occupied" | "waiting_payment" | "paused";
export type PresenceDeliveryLevel = "printed_with_qr" | "separate" | "rotating";

export type ManagedTable = Readonly<{
  tableNumber: string;
  displayName: string;
  zoneName: string;
  capacity: number;
  state: TableState;
  activeSessionStartedAt?: string;
  qrState: "active" | "revoked";
  qrVersion: number;
  presenceRequired: boolean;
  presenceDeliveryLevel: PresenceDeliveryLevel;
}>;

export type TableManagementSnapshot = Readonly<{
  demo: true;
  generatedAt: string;
  tenantName: string;
  branchName: string;
  zones: readonly { code: string; name: string }[];
  tables: readonly ManagedTable[];
  presencePolicy: {
    required: boolean;
    deliveryLevel: PresenceDeliveryLevel;
    rotationPeriod: "daily" | "shift";
  };
}>;

export type TableManagementMutation =
  | {
      action: "table.create";
      tableNumber: string;
      displayName: string;
      zoneCode: string;
      capacity: number;
    }
  | {
      action: "table.create_bulk";
      zoneCode: string;
      startNumber: number;
      count: number;
      namePrefix: string;
      capacity: number;
    }
  | { action: "qr.rotate"; tableNumber: string; reason: string }
  | { action: "qr.revoke"; tableNumber: string; reason: string };
