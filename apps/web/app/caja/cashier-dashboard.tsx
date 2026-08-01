"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { AppShell, AppShellLoading } from "@/components/operational/app-shell";
import { ownerNavigation } from "@/components/operational/owner-navigation";
import { Alert } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { DownloadIcon, RefreshIcon, WarningIcon } from "@/components/ui/icons";
import { formatClp, formatDateTime, formatDuration, formatTime } from "@/lib/format";
import type {
  CashierBootstrap,
  CashierException,
  CashierMutation,
} from "@/lib/cashier-contract";
import {
  cashierTableStatusDictionary,
  exceptionPriorityDictionary,
  exceptionStatusDictionary,
  reconciliationStatusDictionary,
  storedValueAccountStatusDictionary,
  tableCreditAccountStatusDictionary,
  taxDocumentStatusDictionary,
  taxProviderStatusDictionary,
} from "@/lib/ui-statuses";

type View =
  | "tables"
  | "exceptions"
  | "reconciliation"
  | "loyalty"
  | "stored_value"
  | "close";

const navItems = ownerNavigation("cashier");

const tabs: readonly { id: View; label: (data: CashierBootstrap) => string }[] = [
  { id: "tables", label: () => "Mesas" },
  {
    id: "exceptions",
    label: (data) => `Excepciones (${data.exceptions.length})`,
  },
  { id: "reconciliation", label: () => "Conciliación" },
  { id: "loyalty", label: () => "Sellos" },
  { id: "stored_value", label: () => "Saldo" },
  { id: "close", label: () => "Cierre" },
];

function activitySince(value: string | undefined, nowMs: number) {
  if (!value) return "sin actividad";
  const seconds = Math.max(0, Math.round((nowMs - Date.parse(value)) / 1000));
  return `hace ${formatDuration(seconds)}`;
}

function approvalElapsed(exception: CashierException) {
  const seconds = exception.secondsSinceApproval;
  if (seconds === undefined) return "";
  return `${formatDuration(seconds)} desde la aprobación`;
}

function SectionHeading({ eyebrow, title }: { eyebrow: string; title: string }) {
  return (
    <div className="space-y-1">
      <p className="text-label uppercase tracking-wide text-muted-foreground">
        {eyebrow}
      </p>
      <h2 className="text-h2 text-foreground">{title}</h2>
    </div>
  );
}

function MetricCard({ label, value }: { label: string; value: string }) {
  return (
    <Card>
      <CardContent className="space-y-1 py-6">
        <p className="text-label uppercase tracking-wide text-muted-foreground">
          {label}
        </p>
        <p className="text-h2 text-foreground">{value}</p>
      </CardContent>
    </Card>
  );
}

