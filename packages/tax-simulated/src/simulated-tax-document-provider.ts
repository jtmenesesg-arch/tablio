import { randomUUID } from "node:crypto";
import type {
  IssueCreditNoteInput,
  IssueReceiptInput,
  TaxDocument,
  TaxDocumentProvider,
  TaxDocumentRepresentation,
  TaxProviderCapabilities,
  TaxProviderScope,
} from "@tablio/application";

export type SimulatedTaxBehavior =
  | Readonly<{ outcome: "success" }>
  | Readonly<{ outcome: "failure"; message?: string }>
  | Readonly<{ outcome: "slow"; delayMs: number }>
  | Readonly<{ outcome: "duplicate_response" }>;

function assertClp(amount: { amount: number; currency: "CLP" }): void {
  if (!Number.isSafeInteger(amount.amount) || amount.amount <= 0) {
    throw new Error("DTE amount must be a positive integer in CLP");
  }
}

export class SimulatedTaxDocumentProvider implements TaxDocumentProvider {
  readonly name = "Tablio DTE Simulado";
  readonly mode = "demo" as const;
  readonly capabilities: TaxProviderCapabilities = {
    electronicReceipts: true,
    creditNotes: true,
    statusLookup: true,
    representationUrl: true,
    providerIdempotency: true,
  };

  private readonly documents = new Map<string, TaxDocument>();
  private readonly idempotency = new Map<string, string>();
  private readonly behaviors: SimulatedTaxBehavior[] = [];
  private folio = 10_000;

  constructor(private readonly now: () => Date = () => new Date()) {}

  enqueueBehavior(behavior: SimulatedTaxBehavior): void {
    this.behaviors.push(behavior);
  }

  async issueReceipt(input: IssueReceiptInput): Promise<TaxDocument> {
    assertClp(input.amount);
    return this.issue("receipt", input, undefined);
  }

  async issueCreditNote(input: IssueCreditNoteInput): Promise<TaxDocument> {
    assertClp(input.amount);
    const original = this.scopedDocument({
      tenantId: input.tenantId,
      providerAccountId: input.providerAccountId,
      providerDocumentId: input.originalProviderDocumentId,
    });
    if (original.kind !== "receipt" || original.status !== "issued") {
      throw new Error("Original receipt must be issued before its credit note");
    }
    if (input.amount.amount > original.amount.amount) {
      throw new Error("Credit note cannot exceed the original receipt");
    }
    return this.issue("credit_note", input, input.originalProviderDocumentId);
  }

  async getDocumentStatus(
    input: TaxProviderScope & { providerDocumentId: string },
  ): Promise<TaxDocument> {
    return this.scopedDocument(input);
  }

  async getRepresentation(
    input: TaxProviderScope & { providerDocumentId: string },
  ): Promise<TaxDocumentRepresentation> {
    const document = this.scopedDocument(input);
    if (document.status !== "issued" || !document.representationUrl) {
      throw new Error("Document representation is not available");
    }
    return {
      providerDocumentId: document.providerDocumentId,
      contentType: "text/html",
      url: document.representationUrl,
    };
  }

  async retryDocument(
    input: TaxProviderScope & {
      providerDocumentId: string;
      idempotencyKey: string;
    },
  ): Promise<TaxDocument> {
    const existing = this.scopedDocument(input);
    const replay = this.idempotency.get(this.key(input, input.idempotencyKey));
    if (replay)
      return this.scopedDocument({ ...input, providerDocumentId: replay });
    if (existing.status !== "failed") return existing;
    const behavior = await this.takeBehavior();
    if (behavior.outcome === "failure") {
      throw new Error(behavior.message ?? "Simulated DTE provider failure");
    }
    const issued = this.asIssued(existing);
    this.documents.set(issued.providerDocumentId, issued);
    this.idempotency.set(
      this.key(input, input.idempotencyKey),
      issued.providerDocumentId,
    );
    return issued;
  }

  countDocuments(): number {
    return this.documents.size;
  }

  private async issue(
    kind: "receipt" | "credit_note",
    input: IssueReceiptInput | IssueCreditNoteInput,
    originalProviderDocumentId: string | undefined,
  ): Promise<TaxDocument> {
    const scopedKey = this.key(input, input.idempotencyKey);
    const replay = this.idempotency.get(scopedKey);
    if (replay)
      return this.scopedDocument({ ...input, providerDocumentId: replay });

    const behavior = await this.takeBehavior();
    if (behavior.outcome === "failure") {
      const failed = this.makeDocument(
        kind,
        input,
        originalProviderDocumentId,
        "failed",
      );
      this.documents.set(failed.providerDocumentId, failed);
      this.idempotency.set(scopedKey, failed.providerDocumentId);
      throw new Error(behavior.message ?? "Simulated DTE provider failure");
    }

    const issued = this.asIssued(
      this.makeDocument(kind, input, originalProviderDocumentId, "processing"),
    );
    this.documents.set(issued.providerDocumentId, issued);
    this.idempotency.set(scopedKey, issued.providerDocumentId);
    return issued;
  }

  private makeDocument(
    kind: "receipt" | "credit_note",
    input: IssueReceiptInput | IssueCreditNoteInput,
    originalProviderDocumentId: string | undefined,
    status: "processing" | "failed",
  ): TaxDocument {
    const id = `demo-dte:${randomUUID()}`;
    return {
      tenantId: input.tenantId,
      providerAccountId: input.providerAccountId,
      providerDocumentId: id,
      kind,
      status,
      amount: input.amount,
      originalProviderDocumentId,
      errorCode: status === "failed" ? "DEMO_PROVIDER_DOWN" : undefined,
      errorMessage:
        status === "failed" ? "Proveedor DTE simulado caído" : undefined,
      occurredAt: this.now().toISOString(),
    };
  }

  private asIssued(document: TaxDocument): TaxDocument {
    const folio = String(++this.folio);
    return {
      ...document,
      status: "issued",
      folio,
      representationUrl: `/api/tax/documents/${encodeURIComponent(document.providerDocumentId)}`,
      stamp: `TED-DEMO-${folio}`,
      errorCode: undefined,
      errorMessage: undefined,
      occurredAt: this.now().toISOString(),
    };
  }

  private async takeBehavior(): Promise<SimulatedTaxBehavior> {
    const behavior = this.behaviors.shift() ?? { outcome: "success" };
    if (behavior.outcome === "slow") {
      await new Promise((resolve) => setTimeout(resolve, behavior.delayMs));
    }
    return behavior;
  }

  private key(scope: TaxProviderScope, idempotencyKey: string): string {
    return `${scope.tenantId}:${scope.providerAccountId}:${idempotencyKey}`;
  }

  private scopedDocument(
    input: TaxProviderScope & { providerDocumentId: string },
  ): TaxDocument {
    const document = this.documents.get(input.providerDocumentId);
    if (
      !document ||
      document.tenantId !== input.tenantId ||
      document.providerAccountId !== input.providerAccountId
    ) {
      throw new Error("Tax document not found for tenant/provider account");
    }
    return document;
  }
}
