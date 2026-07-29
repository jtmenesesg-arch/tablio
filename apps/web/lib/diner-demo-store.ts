import "server-only";

import { randomUUID } from "node:crypto";
import {
  InMemoryPaymentEventStore,
  SimulatedPaymentGateway,
} from "@tablio/payments-simulated";
import {
  assertInvitationCapacity,
  canClaimInvitation,
  freezePromotion,
  invitationExpiresAt,
  invitationWarningAt,
  PaymentEventProcessor,
  selectUpsells,
} from "@tablio/application";
import { createDinerAlias } from "./diner-alias";
import {
  appendPaidOrderToKds,
  kdsProductAvailability,
  kdsTicketStates,
  mutateKds,
} from "./kds-demo-store";
import { publishKdsEvent } from "./kds-event-hub";
import {
  appendDinerPaymentTask,
  appendDinerServiceTask,
} from "./waiter-demo-store";
import type {
  CartLine,
  DinerBootstrap,
  DinerMutation,
  DinerOrder,
  DinerProduct,
  DinerQuote,
  ServiceAction,
  TicketStatus,
  WaiterPaymentRequest,
} from "./diner-contract";
import { demoReceiptForOrder, enqueueDemoReceipt } from "./tax-demo-service";
import { getDinerOrderingAvailability } from "./platform-demo-store";
import { loyaltyDemoStore, LOYALTY_DEMO_TENANT_ID } from "./loyalty-demo-store";

const TENANT_ID = "00000000-0000-4000-8000-000000000301";
const MERCHANT_ACCOUNT_ID = "demo-merchant:bar-la-esquina";
const TABLES = {
  "demo-mesa-8": {
    id: "mesa-8",
    name: "Mesa 8",
    zoneId: "terraza",
    presenceCode: "4826",
  },
  "demo-mesa-9": {
    id: "mesa-9",
    name: "Mesa 9",
    zoneId: "salon",
    presenceCode: "9174",
  },
} as const;
const IDLE_TTL_MS = 4 * 60 * 60 * 1000;
const ABSOLUTE_TTL_MS = 12 * 60 * 60 * 1000;
const QUOTE_TTL_MS = 10 * 60 * 1000;

type MutableProduct = Omit<DinerProduct, "available"> & {
  available: boolean;
  unitCostClp?: number;
  stock?: number;
  reserved: number;
};
type MutableCart = {
  id: string;
  state: "open" | "checkout_started" | "converted_to_order";
  lines: Array<{
    id: string;
    productId: string;
    variantId?: string;
    quantity: number;
    note?: string;
    isLoyaltyReward?: boolean;
    isUpsell?: boolean;
    upsellRuleId?: string;
    invitationTargetTableId?: string;
  }>;
};
type MutableSession = {
  id: string;
  token: string;
  alias: string;
  tableId: string;
  tableName: string;
  zoneId: string;
  displayName?: string;
  customerEmail?: string;
  createdAt: number;
  lastSeenAt: number;
  idleExpiresAt: number;
  absoluteExpiresAt: number;
  cart: MutableCart;
  quote?: DinerQuote;
  quoteSnapshotLines?: CartLine[];
  payment?: {
    id: string;
    providerPaymentId: string;
    quoteId: string;
    status: "pending" | "confirmed" | "rejected";
    settlesAt: number;
  };
  orders: DinerOrder[];
  actionRequests: Map<string, { id: string; requestedAt: number }>;
  waiterPaymentRequest?: WaiterPaymentRequest;
  loyaltyProfileId?: string;
  loyaltyRecognitionProfileId?: string;
  loyaltyChallenge?: DinerBootstrap["loyalty"]["challenge"];
  lastPaidOrder?: {
    id: string;
    paidClp: number;
    productIds: string[];
  };
  dismissedUpsellRuleIds: Set<string>;
};

type MutableInvitation = {
  id: string;
  payerSessionId: string;
  destinationTableId: string;
  destinationTableName: string;
  sourceOrderId: string;
  sourceOrderNumber: number;
  providerPaymentId: string;
  productId: string;
  variantId?: string;
  stationId: "barra" | "cocina";
  stationName: string;
  inviterAlias: string;
  productName: string;
  quantity: number;
  amountClp: number;
  state: "pending_claim" | "claimed" | "refunded" | "expired";
  expiresAt: string;
  warningAt: string;
  claimedBySessionId?: string;
  refundId?: string;
};

type TipAllocation = {
  paymentId: string;
  employeeId?: string;
  employeeSessionId?: string;
  employeeName: string;
  paymentMethod: string;
  amountClp: number;
  occurredAt: string;
};

type DemoState = {
  products: Map<string, MutableProduct>;
  sessions: Map<string, MutableSession>;
  quoteIdempotency: Map<string, string>;
  paymentIdempotency: Map<string, string>;
  orderSequence: number;
  gateway: SimulatedPaymentGateway;
  eventStore: InMemoryPaymentEventStore;
  paymentProcessor: PaymentEventProcessor;
  issuedLoyaltyCredentials: Map<string, string | null>;
  promotionEnabled: boolean;
  promotionVersion: number;
  upsellExposures: Set<string>;
  upsellAccepted: number;
  upsellPaidClp: number;
  promotionDiscountClp: number;
  invitations: Map<string, MutableInvitation>;
  tipAllocations: TipAllocation[];
  closedTableIds: Set<string>;
};

const categories = Object.freeze([
  { id: "beer", name: "Cervezas" },
  { id: "kitchen", name: "Cocina" },
  { id: "sharing", name: "Para compartir" },
  { id: "cocktails", name: "Cócteles" },
]);

const productSeed: readonly MutableProduct[] = [
  {
    id: "lager-casa",
    categoryId: "beer",
    name: "Lager de la casa",
    description: "Fresca, ligera y servida bien fría.",
    priceClp: 4500,
    imageUrl: "/menu/beer.jpg",
    imageAlt: "Pinta de cerveza lager en un bar",
    allergens: ["Gluten"],
    available: true,
    trackStock: false,
    variants: [
      { id: "lager-330", name: "330 cc", priceDeltaClp: 0 },
      { id: "lager-500", name: "500 cc", priceDeltaClp: 1500 },
    ],
    reserved: 0,
  },
  {
    id: "burger-clasica",
    categoryId: "kitchen",
    name: "Hamburguesa clásica",
    description: "Carne, queso, pepinillos y salsa de la casa.",
    priceClp: 8900,
    imageUrl: "/menu/burger.jpg",
    imageAlt: "Hamburguesa con papas y cerveza",
    allergens: ["Gluten", "Leche", "Huevo"],
    available: true,
    trackStock: true,
    variants: [
      { id: "burger-carne", name: "Carne", priceDeltaClp: 0 },
      { id: "burger-veggie", name: "Vegetariana", priceDeltaClp: 500 },
    ],
    stock: 8,
    reserved: 0,
  },
  {
    id: "papas-romero",
    categoryId: "sharing",
    name: "Papas crujientes",
    description: "Con romero, sal de mar y salsa de ajo.",
    priceClp: 5900,
    imageUrl: "/menu/fries.jpg",
    imageAlt: "Papas fritas doradas y crujientes",
    allergens: ["Leche"],
    available: true,
    trackStock: true,
    unitCostClp: 1_700,
    variants: [],
    stock: 12,
    reserved: 0,
  },
  {
    id: "spritz-citrico",
    categoryId: "cocktails",
    name: "Spritz cítrico",
    description: "Naranja, romero y burbujas.",
    priceClp: 6800,
    imageUrl: "/menu/cocktail.jpg",
    imageAlt: "Cóctel naranja con hielo y romero",
    allergens: [],
    available: true,
    trackStock: false,
    variants: [
      { id: "spritz-alcohol", name: "Clásico", priceDeltaClp: 0 },
      { id: "spritz-zero", name: "Sin alcohol", priceDeltaClp: -800 },
    ],
    reserved: 0,
  },
];

