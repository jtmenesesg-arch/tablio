"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  AppShell,
  AppShellLoading,
  type AppShellNavItem,
} from "@/components/operational/app-shell";
import { Alert } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  BuildingIcon,
  DownloadIcon,
  LayoutIcon,
  MoneyIcon,
  SettingsIcon,
  TeamIcon,
} from "@/components/ui/icons";
import type { OwnerDashboard as OwnerData } from "../../lib/owner-contract";

const money = (value: number) =>
  new Intl.NumberFormat("es-CL", {
    style: "currency",
    currency: "CLP",
    maximumFractionDigits: 0,
  }).format(value);

const ownerNav: readonly AppShellNavItem[] = [
  {
    active: true,
    href: "/dueno",
    icon: LayoutIcon,
    label: "Resumen",
  },
  { href: "/caja", icon: MoneyIcon, label: "Caja" },
  { href: "/garzon", icon: TeamIcon, label: "Equipo" },
  { href: "/onboarding", icon: SettingsIcon, label: "Configurar" },
];

function SectionHeading({
  eyebrow,
  title,
}: {
  eyebrow: string;
  title: string;
}) {
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
  description,
  label,
  tone = "default",
  value,
}: {
  description: string;
  label: string;
  tone?: "default" | "danger" | "success";
  value: string;
}) {
  return (
    <Card
      className={
        tone === "danger"
          ? "border-destructive"
          : tone === "success"
            ? "border-success"
            : undefined
      }
    >
      <CardHeader>
        <CardDescription>{label}</CardDescription>
        <CardTitle className="text-h2">{value}</CardTitle>
      </CardHeader>
      <CardContent>
        <p className="text-small text-muted-foreground">{description}</p>
      </CardContent>
    </Card>
  );
}

