"use client";

import Image from "next/image";
import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import { AppShell, AppShellLoading } from "@/components/operational/app-shell";
import { ownerNavigation } from "@/components/operational/owner-navigation";
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
import { PeopleIcon, PlusIcon, PrintIcon, QrIcon } from "@/components/ui/icons";
import { Select } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { formatDuration } from "@/lib/format";
import type {
  ManagedTable,
  TableManagementMutation,
  TableManagementSnapshot,
} from "@/lib/table-management-contract";
import {
  presenceLevelDictionary,
  qrStatusDictionary,
  tableStatusDictionary,
} from "@/lib/ui-statuses";

type DialogMode = "bulk" | "qr" | "revoke" | "rotate" | "single";

const navItems = ownerNavigation("tables");

function plural(count: number, singular: string, pluralForm: string) {
  return `${count} ${count === 1 ? singular : pluralForm}`;
}

function FieldLabel({
  children,
  htmlFor,
}: {
  children: string;
  htmlFor: string;
}) {
  return (
    <label className="block space-y-2 text-small font-bold" htmlFor={htmlFor}>
      <span>{children}</span>
    </label>
  );
}

export function TableManagementDashboard() {
  const [data, setData] = useState<TableManagementSnapshot>();
  const [error, setError] = useState<string>();
  const [notice, setNotice] = useState<string>();
  const [dialog, setDialog] = useState<DialogMode>();
  const [selected, setSelected] = useState<ManagedTable>();
  const [working, setWorking] = useState(false);

  const load = useCallback(async () => {
    try {
      setError(undefined);
      const response = await fetch("/api/owner/tables", { cache: "no-store" });
      if (!response.ok) throw new Error("tables-unavailable");
      setData((await response.json()) as TableManagementSnapshot);
    } catch {
      setError(
        "No pudimos cargar las mesas. Revisa tu conexión y vuelve a intentar.",
      );
    }
  }, []);

  useEffect(() => {
    const initial = window.setTimeout(() => void load(), 0);
    return () => window.clearTimeout(initial);
  }, [load]);

  const counts = useMemo(() => {
    const tables = data?.tables ?? [];
    return {
      available: tables.filter((table) => table.state === "available").length,
      occupied: tables.filter((table) => table.state !== "available").length,
      total: tables.length,
    };
  }, [data]);

  async function mutate(
    mutation: TableManagementMutation,
    successMessage: string,
  ) {
    setWorking(true);
    setError(undefined);
    try {
      const response = await fetch("/api/owner/tables", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(mutation),
      });
      const body = (await response.json()) as TableManagementSnapshot & {
        error?: string;
      };
      if (!response.ok)
        throw new Error(body.error ?? "No pudimos guardar el cambio.");
      setData(body);
      setDialog(undefined);
      setNotice(successMessage);
    } catch (mutationError) {
      setError(
        mutationError instanceof Error
          ? mutationError.message
          : "No pudimos guardar el cambio.",
      );
    } finally {
      setWorking(false);
    }
  }

  function open(mode: DialogMode, table?: ManagedTable) {
    setSelected(table);
    setError(undefined);
    setNotice(undefined);
    setDialog(mode);
  }

  if (!data && !error) return <AppShellLoading navItems={navItems} />;
  if (!data) {
    return (
      <AppShell
        banner="Modo demo · no mueve dinero real"
        branchName="Sucursal principal"
        navItems={navItems}
        tenantName="Tu bar"
      >
        <Alert className="space-y-4" tone="danger">
          <h1 className="text-h2">No pudimos mostrar las mesas</h1>
          <p>{error}</p>
          <Button onClick={() => void load()} type="button">
            Volver a intentar
          </Button>
        </Alert>
      </AppShell>
    );
  }

  return (
    <AppShell
      banner="Modo demo · no mueve dinero real"
      branchName={data.branchName}
      navItems={navItems}
      tenantName={data.tenantName}
    >
      <div className="space-y-6" data-table-management-ready>
        <header className="flex flex-col gap-6 lg:flex-row lg:items-start lg:justify-between">
          <div className="space-y-2">
            <h1 className="text-h1 tracking-tight lg:text-h1-lg">Mesas</h1>
            <p className="text-body text-muted-foreground">
              {plural(counts.available, "libre", "libres")} ·{" "}
              {plural(counts.occupied, "ocupada", "ocupadas")} · {counts.total}{" "}
              total
            </p>
          </div>
          <div className="flex flex-col gap-2 sm:flex-row">
            <Button asChild variant="outline">
              <Link
                href="/dueno/mesas/imprimir"
                prefetch={false}
                target="_blank"
              >
                <PrintIcon aria-hidden="true" />
                Imprimir todas
              </Link>
            </Button>
            <Button
              onClick={() => open("bulk")}
              type="button"
              variant="outline"
            >
              Crear varias
            </Button>
            <Button onClick={() => open("single")} type="button">
              <PlusIcon aria-hidden="true" />
              Nueva mesa
            </Button>
          </div>
        </header>

        {notice ? <Alert tone="success">{notice}</Alert> : null}
        {error ? <Alert tone="danger">{error}</Alert> : null}

        {data.tables.length ? (
          <section
            aria-label="Mesas del bar"
            className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3"
          >
            {data.tables.map((table) => {
              const state = tableStatusDictionary[table.state];
              const qrState = qrStatusDictionary[table.qrState];
              return (
                <Card
                  className="flex min-h-table-card flex-col"
                  data-testid={`table-card-${table.tableNumber}`}
                  key={table.tableNumber}
                >
                  <CardHeader className="flex-row items-start justify-between gap-4">
                    <div>
                      <p className="text-display tracking-tight">
                        {table.tableNumber}
                      </p>
                      <h2 className="text-h3">{table.displayName}</h2>
                    </div>
                    <div className="flex items-center gap-2 text-small text-muted-foreground">
                      <PeopleIcon aria-hidden="true" className="size-icon" />
                      {table.capacity}
                    </div>
                  </CardHeader>
                  <CardContent className="flex flex-1 flex-col gap-4">
                    <div className="flex flex-wrap gap-2">
                      <Badge variant={state.tone}>{state.label}</Badge>
                      <Badge variant={qrState.tone}>QR {qrState.label}</Badge>
                    </div>
                    <div className="space-y-1 text-small text-muted-foreground">
                      <p>{table.zoneName}</p>
                      <p>
                        {
                          presenceLevelDictionary[table.presenceDeliveryLevel]
                            .label
                        }
                      </p>
                      {table.activeSessionStartedAt ? (
                        <p>
                          Sesión abierta hace{" "}
                          {formatDuration(
                            (new Date(data.generatedAt).getTime() -
                              new Date(
                                table.activeSessionStartedAt,
                              ).getTime()) /
                              1000,
                          )}
                        </p>
                      ) : null}
                    </div>
                    <div className="mt-auto grid grid-cols-2 gap-2">
                      <Button
                        onClick={() => open("qr", table)}
                        type="button"
                        variant="outline"
                      >
                        <QrIcon aria-hidden="true" />
                        Ver QR
                      </Button>
                      <Button asChild variant="outline">
                        <Link
                          href={`/dueno/mesas/${encodeURIComponent(table.tableNumber)}/tarjeta`}
                          prefetch={false}
                          target="_blank"
                        >
                          <PrintIcon aria-hidden="true" />
                          Imprimir
                        </Link>
                      </Button>
                    </div>
                  </CardContent>
                </Card>
              );
            })}
            <button
              className="flex min-h-table-card flex-col items-center justify-center gap-3 rounded-surface-xl border border-dashed border-border bg-background p-6 text-body font-bold text-muted-foreground hover:border-primary hover:text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              onClick={() => open("single")}
              type="button"
            >
              <span className="inline-flex size-touch items-center justify-center rounded-full bg-accent text-accent-foreground">
                <PlusIcon aria-hidden="true" className="size-icon" />
              </span>
              Agregar mesa
            </button>
          </section>
        ) : (
          <Card>
            <CardContent className="space-y-4 py-12 text-center">
              <h2 className="text-h2">Todavía no tienes mesas</h2>
              <p className="text-body text-muted-foreground">
                Crea la primera y Tablio generará su QR y código
                automáticamente.
              </p>
              <Button onClick={() => open("single")} type="button">
                <PlusIcon aria-hidden="true" />
                Nueva mesa
              </Button>
            </CardContent>
          </Card>
        )}

        <section aria-labelledby="presence-heading" className="space-y-4">
          <div>
            <p className="text-label uppercase tracking-wide text-muted-foreground">
              Presencia en la mesa
            </p>
            <h2 className="text-h2" id="presence-heading">
              Elige cuánta protección necesita tu bar
            </h2>
          </div>
          <div className="grid gap-4 lg:grid-cols-3">
            {Object.entries(presenceLevelDictionary).map(
              ([level, presentation]) => (
                <Card
                  className={
                    level === data.presencePolicy.deliveryLevel
                      ? "border-primary"
                      : undefined
                  }
                  key={level}
                >
                  <CardHeader>
                    <div className="flex items-center justify-between gap-3">
                      <h3 className="text-h3">{presentation.label}</h3>
                      {level === data.presencePolicy.deliveryLevel ? (
                        <Badge variant="demo">Actual</Badge>
                      ) : null}
                    </div>
                    <p className="text-small text-muted-foreground">
                      {presentation.description}
                    </p>
                  </CardHeader>
                </Card>
              ),
            )}
          </div>
        </section>
      </div>

      <Dialog
        open={dialog !== undefined}
        onOpenChange={(isOpen) => !isOpen && setDialog(undefined)}
      >
        <DialogContent>
          {dialog === "single" ? (
            <SingleTableForm data={data} onSubmit={mutate} working={working} />
          ) : null}
          {dialog === "bulk" ? (
            <BulkTableForm data={data} onSubmit={mutate} working={working} />
          ) : null}
          {dialog === "qr" && selected ? (
            <QrPreview onAction={open} table={selected} />
          ) : null}
          {dialog === "rotate" && selected ? (
            <QrRiskForm
              action="qr.rotate"
              onSubmit={mutate}
              table={selected}
              working={working}
            />
          ) : null}
          {dialog === "revoke" && selected ? (
            <QrRiskForm
              action="qr.revoke"
              onSubmit={mutate}
              table={selected}
              working={working}
            />
          ) : null}
        </DialogContent>
      </Dialog>
    </AppShell>
  );
}

