import "server-only";

import { randomUUID } from "node:crypto";
import {
  assertExplicitLoyaltyConsent,
  eligibleStampCount,
  identityLossRate,
  maskLoyaltyRecognition,
  rewardEconomics,
} from "@tablio/application";

export const LOYALTY_DEMO_TENANT_ID = "00000000-0000-4000-8000-000000000301";
export const LOYALTY_REWARD_PRODUCT_ID = "papas-romero";
export const LOYALTY_DEMO_CODE = "735204";

type Profile = {
  id: string;
  tenantId: string;
  programAlias: string;
  contact: string;
  contactMasked: string;
  channel: "phone" | "email";
  status: "active" | "anonymized";
  stamps: number;
  visits: Array<{ orderId: string; occurredAt: string; paidClp: number }>;
  favoriteCounts: Map<string, number>;
  rewardReservations: Set<string>;
  rewardsRedeemed: number;
  rewardReferenceClp: number;
  rewardKnownCostClp: number;
};

type Challenge = {
  id: string;
  tenantId: string;
  purpose: "enroll" | "recover";
  channel: "phone" | "email";
  contact: string;
  contactMasked: string;
  expiresAt: number;
  verified: boolean;
};

type IdentityEvent = {
  type:
    | "recognized"
    | "recovered_after_missing_credential"
    | "recognition_rejected"
    | "assisted_adjustment"
    | "anonymized";
  profileId?: string;
  occurredAt: string;
  reason?: string;
};

const normalize = (value: string) => value.trim().toLowerCase();

function maskContact(channel: "phone" | "email", raw: string): string {
  const value = normalize(raw);
  if (channel === "email") {
    const [name = "", domain = ""] = value.split("@");
    return `${name.slice(0, 1)}•••@${domain}`;
  }
  const digits = value.replaceAll(/\D/g, "");
  return `•••• ${digits.slice(-4)}`;
}

export class LoyaltyDemoStore {
  private readonly profiles = new Map<string, Profile>();
  private readonly contacts = new Map<string, string>();
  private readonly credentials = new Map<string, string>();
  private readonly challenges = new Map<string, Challenge>();
  private readonly events: IdentityEvent[] = [];
  private enabled = false;

  constructor(private readonly clock: () => Date = () => new Date()) {}

  configureDemo(): void {
    this.enabled = true;
  }

  reset(): void {
    this.profiles.clear();
    this.contacts.clear();
    this.credentials.clear();
    this.challenges.clear();
    this.events.splice(0);
    this.enabled = true;
  }

  program() {
    return {
      enabled: this.enabled,
      visitsRequired: 5,
      minimumEligibleClp: 5_000,
      maxVisitsPerDay: 1,
      rewardProductId: LOYALTY_REWARD_PRODUCT_ID,
    };
  }

  startChallenge(input: {
    tenantId: string;
    purpose: "enroll" | "recover";
    channel: "phone" | "email";
    contact: string;
    identificationConsent: boolean;
    contactConsent: boolean;
  }) {
    if (!this.enabled) throw new Error("El programa está desactivado.");
    if (input.purpose === "enroll") {
      assertExplicitLoyaltyConsent({
        identificationAccepted: input.identificationConsent,
        contactAccepted: input.contactConsent,
      });
    }
    const contact = normalize(input.contact);
    if (
      (input.channel === "email" && !contact.includes("@")) ||
      (input.channel === "phone" && contact.replaceAll(/\D/g, "").length < 8)
    ) {
      throw new Error("Ingresa un teléfono o correo válido.");
    }
    const existing = this.contacts.get(`${input.tenantId}:${contact}`);
    if (input.purpose === "recover" && !existing) {
      throw new Error(
        "No encontramos sellos con ese dato en este local. Revisa e intenta otra vez.",
      );
    }
    const challenge: Challenge = {
      id: randomUUID(),
      tenantId: input.tenantId,
      purpose: input.purpose,
      channel: input.channel,
      contact,
      contactMasked: maskContact(input.channel, contact),
      expiresAt: this.clock().getTime() + 10 * 60 * 1000,
      verified: false,
    };
    this.challenges.set(challenge.id, challenge);
    return {
      id: challenge.id,
      purpose: challenge.purpose,
      maskedDestination: challenge.contactMasked,
      demoCode: LOYALTY_DEMO_CODE,
    };
  }

