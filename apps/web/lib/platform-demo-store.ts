import "server-only";

import { randomUUID } from "node:crypto";
import {
  DEFAULT_DUNNING_SETTINGS,
  canPublishMenu,
  dinerOrderingContract,
  operationalAccessFor,
  recommendPlan,
  type MenuDraftItem,
  type PlanCode,
  type SubscriptionStatus,
} from "@tablio/application";
import { SimulatedSaasBillingProvider } from "@tablio/billing-simulated";
import type {
  OnboardingBootstrap,
  OnboardingMutation,
  OnboardingStepCode,
  SuperadminBootstrap,
  SuperadminMutation,
  SuperadminTenant,
} from "./platform-contract";

type MutableMenuItem = {
  id: string;
  category: string;
  name: string;
  description: string;
  priceClp: number;
  confirmed: boolean;
};

type MutableOnboarding = {
  tenantId: string;
  tenantName: string;
  status: "not_started" | "in_progress" | "ready";
  completedSteps: Set<OnboardingStepCode>;
  currentStep: OnboardingStepCode;
  venue: OnboardingBootstrap["venue"];
  zones: Array<{ id: string; name: string; tableCount: number }>;
  stations: Array<{ id: string; name: string }>;
  menu: {
    draftId?: string;
    source?: "text" | "link" | "pdf" | "image";
    sourceLabel?: string;
    status: "empty" | "extracted" | "reviewed" | "published";
    items: MutableMenuItem[];
  };
  tax: OnboardingBootstrap["tax"];
  gateway: OnboardingBootstrap["gateway"];
  staff: Array<{
    id: string;
    name: string;
    role: "waiter" | "cashier_admin" | "kds";
    pin: string;
  }>;
  qrCodes: Array<{
    tableName: string;
    qrToken: string;
    presenceCode: string;
  }>;
  verification: OnboardingBootstrap["verification"];
  currentPlan?: PlanCode;
  proposedEffectiveAt?: string;
  billingAccount?: { id: string; paymentMethodLabel: string };
};

type MutableTenant = {
  id: string;
  name: string;
  status: SuperadminTenant["status"];
  planCode: PlanCode;
  monthlyClp: number;
  subscriptionStatus: SubscriptionStatus;
  gatewayConnected: boolean;
  dteProvider: string;
  lastActivityAt: string;
  tableCount: number;
  featureFlags: string[];
  billingAccountId?: string;
  failedChargeId?: string;
};

type DemoState = {
  onboarding: MutableOnboarding;
  tenants: MutableTenant[];
  notifications: Array<SuperadminBootstrap["notifications"][number]>;
  impersonationAudit: Array<SuperadminBootstrap["impersonationAudit"][number]>;
  billing: SimulatedSaasBillingProvider;
};

const steps: readonly OnboardingStepCode[] = [
  "venue",
  "size",
  "menu",
  "tax",
  "gateway",
  "staff",
  "qr",
  "verification",
  "production",
];

function initialOnboarding(): MutableOnboarding {
  return {
    tenantId: "tenant-onboarding-demo",
    tenantName: "Mi local",
    status: "not_started",
    completedSteps: new Set(),
    currentStep: "venue",
    venue: {
      name: "",
      address: "",
      venueType: "Bar",
      openingHours: "18:00–02:00",
    },
    zones: [],
    stations: [],
    menu: { status: "empty", items: [] },
    tax: {
      rut: "",
      businessActivity: "",
      issuerAddress: "",
      mode: "HYBRID_BY_PAYMENT_METHOD",
    },
    gateway: { status: "disconnected", provider: "simulated" },
    staff: [],
    qrCodes: [],
    verification: { sale: "pending", refund: "pending" },
  };
}

