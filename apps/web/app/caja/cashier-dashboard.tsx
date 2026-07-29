"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import type {
  CashierBootstrap,
  CashierException,
  CashierMutation,
  CashierTableState,
} from "../../lib/cashier-contract";

type View = "tables" | "exceptions" | "reconciliation" | "loyalty" | "close";

function money(value = 0) {
  return new Intl.NumberFormat("es-CL", {
    style: "currency",
    currency: "CLP",
    maximumFractionDigits: 0,
  }).format(value);
}

function elapsed(value: string | undefined, now: number) {
  if (!value) return "sin actividad";
  const seconds = Math.max(0, Math.floor((now - Date.parse(value)) / 1000));
  if (seconds < 60) return `hace ${seconds} s`;
  if (seconds < 3600) return `hace ${Math.floor(seconds / 60)} min`;
  return `hace ${Math.floor(seconds / 3600)} h`;
}

const tableState: Record<CashierTableState, string> = {
  free: "Libre",
  active: "Activa",
  new_orders: "Pedidos nuevos",
  preparing: "Preparando",
  requires_delivery: "Requiere entrega",
  requires_attention: "Requiere atención",
  inactive: "Inactiva",
  closed: "Cerrada",
};

function approvalElapsed(exception: CashierException) {
  const seconds = exception.secondsSinceApproval;
  if (seconds === undefined) return "";
  if (seconds < 60) return `${seconds} s desde la aprobación`;
  return `${Math.floor(seconds / 60)} min desde la aprobación`;
}

