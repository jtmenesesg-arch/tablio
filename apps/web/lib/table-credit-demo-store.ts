import "server-only";

import { randomInt, randomUUID } from "node:crypto";
import { decideCreditOrder } from "@tablio/application";
import type {
  CreditAccountStatus,
  CreditLedgerEntry,
  TableCreditAccount,
  TableCreditBootstrap,
  TableCreditMutation,
} from "./table-credit-contract";

export const CREDIT_DEMO_TENANT_ID = "00000000-0000-4000-8000-000000000401";
export const CREDIT_DEMO_VENUE_ID = "bar-la-esquina";

export type CreditActor = Readonly<{
  id: string;
  name: string;
  tenantId: string;
  canOpen: boolean;
  canCharge: boolean;
  canCloseWithLoss: boolean;
}>;

type MutableVerification = {
  code: string;
  expiresAt: string;
  usedAt?: string;
};

type MutableAccount = {
  id: string;
  tableId: string;
  tableName: string;
  customerLabel?: string;
  status: CreditAccountStatus;
  openedAt: string;
  expiresAt: string;
  openedBy: string;
  reason: string;
  billRequestedAt?: string;
  prepaidByAppClp: number;
  orders: Array<{
    id: string;
    number: number;
    amountClp: number;
    productionStatus: "queued" | "in_preparation" | "ready";
    financialMode: "table_credit";
  }>;
  ledger: CreditLedgerEntry[];
  verification?: MutableVerification;
};

type CreditState = {
  settings: {
    enabled: boolean;
    maxPerTableClp: number;
    maxVenueExposureClp: number;
    expiresAfterMinutes: number;
  };
  accounts: MutableAccount[];
  paymentKeys: Map<string, string>;
  printSpool: Array<{
    id: string;
    accountId: string;
    kind: "credit_payment_receipt";
    status: "queued";
    reprintReason?: string;
  }>;
  losses: Array<{
    id: string;
    accountId: string;
    amountClp: number;
    reason: string;
    occurredAt: string;
  }>;
  audits: Array<{
    action: string;
    actorId: string;
    accountId?: string;
    reason: string;
    occurredAt: string;
  }>;
  orderSequence: number;
};

export class TableCreditError extends Error {
  constructor(
    message: string,
    readonly status = 409,
  ) {
    super(message);
  }
}

const asClp = (value: number) => {
  if (!Number.isSafeInteger(value) || value <= 0) {
    throw new TableCreditError(
      "El monto debe ser un entero CLP positivo.",
      400,
    );
  }
  return value;
};

function iso(now: Date, deltaMs = 0): string {
  return new Date(now.getTime() + deltaMs).toISOString();
}

function newState(seed: boolean, current: Date): CreditState {
  const base: CreditState = {
    settings: {
      enabled: seed,
      maxPerTableClp: 60_000,
      maxVenueExposureClp: 180_000,
      expiresAfterMinutes: 180,
    },
    accounts: [],
    paymentKeys: new Map(),
    printSpool: [],
    losses: [
      {
        id: "loss-previous-month",
        accountId: "closed-credit-old",
        amountClp: 48_000,
        reason: "Mesa se retiró sin completar el pago",
        occurredAt: iso(current, -32 * 24 * 60 * 60 * 1000),
      },
      {
        id: "loss-current-month",
        accountId: "closed-credit-current",
        amountClp: 36_000,
        reason: "Cierre autorizado después de agotar contacto",
        occurredAt: iso(current, -4 * 24 * 60 * 60 * 1000),
      },
    ],
    audits: [],
    orderSequence: 804,
  };
  if (seed) {
    base.accounts.push({
      id: "credit-mesa-8",
      tableId: "demo-mesa-8",
      tableName: "Mesa 8",
      customerLabel: "Reserva Soto",
      status: "open",
      openedAt: iso(current, -62 * 60 * 1000),
      expiresAt: iso(current, 118 * 60 * 1000),
      openedBy: "Valentina",
      reason: "Cliente frecuente autorizado por administración",
      prepaidByAppClp: 32_000,
      orders: [
        {
          id: "credit-order-803",
          number: 803,
          amountClp: 18_500,
          productionStatus: "in_preparation",
          financialMode: "table_credit",
        },
      ],
      ledger: [
        {
          id: "credit-entry-803",
          type: "charge",
          amountClp: 18_500,
          occurredAt: iso(current, -22 * 60 * 1000),
          description: "Pedido #803 enviado sin pago previo",
        },
      ],
    });
  }
  return base;
}

export class TableCreditDemoStore {
  private state: CreditState;

  constructor(
    seed = true,
    private readonly clock: () => Date = () => new Date(),
  ) {
    this.state = newState(seed, this.clock());
  }

  reset(seed = true) {
    this.state = newState(seed, this.clock());
  }

  private assertTenant(actor: CreditActor) {
    if (actor.tenantId !== CREDIT_DEMO_TENANT_ID) {
      throw new TableCreditError("El crédito pertenece a otro tenant.", 403);
    }
  }