const DEMO_PROMOTION = {
  id: "happy-papas",
  name: "Happy hour papas",
  kind: "percentage" as const,
  percentageBps: 2_000,
};

const DEMO_UPSELL_RULES = [
  {
    id: "lager-to-papas",
    enabled: true,
    priority: 1,
    kind: "product" as const,
    sourceProductId: "lager-casa",
    suggestionProductId: "papas-romero",
  },
  {
    id: "manual-spritz",
    enabled: true,
    priority: 2,
    kind: "manual" as const,
    suggestionProductId: "spritz-citrico",
  },
] as const;

const DEMO_WAITERS = [
  {
    employeeId: "waiter-elena",
    employeeSessionId: "waiter-shift-elena",
    displayName: "Elena",
    zoneIds: ["terraza"],
    active: true,
  },
  {
    employeeId: "waiter-diego",
    employeeSessionId: "waiter-shift-diego",
    displayName: "Diego",
    zoneIds: ["salon"],
    active: true,
  },
] as const;

const actionSeed: readonly Omit<ServiceAction, "lastRequestedAt">[] = [
  {
    id: "call-waiter",
    label: "Llamar al garzón",
    description: "Para pedir ayuda en la mesa",
    icon: "hand",
    cooldownSeconds: 90,
  },
  {
    id: "water",
    label: "Pedir agua",
    description: "Avisamos al equipo",
    icon: "water",
    cooldownSeconds: 90,
  },
  {
    id: "cutlery",
    label: "Pedir cubiertos",
    description: "Avisamos al equipo",
    icon: "cutlery",
    cooldownSeconds: 90,
  },
  {
    id: "problem",
    label: "Reportar un problema",
    description: "Alguien se acercará a la mesa",
    icon: "warning",
    cooldownSeconds: 45,
  },
];

function newCart(): MutableCart {
  return { id: randomUUID(), state: "open", lines: [] };
}

function createState(): DemoState {
  const gateway = new SimulatedPaymentGateway(
    "tablio-diner-demo-webhook-secret",
  );
  const eventStore = new InMemoryPaymentEventStore();
  return {
    products: new Map(
      productSeed.map((product) => [
        product.id,
        { ...product, variants: [...product.variants] },
      ]),
    ),
    sessions: new Map(),
    quoteIdempotency: new Map(),
    paymentIdempotency: new Map(),
    orderSequence: 100,
    gateway,
    eventStore,
    paymentProcessor: new PaymentEventProcessor(gateway, eventStore),
    issuedLoyaltyCredentials: new Map(),
    promotionEnabled: false,
    promotionVersion: 1,
    upsellExposures: new Set(),
    upsellAccepted: 0,
    upsellPaidClp: 0,
    promotionDiscountClp: 0,
    invitations: new Map(),
    tipAllocations: [],
    closedTableIds: new Set(),
  };
}

const globalStore = globalThis as typeof globalThis & {
  __tablioDinerDemo?: DemoState;
};

const state = globalStore.__tablioDinerDemo ?? createState();
globalStore.__tablioDinerDemo = state;

function now(): number {
  return Date.now();
}

function ensureSession(token: string | undefined): MutableSession {
  if (!token) throw new DinerError("Vuelve a confirmar tu mesa.", 401);
  const session = state.sessions.get(token);
  const currentTime = now();
  if (
    !session ||
    session.idleExpiresAt <= currentTime ||
    session.absoluteExpiresAt <= currentTime
  ) {
    if (session) state.sessions.delete(token);
    throw new DinerError("Tu sesión venció. Confirma la mesa otra vez.", 401);
  }
  session.lastSeenAt = currentTime;
  session.idleExpiresAt = Math.min(
    currentTime + IDLE_TTL_MS,
    session.absoluteExpiresAt,
  );
  return session;
}

function productAvailable(product: MutableProduct): boolean {
  return (
    (kdsProductAvailability(product.id) ?? product.available) &&
    (!product.trackStock || (product.stock ?? 0) - product.reserved > 0)
  );
}

function linePrice(
  product: MutableProduct,
  variantId: string | undefined,
): number {
  if (!variantId) return product.priceClp;
  const variant = product.variants.find(
    (candidate) => candidate.id === variantId,
  );
  if (!variant) throw new DinerError("Esa opción ya no está disponible.", 409);
  return product.priceClp + variant.priceDeltaClp;
}

function cartLines(cart: MutableCart): CartLine[] {
  return cart.lines.map((line) => {
    const product = state.products.get(line.productId);
    if (!product) throw new DinerError("Producto no encontrado.", 404);
    const variant = product.variants.find(
      (candidate) => candidate.id === line.variantId,
    );
    const referenceUnitPriceClp = linePrice(product, line.variantId);
    const promotion = state.promotionEnabled
      ? freezePromotion({
          promotion: {
            ...DEMO_PROMOTION,
            version: state.promotionVersion,
            enabled: true,
            productIds: ["papas-romero"],
            categoryIds: [],
            startsAt: "2020-01-01T00:00:00.000Z",
            endsAt: "2035-01-01T00:00:00.000Z",
          },
          product,
          quantity: line.quantity,
          now: new Date().toISOString(),
        })
      : undefined;
    const originalUnitPriceClp = line.isLoyaltyReward
      ? 0
      : referenceUnitPriceClp;
    const unitDiscountClp = line.isLoyaltyReward
      ? 0
      : (promotion?.unitDiscountClp ?? 0);
    const unitPriceClp = Math.max(0, originalUnitPriceClp - unitDiscountClp);
    const target = line.invitationTargetTableId
      ? Object.values(TABLES).find(
          (table) => table.id === line.invitationTargetTableId,
        )
      : undefined;
    return {
      id: line.id,
      productId: line.productId,
      productName: product.name,
      variantId: line.variantId,
      variantName: variant?.name,
      quantity: line.quantity,
      note: line.note,
      unitPriceClp,
      originalUnitPriceClp,
      unitDiscountClp,
      lineTotalClp: unitPriceClp * line.quantity,
      isLoyaltyReward: line.isLoyaltyReward,
      referenceUnitPriceClp: line.isLoyaltyReward
        ? referenceUnitPriceClp
        : undefined,
      isUpsell: line.isUpsell,
      upsellRuleId: line.upsellRuleId,
      promotionLabel: promotion ? DEMO_PROMOTION.name : undefined,
      invitationTargetTableId: line.invitationTargetTableId,
      invitationTargetTableName: target?.name,
    };
  });
}