export function CashierDashboard() {
  const [data, setData] = useState<CashierBootstrap>();
  const [view, setView] = useState<View>("tables");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [online, setOnline] = useState(false);
  const [lastSync, setLastSync] = useState<number>();
  const [now, setNow] = useState(0);
  const reconciliationIntervalSeconds =
    data?.settings.reconciliationIntervalSeconds;

  const refresh = useCallback(async () => {
    try {
      const response = await fetch("/api/cashier", { cache: "no-store" });
      const body = (await response.json()) as CashierBootstrap & {
        error?: string;
      };
      if (!response.ok) throw new Error(body.error);
      setData(body);
      setOnline(true);
      setLastSync(Date.parse(body.serverTime));
      setNow(Date.parse(body.serverTime));
      setError("");
    } catch (caught) {
      setOnline(false);
      setError(caught instanceof Error ? caught.message : "Sin conexión.");
    }
  }, []);

  useEffect(() => {
    const initial = window.setTimeout(() => void refresh(), 0);
    const clock = window.setInterval(() => {
      setNow((current) => current + 1000);
    }, 1000);
    return () => {
      window.clearTimeout(initial);
      window.clearInterval(clock);
    };
  }, [refresh]);

  useEffect(() => {
    if (!reconciliationIntervalSeconds) return;
    const polling = window.setInterval(
      () => void refresh(),
      reconciliationIntervalSeconds * 1000,
    );
    const events = new EventSource("/api/cashier/events");
    const onEvent = () => void refresh();
    events.onopen = () => setOnline(true);
    events.onerror = () => setOnline(false);
    for (const event of [
      "connected",
      "heartbeat",
      "exception",
      "refund",
      "shift",
      "table",
      "ticket",
      "settlement",
    ]) {
      events.addEventListener(event, onEvent);
    }
    return () => {
      window.clearInterval(polling);
      events.close();
    };
  }, [reconciliationIntervalSeconds, refresh]);

  async function mutate(mutation: CashierMutation) {
    setBusy(true);
    setError("");
    try {
      const response = await fetch("/api/cashier", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(mutation),
      });
      const body = (await response.json()) as
        { bootstrap?: CashierBootstrap; error?: string } | CashierBootstrap;
      if (!response.ok) {
        throw new Error(
          "error" in body && body.error
            ? body.error
            : "No pudimos completar la acción.",
        );
      }
      const bootstrap =
        "bootstrap" in body && body.bootstrap ? body.bootstrap : undefined;
      if (bootstrap) {
        setData(bootstrap);
        setLastSync(Date.parse(bootstrap.serverTime));
        setNow(Date.parse(bootstrap.serverTime));
      } else {
        await refresh();
      }
    } catch (caught) {
      setError(
        caught instanceof Error
          ? caught.message
          : "No pudimos completar la acción.",
      );
      await refresh();
    } finally {
      setBusy(false);
    }
  }

  async function requestRefund(paymentId: string, remainingClp: number) {
    const rawAmount = window.prompt(
      `Monto a reembolsar en CLP (máximo ${remainingClp}):`,
      String(remainingClp),
    );
    if (!rawAmount) return;
    const amountClp = Number(rawAmount.replace(/\D/g, ""));
    const reason = window.prompt(
      "Motivo obligatorio. Esta acción quedará auditada:",
    );
    if (!reason?.trim()) return;
    await mutate({
      action: "refund.request",
      paymentId,
      amountClp,
      idempotencyKey: `cashier:${paymentId}:${amountClp}:${Date.now()}`,
      reason: reason ?? undefined,
    });
  }

  async function transition(
    exception: CashierException,
    action: "start_review" | "escalate" | "resolve_investigated",
  ) {
    const reason =
      action === "start_review"
        ? undefined
        : window.prompt("Motivo obligatorio para esta decisión:");
    if (action !== "start_review" && !reason?.trim()) return;
    await mutate({
      action: "exception.transition",
      exceptionId: exception.id,
      expectedVersion: exception.version,
      transition: action,
      reason: reason ?? undefined,
    });
  }

  async function produce(exception: CashierException) {
    const reason = window.prompt(
      "Confirma por qué se producirá manualmente. Se volverá a comprobar el stock:",
    );
    if (!reason?.trim()) return;
    await mutate({
      action: "exception.produce",
      exceptionId: exception.id,
      expectedVersion: exception.version,
      reason,
    });
  }

  async function retryTaxDocument(taxDocumentId: string) {
    const reason = window.prompt(
      "Motivo del reintento de la boleta (quedará auditado):",
      "Reintento manual desde caja",
    );
    if (!reason?.trim()) return;
    await mutate({ action: "tax.retry", taxDocumentId, reason });
  }

  async function closeShift() {
    if (!data?.shift) return;
    const cashText = window.prompt("Efectivo contado en caja (CLP):", "0");
    if (cashText === null) return;
    const cashDeclaredClp = Number(cashText.replace(/\D/g, "")) || 0;
    const exceptionOverrideReason =
      data.metrics.openExceptionCount > 0
        ? window.prompt(
            `Hay ${data.metrics.openExceptionCount} excepciones abiertas. Explica por qué cierras igual:`,
          )
        : undefined;
    if (
      data.metrics.openExceptionCount > 0 &&
      !exceptionOverrideReason?.trim()
    ) {
      setError("Debes justificar el cierre con excepciones abiertas.");
      return;
    }
    await mutate({
      action: "shift.close",
      expectedVersion: data.shift.version,
      cashDeclaredClp,
      exceptionOverrideReason: exceptionOverrideReason ?? undefined,
    });
  }

  async function restoreStamp(profileId: string) {
    const reason = window.prompt(
      "Motivo obligatorio de la restitución. Quedará asociado a tu usuario en auditoría:",
    );
    if (!reason?.trim()) return;
    await mutate({
      action: "loyalty.adjust",
      profileId,
      stampDelta: 1,
      reason,
    });
  }

  const critical = useMemo(
    () =>
      data?.exceptions.filter(
        (exception) => exception.priority === "critical",
      ) ?? [],
    [data?.exceptions],
  );
  const staleSeconds = lastSync
    ? Math.floor((now - lastSync) / 1000)
    : Infinity;
  const stale =
    !online || staleSeconds > (data?.settings.warningAfterSeconds ?? 75);

  if (!data) {
    return (
      <main className="cashierShell">
        <p>Cargando caja…</p>
      </main>
    );
  }

  return (
    <main className="cashierShell">
      <header className="cashierHeader">
        <div>
          <p className="cashierDemoFlag">MODO DEMO · NO MUEVE DINERO REAL</p>
          <h1>Caja · {data.venue.name}</h1>
          <p>
            {data.shift
              ? `Turno abierto ${elapsed(data.shift.openedAt, now)}`
              : "Turno cerrado"}
            {" · "}
            Cajera: {data.actor.name}
          </p>
        </div>
        <div
          className={`cashierConnection ${stale ? "cashierConnectionBad" : ""}`}
          aria-live="polite"
        >
          <strong>{stale ? "PANTALLA DESACTUALIZADA" : "Conectado"}</strong>
          <span>
            {lastSync
              ? `actualizado ${elapsed(new Date(lastSync).toISOString(), now)}`
              : "sin sincronizar"}
          </span>
        </div>
      </header>

      {error ? (
        <div className="cashierError" role="alert">
          {error}
        </div>
      ) : null}

      {critical.length ? (
        <section className="cashierCritical" aria-label="Excepciones críticas">
          <div>
            <p className="eyebrow">ACCIÓN INMEDIATA</p>
            <h2>
              {critical.length} excepción{critical.length === 1 ? "" : "es"}{" "}
              crítica
              {critical.length === 1 ? "" : "s"}
            </h2>
            <p>
              Hay dinero de clientes que requiere una decisión. No esperes al
              cierre.
            </p>
          </div>
          <button type="button" onClick={() => setView("exceptions")}>
            Revisar ahora
          </button>
        </section>
      ) : null}

      {data.taxOperations.requiresAttention ||
      data.taxOperations.providerStatus === "down" ||
      data.taxOperations.providerStatus === "degraded" ? (
        <section className="cashierTaxAlert" role="alert">
          <div>
            <p className="eyebrow">PROVEEDOR DTE</p>
            <h2>
              {data.taxOperations.providerStatus === "down"
                ? "Caído"
                : data.taxOperations.providerStatus === "degraded"
                  ? "Degradado"
                  : "Acumulación de boletas"}
            </h2>
            <p>
              {data.taxOperations.pendingCount} documentos pendientes ·{" "}
              {Math.round(data.taxOperations.recentFailureRate * 100)}% de
              fallos recientes. Los pagos y pedidos siguen funcionando.
            </p>
          </div>
          <button type="button" onClick={() => setView("reconciliation")}>
            Revisar tributación
          </button>
        </section>
      ) : null}

      <section className="cashierMetrics" aria-label="Métricas del turno">
        <article>
          <span>Ventas procesadas</span>
          <strong>{money(data.metrics.grossSalesClp)}</strong>
        </article>
        <article>
          <span>Pedidos</span>
          <strong>{data.metrics.orderCount}</strong>
        </article>
        <article>
          <span>Ticket promedio</span>
          <strong>{money(data.metrics.averageTicketClp)}</strong>
        </article>
        <article>
          <span>Propinas</span>
          <strong>{money(data.metrics.tipEarnedClp)}</strong>
        </article>
      </section>

      {data.tableCredit?.enabled ? (
        <section className="cashierCreditAlert" aria-label="Crédito de mesa">
          <div>
            <p className="eyebrow">MODO EXCEPCIÓN · RIESGO FINANCIERO</p>
            <h2>Crédito de mesa: {money(data.tableCredit.openExposureClp)}</h2>
            {data.tableCredit.accounts.map((account) => (
              <p key={account.id}>
                <strong>{account.tableName}</strong> ·{" "}
                {money(account.prepaidByAppClp)} pagados por app ·{" "}
                <strong>{money(account.outstandingClp)} en crédito</strong>
                {account.status === "bill_requested"
                  ? " · CUENTA SOLICITADA"
                  : account.status === "expired"
                    ? " · VENCIDA"
                    : ""}
              </p>
            ))}
          </div>
          <a href="/credito">Administrar crédito</a>
        </section>
      ) : null}

      <nav className="cashierTabs" aria-label="Secciones de caja">
        {(
          [
            ["tables", "Mesas"],
            ["exceptions", `Excepciones (${data.exceptions.length})`],
            ["reconciliation", "Conciliación"],
            ["loyalty", "Sellos"],
            ["close", "Cierre"],
          ] as const
        ).map(([id, label]) => (
          <button
            className={view === id ? "cashierTabActive" : ""}
            key={id}
            onClick={() => setView(id)}
            type="button"
          >
            {label}
          </button>
        ))}
      </nav>

      {view === "tables" ? (
        <section className="cashierTableGrid" aria-label="Mesas en vivo">
          {data.tables.map((table) => (
            <article
              className={`cashierTableCard cashierTable-${table.state}`}
              key={table.id}
            >
              <div className="cashierTableTitle">
                <div>
                  <h2>{table.name}</h2>
                  {table.groupLabel ? <span>{table.groupLabel}</span> : null}
                </div>
                <strong>{tableState[table.state]}</strong>
              </div>
              {table.sessionId ? (
                <>
                  {data.tableCredit?.accounts
                    .filter((account) => account.tableName === table.name)
                    .map((account) => (
                      <div className="cashierTableCredit" key={account.id}>
                        <strong>CRÉDITO · NO PAGADO</strong>
                        <span>
                          {money(account.prepaidByAppClp)} app ·{" "}
                          {money(account.outstandingClp)} crédito
                        </span>
                      </div>
                    ))}
                  <p>
                    Sesión activa · {table.peopleCount} personas ·{" "}
                    {table.orderCount} pedidos
                  </p>
                  <p className="cashierTableAmount">
                    {money(table.processedClp)} procesados
                  </p>
                  <div className="cashierTableCounts">
                    <span>{table.preparingCount} preparando</span>
                    <span>{table.readyCount} listo</span>
                    <span>{table.attentionCount} requiere atención</span>
                  </div>
                  <footer>
                    <span>{elapsed(table.lastActivityAt, now)}</span>
                    <span>Garzón: {table.waiterName ?? "Sin asignar"}</span>
                  </footer>
                </>
              ) : (
                <p>Sin sesión activa.</p>
              )}
            </article>
          ))}
        </section>
      ) : null}

      {view === "exceptions" ? (
        <section className="cashierExceptionList">
          <div className="cashierSectionHeader">
            <div>
              <p className="eyebrow">NO SE PUEDEN IGNORAR</p>
              <h2>Excepciones financieras</h2>
            </div>
            <a href="/api/cashier?export=exceptions">Exportar CSV</a>
          </div>
          {data.exceptions.map((exception) => (
            <article
              className={`cashierExceptionCard cashierException-${exception.priority}`}
              data-exception-type={exception.type}
              key={exception.id}
            >
              <div className="cashierExceptionTop">
                <div>
                  <span>{exception.priority.toUpperCase()}</span>
                  <h3>{exception.message}</h3>
                  <p>
                    {[exception.tableName, exception.personLabel]
                      .filter(Boolean)
                      .join(" · ") || "Sin mesa asignada"}
                  </p>
                </div>
                <strong>{money(exception.amountClp)}</strong>
              </div>
              {exception.providerApprovedAt ? (
                <div className="cashierTimestamps">
                  <span>
                    Proveedor:{" "}
                    {new Date(exception.providerApprovedAt).toLocaleTimeString(
                      "es-CL",
                    )}
                  </span>
                  <span>
                    Recepción:{" "}
                    {exception.providerReceivedAt
                      ? new Date(
                          exception.providerReceivedAt,
                        ).toLocaleTimeString("es-CL")
                      : "sin dato"}
                  </span>
                  <strong>{approvalElapsed(exception)}</strong>
                </div>
              ) : null}
              {exception.type === "approved_after_quote_expired" ? (
                <p
                  className={
                    exception.manualProductionAvailable
                      ? "cashierManualOpen"
                      : "cashierManualClosed"
                  }
                >
                  {exception.manualProductionAvailable
                    ? "Producción manual disponible dentro de la ventana de 20 minutos."
                    : "Ventana vencida: sólo reembolsar o escalar."}
                </p>
              ) : null}
              <div className="cashierExceptionActions">
                {exception.status === "open" ? (
                  <button
                    disabled={busy}
                    onClick={() => void transition(exception, "start_review")}
                    type="button"
                  >
                    Tomar revisión
                  </button>
                ) : null}
                {exception.paymentId &&
                exception.resolutionOptions.includes("refund") ? (
                  <button
                    className="cashierDangerButton"
                    disabled={busy || !data.actor.canRefund}
                    onClick={() =>
                      void requestRefund(
                        exception.paymentId!,
                        exception.amountClp,
                      )
                    }
                    type="button"
                  >
                    Reembolsar
                  </button>
                ) : null}
                {exception.resolutionOptions.includes("produce_manually") ? (
                  <button
                    disabled={busy || !exception.manualProductionAvailable}
                    onClick={() => void produce(exception)}
                    type="button"
                  >
                    Producir manualmente
                  </button>
                ) : null}
                <button
                  disabled={busy}
                  onClick={() => void transition(exception, "escalate")}
                  type="button"
                >
                  Escalar
                </button>
                {exception.resolutionOptions.includes("investigate") ? (
                  <button
                    disabled={busy}
                    onClick={() =>
                      void transition(exception, "resolve_investigated")
                    }
                    type="button"
                  >
                    Resolver investigación
                  </button>
                ) : null}
              </div>
            </article>
          ))}
          {!data.exceptions.length ? (
            <p className="cashierEmpty">No hay excepciones abiertas.</p>
          ) : null}
        </section>
      ) : null}

      {view === "reconciliation" ? (
        <section>
          <div className="cashierSectionHeader">
            <div>
              <p className="eyebrow">CADA PESO RASTREADO</p>
              <h2>Pedidos ↔ pasarela ↔ tributación</h2>
            </div>
            <span>Datos sintéticos</span>
          </div>
          <div className="cashierReconciliationWrap">
            <table className="cashierReconciliation">
              <thead>
                <tr>
                  <th>Pedido Tablio</th>
                  <th>Transacción pasarela</th>
                  <th>Comisión</th>
                  <th>Abono</th>
                  <th>Documento tributario</th>
                  <th>Estado</th>
                </tr>
              </thead>
              <tbody>
                {data.reconciliation.map((line) => (
                  <tr key={line.paymentId}>
                    <td>
                      <strong>
                        {line.orderNumber
                          ? `#${line.orderNumber}`
                          : "Sin pedido"}
                      </strong>
                      <span>{money(line.tablioSaleClp)}</span>
                      <small>
                        {line.tableName} · {line.personLabel}
                      </small>
                    </td>
                    <td>
                      <strong>{line.providerPaymentId}</strong>
                      <span>
                        {line.providerGrossClp === undefined
                          ? "Pendiente"
                          : money(line.providerGrossClp)}
                      </span>
                    </td>
                    <td>{money(line.providerFeeClp)}</td>
                    <td>
                      {line.depositedClp === undefined
                        ? "Pendiente"
                        : money(line.depositedClp)}
                      <small>{line.depositReference ?? ""}</small>
                    </td>
                    <td>
                      <strong>
                        {line.taxDocumentStatus === "issued"
                          ? `Emitida · ${line.taxFolio}`
                          : line.taxDocumentStatus === "voucher"
                            ? "Voucher electrónico"
                            : line.taxDocumentStatus === "failed"
                              ? "Fallida"
                              : "Pendiente"}
                      </strong>
                      {line.taxDocumentAmountClp !== undefined ? (
                        <span>{money(line.taxDocumentAmountClp)}</span>
                      ) : null}
                      {line.taxRepresentationUrl ? (
                        <a
                          href={line.taxRepresentationUrl}
                          rel="noreferrer"
                          target="_blank"
                        >
                          Ver documento
                        </a>
                      ) : null}
                      {line.taxDocumentStatus === "failed" &&
                      line.taxDocumentId ? (
                        <button
                          disabled={busy}
                          onClick={() =>
                            void retryTaxDocument(line.taxDocumentId!)
                          }
                          type="button"
                        >
                          Reintentar
                        </button>
                      ) : null}
                    </td>
                    <td>
                      <span className={`cashierRecon-${line.status}`}>
                        {line.status === "matched"
                          ? "Cuadra"
                          : line.status === "difference"
                            ? "Diferencia"
                            : "Pendiente"}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      ) : null}

      {view === "loyalty" ? (
        <section className="cashierLoyalty">
          <div className="cashierSectionHeader">
            <div>
              <p className="eyebrow">RECUPERACIÓN ASISTIDA Y AUDITADA</p>
              <h2>Sellos de clientes</h2>
            </div>
            <span>
              Pérdida de identidad:{" "}
              {data.loyalty.identityLossRatePercent.toLocaleString("es-CL")}%
            </span>
          </div>
          <p>
            El cliente puede recuperar solo con teléfono o correo. Usa esta vía
            únicamente si reclama en el mostrador; nunca pide ni muestra su
            nombre completo.
          </p>
          <div className="cashierLoyaltyGrid">
            {data.loyalty.profiles.map((profile) => (
              <article key={profile.id}>
                <div>
                  <strong>{profile.maskedIdentity}</strong>
                  <span>{profile.contactMasked}</span>
                  <b>{profile.stamps} sellos</b>
                </div>
                <button
                  disabled={busy}
                  onClick={() => void restoreStamp(profile.id)}
                >
                  Restituir 1 sello
                </button>
              </article>
            ))}
          </div>
          {data.loyalty.profiles.length === 0 ? (
            <p className="cashierEmpty">
              Aún no hay perfiles activos en este local.
            </p>
          ) : null}
        </section>
      ) : null}

      {view === "close" ? (
        <section className="cashierClose">
          <div className="cashierSectionHeader">
            <div>
              <p className="eyebrow">RESULTADO DEL TURNO</p>
              <h2>Cierre y arqueo</h2>
            </div>
          </div>
          {data.shift ? (
            <article className="cashierCloseCard">
              <p>
                El servidor calculará y congelará venta bruta − reembolsos −
                contracargos − comisión. Ninguna cifra se edita después.
              </p>
              {data.metrics.openExceptionCount ? (
                <div className="cashierCloseWarning">
                  Hay {data.metrics.openExceptionCount} excepciones abiertas.
                  Para cerrar igual debes justificarlo y quedará auditado.
                </div>
              ) : null}
              {data.tableCredit?.currentShiftLossClp ? (
                <div className="cashierCloseWarning">
                  Fuga de crédito de mesa:{" "}
                  <strong>{money(data.tableCredit.currentShiftLossClp)}</strong>{" "}
                  en {data.tableCredit.currentShiftLossCount}{" "}
                  {data.tableCredit.currentShiftLossCount === 1
                    ? "mesa"
                    : "mesas"}
                  . Quedará congelada aparte de los pagos cobrados.
                </div>
              ) : null}
              <button
                className="cashierCloseButton"
                disabled={busy || !data.actor.canClose}
                onClick={() => void closeShift()}
                type="button"
              >
                Ejecutar cierre inmutable
              </button>
            </article>
          ) : (
            <p className="cashierEmpty">El turno ya está cerrado.</p>
          )}
          {data.latestClosure ? (
            <article className="cashierClosureResult">
              <header>
                <div>
                  <p className="eyebrow">CIERRE CONGELADO</p>
                  <h3>
                    {new Date(data.latestClosure.closedAt).toLocaleString(
                      "es-CL",
                    )}
                  </h3>
                </div>
                <a href="/api/cashier?export=closure">Descargar CSV</a>
              </header>
              <dl>
                <div>
                  <dt>Venta bruta</dt>
                  <dd>{money(data.latestClosure.grossSalesClp)}</dd>
                </div>
                <div>
                  <dt>Reembolsos</dt>
                  <dd>− {money(data.latestClosure.refundsClp)}</dd>
                </div>
                <div>
                  <dt>Contracargos</dt>
                  <dd>− {money(data.latestClosure.chargebacksClp)}</dd>
                </div>
                <div>
                  <dt>Comisión proveedor</dt>
                  <dd>− {money(data.latestClosure.providerFeesClp)}</dd>
                </div>
                <div className="cashierPayout">
                  <dt>Abono esperado</dt>
                  <dd>{money(data.latestClosure.expectedPayoutClp)}</dd>
                </div>
              </dl>
              <h4>Propinas por garzón</h4>
              {data.latestClosure.tipsByWaiter.map((tip) => (
                <p key={tip.waiterName}>
                  {tip.waiterName}: {money(tip.distributableClp)}
                </p>
              ))}
              {data.latestClosure.localTipAdjustmentsClp ? (
                <div className="cashierLocalAdjustment">
                  Ajuste a cargo del local por propina ya distribuida:{" "}
                  <strong>
                    {money(data.latestClosure.localTipAdjustmentsClp)}
                  </strong>
                </div>
              ) : null}
              {data.tableCredit?.currentShiftLossClp ? (
                <div className="cashierLocalAdjustment">
                  Fuga de crédito de mesa registrada en este cierre:{" "}
                  <strong>{money(data.tableCredit.currentShiftLossClp)}</strong>
                </div>
              ) : null}
            </article>
          ) : null}
        </section>
      ) : null}
    </main>
  );
}
