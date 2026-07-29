"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import type {
  PendingTaskSummary,
  WaiterBootstrap,
  WaiterMutation,
  WaiterTable,
  WaiterTask,
} from "../../lib/waiter-contract";

type Tab = "tasks" | "tables" | "shift";

function money(value = 0) {
  return new Intl.NumberFormat("es-CL", {
    style: "currency",
    currency: "CLP",
    maximumFractionDigits: 0,
  }).format(value);
}

function elapsed(value: string, current: number) {
  const seconds = Math.max(0, Math.floor((current - Date.parse(value)) / 1000));
  if (seconds < 60) return `hace ${seconds} s`;
  return `hace ${Math.floor(seconds / 60)} min`;
}

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
  const stale =
    data?.authenticated &&
    (!online || staleSeconds > data.settings.warningAfterSeconds);

  if (!data) {
    return (
      <main className="waiterShell">
        <p>Cargando panel…</p>
      </main>
    );
  }

  if (!data.authenticated) {
    return (
      <main className="waiterLogin">
        <section className="waiterLoginCard">
          <p className="waiterDemoFlag">MODO DEMO · NO MUEVE DINERO</p>
          <p className="eyebrow">Bar La Esquina</p>
          <h1>Inicia tu turno</h1>
          <p>
            Ingresa tu PIN personal. Los intentos fallidos quedan registrados.
          </p>
          <label className="waiterPinLabel">
            PIN
            <input
              aria-label="PIN personal"
              autoComplete="off"
              inputMode="numeric"
              maxLength={8}
              type="password"
              value={pin}
              onChange={(event) =>
                setPin(event.target.value.replace(/\D/g, ""))
              }
            />
          </label>
          <div className="waiterKeypad" aria-label="Teclado numérico">
            {[1, 2, 3, 4, 5, 6, 7, 8, 9].map((digit) => (
              <button
                aria-label={`Número ${digit}`}
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
              onClick={() => setPin("")}
              type="button"
            >
              C
            </button>
            <button
              aria-label="Número 0"
              onClick={() =>
                setPin((current) =>
                  current.length < 8 ? `${current}0` : current,
                )
              }
              type="button"
            >
              0
            </button>
            <button
              aria-label="Borrar último número"
              onClick={() => setPin((current) => current.slice(0, -1))}
              type="button"
            >
              ←
            </button>
          </div>
          <button
            className="waiterPrimary"
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
          <p className="waiterDemoHelp">Demo: Camila 2468 · Diego 1357</p>
          {error ? (
            <p className="waiterError" role="alert">
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
      <main className="waiterShell">
        <header className="waiterTop">
          <div>
            <p>Hola, {data.employee?.name}</p>
            <h1>¿Qué zona cubres?</h1>
          </div>
        </header>
        <section className="waiterZoneGrid">
          {data.zones.map((zone) => (
            <button
              aria-pressed={selectedZones.includes(zone.id)}
              className={selectedZones.includes(zone.id) ? "selected" : ""}
              key={zone.id}
              onClick={() =>
                setSelectedZones((current) =>
                  current.includes(zone.id)
                    ? current.filter((id) => id !== zone.id)
                    : [...current, zone.id],
                )
              }
            >
              <strong>{zone.name}</strong>
              <span>{zone.activeTableCount} mesas activas</span>
            </button>
          ))}
        </section>
        <button
          className="waiterPrimary waiterStickyAction"
          disabled={busy || selectedZones.length === 0}
          onClick={() =>
            void mutate({ action: "zones.set", zoneIds: selectedZones })
          }
        >
          Empezar turno
        </button>
        {error ? (
          <p className="waiterError" role="alert">
            {error}
          </p>
        ) : null}
      </main>
    );
  }

  return (
    <main className="waiterShell">
      <header className="waiterTop">
        <div>
          <p>
            {data.venue.name} · {data.employee?.name}
          </p>
          <h1>
            {tab === "tasks"
              ? "Tu cola"
              : tab === "tables"
                ? "Mesas"
                : "Tu turno"}
          </h1>
        </div>
        <div className={`waiterConnection ${stale ? "stale" : ""}`}>
          <strong>
            {stale
              ? "PUEDE ESTAR DESACTUALIZADO"
              : online
                ? "En línea"
                : "Reconectando"}
          </strong>
          <span>
            Actualizado{" "}
            {lastSync
              ? elapsed(new Date(lastSync).toISOString(), now)
              : "nunca"}
          </span>
        </div>
      </header>

      {stale ? (
        <div className="waiterStale" role="alert">
          No confíes en esta cola hasta recuperar conexión. Revisa con caja o
          barra.
        </div>
      ) : null}
      {error ? (
        <p className="waiterError" role="alert">
          {error}
        </p>
      ) : null}

      {tab === "tasks" ? (
        <section className="waiterTasks" aria-label="Tareas pendientes">
          <div className="waiterCounters">
            <strong>{data.pending.total} pendientes</strong>
            <span>
              {data.pending.deliveryReady} listas ·{" "}
              {data.pending.serviceRequest} llamados
              {data.oldestPendingAt
                ? ` · más antigua ${elapsed(data.oldestPendingAt, now)}`
                : ""}
            </span>
          </div>
          {data.tasks.length === 0 ? (
            <div className="waiterEmpty">
              <h2>Todo al día</h2>
              <p>La cola está sincronizada.</p>
            </div>
          ) : (
            data.tasks.map((task) => (
              <TaskCard
                key={task.id}
                task={task}
                now={now}
                busy={busy}
                amberAfterSeconds={data.settings.amberAfterSeconds}
                criticalAfterSeconds={data.settings.criticalAfterSeconds}
                onResolve={(resolution, reason) =>
                  void mutate({
                    action: "task.resolve",
                    taskId: task.id,
                    expectedVersion: task.version,
                    resolution,
                    reason,
                  })
                }
              />
            ))
          )}
        </section>
      ) : null}

      {tab === "tables" ? (
        <section className="waiterTables">
          <div className="waiterGroupBar">
            <span>
              {groupSelection.length
                ? `${groupSelection.length} mesas elegidas`
                : "Mantén las cuentas separadas"}
            </span>
            <button
              disabled={groupSelection.length < 2 || busy}
              onClick={() => {
                void mutate({
                  action: "group.create",
                  tableSessionIds: groupSelection,
                });
                setGroupSelection([]);
              }}
            >
              Unir mesas
            </button>
          </div>
          <div className="waiterTableGrid">
            {data.tables.map((table) => (
              <article key={table.sessionId} className="waiterTableCard">
                <label>
                  <input
                    checked={groupSelection.includes(table.sessionId)}
                    disabled={Boolean(table.groupId)}
                    type="checkbox"
                    onChange={() =>
                      setGroupSelection((current) =>
                        current.includes(table.sessionId)
                          ? current.filter((id) => id !== table.sessionId)
                          : [...current, table.sessionId],
                      )
                    }
                  />
                  agrupar
                </label>
                <button onClick={() => setSelectedTable(table)}>
                  <strong>{table.tableName}</strong>
                  <span>{table.groupLabel ?? table.zoneName}</span>
                  <small>
                    {table.peopleCount} personas · {table.orders.length} pedidos
                  </small>
                  {table.credit ? (
                    <em className="waiterCreditStatus">
                      CRÉDITO · {money(table.credit.prepaidByAppClp)} app ·{" "}
                      {money(table.credit.outstandingClp)} pendiente
                    </em>
                  ) : null}
                </button>
              </article>
            ))}
          </div>
        </section>
      ) : null}

      {tab === "shift" ? (
        <section className="waiterShift">
          <h2>Zonas activas</h2>
          <div className="waiterZoneGrid compact">
            {data.zones.map((zone) => (
              <button
                aria-pressed={selectedZones.includes(zone.id)}
                className={selectedZones.includes(zone.id) ? "selected" : ""}
                key={zone.id}
                onClick={() =>
                  setSelectedZones((current) =>
                    current.includes(zone.id)
                      ? current.filter((id) => id !== zone.id)
                      : [...current, zone.id],
                  )
                }
              >
                <strong>{zone.name}</strong>
              </button>
            ))}
          </div>
          <button
            className="waiterSecondary"
            disabled={selectedZones.length === 0 || busy}
            onClick={() =>
              void mutate({ action: "zones.set", zoneIds: selectedZones })
            }
          >
            Guardar cobertura
          </button>
          {data.activeWaiters.some(
            (waiter) => waiter.id !== data.employee?.id,
          ) ? (
            <div className="waiterTransfer">
              <h2>Traspasar una zona</h2>
              <label>
                Zona
                <select
                  value={transferZoneId}
                  onChange={(event) => setTransferZoneId(event.target.value)}
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
              <label>
                Nuevo garzón
                <select
                  value={transferWaiterId}
                  onChange={(event) => setTransferWaiterId(event.target.value)}
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
                className="waiterSecondary"
                disabled={!transferZoneId || !transferWaiterId || busy}
                onClick={() => {
                  const reason = window.prompt("Motivo del traspaso de zona");
                  if (reason?.trim()) {
                    void mutate({
                      action: "zone.transfer",
                      zoneId: transferZoneId,
                      targetEmployeeId: transferWaiterId,
                      reason,
                    });
                    setTransferZoneId("");
                    setTransferWaiterId("");
                  }
                }}
              >
                Traspasar zona y pendientes
              </button>
            </div>
          ) : null}
          <div className="waiterShiftSummary">
            <h2>Antes de cerrar</h2>
            <p>Tienes {pendingText(data.pending)}.</p>
            <button className="waiterDanger" onClick={() => setClosing(true)}>
              Cerrar turno
            </button>
          </div>
        </section>
      ) : null}

      <nav className="waiterNav" aria-label="Panel del garzón">
        <button
          className={tab === "tasks" ? "active" : ""}
          onClick={() => setTab("tasks")}
        >
          Tareas
        </button>
        <button
          className={tab === "tables" ? "active" : ""}
          onClick={() => setTab("tables")}
        >
          Mesas
        </button>
        <button
          className={tab === "shift" ? "active" : ""}
          onClick={() => setTab("shift")}
        >
          Turno
        </button>
      </nav>

      {selectedTable ? (
        <TableDialog
          table={selectedTable}
          waiters={data.activeWaiters.filter(
            (waiter) => waiter.id !== data.employee?.id,
          )}
          onClose={() => setSelectedTable(undefined)}
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
          onIncident={(reason) => {
            void mutate({
              action: "table.incident",
              tableSessionId: selectedTable.sessionId,
              reason,
            });
            setSelectedTable(undefined);
          }}
        />
      ) : null}

      {closing ? (
        <div
          className="waiterModal"
          role="dialog"
          aria-modal="true"
          aria-labelledby="close-title"
        >
          <div>
            <h2 id="close-title">¿Cerrar turno?</h2>
            <p className="waiterCloseWarning">
              Tienes {pendingText(data.pending)}. Al cerrar quedarán sin asignar
              y visibles para todos.
            </p>
            <p>
              No te bloquearemos: esta decisión y el resumen quedarán auditados.
            </p>
            <button
              className="waiterDanger"
              disabled={busy}
              onClick={() =>
                void mutate({
                  action: "shift.close",
                  expectedVersion: data.shift?.version ?? 0,
                })
              }
            >
              Sí, cerrar turno
            </button>
            <button
              className="waiterSecondary"
              onClick={() => setClosing(false)}
            >
              Volver
            </button>
          </div>
        </div>
      ) : null}
    </main>
  );
}

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
        : "";
  return (
    <article
      className={`waiterTask ${task.critical ? "critical" : ""} ${delayed} ${!task.paid && task.type === "waiter_payment_request" ? "unpaid" : ""}`}
    >
      <div className="waiterTaskFlags">
        {task.critical ? <strong>CRÍTICA · SUPERÓ 12 MIN</strong> : null}
        {!task.critical && delayed === "delayCritical" ? (
          <strong>MUY ATRASADA</strong>
        ) : null}
        {!task.critical && delayed === "delayAmber" ? (
          <strong className="amber">DEMORADA</strong>
        ) : null}
        {task.unassignedZone ? (
          <strong>SIN ASIGNAR · VISIBLE PARA TODOS</strong>
        ) : null}
        {task.adminEscalated ? (
          <strong>ALERTA ENVIADA A ADMINISTRACIÓN</strong>
        ) : null}
        {task.paid ? <strong className="paid">PAGADO</strong> : null}
      </div>
      <p className="waiterTaskAge">
        {ageMinutes < 1 ? "Ahora" : `${ageMinutes} min`} · {task.zoneName}
      </p>
      <h2>{task.title}</h2>
      <p>{task.detail}</p>
      {task.amountClp !== undefined ? (
        <p className="waiterAmount">{money(task.amountClp)}</p>
      ) : null}
      {task.items.length ? (
        <ul>
          {task.items.map((item, index) => (
            <li key={`${item.name}-${index}`}>
              {item.quantity}× {item.name}
              {item.note ? ` · ${item.note}` : ""}
            </li>
          ))}
        </ul>
      ) : null}
      <button
        className="waiterTaskAction"
        disabled={props.busy}
        onClick={() => props.onResolve("completed")}
      >
        {task.actionLabel}
      </button>
      {task.type === "waiter_payment_request" ? (
        discarding ? (
          <button
            className="waiterSecondary"
            onClick={() => {
              const reason = window.prompt(
                "Motivo para descartar la solicitud",
              );
              if (reason?.trim()) props.onResolve("dismissed", reason);
              setDiscarding(false);
            }}
          >
            Confirmar descarte con motivo
          </button>
        ) : (
          <button
            className="waiterTextButton"
            onClick={() => setDiscarding(true)}
          >
            Descartar solicitud
          </button>
        )
      ) : null}
    </article>
  );
}

function TableDialog(props: {
  table: WaiterTable;
  waiters: readonly { id: string; name: string }[];
  onClose: () => void;
  onSeparate: (reason: string) => void;
  onTransfer: (employeeId: string, reason: string) => void;
  onIncident: (reason: string) => void;
}) {
  const [waiterId, setWaiterId] = useState(props.waiters[0]?.id ?? "");
  const total = useMemo(
    () => props.table.orders.reduce((sum, order) => sum + order.amountClp, 0),
    [props.table.orders],
  );
  return (
    <div
      className="waiterModal"
      role="dialog"
      aria-modal="true"
      aria-labelledby="table-title"
    >
      <div>
        <button
          className="waiterModalClose"
          aria-label="Cerrar"
          onClick={props.onClose}
        >
          ×
        </button>
        <h2 id="table-title">{props.table.tableName}</h2>
        <p>
          {props.table.groupLabel ?? props.table.zoneName} ·{" "}
          {props.table.peopleCount} personas
        </p>
        {props.table.orders.map((order) => (
          <article className="waiterOrder" key={order.orderNumber}>
            <strong>
              Pedido {order.orderNumber} · {order.displayName ?? order.alias}
            </strong>
            <span>{money(order.amountClp)}</span>
            {order.tickets.map((ticket) => (
              <small key={ticket.stationName}>
                {ticket.stationName}: {ticket.state}
              </small>
            ))}
          </article>
        ))}
        <p className="waiterAmount">Total visible {money(total)}</p>
        <button
          className="waiterSecondary"
          onClick={() => {
            const reason = window.prompt("Describe la incidencia");
            if (reason?.trim()) props.onIncident(reason);
          }}
        >
          Reportar incidencia
        </button>
        {props.table.groupId ? (
          <button
            className="waiterSecondary"
            onClick={() => {
              const reason = window.prompt("Motivo para separar las mesas");
              if (reason?.trim()) props.onSeparate(reason);
            }}
          >
            Separar mesas
          </button>
        ) : null}
        {props.waiters.length ? (
          <div className="waiterTransfer">
            <label>
              Transferir mesa
              <select
                value={waiterId}
                onChange={(event) => setWaiterId(event.target.value)}
              >
                {props.waiters.map((waiter) => (
                  <option key={waiter.id} value={waiter.id}>
                    {waiter.name}
                  </option>
                ))}
              </select>
            </label>
            <button
              className="waiterSecondary"
              onClick={() => {
                const reason = window.prompt("Motivo de la transferencia");
                if (reason?.trim() && waiterId)
                  props.onTransfer(waiterId, reason);
              }}
            >
              Transferir
            </button>
          </div>
        ) : (
          <p>Inicia otro turno para transferir esta mesa.</p>
        )}
      </div>
    </div>
  );
}
