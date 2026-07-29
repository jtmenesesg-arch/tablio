"use client";

import Image from "next/image";
import {
  FormEvent,
  type ReactNode,
  useCallback,
  useEffect,
  useMemo,
  useState,
} from "react";
import type {
  DinerBootstrap,
  DinerMutation,
  DinerProduct,
  TicketStatus,
} from "../../../lib/diner-contract";

type Screen =
  "entry" | "menu" | "cart" | "checkout" | "status" | "actions" | "loyalty";

const formatClp = new Intl.NumberFormat("es-CL", {
  style: "currency",
  currency: "CLP",
  maximumFractionDigits: 0,
});

function money(amount: number): string {
  return formatClp.format(amount).replace("CLP", "$");
}

function Icon({
  name,
  size = 22,
}: {
  name:
    | "arrow"
    | "bag"
    | "check"
    | "chevron"
    | "clock"
    | "close"
    | "cutlery"
    | "hand"
    | "minus"
    | "plus"
    | "shield"
    | "spark"
    | "user"
    | "warning"
    | "water";
  size?: number;
}) {
  const paths: Record<typeof name, ReactNode> = {
    arrow: <path d="m9 18 6-6-6-6" />,
    bag: (
      <>
        <path d="M6 8h12l-1 12H7L6 8Z" />
        <path d="M9 9V6a3 3 0 0 1 6 0v3" />
      </>
    ),
    check: <path d="m5 12 4 4L19 6" />,
    chevron: <path d="m6 9 6 6 6-6" />,
    clock: (
      <>
        <circle cx="12" cy="12" r="9" />
        <path d="M12 7v5l3 2" />
      </>
    ),
    close: (
      <>
        <path d="m6 6 12 12" />
        <path d="m18 6-12 12" />
      </>
    ),
    cutlery: (
      <>
        <path d="M7 3v8M4 3v5c0 2 6 2 6 0V3M7 11v10" />
        <path d="M16 3v18M16 3c3 2 4 6 0 9" />
      </>
    ),
    hand: (
      <path d="M7 11V6a2 2 0 0 1 4 0v4-6a2 2 0 0 1 4 0v7-4a2 2 0 0 1 4 0v7c0 4-3 7-7 7h-1c-3 0-5-2-7-5l-2-3a2 2 0 0 1 3-2l2 2" />
    ),
    minus: <path d="M5 12h14" />,
    plus: (
      <>
        <path d="M5 12h14" />
        <path d="M12 5v14" />
      </>
    ),
    shield: (
      <>
        <path d="M12 3 5 6v5c0 5 3 8 7 10 4-2 7-5 7-10V6l-7-3Z" />
        <path d="m9 12 2 2 4-5" />
      </>
    ),
    spark: (
      <path d="m12 2 1.5 5.5L19 9l-5.5 1.5L12 16l-1.5-5.5L5 9l5.5-1.5L12 2ZM19 16l.7 2.3L22 19l-2.3.7L19 22l-.7-2.3L16 19l2.3-.7L19 16Z" />
    ),
    user: (
      <>
        <circle cx="12" cy="8" r="4" />
        <path d="M4 21a8 8 0 0 1 16 0" />
      </>
    ),
    warning: (
      <>
        <path d="m12 3 10 18H2L12 3Z" />
        <path d="M12 9v5M12 18h.01" />
      </>
    ),
    water: <path d="M12 2S5 10 5 15a7 7 0 0 0 14 0c0-5-7-13-7-13Z" />,
  };
  return (
    <svg
      aria-hidden="true"
      fill="none"
      height={size}
      viewBox="0 0 24 24"
      width={size}
      stroke="currentColor"
      strokeLinecap="round"
      strokeLinejoin="round"
      strokeWidth="1.8"
    >
      {paths[name]}
    </svg>
  );
}

async function readResponse(response: Response): Promise<DinerBootstrap> {
  const body = (await response.json()) as unknown;
  if (!response.ok) {
    const message =
      typeof body === "object" &&
      body !== null &&
      "error" in body &&
      typeof body.error === "string"
        ? body.error
        : "No pudimos actualizar tu pedido.";
    throw new Error(message);
  }
  return body as DinerBootstrap;
}