function checkoutLines(session: MutableSession): CartLine[] {
  return session.quote?.status === "active" && session.quoteSnapshotLines
    ? session.quoteSnapshotLines
    : cartLines(session.cart);
}

function tipRecipients(session: MutableSession) {
  return DEMO_WAITERS.filter(
    (waiter) =>
      waiter.active &&
      waiter.zoneIds.some((zoneId) => zoneId === session.zoneId),
  ).map(({ employeeId, employeeSessionId, displayName }) => ({
    employeeId,
    employeeSessionId,
    displayName,
  }));
}

function upsellSuggestions(session: MutableSession) {
  if (session.cart.state !== "open") return [];
  const lines = cartLines(session.cart);
  const products = [...state.products.values()];
  const selected = selectUpsells({
    rules: DEMO_UPSELL_RULES.filter(
      (rule) => !session.dismissedUpsellRuleIds.has(rule.id),
    ),
    products: products.map((product) => ({
      id: product.id,
      categoryId: product.categoryId,
      available: productAvailable(product),
      priceClp: product.priceClp,
      unitCostClp: product.unitCostClp,
    })),
    cartProductIds: lines.map((line) => line.productId),
    cartCategoryIds: lines.map(
      (line) => state.products.get(line.productId)?.categoryId ?? "",
    ),
    minuteOfDay: new Date().getHours() * 60 + new Date().getMinutes(),
    maxSuggestions: 2,
  });
  return selected.map((product) => {
    const rule = DEMO_UPSELL_RULES.find(
      (candidate) => candidate.suggestionProductId === product.id,
    )!;
    state.upsellExposures.add(`${session.id}:${session.cart.id}:${rule.id}`);
    return {
      ruleId: rule.id,
      productId: product.id,
      productName: state.products.get(product.id)!.name,
      priceClp: product.priceClp,
    };
  });
}

function stationFor(product: MutableProduct): {
  id: "barra" | "cocina";
  name: string;
} {
  return product.categoryId === "beer" || product.categoryId === "cocktails"
    ? { id: "barra", name: "Barra" }
    : { id: "cocina", name: "Cocina" };
}

function liveOrders(session: MutableSession): DinerOrder[] {
  const ticketStates = kdsTicketStates(
    session.orders.flatMap((order) => order.tickets.map((ticket) => ticket.id)),
  );
  return session.orders.map((order) => {
    const tickets = order.tickets.map((ticket) => ({
      ...ticket,
      status: (ticketStates.get(ticket.id) ?? ticket.status) as TicketStatus,
    }));
    const stateNames = tickets.map((ticket) => ticket.status);
    const orderState = stateNames.every((status) => status === "ready")
      ? "ready"
      : stateNames.some(
            (status) => status === "in_preparation" || status === "ready",
          )
        ? "in_preparation"
        : "confirmed";
    const taxDocument = demoReceiptForOrder(order.id);
    return { ...order, state: orderState, tickets, taxDocument };
  });
}

