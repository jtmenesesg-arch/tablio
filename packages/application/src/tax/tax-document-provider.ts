export type TaxDocumentStatus =
  "pending" | "processing" | "issued" | "failed" | "rejected";

export type TaxDocumentKind = "receipt" | "credit_note";

export type TaxMoney = Readonly<{
  amount: number;
  currency: "CLP";
}>;

export type TaxProviderScope = Readonly<{
  tenantId: string;
  providerAccountId: string;
}>;

export type TaxIssuer = Readonly<{
  rut: string;
  legalName: string;
  businessActivity: string;
  address: string;
  commune: string;
  branchCode?: string;
}>;

export type TaxLineItem = Readonly<{
  description: string;
  quantity: number;
  unitAmount: TaxMoney;
  taxAmount: TaxMoney;
}>;

export type TaxDocument = TaxProviderScope &
  Readonly<{
    providerDocumentId: string;
    kind: TaxDocumentKind;
    status: TaxDocumentStatus;
    amount: TaxMoney;
    folio?: string;
    representationUrl?: string;
    stamp?: string;
    originalProviderDocumentId?: string;
    errorCode?: string;
    errorMessage?: string;
    occurredAt: string;
  }>;

export type TaxDocumentRepresentation = Readonly<{
  providerDocumentId: string;
  contentType: string;
  url: string;
  expiresAt?: string;
}>;

export type TaxProviderCapabilities = Readonly<{
  electronicReceipts: boolean;
  creditNotes: boolean;
  statusLookup: boolean;
  representationUrl: boolean;
  providerIdempotency: boolean;
}>;

export type IssueReceiptInput = TaxProviderScope &
  Readonly<{
    idempotencyKey: string;
    saleReference: string;
    issuer: TaxIssuer;
    amount: TaxMoney;
    lines: readonly TaxLineItem[];
    customerEmail?: string;
  }>;

export type IssueCreditNoteInput = TaxProviderScope &
  Readonly<{
    idempotencyKey: string;
    refundReference: string;
    originalProviderDocumentId: string;
    amount: TaxMoney;
    reason: string;
  }>;

export interface TaxDocumentProvider {
  readonly name: string;
  readonly mode: "demo" | "test" | "production";
  readonly capabilities: TaxProviderCapabilities;

  issueReceipt(input: IssueReceiptInput): Promise<TaxDocument>;

  getDocumentStatus(
    input: TaxProviderScope & { providerDocumentId: string },
  ): Promise<TaxDocument>;

  getRepresentation(
    input: TaxProviderScope & { providerDocumentId: string },
  ): Promise<TaxDocumentRepresentation>;

  issueCreditNote(input: IssueCreditNoteInput): Promise<TaxDocument>;

  retryDocument(
    input: TaxProviderScope & {
      providerDocumentId: string;
      idempotencyKey: string;
    },
  ): Promise<TaxDocument>;
}