function SingleTableForm({
  data,
  onSubmit,
  working,
}: {
  data: TableManagementSnapshot;
  onSubmit: (
    mutation: TableManagementMutation,
    success: string,
  ) => Promise<void>;
  working: boolean;
}) {
  return (
    <form
      className="space-y-6"
      onSubmit={(event) => {
        event.preventDefault();
        const form = new FormData(event.currentTarget);
        void onSubmit(
          {
            action: "table.create",
            tableNumber: String(form.get("tableNumber") ?? ""),
            displayName: String(form.get("displayName") ?? ""),
            zoneCode: String(form.get("zoneCode") ?? ""),
            capacity: Number(form.get("capacity")),
          },
          "Mesa creada. Su QR y código ya están listos.",
        );
      }}
    >
      <DialogHeader>
        <DialogTitle>Nueva mesa</DialogTitle>
        <DialogDescription>
          Al guardar, Tablio crea su QR y su código automáticamente.
        </DialogDescription>
      </DialogHeader>
      <div className="grid gap-4 sm:grid-cols-2">
        <FieldLabel htmlFor="table-number">Número</FieldLabel>
        <Input
          autoFocus
          id="table-number"
          name="tableNumber"
          placeholder="8"
          required
        />
        <FieldLabel htmlFor="table-name">Nombre</FieldLabel>
        <Input
          id="table-name"
          name="displayName"
          placeholder="Mesa 8"
          required
        />
        <FieldLabel htmlFor="table-zone">Zona</FieldLabel>
        <Select
          defaultValue={data.zones[0]?.code}
          id="table-zone"
          name="zoneCode"
          required
        >
          {data.zones.map((zone) => (
            <option key={zone.code} value={zone.code}>
              {zone.name}
            </option>
          ))}
        </Select>
        <FieldLabel htmlFor="table-capacity">Capacidad</FieldLabel>
        <Input
          defaultValue="4"
          id="table-capacity"
          max="100"
          min="1"
          name="capacity"
          required
          type="number"
        />
      </div>
      <Button className="w-full" disabled={working} type="submit">
        {working ? "Creando…" : "Crear mesa y QR"}
      </Button>
    </form>
  );
}