function initialState(): DemoState {
  const now = new Date().toISOString();
  return {
    onboarding: initialOnboarding(),
    billing: new SimulatedSaasBillingProvider(),
    tenants: [
      {
        id: "tenant-demo-pwa",
        name: "Bar La Esquina",
        status: "active",
        planCode: "starter",
        monthlyClp: 99_000,
        subscriptionStatus: "active",
        gatewayConnected: true,
        dteProvider: "Simulado",
        lastActivityAt: now,
        tableCount: 10,
        featureFlags: ["reconciliation", "menu_import"],
      },
      {
        id: "tenant-patio-sur",
        name: "Patio Sur",
        status: "delinquent",
        planCode: "flow",
        monthlyClp: 169_000,
        subscriptionStatus: "admin_restricted",
        gatewayConnected: true,
        dteProvider: "Pendiente",
        lastActivityAt: new Date(Date.now() - 3_600_000).toISOString(),
        tableCount: 24,
        featureFlags: ["reconciliation"],
      },
      {
        id: "tenant-club-norte",
        name: "Club Norte",
        status: "suspended",
        planCode: "high_flow",
        monthlyClp: 239_000,
        subscriptionStatus: "suspended",
        gatewayConnected: false,
        dteProvider: "Simulado",
        lastActivityAt: new Date(Date.now() - 86_400_000).toISOString(),
        tableCount: 42,
        featureFlags: [],
      },
    ],
    notifications: [],
    impersonationAudit: [],
  };
}

const globalPlatform = globalThis as typeof globalThis & {
  __tablioPlatformDemo?: DemoState;
};
let state =
  globalPlatform.__tablioPlatformDemo ??
  (globalPlatform.__tablioPlatformDemo = initialState());

export class PlatformDemoError extends Error {
  constructor(
    message: string,
    readonly status = 400,
  ) {
    super(message);
  }
}

function planForOnboarding(onboarding: MutableOnboarding) {
  return recommendPlan({
    tables: onboarding.zones.reduce((sum, zone) => sum + zone.tableCount, 0),
    zones: onboarding.zones.length,
    stations: onboarding.stations.length,
  });
}

function completeStep(onboarding: MutableOnboarding, step: OnboardingStepCode) {
  onboarding.status = "in_progress";
  onboarding.completedSteps.add(step);
  const next = steps.find(
    (candidate) => !onboarding.completedSteps.has(candidate),
  );
  onboarding.currentStep = next ?? "production";
}

function parseImportedItems(
  source: OnboardingMutation & { action: "menu.import" },
): MutableMenuItem[] {
  const content = source.content?.trim();
  if (source.source === "text" && content) {
    const parsed = content
      .split(/\r?\n/)
      .map((line) => line.trim())
      .filter(Boolean)
      .map((line, index) => {
        const amountMatch = line.match(/\$?\s*([0-9][0-9.]*)\s*$/);
        const price = amountMatch
          ? Number(amountMatch[1]!.replaceAll(".", ""))
          : 0;
        const name = amountMatch
          ? line
              .slice(0, amountMatch.index)
              .replace(/[·–-]\s*$/, "")
              .trim()
          : line;
        return {
          id: `imported-${index + 1}`,
          category: "Sin categoría",
          name,
          description: "",
          priceClp: price,
          confirmed: false,
        };
      });
    if (parsed.length) return parsed;
  }
  const label =
    source.source === "link"
      ? "Carta obtenida desde enlace"
      : source.source === "pdf"
        ? "Carta leída desde PDF"
        : "Carta leída desde imagen";
  return [
    {
      id: "imported-1",
      category: "Cervezas",
      name: "Lager de la casa",
      description: label,
      priceClp: 4_500,
      confirmed: false,
    },
    {
      id: "imported-2",
      category: "Cocina",
      name: "Hamburguesa clásica",
      description: "Extracción simulada: revisar antes de publicar.",
      priceClp: 8_900,
      confirmed: false,
    },
  ];
}

