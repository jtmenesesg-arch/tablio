import "server-only";

const SIMULATED_GATEWAY = "simulated";

export function assertSimulatedPaymentGateway(): void {
  const configuredGateway =
    process.env.TABLIO_PAYMENT_GATEWAY ?? SIMULATED_GATEWAY;

  if (configuredGateway !== SIMULATED_GATEWAY) {
    throw new Error(
      "Esta aplicación de demostración solo puede iniciar con TABLIO_PAYMENT_GATEWAY=simulated.",
    );
  }
}
