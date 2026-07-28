import { describe, expect, it } from "vitest";
import {
  assertTransition,
  CART_TRANSITIONS,
  ORDER_TRANSITIONS,
  PAYMENT_INTENT_TRANSITIONS,
  TICKET_TRANSITIONS,
} from "./state-machines";
import {
  DEFAULT_QUOTE_TTL_SECONDS,
  isQuoteExpired,
  LATE_APPROVAL_DECISION,
  quoteClock,
  stockReservationsFor,
} from "./stock-policy";

describe("financial state machines", () => {
  it("keeps browser and pending states away from order confirmation", () => {
    // Intenta saltar la verificación server-side; si falla, el navegador podría fabricar pedidos.
    expect(() =>
      assertTransition(
        PAYMENT_INTENT_TRANSITIONS,
        "redirected",
        "approved",
        "payment intent",
      ),
    ).toThrow();
    expect(() =>
      assertTransition(
        ORDER_TRANSITIONS,
        "awaiting_payment",
        "confirmed",
        "order",
      ),
    ).not.toThrow();
  });

  it("prevents state regressions after terminal states", () => {
    // Intenta revivir estados terminales; si falla, eventos tardíos degradarían pagos y pedidos.
    expect(() =>
      assertTransition(
        PAYMENT_INTENT_TRANSITIONS,
        "approved",
        "processing",
        "payment intent",
      ),
    ).toThrow();
    expect(() =>
      assertTransition(CART_TRANSITIONS, "converted_to_order", "open", "cart"),
    ).toThrow();
  });

  it("keeps ticket preparation sequential", () => {
    // Intenta saltar una etapa de cocina; si falla, una comanda podría marcarse lista sin preparación.
    expect(() =>
      assertTransition(TICKET_TRANSITIONS, "queued", "ready", "ticket"),
    ).toThrow();
  });
});

describe("selective quote stock policy", () => {
  it("reserves only explicitly tracked products", () => {
    // Intenta reservar todo el menú; si falla, los tragos sin stock unitario crearían contención inútil.
    const reservations = stockReservationsFor([
      { productId: "draft-beer", trackStock: false, quantity: 2 },
      { productId: "limited-bottle", trackStock: true, quantity: 1 },
    ]);
    expect(reservations.map((item) => item.productId)).toEqual([
      "limited-bottle",
    ]);
  });

  it("uses one ten-minute clock for quote and reservation", () => {
    // Intenta crear dos relojes; si falla, una reserva podría vivir más o menos que su quote.
    const createdAt = new Date("2026-07-28T12:00:00.000Z");
    const clock = quoteClock(createdAt);
    expect(DEFAULT_QUOTE_TTL_SECONDS).toBe(600);
    expect(clock.expiresAt).toBe("2026-07-28T12:10:00.000Z");
    expect(isQuoteExpired(clock, new Date("2026-07-28T12:10:00.000Z"))).toBe(
      true,
    );
  });

  it("makes late approvals immediately actionable", () => {
    // Intenta esconder dinero cobrado tras expirar; si falla, el cliente esperaría sin alerta al cajero.
    expect(LATE_APPROVAL_DECISION).toMatchObject({
      visibleToCashier: true,
      priority: "critical",
      options: ["refund", "produce_manually"],
    });
  });
});