export function DinerPwa({ qrToken }: { qrToken: string }) {
  const [data, setData] = useState<DinerBootstrap>();
  const [screen, setScreen] = useState<Screen>("entry");
  const [selectedProduct, setSelectedProduct] = useState<DinerProduct>();
  const [selectedVariant, setSelectedVariant] = useState<string>();
  const [quantity, setQuantity] = useState(1);
  const [note, setNote] = useState("");
  const [category, setCategory] = useState("all");
  const [presenceCode, setPresenceCode] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [customerEmail, setCustomerEmail] = useState("");
  const [tipPercent, setTipPercent] = useState(10);
  const [customTip, setCustomTip] = useState("");
  const [loyaltyPurpose, setLoyaltyPurpose] = useState<"enroll" | "recover">(
    "recover",
  );
  const [loyaltyChannel, setLoyaltyChannel] = useState<"phone" | "email">(
    "phone",
  );
  const [loyaltyContact, setLoyaltyContact] = useState("");
  const [loyaltyCode, setLoyaltyCode] = useState("");
  const [identityConsent, setIdentityConsent] = useState(false);
  const [contactConsent, setContactConsent] = useState(false);
  const [loading, setLoading] = useState(true);
  const [working, setWorking] = useState(false);
  const [error, setError] = useState<string>();

  const refresh = useCallback(
    async (quiet = false) => {
      if (!quiet) setLoading(true);
      try {
        const next = await readResponse(
          await fetch(`/api/diner?qr=${encodeURIComponent(qrToken)}`, {
            cache: "no-store",
          }),
        );
        setData(next);
        setDisplayName(next.session?.displayName ?? "");
        if (!next.authenticated) {
          setScreen("entry");
        } else if (
          next.payment?.status === "pending" ||
          next.orders.length > 0
        ) {
          setScreen((current) =>
            current === "entry" || current === "status" ? "status" : current,
          );
        } else {
          setScreen((current) => (current === "entry" ? "menu" : current));
        }
      } catch (caught) {
        setError(
          caught instanceof Error
            ? caught.message
            : "No pudimos cargar la mesa.",
        );
      } finally {
        setLoading(false);
      }
    },
    [qrToken],
  );

  useEffect(() => {
    const initialLoad = window.setTimeout(() => void refresh(), 0);
    if ("serviceWorker" in navigator) {
      void navigator.serviceWorker.register("/sw.js");
    }
    return () => window.clearTimeout(initialLoad);
  }, [refresh]);

  useEffect(() => {
    if (!data?.authenticated) return;
    const delay = screen === "status" ? 800 : 2_500;
    const interval = window.setInterval(() => void refresh(true), delay);
    const onVisible = () => {
      if (document.visibilityState === "visible") void refresh(true);
    };
    document.addEventListener("visibilitychange", onVisible);
    window.addEventListener("online", onVisible);
    return () => {
      window.clearInterval(interval);
      document.removeEventListener("visibilitychange", onVisible);
      window.removeEventListener("online", onVisible);
    };
  }, [data?.authenticated, refresh, screen]);

  useEffect(() => {
    if (!data?.authenticated) return;
    const events = new EventSource("/api/kds/events");
    const refreshFromEvent = () => void refresh(true);
    events.addEventListener("product", refreshFromEvent);
    events.addEventListener("ticket", refreshFromEvent);
    return () => {
      events.removeEventListener("product", refreshFromEvent);
      events.removeEventListener("ticket", refreshFromEvent);
      events.close();
    };
  }, [data?.authenticated, refresh]);

  async function mutate(
    mutation: DinerMutation,
    options?: { nextScreen?: Screen },
  ) {
    setWorking(true);
    setError(undefined);
    try {
      const next = await readResponse(
        await fetch("/api/diner", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify(mutation),
        }),
      );
      setData(next);
      setDisplayName(next.session?.displayName ?? displayName);
      if (options?.nextScreen) setScreen(options.nextScreen);
      return next;
    } catch (caught) {
      setError(
        caught instanceof Error
          ? caught.message
          : "No pudimos completar la acción.",
      );
      return undefined;
    } finally {
      setWorking(false);
    }
  }

  async function join(event: FormEvent) {
    event.preventDefault();
    const next = await mutate({
      action: "join",
      qrToken,
      presenceCode,
    });
    if (next) setScreen("menu");
  }

  function openProduct(product: DinerProduct) {
    if (!product.available) return;
    setSelectedProduct(product);
    setSelectedVariant(product.variants[0]?.id);
    setQuantity(1);
    setNote("");
    setError(undefined);
  }

  async function addProduct() {
    if (!selectedProduct) return;
    const next = await mutate({
      action: "cart.add",
      productId: selectedProduct.id,
      variantId: selectedVariant,
      quantity,
      note,
    });
    if (next) setSelectedProduct(undefined);
  }

  const subtotal = data?.cart.subtotalClp ?? 0;
  const tipClp = useMemo(() => {
    if (tipPercent === -1) {
      const amount = Number(customTip);
      return Number.isSafeInteger(amount) && amount >= 0 ? amount : 0;
    }
    return Math.round((subtotal * tipPercent) / 100);
  }, [customTip, subtotal, tipPercent]);

  async function createQuote() {
    const next = await mutate({
      action: "quote.create",
      tipClp,
      displayName,
      customerEmail: customerEmail || undefined,
      idempotencyKey: crypto.randomUUID(),
    });
    if (next?.quote) setScreen("checkout");
  }

  async function startPayment() {
    if (!data?.quote) return;
    const next = await mutate(
      {
        action: "payment.start",
        quoteId: data.quote.id,
        idempotencyKey: crypto.randomUUID(),
      },
      { nextScreen: "status" },
    );
    if (next) void refresh(true);
  }

  async function startLoyaltyChallenge() {
    await mutate({
      action: "loyalty.challenge.start",
      purpose: loyaltyPurpose,
      channel: loyaltyChannel,
      contact: loyaltyContact,
      identificationConsent:
        loyaltyPurpose === "recover" ? true : identityConsent,
      contactConsent: loyaltyPurpose === "recover" ? true : contactConsent,
    });
  }

  async function verifyLoyaltyChallenge() {
    if (!data?.loyalty.challenge) return;
    const next = await mutate({
      action: "loyalty.challenge.verify",
      challengeId: data.loyalty.challenge.id,
      code: loyaltyCode,
    });
    if (next?.loyalty.profile) setScreen("menu");
  }

  const visibleProducts = (data?.products ?? []).filter(
    (product) => category === "all" || product.categoryId === category,
  );
  const cartCount =
    data?.cart.lines.reduce((sum, line) => sum + line.quantity, 0) ?? 0;
  const latestOrder = data?.orders[0];

  if (loading && !data) {
    return (
      <main className="dinerLoading">
        <span className="brandMark">t</span>
        <p>Abriendo tu mesa…</p>
      </main>
    );
  }

  if (!data) {
    return (
      <main className="dinerLoading">
        <span className="brandMark">t</span>
        <p>{error ?? "No pudimos abrir este QR."}</p>
        <button className="solidButton" onClick={() => void refresh()}>
          Intentar otra vez
        </button>
      </main>
    );
  }

  return (
    <main className="dinerApp">
      <div className="demoMode" role="status">
        <span />
        MODO DEMO · NO MUEVE DINERO REAL
      </div>

      {screen !== "entry" && (
        <header className="dinerTopbar">
          <button
            aria-label="Volver a la carta"
            className="iconButton"
            onClick={() => setScreen("menu")}
            type="button"
          >
            <span className="miniBrand">t</span>
          </button>
          <button
            aria-label="Mis sellos"
            className="loyaltyHeaderButton"
            onClick={() => setScreen("loyalty")}
            type="button"
          >
            <Icon name="spark" size={18} />
            {data.loyalty.profile?.stamps ?? 0}
          </button>
          <div>
            <strong>{data.venue.name}</strong>
            <span>
              {data.venue.tableName} ·{" "}
              {data.session?.displayName || data.session?.alias}
            </span>
          </div>
          <button
            aria-label={`Mi pedido, ${cartCount} ${
              cartCount === 1 ? "producto" : "productos"
            }`}
            className="cartButton"
            onClick={() => setScreen("cart")}
            type="button"
          >
            <Icon name="bag" />
            {cartCount > 0 && <b>{cartCount}</b>}
          </button>
        </header>
      )}

      {error && (
        <div className="inlineError" role="alert">
          <Icon name="warning" size={19} />
          <span>{error}</span>
          <button aria-label="Cerrar error" onClick={() => setError(undefined)}>
            <Icon name="close" size={18} />
          </button>
        </div>
      )}

      {!data.ordering.available && data.orders.length === 0 && (
        <section className="entryScreen neutralUnavailable">
          <div className="entryCard">
            <p className="sectionKicker">Pedidos no disponibles</p>
            <h1>Habla con el equipo del local</h1>
            <p>{data.ordering.message}</p>
          </div>
        </section>
      )}

      {data.ordering.available && screen === "entry" && (
        <section className="entryScreen">
          <div className="entryPhoto" aria-hidden="true">
            <Image alt="" fill priority sizes="100vw" src="/menu/beer.jpg" />
            <span className="entryBrand">tablio</span>
          </div>
          <div className="entryCard">
            <p className="sectionKicker">Ya casi estás</p>
            <h1>
              {data.venue.name} <span>·</span> {data.venue.tableName}
            </h1>
            <p>Escribe el código corto que está impreso en tu mesa.</p>
            <form onSubmit={join}>
              <label htmlFor="presence-code">Código de la mesa</label>
              <input
                autoComplete="one-time-code"
                autoFocus
                id="presence-code"
                inputMode="numeric"
                maxLength={4}
                onChange={(event) =>
                  setPresenceCode(event.target.value.replaceAll(/\D/g, ""))
                }
                placeholder="0000"
                value={presenceCode}
              />
              <button
                className="solidButton"
                disabled={presenceCode.length !== 4 || working}
                type="submit"
              >
                {working ? "Confirmando…" : "Entrar a la carta"}
                <Icon name="arrow" />
              </button>
            </form>
            <p className="demoHint">
              Para esta demo usa <strong>4826</strong>
            </p>
          </div>
        </section>
      )}

      {data.ordering.available && screen === "menu" && (
        <section className="contentScreen menuScreen">
          <div className="menuHero">
            <div>
              <p className="sectionKicker">Buenas noches</p>
              <h1>¿Qué te tinca?</h1>
              <p>Pide a tu ritmo. Cada persona tiene su propio carrito.</p>
            </div>
            <span className="aliasPill">
              <Icon name="user" size={17} />
              {data.session?.alias}
            </span>
          </div>

          {latestOrder && latestOrder.state !== "delivered" && (
            <button
              className="liveOrderCard"
              onClick={() => setScreen("status")}
              type="button"
            >
              <span className="pulseDot" />
              <span>
                <b>Pedido #{latestOrder.number}</b>
                <small>
                  {latestOrder.state === "ready"
                    ? "Hay algo listo"
                    : "Lo están preparando"}
                </small>
              </span>
              <Icon name="arrow" />
            </button>
          )}

          {data.loyalty.recognition ? (
            <section className="loyaltyRecognition solidSurface">
              <div>
                <p className="sectionKicker">Perfil del programa encontrado</p>
                <h2>¿Este perfil es tuyo?</h2>
                <strong>{data.loyalty.recognition.maskedIdentity}</strong>
                <p>
                  No mostramos nombres completos porque este teléfono puede
                  circular por la mesa.
                </p>
              </div>
              <div>
                <button
                  className="solidButton"
                  disabled={working}
                  onClick={() =>
                    void mutate({ action: "loyalty.recognition.confirm" })
                  }
                >
                  Sí, usar mis sellos
                </button>
                <button
                  className="textButton"
                  disabled={working}
                  onClick={() =>
                    void mutate({ action: "loyalty.recognition.reject" })
                  }
                >
                  No soy yo
                </button>
              </div>
            </section>
          ) : data.loyalty.profile ? (
            <section className="loyaltyProgressCard">
              <div>
                <p className="sectionKicker">Tus sellos en este local</p>
                <h2>
                  {data.loyalty.profile.stamps} de {data.loyalty.visitsRequired}
                </h2>
                <p>
                  Recuperación activa en {data.loyalty.profile.contactMasked}
                </p>
              </div>
              {data.loyalty.profile.rewardAvailable ? (
                <button
                  disabled={working}
                  onClick={() => void mutate({ action: "loyalty.reward.add" })}
                >
                  Usar premio
                </button>
              ) : (
                <button onClick={() => setScreen("loyalty")}>
                  Ver programa
                </button>
              )}
            </section>
          ) : (
            <button
              className="loyaltyRecoveryLink"
              onClick={() => {
                setLoyaltyPurpose("recover");
                setScreen("loyalty");
              }}
              type="button"
            >
              ¿Ya tenías sellos? Recupéralos con teléfono o correo
            </button>
          )}

          {data.loyalty.favorite ? (
            <section className="favoriteCard">
              <div>
                <p className="sectionKicker">Tu de siempre</p>
                <strong>{data.loyalty.favorite.productName}</strong>
                <small>Basado en tus pedidos reales en este local.</small>
              </div>
              <button
                disabled={working}
                onClick={() => void mutate({ action: "loyalty.favorite.add" })}
              >
                Agregar
              </button>
            </section>
          ) : null}

          <nav className="categoryRail" aria-label="Categorías">
            <button
              className={category === "all" ? "active" : ""}
              onClick={() => setCategory("all")}
              type="button"
            >
              Todo
            </button>
            {data.categories.map((item) => (
              <button
                className={category === item.id ? "active" : ""}
                key={item.id}
                onClick={() => setCategory(item.id)}
                type="button"
              >
                {item.name}
              </button>
            ))}
          </nav>

          <div className="productGrid">
            {visibleProducts.map((product) => (
              <article
                className={`productCard ${!product.available ? "soldOut" : ""}`}
                key={product.id}
              >
                <button
                  aria-label={`Ver ${product.name}`}
                  disabled={!product.available}
                  onClick={() => openProduct(product)}
                  type="button"
                >
                  <span className="productPhoto">
                    <Image
                      alt={product.imageAlt}
                      fill
                      loading={product.id === "lager-casa" ? "eager" : "lazy"}
                      sizes="(max-width: 600px) 48vw, 280px"
                      src={product.imageUrl}
                    />
                    {!product.available && <b>Agotado</b>}
                  </span>
                  <span className="productCopy">
                    <strong>{product.name}</strong>
                    <small>{product.description}</small>
                    {product.allergens.length > 0 && (
                      <em>Contiene: {product.allergens.join(", ")}</em>
                    )}
                    <span>
                      {money(product.priceClp)}
                      {product.available && (
                        <i>
                          <Icon name="plus" size={18} />
                        </i>
                      )}
                    </span>
                  </span>
                </button>
              </article>
            ))}
          </div>
        </section>
      )}

      {screen === "cart" && (
        <section className="contentScreen cartScreen">
          <div className="screenHeading">
            <button
              aria-label="Volver"
              className="roundBack"
              onClick={() => setScreen("menu")}
              type="button"
            >
              <Icon name="arrow" />
            </button>
            <div>
              <p className="sectionKicker">Tu carrito</p>
              <h1>Mi pedido</h1>
            </div>
          </div>

          {data.cart.lines.length === 0 ? (
            <div className="emptyCart">
              <span>
                <Icon name="bag" size={32} />
              </span>
              <h2>Aún no agregas nada</h2>
              <p>La carta sigue a un toque.</p>
              <button className="solidButton" onClick={() => setScreen("menu")}>
                Ver la carta
              </button>
            </div>
          ) : (
            <>
              <div className="cartLines">
                {data.cart.lines.map((line) => (
                  <article key={line.id}>
                    <div>
                      <strong>{line.productName}</strong>
                      {line.variantName && <small>{line.variantName}</small>}
                      {line.note && <em>“{line.note}”</em>}
                      {line.isLoyaltyReward ? (
                        <span className="rewardBadge">PREMIO · $0</span>
                      ) : (
                        <b>{money(line.lineTotalClp)}</b>
                      )}
                    </div>
                    <div className="quantityControl">
                      <button
                        aria-label={`Quitar una unidad de ${line.productName}`}
                        disabled={working}
                        onClick={() =>
                          void mutate({
                            action: "cart.update",
                            lineId: line.id,
                            quantity: line.quantity - 1,
                          })
                        }
                        type="button"
                      >
                        <Icon name="minus" size={16} />
                      </button>
                      <span>{line.quantity}</span>
                      <button
                        aria-label={`Agregar una unidad de ${line.productName}`}
                        disabled={working}
                        onClick={() =>
                          void mutate({
                            action: "cart.update",
                            lineId: line.id,
                            quantity: line.quantity + 1,
                          })
                        }
                        type="button"
                      >
                        <Icon name="plus" size={16} />
                      </button>
                    </div>
                  </article>
                ))}
              </div>

              {data.waiterPaymentRequest && (
                <div className="waiterPending" role="status">
                  <Icon name="clock" />
                  <div>
                    <strong>Pendiente de pago con el garzón</strong>
                    <p>Tu pedido aún no fue enviado a la barra.</p>
                  </div>
                </div>
              )}

              <div className="cartSummary solidSurface">
                <span>Subtotal</span>
                <strong>{money(subtotal)}</strong>
              </div>
              <button
                className="solidButton payButton"
                disabled={working}
                onClick={() => setScreen("checkout")}
                type="button"
              >
                Ir al pago
                <span>{money(subtotal)}</span>
              </button>
              <button
                className="textButton"
                disabled={working}
                onClick={() => void mutate({ action: "waiter.pay" })}
                type="button"
              >
                Prefiero pagar con el garzón
              </button>
              <p className="waiterClarification">
                Esta opción solo avisa al equipo. No crea un pedido ni envía
                comandas hasta que el pago sea confirmado.
              </p>
            </>
          )}
        </section>
      )}

      {screen === "checkout" && (
        <section className="contentScreen checkoutScreen">
          <div className="screenHeading">
            <button
              aria-label="Volver"
              className="roundBack"
              onClick={() => setScreen("cart")}
              type="button"
            >
              <Icon name="arrow" />
            </button>
            <div>
              <p className="sectionKicker">Pago seguro</p>
              <h1>Checkout</h1>
            </div>
          </div>

          <div className="checkoutContext">
            <div>
              <span>{data.venue.name}</span>
              <strong>{data.venue.tableName}</strong>
            </div>
            <div>
              <span>Tu alias</span>
              <strong>{data.session?.alias}</strong>
            </div>
          </div>

          {!data.quote ? (
            <>
              <section className="checkoutBlock">
                <label htmlFor="display-name">
                  Tu nombre o apodo <span>opcional</span>
                </label>
                <p>Para que el garzón te encuentre en una mesa grande.</p>
                <div className="inputWithIcon">
                  <Icon name="user" size={19} />
                  <input
                    autoComplete="nickname"
                    id="display-name"
                    maxLength={60}
                    onChange={(event) => setDisplayName(event.target.value)}
                    placeholder="Ej: Cata"
                    value={displayName}
                  />
                </div>
                <label htmlFor="receipt-email">
                  Correo para tu boleta <span>opcional</span>
                </label>
                <p>También podrás verla aquí cuando esté emitida.</p>
                <div className="inputWithIcon">
                  <Icon name="user" size={19} />
                  <input
                    autoComplete="email"
                    id="receipt-email"
                    inputMode="email"
                    maxLength={254}
                    onChange={(event) => setCustomerEmail(event.target.value)}
                    placeholder="tu@correo.cl"
                    type="email"
                    value={customerEmail}
                  />
                </div>
              </section>

              <section className="checkoutBlock">
                <div className="labelRow">
                  <div>
                    <strong>Propina</strong>
                    <p>La puedes cambiar o dejar en $0.</p>
                  </div>
                  <b>{money(tipClp)}</b>
                </div>
                <div className="tipOptions">
                  {data.venue.tipSuggestions.map((suggestion) => (
                    <button
                      className={tipPercent === suggestion ? "selected" : ""}
                      key={suggestion}
                      onClick={() => setTipPercent(suggestion)}
                      type="button"
                    >
                      {suggestion === 0 ? "Sin propina" : `${suggestion}%`}
                    </button>
                  ))}
                  <button
                    className={tipPercent === -1 ? "selected" : ""}
                    onClick={() => setTipPercent(-1)}
                    type="button"
                  >
                    Otro
                  </button>
                </div>
                {tipPercent === -1 && (
                  <label className="customTip">
                    Monto en pesos
                    <input
                      inputMode="numeric"
                      min="0"
                      onChange={(event) =>
                        setCustomTip(event.target.value.replaceAll(/\D/g, ""))
                      }
                      placeholder="0"
                      value={customTip}
                    />
                  </label>
                )}
              </section>

              <div className="financialTotal">
                <div>
                  <span>Subtotal</span>
                  <b>{money(subtotal)}</b>
                </div>
                <div>
                  <span>Propina</span>
                  <b>{money(tipClp)}</b>
                </div>
                <small>Precios con impuestos incluidos</small>
                <div className="grandTotal">
                  <strong>Total</strong>
                  <strong>{money(subtotal + tipClp)}</strong>
                </div>
              </div>
              <button
                className="solidButton payButton"
                disabled={working}
                onClick={() => void createQuote()}
                type="button"
              >
                {working ? "Verificando stock…" : "Preparar pago"}
                <Icon name="arrow" />
              </button>
            </>
          ) : (
            <>
              <div className="financialTotal paymentTotal">
                <span>Total a pagar</span>
                <strong>{money(data.quote.totalClp)}</strong>
                <small>
                  {data.venue.name} · {data.venue.tableName} ·{" "}
                  {data.session?.displayName || data.session?.alias}
                </small>
              </div>

              <section className="paymentMethods">
                <p className="sectionKicker">Método de pago</p>
                <label className="methodSelected">
                  <input defaultChecked name="payment" type="radio" />
                  <span className="demoCard">DEMO</span>
                  <span>
                    <strong>Tarjeta simulada</strong>
                    <small>No se cobrará dinero real</small>
                  </span>
                  <Icon name="check" size={19} />
                </label>
                <label className="methodDisabled">
                  <input disabled name="payment" type="radio" />
                  <span className="appleMark"></span>
                  <span>
                    <strong>Apple Pay</strong>
                    <small>Pendiente de validar con pasarela real</small>
                  </span>
                </label>
              </section>

              <div className="securityNote">
                <Icon name="shield" size={20} />
                <span>
                  El pedido nace solo cuando el servidor confirma el pago.
                </span>
              </div>
              <button
                className="solidButton payButton"
                disabled={working}
                onClick={() => void startPayment()}
                type="button"
              >
                {working ? "Iniciando pago…" : "Pagar en modo demo"}
                <span>{money(data.quote.totalClp)}</span>
              </button>
            </>
          )}
        </section>
      )}

      {screen === "status" && (
        <section className="contentScreen statusScreen">
          {data.payment?.status === "pending" && !latestOrder ? (
            <div className="pendingPayment solidSurface">
              <span className="paymentSpinner" />
              <p className="sectionKicker">Confirmación server-side</p>
              <h1>Estamos confirmando tu pago</h1>
              <p>
                No cierres esta pantalla. Si cambia tu red, recuperaremos el
                estado sin crear otro intento.
              </p>
              <div>
                <Icon name="shield" />
                El navegador no puede aprobar este pago.
              </div>
            </div>
          ) : latestOrder ? (
            <>
              <div className="confirmationCard solidSurface">
                <span className="successSeal">
                  <Icon name="check" size={30} />
                </span>
                <p className="sectionKicker">Pago confirmado</p>
                <h1>Tu pedido ya está en la barra</h1>
                <div className="orderIdentity">
                  <div>
                    <span>Pedido</span>
                    <strong>#{latestOrder.number}</strong>
                  </div>
                  <div>
                    <span>Entrega</span>
                    <strong>
                      {latestOrder.displayName || latestOrder.alias}
                    </strong>
                  </div>
                </div>
                <strong className="confirmedAmount">
                  {money(latestOrder.totalClp)}
                </strong>
              </div>

              <section
                className={`taxDocumentCard taxDocument-${latestOrder.taxDocument.status}`}
                aria-live="polite"
              >
                <div>
                  <p className="sectionKicker">Boleta electrónica</p>
                  <strong>
                    {latestOrder.taxDocument.status === "issued"
                      ? `Emitida · folio ${latestOrder.taxDocument.folio}`
                      : latestOrder.taxDocument.status === "failed"
                        ? "Emisión pendiente"
                        : "Emitiendo…"}
                  </strong>
                  <span>{latestOrder.taxDocument.message}</span>
                </div>
                {latestOrder.taxDocument.representationUrl ? (
                  <a
                    href={latestOrder.taxDocument.representationUrl}
                    rel="noreferrer"
                    target="_blank"
                  >
                    Ver / descargar
                  </a>
                ) : null}
              </section>

              <section className="orderProgress">
                <div className="statusSteps" aria-label="Estado general">
                  <span className="done">
                    <i>
                      <Icon name="check" size={14} />
                    </i>
                    Pagado
                  </span>
                  <b />
                  <span
                    className={
                      latestOrder.state !== "confirmed" ? "done" : "active"
                    }
                  >
                    <i>
                      <Icon name="spark" size={14} />
                    </i>
                    Preparando
                  </span>
                  <b />
                  <span className={latestOrder.state === "ready" ? "done" : ""}>
                    <i>
                      <Icon name="check" size={14} />
                    </i>
                    Listo
                  </span>
                </div>

                <div className="ticketList">
                  <p className="sectionKicker">Cada estación por separado</p>
                  {latestOrder.tickets.map((ticket) => (
                    <article key={ticket.id}>
                      <div>
                        <span className={`stationIcon ${ticket.status}`}>
                          {ticket.stationName === "Barra" ? "B" : "C"}
                        </span>
                        <div>
                          <strong>{ticket.stationName}</strong>
                          <small>{ticket.itemNames.join(" · ")}</small>
                        </div>
                      </div>
                      <TicketBadge status={ticket.status} />
                    </article>
                  ))}
                </div>
              </section>

              {data.loyalty.enrollmentAvailable ? (
                <section className="loyaltyPostPayment solidSurface">
                  <p className="sectionKicker">Una decisión aparte del pago</p>
                  <h2>Guarda un sello por esta visita</h2>
                  <p>
                    Ya pagaste. Si aceptas, este local recordará tus visitas y
                    podrás recuperar los sellos con teléfono o correo aunque
                    este navegador borre sus datos.
                  </p>
                  <button
                    className="solidButton"
                    onClick={() => {
                      setLoyaltyPurpose("enroll");
                      setScreen("loyalty");
                    }}
                  >
                    Quiero mis sellos
                  </button>
                  <small>
                    No es necesario para pedir ni pagar. No se comparte entre
                    bares.
                  </small>
                </section>
              ) : data.loyalty.profile ? (
                <section className="loyaltyPostPayment">
                  <strong>
                    Sello registrado · {data.loyalty.profile.stamps} de{" "}
                    {data.loyalty.visitsRequired}
                  </strong>
                </section>
              ) : null}

              <button
                className="solidButton"
                onClick={() => setScreen("menu")}
                type="button"
              >
                Pedir otra ronda
                <Icon name="arrow" />
              </button>
            </>
          ) : (
            <div className="pendingPayment solidSurface">
              <Icon name="warning" size={34} />
              <h1>Este pago no se confirmó</h1>
              <p>
                No enviamos nada a la barra. Vuelve a tu carrito para revisar.
              </p>
              <button className="solidButton" onClick={() => setScreen("cart")}>
                Volver al carrito
              </button>
            </div>
          )}
        </section>
      )}

      {screen === "actions" && (
        <section className="contentScreen actionsScreen">
          <div className="screenHeading">
            <button
              aria-label="Volver"
              className="roundBack"
              onClick={() => setScreen("menu")}
              type="button"
            >
              <Icon name="arrow" />
            </button>
            <div>
              <p className="sectionKicker">{data.venue.tableName}</p>
              <h1>¿Necesitas algo?</h1>
            </div>
          </div>
          <p className="actionsIntro">
            Avisamos una vez al equipo y te mostramos cuándo lo hiciste.
          </p>
          <div className="actionGrid">
            {data.actions.map((action) => {
              const elapsed = action.lastRequestedAt
                ? Date.parse(data.serverTime) -
                  Date.parse(action.lastRequestedAt)
                : Number.POSITIVE_INFINITY;
              const cooling = elapsed < action.cooldownSeconds * 1000;
              return (
                <button
                  className={cooling ? "requested" : ""}
                  disabled={working || cooling}
                  key={action.id}
                  onClick={() =>
                    void mutate({
                      action: "service.request",
                      serviceActionId: action.id,
                    })
                  }
                  type="button"
                >
                  <span>
                    <Icon name={action.icon} size={25} />
                  </span>
                  <strong>{action.label}</strong>
                  <small>
                    {cooling ? "Avisado hace un momento" : action.description}
                  </small>
                  {cooling && (
                    <i>
                      <Icon name="check" size={15} />
                    </i>
                  )}
                </button>
              );
            })}
          </div>
        </section>
      )}

      {screen === "loyalty" && (
        <section className="contentScreen loyaltyScreen">
          <div className="screenHeading">
            <button
              aria-label="Volver"
              className="roundBack"
              onClick={() => setScreen("menu")}
              type="button"
            >
              <Icon name="arrow" />
            </button>
            <div>
              <p className="sectionKicker">Programa de este local</p>
              <h1>Mis sellos</h1>
            </div>
          </div>

          {data.loyalty.profile ? (
            <>
              <section className="loyaltyWallet solidSurface">
                <span className="successSeal">
                  <Icon name="spark" size={28} />
                </span>
                <p>{data.loyalty.profile.maskedIdentity}</p>
                <h2>
                  {data.loyalty.profile.stamps} / {data.loyalty.visitsRequired}{" "}
                  sellos
                </h2>
                <div className="stampRail">
                  {Array.from({ length: data.loyalty.visitsRequired }).map(
                    (_, index) => (
                      <i
                        className={
                          index < data.loyalty.profile!.stamps ? "earned" : ""
                        }
                        key={index}
                      >
                        {index < data.loyalty.profile!.stamps ? "✓" : index + 1}
                      </i>
                    ),
                  )}
                </div>
                <p>
                  Continuidad: {data.loyalty.profile.contactMasked}. Si el
                  navegador pierde su token, recuperas aquí sin pedir ayuda al
                  bar.
                </p>
                {data.loyalty.profile.rewardAvailable ? (
                  <button
                    className="solidButton"
                    disabled={working}
                    onClick={() =>
                      void mutate(
                        { action: "loyalty.reward.add" },
                        { nextScreen: "cart" },
                      )
                    }
                  >
                    Agregar {data.loyalty.profile.rewardProductName} · premio
                  </button>
                ) : null}
              </section>
              <button
                className="dangerTextButton"
                disabled={working}
                onClick={() => {
                  if (
                    window.confirm(
                      "¿Eliminar tu identidad y revocar la recuperación? El historial financiero quedará anónimo.",
                    )
                  ) {
                    void mutate({ action: "loyalty.revoke" });
                  }
                }}
              >
                Salir del programa y eliminar mis datos
              </button>
            </>
          ) : data.loyalty.challenge ? (
            <section className="loyaltyForm solidSurface">
              <p className="sectionKicker">Verifica que eres tú</p>
              <h2>
                Código enviado a {data.loyalty.challenge.maskedDestination}
              </h2>
              <label htmlFor="loyalty-code">Código de 6 dígitos</label>
              <input
                id="loyalty-code"
                inputMode="numeric"
                maxLength={6}
                onChange={(event) =>
                  setLoyaltyCode(event.target.value.replaceAll(/\D/g, ""))
                }
                value={loyaltyCode}
              />
              <p className="demoHint">
                En demo usa <strong>{data.loyalty.challenge.demoCode}</strong>
              </p>
              <button
                className="solidButton"
                disabled={working || loyaltyCode.length !== 6}
                onClick={() => void verifyLoyaltyChallenge()}
              >
                Recuperar mis sellos
              </button>
            </section>
          ) : (
            <section className="loyaltyForm solidSurface">
              <p className="sectionKicker">
                {loyaltyPurpose === "recover"
                  ? "Continuidad principal"
                  : "Después del primer pago"}
              </p>
              <h2>
                {loyaltyPurpose === "recover"
                  ? "Recupera tus sellos"
                  : "Activa tus sellos"}
              </h2>
              <p>
                El token de este navegador puede perderse. Por eso teléfono o
                correo son la forma principal de volver a entrar.
              </p>
              <div className="tipOptions">
                <button
                  className={loyaltyChannel === "phone" ? "selected" : ""}
                  onClick={() => setLoyaltyChannel("phone")}
                >
                  Teléfono
                </button>
                <button
                  className={loyaltyChannel === "email" ? "selected" : ""}
                  onClick={() => setLoyaltyChannel("email")}
                >
                  Correo
                </button>
              </div>
              <label htmlFor="loyalty-contact">
                {loyaltyChannel === "phone" ? "Teléfono" : "Correo"}
              </label>
              <input
                autoComplete={loyaltyChannel === "phone" ? "tel" : "email"}
                id="loyalty-contact"
                onChange={(event) => setLoyaltyContact(event.target.value)}
                placeholder={
                  loyaltyChannel === "phone"
                    ? "+56 9 1234 5678"
                    : "tu@correo.cl"
                }
                value={loyaltyContact}
              />
              {loyaltyPurpose === "enroll" ? (
                <div className="consentChecks">
                  <label>
                    <input
                      checked={identityConsent}
                      onChange={(event) =>
                        setIdentityConsent(event.target.checked)
                      }
                      type="checkbox"
                    />
                    Acepto que este local recuerde mis visitas y preferencias.
                  </label>
                  <label>
                    <input
                      checked={contactConsent}
                      onChange={(event) =>
                        setContactConsent(event.target.checked)
                      }
                      type="checkbox"
                    />
                    Acepto usar este dato para recuperar mis sellos. No acepto
                    mensajes comerciales.
                  </label>
                </div>
              ) : null}
              <button
                className="solidButton"
                disabled={
                  working ||
                  !loyaltyContact.trim() ||
                  (loyaltyPurpose === "enroll" &&
                    (!identityConsent || !contactConsent))
                }
                onClick={() => void startLoyaltyChallenge()}
              >
                Enviar código
              </button>
              {loyaltyPurpose === "recover" && latestOrder ? (
                <button
                  className="textButton"
                  onClick={() => setLoyaltyPurpose("enroll")}
                >
                  Soy nuevo: activar programa
                </button>
              ) : null}
            </section>
          )}
        </section>
      )}

      {screen !== "entry" && (
        <nav className="bottomNav" aria-label="Navegación principal">
          <button
            className={screen === "menu" ? "active" : ""}
            onClick={() => setScreen("menu")}
            type="button"
          >
            <Icon name="cutlery" size={21} />
            Carta
          </button>
          <button
            className={screen === "status" ? "active" : ""}
            disabled={!latestOrder && data.payment?.status !== "pending"}
            onClick={() => setScreen("status")}
            type="button"
          >
            <Icon name="clock" size={21} />
            Estado
          </button>
          <button
            className={screen === "actions" ? "active" : ""}
            onClick={() => setScreen("actions")}
            type="button"
          >
            <Icon name="hand" size={21} />
            Ayuda
          </button>
          <button
            className={screen === "loyalty" ? "active" : ""}
            onClick={() => setScreen("loyalty")}
            type="button"
          >
            <Icon name="spark" size={21} />
            Sellos
          </button>
        </nav>
      )}

      {selectedProduct && (
        <div
          aria-labelledby="product-title"
          aria-modal="true"
          className="modalBackdrop"
          role="dialog"
        >
          <article className="productModal">
            <button
              aria-label="Cerrar detalle"
              className="modalClose"
              onClick={() => setSelectedProduct(undefined)}
              type="button"
            >
              <Icon name="close" />
            </button>
            <div className="modalPhoto">
              <Image
                alt={selectedProduct.imageAlt}
                fill
                sizes="100vw"
                src={selectedProduct.imageUrl}
              />
            </div>
            <div className="modalBody">
              <p className="sectionKicker">
                {
                  data.categories.find(
                    (item) => item.id === selectedProduct.categoryId,
                  )?.name
                }
              </p>
              <h2 id="product-title">{selectedProduct.name}</h2>
              <p>{selectedProduct.description}</p>
              {selectedProduct.allergens.length > 0 && (
                <div className="allergenNote">
                  <Icon name="warning" size={17} />
                  Contiene: {selectedProduct.allergens.join(", ")}
                </div>
              )}
              {selectedProduct.variants.length > 0 && (
                <fieldset className="variantList">
                  <legend>Elige una opción</legend>
                  {selectedProduct.variants.map((variant) => (
                    <label key={variant.id}>
                      <input
                        checked={selectedVariant === variant.id}
                        name="variant"
                        onChange={() => setSelectedVariant(variant.id)}
                        type="radio"
                      />
                      <span>{variant.name}</span>
                      <b>
                        {variant.priceDeltaClp === 0
                          ? "Incluido"
                          : `${variant.priceDeltaClp > 0 ? "+" : "−"}${money(
                              Math.abs(variant.priceDeltaClp),
                            )}`}
                      </b>
                    </label>
                  ))}
                </fieldset>
              )}
              <label className="noteField">
                Nota para la barra o cocina
                <input
                  maxLength={140}
                  onChange={(event) => setNote(event.target.value)}
                  placeholder="Ej: sin hielo"
                  value={note}
                />
              </label>
              <div className="modalAction">
                <div className="quantityControl">
                  <button
                    aria-label="Quitar una unidad"
                    disabled={quantity === 1}
                    onClick={() =>
                      setQuantity((current) => Math.max(1, current - 1))
                    }
                    type="button"
                  >
                    <Icon name="minus" size={16} />
                  </button>
                  <span>{quantity}</span>
                  <button
                    aria-label="Agregar una unidad"
                    onClick={() => setQuantity((current) => current + 1)}
                    type="button"
                  >
                    <Icon name="plus" size={16} />
                  </button>
                </div>
                <button
                  className="solidButton"
                  disabled={working}
                  onClick={() => void addProduct()}
                  type="button"
                >
                  Agregar
                  <span>
                    {money(
                      (selectedProduct.priceClp +
                        (selectedProduct.variants.find(
                          (variant) => variant.id === selectedVariant,
                        )?.priceDeltaClp ?? 0)) *
                        quantity,
                    )}
                  </span>
                </button>
              </div>
            </div>
          </article>
        </div>
      )}
    </main>
  );
}

function TicketBadge({ status }: { status: TicketStatus }) {
  const labels: Record<TicketStatus, string> = {
    queued: "Recibido",
    acknowledged: "Visto",
    in_preparation: "Preparando",
    ready: "Listo",
    completed: "Entregado",
  };
  return <span className={`ticketBadge ${status}`}>{labels[status]}</span>;
}