async function settleDuePayment(session: MutableSession): Promise<void> {
  const payment = session.payment;
  if (!payment || payment.status !== "pending" || payment.settlesAt > now())
    return;
  const quote = session.quote;
  if (!quote || quote.id !== payment.quoteId || quote.status !== "active") {
    payment.status = "rejected";
    return;
  }

  const scope = { tenantId: TENANT_ID, merchantAccountId: MERCHANT_ACCOUNT_ID };
  state.gateway.setPaymentOutcome(
    scope,
    payment.providerPaymentId,
    "confirmed",
  );
  const signed = state.gateway.createSignedWebhook({
    providerPaymentId: payment.providerPaymentId,
    eventKind: "payment.confirmed",
  });
  const processed = await state.paymentProcessor.handle(scope, signed.envelope);
  if (processed.payment.status !== "confirmed") {
    payment.status = "rejected";
    return;
  }

  const sourceLines = session.quoteSnapshotLines ?? cartLines(session.cart);
  const stations = new Map<
    string,
    {
      name: string;
      items: Array<{
        id: string;
        name: string;
        quantity: number;
        note?: string;
        isLoyaltyReward?: boolean;
      }>;
    }
  >();
  for (const line of sourceLines.filter(
    (candidate) => !candidate.invitationTargetTableId,
  )) {
    const product = state.products.get(line.productId);
    if (!product) continue;
    const station = stationFor(product);
    const group = stations.get(station.id) ?? {
      name: station.name,
      items: [],
    };
    group.items.push({
      id: line.id,
      name: `${line.productName}${line.variantName ? ` · ${line.variantName}` : ""}`,
      quantity: line.quantity,
      note: line.note,
      isLoyaltyReward: line.isLoyaltyReward,
    });
    stations.set(station.id, group);
    if (product.trackStock) {
      product.reserved -= line.quantity;
      product.stock = (product.stock ?? 0) - line.quantity;
    }
  }

  const confirmedAt = new Date().toISOString();
  const orderId = randomUUID();
  const orderNumber = ++state.orderSequence;
  const kdsTickets = [...stations.entries()].map(
    ([stationId, station], index) => ({
      id: `${orderId}:${stationId}:${index}`,
      stationId,
      stationName: station.name,
      items: station.items,
    }),
  );
  const order: DinerOrder = {
    id: orderId,
    number: orderNumber,
    alias: session.alias,
    displayName: session.displayName,
    totalClp: quote.totalClp,
    discountClp: quote.discountClp,
    upsellIncrementalClp: quote.upsellIncrementalClp,
    tipRecipientLabel: quote.tipRecipient.label,
    state: "confirmed",
    confirmedAt,
    tickets: kdsTickets.map((ticket) => ({
      id: ticket.id,
      stationName: ticket.stationName,
      status: "queued",
      itemNames: ticket.items.map((item) => `${item.quantity}× ${item.name}`),
    })),
    taxDocument: {
      status: "pending",
      message: "Tu boleta se está emitiendo. Tu pedido ya está confirmado.",
    },
  };
  appendPaidOrderToKds({
    orderId,
    orderNumber,
    amountClp: quote.totalClp,
    tableName: session.tableName,
    alias: session.alias,
    displayName: session.displayName,
    confirmedAt,
    tickets: kdsTickets,
  });
  session.orders.unshift(order);
  enqueueDemoReceipt({
    orderId,
    amountClp: quote.totalClp,
    customerEmail: session.customerEmail,
    lines: [
      ...sourceLines.map((line) => ({
        description: `${line.productName}${
          line.variantName ? ` · ${line.variantName}` : ""
        }${line.promotionLabel ? ` · ${line.promotionLabel}` : ""}${
          line.invitationTargetTableName
            ? ` · Invitación para ${line.invitationTargetTableName}`
            : ""
        }`,
        quantity: line.quantity,
        unitAmountClp: line.unitPriceClp,
        isLoyaltyReward: Boolean(line.isLoyaltyReward),
      })),
      ...(quote.tipClp > 0
        ? [
            {
              description: "Propina",
              quantity: 1,
              unitAmountClp: quote.tipClp,
              isLoyaltyReward: false,
            },
          ]
        : []),
    ],
  });
  payment.status = "confirmed";
  state.upsellPaidClp += quote.upsellIncrementalClp;
  state.promotionDiscountClp += quote.promotionDiscountClp;
  state.tipAllocations.push({
    paymentId: payment.id,
    employeeId: quote.tipRecipient.employeeId,
    employeeSessionId: quote.tipRecipient.employeeSessionId,
    employeeName: quote.tipRecipient.label,
    paymentMethod: "Tarjeta demo",
    amountClp: quote.tipClp,
    occurredAt: confirmedAt,
  });

  for (const line of sourceLines.filter(
    (candidate) => candidate.invitationTargetTableId,
  )) {
    const product = state.products.get(line.productId);
    const target = Object.values(TABLES).find(
      (table) => table.id === line.invitationTargetTableId,
    );
    if (!product || !target) continue;
    const expiresAt = invitationExpiresAt({
      now: confirmedAt,
      ttlMinutes: 60,
    });
    const station = stationFor(product);
    const invitation: MutableInvitation = {
      id: randomUUID(),
      payerSessionId: session.id,
      destinationTableId: target.id,
      destinationTableName: target.name,
      sourceOrderId: orderId,
      sourceOrderNumber: orderNumber,
      providerPaymentId: payment.providerPaymentId,
      productId: product.id,
      variantId: line.variantId,
      stationId: station.id,
      stationName: station.name,
      inviterAlias: session.alias,
      productName: line.productName,
      quantity: line.quantity,
      amountClp: line.lineTotalClp,
      state: "pending_claim",
      expiresAt,
      warningAt: invitationWarningAt(expiresAt),
    };
    state.invitations.set(invitation.id, invitation);
  }
  loyaltyDemoStore.recordConfirmedPayment({
    profileId: session.loyaltyProfileId,
    orderId,
    paidClp: quote.subtotalClp,
    productIds: sourceLines
      .filter((line) => !line.isLoyaltyReward)
      .map((line) => line.productId),
  });
  const rewardLine = sourceLines.find((line) => line.isLoyaltyReward);
  if (rewardLine && session.loyaltyProfileId) {
    loyaltyDemoStore.completeReward({
      profileId: session.loyaltyProfileId,
      cartId: session.cart.id,
      referenceValueClp: rewardLine.referenceUnitPriceClp ?? 0,
      optionalUnitCostClp: state.products.get(rewardLine.productId)
        ?.unitCostClp,
    });
  }
  session.lastPaidOrder = {
    id: orderId,
    paidClp: quote.subtotalClp,
    productIds: sourceLines
      .filter((line) => !line.isLoyaltyReward)
      .map((line) => line.productId),
  };
  session.quote = Object.freeze({ ...quote, status: "paid" });
  session.quoteSnapshotLines = undefined;
  session.cart.state = "converted_to_order";
  session.cart = newCart();
  session.waiterPaymentRequest = undefined;
}

function releaseQuote(session: MutableSession): void {
  if (!session.quote || session.quote.status !== "active") return;
  for (const line of session.cart.lines) {
    const product = state.products.get(line.productId);
    if (product?.trackStock) {
      product.reserved = Math.max(0, product.reserved - line.quantity);
    }
  }
  if (session.loyaltyProfileId) {
    loyaltyDemoStore.releaseReward(session.loyaltyProfileId, session.cart.id);
  }
  session.quote = undefined;
  session.quoteSnapshotLines = undefined;
  session.payment = undefined;
  session.cart.state = "open";
}

function serialize(session: MutableSession | undefined): DinerBootstrap {
  const lines = session ? checkoutLines(session) : [];
  const currentTime = new Date().toISOString();
  const ordering = getDinerOrderingAvailability();
  const loyaltyProfile = loyaltyDemoStore.profile(session?.loyaltyProfileId);
  const favorite = loyaltyDemoStore.favorite(session?.loyaltyProfileId);
  const favoriteProduct = favorite
    ? state.products.get(favorite.productId)
    : undefined;
  const recognition = session?.loyaltyRecognitionProfileId
    ? loyaltyDemoStore.profile(session.loyaltyRecognitionProfileId)
    : undefined;
  return {
    demo: true,
    authenticated: Boolean(session),
    ordering: {
      available: ordering.orderingAvailable,
      message: ordering.message,
    },
    venue: {
      id: "bar-la-esquina",
      name: "Bar La Esquina",
      tableId: session?.tableId ?? "mesa-8",
      tableName: session?.tableName ?? "Mesa 8",
      currency: "CLP",
      tipSuggestions: [0, 10, 12],
    },
    session: session
      ? {
          id: session.id,
          alias: session.alias,
          displayName: session.displayName,
          idleExpiresAt: new Date(session.idleExpiresAt).toISOString(),
          absoluteExpiresAt: new Date(session.absoluteExpiresAt).toISOString(),
        }
      : undefined,
    categories,
    products: [...state.products.values()].map((product) => ({
      ...product,
      unitCostClp: undefined,
      available: productAvailable(product),
      stock: undefined,
      reserved: undefined,
    })),
    cart: {
      id: session?.cart.id ?? "not-started",
      lines,
      subtotalClp: lines.reduce((sum, line) => sum + line.lineTotalClp, 0),
    },
    quote: session?.quote?.status === "active" ? session.quote : undefined,
    payment:
      session?.payment?.status === "pending" ||
      session?.payment?.status === "rejected"
        ? {
            id: session.payment.id,
            status: session.payment.status,
          }
        : undefined,
    orders: session ? liveOrders(session) : [],
    actions: actionSeed.map((action) => ({
      ...action,
      lastRequestedAt: session?.actionRequests.has(action.id)
        ? new Date(
            session.actionRequests.get(action.id)!.requestedAt,
          ).toISOString()
        : undefined,
    })),
    waiterPaymentRequest: session?.waiterPaymentRequest,
    loyalty: {
      enabled: loyaltyDemoStore.program().enabled,
      visitsRequired: loyaltyDemoStore.program().visitsRequired,
      recognition: recognition
        ? { maskedIdentity: recognition.maskedIdentity }
        : undefined,
      profile: loyaltyProfile,
      favorite:
        favorite && favoriteProduct && productAvailable(favoriteProduct)
          ? {
              productId: favorite.productId,
              productName: favoriteProduct.name,
              quantity: favorite.quantity,
            }
          : undefined,
      enrollmentAvailable: Boolean(
        session && !loyaltyProfile && session.orders.length > 0,
      ),
      recoveryAlwaysAvailable: true,
      challenge: session?.loyaltyChallenge,
      identityLossMessage:
        session?.loyaltyChallenge?.purpose === "recover"
          ? "Tus sellos se recuperan sin depender del teléfono anterior ni del equipo del bar."
          : undefined,
    },
    engagement: {
      settings: {
        upsellEnabled: true,
        invitationsEnabled: true,
        promotionEnabled: true,
        waiterTipEnabled: true,
        invitationClaimTtlMinutes: 60,
      },
      promotion: state.promotionEnabled
        ? {
            id: DEMO_PROMOTION.id,
            version: state.promotionVersion,
            name: DEMO_PROMOTION.name,
            description: "20% de descuento en papas, congelado en tu quote.",
          }
        : undefined,
      upsellSuggestions: session ? upsellSuggestions(session) : [],
      tipRecipients: session ? tipRecipients(session) : [],
      invitationTargets: session
        ? Object.values(TABLES).map((table) => ({
            tableId: table.id,
            tableName: table.name,
            label:
              table.id === session.tableId
                ? `Alguien de ${table.name}`
                : table.name,
          }))
        : [],
      sentInvitations: session
        ? [...state.invitations.values()]
            .filter((invitation) => invitation.payerSessionId === session.id)
            .map((invitation) => serializeInvitation(invitation, "sent"))
        : [],
      receivedInvitations: session
        ? [...state.invitations.values()]
            .filter(
              (invitation) =>
                invitation.destinationTableId === session.tableId &&
                invitation.payerSessionId !== session.id,
            )
            .map((invitation) => serializeInvitation(invitation, "received"))
        : [],
    },
    serverTime: currentTime,
  };
}

