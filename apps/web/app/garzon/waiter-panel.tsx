"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/cn";
import { formatClp, formatRelativeTime } from "@/lib/format";
import type {
  PendingTaskSummary,
  WaiterBootstrap,
  WaiterMutation,
  WaiterTable,
  WaiterTask,
} from "@/lib/waiter-contract";

type Tab = "tasks" | "tables" | "shift";

function pendingText(pending: PendingTaskSummary) {
  const parts = [
    pending.deliveryReady
      ? `${pending.deliveryReady} entrega${pending.deliveryReady === 1 ? "" : "s"} lista${pending.deliveryReady === 1 ? "" : "s"}`
      : "",
    pending.serviceRequest
      ? `${pending.serviceRequest} llamado${pending.serviceRequest === 1 ? "" : "s"}`
      : "",
    pending.waiterPaymentRequest
      ? `${pending.waiterPaymentRequest} pago${pending.waiterPaymentRequest === 1 ? "" : "s"} con garzón`
      : "",
  ].filter(Boolean);
  return parts.length ? parts.join(", ") : "sin tareas pendientes";
}

const darkButton =
  "min-h-[4.5rem] rounded-button border-2 border-[#3a3a37] bg-[#242422] px-5 text-body font-extrabold transition-colors duration-[var(--motion-feedback)] hover:bg-[#2f2f2c] motion-reduce:transition-none disabled:opacity-45";
const darkButtonText = "text-[#fefefe]";
const darkPrimaryButton =
  "min-h-[4.5rem] rounded-button border-2 border-primary-hover bg-brand px-5 text-body font-extrabold text-foreground transition-opacity duration-[var(--motion-feedback)] hover:opacity-90 disabled:opacity-45 motion-reduce:transition-none";
const darkDangerButton =
  "min-h-[4.5rem] rounded-button border-2 border-[#8f1d0c] bg-destructive px-5 text-body font-extrabold text-destructive-foreground transition-opacity duration-[var(--motion-feedback)] hover:opacity-90 disabled:opacity-45 motion-reduce:transition-none";
const lightOutlineButton =
  "min-h-[4.5rem] rounded-button border border-border bg-card px-5 text-body font-bold text-card-foreground transition-colors duration-[var(--motion-feedback)] hover:bg-muted disabled:opacity-45 motion-reduce:transition-none";

function ConnectionBadge({
  now,
  lastSync,
  online,
  stale,
}: {
  now: number;
  lastSync?: number;
  online: boolean;
  stale?: boolean;
}) {
  return (
    <div
      aria-live="polite"
      className={cn(
        "flex items-center gap-3 rounded-surface-md border-2 px-4 py-2",
        stale
          ? "border-destructive bg-[#2a0c08]"
          : "border-[#323230] bg-[#181817]",
      )}
    >
      <span
        className={cn(
          "size-[1.1rem] shrink-0 rounded-full",
          stale
            ? "bg-[#fefefe] shadow-[0_0_0_5px_var(--tw-shadow-color)] shadow-destructive"
            : "bg-success shadow-[0_0_0_5px_var(--tw-shadow-color)] shadow-success",
        )}
      />
      <div className="grid gap-0.5">
        <strong className="text-small leading-none text-[#fefefe]">
          {stale ? "PUEDE ESTAR DESACTUALIZADO" : online ? "En línea" : "Reconectando"}
        </strong>
        <span className="text-label text-[#c9c9c5]">
          Actualizado{" "}
          {lastSync
            ? formatRelativeTime(new Date(lastSync), new Date(now))
            : "nunca"}
        </span>
      </div>
    </div>
  );
}

function ReasonDialog({
  open,
  onOpenChange,
  title,
  description,
  confirmLabel,
  danger,
  working,
  onConfirm,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  description: string;
  confirmLabel: string;
  danger?: boolean;
  working: boolean;
  onConfirm: (reason: string) => void;
}) {
  return (
    <Dialog onOpenChange={onOpenChange} open={open}>
      <DialogContent>
        <form
          className="space-y-6"
          onSubmit={(event) => {
            event.preventDefault();
            const reason = String(
              new FormData(event.currentTarget).get("reason") ?? "",
            ).trim();
            if (reason) onConfirm(reason);
          }}
        >
          <DialogHeader>
            <DialogTitle>{title}</DialogTitle>
            <DialogDescription>{description}</DialogDescription>
          </DialogHeader>
          <Textarea
            autoFocus
            minLength={3}
            name="reason"
            placeholder="Motivo"
            required
          />
          <button
            className={cn(
              "w-full",
              danger ? darkDangerButton : darkPrimaryButton,
            )}
            disabled={working}
            type="submit"
          >
            {working ? "Guardando…" : confirmLabel}
          </button>
        </form>
      </DialogContent>
    </Dialog>
  );
}

