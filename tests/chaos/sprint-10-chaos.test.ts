import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  PaymentEventProcessor,
  PrintSpoolWorker,
  type ClaimedPrintJob,
  type PrintReceipt,
  type PrintSpoolRepository,
  type PrinterPort,
} from "../../packages/application/src/index";
import {
  InMemoryPaymentEventStore,
  SimulatedPaymentGateway,
} from "../../packages/payments-simulated/src/index";
import { SimulatedTaxDocumentProvider } from "../../packages/tax-simulated/src/index";
import { CashierDemoRepository } from "../../apps/web/lib/cashier-demo-repository";
import { KdsDemoRepository } from "../../apps/web/lib/kds-demo-repository";

const temporaryDirectories: string[] = [];
const fixedNow = () => new Date("2026-07-29T02:00:00.000Z");

function temporaryFile(name: string): string {
  const directory = mkdtempSync(join(tmpdir(), "tablio-s10-chaos-"));
  temporaryDirectories.push(directory);
  return join(directory, name);
}

function appendPaidTicket(store: KdsDemoRepository, index: number): void {
  store.appendPaidOrder({
    orderId: `order-${index}`,
    orderNumber: 1_000 + index,
    amountClp: 4_500,
    tableName: `Mesa ${(index % 60) + 1}`,
    alias: `Zorro Azul ${index}`,
    confirmedAt: new Date(Date.now() + index).toISOString(),
    tickets: [
      {
        id: `ticket-${index}`,
        stationId: "barra",
        stationName: "Barra",
        items: [
          {
            id: `item-${index}`,
            name: "Lager de la casa",
            quantity: 1,
          },
        ],
      },
    ],
  });
}

class SaturatedSpool implements PrintSpoolRepository {
  readonly jobs = Array.from({ length: 96 }, (_, index) => ({
    document: {
      printJobId: `print-${index}`,
      tenantId: "tenant-a",
      ticketId: `ticket-${index}`,
      stationId: "barra",
      idempotencyKey: `ticket:${index}:initial`,
      payload: { paid: true },
    },
    attemptNumber: 0,
    maxAttempts: 8,
    ready: true,
    claimed: false,
    printed: false,
    deadLetter: false,
  }));

  async claimNext(): Promise<ClaimedPrintJob | undefined> {
    const job = this.jobs.find(
      (candidate) =>
        candidate.ready && !candidate.claimed && !candidate.printed,
    );
    if (!job) return undefined;
    job.claimed = true;
    job.attemptNumber += 1;
    return {
      document: job.document,
      attemptNumber: job.attemptNumber,
      maxAttempts: job.maxAttempts,
    };
  }

  async markPrinted(input: {
    printJobId: string;
    receipt: PrintReceipt;
  }): Promise<void> {
    const job = this.jobs.find(
      (candidate) => candidate.document.printJobId === input.printJobId,
    )!;
    job.printed = true;
    job.claimed = false;
  }

  async markFailed(input: {
    printJobId: string;
    deadLetter: boolean;
  }): Promise<void> {
    const job = this.jobs.find(
      (candidate) => candidate.document.printJobId === input.printJobId,
    )!;
    job.claimed = false;
    job.ready = false;
    job.deadLetter = input.deadLetter;
  }

  makeRetriesEligible(): void {
    for (const job of this.jobs) {
      if (!job.printed && !job.deadLetter) job.ready = true;
    }
  }
}

const receiptInput = (index: number) => ({
  tenantId: "tenant-a",
  providerAccountId: "dte-a",
  idempotencyKey: `order:${index}:receipt`,
  saleReference: `order-${index}`,
  issuer: {
    rut: "76.000.000-0",
    legalName: "Bar Demo SpA",
    businessActivity: "Restaurante",
    address: "Calle Demo 123",
    commune: "Santiago",
  },
  amount: { amount: 4_500, currency: "CLP" as const },
  lines: [
    {
      description: "Consumo",
      quantity: 1,
      unitAmount: { amount: 4_500, currency: "CLP" as const },
      taxAmount: { amount: 0, currency: "CLP" as const },
    },
  ],
});