function serializeInvitation(
  invitation: MutableInvitation,
  direction: "sent" | "received",
) {
  return {
    id: invitation.id,
    direction,
    inviterAlias: invitation.inviterAlias,
    destinationTableName: invitation.destinationTableName,
    productName: invitation.productName,
    amountClp: invitation.amountClp,
    state: invitation.state,
    expiresAt: invitation.expiresAt,
    warningAt: invitation.warningAt,
    expiringSoon:
      invitation.state === "pending_claim" &&
      Date.parse(invitation.warningAt) <= now(),
    canCancel: direction === "sent" && invitation.state === "pending_claim",
  } as const;
}

async function refundInvitation(
  invitation: MutableInvitation,
  reason: "payer_cancelled" | "expired",
): Promise<void> {
  if (invitation.state !== "pending_claim") return;
  const refund = await state.gateway.refund({
    tenantId: TENANT_ID,
    merchantAccountId: MERCHANT_ACCOUNT_ID,
    providerPaymentId: invitation.providerPaymentId,
    idempotencyKey: `invitation:${invitation.id}:${reason}`,
    amount: { amount: invitation.amountClp, currency: "CLP" },
  });
  const product = state.products.get(invitation.productId);
  if (product?.trackStock) {
    product.reserved = Math.max(0, product.reserved - invitation.quantity);
  }
  invitation.state = reason === "expired" ? "expired" : "refunded";
  invitation.refundId = refund.refundId;
}

async function expireDueInvitations(): Promise<void> {
  for (const invitation of state.invitations.values()) {
    if (
      invitation.state === "pending_claim" &&
      Date.parse(invitation.expiresAt) <= now()
    ) {
      await refundInvitation(invitation, "expired");
    }
  }
}

export class DinerError extends Error {
  constructor(
    message: string,
    readonly status: number,
  ) {
    super(message);
  }
}

export async function getDinerBootstrap(
  token: string | undefined,
  qrToken: string,
  loyaltyCredential?: string,
): Promise<DinerBootstrap> {
  if (!(qrToken in TABLES)) throw new DinerError("Este QR no es válido.", 404);
  await expireDueInvitations();
  if (!token) return serialize(undefined);
  try {
    const session = ensureSession(token);
    if (!session.loyaltyProfileId && !session.loyaltyRecognitionProfileId) {
      session.loyaltyRecognitionProfileId = loyaltyDemoStore.recognition(
        TENANT_ID,
        loyaltyCredential,
      )?.profileId;
    }
    if (
      session.quote?.status === "active" &&
      Date.parse(session.quote.expiresAt) <= now()
    ) {
      releaseQuote(session);
    }
    await settleDuePayment(session);
    return serialize(session);
  } catch (error) {
    if (error instanceof DinerError && error.status === 401) {
      return serialize(undefined);
    }
    throw error;
  }
}

export function joinDinerSession(
  qrToken: string,
  presenceCode: string,
  loyaltyCredential?: string,
): { token: string; bootstrap: DinerBootstrap } {
  const table = TABLES[qrToken as keyof typeof TABLES];
  if (!table) throw new DinerError("Este QR no es válido.", 404);
  const ordering = getDinerOrderingAvailability();
  if (!ordering.orderingAvailable) {
    throw new DinerError(ordering.message!, 503);
  }
  if (presenceCode !== table.presenceCode) {
    throw new DinerError("Ese código no coincide con la mesa.", 403);
  }
  const currentTime = now();
  const token = randomUUID();
  const aliasesInUse = new Set(
    [...state.sessions.values()].map((session) => session.alias),
  );
  const session: MutableSession = {
    id: randomUUID(),
    token,
    alias: createDinerAlias(token, aliasesInUse),
    tableId: table.id,
    tableName: table.name,
    zoneId: table.zoneId,
    createdAt: currentTime,
    lastSeenAt: currentTime,
    idleExpiresAt: currentTime + IDLE_TTL_MS,
    absoluteExpiresAt: currentTime + ABSOLUTE_TTL_MS,
    cart: newCart(),
    orders: [],
    actionRequests: new Map(),
    dismissedUpsellRuleIds: new Set(),
    loyaltyRecognitionProfileId: loyaltyDemoStore.recognition(
      TENANT_ID,
      loyaltyCredential,
    )?.profileId,
  };
  state.sessions.set(token, session);
  return { token, bootstrap: serialize(session) };
}

