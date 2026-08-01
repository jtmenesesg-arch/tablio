import "server-only";

import { randomBytes, randomInt } from "node:crypto";
import type {
  ManagedTable,
  PresenceDeliveryLevel,
  TableManagementMutation,
  TableManagementSnapshot,
  TableState,
} from "./table-management-contract";

type StoredTable = {
  tableNumber: string;
  displayName: string;
  zoneCode: string;
  capacity: number;
  state: TableState;
  activeSessionStartedAt?: string;
  qrToken: string;
  qrVersion: number;
  qrActive: boolean;
  presenceCode: string;
  presenceRequired: boolean;
  presenceDeliveryLevel: PresenceDeliveryLevel;
};

type DemoAudit = {
  action: string;
  tableNumber: string;
  reason: string;
  occurredAt: string;
};

const zones = [
  { code: "salon", name: "Salón" },
  { code: "terraza", name: "Terraza" },
  { code: "patio", name: "Patio" },
] as const;

function token(): string {
  return randomBytes(32).toString("base64url");
}

function presenceCode(): string {
  return randomInt(0, 10_000).toString().padStart(4, "0");
}

function seed(): StoredTable[] {
  const stateByNumber: Partial<Record<number, TableState>> = {
    1: "occupied",
    3: "waiting_payment",
    8: "occupied",
    10: "occupied",
    13: "paused",
    16: "occupied",
  };
  return Array.from({ length: 18 }, (_, index): StoredTable => {
    const number = index + 1;
    const state = stateByNumber[number] ?? "available";
    return {
      tableNumber: String(number),
      displayName: `Mesa ${number}`,
      zoneCode: number <= 8 ? "salon" : number <= 14 ? "terraza" : "patio",
      capacity: number % 5 === 0 ? 6 : number >= 15 ? 2 : 4,
      state,
      activeSessionStartedAt:
        state === "available"
          ? undefined
          : new Date(Date.now() - (18 + number * 3) * 60 * 1000).toISOString(),
      qrToken: token(),
      qrVersion: 1,
      qrActive: number !== 17,
      presenceCode: number === 8 ? "4826" : presenceCode(),
      presenceRequired: true,
      presenceDeliveryLevel: "printed_with_qr",
    };
  });
}

export class TableManagementDemoStore {
  private tables = seed();
  private audit: DemoAudit[] = [];

  snapshot(): TableManagementSnapshot {
    return {
      demo: true,
      generatedAt: new Date().toISOString(),
      tenantName: "Grupo La Esquina",
      branchName: "Bar La Esquina",
      zones: zones.map((zone) => ({ ...zone })),
      tables: this.tables
        .map((table): ManagedTable => {
          const zone = zones.find(
            (candidate) => candidate.code === table.zoneCode,
          );
          return {
            tableNumber: table.tableNumber,
            displayName: table.displayName,
            zoneName: zone?.name ?? "Sin zona",
            capacity: table.capacity,
            state: table.state,
            activeSessionStartedAt: table.activeSessionStartedAt,
            qrState: table.qrActive ? "active" : "revoked",
            qrVersion: table.qrVersion,
            presenceRequired: table.presenceRequired,
            presenceDeliveryLevel: table.presenceDeliveryLevel,
          };
        })
        .sort((left, right) =>
          left.tableNumber.localeCompare(right.tableNumber, "es", {
            numeric: true,
          }),
        ),
      presencePolicy: {
        required: true,
        deliveryLevel: "printed_with_qr",
        rotationPeriod: "daily",
      },
    };
  }

  reset() {
    this.tables = seed();
    this.audit = [];
  }

