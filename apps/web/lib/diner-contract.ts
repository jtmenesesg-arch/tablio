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
  lineTotalClp: number;
}>;

export type DinerQuote = Readonly<{
  id: string;
  subtotalClp: number;
  taxClp: number;
  tipClp: number;
  totalClp: number;
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
  venue: {
    id: string;
    name: string;
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
  serverTime: string;
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
    };
