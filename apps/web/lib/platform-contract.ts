import type {
  OperationalAccess,
  PlanCode,
  SubscriptionStatus,
} from "@tablio/application";

export type OnboardingStepCode =
  | "venue"
  | "size"
  | "menu"
  | "tax"
  | "gateway"
  | "staff"
  | "qr"
  | "verification"
  | "production";

export type OnboardingBootstrap = Readonly<{
  demo: true;
  tenantId: string;
  tenantName: string;
  status: "not_started" | "in_progress" | "ready";
  currentStep: OnboardingStepCode;
  completedSteps: readonly OnboardingStepCode[];
  progressPercent: number;
  venue: {
    name: string;
    address: string;
    venueType: string;
    openingHours: string;
  };
  size: {
    zones: readonly { id: string; name: string; tableCount: number }[];
    stations: readonly { id: string; name: string }[];
    tableCount: number;
  };
  menu: {
    draftId?: string;
    source?: "text" | "link" | "pdf" | "image";
    sourceLabel?: string;
    status: "empty" | "extracted" | "reviewed" | "published";
    items: readonly {
      id: string;
      category: string;
      name: string;
      description: string;
      priceClp: number;
      confirmed: boolean;
    }[];
  };
  tax: {
    rut: string;
    businessActivity: string;
    issuerAddress: string;
    mode:
      | "ELECTRONIC_PAYMENT_VOUCHER"
      | "DTE_FOR_ALL_SALES"
      | "HYBRID_BY_PAYMENT_METHOD";
  };
  gateway: {
    status: "disconnected" | "connected" | "verified";
    provider: "simulated";
    merchantLabel?: string;
    connectionMode?: "oauth" | "manual";
  };
  staff: readonly {
    id: string;
    name: string;
    role: "waiter" | "cashier_admin" | "kds";
    pin: string;
  }[];
  qrCodes: readonly {
    tableName: string;
    qrToken: string;
    presenceCode: string;
  }[];
  verification: {
    sale: "pending" | "passed";
    refund: "pending" | "passed";
  };
  plan: {
    current?: PlanCode;
    proposed: PlanCode;
    name: string;
    monthlyClp?: number;
    setupClp?: number;
    effectiveAt?: string;
    commercialHypothesis: true;
  };
  billing: {
    status: "disconnected" | "ready";
    paymentMethodLabel?: string;
  };
  canActivateProduction: boolean;
}>;

export type OnboardingMutation =
  | {
      action: "venue.save";
      name: string;
      address: string;
      venueType: string;
      openingHours: string;
    }
  | {
      action: "size.save";
      zones: readonly { name: string; tableCount: number }[];
      stations: readonly string[];
    }
  | {
      action: "menu.import";
      source: "text" | "link" | "pdf" | "image";
      sourceLabel: string;
      content?: string;
    }
  | {
      action: "menu.item.update";
      itemId: string;
      name: string;
      category: string;
      description: string;
      priceClp: number;
      confirmed: boolean;
    }
  | { action: "menu.review.confirm" }
  | { action: "menu.publish" }
  | {
      action: "tax.save";
      rut: string;
      businessActivity: string;
      issuerAddress: string;
      mode: OnboardingBootstrap["tax"]["mode"];
    }
  | { action: "gateway.connect"; mode: "oauth" | "manual" }
  | { action: "gateway.verify" }
  | { action: "gateway.disconnect" }
  | {
      action: "staff.add";
      name: string;
      role: "waiter" | "cashier_admin" | "kds";
      pin: string;
    }
  | { action: "qr.generate" }
  | { action: "verification.run" }
  | { action: "billing.connect"; ownerEmail: string }
  | { action: "production.activate" };

export type SuperadminTenant = Readonly<{
  id: string;
  name: string;
  status: "onboarding" | "active" | "delinquent" | "suspended" | "closed";
  planCode: PlanCode;
  monthlyClp: number;
  subscriptionStatus: SubscriptionStatus;
  operationalAccess: OperationalAccess;
  gatewayConnected: boolean;
  dteProvider: string;
  lastActivityAt: string;
  tableCount: number;
  featureFlags: readonly string[];
  storedValueLiabilityClp: number;
  storedValueAlertThresholdClp: number;
  storedValueAlert: boolean;
}>;

export type SuperadminBootstrap = Readonly<{
  demo: true;
  actor: { id: string; name: string; role: "superadmin" };
  metrics: {
    activeTenants: number;
    mrrClp: number;
    churnPercent: number;
    ordersLast30Days: number;
    storedValueLiabilityClp: number;
    tenantsOverStoredValueThreshold: number;
  };
  tenants: readonly SuperadminTenant[];
  notifications: readonly {
    id: string;
    tenantId: string;
    kind:
      | "charge_notice"
      | "charge_failed"
      | "retry_scheduled"
      | "suspension_notice";
    message: string;
    createdAt: string;
  }[];
  impersonationAudit: readonly {
    id: string;
    actorName: string;
    tenantName: string;
    reason: string;
    startedAt: string;
  }[];
  dunningSettings: {
    noticeDaysBeforeCharge: number;
    graceDays: number;
    retryDelaysHours: readonly number[];
    suspensionNoticeHours: number;
    lowTrafficLabel: string;
  };
}>;

export type SuperadminMutation =
  | { action: "tenant.create"; name: string }
  | { action: "tenant.close"; tenantId: string; reason: string }
  | {
      action: "tenant.impersonate";
      tenantId: string;
      reason: string;
    }
  | {
      action: "tenant.feature.toggle";
      tenantId: string;
      flag: string;
    }
  | {
      action: "tenant.provider.configure";
      tenantId: string;
      gatewayConnected: boolean;
      dteProvider: string;
    }
  | {
      action: "tenant.stored_value_threshold.set";
      tenantId: string;
      thresholdClp: number;
    }
  | { action: "billing.fail"; tenantId: string }
  | { action: "billing.retry"; tenantId: string }
  | {
      action: "billing.status.set";
      tenantId: string;
      status: SubscriptionStatus;
    };