export function WaiterPanel() {
  const [data, setData] = useState<WaiterBootstrap>();
  const [pin, setPin] = useState("");
  const [tab, setTab] = useState<Tab>("tasks");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [selectedZones, setSelectedZones] = useState<string[]>([]);
  const [lastSync, setLastSync] = useState<number>();
  const [online, setOnline] = useState(false);
  const [now, setNow] = useState(0);
  const [closing, setClosing] = useState(false);
  const [selectedTable, setSelectedTable] = useState<WaiterTable>();
  const [groupSelection, setGroupSelection] = useState<string[]>([]);
  const [transferZoneId, setTransferZoneId] = useState("");
  const [transferWaiterId, setTransferWaiterId] = useState("");
  const [zoneTransferReason, setZoneTransferReason] = useState(false);

  const refresh = useCallback(async () => {
    try {
      const response = await fetch("/api/waiter", { cache: "no-store" });
      const body = (await response.json()) as WaiterBootstrap & {
        error?: string;
      };
      if (!response.ok) throw new Error(body.error);
      setData(body);
      setSelectedZones(
        body.zones.filter((zone) => zone.selected).map((zone) => zone.id),
      );
      setLastSync(Date.parse(body.serverTime));
      setNow(Date.parse(body.serverTime));
      setOnline(true);
      setError("");
    } catch (caught) {
      setOnline(false);
      setError(caught instanceof Error ? caught.message : "Sin conexión.");
    }
  }, []);

  useEffect(() => {
    const initialRefresh = window.setTimeout(() => void refresh(), 0);
    const timer = window.setInterval(() => {
      setNow((current) => current + 1000);
    }, 1000);
    return () => {
      window.clearTimeout(initialRefresh);
      window.clearInterval(timer);
    };
  }, [refresh]);

  useEffect(() => {
    if (!data?.authenticated) return;
    const interval = window.setInterval(
      () => void refresh(),
      data.settings.reconciliationIntervalSeconds * 1000,
    );
    const events = new EventSource("/api/waiter/events");
    const onEvent = () => void refresh();
    events.onopen = () => setOnline(true);
    events.onerror = () => setOnline(false);
    for (const event of [
      "connected",
      "heartbeat",
      "task",
      "ticket",
      "table",
      "coverage",
      "shift",
    ]) {
      events.addEventListener(event, onEvent);
    }
    return () => {
      window.clearInterval(interval);
      events.close();
    };
  }, [
    data?.authenticated,
    data?.settings.reconciliationIntervalSeconds,
    refresh,
  ]);

  async function mutate(mutation: WaiterMutation) {
    setBusy(true);
    setError("");
    try {
      const response = await fetch("/api/waiter", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(mutation),
      });
      const body = (await response.json()) as
        WaiterBootstrap | { bootstrap: WaiterBootstrap; error?: string };
      if (!response.ok) {
        throw new Error(
          "error" in body && body.error ? body.error : "No pudimos guardar.",
        );
      }
      const bootstrap = "bootstrap" in body ? body.bootstrap : body;
      setData(bootstrap);
      setSelectedZones(
        bootstrap.zones.filter((zone) => zone.selected).map((zone) => zone.id),
      );
      setLastSync(Date.parse(bootstrap.serverTime));
      setNow(Date.parse(bootstrap.serverTime));
      if (!bootstrap.authenticated) {
        setPin("");
        setClosing(false);
      }
    } catch (caught) {
      setError(
        caught instanceof Error ? caught.message : "No pudimos guardar.",
      );
      await refresh();
    } finally {
      setBusy(false);
    }
  }

  const staleSeconds = lastSync
    ? Math.floor((now - lastSync) / 1000)
    : Infinity;
  const stale = Boolean(
    data?.authenticated &&
      (!online || staleSeconds > data.settings.warningAfterSeconds),
  );

  if (!data) {
    return (
      <main className="grid min-h-dvh place-items-center bg-[#090909] font-sans text-[#fefefe]">
        <p className="text-h2">Cargando panel…</p>
      </main>
    );
  }

  if (!data.authenticated) {
    return (
      <main className="grid min-h-dvh place-items-center bg-[#090909] p-4 font-sans text-[#fefefe]">
        <section className="w-full max-w-md space-y-5 rounded-surface-xl border-2 border-[#2b2b29] bg-[#111110] p-6">
          <span className="w-fit rounded-surface-sm bg-warning px-2 py-1 text-[0.58rem] font-black uppercase tracking-wide text-foreground">
            Modo demo · no mueve dinero
          </span>
          <div>
            <p className="text-label uppercase tracking-wide text-[#c9c9c5]">
              Bar La Esquina
            </p>
            <h1 className="text-h1">Inicia tu turno</h1>
          </div>
          <p className="text-body text-[#c9c9c5]">
            Ingresa tu PIN personal. Los intentos fallidos quedan registrados.
          </p>
          <label className="block space-y-2">
            <span className="text-label uppercase tracking-wide text-[#c9c9c5]">
              PIN
            </span>
            <input
              aria-label="PIN personal"
              autoComplete="off"
              className="min-h-[4.5rem] w-full rounded-surface-md border-2 border-[#3a3a37] bg-[#090909] px-4 text-center text-h1 tracking-[0.3em] text-[#fefefe]"
              inputMode="numeric"
              maxLength={8}
              onChange={(event) =>
                setPin(event.target.value.replace(/\D/g, ""))
              }
              type="password"
              value={pin}
            />
          </label>
          <div aria-label="Teclado numérico" className="grid grid-cols-4 gap-2">
            {[1, 2, 3, 4, 5, 6, 7, 8, 9].map((digit) => (
              <button
                aria-label={`Número ${digit}`}
                className={cn(darkButton, darkButtonText, "text-h3")}
                key={digit}
                onClick={() =>
                  setPin((current) =>
                    current.length < 8 ? `${current}${digit}` : current,
                  )
                }
                type="button"
              >
                {digit}
              </button>
            ))}
            <button
              aria-label="Borrar PIN"
              className={cn(darkButton, darkButtonText, "text-body")}
              onClick={() => setPin("")}
              type="button"
            >
              C
            </button>
            <button
              aria-label="Número 0"
              className={cn(darkButton, darkButtonText, "text-h3")}
              onClick={() =>
                setPin((current) => (current.length < 8 ? `${current}0` : current))
              }
              type="button"
            >
              0
            </button>
            <button
              aria-label="Borrar último número"
              className={cn(darkButton, darkButtonText, "text-h3")}
              onClick={() => setPin((current) => current.slice(0, -1))}
              type="button"
            >
              ←
            </button>
          </div>
          <button
            className={cn(darkPrimaryButton, "w-full")}
            disabled={busy || pin.length < 4}
            onClick={() =>
              void mutate({
                action: "login",
                pin,
                clientFingerprint:
                  window.localStorage.getItem("tablio-waiter-device") ??
                  (() => {
                    const value = crypto.randomUUID();
                    window.localStorage.setItem("tablio-waiter-device", value);
                    return value;
                  })(),
              })
            }
          >
            Entrar
          </button>
          <p className="text-center text-small text-[#8a8a85]">
            Demo: Camila 2468 · Diego 1357
          </p>
          {error ? (
            <p className="rounded-surface-md bg-destructive px-4 py-3 text-body font-bold text-destructive-foreground" role="alert">
              {error}
            </p>
          ) : null}
        </section>
      </main>
    );
  }

  const hasZones = data.zones.some((zone) => zone.selected);
  if (!hasZones) {
    return (
      <main className="min-h-dvh bg-[#090909] p-4 pb-8 font-sans text-[#fefefe]">
        <header className="mb-5">
          <p className="text-body text-[#c9c9c5]">Hola, {data.employee?.name}</p>
          <h1 className="text-h1">¿Qué zona cubres?</h1>
        </header>
        <section className="grid grid-cols-2 gap-3">
          {data.zones.map((zone) => {
            const active = selectedZones.includes(zone.id);
            return (
              <button
                aria-pressed={active}
                className={cn(
                  "grid min-h-[6.5rem] gap-1 rounded-surface-lg border-2 p-4 text-left transition-colors duration-[var(--motion-feedback)] motion-reduce:transition-none",
                  active
                    ? "border-brand bg-[#3a2013] text-[#fefefe]"
                    : "border-[#3a3a37] bg-[#1d1d1b] text-[#fefefe]",
                )}
                key={zone.id}
                onClick={() =>
                  setSelectedZones((current) =>
                    current.includes(zone.id)
                      ? current.filter((id) => id !== zone.id)
                      : [...current, zone.id],
                  )
                }
                type="button"
              >
                <strong className="text-h3">{zone.name}</strong>
                <span className="text-small text-[#c9c9c5]">
                  {zone.activeTableCount} mesas activas
                </span>
              </button>
            );
          })}
        </section>
        <button
          className={cn(darkPrimaryButton, "sticky bottom-4 mt-6 w-full")}
          disabled={busy || selectedZones.length === 0}
          onClick={() => void mutate({ action: "zones.set", zoneIds: selectedZones })}
        >
          Empezar turno
        </button>
        {error ? (
          <p className="mt-4 rounded-surface-md bg-destructive px-4 py-3 text-body font-bold text-destructive-foreground" role="alert">
            {error}
          </p>
        ) : null}
      </main>
    );
  }

  return (
    <main
      className="flex min-h-dvh flex-col bg-[#090909] font-sans text-[#fefefe]"
      data-waiter-ready
    >
      <header className="sticky top-0 z-20 flex items-start justify-between gap-4 border-b-[3px] border-[#2b2b29] bg-[#111110] px-4 py-4">
        <div>
          <p className="text-small text-[#c9c9c5]">
            {data.venue.name} · {data.employee?.name}
          </p>
          <h1 className="text-h1">
            {tab === "tasks" ? "Tu cola" : tab === "tables" ? "Mesas" : "Tu turno"}
          </h1>
        </div>
        <ConnectionBadge lastSync={lastSync} now={now} online={online} stale={stale} />
      </header>

      {stale ? (
        <div
          className="sticky top-[5.5rem] z-20 border-b-4 border-[#fefefe] bg-destructive px-4 py-3 text-body font-extrabold text-destructive-foreground"
          role="alert"
        >
          No confíes en esta cola hasta recuperar conexión. Revisa con caja o
          barra.
        </div>
      ) : null}
      {error ? (
        <p
          className="mx-4 mt-4 rounded-surface-md bg-destructive px-4 py-3 text-body font-bold text-destructive-foreground"
          role="alert"
        >
          {error}
        </p>
      ) : null}

      <div className="flex-1 space-y-4 p-4 pb-28">
        {tab === "tasks" ? (
          <section aria-label="Tareas pendientes" className="space-y-3">
            <div className="flex items-center justify-between gap-3 rounded-surface-md bg-[#111110] px-4 py-3">
              <strong className="text-h2">{data.pending.total} pendientes</strong>
              <span className="text-small text-[#c9c9c5]">
                {data.pending.deliveryReady} listas ·{" "}
                {data.pending.serviceRequest} llamados
                {data.oldestPendingAt
                  ? ` · más antigua ${formatRelativeTime(data.oldestPendingAt, new Date(now))}`
                  : ""}
              </span>
            </div>
            {data.tasks.length === 0 ? (
              <div className="grid min-h-[14rem] place-content-center gap-2 rounded-surface-lg border-2 border-dashed border-[#3a3a37] bg-[#111110] text-center">
                <h2 className="text-h2">Todo al día</h2>
                <p className="text-body text-[#c9c9c5]">
                  La cola está sincronizada.
                </p>
              </div>
            ) : (
              data.tasks.map((task) => (
                <TaskCard
                  amberAfterSeconds={data.settings.amberAfterSeconds}
                  busy={busy}
                  criticalAfterSeconds={data.settings.criticalAfterSeconds}
                  key={task.id}
                  now={now}
                  onResolve={(resolution, reason) =>
                    void mutate({
                      action: "task.resolve",
                      taskId: task.id,
                      expectedVersion: task.version,
                      resolution,
                      reason,
                    })
                  }
                  task={task}
                />
              ))
            )}
          </section>
        ) : null}

        {tab === "tables" ? (
          <section className="space-y-3">
            <div className="flex items-center justify-between gap-3 rounded-surface-md bg-[#111110] px-4 py-3">
              <span className="text-small text-[#c9c9c5]">
                {groupSelection.length
                  ? `${groupSelection.length} mesas elegidas`
                  : "Mantén las cuentas separadas"}
              </span>
              <button
                className={cn(darkButton, darkButtonText, "min-h-[3.25rem] text-small")}
                disabled={groupSelection.length < 2 || busy}
                onClick={() => {
                  void mutate({
                    action: "group.create",
                    tableSessionIds: groupSelection,
                  });
                  setGroupSelection([]);
                }}
                type="button"
              >
                Unir mesas
              </button>
            </div>
            <div className="grid grid-cols-2 gap-3">
              {data.tables.map((table) => (
                <article
                  className="flex flex-col gap-2 rounded-surface-lg border-2 border-[#3a3a37] bg-[#1d1d1b] p-3"
                  key={table.sessionId}
                  role="article"
                >
                  <label className="flex items-center gap-3 text-small text-[#c9c9c5]">
                    <input
                      checked={groupSelection.includes(table.sessionId)}
                      className="size-touch shrink-0"
                      disabled={Boolean(table.groupId)}
                      onChange={() =>
                        setGroupSelection((current) =>
                          current.includes(table.sessionId)
                            ? current.filter((id) => id !== table.sessionId)
                            : [...current, table.sessionId],
                        )
                      }
                      type="checkbox"
                    />
                    agrupar
                  </label>
                  <button
                    className="flex flex-1 flex-col items-start gap-1 bg-transparent text-left text-[#fefefe]"
                    onClick={() => setSelectedTable(table)}
                    type="button"
                  >
                    <strong className="text-h3">{table.tableName}</strong>
                    <span className="text-small text-[#c9c9c5]">
                      {table.groupLabel ?? table.zoneName}
                    </span>
                    <small className="text-label text-[#8a8a85]">
                      {table.peopleCount} personas · {table.orders.length} pedidos
                    </small>
                    {table.credit ? (
                      <em className="mt-1 w-fit rounded-surface-sm border-l-4 border-warning bg-warning-soft px-2 py-1 text-small font-bold not-italic text-foreground">
                        CRÉDITO · {formatClp(table.credit.prepaidByAppClp)} app ·{" "}
                        {formatClp(table.credit.outstandingClp)} pendiente
                      </em>
                    ) : null}
                  </button>
                </article>
              ))}
            </div>
          </section>
        ) : null}

        {tab === "shift" ? (
          <section className="space-y-5">
            <div>
              <h2 className="mb-3 text-h2">Zonas activas</h2>
              <div className="grid grid-cols-2 gap-3">
                {data.zones.map((zone) => {
                  const active = selectedZones.includes(zone.id);
                  return (
                    <button
                      aria-pressed={active}
                      className={cn(
                        "min-h-[4.5rem] rounded-surface-md border-2 px-4 text-body font-extrabold",
                        active
                          ? "border-brand bg-[#3a2013] text-[#fefefe]"
                          : "border-[#3a3a37] bg-[#1d1d1b] text-[#fefefe]",
                      )}
                      key={zone.id}
                      onClick={() =>
                        setSelectedZones((current) =>
                          current.includes(zone.id)
                            ? current.filter((id) => id !== zone.id)
                            : [...current, zone.id],
                        )
                      }
                      type="button"
                    >
                      {zone.name}
                    </button>
                  );
                })}
              </div>
              <button
                className={cn(darkButton, darkButtonText, "mt-3 w-full")}
                disabled={selectedZones.length === 0 || busy}
                onClick={() => void mutate({ action: "zones.set", zoneIds: selectedZones })}
                type="button"
              >
                Guardar cobertura
              </button>
            </div>

            {data.activeWaiters.some((waiter) => waiter.id !== data.employee?.id) ? (
              <div className="space-y-3 rounded-surface-lg border-2 border-[#3a3a37] bg-[#111110] p-4">
                <h2 className="text-h2">Traspasar una zona</h2>
                <label className="block space-y-2">
                  <span className="text-label uppercase tracking-wide text-[#c9c9c5]">
                    Zona
                  </span>
                  <select
                    className="min-h-[3.75rem] w-full rounded-surface-md border-2 border-[#3a3a37] bg-[#090909] px-3 text-body text-[#fefefe]"
                    onChange={(event) => setTransferZoneId(event.target.value)}
                    value={transferZoneId}
                  >
                    <option value="">Selecciona</option>
                    {data.zones
                      .filter((zone) => zone.selected)
                      .map((zone) => (
                        <option key={zone.id} value={zone.id}>
                          {zone.name}
                        </option>
                      ))}
                  </select>
                </label>
                <label className="block space-y-2">
                  <span className="text-label uppercase tracking-wide text-[#c9c9c5]">
                    Nuevo garzón
                  </span>
                  <select
                    className="min-h-[3.75rem] w-full rounded-surface-md border-2 border-[#3a3a37] bg-[#090909] px-3 text-body text-[#fefefe]"
                    onChange={(event) => setTransferWaiterId(event.target.value)}
                    value={transferWaiterId}
                  >
                    <option value="">Selecciona</option>
                    {data.activeWaiters
                      .filter((waiter) => waiter.id !== data.employee?.id)
                      .map((waiter) => (
                        <option key={waiter.id} value={waiter.id}>
                          {waiter.name}
                        </option>
                      ))}
                  </select>
                </label>
                <button
                  className={cn(darkButton, darkButtonText, "w-full")}
                  disabled={!transferZoneId || !transferWaiterId || busy}
                  onClick={() => setZoneTransferReason(true)}
                  type="button"
                >
                  Traspasar zona y pendientes
                </button>
              </div>
            ) : null}

            <div className="space-y-3 rounded-surface-lg border-2 border-[#3a3a37] bg-[#111110] p-4">
              <h2 className="text-h2">Antes de cerrar</h2>
              <p className="text-body text-[#c9c9c5]">Tienes {pendingText(data.pending)}.</p>
              <button
                className={cn(darkDangerButton, "w-full")}
                onClick={() => setClosing(true)}
                type="button"
              >
                Cerrar turno
              </button>
            </div>
          </section>
        ) : null}
      </div>

      <nav
        aria-label="Panel del garzón"
        className="sticky bottom-0 z-20 grid grid-cols-3 gap-2 border-t-[3px] border-[#2b2b29] bg-[#111110] p-2"
      >
        {(
          [
            ["tasks", "Tareas"],
            ["tables", "Mesas"],
            ["shift", "Turno"],
          ] as const
        ).map(([id, label]) => (
          <button
            className={cn(
              "min-h-[4rem] rounded-button text-body font-extrabold transition-colors duration-[var(--motion-feedback)] motion-reduce:transition-none",
              tab === id
                ? "bg-[#fefefe] text-[#111110]"
                : "bg-transparent text-[#8a8a85] hover:bg-[#1d1d1b]",
            )}
            key={id}
            onClick={() => setTab(id)}
            type="button"
          >
            {label}
          </button>
        ))}
      </nav>

      {selectedTable ? (
        <TableDialog
          onClose={() => setSelectedTable(undefined)}
          onIncident={(reason) => {
            void mutate({
              action: "table.incident",
              tableSessionId: selectedTable.sessionId,
              reason,
            });
            setSelectedTable(undefined);
          }}
          onSeparate={(reason) => {
            if (!selectedTable.groupId) return;
            void mutate({
              action: "group.separate",
              groupId: selectedTable.groupId,
              expectedVersion: selectedTable.groupVersion ?? 0,
              reason,
            });
            setSelectedTable(undefined);
          }}
          onTransfer={(employeeId, reason) => {
            void mutate({
              action: "table.transfer",
              tableSessionId: selectedTable.sessionId,
              targetEmployeeId: employeeId,
              reason,
            });
            setSelectedTable(undefined);
          }}
          table={selectedTable}
          waiters={data.activeWaiters.filter(
            (waiter) => waiter.id !== data.employee?.id,
          )}
          working={busy}
        />
      ) : null}

      <Dialog onOpenChange={setClosing} open={closing}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>¿Cerrar turno?</DialogTitle>
            <DialogDescription>
              Tienes {pendingText(data.pending)}. Al cerrar quedarán sin
              asignar y visibles para todos.
            </DialogDescription>
          </DialogHeader>
          <p className="text-small text-muted-foreground">
            No te bloquearemos: esta decisión y el resumen quedarán auditados.
          </p>
          <button
            className={cn(darkDangerButton, "w-full")}
            disabled={busy}
            onClick={() =>
              void mutate({
                action: "shift.close",
                expectedVersion: data.shift?.version ?? 0,
              })
            }
            type="button"
          >
            Sí, cerrar turno
          </button>
          <button
            className={cn(darkButton, darkButtonText, "w-full")}
            onClick={() => setClosing(false)}
            type="button"
          >
            Volver
          </button>
        </DialogContent>
      </Dialog>

      <ReasonDialog
        confirmLabel="Confirmar traspaso"
        description="Este motivo queda auditado junto al traspaso."
        onConfirm={(reason) => {
          void mutate({
            action: "zone.transfer",
            zoneId: transferZoneId,
            targetEmployeeId: transferWaiterId,
            reason,
          });
          setTransferZoneId("");
          setTransferWaiterId("");
          setZoneTransferReason(false);
        }}
        onOpenChange={setZoneTransferReason}
        open={zoneTransferReason}
        title="Motivo del traspaso de zona"
        working={busy}
      />
    </main>
  );
}

