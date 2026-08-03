"use client";

import { useCallback, useEffect, useState } from "react";
import { AppShell, AppShellLoading } from "@/components/operational/app-shell";
import { ownerNavigation } from "@/components/operational/owner-navigation";
import { Alert } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { employeeStatusDictionary, roleCodeLabels } from "@/lib/ui-statuses";

const navItems = ownerNavigation("team");

const ASSIGNABLE_ROLES = ["waiter", "kds", "cashier_admin", "owner"] as const;

type Employee = {
  id: string;
  display_name: string;
  status: keyof typeof employeeStatusDictionary;
  created_at: string;
  employee_roles: Array<{ role_code: string }>;
};

function NewEmployeeDialog({
  onCreated,
  open,
  onOpenChange,
}: {
  onCreated: () => void;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [roleCodes, setRoleCodes] = useState<string[]>([]);

  return (
    <Dialog onOpenChange={onOpenChange} open={open}>
      <DialogContent>
        <form
          className="space-y-5"
          onSubmit={async (event) => {
            event.preventDefault();
            setBusy(true);
            setError("");
            const formData = new FormData(event.currentTarget);
            const response = await fetch("/api/equipo", {
              method: "POST",
              headers: { "content-type": "application/json" },
              body: JSON.stringify({
                displayName: String(formData.get("displayName") ?? ""),
                pin: String(formData.get("pin") ?? ""),
                reason: String(formData.get("reason") ?? ""),
                roleCodes,
              }),
            });
            setBusy(false);
            if (!response.ok) {
              const payload = (await response.json()) as { error?: string };
              setError(payload.error ?? "No pudimos crear la persona.");
              return;
            }
            setRoleCodes([]);
            onOpenChange(false);
            onCreated();
          }}
        >
          <DialogHeader>
            <DialogTitle>Nueva persona</DialogTitle>
          </DialogHeader>
          {error ? <Alert tone="danger">{error}</Alert> : null}
          <label className="block space-y-2 text-small font-bold">
            <span>Nombre</span>
            <Input name="displayName" required />
          </label>
          <label className="block space-y-2 text-small font-bold">
            <span>PIN (4 a 8 dígitos)</span>
            <Input
              inputMode="numeric"
              maxLength={8}
              minLength={4}
              name="pin"
              pattern="[0-9]{4,8}"
              required
              type="password"
            />
          </label>
          <fieldset className="space-y-2">
            <legend className="text-small font-bold">Roles</legend>
            {ASSIGNABLE_ROLES.map((role) => (
              <label
                className="flex items-center gap-2 text-body"
                key={role}
              >
                <input
                  checked={roleCodes.includes(role)}
                  className="size-icon shrink-0"
                  onChange={(event) =>
                    setRoleCodes((current) =>
                      event.target.checked
                        ? [...current, role]
                        : current.filter((code) => code !== role),
                    )
                  }
                  type="checkbox"
                />
                {roleCodeLabels[role]}
              </label>
            ))}
          </fieldset>
          <label className="block space-y-2 text-small font-bold">
            <span>Motivo</span>
            <Textarea minLength={3} name="reason" required />
          </label>
          <Button
            className="w-full"
            disabled={busy || roleCodes.length === 0}
            type="submit"
          >
            {busy ? "Creando…" : "Crear persona"}
          </Button>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function ResetPinDialog({
  employee,
  onDone,
  onOpenChange,
  open,
}: {
  employee: Employee | null;
  onDone: () => void;
  onOpenChange: (open: boolean) => void;
  open: boolean;
}) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  if (!employee) return null;

  return (
    <Dialog onOpenChange={onOpenChange} open={open}>
      <DialogContent>
        <form
          className="space-y-5"
          onSubmit={async (event) => {
            event.preventDefault();
            setBusy(true);
            setError("");
            const formData = new FormData(event.currentTarget);
            const response = await fetch(`/api/equipo/${employee.id}/pin`, {
              method: "POST",
              headers: { "content-type": "application/json" },
              body: JSON.stringify({
                pin: String(formData.get("pin") ?? ""),
                reason: String(formData.get("reason") ?? ""),
              }),
            });
            setBusy(false);
            if (!response.ok) {
              const payload = (await response.json()) as { error?: string };
              setError(payload.error ?? "No pudimos restablecer el PIN.");
              return;
            }
            onOpenChange(false);
            onDone();
          }}
        >
          <DialogHeader>
            <DialogTitle>Restablecer PIN de {employee.display_name}</DialogTitle>
          </DialogHeader>
          {error ? <Alert tone="danger">{error}</Alert> : null}
          <label className="block space-y-2 text-small font-bold">
            <span>PIN nuevo (4 a 8 dígitos)</span>
            <Input
              inputMode="numeric"
              maxLength={8}
              minLength={4}
              name="pin"
              pattern="[0-9]{4,8}"
              required
              type="password"
            />
          </label>
          <label className="block space-y-2 text-small font-bold">
            <span>Motivo</span>
            <Textarea minLength={3} name="reason" required />
          </label>
          <Button className="w-full" disabled={busy} type="submit">
            {busy ? "Guardando…" : "Restablecer PIN"}
          </Button>
        </form>
      </DialogContent>
    </Dialog>
  );
}

export function TeamDashboard() {
  const [employees, setEmployees] = useState<Employee[]>();
  const [error, setError] = useState("");
  const [createOpen, setCreateOpen] = useState(false);
  const [pinTarget, setPinTarget] = useState<Employee | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);

  const load = useCallback(async () => {
    const response = await fetch("/api/equipo", { cache: "no-store" });
    if (!response.ok) {
      const payload = (await response.json()) as { error?: string };
      setError(payload.error ?? "No pudimos cargar el equipo.");
      return;
    }
    const payload = (await response.json()) as { employees: Employee[] };
    setEmployees(payload.employees);
  }, []);

  useEffect(() => {
    const initial = window.setTimeout(() => void load(), 0);
    return () => window.clearTimeout(initial);
  }, [load]);

  async function toggleStatus(employee: Employee) {
    setBusyId(employee.id);
    const nextStatus = employee.status === "suspended" ? "active" : "suspended";
    await fetch(`/api/equipo/${employee.id}`, {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ status: nextStatus }),
    });
    setBusyId(null);
    void load();
  }

  if (!employees) return <AppShellLoading navItems={navItems} />;

  return (
    <AppShell
      banner="Datos reales de Supabase"
      branchName="Sucursal principal"
      navItems={navItems}
      tenantName="Bar La Virgen"
    >
      <div className="space-y-6">
        <header className="flex flex-col gap-6 lg:flex-row lg:items-start lg:justify-between">
          <div className="space-y-2">
            <h1 className="text-h1 tracking-tight text-foreground lg:text-h1-lg">
              Equipo
            </h1>
            <p className="text-body text-muted-foreground">
              Quién trabaja en el local, con qué rol, y su PIN de acceso.
            </p>
          </div>
          <Button onClick={() => setCreateOpen(true)} type="button">
            Nueva persona
          </Button>
        </header>

        {error ? <Alert tone="danger">{error}</Alert> : null}

        {employees.length === 0 ? (
          <Card>
            <CardContent className="space-y-2 py-12 text-center">
              <h2 className="text-h2">Todavía no hay nadie en el equipo</h2>
              <p className="text-body text-muted-foreground">
                Agrega a la primera persona para que pueda entrar con su PIN.
              </p>
            </CardContent>
          </Card>
        ) : (
          <div className="space-y-3">
            {employees.map((employee) => {
              const state = employeeStatusDictionary[employee.status];
              return (
                <Card key={employee.id}>
                  <CardContent className="flex flex-col gap-4 py-5 sm:flex-row sm:items-center sm:justify-between">
                    <div className="space-y-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <h2 className="text-h3 text-foreground">
                          {employee.display_name}
                        </h2>
                        <Badge variant={state.tone}>{state.label}</Badge>
                      </div>
                      <p className="text-small text-muted-foreground">
                        {employee.employee_roles.length > 0
                          ? employee.employee_roles
                              .map(
                                (role) =>
                                  roleCodeLabels[role.role_code] ??
                                  role.role_code,
                              )
                              .join(" · ")
                          : "Sin rol asignado"}
                      </p>
                    </div>
                    <div className="flex gap-2">
                      <Button
                        onClick={() => setPinTarget(employee)}
                        type="button"
                        variant="outline"
                      >
                        Restablecer PIN
                      </Button>
                      <Button
                        disabled={busyId === employee.id}
                        onClick={() => void toggleStatus(employee)}
                        type="button"
                        variant={
                          employee.status === "suspended"
                            ? "primary"
                            : "destructive"
                        }
                      >
                        {employee.status === "suspended"
                          ? "Reactivar"
                          : "Suspender"}
                      </Button>
                    </div>
                  </CardContent>
                </Card>
              );
            })}
          </div>
        )}
      </div>

      <NewEmployeeDialog
        onCreated={() => void load()}
        onOpenChange={setCreateOpen}
        open={createOpen}
      />
      <ResetPinDialog
        employee={pinTarget}
        onDone={() => void load()}
        onOpenChange={(open) => {
          if (!open) setPinTarget(null);
        }}
        open={pinTarget !== null}
      />
    </AppShell>
  );
}
