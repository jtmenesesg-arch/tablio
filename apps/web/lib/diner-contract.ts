export type ProductVariant = Readonly<{
  id: string;
  name: string;
  priceDeltaClp: number;
}>;

export type DinerProduct = Readonly<{
  id: string;
  categoryId: string;
  name: string;
  description: string;
  priceClp: number;
  imageUrl: string;
  imageAlt: string;
  allergens: readonly string[];
  available: boolean;
  trackStock: boolean;
  variants: readonly ProductVariant[];
}>;

export type CartLine = Readonly<{
  id: string;
  productId: string;
  productName: string;
  variantId?: string;
  variantName?: string;
  quantity: number;
  note?: string;
  unitPriceClp: number;
  originalUnitPriceClp?: number;
  unitDiscountClp?: number;
  lineTotalClp: number;
  isLoyaltyReward?: boolean;
  referenceUnitPriceClp?: number;
  isUpsell?: boolean;
  upsellRuleId?: string;
  promotionLabel?: string;
  invitationTargetTableId?: string;
  invitationTargetTableName?: string;
}>;

export type DinerQuote = Readonly<{
  id: string;
  subtotalClp: number;
  discountClp: number;
  promotionDiscountClp: number;
  upsellIncrementalClp: number;
  taxClp: number;
  tipClp: number;
  totalClp: number;
  tipRecipient: Readonly<{
    type: "team" | "employee";
    employeeId?: string;
    employeeSessionId?: string;
    label: string;
  }>;
  expiresAt: string;
  status: "active" | "paid" | "expired";
}>;

export type TicketStatus =
  "queued" | "acknowledged" | "in_preparation" | "ready" | "completed";

export type DinerTicket = Readonly<{
  id: string;
  stationName: string;
  status: TicketStatus;
  itemNames: readonly string[];
}>;

export type DinerOrder = Readonly<{
  id: string;
  number: number;
  alias: string;
  displayName?: string;
  totalClp: number;
  discountClp?: number;
  upsellIncrementalClp?: number;
  tipRecipientLabel?: string;
  state: "confirmed" | "accepted" | "in_preparation" | "ready" | "delivered";
  confirmedAt: string;
  tickets: readonly DinerTicket[];
  taxDocument: Readonly<{
    status: "pending" | "issued" | "failed";
    message: string;
    folio?: string;
    representationUrl?: string;
  }>;
}>;

export type ServiceAction = Readonly<{
  id: string;
  label: string;
  description: string;
  icon: "hand" | "water" | "cutlery" | "warning";
  cooldownSeconds: number;
  lastRequestedAt?: string;
}>;

export type WaiterPaymentRequest = Readonly<{
  id: string;
  requestedAt: string;
  status: "notified";
  message: string;
}>;

export type DinerBootstrap = Readonly<{
  demo: true;
  authenticated: boolean;
  ordering: {
    available: boolean;
    message?: string;
  };
  venue: {
    id: string;
    name: string;
    tableId: string;
    tableName: string;
    currency: "CLP";
    tipSuggestions: readonly number[];
  };
  session?: {
    id: string;
    alias: string;
    displayName?: string;
    idleExpiresAt: string;
    absoluteExpiresAt: string;
  };
  categories: readonly { id: string; name: string }[];
  products: readonly DinerProduct[];
  cart: {
    id: string;
    lines: readonly CartLine[];
    subtotalClp: number;
  };
  quote?: DinerQuote;
  payment?: {
    id: string;
    status: "pending" | "confirmed" | "rejected";
  };
  orders: readonly DinerOrder[];
  actions: readonly ServiceAction[];
  waiterPaymentRequest?: WaiterPaymentRequest;
  loyalty: Readonly<{
    enabled: boolean;
    visitsRequired: number;
    recognition?: Readonly<{
      maskedIdentity: string;
    }>;
    profile?: Readonly<{
      id: string;
      maskedIdentity: string;
      contactMasked: string;
      stamps: number;
      rewardAvailable: boolean;
      rewardProductName: string;
    }>;
    favorite?: Readonly<{
      productId: string;
      productName: string;
      quantity: number;
    }>;
    enrollmentAvailable: boolean;
    recoveryAlwaysAvailable: true;
    challenge?: Readonly<{
      id: string;
      purpose: "enroll" | "recover";
      maskedDestination: string;
      demoCode: string;
    }>;
    identityLossMessage?: string;
  }>;
  engagement: Readonly<{
    settings: Readonly<{
      upsellEnabled: boolean;
      invitationsEnabled: boolean;
      promotionEnabled: boolean;
      waiterTipEnabled: boolean;
      invitationClaimTtlMinutes: number;
    }>;
    promotion?: Readonly<{
      id: string;
      version: number;
      name: string;
      description: string;
    }>;
    upsellSuggestions: readonly Readonly<{
      ruleId: string;
      productId: string;
      productName: string;
      priceClp: number;
    }>[];
    tipRecipients: readonly Readonly<{
      employeeId: string;
      employeeSessionId: string;
      displayName: string;
    }>[];
    invitationTargets: readonly Readonly<{
      tableId: string;
      tableName: string;
      label: string;
    }>[];
    sentInvitations: readonly DinerInvitation[];
    receivedInvitations: readonly DinerInvitation[];
  }>;
  serverTime: string;
}>;

export type DinerInvitation = Readonly<{
  id: string;
  direction: "sent" | "received";
  inviterAlias: string;
  destinationTableName: string;
  productName: string;
  amountClp: number;
  state: "pending_claim" | "claimed" | "refunded" | "expired";
  expiresAt: string;
  warningAt: string;
  expiringSoon: boolean;
  canCancel: boolean;
}>;

export type DinerMutation =
  | {
      action: "join";
      qrToken: string;
      presenceCode: string;
    }
  | {
      action: "cart.add";
      productId: string;
      variantId?: string;
      quantity: number;
      note?: string;
      invitationTargetTableId?: string;
    }
  | {
      action: "cart.update";
      lineId: string;
      quantity: number;
    }
  | {
      action: "cart.remove";
      lineId: string;
    }
  | {
      action: "quote.create";
      tipClp: number;
      displayName?: string;
      customerEmail?: string;
      tipRecipientEmployeeId?: string;
      idempotencyKey: string;
    }
  | {
      action: "payment.start";
      quoteId: string;
      idempotencyKey: string;
    }
  | {
      action: "waiter.pay";
    }
  | {
      action: "service.request";
      serviceActionId: string;
    }
  | {
      action: "loyalty.recognition.confirm";
    }
  | {
      action: "loyalty.recognition.reject";
    }
  | {
      action: "loyalty.challenge.start";
      purpose: "enroll" | "recover";
      channel: "phone" | "email";
      contact: string;
      identificationConsent: boolean;
      contactConsent: boolean;
    }
  | {
      action: "loyalty.challenge.verify";
      challengeId: string;
      code: string;
    }
  | {
      action: "loyalty.reward.add";
    }
  | {
      action: "loyalty.favorite.add";
    }
  | {
      action: "loyalty.revoke";
    }
  | {
      action: "upsell.accept";
      ruleId: string;
      productId: string;
    }
  | {
      action: "upsell.dismiss";
      ruleId: string;
    }
  | {
      action: "invitation.claim";
      invitationId: string;
    }
  | {
      action: "invitation.cancel";
      invitationId: string;
    };
