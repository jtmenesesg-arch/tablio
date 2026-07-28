import { describe, expect, it, vi } from "vitest";
import type {
  ClaimedPrintJob,
  PrinterPort,
  PrintSpoolRepository,
} from "./printer-port";
import { PrintSpoolWorker } from "./print-spool-worker";

const job: ClaimedPrintJob = {
  document: {
    printJobId: "print-1",
    tenantId: "tenant-1",
    ticketId: "ticket-1",
    stationId: "barra",
    idempotencyKey: "ticket:ticket-1:initial-print",
    payload: { paid: true },
  },
  attemptNumber: 1,
  maxAttempts: 8,
};

function repositoryFor(claimed: ClaimedPrintJob): PrintSpoolRepository {
  return {
    claimNext: vi.fn().mockResolvedValue(claimed),
    markPrinted: vi.fn().mockResolvedValue(undefined),
    markFailed: vi.fn().mockResolvedValue(undefined),
  };
}

describe("PrintSpoolWorker", () => {
  it("conserva la misma clave al entregar el trabajo al adaptador", async () => {
    // Intenta romper la deduplicación física. Si falla, un reintento podría
    // imprimir dos comandas distintas para un solo trabajo durable.
    const repository = repositoryFor(job);
    const printer: PrinterPort = {
      adapterType: "stub",
      print: vi.fn().mockResolvedValue({
        providerReceiptId: "stub:receipt-1",
        printedAt: "2026-07-28T20:00:00.000Z",
      }),
    };
    const result = await new PrintSpoolWorker(repository, printer).runOnce(
      "worker-1",
      new Date("2026-07-28T20:00:00.000Z"),
    );
    expect(result).toEqual({ outcome: "printed", printJobId: "print-1" });
    expect(printer.print).toHaveBeenCalledWith(
      expect.objectContaining({
        idempotencyKey: "ticket:ticket-1:initial-print",
      }),
    );
    expect(repository.markPrinted).toHaveBeenCalledOnce();
  });

  it("reintenta con backoff y jitter sin perder el trabajo", async () => {
    // Intenta romper la recuperación ante impresora apagada. Si falla, la
    // comanda podría desaparecer del spool después del primer error.
    const repository = repositoryFor(job);
    const printer: PrinterPort = {
      adapterType: "stub",
      print: vi.fn().mockRejectedValue(new Error("printer offline")),
    };
    const now = new Date("2026-07-28T20:00:00.000Z");
    const result = await new PrintSpoolWorker(
      repository,
      printer,
      () => 0.5,
    ).runOnce("worker-1", now);
    expect(result).toEqual({
      outcome: "retry",
      printJobId: "print-1",
      retryAt: new Date("2026-07-28T20:00:02.500Z"),
    });
    expect(repository.markFailed).toHaveBeenCalledWith(
      expect.objectContaining({
        deadLetter: false,
        error: "printer offline",
      }),
    );
  });

  it("envía a DLQ al agotar intentos", async () => {
    // Intenta crear un bucle infinito de impresión. Si falla, una impresora
    // dañada podría consumir recursos y ocultar el trabajo que exige revisión.
    const repository = repositoryFor({
      ...job,
      attemptNumber: 8,
    });
    const printer: PrinterPort = {
      adapterType: "stub",
      print: vi.fn().mockRejectedValue(new Error("paper jam")),
    };
    const result = await new PrintSpoolWorker(repository, printer).runOnce(
      "worker-1",
    );
    expect(result).toEqual({
      outcome: "dead_letter",
      printJobId: "print-1",
    });
    expect(repository.markFailed).toHaveBeenCalledWith(
      expect.objectContaining({ deadLetter: true }),
    );
  });
});
