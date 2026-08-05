import { randomUUID } from "node:crypto";
import { aliasCandidates } from "./diner-alias";
import { createDinerClient } from "./supabase/diner-client";
import type { CartLine, DinerBootstrap, DinerMutation } from "./diner-contract";

// OI-034 Incrementos 2-3: carta real de solo lectura y carrito real. Sesión,
// carta y carrito vienen de la base real; el resto del bootstrap (quote,
// pago, pedidos, fidelidad, saldo, upsell/invitaciones) todavía no tiene
// ninguna RPC real detrás — se devuelve en su estado vacío/deshabilitado
// explícito, nunca simulado, para que la pantalla no muestre datos falsos
// mientras esos incrementos no existan.

export class DinerRealError extends Error {
  status: number;
  constructor(message: string, status: number) {
    super(message);
    this.status = status;
  }
}

const KNOWN_DEMO_QR_TOKENS = new Set(["demo-mesa-8", "demo-mesa-9"]);

export function isRealQrToken(qrToken: string): boolean {
  return !KNOWN_DEMO_QR_TOKENS.has(qrToken);
}

function statusForRpcError(error: { code?: string; message?: string }): number {
  if (error.code === "42501") return 401;
  if (error.message === "invalid_code" || error.message === "temporarily_blocked") {
    return 400;
  }
  return 500;
}

// enter_table/diner_cart_* nunca lanzan excepción para un rechazo esperado
// (ver ADR del Incremento 1: raise exception deshacía el insert en
// audit_log dentro de la misma transacción) — devuelven {ok:false, code} en
// su lugar. El status HTTP para cada code sigue el mismo contrato que ya
// usaba diner-demo-store para las mismas situaciones.
function statusForResultCode(code: string | undefined): number {
  if (code === "invalid") return 404;
  if (
    code === "table_session_limit_reached" ||
    code === "no_alias_available" ||
    code === "product_unavailable" ||
    code === "insufficient_stock" ||
    code === "cart_not_open" ||
    code === "cart_empty" ||
    code === "cart_unavailable"
  ) {
    return 409;
  }
  return 400;
}

function messageForRpcError(error: { message?: string }): string {
  switch (error.message) {
    case "invalid":
      return "Este QR no es válido.";
    case "invalid_code":
      return "El código no es correcto.";
    case "temporarily_blocked":
      return "Demasiados intentos. Espera un momento y prueba de nuevo.";
    case "table_session_limit_reached":
      return "Esta mesa ya tiene muchos celulares conectados. Pide ayuda al equipo del local.";
    case "no_alias_available":
      return "Esta mesa está muy concurrida ahora mismo. Intenta de nuevo en un momento.";
    case "product_unavailable":
      return "Este producto se acaba de agotar.";
    case "insufficient_stock":
      return "No queda esa cantidad disponible.";
    case "cart_not_open":
      return "Termina o cancela el checkout actual.";
    case "cart_empty":
      return "Tu pedido está vacío.";
    case "cart_unavailable":
      return "Algo en tu carrito ya no está disponible. Revisa tu pedido.";
    case "invalid session":
    case "session expired":
    case "table session is no longer open":
    case "session does not belong to this table":
      return "Tu sesión ya no es válida. Vuelve a ingresar el código de la mesa.";
    default:
      return "No pudimos completar la acción. Intenta otra vez.";
  }
}

const EMPTY_CART = { id: "real-cart-pending", lines: [], subtotalClp: 0 } as const;

function emptyBootstrapExtras() {
  return {
    orders: [],
    actions: [],
    loyalty: {
      enabled: false,
      visitsRequired: 0,
      enrollmentAvailable: false,
      recoveryAlwaysAvailable: true as const,
    },
    storedValue: {
      enabled: false,
      productionBlocked: true,
      consented: false,
      balanceClp: 0,
      loadedMoneyClp: 0,
      bonusClp: 0,
      maxConsumerBalanceClp: 0,
      bonusBps: 0,
      expiring: [],
      history: [],
    },
    engagement: {
      settings: {
        upsellEnabled: false,
        invitationsEnabled: false,
        promotionEnabled: false,
        waiterTipEnabled: false,
        invitationClaimTtlMinutes: 0,
      },
      upsellSuggestions: [],
      tipRecipients: [],
      invitationTargets: [],
      sentInvitations: [],
      receivedInvitations: [],
    },
  } satisfies Partial<DinerBootstrap>;
}

