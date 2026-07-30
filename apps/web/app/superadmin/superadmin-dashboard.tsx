"use client";

import { useEffect, useState } from "react";
import type {
  SuperadminBootstrap,
  SuperadminMutation,
  SuperadminTenant,
} from "../../lib/platform-contract";

const money = new Intl.NumberFormat("es-CL", {
  style: "currency",
  currency: "CLP",
  maximumFractionDigits: 0,
});

async function readResponse(response: Response): Promise<SuperadminBootstrap> {
  const body = (await response.json()) as SuperadminBootstrap & {
    error?: string;
  };
  if (!response.ok) throw new Error(body.error ?? "Acción rechazada.");
  return body;
}

const statusLabel: Record<SuperadminTenant["subscriptionStatus"], string> = {
  trialing: "Prueba",
  active: "Al día",
  past_due: "Cobro fallido",
  grace: "En gracia",
  admin_restricted: "Administración restringida",
  suspension_scheduled: "Suspensión agendada",
  suspended: "Suspendido",
  cancelled: "Cancelado",
};

export function SuperadminDashboard() {
  const [data, setData] = useState<SuperadminBootstrap>();
  const [selectedTenant, setSelectedTenant] = useState<string>();
  const [error, setError] = useState<string>();
  const [working, setWorking] = useState(false);

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

  if (!data)
    return <main className="platformLoading">Abriendo plataforma…</main>;
  const selected = data.tenants.find((tenant) => tenant.id === selectedTenant);

  return (
    <main className="platformShell superadminShell">
      <header className="platformHeader dark">
        <div>
          <span className="demoPill">SUPERADMIN · DEMO</span>
          <p className="sectionKicker">Tablio plataforma</p>
          <h1>Negocio y soporte</h1>
          <p>
            {data.actor.name} · acceso entre tenants exclusivamente auditado.
          </p>
        </div>
        <button
          className="platformPrimary"
          onClick={() => {
            const name = window.prompt("Nombre del nuevo tenant");
            if (name) void mutate({ action: "tenant.create", name });
          }}
          type="button"
        >
          Alta de tenant
        </button>
      </header>

      {error && (
        <div className="platformAlert error" role="alert">
          {error}
        </div>
      )}

      <section className="metricGrid">
        <article>
          <span>Locales activos</span>
          <strong>{data.metrics.activeTenants}</strong>
        </article>
        <article>
          <span>MRR</span>
          <strong>{money.format(data.metrics.mrrClp)}</strong>
        </article>
        <article>
          <span>Churn</span>
          <strong>{data.metrics.churnPercent}%</strong>
        </article>
        <article>
          <span>Pedidos · 30 días</span>
          <strong>
            {data.metrics.ordersLast30Days.toLocaleString("es-CL")}
          </strong>
        </article>
        <article
          className={
            data.metrics.tenantsOverStoredValueThreshold ? "metricAlert" : ""
          }
        >
          <span>Pasivo de clientes</span>
          <strong>{money.format(data.metrics.storedValueLiabilityClp)}</strong>
          <small>
            {data.metrics.tenantsOverStoredValueThreshold} local(es) sobre su
            umbral
          </small>
        </article>
      </section>

      <section className="superadminGrid">
        <div className="platformPanel tenantListPanel">
          <div className="panelHeading">
            <p className="sectionKicker">Tenants</p>
            <h2>Locales y estado</h2>
          </div>
          <div className="tenantTable" role="table">
            {data.tenants.map((tenant) => (
              <button
                className={selectedTenant === tenant.id ? "selected" : ""}
                data-tenant-id={tenant.id}
                key={tenant.id}
                onClick={() => setSelectedTenant(tenant.id)}
                role="row"
                type="button"
              >
                <span>
                  <strong>{tenant.name}</strong>
                  <small>
                    {tenant.tableCount} mesas · {tenant.planCode}
                  </small>
                </span>
                <span>
                  <b className={`tenantStatus ${tenant.subscriptionStatus}`}>
                    {statusLabel[tenant.subscriptionStatus]}
                  </b>
                  <small>
                    {tenant.gatewayConnected
                      ? "Pasarela conectada"
                      : "Sin pasarela"}
                  </small>
                  <small
                    className={tenant.storedValueAlert ? "dangerText" : ""}
                  >
                    Saldo clientes:{" "}
                    {money.format(tenant.storedValueLiabilityClp)}
                    {tenant.storedValueAlert ? " · ALERTA" : ""}
                  </small>
                </span>
              </button>
            ))}
          </div>
        </div>

        <aside className="platformPanel tenantDetail">
          {selected ? (
            <>
              <div className="panelHeading">
                <p className="sectionKicker">Detalle</p>
                <h2>{selected.name}</h2>
                <p>
                  Última actividad{" "}
                  {new Date(selected.lastActivityAt).toLocaleString("es-CL")}
                </p>
              </div>
              <dl className="detailList">
                <div>
                  <dt>Plan</dt>
                  <dd>
                    {selected.planCode} · {money.format(selected.monthlyClp)}
                  </dd>
                </div>
                <div>
                  <dt>Acceso operativo</dt>
                  <dd>{selected.operationalAccess}</dd>
                </div>
                <div>
                  <dt>Proveedor DTE</dt>
                  <dd>{selected.dteProvider}</dd>
                </div>
                <div>
                  <dt>Pasivo por saldo</dt>
                  <dd className={selected.storedValueAlert ? "dangerText" : ""}>
                    {money.format(selected.storedValueLiabilityClp)}
                    {selected.storedValueAlert
                      ? " · supera el umbral de Tablio"
                      : ""}
                  </dd>
                </div>
                <div>
                  <dt>Alerta desde</dt>
                  <dd>{money.format(selected.storedValueAlertThresholdClp)}</dd>
                </div>
              </dl>

              <div className="adminActionGroup">
                <strong>Exposición de dinero de clientes</strong>
                <p>
                  Este pasivo pertenece al local. Antes de suspenderlo o
                  cerrarlo, Tablio debe revisar cómo se devolverá o consumirá.
                </p>
                <button
                  className="platformSecondary"
                  disabled={working}
                  onClick={() => {
                    const raw = window.prompt(
                      "Alertar cuando el pasivo llegue a (CLP):",
                      String(selected.storedValueAlertThresholdClp),
                    );
                    if (raw !== null) {
                      const thresholdClp = Number(raw.replace(/\D/g, "")) || 0;
                      void mutate({
                        action: "tenant.stored_value_threshold.set",
                        tenantId: selected.id,
                        thresholdClp,
                      });
                    }
                  }}
                  type="button"
                >
                  Configurar umbral
                </button>
              </div>

              <div className="adminActionGroup">
                <strong>Cobranza simulada</strong>
                <div className="buttonRow">
                  <button
                    className="platformSecondary"
                    disabled={working}
                    onClick={() =>
                      void mutate({
                        action: "billing.fail",
                        tenantId: selected.id,
                      })
                    }
                    type="button"
                  >
                    Simular cobro fallido
                  </button>
                  <button
                    className="platformSecondary"
                    disabled={working}
                    onClick={() =>
                      void mutate({
                        action: "billing.retry",
                        tenantId: selected.id,
                      })
                    }
                    type="button"
                  >
                    Reintentar
                  </button>
                </div>
                <select
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
                  {Object.entries(statusLabel).map(([value, label]) => (
                    <option key={value} value={value}>
                      {label}
                    </option>
                  ))}
                </select>
                <small>
                  Sólo Suspendido bloquea pedidos nuevos. Las comandas pagadas
                  siguen su curso.
                </small>
              </div>

              <div className="adminActionGroup">
                <strong>Feature flags</strong>
                <div className="flagList">
                  {["reconciliation", "advanced_reports", "menu_import"].map(
                    (flag) => (
                      <label key={flag}>
                        <input
                          checked={selected.featureFlags.includes(flag)}
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

              <div className="buttonRow">
                <button
                  className="platformPrimary"
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
                </button>
                <button
                  className="platformTextButton danger"
                  onClick={() => {
                    const reason = window.prompt("Motivo de la baja");
                    if (reason) {
                      void mutate({
                        action: "tenant.close",
                        tenantId: selected.id,
                        reason,
                      });
                    }
                  }}
                  type="button"
                >
                  Dar de baja
                </button>
              </div>
            </>
          ) : (
            <div className="emptyDetail">
              <strong>Selecciona un local</strong>
              <p>Verás plan, proveedores, funciones y soporte auditado.</p>
            </div>
          )}
        </aside>
      </section>

      <section className="platformPanel auditPanel">
        <div className="panelHeading">
          <p className="sectionKicker">Cobranza</p>
          <h2>Avisos y reintentos</h2>
        </div>
        {data.notifications.length ? (
          <ul className="compactList">
            {data.notifications.map((notification) => (
              <li key={notification.id}>
                <strong>{notification.kind}</strong>
                <span>{notification.message}</span>
              </li>
            ))}
          </ul>
        ) : (
          <p>No hay avisos comerciales pendientes.</p>
        )}
      </section>

      <section className="platformPanel auditPanel">
        <div className="panelHeading">
          <p className="sectionKicker">Auditoría</p>
          <h2>Impersonaciones</h2>
        </div>
        {data.impersonationAudit.length ? (
          <ul className="compactList">
            {data.impersonationAudit.map((entry) => (
              <li key={entry.id}>
                <strong>{entry.actorName}</strong>
                <span>
                  {entry.tenantName} · {entry.reason}
                </span>
              </li>
            ))}
          </ul>
        ) : (
          <p>No hay accesos de soporte en esta sesión.</p>
        )}
      </section>
    </main>
  );
}
