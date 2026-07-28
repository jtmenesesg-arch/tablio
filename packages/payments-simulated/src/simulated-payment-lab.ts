import {
  PaymentEventProcessor,
  type MerchantScope,
  type PaymentEventKind,
} from "@tablio/application";
import { InMemoryPaymentEventStore } from "./in-memory-payment-event-store";
import { SimulatedPaymentGateway } from "./simulated-payment-gateway";

export type DemoScenario =
  | "approved"
  | "rejected"
  | "duplicate"
  | "late"
  | "out_of_order"
  | "partial_refund"
  | "full_refund";

export type DemoLogEntry = Readonly<{
  at: string;
  label: string;
  detail: string;
}>;

export class SimulatedPaymentLab {
  readonly scope: MerchantScope = {
    tenantId: "demo-bar",
    merchantAccountId: "demo-merchant:demo-bar",
  };
  readonly gateway: SimulatedPaymentGateway;
  readonly store = new InMemoryPaymentEventStore();
  readonly processor: PaymentEventProcessor;
  readonly log: DemoLogEntry[] = [];

  constructor(
    webhookSecret = "tablio-demo-secret-not-for-production",
    private readonly now: () => Date = () => new Date(),
  ) {
    this.gateway = new SimulatedPaymentGateway(webhookSecret, now);
    this.processor = new PaymentEventProcessor(this.gateway, this.store, now);
  }

  async run(
    scenario: DemoScenario,
  ): Promise<ReturnType<SimulatedPaymentLab["snapshot"]>> {
    this.reset();
    const attempt = await this.gateway.createPaymentAttempt({
      ...this.scope,
      amount: { amount: 18_900, currency: "CLP" },
      checkoutQuoteId: "demo-quote-001",
      idempotencyKey: `demo:${scenario}:create`,
      returnUrl: "http://localhost:3000/demo/payments",
    });
    this.add("Intento creado", `${attempt.providerPaymentId} · $18.900 CLP`);

    if (scenario === "rejected") {
      this.gateway.setPaymentOutcome(
        this.scope,
        attempt.providerPaymentId,
        "rejected",
      );
      await this.deliver(
        attempt.providerPaymentId,
        "payment.rejected",
        "demo-event:rejected",
      );
      this.add("Pago rechazado", "No se crea ningún efecto de pedido");
      return this.snapshot();
    }

    this.gateway.setPaymentOutcome(
      this.scope,
      attempt.providerPaymentId,
      "confirmed",
    );
    this.add(
      "Proveedor aprobó",
      "El dinero simulado pertenece al comercio demo, no a Tablio",
    );

    if (scenario === "late") {
      const twoHoursAgo = new Date(
        this.now().getTime() - 7_200_000,
      ).toISOString();
      await this.deliver(
        attempt.providerPaymentId,
        "payment.confirmed",
        "demo-event:late",
        twoHoursAgo,
      );
      this.add(
        "Evento tardío",
        "Se aceptó por ID y se consultó el estado actual",
      );
    } else if (scenario === "out_of_order") {
      await this.deliver(
        attempt.providerPaymentId,
        "payment.confirmed",
        "demo-event:newer",
      );
      await this.deliver(
        attempt.providerPaymentId,
        "payment.pending",
        "demo-event:older",
        new Date(this.now().getTime() - 60_000).toISOString(),
      );
      this.add(
        "Evento fuera de orden",
        "El aviso antiguo no degradó el pago: mandó la consulta server-side",
      );
    } else {
      await this.deliver(
        attempt.providerPaymentId,
        "payment.confirmed",
        "demo-event:confirmed",
      );
    }

    if (scenario === "duplicate") {
      await this.deliver(
        attempt.providerPaymentId,
        "payment.confirmed",
        "demo-event:confirmed",
      );
      this.add(
        "Evento duplicado",
        "Mismo event_id recibido dos veces; un solo mensaje en outbox",
      );
    }

    if (scenario === "partial_refund" || scenario === "full_refund") {
      const amount =
        scenario === "partial_refund"
          ? { amount: 5_000, currency: "CLP" as const }
          : undefined;
      const refund = await this.gateway.refund({
        ...this.scope,
        providerPaymentId: attempt.providerPaymentId,
        idempotencyKey: `demo:${scenario}:refund`,
        amount,
      });
      await this.deliver(
        attempt.providerPaymentId,
        "refund.completed",
        `demo-event:${scenario}`,
        undefined,
        refund.refundId,
      );
      this.add(
        scenario === "partial_refund" ? "Reembolso parcial" : "Reembolso total",
        `$${refund.amount.amount.toLocaleString("es-CL")} CLP`,
      );
    }

    return this.snapshot();
  }

  reset(): void {
    this.gateway.reset();
    this.store.reset();
    this.log.splice(0);
  }

  snapshot() {
    return {
      demo: true as const,
      warning: "MODO DEMO — NO MUEVE DINERO REAL",
      scope: this.scope,
      providerEvents: [...this.store.providerEvents],
      outbox: [...this.store.outbox],
      log: [...this.log],
    };
  }

  private async deliver(
    providerPaymentId: string,
    eventKind: PaymentEventKind,
    eventId: string,
    occurredAt?: string,
    resourceId?: string,
  ): Promise<void> {
    const signed = this.gateway.createSignedWebhook({
      providerPaymentId,
      eventKind,
      eventId,
      occurredAt,
      resourceId,
    });
    const result = await this.processor.handle(this.scope, signed.envelope);
    this.add(
      `Webhook ${eventKind}`,
      result.duplicate
        ? "Duplicado reconocido, sin nuevo efecto"
        : `Firma válida · estado server-side ${result.payment.status}`,
    );
  }

  private add(label: string, detail: string): void {
    this.log.push({ at: this.now().toISOString(), label, detail });
  }
}
