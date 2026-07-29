"use client";

import { useCallback, useEffect, useState } from "react";
import type {
  TableCreditBootstrap,
  TableCreditMutation,
} from "../../lib/table-credit-contract";

const money = (value: number) =>
  new Intl.NumberFormat("es-CL", {
    style: "currency",
    currency: "CLP",
    maximumFractionDigits: 0,
  }).format(value);

export function CreditDemo() {
  const [data, setData] = useState<TableCreditBootstrap>();
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [validationCode, setValidationCode] = useState("");

  const load = useCallback(async () => {
    const response = await fetch("/api/table-credit", { cache: "no-store" });
    setData((await response.json()) as TableCreditBootstrap);
  }, []);

  useEffect(() => {
    const initial = window.setTimeout(() => void load(), 0);
    return () => window.clearTimeout(initial);
  }, [load]);

  async function mutate(mutation: TableCreditMutation) {
    setBusy(true);
    setError("");
    const response = await fetch("/api/table-credit", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(mutation),
    });
    const payload = (await response.json()) as
      TableCreditBootstrap | { error: string };
    setBusy(false);
    if (!response.ok) {
      setError("error" in payload ? payload.error : "No pudimos guardar.");
      return;
    }
    setData(payload as TableCreditBootstrap);
  }

  if (!data)
    return <main className="creditShell">Cargando crédito de mesa…</main>;
  const account = data.accounts[0];

  return (
    <main className="creditShell">
      <header className="creditHero">
        <div>
          <p className="demoPill">MODO DEMO · EXCEPCIÓN CON RIESGO</p>
          <h1>Crédito de mesa</h1>
          <p>
            El prepago sigue siendo el modo principal. Aquí todo pedido sin pago
            aumenta la exposición del local.
          </p>
        </div>
        <a href="/caja">Volver a caja</a>
      </header>

      <section className="creditRiskBar" aria-label="Exposición del local">
        <div>
          <span>Exposición abierta</span>
          <strong>{money(data.exposure.openClp)}</strong>
        </div>
        <div>
          <span>Disponible antes del corte</span>
          <strong>{money(data.exposure.availableClp)}</strong>
        </div>
        <div>
          <span>Máximo del local</span>
          <strong>{money(data.settings.maxVenueExposureClp)}</strong>
        </div>
      </section>

      {account ? (
        <section className="creditAccount">
          <div className="creditAccountHead">
            <div>
              <span className="creditBadge">CRÉDITO ABIERTO · NO PAGADO</span>
              <h2>{account.tableName}</h2>
              <p>
                {money(account.prepaidByAppClp)} pagados por app ·{" "}
                <strong>{money(account.outstandingClp)} en crédito</strong>
              </p>
            </div>
            <div className="creditBalance">
              <span>Saldo del crédito</span>
              <strong>{money(account.outstandingClp)}</strong>
              <small>
                Límite {money(account.maxTableClp)} · vence{" "}
                {new Date(account.expiresAt).toLocaleTimeString("es-CL", {
                  hour: "2-digit",
                  minute: "2-digit",
                })}
              </small>
            </div>
          </div>

          <div className="creditColumns">
            <article>
              <h3>Operación de caja</h3>
              <button
                disabled={busy || account.status !== "open"}
                onClick={() =>
                  void mutate({
                    action: "order.add",
                    accountId: account.id,
                    amountClp: 9_500,
                    description: "Ronda cargada desde caja",
                  })
                }
              >
                Enviar ronda de {money(9_500)}
              </button>
              <button
                disabled={busy || account.outstandingClp === 0}
                onClick={() =>
                  void mutate({
                    action: "payment.add",
                    accountId: account.id,
                    amountClp: Math.min(8_500, account.outstandingClp),
                    method: "digital",
                    idempotencyKey: crypto.randomUUID(),
                  })
                }
              >
                Registrar pago parcial
              </button>
              <button
                disabled={busy || account.status !== "open"}
                onClick={() =>
                  void mutate({ action: "bill.request", accountId: account.id })
                }
              >
                Marcar “pidió la cuenta”
              </button>
              <button
                className="creditDanger"
                disabled={busy || account.outstandingClp === 0}
                onClick={() =>
                  void mutate({
                    action: "account.close_loss",
                    accountId: account.id,
                    reason: "Demo: mesa se retiró sin completar el pago",
                  })
                }
              >
                Cerrar con fuga
              </button>
            </article>

            <article className="creditClientScreen">
              <p>Pantalla del cliente</p>
              <h3>{account.outstandingClp === 0 ? "PAGADO" : "NO PAGADO"}</h3>
              <strong>{money(account.outstandingClp)}</strong>
              {account.outstandingClp === 0 ? (
                <>
                  <button
                    disabled={busy}
                    onClick={() =>
                      void mutate({
                        action: "verification.issue",
                        accountId: account.id,
                      })
                    }
                  >
                    Generar código vivo
                  </button>
                  {account.verification?.status === "active" ? (
                    <div className="creditLiveCode">
                      <span>Código de una sola validación</span>
                      <strong>{account.verification.code}</strong>
                      <small>
                        Vence en 60 segundos; un código anterior no sirve.
                      </small>
                    </div>
                  ) : null}
                </>
              ) : (
                <p>
                  El pedido está en producción, pero el crédito sigue pendiente.
                </p>
              )}
            </article>

            <article>
              <h3>Validación del garzón</h3>
              <label>
                Código que muestra el cliente
                <input
                  inputMode="numeric"
                  maxLength={6}
                  onChange={(event) => setValidationCode(event.target.value)}
                  value={validationCode}
                />
              </label>
              <button
                disabled={busy || validationCode.length !== 6}
                onClick={() =>
                  void mutate({
                    action: "verification.validate",
                    accountId: account.id,
                    code: validationCode,
                  })
                }
              >
                Validar contra el servidor
              </button>
              <p>
                Cada pago agrega un comprobante al spool persistente. En cola:{" "}
                {data.printSpool.length}.
              </p>
            </article>
          </div>

          <div className="creditLedger">
            <h3>Historia del crédito</h3>
            {account.ledger.map((entry) => (
              <div key={entry.id}>
                <span>{entry.description}</span>
                <strong>{money(entry.amountClp)}</strong>
              </div>
            ))}
          </div>
        </section>
      ) : (
        <section className="creditEmpty">
          <h2>No hay créditos abiertos</h2>
          <p>El local vuelve a operar únicamente con prepago.</p>
        </section>
      )}

      {error ? (
        <p className="creditError" role="alert">
          {error}
        </p>
      ) : null}
    </main>
  );
}