function onboardingBootstrap(): OnboardingBootstrap {
  const onboarding = state.onboarding;
  const plan = planForOnboarding(onboarding);
  const tableCount = onboarding.zones.reduce(
    (sum, zone) => sum + zone.tableCount,
    0,
  );
  const required = steps.slice(0, -1);
  const canActivateProduction =
    required.every((step) => onboarding.completedSteps.has(step)) &&
    Boolean(onboarding.billingAccount);
  return {
    demo: true,
    tenantId: onboarding.tenantId,
    tenantName: onboarding.tenantName,
    status: onboarding.status,
    currentStep: onboarding.currentStep,
    completedSteps: [...onboarding.completedSteps],
    progressPercent: Math.round(
      (onboarding.completedSteps.size / steps.length) * 100,
    ),
    venue: { ...onboarding.venue },
    size: {
      zones: onboarding.zones.map((zone) => ({ ...zone })),
      stations: onboarding.stations.map((station) => ({ ...station })),
      tableCount,
    },
    menu: {
      ...onboarding.menu,
      items: onboarding.menu.items.map((item) => ({ ...item })),
    },
    tax: { ...onboarding.tax },
    gateway: { ...onboarding.gateway },
    staff: onboarding.staff.map((employee) => ({ ...employee })),
    qrCodes: onboarding.qrCodes.map((qr) => ({ ...qr })),
    verification: { ...onboarding.verification },
    plan: {
      current: onboarding.currentPlan,
      proposed: plan.code,
      name: plan.name,
      monthlyClp: plan.monthlyClp,
      setupClp: plan.setupClp,
      effectiveAt: onboarding.proposedEffectiveAt,
      commercialHypothesis: true,
    },
    billing: onboarding.billingAccount
      ? {
          status: "ready",
          paymentMethodLabel: onboarding.billingAccount.paymentMethodLabel,
        }
      : { status: "disconnected" },
    canActivateProduction,
  };
}

export function getOnboardingBootstrap(): OnboardingBootstrap {
  return onboardingBootstrap();
}