  verifyChallenge(input: {
    tenantId: string;
    challengeId: string;
    code: string;
  }): { profileId: string; credential: string; recovered: boolean } {
    const challenge = this.challenges.get(input.challengeId);
    if (
      !challenge ||
      challenge.tenantId !== input.tenantId ||
      challenge.expiresAt <= this.clock().getTime() ||
      challenge.verified ||
      input.code !== LOYALTY_DEMO_CODE
    ) {
      throw new Error("El código no es válido o ya venció.");
    }
    challenge.verified = true;
    const key = `${input.tenantId}:${challenge.contact}`;
    let profileId = this.contacts.get(key);
    const recovered = Boolean(profileId);
    if (!profileId) {
      profileId = randomUUID();
      const numeric = String(
        100 +
          (Math.abs(
            [...profileId].reduce((sum, char) => sum + char.charCodeAt(0), 0),
          ) %
            900),
      );
      this.profiles.set(profileId, {
        id: profileId,
        tenantId: input.tenantId,
        programAlias: `Club ${numeric}`,
        contact: challenge.contact,
        contactMasked: challenge.contactMasked,
        channel: challenge.channel,
        status: "active",
        stamps: 0,
        visits: [],
        favoriteCounts: new Map(),
        rewardReservations: new Set(),
        rewardsRedeemed: 0,
        rewardReferenceClp: 0,
        rewardKnownCostClp: 0,
      });
      this.contacts.set(key, profileId);
    } else if (challenge.purpose === "recover") {
      this.events.push({
        type: "recovered_after_missing_credential",
        profileId,
        occurredAt: this.clock().toISOString(),
      });
    }
    const credential = randomUUID();
    this.credentials.set(credential, profileId);
    return { profileId, credential, recovered };
  }

  recognition(tenantId: string, credential?: string) {
    if (!credential) return undefined;
    const profile = this.profileForCredential(tenantId, credential);
    if (!profile) return undefined;
    return {
      profileId: profile.id,
      maskedIdentity: maskLoyaltyRecognition(profile.programAlias),
    };
  }

  confirmRecognition(profileId: string): void {
    this.events.push({
      type: "recognized",
      profileId,
      occurredAt: this.clock().toISOString(),
    });
  }

  rejectRecognition(profileId: string): void {
    this.events.push({
      type: "recognition_rejected",
      profileId,
      occurredAt: this.clock().toISOString(),
    });
  }

  profile(profileId?: string) {
    const profile = profileId ? this.profiles.get(profileId) : undefined;
    if (!profile || profile.status !== "active") return undefined;
    return {
      id: profile.id,
      maskedIdentity: maskLoyaltyRecognition(profile.programAlias),
      contactMasked: profile.contactMasked,
      stamps: profile.stamps,
      rewardAvailable: profile.stamps >= this.program().visitsRequired,
      rewardProductName: "Papas crujientes",
    };
  }

  favorite(profileId?: string) {
    const profile = profileId ? this.profiles.get(profileId) : undefined;
    const favorite = profile
      ? [...profile.favoriteCounts.entries()].sort((a, b) => b[1] - a[1])[0]
      : undefined;
    return favorite ? { productId: favorite[0], quantity: 1 } : undefined;
  }

  recordConfirmedPayment(input: {
    profileId?: string;
    orderId: string;
    paidClp: number;
    productIds: readonly string[];
  }): void {
    if (!input.profileId) return;
    const profile = this.profiles.get(input.profileId);
    if (
      !profile ||
      profile.visits.some((visit) => visit.orderId === input.orderId)
    )
      return;
    const today = this.clock().toISOString().slice(0, 10);
    const visitsToday = profile.visits.filter((visit) =>
      visit.occurredAt.startsWith(today),
    ).length;
    const stamps = eligibleStampCount({
      program: this.program(),
      confirmedServerSide: true,
      paidAmountClp: input.paidClp,
      visitsAlreadyToday: visitsToday,
    });
    profile.visits.push({
      orderId: input.orderId,
      occurredAt: this.clock().toISOString(),
      paidClp: input.paidClp,
    });
    profile.stamps += stamps;
    for (const id of input.productIds) {
      profile.favoriteCounts.set(id, (profile.favoriteCounts.get(id) ?? 0) + 1);
    }
  }

  reserveReward(profileId: string, cartId: string): void {
    const profile = this.profiles.get(profileId);
    if (!profile || profile.status !== "active") {
      throw new Error("Recupera tu perfil antes de usar el premio.");
    }
    if (profile.stamps < this.program().visitsRequired) {
      throw new Error("Todavía no tienes suficientes sellos.");
    }
    if (profile.rewardReservations.size > 0) {
      throw new Error("Ese premio ya está reservado en otro checkout.");
    }
    profile.rewardReservations.add(cartId);
  }

