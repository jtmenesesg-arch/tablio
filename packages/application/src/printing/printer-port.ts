export type PrintDocument = Readonly<{
  printJobId: string;
  tenantId: string;
  ticketId: string;
  stationId: string;
  idempotencyKey: string;
  payload: Readonly<Record<string, unknown>>;
}>;

export type PrintReceipt = Readonly<{
  providerReceiptId: string;
  printedAt: string;
}>;

/**
 * Puerto reemplazable para llegar a una impresora física.
 * El adaptador puede ser un agente local, un servicio o hardware cloud.
 */
export interface PrinterPort {
  readonly adapterType: string;
  print(document: PrintDocument): Promise<PrintReceipt>;
}

export type ClaimedPrintJob = Readonly<{
  document: PrintDocument;
  attemptNumber: number;
  maxAttempts: number;
}>;

export interface PrintSpoolRepository {
  claimNext(workerId: string, now: Date): Promise<ClaimedPrintJob | undefined>;
  markPrinted(input: {
    printJobId: string;
    attemptNumber: number;
    adapterType: string;
    receipt: PrintReceipt;
  }): Promise<void>;
  markFailed(input: {
    printJobId: string;
    attemptNumber: number;
    adapterType: string;
    error: string;
    retryAt?: Date;
    deadLetter: boolean;
  }): Promise<void>;
}

export class StubPrinterAdapter implements PrinterPort {
  readonly adapterType = "stub";

  async print(document: PrintDocument): Promise<PrintReceipt> {
    return {
      providerReceiptId: `stub:${document.idempotencyKey}`,
      printedAt: new Date().toISOString(),
    };
  }
}
