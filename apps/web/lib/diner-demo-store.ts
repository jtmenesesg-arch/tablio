import "server-only";

import { randomUUID } from "node:crypto";
import {
  InMemoryPaymentEventStore,
  SimulatedPaymentGateway,
} from "@tablio/payments-simulated";
import { PaymentEventProcessor } from "@tablio/application";
import { createDinerAlias } from "./diner-alias";
import {
  appendPaidOrderToKds,
  kdsProductAvailability,
  kdsTicketStates,
  mutateKds,
} from "./kds-demo-store";
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

const TENANT_ID = "00000000-0000-4000-8000-000000000301";
const MERCHANT_ACCOUNT_ID = "demo-merchant:bar-la-esquina";
const QR_TOKEN = "demo-mesa-8";
const PRESENCE_CODE = "4826";
const IDLE_TTL_MS = 4 * 60 * 60 * 1000;
const ABSOLUTE_TTL_MS = 12 * 60 * 60 * 1000;
const QUOTE_TTL_MS = 10 * 60 * 1000;

type MutableProduct = Omit<DinerProduct, "available"> & {
  available: boolean;
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
  }>;
};
type MutableSession = {
  id: string;
  token: string;
  alias: string;
  displayName?: string;
  customerEmail?: string;
  createdAt: number;
  lastSeenAt: number;
  idleExpiresAt: number;
  absoluteExpiresAt: number;
  cart: MutableCart;
  quote?: DinerQuote;
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
    const unitPriceClp = linePrice(product, line.variantId);
    return {
      id: line.id,
      productId: line.productId,
      productName: product.name,
      variantId: line.variantId,
      variantName: variant?.name,
      quantity: line.quantity,
      note: line.note,
      unitPriceClp,
      lineTotalClp: unitPriceClp * line.quantity,
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

  const sourceLines = cartLines(session.cart);
  const stations = new Map<
    string,
    {
      name: string;
      items: Array<{
        id: string;
        name: string;
        quantity: number;
        note?: string;
      }>;
    }
  >();
  for (const line of sourceLines) {
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
    tableName: "Mesa 8",
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
  });
  payment.status = "confirmed";
  session.quote = Object.freeze({ ...quote, status: "paid" });
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
  session.quote = undefined;
  session.payment = undefined;
  session.cart.state = "open";
}

function serialize(session: MutableSession | undefined): DinerBootstrap {
  const lines = session ? cartLines(session.cart) : [];
  const currentTime = new Date().toISOString();
  return {
    demo: true,
    authenticated: Boolean(session),
    venue: {
      id: "bar-la-esquina",
      name: "Bar La Esquina",
      tableName: "Mesa 8",
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
      available: productAvailable(product),
      stock: undefined,
      reserved: undefined,
    })),
    cart: {
      id: session?.cart.id ?? "not-started",
      lines,
      subtotalClp: lines.reduce((sum, line) => sum + line.lineTotalClp, 0),
    },
    quote: session?.quote,
    payment: session?.payment
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
    serverTime: currentTime,
  };
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
): Promise<DinerBootstrap> {
  if (qrToken !== QR_TOKEN) throw new DinerError("Este QR no es válido.", 404);
  if (!token) return serialize(undefined);
  try {
    const session = ensureSession(token);
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
): { token: string; bootstrap: DinerBootstrap } {
  if (qrToken !== QR_TOKEN) throw new DinerError("Este QR no es válido.", 404);
  if (presenceCode !== PRESENCE_CODE) {
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
    createdAt: currentTime,
    lastSeenAt: currentTime,
    idleExpiresAt: currentTime + IDLE_TTL_MS,
    absoluteExpiresAt: currentTime + ABSOLUTE_TTL_MS,
    cart: newCart(),
    orders: [],
    actionRequests: new Map(),
  };
  state.sessions.set(token, session);
  return { token, bootstrap: serialize(session) };
}

export async function mutateDiner(
  token: string | undefined,
  mutation: Exclude<DinerMutation, { action: "join" }>,
): Promise<DinerBootstrap> {
  const session = ensureSession(token);
  await settleDuePayment(session);

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
      const existing = session.cart.lines.find(
        (line) =>
          line.productId === mutation.productId &&
          line.variantId === mutation.variantId &&
          line.note === mutation.note,
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
      for (const line of session.cart.lines) {
        const product = state.products.get(line.productId)!;
        if (product.trackStock) product.reserved += line.quantity;
      }
      const subtotalClp = cartLines(session.cart).reduce(
        (sum, line) => sum + line.lineTotalClp,
        0,
      );
      const quote: DinerQuote = Object.freeze({
        id: randomUUID(),
        subtotalClp,
        taxClp: 0,
        tipClp: mutation.tipClp,
        totalClp: subtotalClp + mutation.tipClp,
        expiresAt: new Date(now() + QUOTE_TTL_MS).toISOString(),
        status: "active",
      });
      state.quoteIdempotency.set(scopedKey, quote.id);
      session.quote = quote;
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
    default:
      throw new DinerError("La acción solicitada no existe.", 400);
  }
  return serialize(session);
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
