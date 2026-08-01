"use client";

import { useCallback, useEffect, useState } from "react";
import { AppShell, AppShellLoading } from "@/components/operational/app-shell";
import { ownerNavigation } from "@/components/operational/owner-navigation";
import { Alert } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { formatClp, formatTime } from "@/lib/format";
import type {
  TableCreditBootstrap,
  TableCreditMutation,
} from "@/lib/table-credit-contract";

const navItems = ownerNavigation("cashier");

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

  if (!data) return <AppShellLoading navItems={navItems} />;

  const account = data.accounts[0];

  return (
    <AppShell
      banner="Modo demo · no mueve dinero real"
      branchName="Sucursal principal"
      navItems={navItems}
      tenantName="Tu bar"
    >
      <div className="space-y-6">
        <header className="flex flex-col gap-6 lg:flex-row lg:items-start lg:justify-between">
          <div className="space-y-2">
            <Badge variant="warning">Excepción con riesgo</Badge>
            <h1 className="text-h1 tracking-tight text-foreground lg:text-h1-lg">
              Crédito de mesa
            </h1>
            <p className="text-body text-muted-foreground">
              El prepago sigue siendo el modo principal. Aquí todo pedido sin
              pago aumenta la exposición del local.
            </p>
          </div>
          <Button asChild variant="outline">
            <a href="/caja">Volver a caja</a>
          </Button>
        </header>

        {error ? <Alert data-testid="credit-error" tone="danger">{error}</Alert> : null}

        <section
          aria-label="Exposición del local"
          className="grid gap-4 sm:grid-cols-3"
        >
          <MetricCard
            label="Exposición abierta"
            value={formatClp(data.exposure.openClp)}
          />
          <MetricCard
            label="Disponible antes del corte"
            value={formatClp(data.exposure.availableClp)}
          />
          <MetricCard
            label="Máximo del local"
            value={formatClp(data.settings.maxVenueExposureClp)}
          />
        </section>

        {account ? (
          <>
            <Card>
              <CardContent className="flex flex-col gap-4 py-6 sm:flex-row sm:items-start sm:justify-between">
                <div className="space-y-2">
                  <Badge variant="warning">Crédito abierto · no pagado</Badge>
                  <h2 className="text-h2 text-foreground">
                    {account.tableName}
                  </h2>
                  <p className="text-body text-muted-foreground">
                    {formatClp(account.prepaidByAppClp)} pagados por app ·{" "}
                    <strong className="text-foreground">
                      {formatClp(account.outstandingClp)} en crédito
                    </strong>
                  </p>
                </div>
                <div className="space-y-1 rounded-surface-lg border border-border bg-muted p-4 sm:text-right">
                  <p className="text-label uppercase tracking-wide text-muted-foreground">
                    Saldo del crédito
                  </p>
                  <p className="text-h1">{formatClp(account.outstandingClp)}</p>
                  <p className="text-small text-muted-foreground">
                    Límite {formatClp(account.maxTableClp)} · vence{" "}
                    {formatTime(account.expiresAt)}
                  </p>
                </div>
              </CardContent>
            </Card>

            <section className="grid gap-4 lg:grid-cols-3">
              <Card>
                <CardHeader>
                  <CardTitle>Operación de caja</CardTitle>
                </CardHeader>
                <CardContent className="space-y-2">
                  <Button
                    className="w-full"
                    disabled={busy || account.status !== "open"}
                    onClick={() =>
                      void mutate({
                        action: "order.add",
                        accountId: account.id,
                        amountClp: 9_500,
                        description: "Ronda cargada desde caja",
                      })
                    }
                    type="button"
                    variant="outline"
                  >
                    Enviar ronda de {formatClp(9_500)}
                  </Button>
                  <Button
                    className="w-full"
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
                    type="button"
                    variant="outline"
                  >
                    Registrar pago parcial
                  </Button>
                  <Button
                    className="w-full"
                    disabled={busy || account.status !== "open"}
                    onClick={() =>
                      void mutate({
                        action: "bill.request",
                        accountId: account.id,
                      })
                    }
                    type="button"
                    variant="outline"
                  >
                    Marcar &ldquo;pidió la cuenta&rdquo;
                  </Button>
                  <Button
                    className="w-full"
                    disabled={busy || account.outstandingClp === 0}
                    onClick={() =>
                      void mutate({
                        action: "account.close_loss",
                        accountId: account.id,
                        reason: "Demo: mesa se retiró sin completar el pago",
                      })
                    }
                    type="button"
                    variant="destructive"
                  >
                    Cerrar con fuga
                  </Button>
                </CardContent>
              </Card>

              <Card className="border-foreground bg-foreground text-background">
                <CardContent className="space-y-2 py-6">
                  <p className="text-small text-background/70">
                    Pantalla del cliente
                  </p>
                  <h3 className="text-h2 text-background">
                    {account.outstandingClp === 0 ? "PAGADO" : "NO PAGADO"}
                  </h3>
                  <p className="text-h1 text-background">
                    {formatClp(account.outstandingClp)}
                  </p>
                  {account.outstandingClp === 0 ? (
                    <>
                      <Button
                        disabled={busy}
                        onClick={() =>
                          void mutate({
                            action: "verification.issue",
                            accountId: account.id,
                          })
                        }
                        type="button"
                        variant="secondary"
                      >
                        Generar código vivo
                      </Button>
                      {account.verification?.status === "active" ? (
                        <div
                          className="space-y-1 rounded-surface-lg border border-background/30 bg-background/10 p-3"
                          data-testid="credit-live-code"
                        >
                          <p className="text-small text-background/70">
                            Código de una sola validación
                          </p>
                          <p
                            className="text-h1 tracking-[0.3em] text-background"
                            data-testid="credit-live-code-value"
                          >
                            {account.verification.code}
                          </p>
                          <p className="text-small text-background/70">
                            Vence en 60 segundos; un código anterior no sirve.
                          </p>
                        </div>
                      ) : null}
                    </>
                  ) : (
                    <p className="text-small text-background/70">
                      El pedido está en producción, pero el crédito sigue
                      pendiente.
                    </p>
                  )}
                </CardContent>
              </Card>

              <Card>
                <CardHeader>
                  <CardTitle>Validación del garzón</CardTitle>
                </CardHeader>
                <CardContent className="space-y-3">
                  <label className="block space-y-2 text-small font-bold">
                    <span>Código que muestra el cliente</span>
                    <Input
                      inputMode="numeric"
                      maxLength={6}
                      onChange={(event) => setValidationCode(event.target.value)}
                      value={validationCode}
                    />
                  </label>
                  <Button
                    className="w-full"
                    disabled={busy || validationCode.length !== 6}
                    onClick={() =>
                      void mutate({
                        action: "verification.validate",
                        accountId: account.id,
                        code: validationCode,
                      })
                    }
                    type="button"
                  >
                    Validar contra el servidor
                  </Button>
                  <p className="text-small text-muted-foreground">
                    Cada pago agrega un comprobante al spool persistente. En
                    cola: {data.printSpool.length}.
                  </p>
                </CardContent>
              </Card>
            </section>

            <Card>
              <CardHeader>
                <CardTitle>Historia del crédito</CardTitle>
              </CardHeader>
              <CardContent className="space-y-2">
                {account.ledger.map((entry) => (
                  <div
                    className="flex items-center justify-between gap-4 border-b border-border py-2 text-body"
                    key={entry.id}
                  >
                    <span className="text-muted-foreground">
                      {entry.description}
                    </span>
                    <strong>{formatClp(entry.amountClp)}</strong>
                  </div>
                ))}
              </CardContent>
            </Card>
          </>
        ) : (
          <Card>
            <CardContent className="py-12 text-center">
              <h2 className="text-h2">No hay créditos abiertos</h2>
              <p className="mt-2 text-body text-muted-foreground">
                El local vuelve a operar únicamente con prepago.
              </p>
            </CardContent>
          </Card>
        )}
      </div>
    </AppShell>
  );
}