const TASK_ACCENT = {
  critical: "border-l-8 border-l-destructive",
  delayed: "border-l-8 border-l-warning",
  ready: "border-l-8 border-l-success",
  normal: "border-l-8 border-l-border",
} as const;

function TaskCard(props: {
  task: WaiterTask;
  now: number;
  busy: boolean;
  amberAfterSeconds: number;
  criticalAfterSeconds: number;
  onResolve: (resolution: "completed" | "dismissed", reason?: string) => void;
}) {
  const { task } = props;
  const [discarding, setDiscarding] = useState(false);
  const ageSeconds = Math.max(
    0,
    Math.floor((props.now - Date.parse(task.requestedAt)) / 1000),
  );
  const ageMinutes = Math.floor(ageSeconds / 60);
  const delayed =
    ageSeconds >= props.criticalAfterSeconds
      ? "delayCritical"
      : ageSeconds >= props.amberAfterSeconds
        ? "delayAmber"
        : undefined;
  const accent = task.critical
    ? TASK_ACCENT.critical
    : delayed
      ? TASK_ACCENT.delayed
      : task.type === "delivery_ready"
        ? TASK_ACCENT.ready
        : TASK_ACCENT.normal;
  const unpaid = !task.paid && task.type === "waiter_payment_request";

  return (
    <article
      className={cn(
        "rounded-surface-lg bg-background p-4 text-foreground",
        accent,
        unpaid && "bg-warning-soft",
      )}
    >
      <div className="mb-2 flex flex-wrap gap-2">
        {task.critical ? (
          <span className="rounded-surface-sm bg-destructive px-2 py-1 text-label font-black uppercase tracking-wide text-destructive-foreground">
            CRÍTICA · SUPERÓ 12 MIN
          </span>
        ) : null}
        {!task.critical && delayed === "delayCritical" ? (
          <span className="rounded-surface-sm bg-destructive px-2 py-1 text-label font-black uppercase tracking-wide text-destructive-foreground">
            MUY ATRASADA
          </span>
        ) : null}
        {!task.critical && delayed === "delayAmber" ? (
          <span className="rounded-surface-sm bg-warning px-2 py-1 text-label font-black uppercase tracking-wide text-foreground">
            DEMORADA
          </span>
        ) : null}
        {!task.critical && !delayed && task.type === "delivery_ready" ? (
          <span className="rounded-surface-sm bg-success px-2 py-1 text-label font-black uppercase tracking-wide text-success-foreground">
            ✓ ENTREGA LISTA
          </span>
        ) : null}
        {task.unassignedZone ? (
          <span className="rounded-surface-sm bg-destructive px-2 py-1 text-label font-black uppercase tracking-wide text-destructive-foreground">
            SIN ASIGNAR · VISIBLE PARA TODOS
          </span>
        ) : null}
        {task.adminEscalated ? (
          <span className="rounded-surface-sm bg-destructive px-2 py-1 text-label font-black uppercase tracking-wide text-destructive-foreground">
            ALERTA ENVIADA A ADMINISTRACIÓN
          </span>
        ) : null}
        {task.paid ? (
          <span className="rounded-surface-sm bg-success px-2 py-1 text-label font-black uppercase tracking-wide text-success-foreground">
            PAGADO
          </span>
        ) : null}
      </div>
      <p className="text-small font-bold text-muted-foreground">
        {ageMinutes < 1 ? "Ahora" : `${ageMinutes} min`} · {task.zoneName}
      </p>
      <h2 className="mt-1 text-h2 leading-tight">{task.title}</h2>
      <p className="mt-1 text-body text-muted-foreground">{task.detail}</p>
      {task.amountClp !== undefined ? (
        <p className="mt-2 text-h2">{formatClp(task.amountClp)}</p>
      ) : null}
      {task.items.length ? (
        <ul className="mt-3 space-y-1 text-body">
          {task.items.map((item, index) => (
            <li key={`${item.name}-${index}`}>
              <strong>{item.quantity}×</strong> {item.name}
              {item.note ? ` · ${item.note}` : ""}
            </li>
          ))}
        </ul>
      ) : null}
      <button
        className={cn(darkPrimaryButton, "mt-4 w-full")}
        disabled={props.busy}
        onClick={() => props.onResolve("completed")}
        type="button"
      >
        {task.actionLabel}
      </button>
      {task.type === "waiter_payment_request" ? (
        <button
          className="mt-2 min-h-touch w-full rounded-button bg-transparent text-small font-bold text-muted-foreground underline"
          onClick={() => setDiscarding(true)}
          type="button"
        >
          Descartar solicitud
        </button>
      ) : null}
      <ReasonDialog
        confirmLabel="Confirmar descarte"
        danger
        description="Esta acción queda auditada."
        onConfirm={(reason) => {
          props.onResolve("dismissed", reason);
          setDiscarding(false);
        }}
        onOpenChange={setDiscarding}
        open={discarding}
        title="Motivo para descartar la solicitud"
        working={props.busy}
      />
    </article>
  );
}

