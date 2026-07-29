"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import type { OwnerDashboard as OwnerData } from "../../lib/owner-contract";

const money = (value: number) =>
  new Intl.NumberFormat("es-CL", {
    style: "currency",
    currency: "CLP",
    maximumFractionDigits: 0,
  }).format(value);

export function OwnerDashboard() {
  const [data, setData] = useState<OwnerData>();
  const [venue, setVenue] = useState("all");
  const [newTenant, setNewTenant] = useState(false);

  const load = useCallback(async () => {
    const params = new URLSearchParams({ venue });
    if (newTenant) params.set("new", "1");
    const response = await fetch(`/api/owner?${params}`, { cache: "no-store" });
    setData((await response.json()) as OwnerData);
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

  if (!data) return <main className="ownerShell">Preparando la historia…</main>;

  return (
    <main className="ownerShell">
      <header className="ownerTop">
        <div>
          <p>Panel del dueño · {data.tenant.name}</p>
          <h1>{data.story.headline}</h1>
        </div>
        <div className="ownerControls">
          <label>
            Vista
            <select
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
          </label>
          <button onClick={() => setNewTenant((value) => !value)}>
            {newTenant ? "Ver tenant con historia" : "Ver instalación nueva"}
          </button>
          <a href={`/api/owner?venue=${venue}&format=csv`}>Exportar CSV</a>
        </div>
      </header>

      {data.story.historyMessage ? (
        <section className="ownerHistoryNotice">
          <strong>Estamos aprendiendo cómo funciona tu local.</strong>
          <p>{data.story.historyMessage}</p>
          {data.period.comparisonAppearsAt ? (
            <span>
              Primera comparación estimada:{" "}
              {new Date(data.period.comparisonAppearsAt).toLocaleDateString(
                "es-CL",
              )}
            </span>
          ) : null}
        </section>
      ) : null}

      <section className="ownerFocusGrid">
        <article className="attention">
          <span>Qué necesita atención</span>
          <strong>{data.story.attention}</strong>
        </article>
        <article>
          <span>Qué mejoró</span>
          <strong>{data.story.improved}</strong>
        </article>
        <article className="recommendation">
          <span>Qué recomienda Tablio</span>
          <strong>{data.story.recommendation}</strong>
        </article>
      </section>

      <section className="ownerMainChart">
        <div>
          <p>Ventas por hora</p>
          <h2>El ritmo de hoy</h2>
        </div>
        <div className="ownerBars" role="img" aria-label="Ventas por hora">
          {data.hourlySales.map((item) => (
            <div className={item.isPeak ? "peak" : ""} key={item.hour}>
              <span>{money(item.salesClp)}</span>
              <i
                style={{
                  height: `${Math.max(8, (item.salesClp / maxHourly) * 100)}%`,
                }}
              />
              <small>{item.hour}</small>
              {item.isPeak ? <b>Peak</b> : null}
            </div>
          ))}
        </div>
      </section>

      <section className="ownerLeakage">
        <div>
          <span>El costo real del crédito de mesa este mes</span>
          <strong>{money(data.metrics.monthlyLeakageClp)}</strong>
        </div>
        <p>
          Mes anterior: {money(data.metrics.previousMonthlyLeakageClp)}
          {data.metrics.leakageTrendPercent !== undefined
            ? ` · ${Math.abs(data.metrics.leakageTrendPercent)}% ${
                data.metrics.leakageTrendPercent <= 0 ? "menos" : "más"
              }`
            : ""}
          . Esta cifra no incluye pedidos prepagados.
        </p>
      </section>

      <section className="ownerLoyalty">
        <div>
          <span>Clientes que volvieron</span>
          <strong>{data.metrics.loyalty.returningProfiles}</strong>
          <small>
            de {data.metrics.loyalty.activeProfiles} perfiles activos ·{" "}
            {data.metrics.loyalty.averageVisitFrequency} visitas promedio
          </small>
        </div>
        <div>
          <span>Premios usados</span>
          <strong>{data.metrics.loyalty.rewardsRedeemed}</strong>
          <small>
            Valor de lista {money(data.metrics.loyalty.rewardReferenceValueClp)}
            {data.metrics.loyalty.rewardKnownCostClp !== undefined
              ? ` · costo informado ${money(
                  data.metrics.loyalty.rewardKnownCostClp,
                )}`
              : " · sin costo informado, no calculamos margen"}
          </small>
        </div>
        <div
          className={
            data.metrics.loyalty.identityLossRatePercent >= 15
              ? "attention"
              : ""
          }
        >
          <span>Pérdida de identidad del dispositivo</span>
          <strong>
            {data.metrics.loyalty.identityLossRatePercent.toLocaleString(
              "es-CL",
            )}
            %
          </strong>
          <small>
            {data.metrics.loyalty.identityRecoveries} recuperaciones sin el
            token anterior. Si sube, la continuidad del programa requiere
            atención.
          </small>
        </div>
        <p>
          {data.metrics.loyalty.dormantProfiles > 0
            ? `${data.metrics.loyalty.dormantProfiles} clientes llevan más de 45 días sin volver. El segmento está listo; Tablio no envía mensajes.`
            : "Todavía no hay clientes dormidos. Esta lectura aparecerá cuando exista historial suficiente."}
        </p>
      </section>

      <section className="ownerDetails">
        <article>
          <h3>Productos</h3>
          {data.topProducts.map((item) => (
            <p key={item.name}>
              <strong>{item.name}</strong>
              <span>{item.quantity} pedidos</span>
            </p>
          ))}
          <small>
            Baja rotación:{" "}
            {data.lowRotationProducts.map((item) => item.name).join(", ")}
          </small>
        </article>
        <article>
          <h3>Operación</h3>
          <p>
            <strong>{money(data.metrics.averageTicketClp)}</strong>
            <span>Ticket promedio</span>
          </p>
          <p>
            <strong>{data.metrics.roundsPerTable}</strong>
            <span>Rondas por mesa</span>
          </p>
          <p>
            <strong>{money(data.metrics.tipsClp)}</strong>
            <span>Propinas</span>
          </p>
        </article>
        <article>
          <h3>Locales</h3>
          {data.venueComparison.map((item) => (
            <p key={item.venueId}>
              <strong>{item.venueName}</strong>
              <span>
                {money(item.salesClp)} · {item.unresolvedExceptions} pendientes
              </span>
            </p>
          ))}
        </article>
      </section>

      {data.unresolvedItems.length > 0 ? (
        <section className="ownerExceptions">
          <h2>Excepciones y fugas sin esconder</h2>
          {data.unresolvedItems.map((item) => (
            <div key={item.id}>
              <span>{item.message}</span>
              <strong>{money(item.amountClp)}</strong>
            </div>
          ))}
        </section>
      ) : null}
    </main>
  );
}