export async function mutateOnboarding(
  mutation: OnboardingMutation,
): Promise<OnboardingBootstrap> {
  const onboarding = state.onboarding;
  switch (mutation.action) {
    case "venue.save": {
      if (!mutation.name.trim() || !mutation.address.trim()) {
        throw new PlatformDemoError("Completa el nombre y la dirección.");
      }
      onboarding.venue = {
        name: mutation.name.trim(),
        address: mutation.address.trim(),
        venueType: mutation.venueType.trim() || "Bar",
        openingHours: mutation.openingHours.trim(),
      };
      onboarding.tenantName = onboarding.venue.name;
      completeStep(onboarding, "venue");
      break;
    }
    case "size.save": {
      if (!mutation.zones.length || !mutation.stations.length) {
        throw new PlatformDemoError("Agrega al menos una zona y una estación.");
      }
      onboarding.zones = mutation.zones.map((zone, index) => ({
        id: `zone-${index + 1}`,
        name: zone.name.trim() || `Zona ${index + 1}`,
        tableCount: Math.max(0, Math.trunc(zone.tableCount)),
      }));
      onboarding.stations = mutation.stations.map((name, index) => ({
        id: `station-${index + 1}`,
        name: name.trim() || `Estación ${index + 1}`,
      }));
      if (onboarding.currentPlan) {
        onboarding.proposedEffectiveAt = new Date(
          Date.now() + 30 * 86_400_000,
        ).toISOString();
      }
      completeStep(onboarding, "size");
      break;
    }
    case "menu.import": {
      onboarding.menu = {
        draftId: randomUUID(),
        source: mutation.source,
        sourceLabel: mutation.sourceLabel,
        status: "extracted",
        items: parseImportedItems(mutation),
      };
      onboarding.status = "in_progress";
      onboarding.currentStep = "menu";
      break;
    }
    case "menu.item.update": {
      const item = onboarding.menu.items.find(
        (candidate) => candidate.id === mutation.itemId,
      );
      if (!item) throw new PlatformDemoError("Ítem importado no encontrado.");
      Object.assign(item, {
        name: mutation.name.trim(),
        category: mutation.category.trim(),
        description: mutation.description.trim(),
        priceClp: Math.trunc(mutation.priceClp),
        confirmed: mutation.confirmed,
      });
      break;
    }
    case "menu.review.confirm": {
      onboarding.menu.items = onboarding.menu.items.map((item) => ({
        ...item,
        confirmed: true,
      }));
      onboarding.menu.status = "reviewed";
      break;
    }
    case "menu.publish": {
      if (onboarding.menu.status === "empty") {
        throw new PlatformDemoError("Primero importa una carta.");
      }
      const reviewedStatus = onboarding.menu.status;
      const draft = {
        id: onboarding.menu.draftId ?? "",
        source: onboarding.menu.source ?? "text",
        sourceLabel: onboarding.menu.sourceLabel ?? "",
        status: reviewedStatus,
        items: onboarding.menu.items as readonly MenuDraftItem[],
      } as const;
      if (!canPublishMenu(draft)) {
        throw new PlatformDemoError(
          "Revisa y confirma cada precio antes de publicar.",
        );
      }
      onboarding.menu.status = "published";
      completeStep(onboarding, "menu");
      break;
    }
    case "tax.save": {
      if (!mutation.rut.trim() || !mutation.businessActivity.trim()) {
        throw new PlatformDemoError("Completa RUT y giro.");
      }
      onboarding.tax = {
        rut: mutation.rut.trim(),
        businessActivity: mutation.businessActivity.trim(),
        issuerAddress: mutation.issuerAddress.trim(),
        mode: mutation.mode,
      };
      completeStep(onboarding, "tax");
      break;
    }
    case "gateway.connect": {
      onboarding.gateway = {
        provider: "simulated",
        status: "connected",
        merchantLabel: "Comercio demo del bar",
        connectionMode: mutation.mode,
      };
      break;
    }
    case "gateway.verify": {
      if (onboarding.gateway.status === "disconnected") {
        throw new PlatformDemoError("Primero conecta la cuenta del bar.");
      }
      onboarding.gateway = { ...onboarding.gateway, status: "verified" };
      completeStep(onboarding, "gateway");
      break;
    }
    case "gateway.disconnect": {
      onboarding.gateway = { provider: "simulated", status: "disconnected" };
      onboarding.completedSteps.delete("gateway");
      onboarding.currentStep = "gateway";
      break;
    }
    case "staff.add": {
      if (!mutation.name.trim() || !/^\d{4}$/.test(mutation.pin)) {
        throw new PlatformDemoError("Usa un nombre y un PIN de 4 dígitos.");
      }
      onboarding.staff.push({
        id: randomUUID(),
        name: mutation.name.trim(),
        role: mutation.role,
        pin: mutation.pin,
      });
      completeStep(onboarding, "staff");
      break;
    }
    case "qr.generate": {
      const qrCodes: MutableOnboarding["qrCodes"] = [];
      for (const zone of onboarding.zones) {
        for (let index = 1; index <= zone.tableCount; index += 1) {
          const sequence = qrCodes.length + 1;
          qrCodes.push({
            tableName: `${zone.name} · Mesa ${index}`,
            qrToken: `demo-${onboarding.tenantId}-${sequence}`,
            presenceCode: String(4100 + sequence).padStart(4, "0"),
          });
        }
      }
      onboarding.qrCodes = qrCodes;
      completeStep(onboarding, "qr");
      break;
    }
    case "verification.run": {
      if (onboarding.gateway.status !== "verified") {
        throw new PlatformDemoError("Verifica primero la cuenta del bar.");
      }
      onboarding.verification = { sale: "passed", refund: "passed" };
      completeStep(onboarding, "verification");
      break;
    }
    case "billing.connect": {
      const account = await state.billing.connectAccount({
        tenantId: onboarding.tenantId,
        ownerEmail: mutation.ownerEmail,
        idempotencyKey: `billing-connect:${onboarding.tenantId}`,
      });
      onboarding.billingAccount = {
        id: account.id,
        paymentMethodLabel: account.paymentMethodLabel,
      };
      break;
    }
    case "production.activate": {
      if (!onboardingBootstrap().canActivateProduction) {
        throw new PlatformDemoError(
          "Completa la verificación y el cobro de Tablio antes de habilitar.",
        );
      }
      onboarding.currentPlan = planForOnboarding(onboarding).code;
      completeStep(onboarding, "production");
      onboarding.status = "ready";
      if (!state.tenants.some((tenant) => tenant.id === onboarding.tenantId)) {
        const definition = planForOnboarding(onboarding);
        state.tenants.push({
          id: onboarding.tenantId,
          name: onboarding.tenantName,
          status: "active",
          planCode: definition.code,
          monthlyClp: definition.monthlyClp ?? 0,
          subscriptionStatus: "active",
          gatewayConnected: true,
          dteProvider: "Simulado",
          lastActivityAt: new Date().toISOString(),
          tableCount: onboarding.zones.reduce(
            (sum, zone) => sum + zone.tableCount,
            0,
          ),
          featureFlags: ["reconciliation", "menu_import"],
          billingAccountId: onboarding.billingAccount?.id,
        });
      }
      break;
    }
  }
  return onboardingBootstrap();
}