type MenuPayload = {
  categories: readonly { id: string; name: string }[];
  products: readonly {
    id: string;
    categoryId: string | null;
    name: string;
    description: string;
    priceClp: number;
    imageAlt: string;
    imagePath: string | null;
    allergens: readonly string[];
    available: boolean;
    trackStock: boolean;
    variants: readonly { id: string; name: string; priceDeltaClp: number }[];
  }[];
  sessionId: string;
  alias: string;
  displayName: string | null;
  venueId: string;
  venueName: string;
  tableId: string;
  tableName: string;
  tipSuggestions: readonly number[];
  cart: {
    id: string;
    lines: readonly {
      id: string;
      productId: string;
      productName: string;
      variantId: string | null;
      variantName: string | null;
      quantity: number;
      note: string | null;
      unitPriceClp: number;
      lineTotalClp: number;
    }[];
    subtotalClp: number;
  };
  quote?: {
    id: string;
    subtotalClp: number;
    discountClp: number;
    promotionDiscountClp: number;
    upsellIncrementalClp: number;
    taxClp: number;
    tipClp: number;
    totalClp: number;
    storedValueAppliedClp: number;
    externalPaymentDueClp: number;
    tipRecipient: { type: "team" | "employee"; label: string };
    expiresAt: string;
    status: "active" | "paid" | "expired";
  };
  cartReopenedNotice?: {
    message: string;
    unavailableProductNames: readonly string[];
    priceChangedProductNames: readonly string[];
  };
};

// Ningún producto de Bar La Virgen tiene foto todavía — Configuración no
// tiene un paso para subir imágenes aún. Se usa un fondo neutro ya presente
// en el proyecto en vez de romper next/image con un src vacío.
const FALLBACK_PRODUCT_IMAGE = "/menu/beer.jpg";

function buildBootstrapFromMenu(menu: MenuPayload): DinerBootstrap {
  return {
    demo: false,
    authenticated: true,
    ordering: { available: true },
    venue: {
      id: menu.venueId,
      name: menu.venueName,
      tableId: menu.tableId,
      tableName: menu.tableName,
      currency: "CLP",
      tipSuggestions: menu.tipSuggestions,
    },
    session: {
      id: menu.sessionId,
      alias: menu.alias,
      displayName: menu.displayName ?? undefined,
      idleExpiresAt: new Date(Date.now() + 4 * 60 * 60 * 1000).toISOString(),
      absoluteExpiresAt: new Date(Date.now() + 12 * 60 * 60 * 1000).toISOString(),
    },
    categories: menu.categories,
    products: menu.products.map((product) => ({
      id: product.id,
      categoryId: product.categoryId ?? "",
      name: product.name,
      description: product.description,
      priceClp: product.priceClp,
      imageUrl: product.imagePath ?? FALLBACK_PRODUCT_IMAGE,
      imageAlt: product.imageAlt,
      allergens: product.allergens,
      available: product.available,
      trackStock: product.trackStock,
      variants: product.variants,
    })),
    cart: {
      id: menu.cart.id,
      lines: menu.cart.lines.map(
        (line): CartLine => ({
          id: line.id,
          productId: line.productId,
          productName: line.productName,
          variantId: line.variantId ?? undefined,
          variantName: line.variantName ?? undefined,
          quantity: line.quantity,
          note: line.note ?? undefined,
          unitPriceClp: line.unitPriceClp,
          lineTotalClp: line.lineTotalClp,
        }),
      ),
      subtotalClp: menu.cart.subtotalClp,
    },
    quote: menu.quote,
    cartReopenedNotice: menu.cartReopenedNotice,
    ...emptyBootstrapExtras(),
    serverTime: new Date().toISOString(),
  } as DinerBootstrap;
}

export async function getRealDinerBootstrap(
  deviceToken: string | undefined,
): Promise<DinerBootstrap> {
  if (!deviceToken) {
    return unauthenticatedBootstrap();
  }
  const supabase = createDinerClient();
  const { data, error } = await supabase.rpc("diner_bootstrap_menu", {
    p_session_token: deviceToken,
  });
  if (error) {
    return unauthenticatedBootstrap();
  }
  return buildBootstrapFromMenu(data as MenuPayload);
}

