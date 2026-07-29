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
  CashierBootstrap,
  CashierClosure,
  CashierException,
  CashierExceptionStatus,
  CashierExceptionType,
  CashierPayment,
  CashierReconciliationLine,
  CashierTable,
} from "./cashier-contract";

export const CASHIER_DEMO_TENANT_ID = "00000000-0000-4000-8000-000000000401";
export const CASHIER_DEMO_VENUE_ID = "bar-la-esquina";

export type CashierActor = {
  id: string;
  name: string;
  canRefund: boolean;
  canClose: boolean;
};

const DEFAULT_ACTOR: CashierActor = {
  id: "cashier-valentina",
  name: "Valentina",
  canRefund: true,
  canClose: true,
};

const SETTINGS = Object.freeze({
  manualProductionWindowSeconds: 20 * 60,
  reconciliationIntervalSeconds: 45,
  warningAfterSeconds: 75,
  pendingTaxAlertCount: 10,
  pendingTaxAlertAgeSeconds: 15 * 60,
});

type StoredShift = {
  id: string;
  status: "open" | "closed";
  version: number;
  openedAt: string;
  closedAt?: string;
  closedBy?: string;
  closeOverrideReason?: string;
};

type StoredPayment = {
  id: string;
  providerPaymentId: string;
  method: "Tarjeta demo" | "Efectivo";
  orderNumber?: number;
  tableName: string;
  personLabel: string;
  amountClp: number;
  tipClp: number;
  refundedClp: number;
  sourceShiftId?: string;
  providerApprovedAt: string;
  providerReceivedAt: string;
  waiterName?: string;
};

type StoredException = {
  id: string;
  deduplicationKey: string;
  type: CashierExceptionType;
  status: CashierExceptionStatus;
  priority: "normal" | "high" | "critical";
  version: number;
  amountClp: number;
  createdAt: string;
  tableName?: string;
  personLabel?: string;
  paymentId?: string;
  shiftId?: string;
  providerApprovedAt?: string;
  providerReceivedAt?: string;
  manualProductionDeadlineAt?: string;
  resolutionOptions: Array<
    | "refund"
    | "produce_manually"
    | "investigate"
    | "escalate"
    | "retry_tax_document"
  >;
  resolutionReason?: string;
};

type StoredRefund = {
  id: string;
  paymentId: string;
  idempotencyKey: string;
  amountClp: number;
  tipComponentClp: number;
  tipRefundedOpenShiftClp: number;
  localTipAdjustmentClp: number;
  policy: "open_shift_reduces_tip" | "closed_shift_local_absorbs";
  reason: string;
  requestedAt: string;
  requestedBy: string;
  operationShiftId: string;
};

type StoredAdjustment = {
  id: string;
  sourceShiftId: string;
  paymentId: string;
  refundId: string;
  amountClp: number;
  explanation: string;
  occurredAt: string;
  closureId?: string;
};

type StoredSettlement = {
  paymentId: string;
  providerGrossClp: number;
  providerFeeClp: number;
  providerNetClp: number;
  depositedClp: number;
  depositReference: string;
};

type StoredAudit = {
  id: string;
  actorId: string;
  action: string;
  targetId: string;
  reason: string;
  data: Record<string, unknown>;
  occurredAt: string;
};

type StoredTaxDocument = {
  id: string;
  paymentId?: string;
  refundId?: string;
  status: "pending" | "issued" | "failed" | "voucher" | "review";
  amountClp: number;
  folio?: string;
  representationUrl?: string;
  createdAt: string;
  retryCount: number;
};

type StoredTaxAttempt = {
  taxDocumentId: string;
  outcome: "issued" | "failed";
  occurredAt: string;
};

type StoredState = {
  schemaVersion: 1;
  shifts: StoredShift[];
  tables: CashierTable[];
  payments: StoredPayment[];
  exceptions: StoredException[];
  refunds: StoredRefund[];
  adjustments: StoredAdjustment[];
  settlements: StoredSettlement[];
  closures: CashierClosure[];
  audits: StoredAudit[];
  manuallyProducedExceptionIds: string[];
  taxDocuments: StoredTaxDocument[];
  taxAttempts: StoredTaxAttempt[];
};

export class CashierConflictError extends Error {
  constructor(
    message: string,
    readonly status = 409,
  ) {
    super(message);
  }
}

function iso(date: Date, deltaMs = 0): string {
  return new Date(date.getTime() + deltaMs).toISOString();
}

function exceptionMessage(type: CashierExceptionType): string {
  const messages: Record<CashierExceptionType, string> = {
    payment_approved_without_order:
      "El pago fue aprobado, pero no existe un pedido.",
    approved_after_quote_expired:
      "El pago llegó después de vencer la reserva del pedido.",
    amount_or_currency_mismatch:
      "El monto o la moneda no coincide con el pedido congelado.",
    merchant_or_tenant_mismatch: "El comercio o local del pago no coincide.",
    tax_document_failed: "La boleta no pudo emitirse.",
    tax_credit_note_pending:
      "El dinero fue devuelto, pero la nota de crédito sigue pendiente.",
    tax_credit_note_failed:
      "El dinero fue devuelto y falló la nota de crédito.",
    refund_not_reflected: "El proveedor todavía no refleja el reembolso.",
    settlement_difference: "El abono no coincide con lo esperado.",
    confirmation_after_shift_close:
      "La confirmación llegó después de cerrar su turno.",
    confirmation_without_cashier_shift:
      "La hora del proveedor no pertenece a ningún turno.",
  };
  return messages[type];
}

