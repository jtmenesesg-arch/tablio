"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { AppShell, AppShellLoading } from "@/components/operational/app-shell";
import { ownerNavigation } from "@/components/operational/owner-navigation";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { formatClp, formatDateTime } from "@/lib/format";

const navItems = ownerNavigation("reports");

type Summary = {
  sales_clp: number;
  order_count: number;
  average_ticket_clp: number;
  prepaid_sales_clp: number;
  credit_sales_clp: number;
  monthly_credit_loss_clp: number;
  unresolved_exceptions: number;
  history_starts_at: string | null;
  hourly_sales: Array<{ hour: string; sales_clp: number }>;
};

function toDateInputValue(date: Date): string {
  return date.toISOString().slice(0, 10);
}

function startOfDay(dateInputValue: string): Date {
  return new Date(`${dateInputValue}T00:00:00`);
}

function endOfDayExclusive(dateInputValue: string): Date {
  const date = startOfDay(dateInputValue);
  date.setDate(date.getDate() + 1);
  return date;
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

export function ReportsDashboard() {
  const today = useMemo(() => toDateInputValue(new Date()), []);
  const [fromInput, setFromInput] = useState(today);
  const [toInput, setToInput] = useState(today);
  const [summary, setSummary] = useState<Summary>();
  const [error, setError] = useState("");

  const load = useCallback(async (from: string, to: string) => {
    const params = new URLSearchParams({
      from: startOfDay(from).toISOString(),
      to: endOfDayExclusive(to).toISOString(),
    });
    const response = await fetch(`/api/reportes?${params.toString()}`, {
      cache: "no-store",
    });
    if (!response.ok) {
      const payload = (await response.json()) as { error?: string };
      setError(payload.error ?? "No pudimos cargar el reporte.");
      return;
    }
    const payload = (await response.json()) as { summary: Summary };
    setSummary(payload.summary);
    setError("");
  }, []);

  useEffect(() => {
    const initial = window.setTimeout(() => void load(fromInput, toInput), 0);
    return () => window.clearTimeout(initial);
    // Sólo se recarga automáticamente al montar; después el botón "Aplicar" controla el rango.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function applyPreset(days: number) {
    const to = toDateInputValue(new Date());
    const from = toDateInputValue(
      new Date(Date.now() - (days - 1) * 24 * 60 * 60 * 1000),
    );
    setFromInput(from);
    setToInput(to);
    void load(from, to);
  }

  if (!summary && !error) return <AppShellLoading navItems={navItems} />;

  const maxHourly = Math.max(
    1,
    ...(summary?.hourly_sales.map((item) => item.sales_clp) ?? [1]),
  );

  return (
    <AppShell
      banner="Datos reales de Supabase"
      branchName="Sucursal principal"
      navItems={navItems}
      tenantName="Bar La Virgen"
    >
      <div className="space-y-6">
        <header className="space-y-2">
          <h1 className="text-h1 tracking-tight text-foreground lg:text-h1-lg">
            Reportes
          </h1>
          <p className="text-body text-muted-foreground">
            Ventas del período elegido, calculadas por la base de datos real.
          </p>
        </header>

        {error ? <Alert tone="danger">{error}</Alert> : null}

        <Card>
          <CardContent className="flex flex-wrap items-end gap-4 py-6">
            <div className="flex gap-2">
              <Button onClick={() => applyPreset(1)} type="button" variant="outline">
                Hoy
              </Button>
              <Button onClick={() => applyPreset(7)} type="button" variant="outline">
                Últimos 7 días
              </Button>
              <Button onClick={() => applyPreset(30)} type="button" variant="outline">
                Últimos 30 días
              </Button>
            </div>
            <label className="block space-y-2 text-small font-bold">
              <span>Desde</span>
              <Input
                onChange={(event) => setFromInput(event.target.value)}
                type="date"
                value={fromInput}
              />
            </label>
            <label className="block space-y-2 text-small font-bold">
              <span>Hasta</span>
              <Input
                onChange={(event) => setToInput(event.target.value)}
                type="date"
                value={toInput}
              />
            </label>
            <Button onClick={() => void load(fromInput, toInput)} type="button">
              Aplicar
            </Button>
          </CardContent>
        </Card>

        {summary && summary.history_starts_at === null ? (
          <Alert tone="warning">
            Todavía no hay pedidos reales registrados en Bar La Virgen — por eso todos los
            números de abajo están en $0. No es un error: los pedidos y pagos hoy se generan en
            el demo simulado, no en la base real (ver OI-033 en <code>docs/OPEN_ISSUES.md</code>).
            Estos números se van a llenar solos apenas la toma de pedidos se conecte a la base
            real.
          </Alert>
        ) : null}

        {summary ? (
          <>
            <section className="grid gap-4 sm:grid-cols-3">
              <MetricCard label="Ventas totales" value={formatClp(summary.sales_clp)} />
              <MetricCard label="Pedidos" value={String(summary.order_count)} />
              <MetricCard
                label="Ticket promedio"
                value={formatClp(summary.average_ticket_clp)}
              />
              <MetricCard
                label="Ventas prepago"
                value={formatClp(summary.prepaid_sales_clp)}
              />
              <MetricCard
                label="Ventas a crédito de mesa"
                value={formatClp(summary.credit_sales_clp)}
              />
              <MetricCard
                label="Pérdida por crédito (mes)"
                value={formatClp(summary.monthly_credit_loss_clp)}
              />
            </section>

            {summary.unresolved_exceptions > 0 ? (
              <Alert tone="warning">
                Hay {summary.unresolved_exceptions} excepción(es) de conciliación sin resolver.
              </Alert>
            ) : null}

            <Card>
              <CardHeader>
                <CardDescription>Ventas por hora</CardDescription>
                <CardTitle>Ritmo del período elegido</CardTitle>
              </CardHeader>
              <CardContent className="overflow-x-auto">
                {summary.hourly_sales.length === 0 ? (
                  <p className="text-body text-muted-foreground">
                    Sin ventas registradas en este período.
                  </p>
                ) : (
                  <div
                    aria-label="Ventas por hora"
                    className="grid min-w-[42rem] auto-cols-fr grid-flow-col gap-3 border-b border-border"
                    role="img"
                  >
                    {summary.hourly_sales.map((item) => (
                      <div
                        aria-label={`${formatDateTime(item.hour)}: ${formatClp(item.sales_clp)}`}
                        className="flex h-chart flex-col justify-end gap-2 text-center"
                        key={item.hour}
                      >
                        <span className="text-label text-foreground">
                          {formatClp(item.sales_clp)}
                        </span>
                        <div
                          className="min-h-2 rounded-t-surface-md bg-foreground"
                          style={{
                            height: `${Math.max(8, (item.sales_clp / maxHourly) * 100)}%`,
                          }}
                        />
                        <span className="text-small text-muted-foreground">
                          {formatDateTime(item.hour).split(" ").pop()}
                        </span>
                      </div>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>
          </>
        ) : null}
      </div>
    </AppShell>
  );
}
