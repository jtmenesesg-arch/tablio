"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Alert } from "@/components/ui/alert";
import { cn } from "@/lib/cn";
import { formatRelativeTime, formatTime } from "@/lib/format";
import { createClient } from "@/lib/supabase/client";

// OI-034 / OI-038: KDS real — reemplaza la vista mínima provisional. El
// backend (transition_ticket con concurrencia optimista, Realtime en
// tickets, RLS de lectura) ya existía completo desde Sprint 4, nunca
// conectado a ninguna pantalla. Esta pantalla llama a las RPC reales, nunca
// al store demo.
//
// Deliberadamente fuera de esta pasada, con las RPC reales ya construidas
// y listas para conectar después sin trabajo de base de datos nuevo:
// reimpresión (request_ticket_reprint), panel de agotados desde acá
// (set_product_availability — ya se puede hacer real desde Configuración),
// presencia por estación (kds_heartbeat/kds_disconnect) y medición de
// latencia de entrega (record_kds_visible). Esta pantalla se sincroniza
// sola con cada cambio real en tickets, así que sigue siendo útil sin esas
// piezas.

type TicketState =
  "queued" | "acknowledged" | "in_preparation" | "ready" | "completed";

type RealTicketItem = {
  productName: string;
  variantName: string | null;
  quantity: number;
  note: string | null;
  isLoyaltyReward: boolean;
};

type RealTicket = {
  id: string;
  orderId: string;
  orderNumber: number;
  tableName: string;
  alias: string;
  displayName: string | null;
  stationId: string;
  stationName: string;
  state: TicketState;
  version: number;
  confirmedAt: string;
  acknowledgedAt: string | null;
  inPreparationAt: string | null;
  readyAt: string | null;
  items: RealTicketItem[];
};

type RealStation = { id: string; name: string };

type RealSettings = {
  warningAfterSeconds: number;
  reconciliationIntervalSeconds: number;
  amberAfterSeconds: number;
  criticalAfterSeconds: number;
};

type KdsRealBootstrap = {
  tickets: RealTicket[];
  stations: RealStation[];
  settings: RealSettings;
};

const NEXT_STATE: Partial<Record<TicketState, TicketState>> = {
  queued: "acknowledged",
  acknowledged: "in_preparation",
  in_preparation: "ready",
  ready: "completed",
};

const ACTION_LABEL: Partial<Record<TicketState, string>> = {
  queued: "Tomar comanda",
  acknowledged: "Empezar",
  in_preparation: "Marcar lista",
  ready: "Entregada",
};

const STATE_LABEL: Record<TicketState, string> = {
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

const TIMER_TONE = {
  ontime: "bg-success text-success-foreground",
  late: "bg-warning text-foreground",
  critical: "bg-destructive text-destructive-foreground",
} as const;

function Timer({
  confirmedAt,
  now,
  amberAfterSeconds,
  criticalAfterSeconds,
}: {
  confirmedAt: string;
  now: number;
  amberAfterSeconds: number;
  criticalAfterSeconds: number;
}) {
  const age = Math.max(0, now - Date.parse(confirmedAt));
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
      dateTime={confirmedAt}
    >
      {elapsedLabel(age)}
    </time>
  );
}