export function OwnerDashboard() {
  const [data, setData] = useState<OwnerData>();
  const [error, setError] = useState<string>();
  const [venue, setVenue] = useState("all");
  const [newTenant, setNewTenant] = useState(false);
  const [working, setWorking] = useState(false);

  const load = useCallback(async () => {
    try {
      setError(undefined);
      const params = new URLSearchParams({ venue });
      if (newTenant) params.set("new", "1");
      const response = await fetch(`/api/owner?${params}`, {
        cache: "no-store",
      });
      if (!response.ok) throw new Error("owner-dashboard-unavailable");
      setData((await response.json()) as OwnerData);
    } catch {
      setError(
        "No pudimos actualizar el panel. Revisa tu conexión y vuelve a intentar.",
      );
    }
  }, [newTenant, venue]);

  useEffect(() => {
    const initial = window.setTimeout(() => void load(), 0);
    return () => window.clearTimeout(initial);
  }, [load]);

  const maxHourly = useMemo(
    () =>
      Math.max(1, ...(data?.hourlySales.map((item) => item.salesClp) ?? [1])),
    [data],
  );

  if (!data && !error) return <AppShellLoading navItems={ownerNav} />;

  if (!data) {
    return (
      <AppShell
        banner="Modo demo · no mueve dinero real"
        branchName="Sucursal principal"
        navItems={ownerNav}
        tenantName="Tu bar"
      >
        <Alert className="space-y-4" tone="danger">
          <div>
            <h1 className="text-h2">El panel no se pudo cargar</h1>
            <p className="mt-2 text-body">
              {error ?? "Intenta nuevamente en unos segundos."}
            </p>
          </div>
          <Button onClick={() => void load()} type="button">
            Volver a intentar
          </Button>
        </Alert>
      </AppShell>
    );
  }

  async function togglePromotion() {
    setWorking(true);
    try {
      const response = await fetch("/api/owner", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          action: "promotion.toggle",
          enabled: !data!.metrics.checkoutEngagement.promotionActive,
        }),
      });
      if (!response.ok) throw new Error("promotion-toggle-failed");
      setData((await response.json()) as OwnerData);
    } catch {
      setError(
        "No pudimos cambiar el happy hour. Nada cambió; vuelve a intentar.",
      );
    } finally {
      setWorking(false);
    }
  }

  return (
    <AppShell
      banner="Modo demo · no mueve dinero real"
      branchName={
        venue === "all"
          ? "Todos los locales"
          : (data.venues.find((item) => item.id === venue)?.name ??
            "Sucursal principal")
      }
      navItems={ownerNav}
      tenantName={data.tenant.name}
    >
      <div
        className="space-y-6"
        data-owner-dashboard-ready
        data-testid="owner-dashboard"
      >
        <header className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_20rem]">
          <div className="space-y-4">
            <Badge variant="neutral">Panel del dueño</Badge>
            <h1 className="max-w-5xl text-h1 tracking-tight text-foreground lg:text-h1-lg">
              {data.story.headline}
            </h1>
            <p className="text-body text-muted-foreground">
              Mira qué pasó hoy, qué necesita atención y dónde actuar primero.
            </p>
          </div>

          <Card>
            <CardContent className="space-y-3 pt-6">
              <label
                className="block text-label uppercase tracking-wide text-muted-foreground"
                htmlFor="owner-venue"
              >
                Vista
              </label>
              <select
                className="min-h-touch w-full rounded-input border border-input bg-card px-4 py-3 text-body text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                id="owner-venue"
                onChange={(event) => setVenue(event.target.value)}
                value={venue}
              >
                <option value="all">Todos los locales</option>
                {data.venues.map((item) => (
                  <option key={item.id} value={item.id}>
                    {item.name}
                  </option>
                ))}
              </select>
              <Button
                className="w-full"
                onClick={() => setNewTenant((value) => !value)}
                type="button"
                variant="outline"
              >
                <BuildingIcon aria-hidden="true" />
                {newTenant ? "Ver bar con historia" : "Ver instalación nueva"}
              </Button>
              <Button asChild className="w-full" variant="secondary">
                <a href={`/api/owner?venue=${venue}&format=csv`}>
                  <DownloadIcon aria-hidden="true" />
                  Exportar CSV
                </a>
              </Button>
            </CardContent>
          </Card>
        </header>

        {error ? (
          <Alert tone="danger">
            <strong className="font-bold">Algo no se actualizó.</strong> {error}
          </Alert>
        ) : null}

        {data.story.historyMessage ? (
          <Alert className="space-y-2" tone="warning">
            <strong className="block text-h3">
              Estamos aprendiendo cómo funciona tu bar.
            </strong>
            <p>{data.story.historyMessage}</p>
            {data.period.comparisonAppearsAt ? (
              <p className="text-small text-muted-foreground">
                La primera comparación aparecerá desde el{" "}
                {new Date(data.period.comparisonAppearsAt).toLocaleDateString(
                  "es-CL",
                )}
                .
              </p>
            ) : null}
          </Alert>
        ) : null}

        <section
          aria-label="Resumen de decisiones"
          className="grid gap-4 lg:grid-cols-3"
        >
          <Card className="border-t-4 border-t-destructive">
            <CardHeader>
              <CardDescription>Qué necesita atención</CardDescription>
              <CardTitle>{data.story.attention}</CardTitle>
            </CardHeader>
          </Card>
          <Card className="border-t-4 border-t-success">
            <CardHeader>
              <CardDescription>Qué mejoró</CardDescription>
              <CardTitle>{data.story.improved}</CardTitle>
            </CardHeader>
          </Card>
          <Card className="border-t-4 border-t-brand">
            <CardHeader>
              <CardDescription>Qué recomienda Tablio</CardDescription>
              <CardTitle>{data.story.recommendation}</CardTitle>
            </CardHeader>
          </Card>
        </section>

        <Card>
          <CardHeader>
            <SectionHeading eyebrow="Ventas por hora" title="El ritmo de hoy" />
          </CardHeader>
          <CardContent className="overflow-x-auto">
            <div
              aria-label="Ventas por hora"
              className="grid min-w-[42rem] grid-cols-7 gap-3 border-b border-border"
              role="img"
            >
              {data.hourlySales.map((item) => (
                <div
                  aria-label={`${item.hour}: ${money(item.salesClp)}${
                    item.isPeak ? ", hora de mayor venta" : ""
                  }`}
                  className="flex h-chart flex-col justify-end gap-2 text-center"
                  key={item.hour}
                >
                  <span className="text-label text-foreground">
                    {money(item.salesClp)}
                  </span>
                  <div
                    className={
                      item.isPeak
                        ? "min-h-2 rounded-t-surface-md bg-brand"
                        : "min-h-2 rounded-t-surface-md bg-foreground"
                    }
                    style={{
                      height: `${Math.max(
                        8,
                        (item.salesClp / maxHourly) * 100,
                      )}%`,
                    }}
                  />
                  <small className="pb-2 text-small text-muted-foreground">
                    {item.hour}
                    {item.isPeak ? " · peak" : ""}
                  </small>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>

        <Alert
          className="grid gap-4 md:grid-cols-[1fr_auto]"
          data-testid="owner-leakage"
          tone="warning"
        >
          <div className="space-y-2">
            <p className="text-label uppercase tracking-wide text-muted-foreground">
              El costo real del crédito de mesa este mes
            </p>
            <p className="text-body">
              Mes anterior: {money(data.metrics.previousMonthlyLeakageClp)}
              {data.metrics.leakageTrendPercent !== undefined
                ? ` · ${Math.abs(data.metrics.leakageTrendPercent)}% ${
                    data.metrics.leakageTrendPercent <= 0 ? "menos" : "más"
                  }`
                : ""}
              . Esta cifra no incluye pedidos prepagados.
            </p>
          </div>
          <strong className="text-h1">
            {money(data.metrics.monthlyLeakageClp)}
          </strong>
        </Alert>

        <section className="space-y-4" aria-labelledby="owner-loyalty-title">
          <SectionHeading
            eyebrow="Clientes recurrentes"
            title="La relación con quienes vuelven"
          />
          <div className="grid gap-4 md:grid-cols-3">
            <MetricCard
              description={`de ${data.metrics.loyalty.activeProfiles} perfiles activos · ${data.metrics.loyalty.averageVisitFrequency} visitas promedio`}
              label="Clientes que volvieron"
              tone="success"
              value={String(data.metrics.loyalty.returningProfiles)}
            />
            <MetricCard
              description={`Valor de lista ${money(
                data.metrics.loyalty.rewardReferenceValueClp,
              )}${
                data.metrics.loyalty.rewardKnownCostClp !== undefined
                  ? ` · costo informado ${money(
                      data.metrics.loyalty.rewardKnownCostClp,
                    )}`
                  : " · sin costo informado, no calculamos margen"
              }`}
              label="Premios usados"
              value={String(data.metrics.loyalty.rewardsRedeemed)}
            />
            <MetricCard
              description={`${data.metrics.loyalty.identityRecoveries} recuperaciones sin el token anterior. Si sube, la continuidad del programa requiere atención.`}
              label="Pérdida de identidad"
              tone={
                data.metrics.loyalty.identityLossRatePercent >= 15
                  ? "danger"
                  : "default"
              }
              value={`${data.metrics.loyalty.identityLossRatePercent.toLocaleString(
                "es-CL",
              )}%`}
            />
          </div>
          <p className="text-small text-muted-foreground">
            {data.metrics.loyalty.dormantProfiles > 0
              ? `${data.metrics.loyalty.dormantProfiles} clientes llevan más de 45 días sin volver. El segmento está listo; Tablio no envía mensajes.`
              : "Todavía no hay clientes dormidos. Esta lectura aparecerá cuando exista historial suficiente."}
          </p>
        </section>

        <Card>
          <CardHeader className="gap-4 md:flex-row md:items-center md:justify-between">
            <SectionHeading
              eyebrow="Momento del pago"
              title="Más venta, sin esconder descuentos"
            />
            <Button
              disabled={working}
              onClick={() => void togglePromotion()}
              type="button"
            >
              {data.metrics.checkoutEngagement.promotionActive
                ? "Detener happy hour"
                : "Activar happy hour"}
            </Button>
          </CardHeader>
          <CardContent className="space-y-6">
            <div className="grid gap-4 md:grid-cols-3">
              <MetricCard
                description={`${data.metrics.checkoutEngagement.upsellAcceptances} aceptadas de ${data.metrics.checkoutEngagement.upsellExposures} vistas.`}
                label="Aceptación del upsell"
                value={`${data.metrics.checkoutEngagement.upsellAcceptanceRatePercent.toLocaleString(
                  "es-CL",
                )}%`}
              />
              <MetricCard
                description="Solo sugerencias aceptadas y efectivamente pagadas."
                label="Ingreso incremental atribuible"
                value={money(
                  data.metrics.checkoutEngagement.upsellIncrementalRevenueClp,
                )}
              />
              <MetricCard
                description={`${data.metrics.checkoutEngagement.promotionName}: ${
                  data.metrics.checkoutEngagement.promotionActive
                    ? "activa"
                    : "inactiva"
                }.`}
                label="Descuento promocional"
                value={money(
                  data.metrics.checkoutEngagement.promotionDiscountClp,
                )}
              />
            </div>

            <div className="space-y-3">
              <h3 className="text-h3">
                Propinas informadas por trabajador y medio
              </h3>
              {data.metrics.checkoutEngagement.tipsByWorker.length > 0 ? (
                data.metrics.checkoutEngagement.tipsByWorker.map(
                  (tip, index) => (
                    <p
                      className="flex items-center justify-between gap-4 border-b border-border py-3 text-body"
                      key={`${tip.workerName}:${tip.paymentMethod}:${index}`}
                    >
                      <span>
                        {tip.workerName} · {tip.paymentMethod}
                      </span>
                      <strong>{money(tip.amountClp)}</strong>
                    </p>
                  ),
                )
              ) : (
                <p className="text-body text-muted-foreground">
                  Aún no hay propinas atribuidas en esta demo.
                </p>
              )}
              <p className="text-small text-muted-foreground">
                Tablio informa la distribución. El local entrega el dinero y
                Tablio no cobra comisión sobre propinas.
              </p>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="gap-4 md:flex-row md:items-end md:justify-between">
            <SectionHeading
              eyebrow="Saldo de clientes"
              title="Plata recibida que tu bar todavía debe"
            />
            <strong className="text-h1">
              {money(data.metrics.storedValue.liabilityClp)}
            </strong>
          </CardHeader>
          <CardContent className="space-y-4">
            <Alert>
              Este monto es un pasivo: no se suma a ventas ni se presenta como
              caja disponible.
            </Alert>
            <div className="grid gap-4 md:grid-cols-3">
              <MetricCard
                description={`Obligación creada hoy; bono otorgado ${money(
                  data.metrics.storedValue.topUpBonusClp,
                )}.`}
                label="Entró por recargas"
                value={money(data.metrics.storedValue.topUpsCashInClp)}
              />
              <MetricCard
                description="Venta reconocida sin entrada de efectivo hoy."
                label="Se consumió en pedidos"
                value={money(data.metrics.storedValue.consumedRevenueClp)}
              />
              <MetricCard
                description={`Dinero cargado + ${money(
                  data.metrics.storedValue.bonusLiabilityClp,
                )} de bono · ${data.metrics.storedValue.accountCount} cuentas.`}
                label="Composición del pasivo"
                value={money(data.metrics.storedValue.loadedMoneyLiabilityClp)}
              />
            </div>
          </CardContent>
        </Card>

        <section className="grid gap-4 lg:grid-cols-3">
          <Card>
            <CardHeader>
              <CardTitle>Productos</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              {data.topProducts.map((item) => (
                <p
                  className="flex justify-between gap-4 border-b border-border py-2 text-small"
                  key={item.name}
                >
                  <strong>{item.name}</strong>
                  <span className="text-muted-foreground">
                    {item.quantity} pedidos
                  </span>
                </p>
              ))}
              <p className="text-small text-muted-foreground">
                Baja rotación:{" "}
                {data.lowRotationProducts.map((item) => item.name).join(", ")}
              </p>
            </CardContent>
          </Card>
          <Card>
            <CardHeader>
              <CardTitle>Operación</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              {[
                ["Ticket promedio", money(data.metrics.averageTicketClp)],
                ["Rondas por mesa", String(data.metrics.roundsPerTable)],
                ["Propinas", money(data.metrics.tipsClp)],
              ].map(([label, value]) => (
                <p
                  className="flex justify-between gap-4 border-b border-border py-2 text-small"
                  key={label}
                >
                  <span className="text-muted-foreground">{label}</span>
                  <strong>{value}</strong>
                </p>
              ))}
            </CardContent>
          </Card>
          <Card>
            <CardHeader>
              <CardTitle>Locales</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              {data.venueComparison.map((item) => (
                <p
                  className="border-b border-border py-2 text-small"
                  key={item.venueId}
                >
                  <strong className="block">{item.venueName}</strong>
                  <span className="text-muted-foreground">
                    {money(item.salesClp)} · {item.unresolvedExceptions}{" "}
                    pendientes
                  </span>
                </p>
              ))}
            </CardContent>
          </Card>
        </section>

        {data.unresolvedItems.length > 0 ? (
          <Card className="border-destructive">
            <CardHeader>
              <CardTitle>Excepciones y fugas sin esconder</CardTitle>
              <CardDescription>
                Revisa estos movimientos antes del cierre.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
              {data.unresolvedItems.map((item) => (
                <div
                  className="flex items-start justify-between gap-4 border-b border-border py-3 text-body"
                  key={item.id}
                >
                  <span>{item.message}</span>
                  <strong>{money(item.amountClp)}</strong>
                </div>
              ))}
            </CardContent>
          </Card>
        ) : null}
      </div>
    </AppShell>
  );
}