function ConnectionStatus({
  lastSync,
  now,
  stale,
}: {
  lastSync?: number;
  now: number;
  stale: boolean;
}) {
  return (
    <div className="flex items-center gap-3 rounded-surface-lg border border-border bg-card px-4 py-3" aria-live="polite">
      <Badge variant={stale ? "danger" : "success"}>
        {stale ? "Pantalla desactualizada" : "Conectado"}
      </Badge>
      <span className="text-small text-muted-foreground">
        {lastSync
          ? activitySince(new Date(lastSync).toISOString(), now)
          : "sin sincronizar"}
      </span>
    </div>
  );
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
        | { bootstrap?: CashierBootstrap; error?: string }
        | CashierBootstrap;
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

  async function adjustStoredValue(profileId: string) {
    const raw = window.prompt(
      "Ajuste CLP. Usa negativo para descontar:",
      "1000",
    );
    if (!raw) return;
    const deltaClp = Number(raw.replace(/[^\d-]/g, ""));
    const reason = window.prompt(
      "Motivo obligatorio. El ajuste quedará auditado:",
    );
    if (!reason?.trim() || !deltaClp) return;
    await mutate({
      action: "stored_value.adjust",
      profileId,
      bucket: "loaded_money",
      deltaClp,
      reason,
      idempotencyKey: `cashier:stored-value:${profileId}:${crypto.randomUUID()}`,
    });
  }

  async function refundStoredValueTopUp(receiptId: string) {
    const reason = window.prompt(
      "Motivo obligatorio de devolución de la recarga no consumida:",
    );
    if (!reason?.trim()) return;
    await mutate({
      action: "stored_value.topup_refund",
      receiptId,
      reason,
      idempotencyKey: `cashier:stored-value-refund:${receiptId}`,
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
      data?.exceptions.filter((exception) => exception.priority === "critical") ??
      [],
    [data?.exceptions],
  );
  const staleSeconds = lastSync ? Math.floor((now - lastSync) / 1000) : Infinity;
  const stale = !online || staleSeconds > (data?.settings.warningAfterSeconds ?? 75);

  if (!data && !error) return <AppShellLoading navItems={navItems} />;

  if (!data) {
    return (
      <AppShell
        banner="Modo demo · no mueve dinero real"
        branchName="Sucursal principal"
        navItems={navItems}
        tenantName="Tu bar"
      >
        <Alert className="space-y-4" tone="danger">
          <h1 className="text-h2">No pudimos cargar caja</h1>
          <p>{error}</p>
          <Button onClick={() => void refresh()} type="button">
            Volver a intentar
          </Button>
        </Alert>
      </AppShell>
    );
  }

  return (
    <AppShell
      banner="Modo demo · no mueve dinero real"
      branchName={data.shift ? "Turno abierto" : "Turno cerrado"}
      navItems={navItems}
      tenantName={data.venue.name}
    >
      <div className="space-y-6" data-cashier-ready>
        <header className="flex flex-col gap-6 lg:flex-row lg:items-start lg:justify-between">
          <div className="space-y-2">
            <h1 className="text-h1 tracking-tight lg:text-h1-lg">
              Caja · {data.venue.name}
            </h1>
            <p className="text-body text-muted-foreground">
              {data.shift
                ? `Turno abierto ${activitySince(data.shift.openedAt, now)}`
                : "Turno cerrado"}{" "}
              · Cajera: {data.actor.name}
            </p>
          </div>
          <div className="flex flex-col items-start gap-3 sm:flex-row sm:items-center">
            <ConnectionStatus lastSync={lastSync} now={now} stale={stale} />
            <Button onClick={() => void refresh()} type="button" variant="outline">
              <RefreshIcon aria-hidden="true" />
              Actualizar
            </Button>
          </div>
        </header>

        {error ? <Alert tone="danger">{error}</Alert> : null}

        {critical.length ? (
          <Alert
            className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between"
            tone="danger"
          >
            <div className="flex gap-3">
              <WarningIcon
                aria-hidden="true"
                className="size-icon shrink-0 text-destructive"
              />
              <div>
                <p className="text-label uppercase tracking-wide">
                  Acción inmediata
                </p>
                <p className="text-h3">
                  {critical.length}{" "}
                  {critical.length === 1 ? "excepción" : "excepciones"} crítica
                  {critical.length === 1 ? "" : "s"}
                </p>
                <p className="text-small">
                  Hay dinero de clientes que requiere una decisión. No esperes al
                  cierre.
                </p>
              </div>
            </div>
            <Button onClick={() => setView("exceptions")} type="button" variant="destructive">
              Revisar ahora
            </Button>
          </Alert>
        ) : null}

        {data.taxOperations.requiresAttention ||
        data.taxOperations.providerStatus === "down" ||
        data.taxOperations.providerStatus === "degraded" ? (
          <Alert
            className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between"
            role="alert"
            tone={
              data.taxOperations.providerStatus === "down" ? "danger" : "warning"
            }
          >
            <div>
              <p className="text-label uppercase tracking-wide">
                Proveedor DTE
              </p>
              <h2 className="text-h2">
                {taxProviderStatusDictionary[data.taxOperations.providerStatus]
                  .label}
              </h2>
              <p className="text-small">
                {data.taxOperations.pendingCount} documentos pendientes ·{" "}
                {Math.round(data.taxOperations.recentFailureRate * 100)}% de
                fallos recientes. Los pagos y pedidos siguen funcionando.
              </p>
            </div>
            <Button onClick={() => setView("reconciliation")} type="button" variant="outline">
              Revisar tributación
            </Button>
          </Alert>
        ) : null}

        <section aria-label="Métricas del turno" className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <MetricCard label="Ventas procesadas" value={formatClp(data.metrics.grossSalesClp)} />
          <MetricCard label="Pedidos" value={String(data.metrics.orderCount)} />
          <MetricCard label="Ticket promedio" value={formatClp(data.metrics.averageTicketClp)} />
          <MetricCard label="Propinas" value={formatClp(data.metrics.tipEarnedClp)} />
        </section>

        {data.tableCredit?.enabled ? (
          <Alert className="space-y-3" tone="warning">
            <div>
              <p className="text-label uppercase tracking-wide">
                Modo excepción · riesgo financiero
              </p>
              <h2 className="text-h2">
                Crédito de mesa: {formatClp(data.tableCredit.openExposureClp)}
              </h2>
            </div>
            <div className="space-y-2">
              {data.tableCredit.accounts.map((account) => {
                const state = tableCreditAccountStatusDictionary[account.status];
                return (
                  <div
                    className="flex flex-wrap items-center gap-2 text-small"
                    key={account.id}
                  >
                    <p>
                      <strong>{account.tableName}</strong> ·{" "}
                      {formatClp(account.prepaidByAppClp)} pagados por app ·{" "}
                      <strong>
                        {formatClp(account.outstandingClp)} en crédito
                      </strong>
                    </p>
                    {account.status !== "open" ? (
                      <Badge variant={state.tone}>{state.label}</Badge>
                    ) : null}
                  </div>
                );
              })}
            </div>
            <Button asChild variant="outline">
              <a href="/credito">Administrar crédito</a>
            </Button>
          </Alert>
        ) : null}

        <nav
          aria-label="Secciones de caja"
          className="flex gap-2 overflow-x-auto pb-1"
        >
          {tabs.map((tab) => (
            <Button
              className="shrink-0"
              key={tab.id}
              onClick={() => setView(tab.id)}
              type="button"
              variant={view === tab.id ? "primary" : "outline"}
            >
              {tab.label(data)}
            </Button>
          ))}
        </nav>

        {view === "tables" ? (
          <section aria-label="Mesas en vivo" className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
            {data.tables.map((table) => {
              const state = cashierTableStatusDictionary[table.state];
              const credit = data.tableCredit?.accounts.filter(
                (account) => account.tableName === table.name,
              );
              return (
                <Card className="flex flex-col" key={table.id} role="article">
                  <CardHeader className="flex-row items-start justify-between gap-4">
                    <div>
                      <CardTitle>{table.name}</CardTitle>
                      {table.groupLabel ? (
                        <p className="text-small text-muted-foreground">
                          {table.groupLabel}
                        </p>
                      ) : null}
                    </div>
                    <Badge variant={state.tone}>{state.label}</Badge>
                  </CardHeader>
                  <CardContent className="flex flex-1 flex-col gap-3">
                    {table.sessionId ? (
                      <>
                        {credit?.map((account) => (
                          <Alert className="space-y-1 p-3 text-small" key={account.id} tone="warning">
                            <p className="text-label uppercase tracking-wide">
                              Crédito · no pagado
                            </p>
                            <p>
                              {formatClp(account.prepaidByAppClp)} app ·{" "}
                              {formatClp(account.outstandingClp)} crédito
                            </p>
                          </Alert>
                        ))}
                        <p className="text-small text-muted-foreground">
                          Sesión activa · {table.peopleCount} personas ·{" "}
                          {table.orderCount} pedidos
                        </p>
                        <p className="text-h3">
                          {formatClp(table.processedClp)} procesados
                        </p>
                        <div className="flex flex-wrap gap-3 text-small text-muted-foreground">
                          <span>{table.preparingCount} preparando</span>
                          <span>{table.readyCount} listo</span>
                          <span>{table.attentionCount} requiere atención</span>
                        </div>
                        <div className="mt-auto flex items-center justify-between border-t border-border pt-3 text-small text-muted-foreground">
                          <span>{activitySince(table.lastActivityAt, now)}</span>
                          <span>Garzón: {table.waiterName ?? "Sin asignar"}</span>
                        </div>
                      </>
                    ) : (
                      <p className="text-small text-muted-foreground">
                        Sin sesión activa.
                      </p>
                    )}
                  </CardContent>
                </Card>
              );
            })}
          </section>
        ) : null}

        {view === "exceptions" ? (
          <section className="space-y-4">
            <div className="flex flex-wrap items-center justify-between gap-4">
              <SectionHeading eyebrow="No se pueden ignorar" title="Excepciones financieras" />
              <Button asChild variant="outline">
                <a href="/api/cashier?export=exceptions">
                  <DownloadIcon aria-hidden="true" />
                  Exportar CSV
                </a>
              </Button>
            </div>
            {data.exceptions.map((exception) => {
              const priority = exceptionPriorityDictionary[exception.priority];
              const status = exceptionStatusDictionary[exception.status];
              return (
                <Card data-exception-type={exception.type} key={exception.id}>
                  <CardContent className="space-y-4 py-6">
                    <div className="flex flex-wrap items-start justify-between gap-4">
                      <div className="space-y-2">
                        <div className="flex flex-wrap gap-2">
                          <Badge variant={priority.tone}>{priority.label}</Badge>
                          <Badge variant={status.tone}>{status.label}</Badge>
                        </div>
                        <h3 className="text-h3">{exception.message}</h3>
                        <p className="text-small text-muted-foreground">
                          {[exception.tableName, exception.personLabel]
                            .filter(Boolean)
                            .join(" · ") || "Sin mesa asignada"}
                        </p>
                      </div>
                      <strong className="text-h2">
                        {formatClp(exception.amountClp)}
                      </strong>
                    </div>
                    {exception.providerApprovedAt ? (
                      <div className="flex flex-wrap gap-x-4 gap-y-1 text-small text-muted-foreground">
                        <span>
                          Proveedor: {formatTime(exception.providerApprovedAt)}
                        </span>
                        <span>
                          Recepción:{" "}
                          {exception.providerReceivedAt
                            ? formatTime(exception.providerReceivedAt)
                            : "sin dato"}
                        </span>
                        <strong className="text-foreground">
                          {approvalElapsed(exception)}
                        </strong>
                      </div>
                    ) : null}
                    {exception.type === "approved_after_quote_expired" ? (
                      <Alert
                        tone={exception.manualProductionAvailable ? "info" : "warning"}
                      >
                        {exception.manualProductionAvailable
                          ? "Producción manual disponible dentro de la ventana de 20 minutos."
                          : "Ventana vencida: sólo reembolsar o escalar."}
                      </Alert>
                    ) : null}
                    <div className="flex flex-wrap gap-2">
                      {exception.status === "open" ? (
                        <Button
                          disabled={busy}
                          onClick={() => void transition(exception, "start_review")}
                          type="button"
                          variant="outline"
                        >
                          Tomar revisión
                        </Button>
                      ) : null}
                      {exception.paymentId &&
                      exception.resolutionOptions.includes("refund") ? (
                        <Button
                          disabled={busy || !data.actor.canRefund}
                          onClick={() =>
                            void requestRefund(
                              exception.paymentId!,
                              exception.amountClp,
                            )
                          }
                          type="button"
                          variant="destructive"
                        >
                          Reembolsar
                        </Button>
                      ) : null}
                      {exception.resolutionOptions.includes("produce_manually") ? (
                        <Button
                          disabled={busy || !exception.manualProductionAvailable}
                          onClick={() => void produce(exception)}
                          type="button"
                          variant="outline"
                        >
                          Producir manualmente
                        </Button>
                      ) : null}
                      <Button
                        disabled={busy}
                        onClick={() => void transition(exception, "escalate")}
                        type="button"
                        variant="outline"
                      >
                        Escalar
                      </Button>
                      {exception.resolutionOptions.includes("investigate") ? (
                        <Button
                          disabled={busy}
                          onClick={() =>
                            void transition(exception, "resolve_investigated")
                          }
                          type="button"
                          variant="outline"
                        >
                          Resolver investigación
                        </Button>
                      ) : null}
                    </div>
                  </CardContent>
                </Card>
              );
            })}
            {!data.exceptions.length ? (
              <Card>
                <CardContent className="py-12 text-center text-body text-muted-foreground">
                  No hay excepciones abiertas.
                </CardContent>
              </Card>
            ) : null}
          </section>
        ) : null}

        {view === "reconciliation" ? (
          <section className="space-y-4">
            <SectionHeading eyebrow="Cada peso rastreado" title="Pedidos ↔ pasarela ↔ tributación" />
            <div className="overflow-x-auto rounded-surface-lg border border-border">
              <table className="w-full min-w-[56rem] border-collapse text-small">
                <thead>
                  <tr className="border-b border-border bg-muted">
                    {[
                      "Pedido Tablio",
                      "Transacción pasarela",
                      "Comisión",
                      "Abono",
                      "Documento tributario",
                      "Estado",
                    ].map((heading) => (
                      <th
                        className="px-3 py-2 text-left text-label uppercase tracking-wide text-muted-foreground"
                        key={heading}
                      >
                        {heading}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {data.reconciliation.map((line) => {
                    const status = reconciliationStatusDictionary[line.status];
                    const taxStatus = taxDocumentStatusDictionary[line.taxDocumentStatus];
                    return (
                      <tr className="border-b border-border" key={line.paymentId}>
                        <td className="space-y-1 px-3 py-3 align-top">
                          <p className="font-bold">
                            {line.orderNumber ? `#${line.orderNumber}` : "Sin pedido"}
                          </p>
                          <p>{formatClp(line.tablioSaleClp)}</p>
                          <p className="text-muted-foreground">
                            {line.tableName} · {line.personLabel}
                          </p>
                        </td>
                        <td className="space-y-1 px-3 py-3 align-top">
                          <p className="font-bold">{line.providerPaymentId}</p>
                          <p>
                            {line.providerGrossClp === undefined
                              ? "Pendiente"
                              : formatClp(line.providerGrossClp)}
                          </p>
                        </td>
                        <td className="px-3 py-3 align-top">
                          {formatClp(line.providerFeeClp ?? 0)}
                        </td>
                        <td className="space-y-1 px-3 py-3 align-top">
                          <p>
                            {line.depositedClp === undefined
                              ? "Pendiente"
                              : formatClp(line.depositedClp)}
                          </p>
                          <p className="text-muted-foreground">
                            {line.depositReference ?? ""}
                          </p>
                        </td>
                        <td className="space-y-1 px-3 py-3 align-top">
                          <p className="font-bold">
                            {line.taxDocumentStatus === "issued"
                              ? `${taxStatus.label} · ${line.taxFolio}`
                              : taxStatus.label}
                          </p>
                          {line.taxDocumentAmountClp !== undefined ? (
                            <p>{formatClp(line.taxDocumentAmountClp)}</p>
                          ) : null}
                          {line.taxRepresentationUrl ? (
                            <Button asChild size="small" variant="ghost">
                              <a
                                href={line.taxRepresentationUrl}
                                rel="noreferrer"
                                target="_blank"
                              >
                                Ver documento
                              </a>
                            </Button>
                          ) : null}
                          {line.taxDocumentStatus === "failed" && line.taxDocumentId ? (
                            <Button
                              disabled={busy}
                              onClick={() => void retryTaxDocument(line.taxDocumentId!)}
                              size="small"
                              type="button"
                              variant="outline"
                            >
                              Reintentar
                            </Button>
                          ) : null}
                        </td>
                        <td className="px-3 py-3 align-top">
                          <Badge variant={status.tone}>{status.label}</Badge>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </section>
        ) : null}

        {view === "loyalty" ? (
          <section className="space-y-4">
            <div className="flex flex-wrap items-center justify-between gap-4">
              <SectionHeading eyebrow="Recuperación asistida y auditada" title="Sellos de clientes" />
              <p className="text-small text-muted-foreground">
                Pérdida de identidad:{" "}
                {data.loyalty.identityLossRatePercent.toLocaleString("es-CL")}%
              </p>
            </div>
            <p className="text-body text-muted-foreground">
              El cliente puede recuperar solo con teléfono o correo. Usa esta vía
              únicamente si reclama en el mostrador; nunca pide ni muestra su
              nombre completo.
            </p>
            {data.loyalty.profiles.length ? (
              <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
                {data.loyalty.profiles.map((profile) => (
                  <Card key={profile.id}>
                    <CardContent className="space-y-3 py-6">
                      <div>
                        <p className="text-h3">{profile.maskedIdentity}</p>
                        <p className="text-small text-muted-foreground">
                          {profile.contactMasked}
                        </p>
                      </div>
                      <p className="text-h2">{profile.stamps} sellos</p>
                      <Button
                        disabled={busy}
                        onClick={() => void restoreStamp(profile.id)}
                        type="button"
                        variant="outline"
                      >
                        Restituir 1 sello
                      </Button>
                    </CardContent>
                  </Card>
                ))}
              </div>
            ) : (
              <Card>
                <CardContent className="py-12 text-center text-body text-muted-foreground">
                  Aún no hay perfiles activos en este local.
                </CardContent>
              </Card>
            )}
          </section>
        ) : null}

        {view === "stored_value" ? (
          <section className="space-y-4">
            <div>
              <SectionHeading eyebrow="Obligación del local" title="Saldo de clientes" />
              <p className="text-small text-muted-foreground">
                {formatClp(data.storedValue.liabilityClp)} pendientes. No es caja
                disponible ni venta del turno.
              </p>
            </div>
            <div className="grid gap-4 sm:grid-cols-3">
              <MetricCard label="Entró por recargas" value={formatClp(data.storedValue.topUpsCashInClp)} />
              <MetricCard label="Consumido como venta" value={formatClp(data.storedValue.consumedRevenueClp)} />
              <MetricCard label="Expirado" value={formatClp(data.storedValue.expiredClp)} />
            </div>
            {data.storedValue.accounts.length ? (
              <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
                {data.storedValue.accounts.map((account) => {
                  const state = storedValueAccountStatusDictionary[account.status];
                  return (
                    <Card key={account.id}>
                      <CardContent className="space-y-3 py-6">
                        <div className="flex items-start justify-between gap-3">
                          <p className="text-h3">{account.maskedIdentity}</p>
                          <Badge variant={state.tone}>{state.label}</Badge>
                        </div>
                        <p className="text-small text-muted-foreground">
                          {formatClp(account.loadedMoneyClp)} cargados ·{" "}
                          {formatClp(account.bonusClp)} bono
                        </p>
                        <p className="text-h2">{formatClp(account.balanceClp)}</p>
                        <div className="flex flex-wrap gap-2">
                          <Button
                            disabled={busy}
                            onClick={() => void adjustStoredValue(account.profileId)}
                            type="button"
                            variant="outline"
                          >
                            Ajustar con motivo
                          </Button>
                          {account.latestTopUpReceiptId ? (
                            <Button
                              disabled={busy || !account.latestTopUpRefundable}
                              onClick={() =>
                                void refundStoredValueTopUp(
                                  account.latestTopUpReceiptId!,
                                )
                              }
                              type="button"
                              variant="outline"
                            >
                              {account.latestTopUpRefundable
                                ? "Devolver última recarga"
                                : "Recarga ya consumida"}
                            </Button>
                          ) : null}
                        </div>
                      </CardContent>
                    </Card>
                  );
                })}
              </div>
            ) : (
              <Card>
                <CardContent className="py-12 text-center text-body text-muted-foreground">
                  Aún no hay saldo pendiente.
                </CardContent>
              </Card>
            )}
          </section>
        ) : null}

        {view === "close" ? (
          <section className="space-y-4">
            <SectionHeading eyebrow="Resultado del turno" title="Cierre y arqueo" />

            <Card>
              <CardHeader>
                <CardTitle>Propinas por trabajador y medio de pago</CardTitle>
                <p className="text-small text-muted-foreground">
                  Tablio informa la distribución; no reparte dinero ni cobra
                  comisión sobre propinas.
                </p>
              </CardHeader>
              <CardContent className="space-y-2">
                {data.tipReport.length ? (
                  data.tipReport.map((tip, index) => (
                    <div
                      className="flex items-center justify-between gap-4 border-b border-border py-2 text-small"
                      key={`${tip.workerName}:${tip.paymentMethod}:${index}`}
                    >
                      <span>
                        <strong className="text-foreground">{tip.workerName}</strong>{" "}
                        <span className="text-muted-foreground">
                          {tip.paymentMethod} · {tip.note}
                        </span>
                      </span>
                      <strong>{formatClp(tip.amountClp)}</strong>
                    </div>
                  ))
                ) : (
                  <p className="text-small text-muted-foreground">
                    Aún no hay propinas atribuidas en este turno.
                  </p>
                )}
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>Saldo prepagado · tres cifras separadas</CardTitle>
              </CardHeader>
              <CardContent className="space-y-2 text-body">
                <p>
                  Recargas recibidas:{" "}
                  <strong>{formatClp(data.storedValue.topUpsCashInClp)}</strong>{" "}
                  (obligación creada, no ingreso).
                </p>
                <p>
                  Consumo desde saldo:{" "}
                  <strong>{formatClp(data.storedValue.consumedRevenueClp)}</strong>{" "}
                  (venta reconocida sin efectivo nuevo).
                </p>
                <p>
                  Pasivo acumulado:{" "}
                  <strong>{formatClp(data.storedValue.liabilityClp)}</strong> (nunca
                  caja disponible).
                </p>
              </CardContent>
            </Card>

            {data.shift ? (
              <Card>
                <CardContent className="space-y-4 py-6">
                  <p className="text-body text-muted-foreground">
                    El servidor calculará y congelará venta bruta − reembolsos −
                    contracargos − comisión. Ninguna cifra se edita después.
                  </p>
                  {data.metrics.openExceptionCount ? (
                    <Alert data-testid="cashier-open-exceptions-warning" tone="warning">
                      Hay {data.metrics.openExceptionCount} excepciones abiertas.
                      Para cerrar igual debes justificarlo y quedará auditado.
                    </Alert>
                  ) : null}
                  {data.tableCredit?.currentShiftLossClp ? (
                    <Alert data-testid="cashier-shift-credit-loss" tone="warning">
                      Fuga de crédito de mesa:{" "}
                      <strong>
                        {formatClp(data.tableCredit.currentShiftLossClp)}
                      </strong>{" "}
                      en {data.tableCredit.currentShiftLossCount}{" "}
                      {data.tableCredit.currentShiftLossCount === 1
                        ? "mesa"
                        : "mesas"}
                      . Quedará congelada aparte de los pagos cobrados.
                    </Alert>
                  ) : null}
                  <Button
                    disabled={busy || !data.actor.canClose}
                    onClick={() => void closeShift()}
                    type="button"
                    variant="destructive"
                  >
                    Ejecutar cierre inmutable
                  </Button>
                </CardContent>
              </Card>
            ) : (
              <Card>
                <CardContent className="py-12 text-center text-body text-muted-foreground">
                  El turno ya está cerrado.
                </CardContent>
              </Card>
            )}

            {data.latestClosure ? (
              <Card>
                <CardHeader className="flex-row items-center justify-between gap-4">
                  <div>
                    <p className="text-label uppercase tracking-wide text-muted-foreground">
                      Cierre congelado
                    </p>
                    <CardTitle>{formatDateTime(data.latestClosure.closedAt)}</CardTitle>
                  </div>
                  <Button asChild variant="outline">
                    <a href="/api/cashier?export=closure">
                      <DownloadIcon aria-hidden="true" />
                      Descargar CSV
                    </a>
                  </Button>
                </CardHeader>
                <CardContent className="space-y-6">
                  <dl className="space-y-2 text-body">
                    {(
                      [
                        ["Venta bruta", formatClp(data.latestClosure.grossSalesClp)],
                        ["Reembolsos", `− ${formatClp(data.latestClosure.refundsClp)}`],
                        [
                          "Contracargos",
                          `− ${formatClp(data.latestClosure.chargebacksClp)}`,
                        ],
                        [
                          "Comisión proveedor",
                          `− ${formatClp(data.latestClosure.providerFeesClp)}`,
                        ],
                      ] as const
                    ).map(([label, value]) => (
                      <div
                        className="flex items-center justify-between border-b border-border pb-2"
                        key={label}
                      >
                        <dt className="text-muted-foreground">{label}</dt>
                        <dd>{value}</dd>
                      </div>
                    ))}
                    <div className="flex items-center justify-between pt-2">
                      <dt className="text-h3">Abono esperado</dt>
                      <dd className="text-h2">
                        {formatClp(data.latestClosure.expectedPayoutClp)}
                      </dd>
                    </div>
                  </dl>
                  <div className="space-y-2">
                    <h4 className="text-h3">Propinas por garzón</h4>
                    {data.latestClosure.tipsByWaiter.map((tip) => (
                      <p className="text-small text-muted-foreground" key={tip.waiterName}>
                        {tip.waiterName}: {formatClp(tip.distributableClp)}
                      </p>
                    ))}
                  </div>
                  {data.latestClosure.localTipAdjustmentsClp ? (
                    <Alert tone="warning">
                      Ajuste a cargo del local por propina ya distribuida:{" "}
                      <strong>
                        {formatClp(data.latestClosure.localTipAdjustmentsClp)}
                      </strong>
                    </Alert>
                  ) : null}
                  {data.tableCredit?.currentShiftLossClp ? (
                    <Alert tone="warning">
                      Fuga de crédito de mesa registrada en este cierre:{" "}
                      <strong>
                        {formatClp(data.tableCredit.currentShiftLossClp)}
                      </strong>
                    </Alert>
                  ) : null}
                </CardContent>
              </Card>
            ) : null}
          </section>
        ) : null}
      </div>
    </AppShell>
  );
}
