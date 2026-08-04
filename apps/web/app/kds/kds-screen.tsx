"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/cn";
import { formatRelativeTime, formatTime } from "@/lib/format";
import type {
  KdsBootstrap,
  KdsMutation,
  KdsTicket,
  KdsTicketState,
} from "@/lib/kds-contract";

type DeliverySource =
  "realtime" | "initial_query" | "reconnect" | "safety_poll";

const NEXT_STATE: Partial<Record<KdsTicketState, KdsTicketState>> = {
  queued: "acknowledged",
  acknowledged: "in_preparation",
  in_preparation: "ready",
  ready: "completed",
};

const ACTION_LABEL: Partial<Record<KdsTicketState, string>> = {
  queued: "Tomar comanda",
  acknowledged: "Empezar",
  in_preparation: "Marcar lista",
  ready: "Entregada",
};

const STATE_LABEL: Record<KdsTicketState, string> = {
  queued: "Nueva",
  acknowledged: "Tomada",
  in_preparation: "Preparando",
  ready: "Lista",
  completed: "Entregada",
};

function elapsedLabel(milliseconds: number): string {
  const seconds = Math.max(0, Math.floor(milliseconds / 1000));
  const minutes = Math.floor(seconds / 60);
  return `${String(minutes).padStart(2, "0")}:${String(seconds % 60).padStart(2, "0")}`;
}

async function readBootstrap(response: Response): Promise<KdsBootstrap> {
  const body = (await response.json()) as KdsBootstrap & { error?: string };
  if (!response.ok) throw new Error(body.error ?? "No pudimos sincronizar.");
  return body;
}

function beep(kind: "new" | "critical") {
  const AudioContextClass =
    window.AudioContext ??
    (
      window as typeof window & {
        webkitAudioContext?: typeof AudioContext;
      }
    ).webkitAudioContext;
  if (!AudioContextClass) return;
  const context = new AudioContextClass();
  const oscillator = context.createOscillator();
  const gain = context.createGain();
  oscillator.type = "sine";
  oscillator.frequency.value = kind === "critical" ? 880 : 660;
  gain.gain.setValueAtTime(0.0001, context.currentTime);
  gain.gain.exponentialRampToValueAtTime(0.12, context.currentTime + 0.02);
  gain.gain.exponentialRampToValueAtTime(0.0001, context.currentTime + 0.22);
  oscillator.connect(gain);
  gain.connect(context.destination);
  oscillator.start();
  oscillator.stop(context.currentTime + 0.24);
  oscillator.addEventListener("ended", () => void context.close());
}

const TIMER_TONE = {
  ontime: "bg-success text-success-foreground",
  late: "bg-warning text-foreground",
  critical: "bg-destructive text-destructive-foreground",
} as const;

function Timer({
  ticket,
  now,
  amberAfterSeconds,
  criticalAfterSeconds,
}: {
  ticket: KdsTicket;
  now: number;
  amberAfterSeconds: number;
  criticalAfterSeconds: number;
}) {
  const age = Math.max(0, now - Date.parse(ticket.confirmedAt));
  const level =
    age >= criticalAfterSeconds * 1000
      ? "critical"
      : age >= amberAfterSeconds * 1000
        ? "late"
        : "ontime";
  return (
    <time
      aria-label={`Tiempo transcurrido ${elapsedLabel(age)}`}
      className={cn(
        "min-w-[6.5rem] shrink-0 rounded-surface-md px-3 py-2 text-center text-[2.25rem] font-extrabold leading-none tabular-nums",
        TIMER_TONE[level],
      )}
      dateTime={ticket.confirmedAt}
    >
      {elapsedLabel(age)}
    </time>
  );
}