  private account(id: string): MutableAccount {
    const account = this.state.accounts.find((item) => item.id === id);
    if (!account)
      throw new TableCreditError("Crédito de mesa no encontrado.", 404);
    this.refreshExpiry(account);
    return account;
  }

  private amounts(account: MutableAccount) {
    const chargedToCreditClp = account.ledger
      .filter((entry) => entry.type === "charge")
      .reduce((total, entry) => total + entry.amountClp, 0);
    const creditPaidClp = account.ledger
      .filter(
        (entry) =>
          entry.type === "digital_payment" ||
          entry.type === "in_person_payment" ||
          entry.type === "write_off",
      )
      .reduce((total, entry) => total + entry.amountClp, 0);
    return {
      chargedToCreditClp,
      creditPaidClp,
      outstandingClp: Math.max(0, chargedToCreditClp - creditPaidClp),
    };
  }

  private refreshExpiry(account: MutableAccount) {
    if (
      (account.status === "open" || account.status === "bill_requested") &&
      Date.parse(account.expiresAt) <= this.clock().getTime()
    ) {
      account.status = "expired";
    }
  }

  private openExposure(): number {
    return this.state.accounts.reduce(
      (total, account) => total + this.amounts(account).outstandingClp,
      0,
    );
  }

  private present(account: MutableAccount): TableCreditAccount {
    this.refreshExpiry(account);
    const amounts = this.amounts(account);
    return {
      ...account,
      ...amounts,
      maxTableClp: this.state.settings.maxPerTableClp,
      orders: account.orders.map((order) => ({ ...order })),
      ledger: account.ledger.map((entry) => ({ ...entry })),
      verification: account.verification
        ? {
            code: account.verification.code,
            expiresAt: account.verification.expiresAt,
            status: account.verification.usedAt ? "used" : "active",
          }
        : undefined,
    };
  }

  bootstrap(actor: CreditActor): TableCreditBootstrap {
    this.assertTenant(actor);
    const openClp = this.openExposure();
    return {
      demo: true,
      tenantId: CREDIT_DEMO_TENANT_ID,
      venue: { id: CREDIT_DEMO_VENUE_ID, name: "Bar La Esquina" },
      settings: { ...this.state.settings },
      exposure: {
        openClp,
        availableClp: Math.max(
          0,
          this.state.settings.maxVenueExposureClp - openClp,
        ),
      },
      accounts: this.state.accounts.map((account) => this.present(account)),
      printSpool: this.state.printSpool.map((job) => ({ ...job })),
      losses: this.state.losses.map((loss) => ({ ...loss })),
      serverTime: this.clock().toISOString(),
    };
  }