function unauthenticatedBootstrap(): DinerBootstrap {
  return {
    demo: false,
    authenticated: false,
    ordering: { available: true },
    venue: {
      id: "",
      name: "",
      tableId: "",
      tableName: "",
      currency: "CLP",
      tipSuggestions: [0, 10, 12],
    },
    categories: [],
    products: [],
    cart: EMPTY_CART,
    ...emptyBootstrapExtras(),
    serverTime: new Date().toISOString(),
  } as DinerBootstrap;
}

export async function joinRealDinerSession(
  qrToken: string,
  presenceCode: string,
): Promise<{ bootstrap: DinerBootstrap; token: string }> {
  const supabase = createDinerClient();
  const seed = `${qrToken}:${Date.now()}`;
  const { data, error } = await supabase.rpc("enter_table", {
    p_qr_token: qrToken,
    p_presence_code: presenceCode,
    p_device_fingerprint: randomUUID(),
    p_alias_candidates: aliasCandidates(seed),
  });
  if (error) {
    throw new DinerRealError(messageForRpcError(error), statusForRpcError(error));
  }
  const result = data as { ok: boolean; code?: string; session_token?: string };
  if (!result.ok || !result.session_token) {
    throw new DinerRealError(
      messageForRpcError({ message: result.code }),
      statusForResultCode(result.code),
    );
  }

  const { data: menu, error: menuError } = await supabase.rpc("diner_bootstrap_menu", {
    p_session_token: result.session_token,
  });
  if (menuError) {
    throw new DinerRealError(messageForRpcError(menuError), statusForRpcError(menuError));
  }

  return {
    bootstrap: buildBootstrapFromMenu(menu as MenuPayload),
    token: result.session_token,
  };
}

async function callDinerRpc(
  fnName:
    | "diner_cart_add_item"
    | "diner_cart_update_item"
    | "diner_cart_remove_item"
    | "diner_create_checkout_quote",
  deviceToken: string,
  params: Record<string, unknown>,
): Promise<DinerBootstrap> {
  const supabase = createDinerClient();
  const { data, error } = await supabase.rpc(fnName, {
    p_session_token: deviceToken,
    ...params,
  });
  if (error) {
    throw new DinerRealError(messageForRpcError(error), statusForRpcError(error));
  }
  const result = data as { ok: boolean; code?: string } & Partial<MenuPayload>;
  if (!result.ok) {
    throw new DinerRealError(
      messageForRpcError({ message: result.code }),
      statusForResultCode(result.code),
    );
  }
  return buildBootstrapFromMenu(result as MenuPayload);
}

// OI-034 Incremento 3: carrito real. Sólo cart.add/update/remove tienen RPC
// real detrás — cualquier otra mutación (quote, pago, fidelidad, saldo,
// upsell, invitaciones) todavía no existe para una sesión real y se rechaza
// explícitamente en vez de caer en silencio al store en memoria.
export async function mutateRealDiner(
  deviceToken: string,
  mutation: DinerMutation,
): Promise<DinerBootstrap> {
  switch (mutation.action) {
    case "cart.add":
      return callDinerRpc("diner_cart_add_item", deviceToken, {
        p_product_id: mutation.productId,
        p_quantity: mutation.quantity,
        p_variant_id: mutation.variantId ?? null,
        p_note: mutation.note ?? null,
      });
    case "cart.update":
      return callDinerRpc("diner_cart_update_item", deviceToken, {
        p_line_id: mutation.lineId,
        p_quantity: mutation.quantity,
      });
    case "cart.remove":
      return callDinerRpc("diner_cart_remove_item", deviceToken, {
        p_line_id: mutation.lineId,
      });
    case "quote.create":
      return callDinerRpc("diner_create_checkout_quote", deviceToken, {
        p_tip_clp: mutation.tipClp,
        p_idempotency_key: mutation.idempotencyKey,
      });
    default:
      throw new DinerRealError(
        "Esta acción todavía no está disponible para este local.",
        501,
      );
  }
}