  mutate(mutation: TableManagementMutation): TableManagementSnapshot {
    switch (mutation.action) {
      case "table.create":
        this.create({
          tableNumber: mutation.tableNumber,
          displayName: mutation.displayName,
          zoneCode: mutation.zoneCode,
          capacity: mutation.capacity,
        });
        break;
      case "table.create_bulk": {
        if (
          !Number.isInteger(mutation.count) ||
          mutation.count < 1 ||
          mutation.count > 60
        ) {
          throw new Error("Puedes crear entre 1 y 60 mesas por vez.");
        }
        const numbers = Array.from({ length: mutation.count }, (_, index) =>
          String(mutation.startNumber + index),
        );
        if (
          numbers.some((number) =>
            this.tables.some((table) => table.tableNumber === number),
          )
        ) {
          throw new Error("Al menos uno de esos números de mesa ya existe.");
        }
        for (const number of numbers) {
          this.create({
            tableNumber: number,
            displayName: `${mutation.namePrefix.trim() || "Mesa"} ${number}`,
            zoneCode: mutation.zoneCode,
            capacity: mutation.capacity,
          });
        }
        break;
      }
      case "qr.rotate": {
        const table = this.get(mutation.tableNumber);
        this.requireReason(mutation.reason);
        table.qrToken = token();
        table.qrVersion += 1;
        table.qrActive = true;
        this.record("table.qr_rotated", table.tableNumber, mutation.reason);
        break;
      }
      case "qr.revoke": {
        const table = this.get(mutation.tableNumber);
        this.requireReason(mutation.reason);
        table.qrActive = false;
        this.record("table.qr_revoked", table.tableNumber, mutation.reason);
        break;
      }
    }
    return this.snapshot();
  }

  printable(tableNumber: string, reason: string) {
    this.requireReason(reason);
    const table = this.get(tableNumber);
    if (!table.qrActive) throw new Error("El QR de esta mesa está revocado.");
    this.record("table.qr_revealed", table.tableNumber, reason);
    const zone = zones.find((candidate) => candidate.code === table.zoneCode);
    return {
      tableNumber: table.tableNumber,
      displayName: table.displayName,
      zoneName: zone?.name ?? "Sin zona",
      tenantName: "Bar La Esquina",
      qrToken: table.qrToken,
      presenceCode: table.presenceCode,
      presenceRequired: table.presenceRequired,
      presenceDeliveryLevel: table.presenceDeliveryLevel,
    };
  }

  private create(input: {
    tableNumber: string;
    displayName: string;
    zoneCode: string;
    capacity: number;
  }) {
    const tableNumber = input.tableNumber.trim();
    const displayName = input.displayName.trim();
    if (!tableNumber || !displayName)
      throw new Error("Completa número y nombre de la mesa.");
    if (!zones.some((zone) => zone.code === input.zoneCode)) {
      throw new Error("Elige una zona válida.");
    }
    if (
      !Number.isInteger(input.capacity) ||
      input.capacity < 1 ||
      input.capacity > 100
    ) {
      throw new Error("La capacidad debe estar entre 1 y 100 personas.");
    }
    if (this.tables.some((table) => table.tableNumber === tableNumber)) {
      throw new Error("Ese número de mesa ya existe.");
    }
    this.tables.push({
      tableNumber,
      displayName,
      zoneCode: input.zoneCode,
      capacity: input.capacity,
      state: "available",
      qrToken: token(),
      qrVersion: 1,
      qrActive: true,
      presenceCode: presenceCode(),
      presenceRequired: true,
      presenceDeliveryLevel: "printed_with_qr",
    });
    this.record("table.created_with_assets", tableNumber, "Creación de mesa");
  }

  private get(tableNumber: string): StoredTable {
    const table = this.tables.find(
      (candidate) => candidate.tableNumber === tableNumber,
    );
    if (!table) throw new Error("No encontramos esa mesa.");
    return table;
  }

  private requireReason(reason: string) {
    if (reason.trim().length < 5)
      throw new Error("Explica brevemente el motivo.");
  }

  private record(action: string, tableNumber: string, reason: string) {
    this.audit.push({
      action,
      tableNumber,
      reason: reason.trim(),
      occurredAt: new Date().toISOString(),
    });
  }
}

export const tableManagementDemoStore = new TableManagementDemoStore();
