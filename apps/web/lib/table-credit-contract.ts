export type CreditAccountStatus =
  "open" | "bill_requested" | "expired" | "settled" | "closed_with_loss";

export type CreditLedgerEntry = Readonly<{
  id: string;
  type: "charge" | "digital_payment" | "in_person_payment" | "write_off";
  amountClp: number;
  occurredAt: string;
  description: string;
}>;

export type TableCreditAccount = Readonly<{
  id: string;
  tableId: string;
  tableName: string;
  customerLabel?: string;
  status: CreditAccountStatus;
  openedAt: string;
  expiresAt: string;
  openedBy: string;
  reason: string;
  prepaidByAppClp: number;
  chargedToCreditClp: number;
  creditPaidClp: number;
  outstandingClp: number;
  maxTableClp: number;
  billRequestedAt?: string;
  orders: readonly {
    id: string;
    number: number;
    amountClp: number;
    productionStatus: "queued" | "in_preparation" | "ready";
    financialMode: "table_credit";
  }[];
  ledger: readonly CreditLedgerEntry[];
  verification?: {
    code: string;
    expiresAt: string;
    status: "active" | "used";
  };
}>;

export type TableCreditBootstrap = Readonly<{
  demo: true;
  tenantId: string;
  venue: { id: string; name: string };
  settings: {
    enabled: boolean;
    maxPerTableClp: number;
    maxVenueExposureClp: number;
    expiresAfterMinutes: number;
  };
  exposure: {
    openClp: number;
    availableClp: number;
  };
  accounts: readonly TableCreditAccount[];
  printSpool: readonly {
    id: string;
    accountId: string;
    kind: "credit_payment_receipt";
    status: "queued";
    reprintReason?: string;
  }[];
  losses: readonly {
    id: string;
    accountId: string;
    amountClp: number;
    reason: string;
    occurredAt: string;
  }[];
  serverTime: string;
}>;

export type TableCreditMutation =
  | { action: "settings.enable"; enabled: boolean; reason: string }
  | {
      action: "account.open";
      tableId: string;
      tableName: string;
      customerLabel?: string;
      reason: string;
    }
  | {
      action: "order.add";
      accountId: string;
      amountClp: number;
      description: string;
    }
  | {
      action: "payment.add";
      accountId: string;
      amountClp: number;
      method: "digital" | "in_person";
      idempotencyKey: string;
    }
  | { action: "bill.request"; accountId: string }
  | { action: "verification.issue"; accountId: string }
  | { action: "verification.validate"; accountId: string; code: string }
  | {
      action: "account.close_loss";
      accountId: string;
      reason: string;
    };