function BulkTableForm({
  data,
  onSubmit,
  working,
}: {
  data: TableManagementSnapshot;
  onSubmit: (
    mutation: TableManagementMutation,
    success: string,
  ) => Promise<void>;
  working: boolean;
}) {
  return (
    <form
      className="space-y-6"
      onSubmit={(event) => {
        event.preventDefault();
        const form = new FormData(event.currentTarget);
        const count = Number(form.get("count"));
        void onSubmit(
          {
            action: "table.create_bulk",
            zoneCode: String(form.get("zoneCode") ?? ""),
            startNumber: Number(form.get("startNumber")),
            count,
            namePrefix: String(form.get("namePrefix") ?? "Mesa"),
            capacity: Number(form.get("capacity")),
          },
          `${plural(count, "mesa creada", "mesas creadas")}. Cada una tiene QR y código propios.`,
        );
      }}
    >
      <DialogHeader>
        <DialogTitle>Crear varias mesas</DialogTitle>
        <DialogDescription>
          Útil para preparar una zona completa durante el onboarding.
        </DialogDescription>
      </DialogHeader>
      <div className="grid gap-4 sm:grid-cols-2">
        <FieldLabel htmlFor="bulk-zone">Zona</FieldLabel>
        <Select
          defaultValue={data.zones[0]?.code}
          id="bulk-zone"
          name="zoneCode"
          required
        >
          {data.zones.map((zone) => (
            <option key={zone.code} value={zone.code}>
              {zone.name}
            </option>
          ))}
        </Select>
        <FieldLabel htmlFor="bulk-start">Primer número</FieldLabel>
        <Input
          defaultValue="10"
          id="bulk-start"
          min="1"
          name="startNumber"
          required
          type="number"
        />
        <FieldLabel htmlFor="bulk-count">Cuántas mesas</FieldLabel>
        <Input
          defaultValue="12"
          id="bulk-count"
          max="60"
          min="1"
          name="count"
          required
          type="number"
        />
        <FieldLabel htmlFor="bulk-prefix">Nombre base</FieldLabel>
        <Input
          defaultValue="Mesa"
          id="bulk-prefix"
          name="namePrefix"
          required
        />
        <FieldLabel htmlFor="bulk-capacity">Capacidad de cada una</FieldLabel>
        <Input
          defaultValue="4"
          id="bulk-capacity"
          max="100"
          min="1"
          name="capacity"
          required
          type="number"
        />
      </div>
      <Button className="w-full" disabled={working} type="submit">
        {working ? "Creando…" : "Crear mesas y QR"}
      </Button>
    </form>
  );
}

