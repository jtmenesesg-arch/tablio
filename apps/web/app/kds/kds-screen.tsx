"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type {
  KdsBootstrap,
  KdsMutation,
  KdsTicket,
  KdsTicketState,
} from "../../lib/kds-contract";

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

function agoLabel(milliseconds: number): string {
  const seconds = Math.max(0, Math.floor(milliseconds / 1000));
  if (seconds < 2) return "ahora";
  if (seconds < 60) return `hace ${seconds} s`;
  return `hace ${Math.floor(seconds / 60)} min`;
}

function timeLabel(iso: string): string {
  return new Intl.DateTimeFormat("es-CL", {
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).format(new Date(iso));
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
      className={`kdsTimer kdsTimer--${level}`}
      dateTime={ticket.confirmedAt}
      aria-label={`Tiempo transcurrido ${elapsedLabel(age)}`}
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
    <article className={`kdsTicket kdsTicket--${ticket.state}`}>
      <header className="kdsTicket__header">
        <div>
          <p className="kdsEyebrow">
            Pedido {ticket.orderNumber} · {ticket.tableName}
          </p>
          <h2>
            {ticket.displayName ? `${ticket.displayName} · ` : ""}
            {ticket.alias}
          </h2>
        </div>
        <Timer
          ticket={ticket}
          now={now}
          amberAfterSeconds={amberAfterSeconds}
          criticalAfterSeconds={criticalAfterSeconds}
        />
      </header>
      <div className="kdsTicket__meta">
        <span className="kdsPaidSeal">✓ Pagado</span>
        <span>{ticket.stationName}</span>
        <span>{timeLabel(ticket.confirmedAt)}</span>
        <span>{STATE_LABEL[ticket.state]}</span>
      </div>
      <ul className="kdsItems">
        {ticket.items.map((item) => (
          <li key={item.id}>
            <strong>{item.quantity}×</strong>
            <span>
              {item.name}
              {item.isLoyaltyReward ? (
                <i className="kdsRewardBadge">PREMIO · $0</i>
              ) : null}
              {item.note ? <em>Nota: {item.note}</em> : null}
            </span>
          </li>
        ))}
      </ul>
      <footer className="kdsTicket__actions">
        <button
          className="kdsSecondaryButton"
          onClick={() => onReprint(ticket.id)}
          disabled={working}
        >
          Reimprimir
        </button>
        {next ? (
          <button
            className="kdsPrimaryButton"
            onClick={() => onTransition(ticket, next)}
            disabled={working}
          >
            {ACTION_LABEL[ticket.state]}
          </button>
        ) : null}
      </footer>
    </article>
  );
}

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

  return (
    <main className="kdsShell">
      {stale ? (
        <section className="kdsOfflineWarning" role="alert">
          <strong>PANTALLA POSIBLEMENTE DESACTUALIZADA</strong>
          <span>
            No hay una sincronización exitosa reciente. Verifica Internet antes
            de asumir que no hay pedidos.
          </span>
          <button onClick={() => void refresh("reconnect")}>
            Intentar ahora
          </button>
        </section>
      ) : !realtimeConnected ? (
        <section className="kdsDegradedWarning" role="alert">
          Realtime desconectado · PostgreSQL sigue siendo consultado por
          respaldo
        </section>
      ) : null}

      <header className="kdsTopbar">
        <div className="kdsBrand">
          <span className="kdsBrandMark">T</span>
          <div>
            <strong>Tablio KDS</strong>
            <span>{data?.venue.name ?? "Conectando…"}</span>
          </div>
        </div>
        <nav className="kdsStationTabs" aria-label="Estación">
          {stationTabs.map((station) => (
            <button
              className={stationId === station.id ? "isActive" : ""}
              key={station.id}
              onClick={() => {
                setStationId(station.id);
                seenTicketIds.current.clear();
                visibleTicketIds.current.clear();
              }}
            >
              {station.name}
            </button>
          ))}
        </nav>
        <div
          className={`kdsConnection ${stale || !realtimeConnected ? "isBad" : "isGood"}`}
          aria-live="polite"
        >
          <span className="kdsConnectionDot" />
          <div>
            <strong>
              {stale
                ? "Sin sincronización"
                : realtimeConnected
                  ? "En línea"
                  : "Recuperando"}
            </strong>
            <span>Actualizado {lastSyncAt ? agoLabel(syncAge) : "nunca"}</span>
          </div>
        </div>
      </header>

      <section className="kdsSummary">
        <div>
          <strong>{pending ?? 0}</strong>
          <span>Pendientes</span>
        </div>
        <div className={late ? "isLate" : ""}>
          <strong>{late ?? 0}</strong>
          <span>Atrasadas</span>
        </div>
        <div className="kdsLatencyReadout">
          <strong>
            {data?.latency.p95Ms === undefined
              ? "Sin muestra"
              : `${data.latency.p95Ms} ms`}
          </strong>
          <span>
            p95 con KDS conectado · sin KDS:{" "}
            {data?.latency.noKdsConnectedCount ?? 0}
          </span>
        </div>
        <button
          className={`kdsSoundButton ${soundEnabled ? "isActive" : ""}`}
          onClick={() => {
            setSoundEnabled((current) => !current);
            beep("new");
          }}
        >
          {soundEnabled ? "Sonido activo" : "Activar sonido"}
        </button>
      </section>

      {error ? (
        <div className="kdsInlineError" role="alert">
          {error}
          <button onClick={() => setError(undefined)}>Cerrar</button>
        </div>
      ) : null}

      <section className="kdsBoard" aria-label="Comandas pendientes">
        {data?.tickets.length ? (
          data.tickets.map((ticket) => (
            <TicketCard
              key={ticket.id}
              ticket={ticket}
              now={now}
              amberAfterSeconds={data.settings.amberAfterSeconds}
              criticalAfterSeconds={data.settings.criticalAfterSeconds}
              working={workingTicket === ticket.id}
              onTransition={(selected, target) =>
                void transition(selected, target)
              }
              onReprint={(ticketId) => void reprint(ticketId)}
            />
          ))
        ) : (
          <div className="kdsEmpty">
            <strong>Sin comandas pendientes</strong>
            <span>
              La pantalla está sincronizada. Los pedidos pagados aparecerán
              aquí.
            </span>
          </div>
        )}
      </section>

      <aside className="kdsAvailability" aria-label="Control de agotados">
        <div>
          <p className="kdsEyebrow">Agotados · 86</p>
          <h2>Disponibilidad en carta</h2>
        </div>
        <div className="kdsProductToggles">
          {data?.products.map((product) => (
            <button
              className={product.available ? "isAvailable" : "isSoldOut"}
              key={product.id}
              onClick={() => void toggleProduct(product.id, !product.available)}
              aria-pressed={!product.available}
            >
              <span>{product.name}</span>
              <strong>{product.available ? "Disponible" : "Agotado"}</strong>
            </button>
          ))}
        </div>
      </aside>

      <footer className="kdsFooter">
        <span>Demo sin dinero real</span>
        <span>
          Realtime avisa · PostgreSQL manda · respaldo cada{" "}
          {data?.settings.reconciliationIntervalSeconds ?? 45} s
        </span>
      </footer>
    </main>
  );
}