  releaseReward(profileId: string, cartId: string): void {
    this.profiles.get(profileId)?.rewardReservations.delete(cartId);
  }

  completeReward(input: {
    profileId: string;
    cartId: string;
    referenceValueClp: number;
    optionalUnitCostClp?: number;
  }): void {
    const profile = this.profiles.get(input.profileId);
    if (!profile?.rewardReservations.has(input.cartId)) return;
    profile.rewardReservations.delete(input.cartId);
    profile.stamps -= this.program().visitsRequired;
    profile.rewardsRedeemed += 1;
    const economics = rewardEconomics(input);
    profile.rewardReferenceClp += economics.referenceValueClp;
    profile.rewardKnownCostClp += economics.knownCostClp ?? 0;
  }

  assistedAdjustment(input: {
    profileId: string;
    stampDelta: number;
    reason: string;
    actorId: string;
  }): void {
    const profile = this.profiles.get(input.profileId);
    if (!profile || !input.reason.trim()) {
      throw new Error("Selecciona un perfil y escribe el motivo obligatorio.");
    }
    profile.stamps = Math.max(0, profile.stamps + input.stampDelta);
    this.events.push({
      type: "assisted_adjustment",
      profileId: profile.id,
      occurredAt: this.clock().toISOString(),
      reason: `${input.actorId}: ${input.reason.trim()}`,
    });
  }

  anonymize(profileId: string): void {
    const profile = this.profiles.get(profileId);
    if (!profile) return;
    profile.status = "anonymized";
    this.contacts.delete(`${profile.tenantId}:${profile.contact}`);
    for (const [credential, id] of this.credentials) {
      if (id === profileId) this.credentials.delete(credential);
    }
    profile.contact = "";
    profile.contactMasked = "";
    profile.programAlias = "Perfil eliminado";
    this.events.push({
      type: "anonymized",
      profileId,
      occurredAt: this.clock().toISOString(),
    });
  }

  cashierProfiles() {
    return [...this.profiles.values()]
      .filter((profile) => profile.status === "active")
      .map((profile) => ({
        id: profile.id,
        maskedIdentity: maskLoyaltyRecognition(profile.programAlias),
        contactMasked: profile.contactMasked,
        stamps: profile.stamps,
      }));
  }

  metrics() {
    const active = [...this.profiles.values()].filter(
      (profile) => profile.status === "active",
    );
    const visits = active.flatMap((profile) => profile.visits);
    const returning = active.filter(
      (profile) => profile.visits.length > 1,
    ).length;
    const recognitionAttempts = this.events.filter(
      (event) =>
        event.type === "recognized" ||
        event.type === "recovered_after_missing_credential",
    ).length;
    const recovered = this.events.filter(
      (event) => event.type === "recovered_after_missing_credential",
    ).length;
    return {
      activeProfiles: active.length,
      returningProfiles: returning,
      averageVisitFrequency:
        active.length === 0
          ? 0
          : Math.round((visits.length / active.length) * 10) / 10,
      rewardsRedeemed: active.reduce(
        (sum, profile) => sum + profile.rewardsRedeemed,
        0,
      ),
      rewardReferenceValueClp: active.reduce(
        (sum, profile) => sum + profile.rewardReferenceClp,
        0,
      ),
      rewardKnownCostClp: active.reduce(
        (sum, profile) => sum + profile.rewardKnownCostClp,
        0,
      ),
      dormantProfiles: active.filter((profile) => {
        const last = profile.visits.at(-1)?.occurredAt;
        return last
          ? this.clock().getTime() - Date.parse(last) > 45 * 86_400_000
          : false;
      }).length,
      identityLossRatePercent: identityLossRate({
        recognizedAttempts: recognitionAttempts,
        recoveredAfterMissingCredential: recovered,
      }),
      identityRecoveries: recovered,
    };
  }

  seedProgress(profileId: string, stamps: number): void {
    const profile = this.profiles.get(profileId);
    if (profile) profile.stamps = stamps;
  }

  private profileForCredential(tenantId: string, credential: string) {
    const profileId = this.credentials.get(credential);
    const profile = profileId ? this.profiles.get(profileId) : undefined;
    return profile?.tenantId === tenantId && profile.status === "active"
      ? profile
      : undefined;
  }
}

const globalStore = globalThis as typeof globalThis & {
  __tablioLoyaltyDemo?: LoyaltyDemoStore;
};

export const loyaltyDemoStore =
  globalStore.__tablioLoyaltyDemo ?? new LoyaltyDemoStore();
globalStore.__tablioLoyaltyDemo = loyaltyDemoStore;
loyaltyDemoStore.configureDemo();
