"use client";

import {
  type FormEvent,
  type ReactNode,
  useEffect,
  useMemo,
  useState,
} from "react";
import { AppShell, AppShellLoading } from "@/components/operational/app-shell";
import { ownerNavigation } from "@/components/operational/owner-navigation";
import { Alert } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/cn";
import { formatClp, formatDateTime } from "@/lib/format";
import type {
  OnboardingBootstrap,
  OnboardingMutation,
  OnboardingStepCode,
} from "@/lib/platform-contract";

const stepLabels: Record<OnboardingStepCode, string> = {
  venue: "Local",
  size: "Tamaño",
  menu: "Carta",
  tax: "Tributación",
  gateway: "Pasarela",
  staff: "Personal",
  qr: "QRs",
  verification: "Prueba",
  production: "Producción",
};

const stepOrder = Object.keys(stepLabels) as OnboardingStepCode[];

const navItems = ownerNavigation("configure");

async function responseBody(response: Response): Promise<OnboardingBootstrap> {
  const body = (await response.json()) as OnboardingBootstrap & {
    error?: string;
  };
  if (!response.ok) throw new Error(body.error ?? "No pudimos guardar.");
  return body;
}

function FieldLabel({
  children,
  htmlFor,
}: {
  children: ReactNode;
  htmlFor: string;
}) {
  return (
    <label className="block space-y-2 text-small font-bold" htmlFor={htmlFor}>
      <span>{children}</span>
    </label>
  );
}

function StepHeading({
  step,
  title,
  description,
}: {
  step: number;
  title: string;
  description: string;
}) {
  return (
    <div className="space-y-1">
      <p className="text-label uppercase tracking-wide text-muted-foreground">
        Paso {step}
      </p>
      <h2 className="text-h2 text-foreground">{title}</h2>
      <p className="text-body text-muted-foreground">{description}</p>
    </div>
  );
}