function QrPreview({
  onAction,
  table,
}: {
  onAction: (mode: DialogMode, table: ManagedTable) => void;
  table: ManagedTable;
}) {
  return (
    <div className="space-y-6">
      <DialogHeader>
        <DialogTitle>QR de {table.displayName}</DialogTitle>
        <DialogDescription>
          No mostramos tokens ni identificadores internos.
        </DialogDescription>
      </DialogHeader>
      {table.qrState === "active" ? (
        <div className="mx-auto max-w-qr-preview rounded-surface-lg border border-border bg-card p-4">
          <Image
            alt={`QR de ${table.displayName}`}
            className="h-auto w-full"
            height={512}
            src={`/api/owner/tables/qr?table=${encodeURIComponent(table.tableNumber)}`}
            unoptimized
            width={512}
          />
        </div>
      ) : (
        <Alert tone="danger">Este QR está revocado y ya no abre la mesa.</Alert>
      )}
      <div className="grid gap-2 sm:grid-cols-2">
        <Button asChild variant="outline">
          <Link
            href={`/dueno/mesas/${encodeURIComponent(table.tableNumber)}/tarjeta`}
            prefetch={false}
            target="_blank"
          >
            <PrintIcon aria-hidden="true" />
            Imprimir tarjeta
          </Link>
        </Button>
        <Button
          onClick={() => onAction("rotate", table)}
          type="button"
          variant="outline"
        >
          Regenerar QR
        </Button>
        {table.qrState === "active" ? (
          <Button
            onClick={() => onAction("revoke", table)}
            type="button"
            variant="destructive"
          >
            Revocar QR
          </Button>
        ) : null}
      </div>
    </div>
  );
}

function QrRiskForm({
  action,
  onSubmit,
  table,
  working,
}: {
  action: "qr.revoke" | "qr.rotate";
  onSubmit: (
    mutation: TableManagementMutation,
    success: string,
  ) => Promise<void>;
  table: ManagedTable;
  working: boolean;
}) {
  const rotating = action === "qr.rotate";
  return (
    <form
      className="space-y-6"
      onSubmit={(event) => {
        event.preventDefault();
        const reason = String(
          new FormData(event.currentTarget).get("reason") ?? "",
        );
        void onSubmit(
          { action, tableNumber: table.tableNumber, reason },
          rotating
            ? "QR regenerado. El anterior dejó de funcionar."
            : "QR revocado.",
        );
      }}
    >
      <DialogHeader>
        <DialogTitle>{rotating ? "Regenerar QR" : "Revocar QR"}</DialogTitle>
        <DialogDescription>
          {rotating
            ? "El QR pegado en la mesa dejará de funcionar. Tendrás que imprimir y reemplazar la tarjeta."
            : "La tarjeta pegada en la mesa dejará de funcionar hasta que regeneres el QR."}
        </DialogDescription>
      </DialogHeader>
      <Alert tone="warning">Esta acción queda registrada con tu motivo.</Alert>
      <FieldLabel htmlFor="qr-reason">Motivo</FieldLabel>
      <Textarea
        id="qr-reason"
        minLength={5}
        name="reason"
        placeholder="Ej.: la tarjeta se dañó"
        required
      />
      <Button
        className="w-full"
        disabled={working}
        type="submit"
        variant={rotating ? "primary" : "destructive"}
      >
        {working
          ? "Guardando…"
          : rotating
            ? "Regenerar y continuar"
            : "Revocar QR"}
      </Button>
    </form>
  );
}
