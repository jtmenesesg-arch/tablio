import { afterEach, describe, expect, it } from "vitest";
import { assertSimulatedPaymentGateway } from "./demo-payment-runtime";

const originalGateway = process.env.TABLIO_PAYMENT_GATEWAY;

afterEach(() => {
  if (originalGateway === undefined) {
    delete process.env.TABLIO_PAYMENT_GATEWAY;
  } else {
    process.env.TABLIO_PAYMENT_GATEWAY = originalGateway;
  }
});

describe("configuración segura de la demo", () => {
  it("permite únicamente el adaptador simulado configurado de forma explícita", () => {
    // Intenta romper la demo activando una pasarela real: si esto fallara,
    // una demostración podría mover dinero por accidente.
    process.env.TABLIO_PAYMENT_GATEWAY = "simulated";
    expect(() => assertSimulatedPaymentGateway()).not.toThrow();

    process.env.TABLIO_PAYMENT_GATEWAY = "mercado_pago";
    expect(() => assertSimulatedPaymentGateway()).toThrow(
      /solo puede iniciar con TABLIO_PAYMENT_GATEWAY=simulated/,
    );
  });
});
