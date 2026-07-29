import { describe, expect, it } from "vitest";
import { SimulatedTaxDocumentProvider } from "./simulated-tax-document-provider";

const receiptInput = {
  tenantId: "tenant-a",
  providerAccountId: "dte-a",
  idempotencyKey: "order:1:receipt",
  saleReference: "order-1",
  issuer: {
    rut: "76.000.000-0",
    legalName: "Bar Demo SpA",
    businessActivity: "Restaurante",
    address: "Calle Demo 123",
    commune: "Santiago",
  },
  amount: { amount: 12_900, currency: "CLP" as const },
  lines: [
    {
      description: "Consumo",
      quantity: 1,
      unitAmount: { amount: 12_900, currency: "CLP" as const },
      taxAmount: { amount: 0, currency: "CLP" as const },
    },
  ],
};

describe("SimulatedTaxDocumentProvider", () => {
  it("emits exactly one receipt when the durable event is repeated", async () => {
    // Intenta duplicar una boleta con el mismo evento; si falla, una venta tendría dos respaldos tributarios.
    const provider = new SimulatedTaxDocumentProvider();
    const first = await provider.issueReceipt(receiptInput);
    const duplicate = await provider.issueReceipt(receiptInput);

    expect(duplicate.providerDocumentId).toBe(first.providerDocumentId);
    expect(provider.countDocuments()).toBe(1);
  });

  it("fails, retries, and keeps the same provider document", async () => {
    // Intenta perder la identidad al reintentar; si falla, una caída del proveedor podría crear otra boleta.
    const provider = new SimulatedTaxDocumentProvider();
    provider.enqueueBehavior({ outcome: "failure" });
    await expect(provider.issueReceipt(receiptInput)).rejects.toThrow(
      "Simulated DTE provider failure",
    );

    const replay = await provider.issueReceipt(receiptInput);
    expect(replay.status).toBe("failed");
    expect(provider.countDocuments()).toBe(1);

    const retried = await provider.retryDocument({
      tenantId: receiptInput.tenantId,
      providerAccountId: receiptInput.providerAccountId,
      providerDocumentId: replay.providerDocumentId,
      idempotencyKey: "order:1:receipt:retry:1",
    });
    expect(retried).toMatchObject({
      providerDocumentId: replay.providerDocumentId,
      status: "issued",
    });
    expect(provider.countDocuments()).toBe(1);
  });

  it("issues one credit note linked to an issued receipt", async () => {
    // Intenta emitir una nota sin referencia o duplicarla; si falla, el reembolso no sería auditable.
    const provider = new SimulatedTaxDocumentProvider();
    const receipt = await provider.issueReceipt(receiptInput);
    const input = {
      tenantId: receiptInput.tenantId,
      providerAccountId: receiptInput.providerAccountId,
      idempotencyKey: "refund:1:credit-note",
      refundReference: "refund-1",
      originalProviderDocumentId: receipt.providerDocumentId,
      amount: { amount: 3_000, currency: "CLP" as const },
      reason: "Reembolso parcial",
    };
    const first = await provider.issueCreditNote(input);
    const duplicate = await provider.issueCreditNote(input);

    expect(first.kind).toBe("credit_note");
    expect(first.originalProviderDocumentId).toBe(receipt.providerDocumentId);
    expect(duplicate.providerDocumentId).toBe(first.providerDocumentId);
    expect(provider.countDocuments()).toBe(2);
  });

  it("keeps tenant credentials isolated", async () => {
    // Intenta leer una boleta con la cuenta DTE de otro local; si falla, se filtran datos tributarios.
    const provider = new SimulatedTaxDocumentProvider();
    const receipt = await provider.issueReceipt(receiptInput);
    await expect(
      provider.getDocumentStatus({
        tenantId: "tenant-b",
        providerAccountId: "dte-b",
        providerDocumentId: receipt.providerDocumentId,
      }),
    ).rejects.toThrow("not found");
  });

  it("simulates a slow provider without changing the result", async () => {
    // Intenta que una respuesta lenta cambie la identidad; si falla, un timeout podría duplicar la emisión.
    const provider = new SimulatedTaxDocumentProvider();
    provider.enqueueBehavior({ outcome: "slow", delayMs: 5 });
    await expect(provider.issueReceipt(receiptInput)).resolves.toMatchObject({
      status: "issued",
    });
  });
});
