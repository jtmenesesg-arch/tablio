import type {
  IssueCreditNoteInput,
  IssueReceiptInput,
  TaxDocument,
  TaxDocumentProvider,
} from "./tax-document-provider";

export type TaxDocumentCommand =
  | Readonly<{ kind: "issue_receipt"; input: IssueReceiptInput }>
  | Readonly<{ kind: "issue_credit_note"; input: IssueCreditNoteInput }>
  | Readonly<{
      kind: "retry";
      input: {
        tenantId: string;
        providerAccountId: string;
        providerDocumentId: string;
        idempotencyKey: string;
      };
    }>;

export interface TaxDocumentLedger {
  findByIdempotencyKey(input: {
    tenantId: string;
    idempotencyKey: string;
  }): Promise<TaxDocument | undefined>;
  save(document: TaxDocument, idempotencyKey: string): Promise<void>;
  recordFailure(command: TaxDocumentCommand, error: Error): Promise<void>;
}

/**
 * Consumidor durable del puerto tributario. La clave estable del outbox llega
 * también al proveedor; así un crash después de emitir y antes del ACK no crea
 * una segunda boleta o nota de crédito.
 */
export class TaxDocumentHandler {
  constructor(
    private readonly provider: TaxDocumentProvider,
    private readonly ledger: TaxDocumentLedger,
  ) {}

  async handle(command: TaxDocumentCommand): Promise<TaxDocument> {
    const existing = await this.ledger.findByIdempotencyKey({
      tenantId: command.input.tenantId,
      idempotencyKey: command.input.idempotencyKey,
    });
    if (existing) return existing;

    try {
      const document =
        command.kind === "issue_receipt"
          ? await this.provider.issueReceipt(command.input)
          : command.kind === "issue_credit_note"
            ? await this.provider.issueCreditNote(command.input)
            : await this.provider.retryDocument(command.input);
      await this.ledger.save(document, command.input.idempotencyKey);
      return document;
    } catch (cause) {
      const error =
        cause instanceof Error
          ? cause
          : new Error("Unknown DTE provider error");
      await this.ledger.recordFailure(command, error);
      throw error;
    }
  }
}
