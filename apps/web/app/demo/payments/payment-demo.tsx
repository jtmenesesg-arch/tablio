"use client";

import { useState } from "react";

type Scenario =
  | "approved"
  | "rejected"
  | "duplicate"
  | "late"
  | "out_of_order"
  | "partial_refund"
  | "full_refund";

type DemoResult = {
  demo: true;
  warning: string;
  scope: { tenantId: string; merchantAccountId: string };
  providerEvents: Array<{
    eventId: string;
    eventKind: string;
    occurredAt: string;
  }>;
  outbox: Array<{ id: string; topic: string; deduplicationKey: string }>;
  log: Array<{ at: string; label: string; detail: string }>;
};

const scenarios: Array<{
  id: Scenario;
  title: string;
  description: string;
}> = [
  {
    id: "approved",
    title: "Pago aprobado",
    description: "Firma válida y confirmación consultada al proveedor.",
  },
  {
    id: "rejected",
    title: "Pago rechazado",
    description: "Se registra el rechazo y no nace un pedido.",
  },
  {
    id: "duplicate",
    title: "Webhook duplicado",
    description: "Mismo evento dos veces, un solo efecto durable.",
  },
  {
    id: "late",
    title: "Evento tardío",
    description: "Llega dos horas tarde y se reconcilia por consulta.",
  },
  {
    id: "out_of_order",
    title: "Fuera de orden",
    description: "Un pending antiguo no degrada un pago confirmado.",
  },
  {
    id: "partial_refund",
    title: "Reembolso parcial",
    description: "Devuelve $5.000 y conserva el saldo pagado.",
  },
  {
    id: "full_refund",
    title: "Reembolso total",
    description: "Devuelve el total del pago simulado.",
  },
];

export function PaymentDemo() {
  const [result, setResult] = useState<DemoResult>();
  const [running, setRunning] = useState<Scenario>();
  const [error, setError] = useState<string>();

  async function run(scenario: Scenario) {
    setRunning(scenario);
    setError(undefined);
    try {
      const response = await fetch("/api/demo/payments", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ scenario }),
      });
      const body = (await response.json()) as DemoResult | { error: string };
      if (!response.ok || "error" in body) {
        throw new Error("error" in body ? body.error : "La simulación falló");
      }
      setResult(body);
    } catch (caught) {
      setError(
        caught instanceof Error ? caught.message : "La simulación falló",
      );
    } finally {
      setRunning(undefined);
    }
  }

  return (
    <main className="demoShell">
      <section className="demoBanner" aria-label="Advertencia de modo demo">
        <span className="liveDot" aria-hidden="true" />
        MODO DEMO · NO MUEVE DINERO REAL
      </section>

      <header className="demoHeader">
        <div>
          <p className="eyebrow">Tablio · laboratorio financiero</p>
          <h1>Prueba el flujo antes de elegir pasarela.</h1>
        </div>
        <div className="moneyFlow">
          <span>Comensal</span>
          <b>→</b>
          <span>Bar demo</span>
          <small>Tablio no recibe estos fondos</small>
        </div>
      </header>

      <section className="scenarioGrid" aria-label="Escenarios simulados">
        {scenarios.map((scenario) => (
          <button
            className="scenarioCard"
            disabled={Boolean(running)}
            key={scenario.id}
            onClick={() => run(scenario.id)}
            type="button"
          >
            <span>{scenario.title}</span>
            <small>{scenario.description}</small>
            <b>{running === scenario.id ? "Ejecutando…" : "Simular →"}</b>
          </button>
        ))}
      </section>

      {error && <p className="errorMessage">{error}</p>}

      <section className="resultGrid" aria-live="polite">
        <article className="panel timelinePanel">
          <div className="panelHeading">
            <p className="eyebrow">Recorrido</p>
            <span>
              {result ? `${result.log.length} pasos` : "Sin ejecutar"}
            </span>
          </div>
          {!result ? (
            <p className="emptyState">
              Elige un escenario. Verás cada decisión server-side y su efecto.
            </p>
          ) : (
            <ol className="timeline">
              {result.log.map((entry, index) => (
                <li key={`${entry.at}:${index}`}>
                  <span>{index + 1}</span>
                  <div>
                    <b>{entry.label}</b>
                    <p>{entry.detail}</p>
                  </div>
                </li>
              ))}
            </ol>
          )}
        </article>

        <aside className="sideStack">
          <article className="panel counterPanel">
            <p className="eyebrow">Idempotencia</p>
            <div className="counterRow">
              <div>
                <strong>{result?.providerEvents.length ?? 0}</strong>
                <span>eventos únicos</span>
              </div>
              <div>
                <strong>{result?.outbox.length ?? 0}</strong>
                <span>efectos outbox</span>
              </div>
            </div>
          </article>

          <article className="panel boundaryPanel">
            <p className="eyebrow">Límite financiero</p>
            <h2>Venta del bar</h2>
            <p>
              El comercio demo es el receptor. No hay comisión de plataforma,
              split ni custodia de Tablio.
            </p>
            <hr />
            <h2>Mensualidad Tablio</h2>
            <p>
              No participa en esta demo. Tendrá un proveedor y una ruta
              separados en Sprint 8.
            </p>
          </article>
        </aside>
      </section>

      {result && (
        <details className="technicalDetails">
          <summary>Ver evidencia técnica del escenario</summary>
          <div>
            <h3>Eventos aceptados</h3>
            <pre>{JSON.stringify(result.providerEvents, null, 2)}</pre>
            <h3>Outbox</h3>
            <pre>{JSON.stringify(result.outbox, null, 2)}</pre>
          </div>
        </details>
      )}
    </main>
  );
}
