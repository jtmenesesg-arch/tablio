"use client";

import { useEffect, useState } from "react";
import { Alert } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { ReasonDialog } from "@/components/ui/reason-dialog";
import { Select } from "@/components/ui/select";
import { formatClp, formatDateTime } from "@/lib/format";
import { subscriptionStatusDictionary } from "@/lib/ui-statuses";
import type {
  SuperadminBootstrap,
  SuperadminMutation,
  SuperadminTenant,
} from "@/lib/platform-contract";

async function readResponse(response: Response): Promise<SuperadminBootstrap> {
  const body = (await response.json()) as SuperadminBootstrap & {
    error?: string;
  };
  if (!response.ok) throw new Error(body.error ?? "Acción rechazada.");
  return body;
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

function MetricCard({
  label,
  value,
  hint,
  tone,
}: {
  label: string;
  value: string;
  hint?: string;
  tone?: "danger";
}) {
  return (
    <Card className={tone === "danger" ? "border-destructive" : undefined}>
      <CardContent className="space-y-1 py-6">
        <p className="text-label uppercase tracking-wide text-muted-foreground">
          {label}
        </p>
        <p className="text-h2 text-foreground">{value}</p>
        {hint ? (
          <p className="text-small text-muted-foreground">{hint}</p>
        ) : null}
      </CardContent>
    </Card>
  );
}

function CreateTenantDialog({
  open,
  onOpenChange,
  working,
  onConfirm,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  working: boolean;
  onConfirm: (name: string) => void;
}) {
  return (
    <Dialog onOpenChange={onOpenChange} open={open}>
      <DialogContent>
        <form
          className="space-y-6"
          onSubmit={(event) => {
            event.preventDefault();
            const name = String(
              new FormData(event.currentTarget).get("name") ?? "",
            ).trim();
            if (name) onConfirm(name);
          }}
        >
          <DialogHeader>
            <DialogTitle>Alta de tenant</DialogTitle>
            <DialogDescription>
              Crea un local nuevo en modo demo.
            </DialogDescription>
          </DialogHeader>
          <Input autoFocus name="name" placeholder="Nombre del local" required />
          <Button className="w-full" disabled={working} type="submit">
            {working ? "Creando…" : "Crear tenant"}
          </Button>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function ThresholdDialog({
  open,
  onOpenChange,
  currentClp,
  working,
  onConfirm,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  currentClp: number;
  working: boolean;
  onConfirm: (thresholdClp: number) => void;
}) {
  return (
    <Dialog onOpenChange={onOpenChange} open={open}>
      <DialogContent>
        <form
          className="space-y-6"
          onSubmit={(event) => {
            event.preventDefault();
            const raw = String(
              new FormData(event.currentTarget).get("threshold") ?? "",
            );
            onConfirm(Number(raw.replace(/\D/g, "")) || 0);
          }}
        >
          <DialogHeader>
            <DialogTitle>Configurar umbral de alerta</DialogTitle>
            <DialogDescription>
              Superadmin recibirá una alerta cuando el pasivo de este local
              llegue a este monto.
            </DialogDescription>
          </DialogHeader>
          <Input
            autoFocus
            defaultValue={currentClp}
            min={0}
            name="threshold"
            required
            type="number"
          />
          <Button className="w-full" disabled={working} type="submit">
            {working ? "Guardando…" : "Guardar umbral"}
          </Button>
        </form>
      </DialogContent>
    </Dialog>
  );
}

export function SuperadminDashboard() {
  const [data, setData] = useState<SuperadminBootstrap>();
  const [selectedTenant, setSelectedTenant] = useState<string>();
  const [error, setError] = useState<string>();
  const [working, setWorking] = useState(false);
  const [creatingTenant, setCreatingTenant] = useState(false);
  const [settingThreshold, setSettingThreshold] = useState(false);
  const [closingTenant, setClosingTenant] = useState(false);

  useEffect(() => {
    let active = true;
    void fetch("/api/superadmin", { cache: "no-store" })
      .then(readResponse)
      .then((next) => {
        if (active) setData(next);
      })
      .catch((caught: unknown) => {
        if (active) {
          setError(
            caught instanceof Error ? caught.message : "Error inesperado.",
          );
        }
      });
    return () => {
      active = false;
    };
  }, []);

  async function mutate(mutation: SuperadminMutation) {
    setWorking(true);
    setError(undefined);
    try {
      setData(
        await readResponse(
          await fetch("/api/superadmin", {
            method: "POST",
            headers: { "content-type": "application/json" },
            body: JSON.stringify(mutation),
          }),
        ),
      );
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Error inesperado.");
    } finally {
      setWorking(false);
    }
  }

  if (!data) {
    return (
      <main className="grid min-h-dvh place-items-center bg-background">
        <p className="text-h2 text-foreground">Abriendo plataforma…</p>
      </main>
    );
  }

  const selected = data.tenants.find((tenant) => tenant.id === selectedTenant);

  return (
    <main className="min-h-dvh bg-background">
      <div className="mx-auto max-w-[90rem] space-y-6 p-4 md:p-6">
        <header className="flex flex-col gap-6 lg:flex-row lg:items-start lg:justify-between">
          <div className="space-y-2">
            <Badge variant="demo">Superadmin · demo</Badge>
            <h1 className="text-h1 tracking-tight text-foreground lg:text-h1-lg">
              Negocio y soporte
            </h1>
            <p className="text-body text-muted-foreground">
              {data.actor.name} · acceso entre tenants exclusivamente
              auditado.
            </p>
          </div>
          <Button onClick={() => setCreatingTenant(true)} type="button">
            Alta de tenant
          </Button>
        </header>

        {error ? <Alert tone="danger">{error}</Alert> : null}

        <section
          aria-label="Métricas de la plataforma"
          className="grid gap-4 sm:grid-cols-2 lg:grid-cols-5"
        >
          <MetricCard label="Locales activos" value={String(data.metrics.activeTenants)} />
          <MetricCard label="MRR" value={formatClp(data.metrics.mrrClp)} />
          <MetricCard label="Churn" value={`${data.metrics.churnPercent}%`} />
          <MetricCard
            label="Pedidos · 30 días"
            value={data.metrics.ordersLast30Days.toLocaleString("es-CL")}
          />
          <MetricCard
            hint={`${data.metrics.tenantsOverStoredValueThreshold} local(es) sobre su umbral`}
            label="Pasivo de clientes"
            tone={data.metrics.tenantsOverStoredValueThreshold ? "danger" : undefined}
            value={formatClp(data.metrics.storedValueLiabilityClp)}
          />
        </section>

        <section className="grid gap-4 xl:grid-cols-[1.3fr_1fr]">
          <Card>
            <CardHeader>
              <SectionHeading eyebrow="Tenants" title="Locales y estado" />
            </CardHeader>
            <CardContent>
              <div aria-label="Locales" className="space-y-2" role="table">
                {data.tenants.map((tenant) => {
                  const status = subscriptionStatusDictionary[tenant.subscriptionStatus];
                  const active = selectedTenant === tenant.id;
                  return (
                    <button
                      className={`flex w-full flex-col gap-2 rounded-surface-lg border bg-card p-4 text-left transition-colors duration-[var(--motion-feedback)] hover:bg-muted motion-reduce:transition-none sm:flex-row sm:items-center sm:justify-between ${
                        active ? "border-primary" : "border-border"
                      }`}
                      data-tenant-id={tenant.id}
                      key={tenant.id}
                      onClick={() => setSelectedTenant(tenant.id)}
                      role="row"
                      type="button"
                    >
                      <div>
                        <strong className="text-h3 text-foreground">
                          {tenant.name}
                        </strong>
                        <p className="text-small text-muted-foreground">
                          {tenant.tableCount} mesas · {tenant.planCode}
                        </p>
                      </div>
                      <div className="space-y-1 sm:text-right">
                        <Badge variant={status.tone}>{status.label}</Badge>
                        <p className="text-small text-muted-foreground">
                          {tenant.gatewayConnected
                            ? "Pasarela conectada"
                            : "Sin pasarela"}
                        </p>
                        <p
                          className={`text-small ${
                            tenant.storedValueAlert
                              ? "font-bold text-destructive"
                              : "text-muted-foreground"
                          }`}
                        >
                          Saldo clientes: {formatClp(tenant.storedValueLiabilityClp)}
                          {tenant.storedValueAlert ? " · ALERTA" : ""}
                        </p>
                      </div>
                    </button>
                  );
                })}
              </div>
            </CardContent>
          </Card>

          <Card>
            {selected ? (
              <CardContent className="space-y-6 py-6">
                <div>
                  <SectionHeading eyebrow="Detalle" title={selected.name} />
                  <p className="mt-1 text-small text-muted-foreground">
                    Última actividad {formatDateTime(selected.lastActivityAt)}
                  </p>
                </div>

                <dl className="space-y-2 text-body">
                  {(
                    [
                      ["Plan", `${selected.planCode} · ${formatClp(selected.monthlyClp)}`],
                      ["Acceso operativo", selected.operationalAccess],
                      ["Proveedor DTE", selected.dteProvider],
                    ] as const
                  ).map(([label, value]) => (
                    <div
                      className="flex items-center justify-between gap-4 border-b border-border pb-2"
                      key={label}
                    >
                      <dt className="text-muted-foreground">{label}</dt>
                      <dd className="text-right">{value}</dd>
                    </div>
                  ))}
                  <div className="flex items-center justify-between gap-4 border-b border-border pb-2">
                    <dt className="text-muted-foreground">Pasivo por saldo</dt>
                    <dd
                      className={
                        selected.storedValueAlert
                          ? "font-bold text-destructive"
                          : undefined
                      }
                    >
                      {formatClp(selected.storedValueLiabilityClp)}
                      {selected.storedValueAlert
                        ? " · supera el umbral de Tablio"
                        : ""}
                    </dd>
                  </div>
                  <div className="flex items-center justify-between gap-4">
                    <dt className="text-muted-foreground">Alerta desde</dt>
                    <dd>{formatClp(selected.storedValueAlertThresholdClp)}</dd>
                  </div>
                </dl>

                <Alert className="space-y-3" tone="warning">
                  <p className="font-bold">Exposición de dinero de clientes</p>
                  <p className="text-small">
                    Este pasivo pertenece al local. Antes de suspenderlo o
                    cerrarlo, Tablio debe revisar cómo se devolverá o
                    consumirá.
                  </p>
                  <Button
                    disabled={working}
                    onClick={() => setSettingThreshold(true)}
                    type="button"
                    variant="outline"
                  >
                    Configurar umbral
                  </Button>
                </Alert>

                <div className="space-y-3">
                  <h3 className="text-h3">Cobranza simulada</h3>
                  <div className="flex flex-wrap gap-2">
                    <Button
                      disabled={working}
                      onClick={() =>
                        void mutate({ action: "billing.fail", tenantId: selected.id })
                      }
                      type="button"
                      variant="outline"
                    >
                      Simular cobro fallido
                    </Button>
                    <Button
                      disabled={working}
                      onClick={() =>
                        void mutate({ action: "billing.retry", tenantId: selected.id })
                      }
                      type="button"
                      variant="outline"
                    >
                      Reintentar
                    </Button>
                  </div>
                  <Select
                    aria-label="Estado comercial"
                    onChange={(event) =>
                      void mutate({
                        action: "billing.status.set",
                        tenantId: selected.id,
                        status: event.target
                          .value as SuperadminTenant["subscriptionStatus"],
                      })
                    }
                    value={selected.subscriptionStatus}
                  >
                    {Object.entries(subscriptionStatusDictionary).map(
                      ([value, presentation]) => (
                        <option key={value} value={value}>
                          {presentation.label}
                        </option>
                      ),
                    )}
                  </Select>
                  <p className="text-small text-muted-foreground">
                    Sólo Suspendido bloquea pedidos nuevos. Las comandas
                    pagadas siguen su curso.
                  </p>
                </div>

                <div className="space-y-3">
                  <h3 className="text-h3">Feature flags</h3>
                  <div className="space-y-2">
                    {["reconciliation", "advanced_reports", "menu_import"].map(
                      (flag) => (
                        <label
                          className="flex items-center gap-3 text-body"
                          key={flag}
                        >
                          <input
                            checked={selected.featureFlags.includes(flag)}
                            className="size-touch shrink-0"
                            onChange={() =>
                              void mutate({
                                action: "tenant.feature.toggle",
                                tenantId: selected.id,
                                flag,
                              })
                            }
                            type="checkbox"
                          />
                          {flag}
                        </label>
                      ),
                    )}
                  </div>
                </div>

                <div className="flex flex-wrap gap-2">
                  <Button
                    onClick={() => {
                      const reason = window.prompt(
                        "Motivo obligatorio de impersonación",
                      );
                      if (reason !== null) {
                        void mutate({
                          action: "tenant.impersonate",
                          tenantId: selected.id,
                          reason,
                        });
                      }
                    }}
                    type="button"
                  >
                    Entrar como soporte
                  </Button>
                  <Button
                    onClick={() => setClosingTenant(true)}
                    type="button"
                    variant="destructive"
                  >
                    Dar de baja
                  </Button>
                </div>
              </CardContent>
            ) : (
              <CardContent className="grid min-h-[20rem] place-content-center gap-2 text-center">
                <h2 className="text-h2">Selecciona un local</h2>
                <p className="text-body text-muted-foreground">
                  Verás plan, proveedores, funciones y soporte auditado.
                </p>
              </CardContent>
            )}
          </Card>
        </section>

        <Card>
          <CardHeader>
            <SectionHeading eyebrow="Cobranza" title="Avisos y reintentos" />
          </CardHeader>
          <CardContent>
            {data.notifications.length ? (
              <ul className="space-y-2">
                {data.notifications.map((notification) => (
                  <li
                    className="flex items-center justify-between gap-4 border-b border-border py-2 text-body"
                    key={notification.id}
                  >
                    <strong>{notification.kind}</strong>
                    <span className="text-muted-foreground">
                      {notification.message}
                    </span>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="text-body text-muted-foreground">
                No hay avisos comerciales pendientes.
              </p>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <SectionHeading eyebrow="Auditoría" title="Impersonaciones" />
          </CardHeader>
          <CardContent>
            {data.impersonationAudit.length ? (
              <ul className="space-y-2">
                {data.impersonationAudit.map((entry) => (
                  <li
                    className="flex items-center justify-between gap-4 border-b border-border py-2 text-body"
                    key={entry.id}
                  >
                    <strong>{entry.actorName}</strong>
                    <span className="text-muted-foreground">
                      {entry.tenantName} · {entry.reason}
                    </span>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="text-body text-muted-foreground">
                No hay accesos de soporte en esta sesión.
              </p>
            )}
          </CardContent>
        </Card>
      </div>

      <CreateTenantDialog
        onConfirm={(name) => {
          void mutate({ action: "tenant.create", name });
          setCreatingTenant(false);
        }}
        onOpenChange={setCreatingTenant}
        open={creatingTenant}
        working={working}
      />

      {selected ? (
        <>
          <ThresholdDialog
            currentClp={selected.storedValueAlertThresholdClp}
            onConfirm={(thresholdClp) => {
              void mutate({
                action: "tenant.stored_value_threshold.set",
                tenantId: selected.id,
                thresholdClp,
              });
              setSettingThreshold(false);
            }}
            onOpenChange={setSettingThreshold}
            open={settingThreshold}
            working={working}
          />
          <ReasonDialog
            confirmLabel="Confirmar baja"
            danger
            description="Esta acción queda auditada."
            onConfirm={(reason) => {
              void mutate({ action: "tenant.close", tenantId: selected.id, reason });
              setClosingTenant(false);
            }}
            onOpenChange={setClosingTenant}
            open={closingTenant}
            title="Motivo de la baja"
            working={working}
          />
        </>
      ) : null}
    </main>
  );
}