afterEach(() => {
  vi.restoreAllMocks();
  while (temporaryDirectories.length > 0) {
    rmSync(temporaryDirectories.pop()!, { recursive: true, force: true });
  }
});

describe("Sprint 10 · caos sin pérdida ni duplicación", () => {
  it("recupera 96 pedidos pagados tras caída de red, KDS y servidor", () => {
    // Intenta hacer desaparecer pedidos mientras la tablet o el proceso están
    // caídos. Si falla, una venta pagada podría no llegar nunca a la barra.
    const path = temporaryFile("kds-state.json");
    const disconnectedProcess = new KdsDemoRepository(path);
    for (let index = 0; index < 96; index += 1) {
      appendPaidTicket(disconnectedProcess, index);
      appendPaidTicket(disconnectedProcess, index);
    }
    expect(disconnectedProcess.bootstrap("all")).toMatchObject({
      tickets: expect.arrayContaining([
        expect.objectContaining({ paid: true }),
      ]),
      latency: { noKdsConnectedCount: 96 },
    });

    const restartedProcess = new KdsDemoRepository(path);
    expect(restartedProcess.bootstrap("all").tickets).toHaveLength(96);
    expect(restartedProcess.bootstrap("all").printJobs).toHaveLength(96);
  });

  it("tolera proveedor lento y 96 confirmaciones duplicadas/fuera de orden", async () => {
    // Intenta confirmar desde el navegador, duplicar efectos o degradar un
    // pago aprobado. Si falla, aparecerían pedidos dobles o falsos rechazos.
    const scope = {
      tenantId: "tenant-a",
      merchantAccountId: "merchant-a",
    };
    const gateway = new SimulatedPaymentGateway(
      "sprint-ten-chaos-secret",
      fixedNow,
    );
    const store = new InMemoryPaymentEventStore();
    const processor = new PaymentEventProcessor(gateway, store, fixedNow);
    const attempt = await gateway.createPaymentAttempt({
      ...scope,
      amount: { amount: 18_900, currency: "CLP" },
      checkoutQuoteId: "quote-chaos",
      idempotencyKey: "payment-chaos",
      returnUrl: "/retorno-del-navegador",
    });

    expect(store.outbox).toHaveLength(0);
    expect(
      await gateway.getPaymentStatus({
        ...scope,
        providerPaymentId: attempt.providerPaymentId,
      }),
    ).toMatchObject({ status: "pending" });

    gateway.setPaymentOutcome(scope, attempt.providerPaymentId, "confirmed");
    const confirmed = gateway.createSignedWebhook({
      providerPaymentId: attempt.providerPaymentId,
      eventKind: "payment.confirmed",
      eventId: "same-confirmation-96-times",
    });
    await Promise.all(
      Array.from({ length: 96 }, () =>
        processor.handle(scope, confirmed.envelope),
      ),
    );
    const olderPending = gateway.createSignedWebhook({
      providerPaymentId: attempt.providerPaymentId,
      eventKind: "payment.pending",
      eventId: "older-pending-event",
      occurredAt: "2026-07-29T01:00:00.000Z",
    });
    await processor.handle(scope, olderPending.envelope);

    expect(store.providerEvents).toHaveLength(2);
    expect(store.outbox).toHaveLength(1);
    expect(store.outbox[0]?.topic).toBe("payment.confirmed");
  });

  it("conserva 96 impresiones saturadas y las recupera al volver la impresora", async () => {
    // Intenta perder el spool con la impresora apagada o sin papel. Si falla,
    // una comanda pagada desaparecería después del primer intento.
    const spool = new SaturatedSpool();
    const offlinePrinter: PrinterPort = {
      adapterType: "chaos-offline",
      print: vi.fn().mockRejectedValue(new Error("sin papel")),
    };
    const failingWorker = new PrintSpoolWorker(
      spool,
      offlinePrinter,
      () => 0.5,
    );
    for (let index = 0; index < 96; index += 1) {
      expect((await failingWorker.runOnce("worker-down")).outcome).toBe(
        "retry",
      );
    }
    expect(spool.jobs.filter((job) => job.printed)).toHaveLength(0);
    expect(spool.jobs.filter((job) => job.deadLetter)).toHaveLength(0);

    spool.makeRetriesEligible();
    const recoveredPrinter: PrinterPort = {
      adapterType: "chaos-recovered",
      print: vi.fn(async (document) => ({
        providerReceiptId: `receipt:${document.idempotencyKey}`,
        printedAt: fixedNow().toISOString(),
      })),
    };
    const restartedWorker = new PrintSpoolWorker(spool, recoveredPrinter);
    for (let index = 0; index < 96; index += 1) {
      expect((await restartedWorker.runOnce("worker-restarted")).outcome).toBe(
        "printed",
      );
    }
    expect(spool.jobs.filter((job) => job.printed)).toHaveLength(96);
    expect(
      new Set(spool.jobs.map((job) => job.document.idempotencyKey)).size,
    ).toBe(96);
  });

  it("recupera una caída masiva DTE sin duplicar las 24 boletas", async () => {
    // Intenta duplicar documentos al volver el proveedor. Si falla, una venta
    // podría recibir dos folios después de la caída del viernes.
    const provider = new SimulatedTaxDocumentProvider(fixedNow);
    const failedDocuments = [];
    for (let index = 0; index < 24; index += 1) {
      provider.enqueueBehavior({ outcome: "failure" });
      await expect(provider.issueReceipt(receiptInput(index))).rejects.toThrow(
        "Simulated DTE provider failure",
      );
      failedDocuments.push(await provider.issueReceipt(receiptInput(index)));
    }
    expect(provider.countDocuments()).toBe(24);

    for (const [index, document] of failedDocuments.entries()) {
      const recovered = await provider.retryDocument({
        tenantId: "tenant-a",
        providerAccountId: "dte-a",
        providerDocumentId: document.providerDocumentId,
        idempotencyKey: `order:${index}:receipt:retry`,
      });
      expect(recovered.providerDocumentId).toBe(document.providerDocumentId);
      expect(recovered.status).toBe("issued");
    }
    expect(provider.countDocuments()).toBe(24);
  });

  it("cierra turno con pago tardío y reembolso parcial auditados", () => {
    // Intenta perder un pago que entra al cerrar o reescribir la propina
    // durante producción. Si falla, el cierre no explicaría cada peso.
    const repository = new CashierDemoRepository(
      temporaryFile("cashier-state.json"),
      fixedNow,
    );
    repository.reset();
    const cashier = {
      id: "cashier-chaos",
      name: "Valentina",
      canRefund: true,
      canClose: true,
    };
    repository.requestRefund(cashier, {
      paymentId: "payment-mesa-8-a",
      amountClp: 5_000,
      idempotencyKey: "refund-during-production",
      reason: "Ítem no producido",
    });
    const late = repository.recordLateConfirmation({
      paymentId: "payment-previous-shift",
      providerApprovedAt: "2026-07-28T17:00:00.000Z",
      providerReceivedAt: fixedNow().toISOString(),
    });
    const snapshot = repository.bootstrap(cashier);
    const closed = repository.closeShift(cashier, {
      expectedVersion: snapshot.shift!.version,
      cashDeclaredClp: 0,
      exceptionOverrideReason: "Excepciones identificadas y escaladas",
    });

    expect(late?.shiftId).toBe("cashier-shift-previous");
    expect(repository.getRefundsForTest()).toHaveLength(1);
    expect(closed.closure.refundsClp).toBeGreaterThanOrEqual(5_000);
    expect(closed.closure.expectedPayoutClp).toBe(
      closed.closure.grossSalesClp -
        closed.closure.refundsClp -
        closed.closure.chargebacksClp -
        closed.closure.providerFeesClp,
    );
  });
});
