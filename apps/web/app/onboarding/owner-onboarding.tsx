"use client";

import { FormEvent, useEffect, useMemo, useState } from "react";
import type {
  OnboardingBootstrap,
  OnboardingMutation,
  OnboardingStepCode,
} from "../../lib/platform-contract";

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

const money = new Intl.NumberFormat("es-CL", {
  style: "currency",
  currency: "CLP",
  maximumFractionDigits: 0,
});

async function responseBody(response: Response): Promise<OnboardingBootstrap> {
  const body = (await response.json()) as OnboardingBootstrap & {
    error?: string;
  };
  if (!response.ok) throw new Error(body.error ?? "No pudimos guardar.");
  return body;
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

  if (!data) {
    return <main className="platformLoading">Preparando onboarding…</main>;
  }

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
    <main className="platformShell onboardingShell">
      <header className="platformHeader">
        <div>
          <span className="demoPill">MODO DEMO · NO MUEVE DINERO</span>
          <p className="sectionKicker">Preparación del local</p>
          <h1>{data.tenantName}</h1>
          <p>Puedes cerrar esta página y continuar después.</p>
        </div>
        <div className="progressCard" aria-label="Progreso del onboarding">
          <strong>{data.progressPercent}%</strong>
          <span>completado</span>
          <div>
            <i style={{ width: `${data.progressPercent}%` }} />
          </div>
        </div>
      </header>

      <nav className="stepNav" aria-label="Pasos del onboarding">
        {(Object.keys(stepLabels) as OnboardingStepCode[]).map((step) => (
          <button
            className={
              selectedStep === step
                ? "active"
                : completed.has(step)
                  ? "complete"
                  : ""
            }
            key={step}
            onClick={() => setSelectedStep(step)}
            type="button"
          >
            <b>
              {completed.has(step)
                ? "✓"
                : Object.keys(stepLabels).indexOf(step) + 1}
            </b>
            {stepLabels[step]}
          </button>
        ))}
      </nav>

      {error && (
        <div className="platformAlert error" role="alert">
          {error}
        </div>
      )}

      <section className="platformPanel">
        {selectedStep === "venue" && (
          <form className="platformForm" onSubmit={submitVenue}>
            <div className="panelHeading">
              <p className="sectionKicker">Paso 1</p>
              <h2>Cuéntanos sobre el local</h2>
              <p>Estos datos aparecen en la carta y los comprobantes.</p>
            </div>
            <label>
              Nombre del local
              <input defaultValue={data.venue.name} name="name" required />
            </label>
            <label>
              Dirección
              <input
                defaultValue={data.venue.address}
                name="address"
                required
              />
            </label>
            <div className="formGrid">
              <label>
                Tipo de local
                <select defaultValue={data.venue.venueType} name="venueType">
                  <option>Bar</option>
                  <option>Cervecería</option>
                  <option>Pub</option>
                  <option>Food hall</option>
                </select>
              </label>
              <label>
                Horario
                <input
                  defaultValue={data.venue.openingHours}
                  name="openingHours"
                />
              </label>
            </div>
            <button className="platformPrimary" disabled={working}>
              Guardar y continuar
            </button>
          </form>
        )}

        {selectedStep === "size" && (
          <form className="platformForm" onSubmit={submitSize}>
            <div className="panelHeading">
              <p className="sectionKicker">Paso 2</p>
              <h2>Mesas, zonas y estaciones</h2>
              <p>
                Las mesas determinan principalmente el plan. El layout sólo
                influye si zonas y estaciones exceden juntas límites generosos.
              </p>
            </div>
            <label>
              Zonas · una por línea, con cantidad de mesas
              <textarea
                defaultValue={
                  data.size.zones.length
                    ? data.size.zones
                        .map((zone) => `${zone.name}:${zone.tableCount}`)
                        .join("\n")
                    : "Salón:8\nTerraza:4"
                }
                name="zones"
                rows={4}
              />
            </label>
            <label>
              Estaciones separadas por coma
              <input
                defaultValue={
                  data.size.stations
                    .map((station) => station.name)
                    .join(", ") || "Barra, Cocina"
                }
                name="stations"
              />
            </label>
            <aside className="planProposal" data-plan={data.plan.proposed}>
              <span>Plan propuesto · hipótesis comercial</span>
              <strong>{data.plan.name}</strong>
              <b>
                {data.plan.monthlyClp
                  ? `${money.format(data.plan.monthlyClp)}/mes`
                  : "Cotización personalizada"}
              </b>
              <small>{data.size.tableCount} mesas activas</small>
            </aside>
            <button className="platformPrimary" disabled={working}>
              Guardar tamaño
            </button>
          </form>
        )}

        {selectedStep === "menu" && (
          <div className="platformForm">
            <div className="panelHeading">
              <p className="sectionKicker">Paso 3</p>
              <h2>Importa y revisa la carta</h2>
              <p>
                Nunca publicamos automáticamente. Tú confirmas cada precio.
                Puedes lanzar sin fotografías.
              </p>
            </div>
            <label>
              Origen
              <select
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
              </select>
            </label>
            {menuSource === "text" || menuSource === "link" ? (
              <label>
                {menuSource === "text" ? "Pega la carta" : "Enlace de la carta"}
                <textarea
                  onChange={(event) => setMenuContent(event.target.value)}
                  rows={5}
                  value={menuContent}
                />
              </label>
            ) : (
              <label>
                Selecciona {menuSource === "pdf" ? "un PDF" : "una imagen"}
                <input
                  accept={menuSource === "pdf" ? ".pdf" : "image/*"}
                  onChange={(event) =>
                    setMenuContent(event.target.files?.[0]?.name ?? "")
                  }
                  type="file"
                />
              </label>
            )}
            <button
              className="platformSecondary"
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
            >
              Extraer borrador
            </button>
            {data.menu.items.length > 0 && (
              <>
                <div className="reviewWarning">
                  <strong>Revisión humana obligatoria</strong>
                  <span>
                    Corrige nombres y precios. Todavía no está publicado.
                  </span>
                </div>
                <div className="menuReviewTable">
                  {data.menu.items.map((item) => (
                    <article key={item.id}>
                      <label>
                        Producto
                        <input
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
                      <label>
                        Categoría
                        <input
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
                      <label>
                        Precio CLP
                        <input
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
                <div className="buttonRow">
                  <button
                    className="platformSecondary"
                    onClick={() =>
                      void mutate({ action: "menu.review.confirm" })
                    }
                    type="button"
                  >
                    Confirmar revisión
                  </button>
                  <button
                    className="platformPrimary"
                    disabled={data.menu.status !== "reviewed" || working}
                    onClick={() => void mutate({ action: "menu.publish" })}
                    type="button"
                  >
                    Publicar carta revisada
                  </button>
                </div>
              </>
            )}
          </div>
        )}

        {selectedStep === "tax" && (
          <form className="platformForm" onSubmit={submitTax}>
            <div className="panelHeading">
              <p className="sectionKicker">Paso 4</p>
              <h2>Datos tributarios</h2>
              <p>El proveedor DTE real sigue pendiente antes del piloto.</p>
            </div>
            <div className="formGrid">
              <label>
                RUT del emisor
                <input defaultValue={data.tax.rut} name="rut" required />
              </label>
              <label>
                Giro
                <input
                  defaultValue={data.tax.businessActivity}
                  name="businessActivity"
                  required
                />
              </label>
            </div>
            <label>
              Dirección tributaria
              <input
                defaultValue={data.tax.issuerAddress}
                name="issuerAddress"
              />
            </label>
            <label>
              Modo tributario
              <select defaultValue={data.tax.mode} name="mode">
                <option value="ELECTRONIC_PAYMENT_VOUCHER">
                  Voucher para pago electrónico
                </option>
                <option value="DTE_FOR_ALL_SALES">
                  Boleta DTE para toda venta
                </option>
                <option value="HYBRID_BY_PAYMENT_METHOD">
                  Híbrido según medio de pago
                </option>
              </select>
            </label>
            <button className="platformPrimary" disabled={working}>
              Guardar datos tributarios
            </button>
          </form>
        )}

        {selectedStep === "gateway" && (
          <div className="platformForm">
            <div className="panelHeading">
              <p className="sectionKicker">Paso 5</p>
              <h2>Conecta la cuenta del bar</h2>
              <p>
                El comensal paga directamente a tu comercio. Tablio nunca
                recibe, retiene ni distribuye esa plata.
              </p>
            </div>
            <div className="gatewayCard">
              <span>Pasarela simulada</span>
              <strong>{data.gateway.status}</strong>
              <small>{data.gateway.merchantLabel ?? "Sin conexión"}</small>
            </div>
            <div className="buttonRow">
              <button
                className="platformPrimary"
                disabled={data.gateway.status !== "disconnected"}
                onClick={() =>
                  void mutate({ action: "gateway.connect", mode: "oauth" })
                }
                type="button"
              >
                Conectar mi cuenta
              </button>
              <button
                className="platformSecondary"
                disabled={data.gateway.status === "disconnected"}
                onClick={() => void mutate({ action: "gateway.verify" })}
                type="button"
              >
                Verificar comercio
              </button>
              <button
                className="platformTextButton"
                disabled={data.gateway.status === "disconnected"}
                onClick={() => void mutate({ action: "gateway.disconnect" })}
                type="button"
              >
                Desconectar
              </button>
            </div>
          </div>
        )}

        {selectedStep === "staff" && (
          <form className="platformForm" onSubmit={submitStaff}>
            <div className="panelHeading">
              <p className="sectionKicker">Paso 6</p>
              <h2>Invita al equipo</h2>
            </div>
            <div className="formGrid three">
              <label>
                Nombre
                <input name="name" placeholder="Camila" required />
              </label>
              <label>
                Rol
                <select name="role">
                  <option value="waiter">Garzón</option>
                  <option value="cashier_admin">Caja/Admin</option>
                  <option value="kds">KDS</option>
                </select>
              </label>
              <label>
                PIN de 4 dígitos
                <input
                  inputMode="numeric"
                  maxLength={4}
                  name="pin"
                  pattern="\d{4}"
                  required
                />
              </label>
            </div>
            <button className="platformPrimary" disabled={working}>
              Agregar persona
            </button>
            <ul className="compactList">
              {data.staff.map((employee) => (
                <li key={employee.id}>
                  <strong>{employee.name}</strong>
                  <span>{employee.role}</span>
                </li>
              ))}
            </ul>
          </form>
        )}

        {selectedStep === "qr" && (
          <div className="platformForm">
            <div className="panelHeading">
              <p className="sectionKicker">Paso 7</p>
              <h2>QRs y presencia</h2>
              <p>
                Cada mesa recibe un QR no predecible y un código de presencia de
                4 dígitos.
              </p>
            </div>
            <div className="buttonRow">
              <button
                className="platformPrimary"
                onClick={() => void mutate({ action: "qr.generate" })}
                type="button"
              >
                Generar QRs
              </button>
              <button
                className="platformSecondary"
                disabled={!data.qrCodes.length}
                onClick={() => window.print()}
                type="button"
              >
                Imprimir
              </button>
            </div>
            <div className="qrGrid">
              {data.qrCodes.slice(0, 12).map((qr) => (
                <article key={qr.qrToken}>
                  <span>QR</span>
                  <strong>{qr.tableName}</strong>
                  <b>{qr.presenceCode}</b>
                </article>
              ))}
            </div>
          </div>
        )}

        {selectedStep === "verification" && (
          <div className="platformForm">
            <div className="panelHeading">
              <p className="sectionKicker">Paso 8</p>
              <h2>Venta y reembolso de prueba</h2>
              <p>
                El simulador comprueba confirmación server-side, pedido,
                comandas y devolución sin mover plata.
              </p>
            </div>
            <div className="verificationGrid">
              <article>
                <span>Venta demo</span>
                <strong>{data.verification.sale}</strong>
              </article>
              <article>
                <span>Reembolso demo</span>
                <strong>{data.verification.refund}</strong>
              </article>
            </div>
            <button
              className="platformPrimary"
              onClick={() => void mutate({ action: "verification.run" })}
              type="button"
            >
              Ejecutar prueba completa
            </button>
          </div>
        )}

        {selectedStep === "production" && (
          <div className="platformForm">
            <div className="panelHeading">
              <p className="sectionKicker">Paso 9</p>
              <h2>Plan y habilitación</h2>
            </div>
            <aside className="planProposal final">
              <span>Propuesta · hipótesis comercial</span>
              <strong>Plan {data.plan.name}</strong>
              <b>
                {data.plan.monthlyClp
                  ? `${money.format(data.plan.monthlyClp)}/mes`
                  : "Cotización personalizada"}
              </b>
              {data.plan.setupClp && (
                <small>Setup inicial {money.format(data.plan.setupClp)}</small>
              )}
              {data.plan.effectiveAt && (
                <small>
                  Cambio al siguiente ciclo ·{" "}
                  {new Date(data.plan.effectiveAt).toLocaleDateString("es-CL")}
                </small>
              )}
            </aside>
            <div className="billingConnect">
              <strong>Cobro de Tablio</strong>
              <p>
                Este medio paga setup y mensualidad a Tablio. Es independiente
                de la cuenta donde recibes las ventas del bar.
              </p>
              {data.billing.status === "ready" ? (
                <span>✓ {data.billing.paymentMethodLabel}</span>
              ) : (
                <button
                  className="platformSecondary"
                  onClick={() =>
                    void mutate({
                      action: "billing.connect",
                      ownerEmail: "dueno@local.demo",
                    })
                  }
                  type="button"
                >
                  Conectar cobro demo de Tablio
                </button>
              )}
            </div>
            <button
              className="platformPrimary"
              disabled={!data.canActivateProduction || working}
              onClick={() => void mutate({ action: "production.activate" })}
              type="button"
            >
              {data.status === "ready"
                ? "Producción habilitada"
                : "Habilitar producción"}
            </button>
          </div>
        )}
      </section>
    </main>
  );
}