function TicketCard({
  ticket,
  now,
  amberAfterSeconds,
  criticalAfterSeconds,
  working,
  onTransition,
  onReprint,
}: {
  ticket: KdsTicket;
  now: number;
  amberAfterSeconds: number;
  criticalAfterSeconds: number;
  working: boolean;
  onTransition: (ticket: KdsTicket, target: KdsTicketState) => void;
  onReprint: (ticketId: string) => void;
}) {
  const next = NEXT_STATE[ticket.state];
  return (
    <article
      className={cn(
        "flex flex-col overflow-hidden rounded-surface-lg border-4 bg-background text-foreground",
        ticket.state === "ready" ? "border-success" : "border-border",
      )}
      data-testid="kds-ticket"
    >
      <header className="flex items-start justify-between gap-3 border-b-2 border-border bg-card px-4 pb-3 pt-4">
        <div>
          <p className="text-label uppercase tracking-wide text-muted-foreground">
            Pedido {ticket.orderNumber} · {ticket.tableName}
          </p>
          <h2 className="mt-1 text-[1.75rem] font-extrabold leading-tight">
            {ticket.displayName ? `${ticket.displayName} · ` : ""}
            {ticket.alias}
          </h2>
        </div>
        <Timer
          amberAfterSeconds={amberAfterSeconds}
          criticalAfterSeconds={criticalAfterSeconds}
          now={now}
          ticket={ticket}
        />
      </header>
      <div className="flex flex-wrap items-center gap-2 border-b border-border bg-muted px-4 py-2">
        <Badge variant="success">✓ Pagado</Badge>
        <Badge variant="neutral">{ticket.stationName}</Badge>
        <Badge variant="neutral">{formatTime(ticket.confirmedAt)}</Badge>
        <Badge variant="neutral">{STATE_LABEL[ticket.state]}</Badge>
      </div>
      <ul className="flex-1">
        {ticket.items.map((item) => (
          <li
            className="flex gap-3 border-b border-border px-4 py-3 text-[1.25rem] leading-snug last:border-b-0"
            key={item.id}
          >
            <strong className="text-brand">{item.quantity}×</strong>
            <span className="flex flex-col gap-1 font-bold">
              {item.name}
              {item.isLoyaltyReward ? (
                <em className="w-fit rounded-surface-sm border-l-4 border-warning bg-warning-soft px-2 py-1 text-small font-bold not-italic text-foreground">
                  PREMIO · $0
                </em>
              ) : null}
              {item.note ? (
                <em className="w-fit rounded-surface-sm border-l-4 border-warning bg-warning-soft px-2 py-1 text-small font-bold not-italic text-foreground">
                  Nota: {item.note}
                </em>
              ) : null}
            </span>
          </li>
        ))}
      </ul>
      <footer className="grid grid-cols-[0.8fr_1.4fr] gap-2 bg-card p-4">
        <button
          className="min-h-[4.5rem] rounded-button border-[3px] border-foreground bg-background text-body font-extrabold text-foreground transition-opacity duration-[var(--motion-feedback)] hover:opacity-80 disabled:opacity-45 motion-reduce:transition-none"
          disabled={working}
          onClick={() => onReprint(ticket.id)}
          type="button"
        >
          Reimprimir
        </button>
        {next ? (
          <button
            className={cn(
              "min-h-[4.5rem] rounded-button border-[3px] text-body font-extrabold transition-opacity duration-[var(--motion-feedback)] hover:opacity-90 disabled:opacity-45 motion-reduce:transition-none",
              ticket.state === "ready"
                ? "border-success bg-success text-success-foreground"
                : "border-primary-hover bg-brand text-foreground",
            )}
            disabled={working}
            onClick={() => onTransition(ticket, next)}
            type="button"
          >
            {ACTION_LABEL[ticket.state]}
          </button>
        ) : null}
      </footer>
    </article>
  );
}

const kdsButton =
  "min-h-[4rem] rounded-button border-2 border-[#3a3a37] bg-[#242422] px-6 text-body font-extrabold transition-colors duration-[var(--motion-feedback)] hover:bg-[#2f2f2c] motion-reduce:transition-none";
const kdsButtonIdleText = "text-[#fefefe]";