function TableDialog(props: {
  table: WaiterTable;
  waiters: readonly { id: string; name: string }[];
  working: boolean;
  onClose: () => void;
  onSeparate: (reason: string) => void;
  onTransfer: (employeeId: string, reason: string) => void;
  onIncident: (reason: string) => void;
}) {
  type Mode = "view" | "incident" | "separate" | "transfer";
  const [mode, setMode] = useState<Mode>("view");
  const [waiterId, setWaiterId] = useState(props.waiters[0]?.id ?? "");
  const total = useMemo(
    () => props.table.orders.reduce((sum, order) => sum + order.amountClp, 0),
    [props.table.orders],
  );

  return (
    <Dialog
      onOpenChange={(open) => !open && props.onClose()}
      open
    >
      <DialogContent>
        {mode === "view" ? (
          <div className="space-y-4">
            <DialogHeader>
              <DialogTitle>{props.table.tableName}</DialogTitle>
              <DialogDescription>
                {props.table.groupLabel ?? props.table.zoneName} ·{" "}
                {props.table.peopleCount} personas
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-3">
              {props.table.orders.map((order) => (
                <article
                  className="rounded-surface-md border border-border bg-muted p-3"
                  key={order.orderNumber}
                >
                  <div className="flex items-center justify-between gap-3">
                    <strong>
                      Pedido {order.orderNumber} · {order.displayName ?? order.alias}
                    </strong>
                    <span>{formatClp(order.amountClp)}</span>
                  </div>
                  {order.tickets.map((ticket) => (
                    <small
                      className="block text-small text-muted-foreground"
                      key={ticket.stationName}
                    >
                      {ticket.stationName}: {ticket.state}
                    </small>
                  ))}
                </article>
              ))}
            </div>
            <p className="text-h3">Total visible {formatClp(total)}</p>
            <div className="grid gap-2">
              <button
                className={lightOutlineButton}
                onClick={() => setMode("incident")}
                type="button"
              >
                Reportar incidencia
              </button>
              {props.table.groupId ? (
                <button
                  className={lightOutlineButton}
                  onClick={() => setMode("separate")}
                  type="button"
                >
                  Separar mesas
                </button>
              ) : null}
              {props.waiters.length ? (
                <button
                  className={lightOutlineButton}
                  onClick={() => setMode("transfer")}
                  type="button"
                >
                  Transferir mesa
                </button>
              ) : (
                <p className="text-small text-muted-foreground">
                  Inicia otro turno para transferir esta mesa.
                </p>
              )}
            </div>
          </div>
        ) : null}

        {mode === "incident" || mode === "separate" ? (
          <form
            className="space-y-6"
            onSubmit={(event) => {
              event.preventDefault();
              const reason = String(
                new FormData(event.currentTarget).get("reason") ?? "",
              ).trim();
              if (!reason) return;
              if (mode === "incident") props.onIncident(reason);
              else props.onSeparate(reason);
            }}
          >
            <DialogHeader>
              <DialogTitle>
                {mode === "incident" ? "Describe la incidencia" : "Motivo para separar las mesas"}
              </DialogTitle>
              <DialogDescription>
                Esta acción queda auditada.
              </DialogDescription>
            </DialogHeader>
            <Textarea autoFocus minLength={3} name="reason" required />
            <button className={cn(darkPrimaryButton, "w-full")} disabled={props.working} type="submit">
              {props.working ? "Guardando…" : "Confirmar"}
            </button>
          </form>
        ) : null}

        {mode === "transfer" ? (
          <form
            className="space-y-6"
            onSubmit={(event) => {
              event.preventDefault();
              const reason = String(
                new FormData(event.currentTarget).get("reason") ?? "",
              ).trim();
              if (reason && waiterId) props.onTransfer(waiterId, reason);
            }}
          >
            <DialogHeader>
              <DialogTitle>Transferir mesa</DialogTitle>
              <DialogDescription>
                Elige quién recibe esta mesa y explica por qué.
              </DialogDescription>
            </DialogHeader>
            <label className="block space-y-2">
              <span className="text-small font-bold">Garzón</span>
              <select
                className="min-h-touch w-full rounded-input border border-input bg-card px-4 py-3 text-body text-foreground"
                onChange={(event) => setWaiterId(event.target.value)}
                value={waiterId}
              >
                {props.waiters.map((waiter) => (
                  <option key={waiter.id} value={waiter.id}>
                    {waiter.name}
                  </option>
                ))}
              </select>
            </label>
            <Textarea
              autoFocus
              minLength={3}
              name="reason"
              placeholder="Motivo de la transferencia"
              required
            />
            <button className={cn(darkPrimaryButton, "w-full")} disabled={props.working} type="submit">
              {props.working ? "Guardando…" : "Transferir"}
            </button>
          </form>
        ) : null}
      </DialogContent>
    </Dialog>
  );
}
