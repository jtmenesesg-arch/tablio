import { redirect } from "next/navigation";
import { AppShell } from "@/components/operational/app-shell";
import { ownerNavigation } from "@/components/operational/owner-navigation";
import { Alert } from "@/components/ui/alert";
import { Card, CardContent } from "@/components/ui/card";
import { formatClp } from "@/lib/format";
import { createClient } from "@/lib/supabase/server";

// Smoke-test route for Incremento 7 of elegant-wobbling-phoenix — proves the
// real auth pipeline end to end (session → RLS → a real RPC), not a
// finished product screen. The real /dueno stays on the demo store until a
// later, separate increment migrates it deliberately.
const navItems = ownerNavigation("summary");

type OwnerSummary = {
  sales_clp: number;
  order_count: number;
  average_ticket_clp: number;
  monthly_credit_loss_clp: number;
  tenant_id: string;
};

export default async function DuenoRealPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/login");
  }

  const { data, error } = await supabase.rpc("owner_dashboard_summary", {});

  if (error) {
    // 42501 from require_tenant_context() means no active tenant selected —
    // send them back to pick one instead of showing a raw Postgres error.
    if (error.code === "42501") {
      redirect("/login/seleccionar-local");
    }
    return (
      <div className="p-6">
        <Alert tone="danger">
          No pudimos cargar los datos reales: {error.message}
        </Alert>
      </div>
    );
  }

  const summary = data as OwnerSummary;

  return (
    <AppShell
      banner="Prueba de autenticación real · datos en vivo de Supabase"
      branchName="Sucursal principal"
      navItems={navItems}
      tenantName="Bar La Virgen"
    >
      <div className="space-y-6">
        <h1 className="text-h1 tracking-tight text-foreground lg:text-h1-lg">
          Panel real (prueba de humo)
        </h1>
        <p className="text-body text-muted-foreground">
          Esta pantalla no es producto final — confirma que el login real,
          RLS y las RPC de Postgres funcionan de punta a punta.
        </p>
        <section className="grid gap-4 sm:grid-cols-3">
          <Card>
            <CardContent className="space-y-1 py-6">
              <p className="text-label uppercase tracking-wide text-muted-foreground">
                Ventas
              </p>
              <p className="text-h2 text-foreground">
                {formatClp(summary.sales_clp)}
              </p>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="space-y-1 py-6">
              <p className="text-label uppercase tracking-wide text-muted-foreground">
                Pedidos
              </p>
              <p className="text-h2 text-foreground">
                {summary.order_count}
              </p>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="space-y-1 py-6">
              <p className="text-label uppercase tracking-wide text-muted-foreground">
                Ticket promedio
              </p>
              <p className="text-h2 text-foreground">
                {formatClp(summary.average_ticket_clp)}
              </p>
            </CardContent>
          </Card>
        </section>
        <p className="text-small text-muted-foreground">
          tenant_id real: {summary.tenant_id}
        </p>
      </div>
    </AppShell>
  );
}
