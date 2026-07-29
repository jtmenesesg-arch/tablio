import { SimulatedTaxDocumentProvider } from "@tablio/tax-simulated";

type DemoTaxState = {
  byOrder: Map<
    string,
    {
      status: "pending" | "issued" | "failed";
      message: string;
      folio?: string;
      representationUrl?: string;
      providerDocumentId?: string;
      amountClp: number;
      customerEmail?: string;
      lines: readonly {
        description: string;
        quantity: number;
        unitAmountClp: number;
        isLoyaltyReward: boolean;
      }[];
    }
  >;
  provider: SimulatedTaxDocumentProvider;
};

const globalTax = globalThis as typeof globalThis & {
  __tablioTaxDemo?: DemoTaxState;
};

const state =
  globalTax.__tablioTaxDemo ??
  (globalTax.__tablioTaxDemo = {
    byOrder: new Map(),
    provider: new SimulatedTaxDocumentProvider(),
  });

export function enqueueDemoReceipt(input: {
  orderId: string;
  amountClp: number;
  customerEmail?: string;
  lines: readonly {
    description: string;
    quantity: number;
    unitAmountClp: number;
    isLoyaltyReward: boolean;
  }[];
}): void {
  if (state.byOrder.has(input.orderId)) return;
  state.byOrder.set(input.orderId, {
    status: "pending",
    message: "Tu boleta se está emitiendo. Tu pedido ya está confirmado.",
    amountClp: input.amountClp,
    customerEmail: input.customerEmail,
    lines: input.lines,
  });

  setTimeout(() => {
    void state.provider
      .issueReceipt({
        tenantId: "tenant-demo-pwa",
        providerAccountId: "dte-demo-bar-la-esquina",
        idempotencyKey: `order:${input.orderId}:receipt`,
        saleReference: input.orderId,
        issuer: {
          rut: "76.000.000-0",
          legalName: "Bar La Esquina Demo SpA",
          businessActivity: "Restaurante y bar",
          address: "Dirección de demostración 123",
          commune: "Santiago",
        },
        amount: { amount: input.amountClp, currency: "CLP" },
        lines: input.lines.map((line) => ({
          description: line.isLoyaltyReward
            ? `${line.description} · premio fidelización`
            : line.description,
          quantity: line.quantity,
          unitAmount: { amount: line.unitAmountClp, currency: "CLP" },
          taxAmount: { amount: 0, currency: "CLP" },
        })),
        customerEmail: input.customerEmail,
      })
      .then((document) => {
        state.byOrder.set(input.orderId, {
          status: "issued",
          message: input.customerEmail
            ? `Boleta emitida. Envío demo registrado para ${input.customerEmail}.`
            : "Boleta emitida y disponible.",
          amountClp: input.amountClp,
          customerEmail: input.customerEmail,
          lines: input.lines,
          folio: document.folio,
          representationUrl: document.representationUrl,
          providerDocumentId: document.providerDocumentId,
        });
      })
      .catch((error: unknown) => {
        state.byOrder.set(input.orderId, {
          status: "failed",
          message:
            error instanceof Error
              ? `Boleta pendiente: ${error.message}`
              : "Boleta pendiente por falla del proveedor.",
          amountClp: input.amountClp,
          customerEmail: input.customerEmail,
          lines: input.lines,
        });
      });
  }, 700);
}

export function demoReceiptForOrder(orderId: string) {
  return (
    state.byOrder.get(orderId) ?? {
      status: "pending" as const,
      message: "Tu boleta se está emitiendo. Tu pedido ya está confirmado.",
      amountClp: 0,
      lines: [],
    }
  );
}

export function demoReceiptByProviderId(providerDocumentId: string) {
  return [...state.byOrder.entries()].find(
    ([, document]) => document.providerDocumentId === providerDocumentId,
  );
}
