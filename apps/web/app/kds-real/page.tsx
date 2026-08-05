import { redirect } from "next/navigation";
import { ownerNavigation } from "@/components/operational/owner-navigation";
import { AppShell } from "@/components/operational/app-shell";
import { Alert } from "@/components/ui/alert";
import { createClient } from "@/lib/supabase/server";

// OI-034 Incremento 5: vista MÍNIMA y PROVISIONAL — demuestra que un pedido
// pagado de verdad llega a comandas reales. NO es la reconexión real del
// KDS (columnas por estación, cambio de estado, realtime, todo lo que ya
// tiene /kds sobre el store demo) — eso es un incremento aparte, registrado
// en docs/OPEN_ISSUES.md. Se refresca con un meta-refresh simple a
// propósito, no con websockets — coherente con "provisional".
const navItems = ownerNavigation("summary");

type MinimalTicket = {
  id: string;
  stationName: string;
  status: string;
  queuedAt: string;
  tableName: string;
  itemNames: string[];
};

const STATUS_LABEL: Record<string, string> = {
  queued: "En cola",
  acknowledged: "Reconocida",
  in_preparation: "En preparación",
  ready: "Lista",
};

export default async function KdsRealPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/login");
  }

  const { data, error } = await supabase.rpc("owner_kds_tickets_minimal", {});

  if (error) {
    if (error.code === "42501") {
      redirect("/login/seleccionar-local");
    }
    return (
      <div className="p-6">
        <Alert tone="danger">No pudimos cargar las comandas reales: {error.message}</Alert>
      </div>
    );
  }

  const tickets = (data as { tickets: MinimalTicket[] }).tickets;

  return (
    <AppShell
      banner="⚠ Vista provisional — no reemplaza al KDS real (OI-034 Incremento 5)"
      branchName="Sucursal principal"
      navItems={navItems}
      tenantName="Bar La Virgen"
    >
      <meta content="5" httpEquiv="refresh" />
      <div className="space-y-6">
        <div className="space-y-1">
          <h1 className="text-h1 tracking-tight text-foreground lg:text-h1-lg">
            Comandas reales (provisional)
          </h1>
          <p className="text-body text-muted-foreground">
            Sólo lectura, se refresca cada 5 segundos. Sin cambio de estado, sin columnas
            por estación — es la prueba de que un pago real produce una comanda real,
            no el KDS terminado.
          </p>
        </div>

        {tickets.length === 0 ? (
          <Alert tone="info">
            No hay comandas activas en las últimas 12 horas.
          </Alert>
        ) : (
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {tickets.map((ticket) => (
              <div
                className="space-y-2 rounded-surface-lg border border-border bg-card p-4"
                key={ticket.id}
              >
                <div className="flex items-center justify-between">
                  <strong className="text-body font-bold text-foreground">
                    {ticket.stationName}
                  </strong>
                  <span className="rounded-full bg-accent px-2 py-1 text-label font-bold uppercase text-foreground">
                    {STATUS_LABEL[ticket.status] ?? ticket.status}
                  </span>
                </div>
                <p className="text-small text-muted-foreground">{ticket.tableName}</p>
                <ul className="space-y-1 text-body text-foreground">
                  {ticket.itemNames.map((name, index) => (
                    <li key={`${ticket.id}-${index}`}>{name}</li>
                  ))}
                </ul>
                <p className="text-label text-muted-foreground">
                  {new Date(ticket.queuedAt).toLocaleTimeString("es-CL")}
                </p>
              </div>
            ))}
          </div>
        )}
      </div>
    </AppShell>
  );
}