export async function mutateDiner(
  token: string | undefined,
  mutation: Exclude<DinerMutation, { action: "join" }>,
): Promise<DinerBootstrap> {
  const session = ensureSession(token);
  await expireDueInvitations();
  await settleDuePayment(session);
  const ordering = getDinerOrderingAvailability();
  if (!ordering.orderingAvailable && mutation.action !== "service.request") {
    throw new DinerError(ordering.message!, 503);
  }

  switch (mutation.action) {
    case "cart.add": {
      if (session.cart.state !== "open") {
        throw new DinerError("Termina o cancela el checkout actual.", 409);
      }
      const product = state.products.get(mutation.productId);
      if (!product || !productAvailable(product)) {
        throw new DinerError("Este producto se acaba de agotar.", 409);
      }
      if (!Number.isSafeInteger(mutation.quantity) || mutation.quantity < 1) {
        throw new DinerError("La cantidad no es válida.", 400);
      }
      linePrice(product, mutation.variantId);
      if (mutation.invitationTargetTableId) {
        const target = Object.values(TABLES).find(
          (table) => table.id === mutation.invitationTargetTableId,
        );
        if (!target || state.closedTableIds.has(target.id)) {
          throw new DinerError("Elige otra mesa abierta para invitar.", 409);
        }
        try {
          assertInvitationCapacity({
            previousInvitedUnits: [...state.invitations.values()]
              .filter((invitation) => invitation.payerSessionId === session.id)
              .reduce((sum, invitation) => sum + invitation.quantity, 0),
            cartInvitedUnits: session.cart.lines
              .filter((line) => line.invitationTargetTableId)
              .reduce((sum, line) => sum + line.quantity, 0),
            requestedUnits: mutation.quantity,
            maxInvitedUnitsPerDeviceSession: 3,
          });
        } catch {
          throw new DinerError(
            "Puedes invitar hasta 3 productos durante esta sesión.",
            409,
          );
        }
      }
      const existing = session.cart.lines.find(
        (line) =>
          line.productId === mutation.productId &&
          line.variantId === mutation.variantId &&
          line.note === mutation.note &&
          line.invitationTargetTableId === mutation.invitationTargetTableId,
      );
      const requested = mutation.quantity + (existing?.quantity ?? 0);
      if (
        product.trackStock &&
        requested > (product.stock ?? 0) - product.reserved
      ) {
        throw new DinerError("No queda esa cantidad disponible.", 409);
      }
      if (existing) existing.quantity = requested;
      else {
        session.cart.lines.push({
          id: randomUUID(),
          productId: mutation.productId,
          variantId: mutation.variantId,
          quantity: mutation.quantity,
          note: mutation.note?.trim().slice(0, 140) || undefined,
          invitationTargetTableId: mutation.invitationTargetTableId,
        });
      }
      break;
    }
    case "cart.update": {
      if (session.cart.state !== "open") {
        throw new DinerError("El checkout ya empezó.", 409);
      }
      const line = session.cart.lines.find(
        (item) => item.id === mutation.lineId,
      );
      if (!line) throw new DinerError("Ese ítem ya no está en tu pedido.", 404);
      if (mutation.quantity <= 0) {
        session.cart.lines = session.cart.lines.filter(
          (item) => item.id !== mutation.lineId,
        );
      } else {
        const product = state.products.get(line.productId);
        if (
          !product ||
          !productAvailable(product) ||
          (product.trackStock &&
            mutation.quantity > (product.stock ?? 0) - product.reserved)
        ) {
          throw new DinerError("No queda esa cantidad disponible.", 409);
        }
        line.quantity = mutation.quantity;
      }
      break;
    }
    case "cart.remove":
      if (session.cart.state !== "open") {
        throw new DinerError("El checkout ya empezó.", 409);
      }
      session.cart.lines = session.cart.lines.filter(
        (item) => item.id !== mutation.lineId,
      );
      break;
    case "quote.create": {
      if (!Number.isSafeInteger(mutation.tipClp) || mutation.tipClp < 0) {
        throw new DinerError("La propina no es válida.", 400);
      }
      const scopedKey = `${session.id}:${mutation.idempotencyKey}`;
      const existingId = state.quoteIdempotency.get(scopedKey);
      if (existingId && session.quote?.id === existingId)
        return serialize(session);
      if (session.cart.state !== "open" || session.cart.lines.length === 0) {
        throw new DinerError("Tu pedido está vacío o ya inició checkout.", 409);
      }
      for (const line of session.cart.lines) {
        const product = state.products.get(line.productId);
        if (
          !product ||
          !productAvailable(product) ||
          (product.trackStock &&
            line.quantity > (product.stock ?? 0) - product.reserved)
        ) {
          throw new DinerError(
            `${product?.name ?? "Un producto"} se agotó antes del pago.`,
            409,
          );
        }
      }
      session.displayName =
        mutation.displayName?.trim().slice(0, 60) || undefined;
      session.customerEmail =
        mutation.customerEmail?.trim().toLowerCase().slice(0, 254) || undefined;
      const recipient = mutation.tipRecipientEmployeeId
        ? tipRecipients(session).find(
            (waiter) => waiter.employeeId === mutation.tipRecipientEmployeeId,
          )
        : undefined;
      if (mutation.tipRecipientEmployeeId && !recipient) {
        throw new DinerError(
          "Ese garzón ya no está activo en la zona. Elige Equipo.",
          409,
        );
      }
      for (const line of session.cart.lines) {
        const product = state.products.get(line.productId)!;
        if (product.trackStock) product.reserved += line.quantity;
      }
      const frozenLines = cartLines(session.cart);
      const subtotalClp = frozenLines.reduce(
        (sum, line) =>
          sum +
          (line.originalUnitPriceClp ?? line.unitPriceClp) * line.quantity,
        0,
      );
      const promotionDiscountClp = frozenLines.reduce(
        (sum, line) => sum + (line.unitDiscountClp ?? 0) * line.quantity,
        0,
      );
      const upsellIncrementalClp = frozenLines
        .filter((line) => line.isUpsell)
        .reduce((sum, line) => sum + line.lineTotalClp, 0);
      const tipRecipient: DinerQuote["tipRecipient"] = recipient
        ? {
            type: "employee",
            employeeId: recipient.employeeId,
            employeeSessionId: recipient.employeeSessionId,
            label: recipient.displayName,
          }
        : { type: "team", label: "Equipo" };
      const quote: DinerQuote = Object.freeze({
        id: randomUUID(),
        subtotalClp,
        discountClp: promotionDiscountClp,
        promotionDiscountClp,
        upsellIncrementalClp,
        taxClp: 0,
        tipClp: mutation.tipClp,
        totalClp: subtotalClp - promotionDiscountClp + mutation.tipClp,
        tipRecipient,
        expiresAt: new Date(now() + QUOTE_TTL_MS).toISOString(),
        status: "active",
      });
      state.quoteIdempotency.set(scopedKey, quote.id);
      session.quote = quote;
      session.quoteSnapshotLines = frozenLines.map((line) =>
        Object.freeze({ ...line }),
      );
      session.cart.state = "checkout_started";
      session.waiterPaymentRequest = undefined;
      break;
    }
    case "payment.start": {
      const quote = session.quote;
      if (
        !quote ||
        quote.id !== mutation.quoteId ||
        quote.status !== "active" ||
        Date.parse(quote.expiresAt) <= now()
      ) {
        releaseQuote(session);
        throw new DinerError(
          "La cotización venció. Revisa el pedido antes de pagar.",
          409,
        );
      }
      const scopedKey = `${session.id}:${mutation.idempotencyKey}`;
      const existingId = state.paymentIdempotency.get(scopedKey);
      if (existingId && session.payment?.id === existingId)
        return serialize(session);
      const attempt = await state.gateway.createPaymentAttempt({
        tenantId: TENANT_ID,
        merchantAccountId: MERCHANT_ACCOUNT_ID,
        amount: { amount: quote.totalClp, currency: "CLP" },
        checkoutQuoteId: quote.id,
        idempotencyKey: scopedKey,
        returnUrl: "/mesa/demo-mesa-8",
      });
      session.payment = {
        id: attempt.attemptId,
        providerPaymentId: attempt.providerPaymentId,
        quoteId: quote.id,
        status: "pending",
        settlesAt: now() + 650,
      };
      state.paymentIdempotency.set(scopedKey, attempt.attemptId);
      break;
    }
    case "waiter.pay": {
      if (session.cart.lines.length === 0) {
        throw new DinerError("Agrega algo antes de llamar al garzón.", 409);
      }
      releaseQuote(session);
      const requestedAt = new Date().toISOString();
      const requestId = randomUUID();
      session.waiterPaymentRequest = {
        id: requestId,
        requestedAt,
        status: "notified",
        message:
          "Pendiente de pago con el garzón · tu pedido aún no fue enviado a la barra",
      };
      appendDinerPaymentTask({
        id: requestId,
        alias: session.alias,
        displayName: session.displayName,
        requestedAt,
        items: cartLines(session.cart).map((line) => ({
          name: `${line.productName}${line.variantName ? ` · ${line.variantName}` : ""}`,
          quantity: line.quantity,
          note: line.note,
        })),
      });
      break;
    }
    case "service.request": {
      const action = actionSeed.find(
        (candidate) => candidate.id === mutation.serviceActionId,
      );
      if (!action)
        throw new DinerError("Esta acción ya no está disponible.", 404);
      const lastRequested = session.actionRequests.get(action.id);
      if (
        !lastRequested ||
        now() - lastRequested.requestedAt >= action.cooldownSeconds * 1000
      ) {
        const requestedAt = now();
        const requestId = randomUUID();
        session.actionRequests.set(action.id, {
          id: requestId,
          requestedAt,
        });
        appendDinerServiceTask({
          id: requestId,
          actionId: action.id,
          label: action.label,
          description: action.description,
          alias: session.alias,
          displayName: session.displayName,
          requestedAt: new Date(requestedAt).toISOString(),
        });
      }
      break;
    }
    case "loyalty.recognition.confirm": {
      if (!session.loyaltyRecognitionProfileId) {
        throw new DinerError("No hay un perfil para confirmar.", 409);
      }
      loyaltyDemoStore.confirmRecognition(session.loyaltyRecognitionProfileId);
      session.loyaltyProfileId = session.loyaltyRecognitionProfileId;
      session.loyaltyRecognitionProfileId = undefined;
      break;
    }
    case "loyalty.recognition.reject": {
      if (session.loyaltyRecognitionProfileId) {
        loyaltyDemoStore.rejectRecognition(session.loyaltyRecognitionProfileId);
      }
      session.loyaltyRecognitionProfileId = undefined;
      state.issuedLoyaltyCredentials.set(session.token, null);
      break;
    }
    case "loyalty.challenge.start": {
      try {
        session.loyaltyChallenge = loyaltyDemoStore.startChallenge({
          tenantId: LOYALTY_DEMO_TENANT_ID,
          purpose: mutation.purpose,
          channel: mutation.channel,
          contact: mutation.contact,
          identificationConsent: mutation.identificationConsent,
          contactConsent: mutation.contactConsent,
        });
      } catch (caught) {
        throw new DinerError(
          caught instanceof Error
            ? caught.message
            : "No pudimos enviar el código.",
          400,
        );
      }
      break;
    }
    case "loyalty.challenge.verify": {
      try {
        const verified = loyaltyDemoStore.verifyChallenge({
          tenantId: LOYALTY_DEMO_TENANT_ID,
          challengeId: mutation.challengeId,
          code: mutation.code,
        });
        session.loyaltyProfileId = verified.profileId;
        session.loyaltyRecognitionProfileId = undefined;
        session.loyaltyChallenge = undefined;
        state.issuedLoyaltyCredentials.set(session.token, verified.credential);
        if (session.lastPaidOrder) {
          loyaltyDemoStore.recordConfirmedPayment({
            profileId: verified.profileId,
            orderId: session.lastPaidOrder.id,
            paidClp: session.lastPaidOrder.paidClp,
            productIds: session.lastPaidOrder.productIds,
          });
        }
      } catch (caught) {
        throw new DinerError(
          caught instanceof Error
            ? caught.message
            : "No pudimos verificar el código.",
          400,
        );
      }
      break;
    }
    case "loyalty.reward.add": {
      if (!session.loyaltyProfileId || session.cart.state !== "open") {
        throw new DinerError(
          "Recupera tu perfil antes de usar el premio.",
          409,
        );
      }
      const reward = state.products.get(
        loyaltyDemoStore.program().rewardProductId,
      );
      if (!reward || !productAvailable(reward)) {
        throw new DinerError("El premio está agotado por ahora.", 409);
      }
      try {
        loyaltyDemoStore.reserveReward(
          session.loyaltyProfileId,
          session.cart.id,
        );
      } catch (caught) {
        throw new DinerError(
          caught instanceof Error
            ? caught.message
            : "No pudimos reservar el premio.",
          409,
        );
      }
      session.cart.lines.push({
        id: randomUUID(),
        productId: reward.id,
        quantity: 1,
        isLoyaltyReward: true,
      });
      break;
    }
    case "loyalty.favorite.add": {
      const favorite = loyaltyDemoStore.favorite(session.loyaltyProfileId);
      const product = favorite
        ? state.products.get(favorite.productId)
        : undefined;
      if (!favorite || !product || !productAvailable(product)) {
        throw new DinerError("Tu favorito no está disponible ahora.", 409);
      }
      session.cart.lines.push({
        id: randomUUID(),
        productId: product.id,
        quantity: favorite.quantity,
      });
      break;
    }
    case "loyalty.revoke": {
      if (session.loyaltyProfileId) {
        loyaltyDemoStore.anonymize(session.loyaltyProfileId);
      }
      session.loyaltyProfileId = undefined;
      session.loyaltyRecognitionProfileId = undefined;
      state.issuedLoyaltyCredentials.set(session.token, null);
      break;
    }
    case "upsell.accept": {
      if (session.cart.state !== "open") {
        throw new DinerError("El quote ya está congelado.", 409);
      }
      const suggestion = upsellSuggestions(session).find(
        (candidate) =>
          candidate.ruleId === mutation.ruleId &&
          candidate.productId === mutation.productId,
      );
      const product = state.products.get(mutation.productId);
      if (!suggestion || !product || !productAvailable(product)) {
        throw new DinerError("Esta sugerencia ya no está disponible.", 409);
      }
      session.cart.lines.push({
        id: randomUUID(),
        productId: product.id,
        quantity: 1,
        isUpsell: true,
        upsellRuleId: mutation.ruleId,
      });
      state.upsellAccepted += 1;
      break;
    }
    case "upsell.dismiss": {
      session.dismissedUpsellRuleIds.add(mutation.ruleId);
      break;
    }
    case "invitation.cancel": {
      const invitation = state.invitations.get(mutation.invitationId);
      if (!invitation || invitation.payerSessionId !== session.id) {
        throw new DinerError("La invitación no pertenece a esta sesión.", 404);
      }
      if (invitation.state !== "pending_claim") {
        throw new DinerError(
          "Solo puedes cancelar una invitación aún no reclamada.",
          409,
        );
      }
      await refundInvitation(invitation, "payer_cancelled");
      break;
    }
    case "invitation.claim": {
      const invitation = state.invitations.get(mutation.invitationId);
      if (
        !invitation ||
        !canClaimInvitation({
          state: invitation.state,
          payerDeviceSessionId: invitation.payerSessionId,
          claimantDeviceSessionId: session.id,
          destinationTableSessionId: invitation.destinationTableId,
          claimantTableSessionId: session.tableId,
          expiresAt: invitation.expiresAt,
          now: new Date().toISOString(),
        })
      ) {
        throw new DinerError("Esta invitación ya no se puede reclamar.", 409);
      }
      const product = state.products.get(invitation.productId);
      if (!product) {
        throw new DinerError("El producto invitado ya no existe.", 409);
      }
      if (product.trackStock) {
        product.reserved = Math.max(0, product.reserved - invitation.quantity);
        product.stock = (product.stock ?? 0) - invitation.quantity;
      }
      invitation.state = "claimed";
      invitation.claimedBySessionId = session.id;
      appendPaidOrderToKds({
        orderId: invitation.sourceOrderId,
        orderNumber: invitation.sourceOrderNumber,
        amountClp: invitation.amountClp,
        tableName: invitation.destinationTableName,
        alias: session.alias,
        displayName: session.displayName,
        confirmedAt: new Date().toISOString(),
        tickets: [
          {
            id: `invitation:${invitation.id}`,
            stationId: invitation.stationId,
            stationName: invitation.stationName,
            items: [
              {
                id: `invitation-item:${invitation.id}`,
                name: `${invitation.productName} · INVITACIÓN`,
                quantity: invitation.quantity,
                note: `Entregar en ${invitation.destinationTableName}; pagó ${invitation.inviterAlias}`,
              },
            ],
          },
        ],
      });
      break;
    }
    default:
      throw new DinerError("La acción solicitada no existe.", 400);
  }
  return serialize(session);
}