function TicketCard({
  ticket,
  now,
  settings,
  working,
  onTransition,
}: {
  ticket: RealTicket;
  now: number;
  settings: RealSettings;
  working: boolean;
  onTransition: (ticket: RealTicket, target: TicketState) => void;
}) {
  const next = NEXT_STATE[ticket.state];
  return (
    <article
      className={cn(
        "flex flex-col overflow-hidden rounded-surface-lg border-4 bg-background text-foreground",
        ticket.state === "ready" ? "border-success" : "border-border",
      )}
      data-testid="kds-real-ticket"
    >
      <header className="flex items-start justify-between gap-3 border-b-2 border-border bg-card px-4 pb-3 pt-4">
        <div>
          <p className="text-label uppercase tracking-wide text-muted-foreground">
            Pedido #{ticket.orderNumber} · {ticket.tableName}
          </p>
          <h2 className="mt-1 text-[1.75rem] font-extrabold leading-tight">
            {ticket.displayName ? `${ticket.displayName} · ` : ""}
            {ticket.alias}
          </h2>
        </div>
        <Timer
          amberAfterSeconds={settings.amberAfterSeconds}
          confirmedAt={ticket.confirmedAt}
          criticalAfterSeconds={settings.criticalAfterSeconds}
          now={now}
        />
      </header>
      <div className="flex flex-wrap items-center gap-2 border-b border-border bg-muted px-4 py-2">
        <Badge variant="success">✓ Pagado</Badge>
        <Badge variant="neutral">{ticket.stationName}</Badge>
        <Badge variant="neutral">{formatTime(ticket.confirmedAt)}</Badge>
        <Badge variant="neutral">{STATE_LABEL[ticket.state]}</Badge>
      </div>
      <ul className="flex-1">
        {ticket.items.map((item, index) => (
          <li
            className="flex gap-3 border-b border-border px-4 py-3 text-[1.25rem] leading-snug last:border-b-0"
            key={`${ticket.id}-${index}`}
          >
            <strong className="text-brand">{item.quantity}×</strong>
            <span className="flex flex-col gap-1 font-bold">
              {item.productName}
              {item.variantName ? (
                <span className="text-small font-normal text-muted-foreground">
                  {item.variantName}
                </span>
              ) : null}
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
      <footer className="bg-card p-4">
        {next ? (
          <button
            className={cn(
              "min-h-[4.5rem] w-full rounded-button border-[3px] text-body font-extrabold transition-opacity duration-[var(--motion-feedback)] hover:opacity-90 disabled:opacity-45 motion-reduce:transition-none",
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

export function KdsRealScreen() {
  const supabase = useMemo(() => createClient(), []);
  const [data, setData] = useState<KdsRealBootstrap>();
  const [error, setError] = useState<string>();
  const [station, setStation] = useState<string>("all");
  const [now, setNow] = useState(() => Date.now());
  const [lastSyncAt, setLastSyncAt] = useState<number>();
  const [workingTicketId, setWorkingTicketId] = useState<string>();

  const refresh = useCallback(async () => {
    const { data: bootstrap, error: rpcError } = await supabase.rpc(
      "kds_bootstrap",
      {},
    );
    if (rpcError) {
      setError(rpcError.message);
      return;
    }
    setData(bootstrap as KdsRealBootstrap);
    setLastSyncAt(Date.now());
    setError(undefined);
  }, [supabase]);

  useEffect(() => {
    const initialLoad = window.setTimeout(() => void refresh(), 0);
    return () => window.clearTimeout(initialLoad);
  }, [refresh]);

  // Realtime: tickets ya está en la publicación supabase_realtime desde
  // Sprint 4. Cualquier cambio dispara un refetch completo — mismo patrón
  // ya probado en el store demo (la señal importa, no el payload parcial).
  useEffect(() => {
    const channel = supabase
      .channel("kds-real-tickets")
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "tickets" },
        () => void refresh(),
      )
      .subscribe();
    return () => void supabase.removeChannel(channel);
  }, [supabase, refresh]);

  useEffect(() => {
    const interval = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(interval);
  }, []);

  // Respaldo: si el realtime se cae en silencio, igual sincroniza cada 45s
  // (el mismo intervalo que ya definía tenant_kds_settings).
  useEffect(() => {
    if (!data) return;
    const interval = window.setInterval(
      () => void refresh(),
      data.settings.reconciliationIntervalSeconds * 1000,
    );
    return () => window.clearInterval(interval);
  }, [data, refresh]);

  async function transition(ticket: RealTicket, target: TicketState) {
    setWorkingTicketId(ticket.id);
    const { error: rpcError } = await supabase.rpc("transition_ticket", {
      p_ticket_id: ticket.id,
      p_expected_state: ticket.state,
      p_expected_version: ticket.version,
      p_target_state: target,
    });
    setWorkingTicketId(undefined);
    if (rpcError) {
      // 40001 = alguien más ya movió este ticket (concurrencia optimista) —
      // no es un error del usuario, sólo hay que traer el estado real.
      if (rpcError.code !== "40001") setError(rpcError.message);
    }
    void refresh();
  }

  if (error) {
    return <Alert tone="danger">No pudimos sincronizar: {error}</Alert>;
  }
  if (!data) {
    return <p className="text-body text-muted-foreground">Cargando comandas…</p>;
  }

  const visibleTickets =
    station === "all"
      ? data.tickets
      : data.tickets.filter((ticket) => ticket.stationId === station);

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="space-y-1">
          <h1 className="text-h1 tracking-tight text-foreground lg:text-h1-lg">
            Comandas
          </h1>
          <p className="text-small text-muted-foreground">
            {lastSyncAt
              ? `Última sincronización: ${formatRelativeTime(new Date(lastSyncAt).toISOString())}`
              : "Sincronizando…"}
          </p>
        </div>
        <nav aria-label="Estación" className="flex flex-wrap gap-2">
          <button
            className={cn(
              "min-h-[3rem] rounded-button border-2 px-4 text-small font-bold",
              station === "all"
                ? "border-brand bg-brand text-foreground"
                : "border-border bg-card text-foreground",
            )}
            onClick={() => setStation("all")}
            type="button"
          >
            Todas
          </button>
          {data.stations.map((item) => (
            <button
              className={cn(
                "min-h-[3rem] rounded-button border-2 px-4 text-small font-bold",
                station === item.id
                  ? "border-brand bg-brand text-foreground"
                  : "border-border bg-card text-foreground",
              )}
              key={item.id}
              onClick={() => setStation(item.id)}
              type="button"
            >
              {item.name}
            </button>
          ))}
        </nav>
      </div>

      {visibleTickets.length === 0 ? (
        <Alert tone="info">No hay comandas activas.</Alert>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {visibleTickets.map((ticket) => (
            <TicketCard
              key={ticket.id}
              now={now}
              onTransition={transition}
              settings={data.settings}
              ticket={ticket}
              working={workingTicketId === ticket.id}
            />
          ))}
        </div>
      )}
    </div>
  );
}
