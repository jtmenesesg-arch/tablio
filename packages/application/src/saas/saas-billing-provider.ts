export type SaasMoney = Readonly<{ amount: number; currency: "CLP" }>;

export type SaasBillingAccount = Readonly<{
  id: string;
  tenantId: string;
  providerCustomerId: string;
  paymentMethodLabel: string;
  status: "ready" | "requires_action" | "disconnected";
}>;

export type SaasCharge = Readonly<{
  id: string;
  tenantId: string;
  billingAccountId: string;
  kind: "setup" | "subscription";
  amount: SaasMoney;
  idempotencyKey: string;
  status: "pending" | "succeeded" | "failed";
  attemptNumber: number;
  providerChargeId?: string;
  failureCode?: string;
  createdAt: string;
}>;

export interface SaasBillingProvider {
  connectAccount(input: {
    tenantId: string;
    ownerEmail: string;
    idempotencyKey: string;
  }): Promise<SaasBillingAccount>;
  disconnectAccount(input: {
    tenantId: string;
    billingAccountId: string;
  }): Promise<void>;
  charge(input: {
    tenantId: string;
    billingAccountId: string;
    kind: "setup" | "subscription";
    amount: SaasMoney;
    idempotencyKey: string;
    simulateFailure?: boolean;
  }): Promise<SaasCharge>;
  retryCharge(input: {
    tenantId: string;
    chargeId: string;
    idempotencyKey: string;
    simulateFailure?: boolean;
  }): Promise<SaasCharge>;
  getCharge(input: {
    tenantId: string;
    chargeId: string;
  }): Promise<SaasCharge | undefined>;
}