export function checkoutEngagementDemoMetrics() {
  const exposures = state.upsellExposures.size;
  return {
    upsellExposures: exposures,
    upsellAcceptances: state.upsellAccepted,
    upsellAcceptanceRatePercent:
      exposures === 0
        ? 0
        : Math.round((state.upsellAccepted / exposures) * 10_000) / 100,
    upsellIncrementalRevenueClp: state.upsellPaidClp,
    promotionDiscountClp: state.promotionDiscountClp,
    promotionActive: state.promotionEnabled,
    promotionName: DEMO_PROMOTION.name,
    tipAllocations: state.tipAllocations.map((allocation) => ({
      ...allocation,
    })),
  };
}

export function setDemoPromotion(enabled: boolean): void {
  if (state.promotionEnabled !== enabled) {
    state.promotionEnabled = enabled;
    state.promotionVersion += 1;
    publishKdsEvent({
      type: "product",
      tenantId: TENANT_ID,
      entityId: DEMO_PROMOTION.id,
    });
  }
}

export function resetCheckoutEngagementForTest(): void {
  if (process.env.TABLIO_E2E !== "1") {
    throw new DinerError("Ruta disponible solo en pruebas.", 404);
  }
  state.sessions.clear();
  state.quoteIdempotency.clear();
  state.paymentIdempotency.clear();
  state.invitations.clear();
  state.tipAllocations = [];
  state.upsellExposures.clear();
  state.upsellAccepted = 0;
  state.upsellPaidClp = 0;
  state.promotionDiscountClp = 0;
  state.promotionEnabled = false;
  state.promotionVersion = 1;
  state.closedTableIds.clear();
  state.gateway.reset();
}