export function OwnerOnboarding() {
  const [data, setData] = useState<OnboardingBootstrap>();
  const [selectedStep, setSelectedStep] = useState<OnboardingStepCode>("venue");
  const [working, setWorking] = useState(false);
  const [error, setError] = useState<string>();
  const [menuSource, setMenuSource] = useState<
    "text" | "link" | "pdf" | "image"
  >("text");
  const [menuContent, setMenuContent] = useState(
    "Lager de la casa $4.500\nHamburguesa clásica $8.900",
  );

  useEffect(() => {
    let active = true;
    void fetch("/api/onboarding", { cache: "no-store" })
      .then(responseBody)
      .then((next) => {
        if (!active) return;
        setData(next);
        setSelectedStep(next.currentStep);
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

  async function mutate(mutation: OnboardingMutation) {
    setWorking(true);
    setError(undefined);
    try {
      const next = await responseBody(
        await fetch("/api/onboarding", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify(mutation),
        }),
      );
      setData(next);
      setSelectedStep(next.currentStep);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Error inesperado.");
    } finally {
      setWorking(false);
    }
  }

  const completed = useMemo(
    () => new Set(data?.completedSteps ?? []),
    [data?.completedSteps],
  );

  if (!data) return <AppShellLoading navItems={navItems} />;

  function submitVenue(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    void mutate({
      action: "venue.save",
      name: String(form.get("name") ?? ""),
      address: String(form.get("address") ?? ""),
      venueType: String(form.get("venueType") ?? ""),
      openingHours: String(form.get("openingHours") ?? ""),
    });
  }

  function submitSize(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const zones = String(form.get("zones") ?? "")
      .split(/\r?\n/)
      .map((line) => line.trim())
      .filter(Boolean)
      .map((line) => {
        const [name, count] = line.split(":");
        return {
          name: name?.trim() ?? "",
          tableCount: Number(count ?? 0),
        };
      });
    const stations = String(form.get("stations") ?? "")
      .split(",")
      .map((station) => station.trim())
      .filter(Boolean);
    void mutate({ action: "size.save", zones, stations });
  }

  function submitTax(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    void mutate({
      action: "tax.save",
      rut: String(form.get("rut") ?? ""),
      businessActivity: String(form.get("businessActivity") ?? ""),
      issuerAddress: String(form.get("issuerAddress") ?? ""),
      mode: String(form.get("mode")) as OnboardingBootstrap["tax"]["mode"],
    });
  }

  function submitStaff(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    void mutate({
      action: "staff.add",
      name: String(form.get("name") ?? ""),
      role: String(form.get("role")) as "waiter" | "cashier_admin" | "kds",
      pin: String(form.get("pin") ?? ""),
    });
  }

  return (
    <AppShell
      banner="Modo demo · no mueve dinero real"
      branchName="Onboarding"
      navItems={navItems}
      tenantName={data.tenantName}
    >
      <div className="space-y-6">
        <header className="flex flex-col gap-6 lg:flex-row lg:items-start lg:justify-between">
          <div className="space-y-2">
            <Badge variant="demo">Preparación del local</Badge>
            <h1 className="text-h1 tracking-tight text-foreground lg:text-h1-lg">
              {data.tenantName}
            </h1>
            <p className="text-body text-muted-foreground">
              Puedes cerrar esta página y continuar después.
            </p>
          </div>
          <Card aria-label="Progreso del onboarding" className="w-full lg:w-[16rem]">
            <CardContent className="space-y-2 py-6">
              <div className="flex items-baseline justify-between">
                <strong className="text-h1">{data.progressPercent}%</strong>
                <span className="text-small text-muted-foreground">
                  completado
                </span>
              </div>
              <div className="h-2 overflow-hidden rounded-full bg-muted">
                <div
                  className="h-full rounded-full bg-brand"
                  style={{ width: `${data.progressPercent}%` }}
                />
              </div>
            </CardContent>
          </Card>
        </header>

        {error ? <Alert tone="danger">{error}</Alert> : null}

        <nav
          aria-label="Pasos del onboarding"
          className="flex gap-2 overflow-x-auto pb-1"
          data-testid="onboarding-step-nav"
        >
          {stepOrder.map((step, index) => {
            const isActive = selectedStep === step;
            const isComplete = completed.has(step);
            return (
              <button
                className={cn(
                  "flex shrink-0 min-h-touch items-center gap-2 rounded-button border px-4 text-small font-bold transition-colors duration-[var(--motion-feedback)] motion-reduce:transition-none",
                  isActive
                    ? "border-primary bg-primary text-primary-foreground"
                    : isComplete
                      ? "border-success bg-success-soft text-success"
                      : "border-border bg-card text-card-foreground hover:bg-muted",
                )}
                key={step}
                onClick={() => setSelectedStep(step)}
                type="button"
              >
                <span
                  className={cn(
                    "grid size-6 shrink-0 place-items-center rounded-full text-label font-black",
                    isActive
                      ? "bg-primary-foreground text-primary"
                      : isComplete
                        ? "bg-success text-success-foreground"
                        : "bg-muted text-muted-foreground",
                  )}
                >
                  {isComplete ? "✓" : index + 1}
                </span>
                {stepLabels[step]}
              </button>
            );
          })}
        </nav>

        <Card>
          <CardContent className="space-y-6 py-6">
            {selectedStep === "venue" ? (
              <form className="space-y-6" onSubmit={submitVenue}>
                <StepHeading
                  description="Estos datos aparecen en la carta y los comprobantes."
                  step={1}
                  title="Cuéntanos sobre el local"
                />
                <div className="grid gap-4 sm:grid-cols-2">
                  <FieldLabel htmlFor="venue-name">Nombre del local</FieldLabel>
                  <Input
                    defaultValue={data.venue.name}
                    id="venue-name"
                    name="name"
                    required
                  />
                  <FieldLabel htmlFor="venue-address">Dirección</FieldLabel>
                  <Input
                    defaultValue={data.venue.address}
                    id="venue-address"
                    name="address"
                    required
                  />
                  <FieldLabel htmlFor="venue-type">Tipo de local</FieldLabel>
                  <Select
                    defaultValue={data.venue.venueType}
                    id="venue-type"
                    name="venueType"
                  >
                    <option>Bar</option>
                    <option>Cervecería</option>
                    <option>Pub</option>
                    <option>Food hall</option>
                  </Select>
                  <FieldLabel htmlFor="venue-hours">Horario</FieldLabel>
                  <Input
                    defaultValue={data.venue.openingHours}
                    id="venue-hours"
                    name="openingHours"
                  />
                </div>
                <Button disabled={working} type="submit">
                  Guardar y continuar
                </Button>
              </form>
            ) : null}

            {selectedStep === "size" ? (
              <form className="space-y-6" onSubmit={submitSize}>
                <StepHeading
                  description="Las mesas determinan principalmente el plan. El layout sólo influye si zonas y estaciones exceden juntas límites generosos."
                  step={2}
                  title="Mesas, zonas y estaciones"
                />
                <div className="space-y-4">
                  <FieldLabel htmlFor="size-zones">
                    Zonas · una por línea, con cantidad de mesas
                  </FieldLabel>
                  <Textarea
                    defaultValue={
                      data.size.zones.length
                        ? data.size.zones
                            .map((zone) => `${zone.name}:${zone.tableCount}`)
                            .join("\n")
                        : "Salón:8\nTerraza:4"
                    }
                    id="size-zones"
                    name="zones"
                    rows={4}
                  />
                  <FieldLabel htmlFor="size-stations">
                    Estaciones separadas por coma
                  </FieldLabel>
                  <Input
                    defaultValue={
                      data.size.stations
                        .map((station) => station.name)
                        .join(", ") || "Barra, Cocina"
                    }
                    id="size-stations"
                    name="stations"
                  />
                </div>
                <Alert className="space-y-1" data-plan={data.plan.proposed}>
                  <p className="text-label uppercase tracking-wide text-muted-foreground">
                    Plan propuesto · hipótesis comercial
                  </p>
                  <p className="text-h3">{data.plan.name}</p>
                  <p className="text-body">
                    {data.plan.monthlyClp
                      ? `${formatClp(data.plan.monthlyClp)}/mes`
                      : "Cotización personalizada"}
                  </p>
                  <p className="text-small text-muted-foreground">
                    {data.size.tableCount} mesas activas
                  </p>
                </Alert>
                <Button disabled={working} type="submit">
                  Guardar tamaño
                </Button>
              </form>
            ) : null}

            {selectedStep === "menu" ? (
              <div className="space-y-6">
                <StepHeading
                  description="Nunca publicamos automáticamente. Tú confirmas cada precio. Puedes lanzar sin fotografías."
                  step={3}
                  title="Importa y revisa la carta"
                />
                <div className="space-y-4">
                  <FieldLabel htmlFor="menu-source">Origen</FieldLabel>
                  <Select
                    id="menu-source"
                    onChange={(event) =>
                      setMenuSource(
                        event.target.value as "text" | "link" | "pdf" | "image",
                      )
                    }
                    value={menuSource}
                  >
                    <option value="text">Texto</option>
                    <option value="link">Enlace</option>
                    <option value="pdf">PDF</option>
                    <option value="image">Imagen</option>
                  </Select>
                  {menuSource === "text" || menuSource === "link" ? (
                    <>
                      <FieldLabel htmlFor="menu-content">
                        {menuSource === "text"
                          ? "Pega la carta"
                          : "Enlace de la carta"}
                      </FieldLabel>
                      <Textarea
                        id="menu-content"
                        onChange={(event) => setMenuContent(event.target.value)}
                        rows={5}
                        value={menuContent}
                      />
                    </>
                  ) : (
                    <>
                      <FieldLabel htmlFor="menu-file">
                        Selecciona {menuSource === "pdf" ? "un PDF" : "una imagen"}
                      </FieldLabel>
                      <input
                        accept={menuSource === "pdf" ? ".pdf" : "image/*"}
                        className="block text-body"
                        id="menu-file"
                        onChange={(event) =>
                          setMenuContent(event.target.files?.[0]?.name ?? "")
                        }
                        type="file"
                      />
                    </>
                  )}
                </div>
                <Button
                  disabled={working}
                  onClick={() =>
                    void mutate({
                      action: "menu.import",
                      source: menuSource,
                      sourceLabel: menuContent || `${menuSource} demo`,
                      content: menuSource === "text" ? menuContent : undefined,
                    })
                  }
                  type="button"
                  variant="outline"
                >
                  Extraer borrador
                </Button>
                {data.menu.items.length > 0 ? (
                  <>
                    <Alert tone="warning">
                      <strong className="block">Revisión humana obligatoria</strong>
                      <span className="text-small">
                        Corrige nombres y precios. Todavía no está publicado.
                      </span>
                    </Alert>
                    <div className="space-y-3">
                      {data.menu.items.map((item) => (
                        <article
                          className="grid gap-3 rounded-surface-lg border border-border bg-muted p-3 sm:grid-cols-3"
                          key={item.id}
                        >
                          <label className="block space-y-1 text-small font-bold">
                            <span>Producto</span>
                            <Input
                              defaultValue={item.name}
                              onBlur={(event) =>
                                void mutate({
                                  action: "menu.item.update",
                                  ...item,
                                  name: event.target.value,
                                  itemId: item.id,
                                })
                              }
                            />
                          </label>
                          <label className="block space-y-1 text-small font-bold">
                            <span>Categoría</span>
                            <Input
                              defaultValue={item.category}
                              onBlur={(event) =>
                                void mutate({
                                  action: "menu.item.update",
                                  ...item,
                                  category: event.target.value,
                                  itemId: item.id,
                                })
                              }
                            />
                          </label>
                          <label className="block space-y-1 text-small font-bold">
                            <span>Precio CLP</span>
                            <Input
                              defaultValue={item.priceClp}
                              min={0}
                              onBlur={(event) =>
                                void mutate({
                                  action: "menu.item.update",
                                  ...item,
                                  priceClp: Number(event.target.value),
                                  itemId: item.id,
                                })
                              }
                              type="number"
                            />
                          </label>
                        </article>
                      ))}
                    </div>
                    <div className="flex flex-wrap gap-2">
                      <Button
                        onClick={() => void mutate({ action: "menu.review.confirm" })}
                        type="button"
                        variant="outline"
                      >
                        Confirmar revisión
                      </Button>
                      <Button
                        disabled={data.menu.status !== "reviewed" || working}
                        onClick={() => void mutate({ action: "menu.publish" })}
                        type="button"
                      >
                        Publicar carta revisada
                      </Button>
                    </div>
                  </>
                ) : null}
              </div>
            ) : null}

            {selectedStep === "tax" ? (
              <form className="space-y-6" onSubmit={submitTax}>
                <StepHeading
                  description="El proveedor DTE real sigue pendiente antes del piloto."
                  step={4}
                  title="Datos tributarios"
                />
                <div className="grid gap-4 sm:grid-cols-2">
                  <FieldLabel htmlFor="tax-rut">RUT del emisor</FieldLabel>
                  <Input
                    defaultValue={data.tax.rut}
                    id="tax-rut"
                    name="rut"
                    required
                  />
                  <FieldLabel htmlFor="tax-activity">Giro</FieldLabel>
                  <Input
                    defaultValue={data.tax.businessActivity}
                    id="tax-activity"
                    name="businessActivity"
                    required
                  />
                  <FieldLabel htmlFor="tax-address">
                    Dirección tributaria
                  </FieldLabel>
                  <Input
                    defaultValue={data.tax.issuerAddress}
                    id="tax-address"
                    name="issuerAddress"
                  />
                  <FieldLabel htmlFor="tax-mode">Modo tributario</FieldLabel>
                  <Select defaultValue={data.tax.mode} id="tax-mode" name="mode">
                    <option value="ELECTRONIC_PAYMENT_VOUCHER">
                      Voucher para pago electrónico
                    </option>
                    <option value="DTE_FOR_ALL_SALES">
                      Boleta DTE para toda venta
                    </option>
                    <option value="HYBRID_BY_PAYMENT_METHOD">
                      Híbrido según medio de pago
                    </option>
                  </Select>
                </div>
                <Button disabled={working} type="submit">
                  Guardar datos tributarios
                </Button>
              </form>
            ) : null}

            {selectedStep === "gateway" ? (
              <div className="space-y-6">
                <StepHeading
                  description="El comensal paga directamente a tu comercio. Tablio nunca recibe, retiene ni distribuye esa plata."
                  step={5}
                  title="Conecta la cuenta del bar"
                />
                <Alert className="space-y-1">
                  <p className="text-label uppercase tracking-wide text-muted-foreground">
                    Pasarela simulada
                  </p>
                  <p className="text-h3">{data.gateway.status}</p>
                  <p className="text-small text-muted-foreground">
                    {data.gateway.merchantLabel ?? "Sin conexión"}
                  </p>
                </Alert>
                <div className="flex flex-wrap gap-2">
                  <Button
                    disabled={data.gateway.status !== "disconnected"}
                    onClick={() =>
                      void mutate({ action: "gateway.connect", mode: "oauth" })
                    }
                    type="button"
                  >
                    Conectar mi cuenta
                  </Button>
                  <Button
                    disabled={data.gateway.status === "disconnected"}
                    onClick={() => void mutate({ action: "gateway.verify" })}
                    type="button"
                    variant="outline"
                  >
                    Verificar comercio
                  </Button>
                  <Button
                    disabled={data.gateway.status === "disconnected"}
                    onClick={() => void mutate({ action: "gateway.disconnect" })}
                    type="button"
                    variant="ghost"
                  >
                    Desconectar
                  </Button>
                </div>
              </div>
            ) : null}

            {selectedStep === "staff" ? (
              <form className="space-y-6" onSubmit={submitStaff}>
                <StepHeading description="" step={6} title="Invita al equipo" />
                <div className="grid gap-4 sm:grid-cols-3">
                  <FieldLabel htmlFor="staff-name">Nombre</FieldLabel>
                  <Input
                    id="staff-name"
                    name="name"
                    placeholder="Camila"
                    required
                  />
                  <FieldLabel htmlFor="staff-role">Rol</FieldLabel>
                  <Select id="staff-role" name="role">
                    <option value="waiter">Garzón</option>
                    <option value="cashier_admin">Caja/Admin</option>
                    <option value="kds">KDS</option>
                  </Select>
                  <FieldLabel htmlFor="staff-pin">PIN de 4 dígitos</FieldLabel>
                  <Input
                    id="staff-pin"
                    inputMode="numeric"
                    maxLength={4}
                    name="pin"
                    pattern="\d{4}"
                    required
                  />
                </div>
                <Button disabled={working} type="submit">
                  Agregar persona
                </Button>
                <ul className="space-y-2">
                  {data.staff.map((employee) => (
                    <li
                      className="flex items-center justify-between gap-4 border-b border-border py-2 text-body"
                      key={employee.id}
                    >
                      <strong>{employee.name}</strong>
                      <span className="text-muted-foreground">
                        {employee.role}
                      </span>
                    </li>
                  ))}
                </ul>
              </form>
            ) : null}

            {selectedStep === "qr" ? (
              <div className="space-y-6">
                <StepHeading
                  description="Cada mesa recibe un QR no predecible y un código de presencia de 4 dígitos."
                  step={7}
                  title="QRs y presencia"
                />
                <div className="flex flex-wrap gap-2">
                  <Button
                    onClick={() => void mutate({ action: "qr.generate" })}
                    type="button"
                  >
                    Generar QRs
                  </Button>
                  <Button
                    disabled={!data.qrCodes.length}
                    onClick={() => window.print()}
                    type="button"
                    variant="outline"
                  >
                    Imprimir
                  </Button>
                </div>
                <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
                  {data.qrCodes.slice(0, 12).map((qr) => (
                    <article
                      className="space-y-1 rounded-surface-lg border border-border bg-card p-3 text-center"
                      key={qr.qrToken}
                    >
                      <p className="text-label uppercase tracking-wide text-muted-foreground">
                        QR
                      </p>
                      <p className="text-h3">{qr.tableName}</p>
                      <p className="text-body font-bold tracking-widest">
                        {qr.presenceCode}
                      </p>
                    </article>
                  ))}
                </div>
              </div>
            ) : null}

            {selectedStep === "verification" ? (
              <div className="space-y-6">
                <StepHeading
                  description="El simulador comprueba confirmación server-side, pedido, comandas y devolución sin mover plata."
                  step={8}
                  title="Venta y reembolso de prueba"
                />
                <div className="grid gap-4 sm:grid-cols-2">
                  <Card>
                    <CardContent className="space-y-1 py-6">
                      <p className="text-label uppercase tracking-wide text-muted-foreground">
                        Venta demo
                      </p>
                      <p className="text-h3 capitalize">
                        {data.verification.sale}
                      </p>
                    </CardContent>
                  </Card>
                  <Card>
                    <CardContent className="space-y-1 py-6">
                      <p className="text-label uppercase tracking-wide text-muted-foreground">
                        Reembolso demo
                      </p>
                      <p className="text-h3 capitalize">
                        {data.verification.refund}
                      </p>
                    </CardContent>
                  </Card>
                </div>
                <Button
                  onClick={() => void mutate({ action: "verification.run" })}
                  type="button"
                >
                  Ejecutar prueba completa
                </Button>
              </div>
            ) : null}

            {selectedStep === "production" ? (
              <div className="space-y-6">
                <StepHeading description="" step={9} title="Plan y habilitación" />
                <Alert className="space-y-1">
                  <p className="text-label uppercase tracking-wide text-muted-foreground">
                    Propuesta · hipótesis comercial
                  </p>
                  <p className="text-h3">Plan {data.plan.name}</p>
                  <p className="text-body">
                    {data.plan.monthlyClp
                      ? `${formatClp(data.plan.monthlyClp)}/mes`
                      : "Cotización personalizada"}
                  </p>
                  {data.plan.setupClp ? (
                    <p className="text-small text-muted-foreground">
                      Setup inicial {formatClp(data.plan.setupClp)}
                    </p>
                  ) : null}
                  {data.plan.effectiveAt ? (
                    <p className="text-small text-muted-foreground">
                      Cambio al siguiente ciclo ·{" "}
                      {formatDateTime(data.plan.effectiveAt)}
                    </p>
                  ) : null}
                </Alert>
                <Card>
                  <CardHeader>
                    <CardTitle>Cobro de Tablio</CardTitle>
                    <p className="text-small text-muted-foreground">
                      Este medio paga setup y mensualidad a Tablio. Es
                      independiente de la cuenta donde recibes las ventas del
                      bar.
                    </p>
                  </CardHeader>
                  <CardContent>
                    {data.billing.status === "ready" ? (
                      <p className="text-body font-bold text-success">
                        ✓ {data.billing.paymentMethodLabel}
                      </p>
                    ) : (
                      <Button
                        onClick={() =>
                          void mutate({
                            action: "billing.connect",
                            ownerEmail: "dueno@local.demo",
                          })
                        }
                        type="button"
                        variant="outline"
                      >
                        Conectar cobro demo de Tablio
                      </Button>
                    )}
                  </CardContent>
                </Card>
                <Button
                  disabled={!data.canActivateProduction || working}
                  onClick={() => void mutate({ action: "production.activate" })}
                  type="button"
                >
                  {data.status === "ready"
                    ? "Producción habilitada"
                    : "Habilitar producción"}
                </Button>
              </div>
            ) : null}
          </CardContent>
        </Card>
      </div>
    </AppShell>
  );
}