function tenantView(tenant: MutableTenant): SuperadminTenant {
  return {
    ...tenant,
    operationalAccess: operationalAccessFor(tenant.subscriptionStatus),
    featureFlags: [...tenant.featureFlags],
  };
}

export function getSuperadminBootstrap(): SuperadminBootstrap {
  const active = state.tenants.filter((tenant) => tenant.status !== "closed");
  return {
    demo: true,
    actor: {
      id: "platform-admin-demo",
      name: "Soporte Tablio",
      role: "superadmin",
    },
    metrics: {
      activeTenants: active.filter(
        (tenant) => tenant.subscriptionStatus !== "suspended",
      ).length,
      mrrClp: active.reduce(
        (sum, tenant) =>
          tenant.subscriptionStatus === "suspended"
            ? sum
            : sum + tenant.monthlyClp,
        0,
      ),
      churnPercent: 0,
      ordersLast30Days: 12_480,
    },
    tenants: state.tenants.map(tenantView),
    notifications: [...state.notifications].reverse(),
    impersonationAudit: [...state.impersonationAudit].reverse(),
    dunningSettings: {
      noticeDaysBeforeCharge: DEFAULT_DUNNING_SETTINGS.noticeDaysBeforeCharge,
      graceDays: DEFAULT_DUNNING_SETTINGS.graceDays,
      retryDelaysHours: [...DEFAULT_DUNNING_SETTINGS.retryDelaysHours],
      suspensionNoticeHours: DEFAULT_DUNNING_SETTINGS.suspensionNoticeHours,
      lowTrafficLabel: "Lunes 12:00 · America/Santiago",
    },
  };
}

function requireTenant(tenantId: string): MutableTenant {
  const tenant = state.tenants.find((candidate) => candidate.id === tenantId);
  if (!tenant) throw new PlatformDemoError("Tenant no encontrado.", 404);
  return tenant;
}