  mutate(actor: CreditActor, mutation: TableCreditMutation) {
    this.assertTenant(actor);
    const now = this.clock();
    switch (mutation.action) {
      case "settings.enable": {
        if (!actor.canOpen || !mutation.reason.trim()) {
          throw new TableCreditError(
            "Habilitar crédito requiere permiso y motivo.",
            403,
          );
        }
        this.state.settings.enabled = mutation.enabled;
        this.state.audits.push({
          action: mutation.enabled
            ? "table_credit.enabled"
            : "table_credit.disabled",
          actorId: actor.id,
          reason: mutation.reason.trim(),
          occurredAt: now.toISOString(),
        });
        break;
      }
      case "account.open": {
        if (!actor.canOpen) {
          throw new TableCreditError(
            "No tienes permiso para abrir crédito de mesa.",
            403,
          );
        }
        if (!this.state.settings.enabled) {
          throw new TableCreditError(
            "El crédito de mesa está desactivado para este local.",
          );
        }
        if (this.openExposure() >= this.state.settings.maxVenueExposureClp) {
          throw new TableCreditError(
            "El local alcanzó su exposición máxima. Cobra crédito antes de abrir otra mesa.",
          );
        }
        if (!mutation.reason.trim()) {
          throw new TableCreditError("El motivo es obligatorio.", 400);
        }
        if (
          this.state.accounts.some(
            (account) =>
              account.tableId === mutation.tableId &&
              ["open", "bill_requested", "expired"].includes(account.status),
          )
        ) {
          throw new TableCreditError("La mesa ya tiene un crédito abierto.");
        }
        this.state.accounts.push({
          id: randomUUID(),
          tableId: mutation.tableId,
          tableName: mutation.tableName,
          customerLabel: mutation.customerLabel?.trim() || undefined,
          status: "open",
          openedAt: now.toISOString(),
          expiresAt: iso(
            now,
            this.state.settings.expiresAfterMinutes * 60 * 1000,
          ),
          openedBy: actor.name,
          reason: mutation.reason.trim(),
          prepaidByAppClp: 0,
          orders: [],
          ledger: [],
        });
        break;
      }
      case "order.add": {
        if (!actor.canCharge) {
          throw new TableCreditError(
            "No tienes permiso para cargar pedidos al crédito.",
            403,
          );
        }
        const account = this.account(mutation.accountId);
        if (account.status !== "open") {
          throw new TableCreditError(
            "La cuenta no está abierta para pedidos nuevos.",
          );
        }
        const amountClp = asClp(mutation.amountClp);
        const decision = decideCreditOrder(
          this.state.settings,
          {
            accountOutstandingClp: this.amounts(account).outstandingClp,
            venueOutstandingClp: this.openExposure(),
          },
          amountClp,
        );
        if (!decision.allowed) throw new TableCreditError(decision.message);
        this.state.orderSequence += 1;
        account.orders.push({
          id: randomUUID(),
          number: this.state.orderSequence,
          amountClp,
          productionStatus: "queued",
          financialMode: "table_credit",
        });
        account.ledger.push({
          id: randomUUID(),
          type: "charge",
          amountClp,
          occurredAt: now.toISOString(),
          description:
            mutation.description.trim() ||
            `Pedido #${this.state.orderSequence} enviado a producción`,
        });
        break;
      }
      case "payment.add": {
        const amountClp = asClp(mutation.amountClp);
        const existingAccountId = this.state.paymentKeys.get(
          mutation.idempotencyKey,
        );
        if (existingAccountId) {
          if (existingAccountId !== mutation.accountId) {
            throw new TableCreditError(
              "La clave de pago ya pertenece a otra cuenta.",
            );
          }
          break;
        }
        const account = this.account(mutation.accountId);
        const outstanding = this.amounts(account).outstandingClp;
        if (amountClp > outstanding) {
          throw new TableCreditError(
            "El pago no puede superar el saldo del crédito.",
            400,
          );
        }
        account.ledger.push({
          id: randomUUID(),
          type:
            mutation.method === "digital"
              ? "digital_payment"
              : "in_person_payment",
          amountClp,
          occurredAt: now.toISOString(),
          description:
            mutation.method === "digital"
              ? "Pago parcial confirmado server-side"
              : "Pago presencial registrado por caja",
        });
        this.state.paymentKeys.set(mutation.idempotencyKey, mutation.accountId);
        this.state.printSpool.push({
          id: randomUUID(),
          accountId: account.id,
          kind: "credit_payment_receipt",
          status: "queued",
        });
        if (this.amounts(account).outstandingClp === 0) {
          account.status = "settled";
        }
        break;
      }
      case "bill.request": {
        const account = this.account(mutation.accountId);
        if (account.status !== "open") {
          throw new TableCreditError("La cuenta ya no admite esta acción.");
        }
        account.status = "bill_requested";
        account.billRequestedAt = now.toISOString();
        account.verification = undefined;
        break;
      }
      case "verification.issue": {
        const account = this.account(mutation.accountId);
        if (this.amounts(account).outstandingClp > 0) {
          throw new TableCreditError(
            "El código pagado sólo aparece cuando el saldo llega a cero.",
          );
        }
        account.verification = {
          code: randomInt(100_000, 1_000_000).toString(),
          expiresAt: iso(now, 60_000),
        };
        break;
      }
      case "verification.validate": {
        const account = this.account(mutation.accountId);
        const verification = account.verification;
        if (
          !verification ||
          verification.code !== mutation.code ||
          verification.usedAt ||
          Date.parse(verification.expiresAt) <= now.getTime()
        ) {
          throw new TableCreditError(
            "Código inválido, vencido o ya utilizado.",
            400,
          );
        }
        verification.usedAt = now.toISOString();
        break;
      }
      case "account.close_loss": {
        if (!actor.canCloseWithLoss) {
          throw new TableCreditError(
            "No tienes permiso para registrar una fuga.",
            403,
          );
        }
        if (!mutation.reason.trim()) {
          throw new TableCreditError("Cerrar con fuga exige un motivo.", 400);
        }
        const account = this.account(mutation.accountId);
        const outstanding = this.amounts(account).outstandingClp;
        if (outstanding <= 0) {
          throw new TableCreditError("Esta cuenta no tiene saldo pendiente.");
        }
        account.ledger.push({
          id: randomUUID(),
          type: "write_off",
          amountClp: outstanding,
          occurredAt: now.toISOString(),
          description: `Fuga asumida por el local: ${mutation.reason.trim()}`,
        });
        account.status = "closed_with_loss";
        this.state.losses.push({
          id: randomUUID(),
          accountId: account.id,
          amountClp: outstanding,
          reason: mutation.reason.trim(),
          occurredAt: now.toISOString(),
        });
        break;
      }
    }
    this.state.audits.push({
      action: mutation.action,
      actorId: actor.id,
      accountId: "accountId" in mutation ? mutation.accountId : undefined,
      reason:
        "reason" in mutation && typeof mutation.reason === "string"
          ? mutation.reason
          : "Acción operativa de crédito",
      occurredAt: now.toISOString(),
    });
    return this.bootstrap(actor);
  }
}

const shared = globalThis as typeof globalThis & {
  __tablioTableCreditStore?: TableCreditDemoStore;
};

export const tableCreditDemoStore =
  shared.__tablioTableCreditStore ?? new TableCreditDemoStore();
shared.__tablioTableCreditStore = tableCreditDemoStore;

export const creditDemoActor: CreditActor = {
  id: "cashier-valentina",
  name: "Valentina",
  tenantId: CREDIT_DEMO_TENANT_ID,
  canOpen: true,
  canCharge: true,
  canCloseWithLoss: true,
};