function initialState(current: Date): StoredState {
  const currentShift: StoredShift = {
    id: "cashier-shift-current",
    status: "open",
    version: 0,
    openedAt: iso(current, -3 * 60 * 60 * 1000),
  };
  const previousShift: StoredShift = {
    id: "cashier-shift-previous",
    status: "closed",
    version: 1,
    openedAt: iso(current, -12 * 60 * 60 * 1000),
    closedAt: iso(current, -7 * 60 * 60 * 1000),
    closedBy: "Valentina",
  };
  const payments: StoredPayment[] = [
    {
      id: "payment-mesa-8-a",
      providerPaymentId: "demo-pay-8-a",
      method: "Tarjeta demo",
      orderNumber: 1041,
      tableName: "Mesa 8",
      personLabel: "Zorro Azul · Sofía",
      amountClp: 20_000,
      tipClp: 2_000,
      refundedClp: 0,
      sourceShiftId: currentShift.id,
      providerApprovedAt: iso(current, -70 * 60 * 1000),
      providerReceivedAt: iso(current, -70 * 60 * 1000 + 120),
      waiterName: "Camila",
    },
    {
      id: "payment-mesa-8-b",
      providerPaymentId: "demo-pay-8-b",
      method: "Tarjeta demo",
      orderNumber: 1042,
      tableName: "Mesa 8",
      personLabel: "Faro Verde · Nico",
      amountClp: 28_600,
      tipClp: 2_600,
      refundedClp: 0,
      sourceShiftId: currentShift.id,
      providerApprovedAt: iso(current, -35 * 60 * 1000),
      providerReceivedAt: iso(current, -35 * 60 * 1000 + 95),
      waiterName: "Camila",
    },
    {
      id: "payment-previous-shift",
      providerPaymentId: "demo-pay-old",
      method: "Tarjeta demo",
      orderNumber: 998,
      tableName: "Mesa 3",
      personLabel: "Puma Rojo · Dani",
      amountClp: 15_000,
      tipClp: 1_500,
      refundedClp: 0,
      sourceShiftId: previousShift.id,
      providerApprovedAt: iso(current, -9 * 60 * 60 * 1000),
      providerReceivedAt: iso(current, -9 * 60 * 60 * 1000 + 80),
      waiterName: "Diego",
    },
    {
      id: "payment-late-approval",
      providerPaymentId: "demo-pay-late",
      method: "Tarjeta demo",
      tableName: "Mesa 12",
      personLabel: "Lince Morado · Fran",
      amountClp: 12_900,
      tipClp: 1_100,
      refundedClp: 0,
      sourceShiftId: currentShift.id,
      providerApprovedAt: iso(current, -5 * 60 * 1000),
      providerReceivedAt: iso(current, -4 * 60 * 1000 - 40_000),
      waiterName: "Camila",
    },
  ];
  const late = payments[3];
  return {
    schemaVersion: 1,
    shifts: [previousShift, currentShift],
    tables: [
      {
        id: "table-8",
        name: "Mesa 8",
        sessionId: "session-8",
        state: "requires_delivery",
        groupLabel: "Terraza unida",
        peopleCount: 5,
        orderCount: 4,
        processedClp: 48_600,
        preparingCount: 1,
        readyCount: 1,
        attentionCount: 0,
        lastActivityAt: iso(current, -2 * 60 * 1000),
        waiterName: "Camila",
      },
      {
        id: "table-9",
        name: "Mesa 9",
        sessionId: "session-9",
        state: "requires_attention",
        groupLabel: "Terraza unida",
        peopleCount: 3,
        orderCount: 2,
        processedClp: 24_500,
        preparingCount: 0,
        readyCount: 0,
        attentionCount: 1,
        lastActivityAt: iso(current, -4 * 60 * 1000),
        waiterName: "Camila",
      },
      {
        id: "table-5",
        name: "Mesa 5",
        sessionId: "session-5",
        state: "preparing",
        peopleCount: 4,
        orderCount: 3,
        processedClp: 37_900,
        preparingCount: 2,
        readyCount: 0,
        attentionCount: 0,
        lastActivityAt: iso(current, -6 * 60 * 1000),
        waiterName: "Diego",
      },
      {
        id: "table-2",
        name: "Mesa 2",
        state: "free",
        peopleCount: 0,
        orderCount: 0,
        processedClp: 0,
        preparingCount: 0,
        readyCount: 0,
        attentionCount: 0,
      },
    ],
    payments,
    exceptions: [
      {
        id: "exception-late-approval",
        deduplicationKey: "late:demo-pay-late",
        type: "approved_after_quote_expired",
        status: "open",
        priority: "critical",
        version: 0,
        amountClp: late.amountClp,
        createdAt: late.providerReceivedAt,
        tableName: late.tableName,
        personLabel: late.personLabel,
        paymentId: late.id,
        shiftId: currentShift.id,
        providerApprovedAt: late.providerApprovedAt,
        providerReceivedAt: late.providerReceivedAt,
        manualProductionDeadlineAt: iso(
          new Date(late.providerApprovedAt),
          SETTINGS.manualProductionWindowSeconds * 1000,
        ),
        resolutionOptions: ["refund", "produce_manually", "escalate"],
      },
      {
        id: "exception-settlement",
        deduplicationKey: "settlement:demo-pay-8-b",
        type: "settlement_difference",
        status: "open",
        priority: "high",
        version: 0,
        amountClp: 500,
        createdAt: iso(current, -3 * 60 * 1000),
        tableName: "Mesa 8",
        personLabel: "Faro Verde · Nico",
        paymentId: "payment-mesa-8-b",
        shiftId: currentShift.id,
        resolutionOptions: ["investigate", "escalate"],
      },
    ],
    refunds: [],
    adjustments: [],
    settlements: [
      {
        paymentId: "payment-mesa-8-a",
        providerGrossClp: 20_000,
        providerFeeClp: 580,
        providerNetClp: 19_420,
        depositedClp: 19_420,
        depositReference: "DEMO-ABONO-8A",
      },
      {
        paymentId: "payment-mesa-8-b",
        providerGrossClp: 28_600,
        providerFeeClp: 829,
        providerNetClp: 27_771,
        depositedClp: 27_271,
        depositReference: "DEMO-ABONO-8B",
      },
    ],
    closures: [],
    audits: [],
    manuallyProducedExceptionIds: [],
    taxDocuments: [
      {
        id: "tax-doc-1041",
        paymentId: "payment-mesa-8-a",
        status: "issued",
        amountClp: 20_000,
        folio: "10041",
        representationUrl: "/api/tax/documents/demo-dte%3Acaja-1041",
        createdAt: iso(current, -69 * 60 * 1000),
        retryCount: 0,
      },
      {
        id: "tax-doc-1042",
        paymentId: "payment-mesa-8-b",
        status: "failed",
        amountClp: 28_600,
        createdAt: iso(current, -34 * 60 * 1000),
        retryCount: 2,
      },
      ...Array.from({ length: 10 }, (_, index) => ({
        id: `tax-doc-backlog-${index + 1}`,
        status: "pending" as const,
        amountClp: 10_000 + index * 500,
        createdAt: iso(current, -(16 + index) * 60 * 1000),
        retryCount: 0,
      })),
    ],
    taxAttempts: [
      {
        taxDocumentId: "tax-doc-1042",
        outcome: "failed",
        occurredAt: iso(current, -60_000),
      },
      {
        taxDocumentId: "tax-doc-1042",
        outcome: "failed",
        occurredAt: iso(current, -90_000),
      },
      {
        taxDocumentId: "tax-doc-1041",
        outcome: "issued",
        occurredAt: iso(current, -120_000),
      },
      {
        taxDocumentId: "tax-doc-backlog-1",
        outcome: "failed",
        occurredAt: iso(current, -150_000),
      },
    ],
  };
}

