import type {
  SaasBillingAccount,
  SaasBillingProvider,
  SaasCharge,
} from "@tablio/application";

type MutableState = {
  accounts: Map<string, SaasBillingAccount>;
  accountByIdempotency: Map<string, string>;
  charges: Map<string, SaasCharge>;
  chargeByIdempotency: Map<string, string>;
  sequence: number;
};

export class SimulatedSaasBillingProvider implements SaasBillingProvider {
  private readonly state: MutableState = {
    accounts: new Map(),
    accountByIdempotency: new Map(),
    charges: new Map(),
    chargeByIdempotency: new Map(),
    sequence: 0,
  };

  async connectAccount(input: {
    tenantId: string;
    ownerEmail: string;
    idempotencyKey: string;
  }): Promise<SaasBillingAccount> {
    const existingId = this.state.accountByIdempotency.get(
      input.idempotencyKey,
    );
    if (existingId) return this.state.accounts.get(existingId)!;
    const account: SaasBillingAccount = Object.freeze({
      id: `billing-account-${++this.state.sequence}`,
      tenantId: input.tenantId,
      providerCustomerId: `sim-customer:${input.tenantId}`,
      paymentMethodLabel: `Tarjeta demo · ${input.ownerEmail}`,
      status: "ready",
    });
    this.state.accounts.set(account.id, account);
    this.state.accountByIdempotency.set(input.idempotencyKey, account.id);
    return account;
  }

  async disconnectAccount(input: {
    tenantId: string;
    billingAccountId: string;
  }): Promise<void> {
    const account = this.state.accounts.get(input.billingAccountId);
    if (!account || account.tenantId !== input.tenantId) {
      throw new Error("Billing account not found for tenant");
    }
    this.state.accounts.set(
      account.id,
      Object.freeze({ ...account, status: "disconnected" }),
    );
  }

  async charge(input: {
    tenantId: string;
    billingAccountId: string;
    kind: "setup" | "subscription";
    amount: { amount: number; currency: "CLP" };
    idempotencyKey: string;
    simulateFailure?: boolean;
  }): Promise<SaasCharge> {
    const replayId = this.state.chargeByIdempotency.get(input.idempotencyKey);
    if (replayId) return this.state.charges.get(replayId)!;
    const account = this.state.accounts.get(input.billingAccountId);
    if (
      !account ||
      account.tenantId !== input.tenantId ||
      account.status !== "ready"
    ) {
      throw new Error("Billing account is not ready for this tenant");
    }
    if (
      !Number.isInteger(input.amount.amount) ||
      input.amount.amount < 0 ||
      input.amount.currency !== "CLP"
    ) {
      throw new Error("Invalid SaaS charge amount");
    }
    const charge: SaasCharge = Object.freeze({
      id: `saas-charge-${++this.state.sequence}`,
      tenantId: input.tenantId,
      billingAccountId: input.billingAccountId,
      kind: input.kind,
      amount: Object.freeze(input.amount),
      idempotencyKey: input.idempotencyKey,
      status: input.simulateFailure ? "failed" : "succeeded",
      attemptNumber: 1,
      providerChargeId: input.simulateFailure
        ? undefined
        : `sim-saas:${input.idempotencyKey}`,
      failureCode: input.simulateFailure ? "demo_card_declined" : undefined,
      createdAt: new Date().toISOString(),
    });
    this.state.charges.set(charge.id, charge);
    this.state.chargeByIdempotency.set(input.idempotencyKey, charge.id);
    return charge;
  }

  async retryCharge(input: {
    tenantId: string;
    chargeId: string;
    idempotencyKey: string;
    simulateFailure?: boolean;
  }): Promise<SaasCharge> {
    const replayId = this.state.chargeByIdempotency.get(input.idempotencyKey);
    if (replayId) return this.state.charges.get(replayId)!;
    const previous = this.state.charges.get(input.chargeId);
    if (!previous || previous.tenantId !== input.tenantId) {
      throw new Error("Charge not found for tenant");
    }
    const retried: SaasCharge = Object.freeze({
      ...previous,
      id: `saas-charge-${++this.state.sequence}`,
      idempotencyKey: input.idempotencyKey,
      attemptNumber: previous.attemptNumber + 1,
      status: input.simulateFailure ? "failed" : "succeeded",
      providerChargeId: input.simulateFailure
        ? undefined
        : `sim-saas:${input.idempotencyKey}`,
      failureCode: input.simulateFailure ? "demo_card_declined" : undefined,
      createdAt: new Date().toISOString(),
    });
    this.state.charges.set(retried.id, retried);
    this.state.chargeByIdempotency.set(input.idempotencyKey, retried.id);
    return retried;
  }

  async getCharge(input: {
    tenantId: string;
    chargeId: string;
  }): Promise<SaasCharge | undefined> {
    const charge = this.state.charges.get(input.chargeId);
    return charge?.tenantId === input.tenantId ? charge : undefined;
  }
}
