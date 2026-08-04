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
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { cn } from "@/lib/cn";
import { formatClp as money } from "@/lib/format";
import type {
  DinerBootstrap,
  DinerMutation,
  DinerProduct,
  TicketStatus,
} from "../../../lib/diner-contract";

type Screen =
  "entry" | "menu" | "cart" | "checkout" | "status" | "actions" | "loyalty";

function Icon({
  className,
  name,
  size = 22,
}: {
  className?: string;
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
      className={className}
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

// Fila de opciones con scroll horizontal propio, mismo patrón que las
// pestañas de Caja y el carril de pasos de Onboarding — no existe un
// componente Tabs dedicado todavía.
function OptionRail({
  children,
}: {
  children: ReactNode;
}) {
  return (
    <div className="flex gap-2 overflow-x-auto pb-1" role="group">
      {children}
    </div>
  );
}

function RailButton({
  active,
  children,
  onClick,
  type = "button",
}: {
  active: boolean;
  children: ReactNode;
  onClick: () => void;
  type?: "button";
}) {
  return (
    <Button
      className="shrink-0"
      onClick={onClick}
      size="small"
      type={type}
      variant={active ? "primary" : "outline"}
    >
      {children}
    </Button>
  );
}

// Icono redondo mínimo 56px — volver, carrito, sellos en la barra superior.
function IconButton({
  "aria-label": ariaLabel,
  badge,
  children,
  onClick,
}: {
  "aria-label": string;
  badge?: ReactNode;
  children: ReactNode;
  onClick: () => void;
}) {
  return (
    <button
      aria-label={ariaLabel}
      className="relative flex size-touch items-center justify-center rounded-full bg-transparent text-foreground hover:bg-muted"
      onClick={onClick}
      type="button"
    >
      {children}
      {badge ? (
        <b className="absolute -right-1 -top-1 flex min-w-icon items-center justify-center rounded-full bg-brand px-1 text-label font-extrabold text-primary-foreground">
          {badge}
        </b>
      ) : null}
    </button>
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
  const [invitationTargetTableId, setInvitationTargetTableId] = useState("");
  const [category, setCategory] = useState("all");
  const [presenceCode, setPresenceCode] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [customerEmail, setCustomerEmail] = useState("");
  const [tipPercent, setTipPercent] = useState(10);
  const [customTip, setCustomTip] = useState("");
  const [tipRecipientEmployeeId, setTipRecipientEmployeeId] = useState("");
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
  const [storedValueClp, setStoredValueClp] = useState("0");
  const [topUpClp, setTopUpClp] = useState("20000");
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
    setInvitationTargetTableId("");
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
      invitationTargetTableId: invitationTargetTableId || undefined,
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
      requestedStoredValueClp: Number(storedValueClp) || 0,
      displayName,
      customerEmail: customerEmail || undefined,
      tipRecipientEmployeeId: tipRecipientEmployeeId || undefined,
      idempotencyKey: crypto.randomUUID(),
    });
    if (next?.quote) setScreen("checkout");
  }

  async function topUpStoredValue() {
    await mutate({
      action: "stored_value.topup",
      loadedMoneyClp: Number(topUpClp),
      idempotencyKey: crypto.randomUUID(),
    });
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
      <main className="flex min-h-dvh flex-col items-center justify-center gap-4 bg-background">
        <span className="flex size-touch items-center justify-center rounded-full bg-brand text-h2 font-extrabold text-primary-foreground">
          t
        </span>
        <p className="text-body text-muted-foreground">Abriendo tu mesa…</p>
      </main>
    );
  }

  if (!data) {
    return (
      <main className="flex min-h-dvh flex-col items-center justify-center gap-4 bg-background px-6 text-center">
        <span className="flex size-touch items-center justify-center rounded-full bg-brand text-h2 font-extrabold text-primary-foreground">
          t
        </span>
        <p className="text-body text-foreground">
          {error ?? "No pudimos abrir este QR."}
        </p>
        <Button onClick={() => void refresh()} type="button">
          Intentar otra vez
        </Button>
      </main>
    );
  }

  return (
    <main className="mx-auto min-h-dvh w-full max-w-[720px] overflow-x-hidden bg-background pb-[112px] shadow-[0_0_60px_rgba(17,17,16,0.12)]">
      <div
        className="relative z-30 flex min-h-[31px] items-center justify-center gap-2 bg-foreground px-4 py-2 text-label font-extrabold uppercase tracking-wide text-background"
        role="status"
      >
        <span className="size-2 shrink-0 rounded-full bg-brand" />
        Modo demo · no mueve dinero real
      </div>

      {screen !== "entry" && (
        <header className="sticky top-0 z-20 grid min-h-[70px] grid-cols-[56px_1fr_56px] items-center gap-2 border-b border-border bg-card px-3 py-2">
          <IconButton aria-label="Volver a la carta" onClick={() => setScreen("menu")}>
            <span className="flex size-8 items-center justify-center rounded-full bg-brand text-body font-extrabold text-primary-foreground">
              t
            </span>
          </IconButton>
          <div className="min-w-0 text-center">
            <strong className="block truncate text-body font-extrabold text-foreground">
              {data.venue.name}
            </strong>
            <span className="block truncate text-small text-muted-foreground">
              {data.venue.tableName} ·{" "}
              {data.session?.displayName || data.session?.alias}
            </span>
          </div>
          <IconButton
            aria-label={`Mi pedido, ${cartCount} ${
              cartCount === 1 ? "producto" : "productos"
            }`}
            badge={cartCount > 0 ? cartCount : undefined}
            onClick={() => setScreen("cart")}
          >
            <Icon name="bag" />
          </IconButton>
        </header>
      )}

      {error && (
        <div
          className="inlineError mx-4 mt-3 flex items-center gap-2 rounded-surface-md border border-destructive bg-destructive-soft p-3 text-small text-foreground"
          role="alert"
        >
          <Icon name="warning" size={19} />
          <span className="flex-1">{error}</span>
          <button
            aria-label="Cerrar error"
            className="flex size-8 shrink-0 items-center justify-center rounded-full bg-transparent text-foreground"
            onClick={() => setError(undefined)}
            type="button"
          >
            <Icon name="close" size={18} />
          </button>
        </div>
      )}

      {!data.ordering.available && data.orders.length === 0 && (
        <section className="flex flex-col items-center gap-3 px-6 py-16 text-center">
          <p className="text-label uppercase tracking-wide text-muted-foreground">
            Pedidos no disponibles
          </p>
          <h1 className="text-h2 text-foreground">
            Habla con el equipo del local
          </h1>
          <p className="text-body text-muted-foreground">
            {data.ordering.message}
          </p>
        </section>
      )}

      {data.ordering.available && screen === "entry" && (
        <section>
          <div className="relative h-[240px] w-full" aria-hidden="true">
            <Image alt="" fill priority sizes="100vw" src="/menu/beer.jpg" />
            <span className="absolute left-4 top-4 rounded-full bg-foreground px-3 py-1 text-body font-extrabold text-background">
              tablio
            </span>
          </div>
          <div className="space-y-6 rounded-t-[24px] bg-card px-6 py-8 shadow-[0_-8px_24px_rgba(17,17,16,0.08)]">
            <div className="space-y-1">
              <p className="text-label uppercase tracking-wide text-muted-foreground">
                Ya casi estás
              </p>
              <h1 className="text-h1 text-foreground">
                {data.venue.name} <span className="text-brand">·</span>{" "}
                {data.venue.tableName}
              </h1>
              <p className="text-body text-muted-foreground">
                Escribe el código corto que está impreso en tu mesa.
              </p>
            </div>
            <form className="space-y-4" onSubmit={join}>
              <label
                className="block space-y-2 text-small font-bold text-foreground"
                htmlFor="presence-code"
              >
                Código de la mesa
                <Input
                  autoComplete="one-time-code"
                  autoFocus
                  className="text-center text-h2 tracking-[0.3em]"
                  id="presence-code"
                  inputMode="numeric"
                  maxLength={4}
                  onChange={(event) =>
                    setPresenceCode(event.target.value.replaceAll(/\D/g, ""))
                  }
                  placeholder="0000"
                  value={presenceCode}
                />
              </label>
              <Button
                className="w-full"
                disabled={presenceCode.length !== 4 || working}
                type="submit"
              >
                {working ? "Confirmando…" : "Entrar a la carta"}
                <Icon name="arrow" />
              </Button>
            </form>
            <p className="text-center text-small text-muted-foreground">
              Para esta demo usa <strong className="text-foreground">4826</strong>
            </p>
          </div>
        </section>
      )}

      {data.ordering.available && screen === "menu" && (
        <section className="space-y-6 px-4 py-6">
          <div className="flex items-start justify-between gap-3">
            <div className="space-y-1">
              <p className="text-label uppercase tracking-wide text-muted-foreground">
                Buenas noches
              </p>
              <h1 className="text-h1 text-foreground">¿Qué te tinca?</h1>
              <p className="text-body text-muted-foreground">
                Pide a tu ritmo. Cada persona tiene su propio carrito.
              </p>
            </div>
            <span className="flex shrink-0 items-center gap-1 rounded-full border border-border bg-card px-3 py-2 text-small font-bold text-foreground">
              <Icon name="user" size={17} />
              {data.session?.alias}
            </span>
          </div>

          {data.engagement.promotion ? (
            <section
              className="flex items-center justify-between gap-3 rounded-surface-lg bg-foreground p-4"
              role="status"
            >
              <div className="space-y-1">
                <p className="text-label uppercase tracking-wide text-background/70">
                  Happy hour activo
                </p>
                <strong className="block text-body font-extrabold text-background">
                  {data.engagement.promotion.name}
                </strong>
                <span className="block text-small text-background/70">
                  {data.engagement.promotion.description}
                </span>
              </div>
              <b className="text-small text-background/70">
                v{data.engagement.promotion.version}
              </b>
            </section>
          ) : null}

          {latestOrder && latestOrder.state !== "delivered" && (
            <button
              className="flex w-full items-center gap-3 rounded-surface-lg border border-brand bg-accent px-4 py-3 text-left"
              onClick={() => setScreen("status")}
              type="button"
            >
              <span className="size-2 shrink-0 animate-pulse rounded-full bg-brand" />
              <span className="flex-1">
                <b className="block text-body font-extrabold text-foreground">
                  Pedido #{latestOrder.number}
                </b>
                <small className="block text-small text-muted-foreground">
                  {latestOrder.state === "ready"
                    ? "Hay algo listo"
                    : "Lo están preparando"}
                </small>
              </span>
              <Icon name="arrow" />
            </button>
          )}

          {data.engagement.receivedInvitations.some(
            (invitation) => invitation.state === "pending_claim",
          ) ? (
            <section
              className="space-y-3 rounded-surface-lg bg-foreground p-4"
              role="status"
            >
              <p className="text-label uppercase tracking-wide text-background/70">
                Te invitaron
              </p>
              {data.engagement.receivedInvitations
                .filter((invitation) => invitation.state === "pending_claim")
                .map((invitation) => (
                  <article
                    className="space-y-2 border-t border-background/20 pt-3 first:border-t-0 first:pt-0"
                    key={invitation.id}
                  >
                    <div className="space-y-1">
                      <h2 className="text-h3 text-background">
                        {invitation.productName}
                      </h2>
                      <p className="text-small text-background/70">
                        Te lo invita {invitation.inviterAlias}. Mostramos su
                        alias, no su nombre completo.
                      </p>
                      {invitation.expiringSoon ? (
                        <strong className="block text-small font-bold text-background">
                          Está por vencer. Reclámalo para enviarlo a la barra.
                        </strong>
                      ) : (
                        <span className="block text-small text-background/70">
                          Se prepara solo después de que lo reclames.
                        </span>
                      )}
                    </div>
                    <Button
                      className="disabled:bg-background/15 disabled:text-background/60 disabled:opacity-100"
                      disabled={working}
                      onClick={() =>
                        void mutate({
                          action: "invitation.claim",
                          invitationId: invitation.id,
                        })
                      }
                      type="button"
                    >
                      Reclamar invitación
                    </Button>
                  </article>
                ))}
            </section>
          ) : null}

          {data.loyalty.recognition ? (
            <section className="space-y-3 rounded-surface-lg bg-foreground p-4">
              <div className="space-y-1">
                <p className="text-label uppercase tracking-wide text-background/70">
                  Perfil del programa encontrado
                </p>
                <h2 className="text-h3 text-background">
                  ¿Este perfil es tuyo?
                </h2>
                <strong className="block text-body font-extrabold text-background">
                  {data.loyalty.recognition.maskedIdentity}
                </strong>
                <p className="text-small text-background/70">
                  No mostramos nombres completos porque este teléfono puede
                  circular por la mesa.
                </p>
              </div>
              <div className="flex flex-wrap gap-2">
                <Button
                  className="disabled:bg-background/15 disabled:text-background/60 disabled:opacity-100"
                  disabled={working}
                  onClick={() =>
                    void mutate({ action: "loyalty.recognition.confirm" })
                  }
                >
                  Sí, usar mis sellos
                </Button>
                <Button
                  className="border-background/40 bg-transparent text-background hover:bg-background/10"
                  disabled={working}
                  onClick={() =>
                    void mutate({ action: "loyalty.recognition.reject" })
                  }
                  variant="outline"
                >
                  No soy yo
                </Button>
              </div>
            </section>
          ) : data.loyalty.profile ? (
            <section className="flex items-center justify-between gap-3 rounded-surface-lg border border-border bg-card p-4">
              <div className="space-y-1">
                <p className="text-label uppercase tracking-wide text-muted-foreground">
                  Tus sellos en este local
                </p>
                <h2 className="text-h3 text-foreground">
                  {data.loyalty.profile.stamps} de {data.loyalty.visitsRequired}
                </h2>
                <p className="text-small text-muted-foreground">
                  Recuperación activa en {data.loyalty.profile.contactMasked}
                </p>
              </div>
              {data.loyalty.profile.rewardAvailable ? (
                <Button
                  disabled={working}
                  onClick={() => void mutate({ action: "loyalty.reward.add" })}
                  size="small"
                >
                  Usar premio
                </Button>
              ) : (
                <Button
                  onClick={() => setScreen("loyalty")}
                  size="small"
                  variant="outline"
                >
                  Ver programa
                </Button>
              )}
            </section>
          ) : (
            <button
              className="w-full bg-transparent text-left text-small font-bold text-brand underline"
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
            <section className="flex items-center justify-between gap-3 rounded-surface-lg border border-border bg-card p-4">
              <div className="space-y-1">
                <p className="text-label uppercase tracking-wide text-muted-foreground">
                  Tu de siempre
                </p>
                <strong className="block text-body font-extrabold text-foreground">
                  {data.loyalty.favorite.productName}
                </strong>
                <small className="block text-small text-muted-foreground">
                  Basado en tus pedidos reales en este local.
                </small>
              </div>
              <Button
                disabled={working}
                onClick={() => void mutate({ action: "loyalty.favorite.add" })}
                size="small"
                variant="outline"
              >
                Agregar
              </Button>
            </section>
          ) : null}

          <nav aria-label="Categorías">
            <OptionRail>
              <RailButton
                active={category === "all"}
                onClick={() => setCategory("all")}
              >
                Todo
              </RailButton>
              {data.categories.map((item) => (
                <RailButton
                  active={category === item.id}
                  key={item.id}
                  onClick={() => setCategory(item.id)}
                >
                  {item.name}
                </RailButton>
              ))}
            </OptionRail>
          </nav>

          <div className="grid grid-cols-2 gap-3">
            {visibleProducts.map((product) => (
              <article
                className={cn(
                  "overflow-hidden rounded-surface-lg border border-border bg-card",
                  !product.available && "opacity-60",
                )}
                key={product.id}
              >
                <button
                  aria-label={`Ver ${product.name}`}
                  className="block w-full bg-transparent text-left disabled:cursor-not-allowed"
                  disabled={!product.available}
                  onClick={() => openProduct(product)}
                  type="button"
                >
                  <span className="relative block aspect-square w-full bg-muted">
                    <Image
                      alt={product.imageAlt}
                      fill
                      loading={product.id === "lager-casa" ? "eager" : "lazy"}
                      sizes="(max-width: 600px) 48vw, 280px"
                      src={product.imageUrl}
                    />
                    {!product.available && (
                      <b className="absolute inset-0 flex items-center justify-center bg-foreground/70 text-body font-extrabold text-background">
                        Agotado
                      </b>
                    )}
                  </span>
                  <span className="block space-y-1 p-3">
                    <strong className="block text-body font-bold text-foreground">
                      {product.name}
                    </strong>
                    <small className="block text-small text-muted-foreground">
                      {product.description}
                    </small>
                    {product.allergens.length > 0 && (
                      <em className="block text-small not-italic text-muted-foreground">
                        Contiene: {product.allergens.join(", ")}
                      </em>
                    )}
                    <span className="flex items-center justify-between pt-1">
                      <span className="text-body font-extrabold text-foreground">
                        {money(product.priceClp)}
                      </span>
                      {product.available && (
                        <i className="flex size-8 items-center justify-center rounded-full bg-brand not-italic text-primary-foreground">
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
        <section className="space-y-6 px-4 py-6">
          <ScreenHeading
            eyebrow="Tu carrito"
            onBack={() => setScreen("menu")}
            title="Mi pedido"
          />

          {data.cart.lines.length === 0 ? (
            <div className="flex flex-col items-center gap-3 py-16 text-center">
              <span className="flex size-16 items-center justify-center rounded-full bg-muted text-muted-foreground">
                <Icon name="bag" size={32} />
              </span>
              <h2 className="text-h2 text-foreground">
                Aún no agregas nada
              </h2>
              <p className="text-body text-muted-foreground">
                La carta sigue a un toque.
              </p>
              <Button onClick={() => setScreen("menu")}>Ver la carta</Button>
            </div>
          ) : (
            <>
              <div className="space-y-3">
                {data.cart.lines.map((line) => (
                  <article
                    className="flex items-center justify-between gap-3 rounded-surface-lg border border-border bg-card p-4"
                    key={line.id}
                  >
                    <div className="min-w-0 flex-1 space-y-1">
                      <strong className="block text-body font-bold text-foreground">
                        {line.productName}
                      </strong>
                      {line.variantName && (
                        <small className="block text-small text-muted-foreground">
                          {line.variantName}
                        </small>
                      )}
                      {line.note && (
                        <em className="block text-small not-italic text-muted-foreground">
                          &ldquo;{line.note}&rdquo;
                        </em>
                      )}
                      {line.invitationTargetTableName ? (
                        <Badge variant="warning">
                          INVITACIÓN · entregar en{" "}
                          {line.invitationTargetTableName}
                        </Badge>
                      ) : null}
                      {line.isUpsell ? (
                        <Badge variant="neutral">SUGERENCIA ACEPTADA</Badge>
                      ) : null}
                      {line.promotionLabel ? (
                        <Badge variant="success">
                          {line.promotionLabel} · −
                          {money((line.unitDiscountClp ?? 0) * line.quantity)}
                        </Badge>
                      ) : null}
                      {line.isLoyaltyReward ? (
                        <Badge variant="success">PREMIO · $0</Badge>
                      ) : (
                        <b className="block text-body font-extrabold text-foreground">
                          {money(line.lineTotalClp)}
                        </b>
                      )}
                    </div>
                    <QuantityControl
                      label={line.productName}
                      onDecrement={() =>
                        void mutate({
                          action: "cart.update",
                          lineId: line.id,
                          quantity: line.quantity - 1,
                        })
                      }
                      onIncrement={() =>
                        void mutate({
                          action: "cart.update",
                          lineId: line.id,
                          quantity: line.quantity + 1,
                        })
                      }
                      quantity={line.quantity}
                      working={working}
                    />
                  </article>
                ))}
              </div>

              {data.waiterPaymentRequest && (
                <div
                  className="flex items-start gap-3 rounded-surface-lg border border-warning bg-warning-soft p-4"
                  role="status"
                >
                  <Icon name="clock" />
                  <div>
                    <strong className="block text-body font-bold text-foreground">
                      Pendiente de pago con el garzón
                    </strong>
                    <p className="text-small text-foreground">
                      Tu pedido aún no fue enviado a la barra.
                    </p>
                  </div>
                </div>
              )}

              <div className="cartSummary solidSurface flex items-center justify-between rounded-surface-lg bg-foreground p-4">
                <span className="text-small text-background/70">Subtotal</span>
                <strong className="text-h3 text-background">
                  {money(subtotal)}
                </strong>
              </div>
              <Button
                className="w-full justify-between"
                disabled={working}
                onClick={() => setScreen("checkout")}
                type="button"
              >
                Ir al pago
                <span>{money(subtotal)}</span>
              </Button>
              <Button
                className="w-full"
                disabled={working}
                onClick={() => void mutate({ action: "waiter.pay" })}
                type="button"
                variant="ghost"
              >
                Prefiero pagar con el garzón
              </Button>
              <p className="text-center text-small text-muted-foreground">
                Esta opción solo avisa al equipo. No crea un pedido ni envía
                comandas hasta que el pago sea confirmado.
              </p>
            </>
          )}
        </section>
      )}

      {screen === "checkout" && (
        <section className="space-y-6 px-4 py-6">
          <ScreenHeading
            eyebrow="Pago seguro"
            onBack={() => setScreen("cart")}
            title="Checkout"
          />

          <div className="flex items-center justify-between rounded-surface-lg border border-border bg-card p-4">
            <div className="space-y-1">
              <span className="block text-small text-muted-foreground">
                {data.venue.name}
              </span>
              <strong className="block text-body font-bold text-foreground">
                {data.venue.tableName}
              </strong>
            </div>
            <div className="space-y-1 text-right">
              <span className="block text-small text-muted-foreground">
                Tu alias
              </span>
              <strong className="block text-body font-bold text-foreground">
                {data.session?.alias}
              </strong>
            </div>
          </div>

          {!data.quote ? (
            <>
              {data.engagement.upsellSuggestions.length > 0 ? (
                <section className="space-y-3 rounded-surface-lg bg-foreground p-4">
                  <div className="space-y-1">
                    <p className="text-label uppercase tracking-wide text-background/70">
                      Por si te tinca
                    </p>
                    <h2 className="text-h3 text-background">
                      ¿Le sumas algo?
                    </h2>
                    <small className="block text-small text-background/70">
                      Opcional. Ignorarlo no cambia tu pedido ni agrega pasos.
                    </small>
                  </div>
                  {data.engagement.upsellSuggestions.map((suggestion) => (
                    <article
                      className="flex items-center justify-between gap-2 border-t border-background/20 pt-3 first:border-t-0 first:pt-0"
                      key={suggestion.ruleId}
                    >
                      <span className="space-y-1">
                        <strong className="block text-body font-bold text-background">
                          {suggestion.productName}
                        </strong>
                        <small className="block text-small text-background/70">
                          {money(suggestion.priceClp)}
                        </small>
                      </span>
                      <span className="flex shrink-0 items-center gap-2">
                        <Button
                          className="disabled:bg-background/15 disabled:text-background/60 disabled:opacity-100"
                          disabled={working}
                          onClick={() =>
                            void mutate({
                              action: "upsell.accept",
                              ruleId: suggestion.ruleId,
                              productId: suggestion.productId,
                            })
                          }
                          size="small"
                          type="button"
                        >
                          Sumar
                        </Button>
                        <button
                          aria-label={`Ignorar ${suggestion.productName}`}
                          className="bg-transparent text-small font-bold text-background/70 underline"
                          disabled={working}
                          onClick={() =>
                            void mutate({
                              action: "upsell.dismiss",
                              ruleId: suggestion.ruleId,
                            })
                          }
                          type="button"
                        >
                          Ahora no
                        </button>
                      </span>
                    </article>
                  ))}
                </section>
              ) : null}

              <section className="space-y-4 rounded-surface-lg border border-border bg-card p-4">
                <div className="space-y-2">
                  <label
                    className="block text-small font-bold text-foreground"
                    htmlFor="display-name"
                  >
                    Tu nombre o apodo{" "}
                    <span className="font-normal text-muted-foreground">
                      opcional
                    </span>
                  </label>
                  <p className="text-small text-muted-foreground">
                    Para que el garzón te encuentre en una mesa grande.
                  </p>
                  <Input
                    autoComplete="nickname"
                    id="display-name"
                    maxLength={60}
                    onChange={(event) => setDisplayName(event.target.value)}
                    placeholder="Ej: Cata"
                    value={displayName}
                  />
                </div>
                <div className="space-y-2">
                  <label
                    className="block text-small font-bold text-foreground"
                    htmlFor="receipt-email"
                  >
                    Correo para tu boleta{" "}
                    <span className="font-normal text-muted-foreground">
                      opcional
                    </span>
                  </label>
                  <p className="text-small text-muted-foreground">
                    También podrás verla aquí cuando esté emitida.
                  </p>
                  <Input
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

              {data.storedValue.consented ? (
                <section className="space-y-3 rounded-surface-lg border border-border bg-card p-4">
                  <div className="flex items-center justify-between gap-3">
                    <div className="space-y-1">
                      <strong className="block text-body font-bold text-foreground">
                        Saldo de este local
                      </strong>
                      <p className="text-small text-muted-foreground">
                        Disponible: {money(data.storedValue.balanceClp)}.
                        Puedes usar una parte y pagar el resto con tarjeta.
                      </p>
                    </div>
                  </div>
                  <label
                    className="block space-y-2 text-small font-bold text-foreground"
                    htmlFor="stored-value-amount"
                  >
                    Usar saldo en este pedido
                    <Input
                      id="stored-value-amount"
                      inputMode="numeric"
                      max={Math.min(
                        data.storedValue.balanceClp,
                        subtotal + tipClp,
                      )}
                      min="0"
                      onChange={(event) =>
                        setStoredValueClp(
                          String(
                            Math.min(
                              Number(
                                event.target.value.replaceAll(/\D/g, ""),
                              ) || 0,
                              data.storedValue.balanceClp,
                              subtotal + tipClp,
                            ),
                          ),
                        )
                      }
                      value={storedValueClp}
                    />
                  </label>
                  <small className="block text-small text-muted-foreground">
                    Bono primero y luego dinero cargado; dentro de cada uno,
                    vence primero lo que se usa primero.
                  </small>
                </section>
              ) : null}

              <section className="space-y-3 rounded-surface-lg border border-border bg-card p-4">
                <div className="flex items-center justify-between gap-3">
                  <div>
                    <strong className="block text-body font-bold text-foreground">
                      Propina
                    </strong>
                    <p className="text-small text-muted-foreground">
                      La puedes cambiar o dejar en $0.
                    </p>
                  </div>
                  <b className="text-body font-extrabold text-foreground">
                    {money(tipClp)}
                  </b>
                </div>
                <OptionRail>
                  {data.venue.tipSuggestions.map((suggestion) => (
                    <RailButton
                      active={tipPercent === suggestion}
                      key={suggestion}
                      onClick={() => setTipPercent(suggestion)}
                    >
                      {suggestion === 0 ? "Sin propina" : `${suggestion}%`}
                    </RailButton>
                  ))}
                  <RailButton
                    active={tipPercent === -1}
                    onClick={() => setTipPercent(-1)}
                  >
                    Otro
                  </RailButton>
                </OptionRail>
                {tipPercent === -1 && (
                  <label className="block space-y-2 text-small font-bold text-foreground">
                    Monto en pesos
                    <Input
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
                {tipClp > 0 && data.engagement.settings.waiterTipEnabled ? (
                  <fieldset className="space-y-2">
                    <legend className="text-small font-bold text-foreground">
                      ¿Para quién es la propina?
                    </legend>
                    <p className="text-small text-muted-foreground">
                      Tablio informa la distribución; el dinero lo entrega el
                      local.
                    </p>
                    <label className="flex items-center gap-2 text-body text-foreground">
                      <input
                        checked={tipRecipientEmployeeId === ""}
                        className="size-icon shrink-0"
                        name="tip-recipient"
                        onChange={() => setTipRecipientEmployeeId("")}
                        type="radio"
                      />
                      Equipo
                    </label>
                    {data.engagement.tipRecipients.map((waiter) => (
                      <label
                        className="flex items-center gap-2 text-body text-foreground"
                        key={waiter.employeeId}
                      >
                        <input
                          checked={tipRecipientEmployeeId === waiter.employeeId}
                          className="size-icon shrink-0"
                          name="tip-recipient"
                          onChange={() =>
                            setTipRecipientEmployeeId(waiter.employeeId)
                          }
                          type="radio"
                        />
                        {waiter.displayName}
                      </label>
                    ))}
                  </fieldset>
                ) : null}
              </section>

              <div className="financialTotal space-y-2 rounded-surface-lg bg-foreground p-6">
                <div className="flex items-center justify-between text-small text-background/70">
                  <span>Total de productos</span>
                  <b className="text-background">{money(subtotal)}</b>
                </div>
                <div className="flex items-center justify-between text-small text-background/70">
                  <span>Propina</span>
                  <b className="text-background">{money(tipClp)}</b>
                </div>
                <small className="block text-small text-background/70">
                  Precios con impuestos incluidos
                </small>
                <div className="grandTotal flex items-center justify-between border-t border-background/20 pt-3">
                  <strong className="text-body font-extrabold text-background">
                    Total
                  </strong>
                  <strong className="text-h2 text-background">
                    {money(subtotal + tipClp)}
                  </strong>
                </div>
              </div>
              <Button
                className="w-full"
                disabled={working}
                onClick={() => void createQuote()}
                type="button"
              >
                {working ? "Verificando stock…" : "Preparar pago"}
                <Icon name="arrow" />
              </Button>
            </>
          ) : (
            <>
              <div className="paymentTotal space-y-2 rounded-surface-lg bg-foreground p-6">
                <span className="block text-small text-background/70">
                  Total a pagar
                </span>
                <strong className="block text-[clamp(2rem,9vw,3.1rem)] leading-none tracking-tight text-background">
                  {money(data.quote.totalClp)}
                </strong>
                <small className="block text-small text-background/70">
                  {data.venue.name} · {data.venue.tableName} ·{" "}
                  {data.session?.displayName || data.session?.alias}
                </small>
                {data.quote.promotionDiscountClp > 0 ? (
                  <small className="block text-small text-background/70">
                    Happy hour: −{money(data.quote.promotionDiscountClp)} ·
                    precio congelado
                  </small>
                ) : null}
                <small className="block text-small text-background/70">
                  Propina para {data.quote.tipRecipient.label}
                </small>
                {data.quote.storedValueAppliedClp > 0 ? (
                  <>
                    <small className="block text-small text-background/70">
                      Saldo congelado: −
                      {money(data.quote.storedValueAppliedClp)}
                    </small>
                    <span className="block text-small text-background/70">
                      Resta pagar
                    </span>
                    <strong className="block text-h2 text-background">
                      {money(data.quote.externalPaymentDueClp)}
                    </strong>
                  </>
                ) : null}
              </div>

              <section className="space-y-3">
                <p className="text-label uppercase tracking-wide text-muted-foreground">
                  Método de pago
                </p>
                <label className="flex items-center gap-3 rounded-surface-lg border-2 border-brand bg-accent p-4">
                  <input defaultChecked className="sr-only" name="payment" type="radio" />
                  <span className="flex h-8 w-16 shrink-0 items-center justify-center rounded-surface-sm bg-foreground text-label font-extrabold text-background">
                    {data.quote.externalPaymentDueClp === 0 ? "SALDO" : "DEMO"}
                  </span>
                  <span className="flex-1">
                    <strong className="block text-body font-bold text-foreground">
                      {data.quote.externalPaymentDueClp === 0
                        ? "Saldo del local"
                        : "Tarjeta simulada"}
                    </strong>
                    <small className="block text-small text-muted-foreground">
                      {data.quote.externalPaymentDueClp === 0
                        ? "No se inicia un cobro externo"
                        : "No se cobrará dinero real"}
                    </small>
                  </span>
                  <Icon name="check" size={19} />
                </label>
                <label className="flex items-center gap-3 rounded-surface-lg border border-border bg-card p-4 opacity-50">
                  <input disabled className="sr-only" name="payment" type="radio" />
                  <span className="h-8 w-16 shrink-0 rounded-surface-sm border border-border" />
                  <span className="flex-1">
                    <strong className="block text-body font-bold text-foreground">
                      Apple Pay
                    </strong>
                    <small className="block text-small text-muted-foreground">
                      Pendiente de validar con pasarela real
                    </small>
                  </span>
                </label>
              </section>

              <div className="flex items-start gap-2 rounded-surface-md border border-border bg-card p-3">
                <Icon name="shield" size={20} />
                <span className="text-small text-muted-foreground">
                  El pedido nace solo cuando el servidor confirma el pago.
                </span>
              </div>
              <Button
                className="w-full justify-between"
                disabled={working}
                onClick={() => void startPayment()}
                type="button"
              >
                {working
                  ? "Confirmando en servidor…"
                  : data.quote.externalPaymentDueClp === 0
                    ? "Pagar con saldo"
                    : data.quote.storedValueAppliedClp > 0
                      ? "Pagar diferencia en demo"
                      : "Pagar en modo demo"}
                <span>{money(data.quote.externalPaymentDueClp)}</span>
              </Button>
            </>
          )}
        </section>
      )}

      {screen === "status" && (
        <section className="space-y-6 px-4 py-6">
          {data.payment?.status === "pending" && !latestOrder ? (
            <div className="pendingPayment solidSurface flex flex-col items-center gap-3 rounded-surface-lg bg-foreground p-8 text-center">
              <span className="size-12 animate-spin rounded-full border-4 border-background/30 border-t-background" />
              <p className="text-label uppercase tracking-wide text-background/70">
                Confirmación server-side
              </p>
              <h1 className="text-h2 text-background">
                Estamos confirmando tu pago
              </h1>
              <p className="text-body text-background/70">
                No cierres esta pantalla. Si cambia tu red, recuperaremos el
                estado sin crear otro intento.
              </p>
              <div className="flex items-center gap-2 text-small text-background/70">
                <Icon name="shield" />
                El navegador no puede aprobar este pago.
              </div>
            </div>
          ) : latestOrder ? (
            <>
              <div className="confirmationCard solidSurface space-y-3 rounded-surface-lg bg-foreground p-6 text-center">
                <span className="mx-auto flex size-touch items-center justify-center rounded-full bg-success text-success-foreground">
                  <Icon name="check" size={30} />
                </span>
                <p className="text-label uppercase tracking-wide text-background/70">
                  Pago confirmado
                </p>
                <h1 className="text-h2 text-background">
                  Tu pedido ya está en la barra
                </h1>
                <div className="orderIdentity flex items-center justify-center gap-6">
                  <div>
                    <span className="block text-small text-background/70">
                      Pedido
                    </span>
                    <strong className="block text-body font-extrabold text-background">
                      #{latestOrder.number}
                    </strong>
                  </div>
                  <div>
                    <span className="block text-small text-background/70">
                      Entrega
                    </span>
                    <strong className="block text-body font-extrabold text-background">
                      {latestOrder.displayName || latestOrder.alias}
                    </strong>
                  </div>
                </div>
                <strong className="confirmedAmount block text-h1 text-background">
                  {money(latestOrder.totalClp)}
                </strong>
                {(latestOrder.storedValueAppliedClp ?? 0) > 0 ? (
                  <p className="text-small text-background/70">
                    {money(latestOrder.storedValueAppliedClp ?? 0)} desde saldo
                    · {money(latestOrder.externalPaidClp ?? 0)} por tarjeta
                    simulada
                  </p>
                ) : null}
              </div>

              {data.engagement.sentInvitations.length > 0 ? (
                <section
                  className="space-y-3 rounded-surface-lg bg-foreground p-4"
                  role="status"
                >
                  <p className="text-label uppercase tracking-wide text-background/70">
                    Tus invitaciones
                  </p>
                  {data.engagement.sentInvitations.map((invitation) => (
                    <article
                      className="flex items-center justify-between gap-3 border-t border-background/20 pt-3 first:border-t-0 first:pt-0"
                      key={invitation.id}
                    >
                      <div className="space-y-1">
                        <strong className="block text-body font-bold text-background">
                          {invitation.productName} ·{" "}
                          {invitation.destinationTableName}
                        </strong>
                        <span className="block text-small text-background/70">
                          {invitation.state === "pending_claim"
                            ? "Pagado · aún no lo reclaman · nada se prepara todavía"
                            : invitation.state === "claimed"
                              ? "Reclamado · enviado a la barra"
                              : invitation.state === "refunded"
                                ? "Cancelado · dinero devuelto"
                                : "Venció · reembolso iniciado"}
                        </span>
                        {invitation.expiringSoon ? (
                          <b className="block text-small font-bold text-background">
                            Aún no lo reclaman y está por vencer.
                          </b>
                        ) : null}
                      </div>
                      {invitation.canCancel ? (
                        <Button
                          className="shrink-0 border-background/40 bg-transparent text-background hover:bg-background/10"
                          disabled={working}
                          onClick={() =>
                            void mutate({
                              action: "invitation.cancel",
                              invitationId: invitation.id,
                            })
                          }
                          size="small"
                          type="button"
                          variant="outline"
                        >
                          Cancelar y recuperar {money(invitation.amountClp)}
                        </Button>
                      ) : null}
                    </article>
                  ))}
                </section>
              ) : null}

              <section
                aria-live="polite"
                className="flex items-center justify-between gap-3 rounded-surface-lg border border-border bg-card p-4"
              >
                <div className="space-y-1">
                  <p className="text-label uppercase tracking-wide text-muted-foreground">
                    Boleta electrónica
                  </p>
                  <strong className="block text-body font-bold text-foreground">
                    {latestOrder.taxDocument.status === "issued"
                      ? `Emitida · folio ${latestOrder.taxDocument.folio}`
                      : latestOrder.taxDocument.status === "failed"
                        ? "Emisión pendiente"
                        : "Emitiendo…"}
                  </strong>
                  <span className="block text-small text-muted-foreground">
                    {latestOrder.taxDocument.message}
                  </span>
                </div>
                {latestOrder.taxDocument.representationUrl ? (
                  <a
                    className="shrink-0 text-small font-bold text-brand underline"
                    href={latestOrder.taxDocument.representationUrl}
                    rel="noreferrer"
                    target="_blank"
                  >
                    Ver / descargar
                  </a>
                ) : null}
              </section>

              <section className="space-y-6">
                <div
                  aria-label="Estado general"
                  className="flex items-center gap-2"
                >
                  <OrderStep done label="Pagado" />
                  <span className="h-px flex-1 bg-border" />
                  <OrderStep
                    active={latestOrder.state === "confirmed"}
                    done={latestOrder.state !== "confirmed"}
                    label="Preparando"
                  />
                  <span className="h-px flex-1 bg-border" />
                  <OrderStep done={latestOrder.state === "ready"} label="Listo" />
                </div>

                <div className="space-y-2">
                  <p className="text-label uppercase tracking-wide text-muted-foreground">
                    Cada estación por separado
                  </p>
                  {latestOrder.tickets.map((ticket) => (
                    <article
                      className="flex items-center justify-between gap-3 rounded-surface-md border border-border bg-card p-3"
                      key={ticket.id}
                    >
                      <div className="flex items-center gap-3">
                        <span className="flex size-8 shrink-0 items-center justify-center rounded-full bg-muted text-body font-extrabold text-foreground">
                          {ticket.stationName === "Barra" ? "B" : "C"}
                        </span>
                        <div>
                          <strong className="block text-body font-bold text-foreground">
                            {ticket.stationName}
                          </strong>
                          <small className="block text-small text-muted-foreground">
                            {ticket.itemNames.join(" · ")}
                          </small>
                        </div>
                      </div>
                      <TicketBadge status={ticket.status} />
                    </article>
                  ))}
                </div>
              </section>

              {data.loyalty.enrollmentAvailable ? (
                <section className="space-y-3 rounded-surface-lg bg-foreground p-4">
                  <p className="text-label uppercase tracking-wide text-background/70">
                    Una decisión aparte del pago
                  </p>
                  <h2 className="text-h3 text-background">
                    Guarda un sello por esta visita
                  </h2>
                  <p className="text-small text-background/70">
                    Ya pagaste. Si aceptas, este local recordará tus visitas y
                    podrás recuperar los sellos con teléfono o correo aunque
                    este navegador borre sus datos.
                  </p>
                  <Button
                    onClick={() => {
                      setLoyaltyPurpose("enroll");
                      setScreen("loyalty");
                    }}
                  >
                    Quiero mis sellos
                  </Button>
                  <small className="block text-small text-background/70">
                    No es necesario para pedir ni pagar. No se comparte entre
                    bares.
                  </small>
                </section>
              ) : data.loyalty.profile ? (
                <section className="rounded-surface-lg border border-border bg-card p-4">
                  <strong className="text-body font-bold text-foreground">
                    Sello registrado · {data.loyalty.profile.stamps} de{" "}
                    {data.loyalty.visitsRequired}
                  </strong>
                </section>
              ) : null}

              <Button
                className="w-full"
                onClick={() => {
                  setStoredValueClp("0");
                  setScreen("menu");
                }}
                type="button"
              >
                Pedir otra ronda
                <Icon name="arrow" />
              </Button>
            </>
          ) : (
            <div className="pendingPayment solidSurface flex flex-col items-center gap-3 rounded-surface-lg bg-foreground p-8 text-center">
              <Icon name="warning" size={34} />
              <h1 className="text-h2 text-background">
                Este pago no se confirmó
              </h1>
              <p className="text-body text-background/70">
                No enviamos nada a la barra. Vuelve a tu carrito para revisar.
              </p>
              <Button onClick={() => setScreen("cart")}>
                Volver al carrito
              </Button>
            </div>
          )}
        </section>
      )}

      {screen === "actions" && (
        <section className="space-y-6 px-4 py-6">
          <ScreenHeading
            eyebrow={data.venue.tableName}
            onBack={() => setScreen("menu")}
            title="¿Necesitas algo?"
          />
          <p className="text-body text-muted-foreground">
            Avisamos una vez al equipo y te mostramos cuándo lo hiciste.
          </p>
          <div className="grid grid-cols-2 gap-3">
            {data.actions.map((action) => {
              const elapsed = action.lastRequestedAt
                ? Date.parse(data.serverTime) -
                  Date.parse(action.lastRequestedAt)
                : Number.POSITIVE_INFINITY;
              const cooling = elapsed < action.cooldownSeconds * 1000;
              return (
                <button
                  className={cn(
                    "relative flex flex-col items-center gap-2 rounded-surface-lg border border-border bg-card p-4 text-center disabled:cursor-not-allowed",
                    cooling && "border-success bg-success-soft",
                  )}
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
                  <span className="flex size-12 items-center justify-center rounded-full bg-muted text-foreground">
                    <Icon name={action.icon} size={25} />
                  </span>
                  <strong className="text-body font-bold text-foreground">
                    {action.label}
                  </strong>
                  <small className="text-small text-muted-foreground">
                    {cooling ? "Avisado hace un momento" : action.description}
                  </small>
                  {cooling && (
                    <i className="absolute right-3 top-3 flex size-6 items-center justify-center rounded-full bg-success not-italic text-success-foreground">
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
        <section className="space-y-6 px-4 py-6">
          <ScreenHeading
            eyebrow="Programa de este local"
            onBack={() => setScreen("menu")}
            title="Mis sellos"
          />

          {data.storedValue.recoveryReference ? (
            <section className="solidSurface space-y-2 rounded-surface-lg bg-foreground p-4">
              <p className="text-label uppercase tracking-wide text-background/70">
                Saldo protegido
              </p>
              <h2 className="text-h3 text-background">
                {data.storedValue.recoveryReference}
              </h2>
              <p className="text-small text-background/70">
                Tu identidad fue eliminada, pero el saldo no desapareció.
                Guarda esta referencia y preséntala en caja para recuperarlo.
              </p>
            </section>
          ) : null}

          {data.loyalty.profile ? (
            <>
              <section className="solidSurface space-y-3 rounded-surface-lg bg-foreground p-6 text-center">
                <span className="mx-auto flex size-12 items-center justify-center rounded-full bg-brand text-primary-foreground">
                  <Icon name="spark" size={28} />
                </span>
                <p className="text-small text-background/70">
                  {data.loyalty.profile.maskedIdentity}
                </p>
                <h2 className="text-h2 text-background">
                  {data.loyalty.profile.stamps} / {data.loyalty.visitsRequired}{" "}
                  sellos
                </h2>
                <div className="flex flex-wrap justify-center gap-2">
                  {Array.from({ length: data.loyalty.visitsRequired }).map(
                    (_, index) => (
                      <i
                        className={cn(
                          "flex size-8 items-center justify-center rounded-full border border-background/30 text-small font-bold not-italic text-background/70",
                          index < data.loyalty.profile!.stamps &&
                            "border-brand bg-brand text-primary-foreground",
                        )}
                        key={index}
                      >
                        {index < data.loyalty.profile!.stamps ? "✓" : index + 1}
                      </i>
                    ),
                  )}
                </div>
                <p className="text-small text-background/70">
                  Continuidad: {data.loyalty.profile.contactMasked}. Si el
                  navegador pierde su token, recuperas aquí sin pedir ayuda al
                  bar.
                </p>
                {data.loyalty.profile.rewardAvailable ? (
                  <Button
                    className="disabled:bg-background/15 disabled:text-background/60 disabled:opacity-100"
                    disabled={working}
                    onClick={() =>
                      void mutate(
                        { action: "loyalty.reward.add" },
                        { nextScreen: "cart" },
                      )
                    }
                  >
                    Agregar {data.loyalty.profile.rewardProductName} · premio
                  </Button>
                ) : null}
              </section>
              <section className="solidSurface space-y-3 rounded-surface-lg bg-foreground p-4">
                <p className="text-label uppercase tracking-wide text-background/70">
                  Saldo de este local
                </p>
                {!data.storedValue.consented ? (
                  <>
                    <h2 className="text-h3 text-background">
                      Activa tu saldo recuperable
                    </h2>
                    <p className="text-small text-background/70">
                      Es independiente por bar. La recarga es una obligación
                      del local, no dinero de Tablio.
                    </p>
                    <Button
                      disabled={working}
                      onClick={() =>
                        void mutate({ action: "stored_value.consent" })
                      }
                    >
                      Aceptar y activar
                    </Button>
                  </>
                ) : (
                  <>
                    <h2 className="text-h1 text-background">
                      {money(data.storedValue.balanceClp)}
                    </h2>
                    <p className="text-small text-background/70">
                      {money(data.storedValue.loadedMoneyClp)} cargados ·{" "}
                      {money(data.storedValue.bonusClp)} de bono
                    </p>
                    <small className="block text-small text-background/70">
                      Máximo acumulado:{" "}
                      {money(data.storedValue.maxConsumerBalanceClp)}. Las
                      recargas reales siguen bloqueadas por revisión legal;
                      esta es una demo.
                    </small>
                    {data.storedValue.status === "wind_down" ? (
                      <div
                        className="rounded-surface-md border border-warning bg-warning-soft p-3 text-small text-foreground"
                        role="alert"
                      >
                        Nuevas recargas pausadas. Tu saldo no desaparece y
                        puede devolverse.
                      </div>
                    ) : (
                      <div className="space-y-3">
                        <label
                          className="block space-y-2 text-small font-bold text-background"
                          htmlFor="stored-value-topup"
                        >
                          Cargar dinero en demo
                          <Select
                            className="border-background/30 bg-background text-foreground"
                            id="stored-value-topup"
                            onChange={(event) =>
                              setTopUpClp(event.target.value)
                            }
                            value={topUpClp}
                          >
                            <option value="10000">$10.000</option>
                            <option value="20000">$20.000</option>
                            <option value="30000">$30.000</option>
                          </Select>
                        </label>
                        <Button
                          className="disabled:bg-background/15 disabled:text-background/60 disabled:opacity-100"
                          disabled={working}
                          onClick={() => void topUpStoredValue()}
                        >
                          Cargar en modo demo
                        </Button>
                        <small className="block text-small text-background/70">
                          Bono demo: {data.storedValue.bonusBps / 100}%.
                        </small>
                      </div>
                    )}
                    {data.storedValue.expiring.map((item) => (
                      <div
                        className="rounded-surface-md border border-warning bg-warning-soft p-3 text-small text-foreground"
                        key={item.expiresAt}
                        role="alert"
                      >
                        {money(item.amountClp)} de{" "}
                        {item.bucket === "bonus" ? "bono" : "dinero cargado"}{" "}
                        vence el{" "}
                        {new Date(item.expiresAt).toLocaleDateString("es-CL")}.
                      </div>
                    ))}
                    {data.storedValue.latestReceipt ? (
                      <p className="text-small text-background/70">
                        Comprobante:{" "}
                        {money(data.storedValue.latestReceipt.loadedMoneyClp)}{" "}
                        cargados +{" "}
                        {money(data.storedValue.latestReceipt.bonusClp)} de
                        bono.
                      </p>
                    ) : null}
                    {data.storedValue.history.length ? (
                      <div className="space-y-1 border-t border-background/20 pt-3">
                        <strong className="block text-small font-bold text-background">
                          Últimos movimientos
                        </strong>
                        {data.storedValue.history.slice(0, 5).map((entry) => (
                          <p
                            className="flex items-center justify-between text-small text-background/70"
                            key={entry.id}
                          >
                            <span>{entry.type.replaceAll("_", " ")}</span>
                            <b className="text-background">
                              {entry.amountClp > 0 ? "+" : ""}
                              {money(entry.amountClp)}
                            </b>
                          </p>
                        ))}
                      </div>
                    ) : null}
                  </>
                )}
              </section>
              <button
                className="w-full bg-transparent text-center text-small font-bold text-destructive underline"
                disabled={working}
                onClick={() => {
                  if (
                    window.confirm(
                      data.storedValue.balanceClp > 0
                        ? "Tu identidad se eliminará, pero el saldo quedará congelado con una referencia de recuperación: nunca desaparecerá."
                        : "¿Eliminar tu identidad y revocar la recuperación? El historial financiero quedará anónimo.",
                    )
                  ) {
                    void mutate({ action: "loyalty.revoke" });
                  }
                }}
                type="button"
              >
                Salir del programa y eliminar mis datos
              </button>
            </>
          ) : data.loyalty.challenge ? (
            <section className="space-y-4 rounded-surface-lg bg-foreground p-4">
              <p className="text-label uppercase tracking-wide text-background/70">
                Verifica que eres tú
              </p>
              <h2 className="text-h3 text-background">
                Código enviado a {data.loyalty.challenge.maskedDestination}
              </h2>
              <label
                className="block space-y-2 text-small font-bold text-background"
                htmlFor="loyalty-code"
              >
                Código de 6 dígitos
                <Input
                  className="border-background/30 bg-background text-center text-h3 tracking-[0.3em] text-foreground"
                  id="loyalty-code"
                  inputMode="numeric"
                  maxLength={6}
                  onChange={(event) =>
                    setLoyaltyCode(event.target.value.replaceAll(/\D/g, ""))
                  }
                  value={loyaltyCode}
                />
              </label>
              <p className="text-small text-background/70">
                En demo usa{" "}
                <strong className="text-background">
                  {data.loyalty.challenge.demoCode}
                </strong>
              </p>
              <Button
                className="disabled:bg-background/15 disabled:text-background/60 disabled:opacity-100"
                disabled={working || loyaltyCode.length !== 6}
                onClick={() => void verifyLoyaltyChallenge()}
              >
                Recuperar mis sellos
              </Button>
            </section>
          ) : (
            <section className="space-y-4 rounded-surface-lg bg-foreground p-4">
              <p className="text-label uppercase tracking-wide text-background/70">
                {loyaltyPurpose === "recover"
                  ? "Continuidad principal"
                  : "Después del primer pago"}
              </p>
              <h2 className="text-h3 text-background">
                {loyaltyPurpose === "recover"
                  ? "Recupera tus sellos"
                  : "Activa tus sellos"}
              </h2>
              <p className="text-small text-background/70">
                El token de este navegador puede perderse. Por eso teléfono o
                correo son la forma principal de volver a entrar.
              </p>
              <OptionRail>
                <RailButton
                  active={loyaltyChannel === "phone"}
                  onClick={() => setLoyaltyChannel("phone")}
                >
                  Teléfono
                </RailButton>
                <RailButton
                  active={loyaltyChannel === "email"}
                  onClick={() => setLoyaltyChannel("email")}
                >
                  Correo
                </RailButton>
              </OptionRail>
              <label
                className="block space-y-2 text-small font-bold text-background"
                htmlFor="loyalty-contact"
              >
                {loyaltyChannel === "phone" ? "Teléfono" : "Correo"}
                <Input
                  autoComplete={loyaltyChannel === "phone" ? "tel" : "email"}
                  className="border-background/30 bg-background text-foreground"
                  id="loyalty-contact"
                  onChange={(event) => setLoyaltyContact(event.target.value)}
                  placeholder={
                    loyaltyChannel === "phone"
                      ? "+56 9 1234 5678"
                      : "tu@correo.cl"
                  }
                  value={loyaltyContact}
                />
              </label>
              {loyaltyPurpose === "enroll" ? (
                <div className="space-y-2">
                  <label className="flex items-start gap-2 text-small text-background">
                    <input
                      checked={identityConsent}
                      className="mt-1 size-icon shrink-0"
                      onChange={(event) =>
                        setIdentityConsent(event.target.checked)
                      }
                      type="checkbox"
                    />
                    Acepto que este local recuerde mis visitas y preferencias.
                  </label>
                  <label className="flex items-start gap-2 text-small text-background">
                    <input
                      checked={contactConsent}
                      className="mt-1 size-icon shrink-0"
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
              <Button
                className="w-full disabled:bg-background/15 disabled:text-background/60 disabled:opacity-100"
                disabled={
                  working ||
                  !loyaltyContact.trim() ||
                  (loyaltyPurpose === "enroll" &&
                    (!identityConsent || !contactConsent))
                }
                onClick={() => void startLoyaltyChallenge()}
              >
                Enviar código
              </Button>
              {loyaltyPurpose === "recover" && latestOrder ? (
                <button
                  className="w-full bg-transparent text-center text-small font-bold text-background/70 underline"
                  onClick={() => setLoyaltyPurpose("enroll")}
                  type="button"
                >
                  Soy nuevo: activar programa
                </button>
              ) : null}
            </section>
          )}
        </section>
      )}

      {screen !== "entry" && (
        <nav
          aria-label="Navegación principal"
          className="fixed inset-x-0 bottom-0 z-20 mx-auto grid w-full max-w-[720px] grid-cols-4 border-t border-border bg-card"
        >
          <BottomNavButton
            active={screen === "menu"}
            icon="cutlery"
            label="Carta"
            onClick={() => setScreen("menu")}
          />
          <BottomNavButton
            active={screen === "status"}
            disabled={!latestOrder && data.payment?.status !== "pending"}
            icon="clock"
            label="Estado"
            onClick={() => setScreen("status")}
          />
          <BottomNavButton
            active={screen === "actions"}
            icon="hand"
            label="Ayuda"
            onClick={() => setScreen("actions")}
          />
          <BottomNavButton
            active={screen === "loyalty"}
            icon="spark"
            label="Sellos"
            onClick={() => setScreen("loyalty")}
          />
        </nav>
      )}

      {selectedProduct && (
        <div
          aria-labelledby="product-title"
          aria-modal="true"
          className="fixed inset-0 z-40 flex items-end bg-foreground/60"
          role="dialog"
        >
          <article className="relative max-h-[90dvh] w-full overflow-y-auto rounded-t-[24px] bg-card">
            <button
              aria-label="Cerrar detalle"
              className="absolute right-4 top-4 z-10 flex size-touch items-center justify-center rounded-full bg-card text-foreground shadow-[0_2px_8px_rgba(17,17,16,0.2)]"
              onClick={() => setSelectedProduct(undefined)}
              type="button"
            >
              <Icon name="close" />
            </button>
            <div className="relative h-[224px] w-full bg-muted">
              <Image
                alt={selectedProduct.imageAlt}
                fill
                sizes="100vw"
                src={selectedProduct.imageUrl}
              />
            </div>
            <div className="space-y-4 p-6">
              <p className="text-label uppercase tracking-wide text-muted-foreground">
                {
                  data.categories.find(
                    (item) => item.id === selectedProduct.categoryId,
                  )?.name
                }
              </p>
              <h2 className="text-h1" id="product-title">
                {selectedProduct.name}
              </h2>
              <p className="text-body text-muted-foreground">
                {selectedProduct.description}
              </p>
              {selectedProduct.allergens.length > 0 && (
                <div className="flex items-center gap-2 rounded-surface-md border border-warning bg-warning-soft p-3 text-small text-foreground">
                  <Icon name="warning" size={17} />
                  Contiene: {selectedProduct.allergens.join(", ")}
                </div>
              )}
              {selectedProduct.variants.length > 0 && (
                <fieldset className="space-y-2">
                  <legend className="text-small font-bold text-foreground">
                    Elige una opción
                  </legend>
                  {selectedProduct.variants.map((variant) => (
                    <label
                      className="flex items-center justify-between gap-2 rounded-surface-md border border-border bg-card p-3 text-body text-foreground"
                      key={variant.id}
                    >
                      <span className="flex items-center gap-2">
                        <input
                          checked={selectedVariant === variant.id}
                          className="size-icon shrink-0"
                          name="variant"
                          onChange={() => setSelectedVariant(variant.id)}
                          type="radio"
                        />
                        {variant.name}
                      </span>
                      <b className="font-bold">
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
              <label
                className="block space-y-2 text-small font-bold text-foreground"
                htmlFor="product-note"
              >
                Nota para la barra o cocina
                <Input
                  id="product-note"
                  maxLength={140}
                  onChange={(event) => setNote(event.target.value)}
                  placeholder="Ej: sin hielo"
                  value={note}
                />
              </label>
              {data.engagement.settings.invitationsEnabled ? (
                <fieldset className="space-y-2">
                  <legend className="text-small font-bold text-foreground">
                    ¿Para quién?
                  </legend>
                  <label className="flex items-center gap-2 text-body text-foreground">
                    <input
                      checked={invitationTargetTableId === ""}
                      className="size-icon shrink-0"
                      name="invite-target"
                      onChange={() => setInvitationTargetTableId("")}
                      type="radio"
                    />
                    Para mí, en {data.venue.tableName}
                  </label>
                  {data.engagement.invitationTargets.map((target) => (
                    <label
                      className="flex items-center gap-2 text-body text-foreground"
                      key={target.tableId}
                    >
                      <input
                        checked={invitationTargetTableId === target.tableId}
                        className="size-icon shrink-0"
                        name="invite-target"
                        onChange={() =>
                          setInvitationTargetTableId(target.tableId)
                        }
                        type="radio"
                      />
                      Invitar a {target.label}
                    </label>
                  ))}
                  <small className="block text-small text-muted-foreground">
                    Esperará hasta 60 minutos o hasta que cierre la mesa.
                    Puedes cancelarlo antes si aún no lo reclaman.
                  </small>
                </fieldset>
              ) : null}
              <div className="flex items-center justify-between gap-3 pt-2">
                <QuantityControl
                  label="producto"
                  onDecrement={() =>
                    setQuantity((current) => Math.max(1, current - 1))
                  }
                  onIncrement={() =>
                    setQuantity((current) => current + 1)
                  }
                  quantity={quantity}
                  quantityDisabled={quantity === 1}
                  working={false}
                />
                <Button
                  className="flex-1 justify-between"
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
                </Button>
              </div>
            </div>
          </article>
        </div>
      )}
    </main>
  );
}

function ScreenHeading({
  eyebrow,
  onBack,
  title,
}: {
  eyebrow: string;
  onBack: () => void;
  title: string;
}) {
  return (
    <div className="flex items-center gap-3">
      <button
        aria-label="Volver"
        className="flex size-touch shrink-0 items-center justify-center rounded-full border border-border bg-card text-foreground"
        onClick={onBack}
        type="button"
      >
        <Icon className="rotate-180" name="arrow" />
      </button>
      <div>
        <p className="text-label uppercase tracking-wide text-muted-foreground">
          {eyebrow}
        </p>
        <h1 className="text-h1 text-foreground">{title}</h1>
      </div>
    </div>
  );
}

function QuantityControl({
  label,
  onDecrement,
  onIncrement,
  quantity,
  quantityDisabled,
  working,
}: {
  label: string;
  onDecrement: () => void;
  onIncrement: () => void;
  quantity: number;
  quantityDisabled?: boolean;
  working: boolean;
}) {
  return (
    <div className="flex shrink-0 items-center gap-1 rounded-full border border-border bg-card p-1">
      <button
        aria-label={`Quitar una unidad de ${label}`}
        className="flex size-8 items-center justify-center rounded-full bg-transparent text-foreground disabled:opacity-40"
        disabled={working || quantityDisabled}
        onClick={onDecrement}
        type="button"
      >
        <Icon name="minus" size={16} />
      </button>
      <span className="w-6 text-center text-body font-bold text-foreground">
        {quantity}
      </span>
      <button
        aria-label={`Agregar una unidad de ${label}`}
        className="flex size-8 items-center justify-center rounded-full bg-transparent text-foreground disabled:opacity-40"
        disabled={working}
        onClick={onIncrement}
        type="button"
      >
        <Icon name="plus" size={16} />
      </button>
    </div>
  );
}

function OrderStep({
  active,
  done,
  label,
}: {
  active?: boolean;
  done?: boolean;
  label: string;
}) {
  return (
    <span className="flex flex-col items-center gap-1 text-center">
      <i
        className={cn(
          "flex size-8 items-center justify-center rounded-full border-2 border-border bg-card not-italic text-muted-foreground",
          done && "border-success bg-success text-success-foreground",
          active && !done && "border-brand bg-accent text-brand",
        )}
      >
        <Icon name={done ? "check" : "spark"} size={14} />
      </i>
      <small className="text-small font-bold text-foreground">{label}</small>
    </span>
  );
}

function BottomNavButton({
  active,
  disabled,
  icon,
  label,
  onClick,
}: {
  active: boolean;
  disabled?: boolean;
  icon: "cutlery" | "clock" | "hand" | "spark";
  label: string;
  onClick: () => void;
}) {
  return (
    <button
      className={cn(
        "flex min-h-touch flex-col items-center justify-center gap-1 bg-transparent py-2 text-small font-bold text-muted-foreground disabled:opacity-40",
        active && "text-brand",
      )}
      disabled={disabled}
      onClick={onClick}
      type="button"
    >
      <Icon name={icon} size={21} />
      {label}
    </button>
  );
}

const TICKET_BADGE_TONE: Record<
  TicketStatus,
  "neutral" | "warning" | "success"
> = {
  queued: "neutral",
  acknowledged: "neutral",
  in_preparation: "warning",
  ready: "success",
  completed: "success",
};

function TicketBadge({ status }: { status: TicketStatus }) {
  const labels: Record<TicketStatus, string> = {
    queued: "Recibido",
    acknowledged: "Visto",
    in_preparation: "Preparando",
    ready: "Listo",
    completed: "Entregado",
  };
  return <Badge variant={TICKET_BADGE_TONE[status]}>{labels[status]}</Badge>;
}