export async function mutateSuperadmin(
  mutation: SuperadminMutation,
): Promise<SuperadminBootstrap> {
  switch (mutation.action) {
    case "tenant.create":
      state.tenants.push({
        id: randomUUID(),
        name: mutation.name.trim() || "Nuevo local",
        status: "onboarding",
        planCode: "starter",
        monthlyClp: 99_000,
        subscriptionStatus: "trialing",
        gatewayConnected: false,
        dteProvider: "Pendiente",
        lastActivityAt: new Date().toISOString(),
        tableCount: 0,
        featureFlags: [],
      });
      break;
    case "tenant.close": {
      if (!mutation.reason.trim()) {
        throw new PlatformDemoError("La baja exige un motivo.");
      }
      const tenant = requireTenant(mutation.tenantId);
      tenant.status = "closed";
      tenant.subscriptionStatus = "cancelled";
      break;
    }
    case "tenant.impersonate": {
      if (mutation.reason.trim().length < 8) {
        throw new PlatformDemoError(
          "La impersonación exige un motivo específico.",
        );
      }
      const tenant = requireTenant(mutation.tenantId);
      state.impersonationAudit.push({
        id: randomUUID(),
        actorName: "Soporte Tablio",
        tenantName: tenant.name,
        reason: mutation.reason.trim(),
        startedAt: new Date().toISOString(),
      });
      break;
    }
    case "tenant.feature.toggle": {
      const tenant = requireTenant(mutation.tenantId);
      tenant.featureFlags = tenant.featureFlags.includes(mutation.flag)
        ? tenant.featureFlags.filter((flag) => flag !== mutation.flag)
        : [...tenant.featureFlags, mutation.flag];
      break;
    }
    case "tenant.provider.configure": {
      const tenant = requireTenant(mutation.tenantId);
      tenant.gatewayConnected = mutation.gatewayConnected;
      tenant.dteProvider = mutation.dteProvider.trim() || "Pendiente";
      break;
    }
    case "billing.fail": {
      const tenant = requireTenant(mutation.tenantId);
      const account =
        tenant.billingAccountId ??
        (
          await state.billing.connectAccount({
            tenantId: tenant.id,
            ownerEmail: `owner@${tenant.id}.demo`,
            idempotencyKey: `superadmin-connect:${tenant.id}`,
          })
        ).id;
      tenant.billingAccountId = account;
      const charge = await state.billing.charge({
        tenantId: tenant.id,
        billingAccountId: account,
        kind: "subscription",
        amount: { amount: tenant.monthlyClp, currency: "CLP" },
        idempotencyKey: `failed:${tenant.id}:${Date.now()}`,
        simulateFailure: true,
      });
      tenant.failedChargeId = charge.id;
      tenant.subscriptionStatus = "past_due";
      tenant.status = "delinquent";
      state.notifications.push(
        {
          id: randomUUID(),
          tenantId: tenant.id,
          kind: "charge_failed",
          message: "Cobro fallido. El bar sigue operando.",
          createdAt: new Date().toISOString(),
        },
        {
          id: randomUUID(),
          tenantId: tenant.id,
          kind: "retry_scheduled",
          message: "Reintento automático agendado en 24 horas.",
          createdAt: new Date().toISOString(),
        },
      );
      break;
    }
    case "billing.retry": {
      const tenant = requireTenant(mutation.tenantId);
      if (!tenant.failedChargeId) {
        throw new PlatformDemoError("No hay un cobro fallido que reintentar.");
      }
      await state.billing.retryCharge({
        tenantId: tenant.id,
        chargeId: tenant.failedChargeId,
        idempotencyKey: `retry:${tenant.id}:${Date.now()}`,
      });
      tenant.failedChargeId = undefined;
      tenant.subscriptionStatus = "active";
      tenant.status = "active";
      break;
    }
    case "billing.status.set": {
      const tenant = requireTenant(mutation.tenantId);
      tenant.subscriptionStatus = mutation.status;
      tenant.status =
        mutation.status === "suspended"
          ? "suspended"
          : mutation.status === "active"
            ? "active"
            : "delinquent";
      if (mutation.status === "suspension_scheduled") {
        state.notifications.push({
          id: randomUUID(),
          tenantId: tenant.id,
          kind: "suspension_notice",
          message:
            "Suspensión avisada por escrito y agendada para horario de bajo tráfico.",
          createdAt: new Date().toISOString(),
        });
      }
      break;
    }
  }
  return getSuperadminBootstrap();
}

export function getDinerOrderingAvailability() {
  const tenant = requireTenant("tenant-demo-pwa");
  return dinerOrderingContract(tenant.subscriptionStatus);
}

export function setDemoDinerSubscriptionStatus(status: SubscriptionStatus) {
  const tenant = requireTenant("tenant-demo-pwa");
  tenant.subscriptionStatus = status;
  tenant.status =
    status === "suspended"
      ? "suspended"
      : status === "active"
        ? "active"
        : "delinquent";
}

export function resetPlatformDemo() {
  state = initialState();
  globalPlatform.__tablioPlatformDemo = state;
}