export function setDemoTableClosedForTest(
  tableId: string,
  closed: boolean,
): void {
  if (process.env.TABLIO_E2E !== "1") {
    throw new DinerError("Ruta disponible solo en pruebas.", 404);
  }
  if (closed) state.closedTableIds.add(tableId);
  else state.closedTableIds.delete(tableId);
}

export function consumeIssuedLoyaltyCredential(
  deviceToken: string | undefined,
): string | null | undefined {
  if (!deviceToken || !state.issuedLoyaltyCredentials.has(deviceToken)) {
    return undefined;
  }
  const value = state.issuedLoyaltyCredentials.get(deviceToken);
  state.issuedLoyaltyCredentials.delete(deviceToken);
  return value;
}

export function resetLoyaltyForTest(): void {
  if (process.env.TABLIO_E2E !== "1") {
    throw new DinerError("Ruta disponible solo en pruebas.", 404);
  }
  loyaltyDemoStore.reset();
  for (const session of state.sessions.values()) {
    session.loyaltyProfileId = undefined;
    session.loyaltyRecognitionProfileId = undefined;
    session.loyaltyChallenge = undefined;
  }
}

export function seedLoyaltyProgressForTest(
  deviceToken: string | undefined,
  stamps: number,
): void {
  if (process.env.TABLIO_E2E !== "1") {
    throw new DinerError("Ruta disponible solo en pruebas.", 404);
  }
  const session = ensureSession(deviceToken);
  if (!session.loyaltyProfileId) {
    throw new DinerError("Primero activa el programa.", 409);
  }
  loyaltyDemoStore.seedProgress(session.loyaltyProfileId, stamps);
}

export function setProductAvailabilityForTest(
  productId: string,
  available: boolean,
): void {
  if (process.env.TABLIO_E2E !== "1") {
    throw new DinerError("Ruta disponible solo en pruebas.", 404);
  }
  const product = state.products.get(productId);
  if (!product) throw new DinerError("Producto no encontrado.", 404);
  mutateKds({
    action: "product.availability",
    productId,
    available,
    reason: "Preparación de prueba E2E",
  });
}