export function KdsScreen() {
  const [data, setData] = useState<KdsBootstrap>();
  const [stationId, setStationId] = useState("all");
  const [lastSyncAt, setLastSyncAt] = useState<number>();
  const [realtimeConnected, setRealtimeConnected] = useState(false);
  const [workingTicket, setWorkingTicket] = useState<string>();
  const [error, setError] = useState<string>();
  const [now, setNow] = useState(0);
  const [soundEnabled, setSoundEnabled] = useState(false);
  const [lastSource, setLastSource] = useState<DeliverySource>("initial_query");
  const seenTicketIds = useRef(new Set<string>());
  const visibleTicketIds = useRef(new Set<string>());
  const criticalSounded = useRef(new Set<string>());
  const clientId = useRef("");

  const refresh = useCallback(
    async (source: DeliverySource = "safety_poll") => {
      const next = await readBootstrap(
        await fetch(`/api/kds?station=${encodeURIComponent(stationId)}`, {
          cache: "no-store",
        }),
      );
      const previous = seenTicketIds.current;
      const newTickets = next.tickets.filter(
        (ticket) => !previous.has(ticket.id),
      );
      seenTicketIds.current = new Set(next.tickets.map((ticket) => ticket.id));
      if (
        soundEnabled &&
        source === "realtime" &&
        newTickets.length > 0 &&
        next.settings.newTicketSoundEnabled
      ) {
        beep("new");
      }
      setData(next);
      setLastSource(source);
      setLastSyncAt(Date.now());
      setError(undefined);
      return next;
    },
    [soundEnabled, stationId],
  );

  const send = useCallback(
    async (mutation: KdsMutation) =>
      readBootstrap(
        await fetch("/api/kds", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify(mutation),
        }),
      ),
    [],
  );

  useEffect(() => {
    clientId.current =
      localStorage.getItem("tablio:kds-client-id") ?? crypto.randomUUID();
    localStorage.setItem("tablio:kds-client-id", clientId.current);
    const initial = window.setTimeout(() => {
      setNow(Date.now());
      void refresh("initial_query").catch((caught) =>
        setError(caught instanceof Error ? caught.message : "Sin conexión."),
      );
    }, 0);
    return () => window.clearTimeout(initial);
  }, [refresh]);

  useEffect(() => {
    if (!clientId.current) return;
    const heartbeat = async () => {
      try {
        await send({
          action: "heartbeat",
          clientId: clientId.current,
          stationId,
        });
      } catch {
        setRealtimeConnected(false);
      }
    };
    void heartbeat();
    const interval = window.setInterval(() => void heartbeat(), 10_000);
    return () => {
      window.clearInterval(interval);
      void send({ action: "disconnect", clientId: clientId.current }).catch(
        () => undefined,
      );
    };
  }, [send, stationId]);

  useEffect(() => {
    const events = new EventSource("/api/kds/events");
    events.onopen = () => setRealtimeConnected(true);
    events.onerror = () => setRealtimeConnected(false);
    const onConnected = () => {
      setRealtimeConnected(true);
      void refresh("reconnect").catch(() => setRealtimeConnected(false));
    };
    const onTicket = () => {
      setRealtimeConnected(true);
      void refresh("realtime");
    };
    const onProduct = () => {
      setRealtimeConnected(true);
      void refresh("realtime");
    };
    const onHeartbeat = () => setRealtimeConnected(true);
    events.addEventListener("connected", onConnected);
    events.addEventListener("ticket", onTicket);
    events.addEventListener("product", onProduct);
    events.addEventListener("heartbeat", onHeartbeat);
    return () => {
      events.close();
      setRealtimeConnected(false);
    };
  }, [refresh]);

  const reconciliationIntervalSeconds =
    data?.settings.reconciliationIntervalSeconds;
  useEffect(() => {
    if (!reconciliationIntervalSeconds) return;
    const interval = window.setInterval(
      () => void refresh("safety_poll"),
      reconciliationIntervalSeconds * 1000,
    );
    return () => window.clearInterval(interval);
  }, [reconciliationIntervalSeconds, refresh]);

  useEffect(() => {
    const interval = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(interval);
  }, []);

  useEffect(() => {
    if (!data || !clientId.current) return;
    const unrecorded = data.tickets.filter(
      (ticket) => !visibleTicketIds.current.has(ticket.id),
    );
    if (unrecorded.length === 0) return;
    let cancelled = false;
    requestAnimationFrame(() =>
      requestAnimationFrame(() => {
        if (cancelled) return;
        for (const ticket of unrecorded) {
          visibleTicketIds.current.add(ticket.id);
          void send({
            action: "ticket.visible",
            ticketId: ticket.id,
            clientId: clientId.current,
            source: lastSource,
          }).catch(() => visibleTicketIds.current.delete(ticket.id));
        }
      }),
    );
    return () => {
      cancelled = true;
    };
  }, [data, lastSource, send]);

  useEffect(() => {
    if (!data || !soundEnabled || !data.settings.criticalSoundEnabled) return;
    const critical = data.tickets.filter(
      (ticket) =>
        now - Date.parse(ticket.confirmedAt) >=
          data.settings.criticalAfterSeconds * 1000 &&
        !criticalSounded.current.has(ticket.id),
    );
    if (critical.length > 0) {
      critical.forEach((ticket) => criticalSounded.current.add(ticket.id));
      beep("critical");
    }
  }, [data, now, soundEnabled]);

  const syncAge = lastSyncAt ? now - lastSyncAt : Number.POSITIVE_INFINITY;
  const stale = !data || syncAge > data.settings.warningAfterSeconds * 1000;
  const pending = data?.tickets.filter(
    (ticket) => ticket.state !== "ready",
  ).length;
  const late = data?.tickets.filter(
    (ticket) =>
      now - Date.parse(ticket.confirmedAt) >=
      data.settings.amberAfterSeconds * 1000,
  ).length;

  const stationTabs = useMemo(
    () => [{ id: "all", name: "Todas" }, ...(data?.stations ?? [])],
    [data?.stations],
  );

  async function transition(ticket: KdsTicket, target: KdsTicketState) {
    setWorkingTicket(ticket.id);
    try {
      const next = await send({
        action: "ticket.transition",
        ticketId: ticket.id,
        expectedState: ticket.state,
        expectedVersion: ticket.version,
        targetState: target,
      });
      setData(next);
      await refresh("realtime");
    } catch (caught) {
      setError(
        caught instanceof Error ? caught.message : "No pudimos actualizar.",
      );
      await refresh("reconnect").catch(() => undefined);
    } finally {
      setWorkingTicket(undefined);
    }
  }

  async function toggleProduct(productId: string, available: boolean) {
    try {
      await send({
        action: "product.availability",
        productId,
        available,
        reason: available
          ? "Reposición desde pantalla KDS"
          : "Agotado informado desde pantalla KDS",
      });
      await refresh("realtime");
    } catch (caught) {
      setError(
        caught instanceof Error ? caught.message : "No pudimos cambiarlo.",
      );
    }
  }

  async function reprint(ticketId: string) {
    const source = data?.printJobs.find(
      (job) => job.ticketId === ticketId && !job.reprintOfJobId,
    );
    if (!source) {
      setError("El spool todavía no tiene un trabajo para esta comanda.");
      return;
    }
    try {
      await send({
        action: "print.reprint",
        printJobId: source.id,
        reason: "Reimpresión solicitada desde KDS",
      });
      await refresh("realtime");
    } catch (caught) {
      setError(
        caught instanceof Error ? caught.message : "No pudimos reimprimir.",
      );
    }
  }

  const connectionBad = stale || !realtimeConnected;

  return (
    <main
      className="flex min-h-dvh flex-col bg-[#090909] font-sans text-[#fefefe]"
      data-kds-ready
    >
      {stale ? (
        <section
          className="sticky top-0 z-30 flex flex-wrap items-center gap-6 border-b-4 border-[#fefefe] bg-destructive px-6 py-4 text-destructive-foreground"
          role="alert"
        >
          <strong className="text-h2">PANTALLA POSIBLEMENTE DESACTUALIZADA</strong>
          <span className="text-body font-bold">
            No hay una sincronización exitosa reciente. Verifica Internet antes
            de asumir que no hay pedidos.
          </span>
          <button
            className="ml-auto min-h-[3.75rem] rounded-button border-2 border-[#fefefe] bg-[#fefefe] px-6 text-body font-extrabold text-[#111110]"
            onClick={() => void refresh("reconnect")}
            type="button"
          >
            Intentar ahora
          </button>
        </section>
      ) : !realtimeConnected ? (
        <section
          className="border-b-[3px] border-[#f5c85c] bg-warning px-6 py-3 text-center text-body font-extrabold text-foreground"
          role="alert"
        >
          Realtime desconectado · PostgreSQL sigue siendo consultado por
          respaldo
        </section>
      ) : null}

      <header className="sticky top-0 z-20 flex flex-wrap items-center gap-6 border-b-[3px] border-[#2b2b29] bg-[#111110] px-6 py-4">
        <div className="flex items-center gap-3">
          <span className="grid size-[3.25rem] shrink-0 place-items-center rounded-surface-md bg-brand text-[1.75rem] font-extrabold text-foreground">
            T
          </span>
          <div className="grid gap-1">
            <strong className="text-h3 leading-none">Tablio KDS</strong>
            <span className="text-small text-[#c9c9c5]">
              {data?.venue.name ?? "Conectando…"}
            </span>
            <span className="w-fit rounded-surface-sm bg-warning px-2 py-1 text-[0.58rem] font-black uppercase tracking-wide text-foreground">
              Demo · sin dinero real
            </span>
          </div>
        </div>

        <nav aria-label="Estación" className="flex flex-1 flex-wrap gap-2">
          {stationTabs.map((station) => (
            <button
              className={cn(
                kdsButton,
                stationId === station.id
                  ? "border-[#fefefe] bg-[#fefefe] text-[#111110] hover:bg-[#fefefe]"
                  : kdsButtonIdleText,
              )}
              key={station.id}
              onClick={() => {
                setStationId(station.id);
                seenTicketIds.current.clear();
                visibleTicketIds.current.clear();
              }}
              type="button"
            >
              {station.name}
            </button>
          ))}
        </nav>

        <div
          aria-live="polite"
          className={cn(
            "flex min-w-[15rem] items-center gap-3 rounded-surface-md border-2 px-4 py-3",
            connectionBad
              ? "border-destructive bg-[#2a0c08]"
              : "border-[#323230] bg-[#181817]",
          )}
        >
          <span
            className={cn(
              "size-[1.1rem] shrink-0 rounded-full",
              connectionBad
                ? "bg-[#fefefe] shadow-[0_0_0_5px_var(--tw-shadow-color)] shadow-destructive"
                : "bg-success shadow-[0_0_0_5px_var(--tw-shadow-color)] shadow-success",
            )}
          />
          <div className="grid gap-1">
            <strong className="text-body leading-none">
              {stale
                ? "Sin sincronización"
                : realtimeConnected
                  ? "En línea"
                  : "Recuperando"}
            </strong>
            <span className="text-small text-[#c9c9c5]">
              Actualizado{" "}
              {lastSyncAt
                ? formatRelativeTime(new Date(lastSyncAt), new Date(now))
                : "nunca"}
            </span>
          </div>
        </div>
      </header>

      <section
        aria-label="Métricas del turno"
        className="flex flex-wrap gap-3 border-b border-[#2f2f2c] bg-[#111110] px-6 py-4"
      >
        <div className="flex min-h-[3.75rem] min-w-[9rem] items-baseline gap-2 rounded-surface-md border-2 border-[#333330] bg-[#1d1d1b] px-4 py-2">
          <strong className="text-[1.9rem] font-extrabold leading-none">
            {pending ?? 0}
          </strong>
          <span className="text-small font-bold text-[#d8d8d3]">
            Pendientes
          </span>
        </div>
        <div
          className={cn(
            "flex min-h-[3.75rem] min-w-[9rem] items-baseline gap-2 rounded-surface-md border-2 px-4 py-2",
            late
              ? "border-warning bg-[#3e2602]"
              : "border-[#333330] bg-[#1d1d1b]",
          )}
        >
          <strong className="text-[1.9rem] font-extrabold leading-none">
            {late ?? 0}
          </strong>
          <span className="text-small font-bold text-[#d8d8d3]">
            Atrasadas
          </span>
        </div>
        <div className="flex min-h-[3.75rem] min-w-[16rem] flex-1 items-baseline justify-between gap-2 rounded-surface-md border-2 border-[#333330] bg-[#1d1d1b] px-4 py-2">
          <strong className="text-[1.4rem] font-extrabold leading-none">
            {data?.latency.p95Ms === undefined
              ? "Sin muestra"
              : `${data.latency.p95Ms} ms`}
          </strong>
          <span className="text-small font-bold text-[#d8d8d3]">
            p95 con KDS conectado · sin KDS: {data?.latency.noKdsConnectedCount ?? 0}
          </span>
        </div>
        <button
          className={cn(
            kdsButton,
            kdsButtonIdleText,
            "min-w-[11rem]",
            soundEnabled && "border-success bg-[#173e2e]",
          )}
          onClick={() => {
            setSoundEnabled((current) => !current);
            beep("new");
          }}
          type="button"
        >
          {soundEnabled ? "Sonido activo" : "Activar sonido"}
        </button>
      </section>

      {error ? (
        <div
          className="mx-6 mt-4 flex items-center justify-between gap-6 rounded-surface-md border-2 border-destructive bg-[#3a100a] px-4 py-3 font-extrabold"
          role="alert"
        >
          {error}
          <button
            className="min-h-[3rem] rounded-button border-2 border-[#3a3a37] bg-[#242422] px-4 text-small font-extrabold"
            onClick={() => setError(undefined)}
            type="button"
          >
            Cerrar
          </button>
        </div>
      ) : null}

      <section
        aria-label="Comandas pendientes"
        className="grid flex-1 grid-cols-[repeat(auto-fill,minmax(22rem,1fr))] items-start gap-4 px-6 py-6"
      >
        {data?.tickets.length ? (
          data.tickets.map((ticket) => (
            <TicketCard
              amberAfterSeconds={data.settings.amberAfterSeconds}
              criticalAfterSeconds={data.settings.criticalAfterSeconds}
              key={ticket.id}
              now={now}
              onReprint={(ticketId) => void reprint(ticketId)}
              onTransition={(selected, target) =>
                void transition(selected, target)
              }
              ticket={ticket}
              working={workingTicket === ticket.id}
            />
          ))
        ) : (
          <div className="col-span-full grid min-h-[18rem] place-content-center gap-2 rounded-surface-lg border-[3px] border-dashed border-[#3a3a37] bg-[#111110] text-center">
            <strong className="text-h1">Sin comandas pendientes</strong>
            <span className="text-body text-[#bcbcb7]">
              La pantalla está sincronizada. Los pedidos pagados aparecerán
              aquí.
            </span>
          </div>
        )}
      </section>

      <aside
        aria-label="Control de agotados"
        className="grid gap-4 border-y-[3px] border-[#2d2d2b] bg-[#151514] px-6 py-6 md:grid-cols-[14rem_1fr]"
      >
        <div>
          <p className="text-label uppercase tracking-wide text-[#c9c9c5]">
            Agotados · 86
          </p>
          <h2 className="mt-1 text-h2">Disponibilidad en carta</h2>
        </div>
        <div className="grid grid-cols-[repeat(auto-fit,minmax(12rem,1fr))] gap-3">
          {data?.products.map((product) => (
            <button
              aria-pressed={!product.available}
              className={cn(
                "grid min-h-[4rem] gap-1 rounded-button border-2 px-4 py-3 text-left transition-colors duration-[var(--motion-feedback)] motion-reduce:transition-none",
                product.available
                  ? "border-success bg-[#173e2e] text-[#fefefe]"
                  : "border-destructive bg-[#3a100a] text-[#fefefe]",
              )}
              key={product.id}
              onClick={() => void toggleProduct(product.id, !product.available)}
              type="button"
            >
              <span className="truncate text-small font-bold">
                {product.name}
              </span>
              <strong className="text-body">
                {product.available ? "Disponible" : "Agotado"}
              </strong>
            </button>
          ))}
        </div>
      </aside>

      <footer className="flex flex-wrap justify-between gap-6 bg-[#090909] px-6 py-4 text-small font-bold text-[#a7a7a2]">
        <span>Demo sin dinero real</span>
        <span>
          Realtime avisa · PostgreSQL manda · respaldo cada{" "}
          {data?.settings.reconciliationIntervalSeconds ?? 45} s
        </span>
      </footer>
    </main>
  );
}