function csvCell(value: string | number): string {
  const text = String(value);
  return /[",\n]/.test(text) ? `"${text.replaceAll('"', '""')}"` : text;
}

export class CashierDemoRepository {
  readonly filePath: string;

  constructor(
    filePath = CashierDemoRepository.defaultPath(),
    private readonly clock: () => Date = () => new Date(),
  ) {
    this.filePath = filePath;
  }

  static defaultPath(): string {
    return (
      process.env.TABLIO_CASHIER_DEMO_STATE_PATH ??
      join(process.cwd(), ".tablio-demo", "cashier-state.json")
    );
  }

  private now(): Date {
    return this.clock();
  }

  private read(): StoredState {
    if (!existsSync(this.filePath)) return initialState(this.now());
    const parsed = JSON.parse(
      readFileSync(this.filePath, "utf8"),
    ) as StoredState;
    if (!parsed.taxDocuments || !parsed.taxAttempts) {
      const seeded = initialState(this.now());
      parsed.taxDocuments = seeded.taxDocuments;
      parsed.taxAttempts = seeded.taxAttempts;
    }
    return parsed;
  }

  private write(state: StoredState): void {
    mkdirSync(dirname(this.filePath), { recursive: true });
    const temporary = `${this.filePath}.${process.pid}.tmp`;
    writeFileSync(temporary, JSON.stringify(state, null, 2), "utf8");
    renameSync(temporary, this.filePath);
  }

  reset(): void {
    this.write(initialState(this.now()));
  }

  private activeShift(state: StoredState): StoredShift | undefined {
    return state.shifts.find((shift) => shift.status === "open");
  }

  private toException(
    exception: StoredException,
    current: Date,
  ): CashierException {
    const approvedAt = exception.providerApprovedAt
      ? Date.parse(exception.providerApprovedAt)
      : undefined;
    const deadline = exception.manualProductionDeadlineAt
      ? Date.parse(exception.manualProductionDeadlineAt)
      : undefined;
    return {
      ...exception,
      message: exceptionMessage(exception.type),
      manualProductionAvailable:
        exception.status !== "resolved" &&
        deadline !== undefined &&
        current.getTime() <= deadline,
      secondsSinceApproval:
        approvedAt === undefined
          ? undefined
          : Math.max(0, Math.floor((current.getTime() - approvedAt) / 1000)),
    };
  }

  private reconciliation(state: StoredState): CashierReconciliationLine[] {
    return state.payments.map((payment) => {
      const settlement = state.settlements.find(
        (entry) => entry.paymentId === payment.id,
      );
      const status = !settlement
        ? "pending"
        : settlement.providerGrossClp !== payment.amountClp ||
            settlement.providerNetClp !==
              settlement.providerGrossClp - settlement.providerFeeClp ||
            settlement.depositedClp !== settlement.providerNetClp
          ? "difference"
          : "matched";
      return {
        paymentId: payment.id,
        orderNumber: payment.orderNumber,
        providerPaymentId: payment.providerPaymentId,
        tableName: payment.tableName,
        personLabel: payment.personLabel,
        tablioSaleClp: payment.amountClp,
        refundedClp: payment.refundedClp,
        providerGrossClp: settlement?.providerGrossClp,
        providerFeeClp: settlement?.providerFeeClp,
        providerNetClp: settlement?.providerNetClp,
        depositedClp: settlement?.depositedClp,
        depositReference: settlement?.depositReference,
        status,
        taxDocumentStatus:
          state.taxDocuments.find(
            (document) => document.paymentId === payment.id,
          )?.status ?? "pending",
        taxDocumentId: state.taxDocuments.find(
          (document) => document.paymentId === payment.id,
        )?.id,
        taxFolio: state.taxDocuments.find(
          (document) => document.paymentId === payment.id,
        )?.folio,
        taxDocumentAmountClp: state.taxDocuments.find(
          (document) => document.paymentId === payment.id,
        )?.amountClp,
        taxRepresentationUrl: state.taxDocuments.find(
          (document) => document.paymentId === payment.id,
        )?.representationUrl,
      };
    });
  }

  bootstrap(actor: CashierActor = DEFAULT_ACTOR): CashierBootstrap {
    const state = this.read();
    const current = this.now();
    const shift = this.activeShift(state);
    const shiftPayments = shift
      ? state.payments.filter((payment) => payment.sourceShiftId === shift.id)
      : [];
    const shiftRefunds = shift
      ? state.refunds.filter((refund) => refund.operationShiftId === shift.id)
      : [];
    const grossSalesClp = shiftPayments.reduce(
      (total, payment) => total + payment.amountClp,
      0,
    );
    const orderCount = shiftPayments.filter(
      (payment) => payment.orderNumber !== undefined,
    ).length;
    const pendingTax = state.taxDocuments.filter((document) =>
      ["pending", "failed"].includes(document.status),
    );
    const oldestPendingAt = pendingTax
      .map((document) => document.createdAt)
      .sort()[0];
    const recentTaxAttempts = state.taxAttempts.filter(
      (attempt) =>
        current.getTime() - Date.parse(attempt.occurredAt) <= 5 * 60 * 1000,
    );
    const failureRate =
      recentTaxAttempts.length === 0
        ? 0
        : recentTaxAttempts.filter((attempt) => attempt.outcome === "failed")
            .length / recentTaxAttempts.length;
    return {
      demo: true,
      loyalty: {
        identityLossRatePercent: 0,
        identityRecoveries: 0,
        profiles: [],
      },
      tipReport: [],
      actor,
      venue: { id: CASHIER_DEMO_VENUE_ID, name: "Bar La Esquina" },
      shift: shift
        ? {
            id: shift.id,
            version: shift.version,
            status: "open",
            openedAt: shift.openedAt,
          }
        : undefined,
      settings: SETTINGS,
      metrics: {
        grossSalesClp,
        refundsClp: shiftRefunds.reduce(
          (total, refund) => total + refund.amountClp,
          0,
        ),
        orderCount,
        averageTicketClp:
          orderCount === 0 ? 0 : Math.floor(grossSalesClp / orderCount),
        tipEarnedClp: shiftPayments.reduce(
          (total, payment) => total + payment.tipClp,
          0,
        ),
        tipRefundedOpenShiftClp: shiftRefunds.reduce(
          (total, refund) => total + refund.tipRefundedOpenShiftClp,
          0,
        ),
        localTipAdjustmentsClp: shiftRefunds.reduce(
          (total, refund) => total + refund.localTipAdjustmentClp,
          0,
        ),
        openExceptionCount: state.exceptions.filter(
          (exception) => exception.status !== "resolved",
        ).length,
      },
      tables: state.tables,
      exceptions: state.exceptions
        .filter((exception) => exception.status !== "resolved")
        .sort((a, b) => {
          const weight = { critical: 0, high: 1, normal: 2 };
          return (
            weight[a.priority] - weight[b.priority] ||
            Date.parse(a.createdAt) - Date.parse(b.createdAt)
          );
        })
        .map((exception) => this.toException(exception, current)),
      payments: state.payments.map((payment): CashierPayment => ({
        id: payment.id,
        provider: "simulated",
        method: payment.method,
        orderNumber: payment.orderNumber,
        tableName: payment.tableName,
        personLabel: payment.personLabel,
        amountClp: payment.amountClp,
        tipClp: payment.tipClp,
        refundedClp: payment.refundedClp,
        sourceShiftId: payment.sourceShiftId,
        providerApprovedAt: payment.providerApprovedAt,
        providerReceivedAt: payment.providerReceivedAt,
      })),
      reconciliation: this.reconciliation(state),
      taxOperations: {
        pendingCount: pendingTax.length,
        oldestPendingAt,
        requiresAttention:
          pendingTax.length > SETTINGS.pendingTaxAlertCount ||
          (oldestPendingAt !== undefined &&
            current.getTime() - Date.parse(oldestPendingAt) >
              SETTINGS.pendingTaxAlertAgeSeconds * 1000),
        providerStatus:
          recentTaxAttempts.length < 3
            ? "unknown"
            : failureRate >= 0.6
              ? "down"
              : failureRate >= 0.2
                ? "degraded"
                : "working",
        recentFailureRate: failureRate,
        pendingAlertCount: SETTINGS.pendingTaxAlertCount,
        pendingAlertAgeSeconds: SETTINGS.pendingTaxAlertAgeSeconds,
      },
      latestClosure: state.closures.at(-1),
      serverTime: current.toISOString(),
    };
  }

  createException(input: {
    type: CashierExceptionType;
    deduplicationKey: string;
    paymentId?: string;
    amountClp?: number;
    providerApprovedAt?: string;
    providerReceivedAt?: string;
    shiftId?: string;
  }): CashierException {
    const state = this.read();
    const existing = state.exceptions.find(
      (exception) =>
        exception.type === input.type &&
        exception.deduplicationKey === input.deduplicationKey,
    );
    if (existing) return this.toException(existing, this.now());
    const payment = state.payments.find(
      (candidate) => candidate.id === input.paymentId,
    );
    const current = this.now();
    const isLate = input.type === "approved_after_quote_expired";
    const exception: StoredException = {
      id: randomUUID(),
      deduplicationKey: input.deduplicationKey,
      type: input.type,
      status: "open",
      priority: isLate ? "critical" : "high",
      version: 0,
      amountClp: input.amountClp ?? payment?.amountClp ?? 0,
      createdAt: input.providerReceivedAt ?? current.toISOString(),
      tableName: payment?.tableName,
      personLabel: payment?.personLabel,
      paymentId: input.paymentId,
      shiftId: input.shiftId,
      providerApprovedAt: input.providerApprovedAt,
      providerReceivedAt: input.providerReceivedAt,
      manualProductionDeadlineAt:
        isLate && input.providerApprovedAt
          ? iso(
              new Date(input.providerApprovedAt),
              SETTINGS.manualProductionWindowSeconds * 1000,
            )
          : undefined,
      resolutionOptions: isLate
        ? ["refund", "produce_manually", "escalate"]
        : ["investigate", "escalate"],
    };
    state.exceptions.push(exception);
    this.write(state);
    return this.toException(exception, current);
  }

  recordLateConfirmation(input: {
    paymentId: string;
    providerApprovedAt: string;
    providerReceivedAt: string;
  }): CashierException | undefined {
    const state = this.read();
    const payment = state.payments.find(
      (candidate) => candidate.id === input.paymentId,
    );
    if (!payment) throw new CashierConflictError("Pago no encontrado.", 404);
    payment.providerApprovedAt = input.providerApprovedAt;
    payment.providerReceivedAt = input.providerReceivedAt;
    const matchingShift = state.shifts.find(
      (shift) =>
        Date.parse(shift.openedAt) <= Date.parse(input.providerApprovedAt) &&
        (!shift.closedAt ||
          Date.parse(input.providerApprovedAt) < Date.parse(shift.closedAt)),
    );
    payment.sourceShiftId = matchingShift?.id;
    this.write(state);
    if (!matchingShift) {
      return this.createException({
        type: "confirmation_without_cashier_shift",
        deduplicationKey: `unassigned:${payment.providerPaymentId}`,
        paymentId: payment.id,
        providerApprovedAt: input.providerApprovedAt,
        providerReceivedAt: input.providerReceivedAt,
      });
    }
    if (matchingShift.status === "closed") {
      return this.createException({
        type: "confirmation_after_shift_close",
        deduplicationKey: `post-close:${payment.providerPaymentId}`,
        paymentId: payment.id,
        shiftId: matchingShift.id,
        providerApprovedAt: input.providerApprovedAt,
        providerReceivedAt: input.providerReceivedAt,
      });
    }
    return undefined;
  }

  requestRefund(
    actor: CashierActor,
    input: {
      paymentId: string;
      amountClp: number;
      idempotencyKey: string;
      reason: string;
    },
  ): {
    refundId: string;
    idempotentReplay: boolean;
    bootstrap: CashierBootstrap;
  } {
    if (!actor.canRefund) {
      throw new CashierConflictError(
        "No tienes permiso para ejecutar reembolsos.",
        403,
      );
    }
    if (!input.reason.trim()) {
      throw new CashierConflictError("El motivo es obligatorio.", 400);
    }
    const state = this.read();
    const existing = state.refunds.find(
      (refund) => refund.idempotencyKey === input.idempotencyKey,
    );
    if (existing) {
      return {
        refundId: existing.id,
        idempotentReplay: true,
        bootstrap: this.bootstrap(actor),
      };
    }
    const payment = state.payments.find(
      (candidate) => candidate.id === input.paymentId,
    );
    if (!payment) throw new CashierConflictError("Pago no encontrado.", 404);
    if (
      !Number.isInteger(input.amountClp) ||
      input.amountClp <= 0 ||
      payment.refundedClp + input.amountClp > payment.amountClp
    ) {
      throw new CashierConflictError(
        "El monto supera el saldo reembolsable.",
        400,
      );
    }
    const operationShift = this.activeShift(state);
    if (!operationShift) {
      throw new CashierConflictError(
        "Abre un turno de caja antes de reembolsar.",
      );
    }
    const sourceShift = state.shifts.find(
      (shift) => shift.id === payment.sourceShiftId,
    );
    const previousTip = Math.floor(
      (payment.tipClp * payment.refundedClp) / payment.amountClp,
    );
    const cumulativeTip = Math.floor(
      (payment.tipClp * (payment.refundedClp + input.amountClp)) /
        payment.amountClp,
    );
    const tipComponent = cumulativeTip - previousTip;
    const closedSource = sourceShift?.status === "closed";
    const refund: StoredRefund = {
      id: randomUUID(),
      paymentId: payment.id,
      idempotencyKey: input.idempotencyKey,
      amountClp: input.amountClp,
      tipComponentClp: tipComponent,
      tipRefundedOpenShiftClp: closedSource ? 0 : tipComponent,
      localTipAdjustmentClp: closedSource ? tipComponent : 0,
      policy: closedSource
        ? "closed_shift_local_absorbs"
        : "open_shift_reduces_tip",
      reason: input.reason.trim(),
      requestedAt: this.now().toISOString(),
      requestedBy: actor.name,
      operationShiftId: operationShift.id,
    };
    payment.refundedClp += input.amountClp;
    state.refunds.push(refund);
    const originalTax = state.taxDocuments.find(
      (document) => document.paymentId === payment.id,
    );
    if (originalTax?.status === "issued") {
      state.taxDocuments.push({
        id: randomUUID(),
        paymentId: payment.id,
        refundId: refund.id,
        status: "issued",
        amountClp: refund.amountClp,
        folio: `NC-${Date.now()}`,
        createdAt: refund.requestedAt,
        retryCount: 0,
      });
    } else {
      const creditNoteId = randomUUID();
      state.taxDocuments.push({
        id: creditNoteId,
        paymentId: payment.id,
        refundId: refund.id,
        status: "pending",
        amountClp: refund.amountClp,
        createdAt: refund.requestedAt,
        retryCount: 0,
      });
      state.exceptions.push({
        id: randomUUID(),
        deduplicationKey: `refund:${refund.id}:credit-note-pending`,
        type: "tax_credit_note_pending",
        status: "open",
        priority: "critical",
        version: 0,
        amountClp: refund.amountClp,
        createdAt: refund.requestedAt,
        tableName: payment.tableName,
        personLabel: payment.personLabel,
        paymentId: payment.id,
        resolutionOptions: ["retry_tax_document", "escalate"],
      });
    }
    if (closedSource && tipComponent > 0 && sourceShift) {
      state.adjustments.push({
        id: randomUUID(),
        sourceShiftId: sourceShift.id,
        paymentId: payment.id,
        refundId: refund.id,
        amountClp: tipComponent,
        explanation:
          "La propina ya fue distribuida; el local absorbe este componente del reembolso.",
        occurredAt: refund.requestedAt,
      });
    }
    for (const exception of state.exceptions.filter(
      (candidate) =>
        candidate.paymentId === payment.id &&
        candidate.status !== "resolved" &&
        !candidate.type.startsWith("tax_"),
    )) {
      exception.status = "resolved";
      exception.version += 1;
      exception.resolutionReason = `Reembolso completado: ${refund.reason}`;
    }
    state.audits.push({
      id: randomUUID(),
      actorId: actor.id,
      action: "cashier.refund_completed_demo",
      targetId: refund.id,
      reason: refund.reason,
      data: {
        amountClp: refund.amountClp,
        tipComponentClp: refund.tipComponentClp,
        policy: refund.policy,
      },
      occurredAt: refund.requestedAt,
    });
    this.write(state);
    return {
      refundId: refund.id,
      idempotentReplay: false,
      bootstrap: this.bootstrap(actor),
    };
  }

  retryTaxDocument(
    actor: CashierActor,
    input: { taxDocumentId: string; reason: string },
  ): CashierBootstrap {
    if (!input.reason.trim()) {
      throw new CashierConflictError(
        "El motivo del reintento es obligatorio.",
        400,
      );
    }
    const state = this.read();
    const document = state.taxDocuments.find(
      (candidate) => candidate.id === input.taxDocumentId,
    );
    if (!document) throw new CashierConflictError("Boleta no encontrada.", 404);
    if (document.status !== "issued") {
      document.status = "issued";
      document.folio = document.folio ?? `R-${Date.now()}`;
      document.representationUrl = `/api/tax/documents/demo-retry-${document.id}`;
      document.retryCount += 1;
      state.taxAttempts.push({
        taxDocumentId: document.id,
        outcome: "issued",
        occurredAt: this.now().toISOString(),
      });
      for (const exception of state.exceptions) {
        if (
          exception.paymentId === document.paymentId &&
          exception.type.startsWith("tax_") &&
          exception.status !== "resolved"
        ) {
          exception.status = "resolved";
          exception.version += 1;
          exception.resolutionReason = input.reason.trim();
        }
      }
      state.audits.push({
        id: randomUUID(),
        actorId: actor.id,
        action: "tax_document.retry_succeeded_demo",
        targetId: document.id,
        reason: input.reason.trim(),
        data: { folio: document.folio, retryCount: document.retryCount },
        occurredAt: this.now().toISOString(),
      });
      this.write(state);
    }
    return this.bootstrap(actor);
  }

  expireManualProductionWindowForTest(): void {
    const state = this.read();
    const exception = state.exceptions.find(
      (candidate) =>
        candidate.type === "approved_after_quote_expired" &&
        candidate.status !== "resolved",
    );
    if (!exception) {
      throw new CashierConflictError("No hay aprobación tardía.", 404);
    }
    const approvedAt = iso(this.now(), -25 * 60 * 1000);
    exception.providerApprovedAt = approvedAt;
    exception.providerReceivedAt = this.now().toISOString();
    exception.manualProductionDeadlineAt = iso(
      new Date(approvedAt),
      SETTINGS.manualProductionWindowSeconds * 1000,
    );
    const payment = state.payments.find(
      (candidate) => candidate.id === exception.paymentId,
    );
    if (payment) {
      payment.providerApprovedAt = approvedAt;
      payment.providerReceivedAt = exception.providerReceivedAt;
    }
    this.write(state);
  }

  transitionException(
    actor: CashierActor,
    input: {
      exceptionId: string;
      expectedVersion: number;
      transition: "start_review" | "escalate" | "resolve_investigated";
      reason?: string;
    },
  ): CashierBootstrap {
    const state = this.read();
    const exception = state.exceptions.find(
      (candidate) => candidate.id === input.exceptionId,
    );
    if (!exception)
      throw new CashierConflictError("Excepción no encontrada.", 404);
    if (exception.version !== input.expectedVersion) {
      throw new CashierConflictError(
        "La excepción cambió. Recarga antes de decidir.",
      );
    }
    if (input.transition !== "start_review" && !input.reason?.trim()) {
      throw new CashierConflictError("El motivo es obligatorio.", 400);
    }
    exception.status =
      input.transition === "start_review"
        ? "in_review"
        : input.transition === "escalate"
          ? "escalated"
          : "resolved";
    exception.version += 1;
    if (exception.status === "resolved") {
      exception.resolutionReason = input.reason!.trim();
    }
    state.audits.push({
      id: randomUUID(),
      actorId: actor.id,
      action: `cashier.exception_${input.transition}`,
      targetId: exception.id,
      reason: input.reason?.trim() || "Inicio de revisión",
      data: { status: exception.status, version: exception.version },
      occurredAt: this.now().toISOString(),
    });
    this.write(state);
    return this.bootstrap(actor);
  }

  produceManually(
    actor: CashierActor,
    input: {
      exceptionId: string;
      expectedVersion: number;
      reason: string;
    },
  ): CashierBootstrap {
    if (!input.reason.trim()) {
      throw new CashierConflictError("El motivo es obligatorio.", 400);
    }
    const state = this.read();
    const exception = state.exceptions.find(
      (candidate) => candidate.id === input.exceptionId,
    );
    if (!exception)
      throw new CashierConflictError("Excepción no encontrada.", 404);
    if (exception.version !== input.expectedVersion) {
      throw new CashierConflictError(
        "La excepción cambió. Recarga antes de decidir.",
      );
    }
    if (state.manuallyProducedExceptionIds.includes(exception.id)) {
      return this.bootstrap(actor);
    }
    if (
      exception.type !== "approved_after_quote_expired" ||
      !exception.manualProductionDeadlineAt ||
      this.now().getTime() > Date.parse(exception.manualProductionDeadlineAt)
    ) {
      throw new CashierConflictError(
        "La ventana para producir venció. Sólo puedes reembolsar o escalar.",
      );
    }
    const payment = state.payments.find(
      (candidate) => candidate.id === exception.paymentId,
    );
    if (!payment) throw new CashierConflictError("Pago no encontrado.", 404);
    payment.orderNumber = 1100 + state.manuallyProducedExceptionIds.length;
    exception.status = "resolved";
    exception.resolutionReason = input.reason.trim();
    exception.version += 1;
    state.manuallyProducedExceptionIds.push(exception.id);
    state.audits.push({
      id: randomUUID(),
      actorId: actor.id,
      action: "cashier.late_approval_produced_manually",
      targetId: exception.id,
      reason: input.reason.trim(),
      data: {
        paymentId: payment.id,
        orderNumber: payment.orderNumber,
        atomicEffects: ["order", "tickets", "outbox"],
      },
      occurredAt: this.now().toISOString(),
    });
    this.write(state);
    return this.bootstrap(actor);
  }

  closeShift(
    actor: CashierActor,
    input: {
      expectedVersion: number;
      cashDeclaredClp: number;
      exceptionOverrideReason?: string;
    },
  ): { closure: CashierClosure; bootstrap: CashierBootstrap } {
    if (!actor.canClose) {
      throw new CashierConflictError(
        "No tienes permiso para cerrar el turno.",
        403,
      );
    }
    const state = this.read();
    const shift = this.activeShift(state);
    if (!shift) throw new CashierConflictError("No hay un turno abierto.");
    if (shift.version !== input.expectedVersion) {
      throw new CashierConflictError(
        "El turno cambió. Recarga antes de cerrar.",
      );
    }
    const openExceptions = state.exceptions.filter(
      (exception) => exception.status !== "resolved",
    );
    if (openExceptions.length > 0 && !input.exceptionOverrideReason?.trim()) {
      throw new CashierConflictError(
        `Hay ${openExceptions.length} excepciones abiertas. Justifica el cierre o resuélvelas.`,
      );
    }
    const payments = state.payments.filter(
      (payment) => payment.sourceShiftId === shift.id,
    );
    const refunds = state.refunds.filter(
      (refund) => refund.operationShiftId === shift.id,
    );
    const settlements = state.settlements.filter((settlement) =>
      payments.some((payment) => payment.id === settlement.paymentId),
    );
    const gross = payments.reduce(
      (total, payment) => total + payment.amountClp,
      0,
    );
    const refundTotal = refunds.reduce(
      (total, refund) => total + refund.amountClp,
      0,
    );
    const fees = settlements.reduce(
      (total, settlement) => total + settlement.providerFeeClp,
      0,
    );
    const adjustments = state.adjustments.filter(
      (adjustment) => !adjustment.closureId,
    );
    const tipsByWaiter = new Map<
      string,
      { earnedClp: number; refundedWhileOpenClp: number }
    >();
    for (const payment of payments) {
      const waiter = payment.waiterName ?? "Sin asignar";
      const item = tipsByWaiter.get(waiter) ?? {
        earnedClp: 0,
        refundedWhileOpenClp: 0,
      };
      item.earnedClp += payment.tipClp;
      item.refundedWhileOpenClp += refunds
        .filter((refund) => refund.paymentId === payment.id)
        .reduce((total, refund) => total + refund.tipRefundedOpenShiftClp, 0);
      tipsByWaiter.set(waiter, item);
    }
    const closureId = randomUUID();
    const closure: CashierClosure = {
      id: closureId,
      shiftId: shift.id,
      closedAt: this.now().toISOString(),
      closedBy: actor.name,
      grossSalesClp: gross,
      refundsClp: refundTotal,
      chargebacksClp: 0,
      providerFeesClp: fees,
      expectedPayoutClp: gross - refundTotal - fees,
      digitalProcessedClp: gross,
      cashDeclaredClp: Math.max(0, Math.trunc(input.cashDeclaredClp)),
      tipEarnedClp: payments.reduce(
        (total, payment) => total + payment.tipClp,
        0,
      ),
      tipRefundedOpenShiftClp: refunds.reduce(
        (total, refund) => total + refund.tipRefundedOpenShiftClp,
        0,
      ),
      localTipAdjustmentsClp: adjustments.reduce(
        (total, adjustment) => total + adjustment.amountClp,
        0,
      ),
      orderCount: payments.filter(
        (payment) => payment.orderNumber !== undefined,
      ).length,
      averageTicketClp:
        payments.filter((payment) => payment.orderNumber !== undefined)
          .length === 0
          ? 0
          : Math.floor(
              gross /
                payments.filter((payment) => payment.orderNumber !== undefined)
                  .length,
            ),
      openExceptionCount: openExceptions.length,
      exceptionOverrideReason: input.exceptionOverrideReason?.trim(),
      paymentMethods: [
        {
          method: "Tarjeta demo",
          grossClp: gross,
          refundsClp: refundTotal,
          providerFeesClp: fees,
          expectedPayoutClp: gross - refundTotal - fees,
          transactionCount: payments.length,
        },
      ],
      tipsByWaiter: [...tipsByWaiter.entries()].map(
        ([waiterName, amounts]) => ({
          waiterName,
          ...amounts,
          distributableClp: amounts.earnedClp - amounts.refundedWhileOpenClp,
        }),
      ),
      adjustments: adjustments.map((adjustment) => ({
        id: adjustment.id,
        amountClp: adjustment.amountClp,
        explanation: adjustment.explanation,
      })),
    };
    state.closures.push(closure);
    for (const adjustment of adjustments) adjustment.closureId = closureId;
    shift.status = "closed";
    shift.version += 1;
    shift.closedAt = closure.closedAt;
    shift.closedBy = actor.name;
    shift.closeOverrideReason = closure.exceptionOverrideReason;
    state.audits.push({
      id: randomUUID(),
      actorId: actor.id,
      action:
        openExceptions.length > 0
          ? "cashier.shift_closed_with_open_exceptions"
          : "cashier.shift_closed",
      targetId: closure.id,
      reason:
        closure.exceptionOverrideReason ??
        "Cierre regular sin excepciones abiertas",
      data: {
        grossSalesClp: closure.grossSalesClp,
        refundsClp: closure.refundsClp,
        providerFeesClp: closure.providerFeesClp,
        expectedPayoutClp: closure.expectedPayoutClp,
      },
      occurredAt: closure.closedAt,
    });
    this.write(state);
    return { closure, bootstrap: this.bootstrap(actor) };
  }

  exportLatestClosureCsv(): string {
    const state = this.read();
    const closure = state.closures.at(-1);
    if (!closure) {
      throw new CashierConflictError("Todavía no existe un cierre.", 404);
    }
    const rows: Array<Array<string | number>> = [
      ["campo", "monto_clp"],
      ["venta_bruta", closure.grossSalesClp],
      ["reembolsos", closure.refundsClp],
      ["contracargos", closure.chargebacksClp],
      ["comision_proveedor", closure.providerFeesClp],
      ["abono_esperado", closure.expectedPayoutClp],
      ["propinas", closure.tipEarnedClp],
      ["ajuste_propina_a_cargo_local", closure.localTipAdjustmentsClp],
    ];
    return rows.map((row) => row.map(csvCell).join(",")).join("\n") + "\n";
  }

  exportExceptionsCsv(): string {
    const state = this.read();
    const rows: Array<Array<string | number>> = [
      [
        "id",
        "tipo",
        "estado",
        "monto_clp",
        "hora_proveedor",
        "hora_recepcion",
        "motivo_resolucion",
      ],
      ...state.exceptions.map((exception) => [
        exception.id,
        exception.type,
        exception.status,
        exception.amountClp,
        exception.providerApprovedAt ?? "",
        exception.providerReceivedAt ?? "",
        exception.resolutionReason ?? "",
      ]),
    ];
    return rows.map((row) => row.map(csvCell).join(",")).join("\n") + "\n";
  }

  getAuditForTest(): readonly StoredAudit[] {
    return this.read().audits;
  }

  getRefundsForTest(): readonly StoredRefund[] {
    return this.read().refunds;
  }

  getAdjustmentsForTest(): readonly StoredAdjustment[] {
    return this.read().adjustments;
  }
}
