import { redirect } from "next/navigation";
import { ownerNavigation } from "@/components/operational/owner-navigation";
import { AppShell } from "@/components/operational/app-shell";
import { createClient } from "@/lib/supabase/server";
import { KdsRealScreen } from "./kds-real-screen";

// OI-034 / OI-038: KDS real. El backend (transition_ticket con concurrencia
// optimista, Realtime en tickets, RLS de lectura) ya existía completo desde
// Sprint 4, nunca conectado a ninguna pantalla — ver docs/BUILD_LOG.md.
// Reemplaza la vista mínima provisional que existía en esta misma URL.
const navItems = ownerNavigation("summary");

export default async function KdsRealPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/login");
  }

  return (
    <AppShell
      banner="Comandas reales · sin reimpresión ni panel de agotados todavía"
      branchName="Sucursal principal"
      navItems={navItems}
      tenantName="Bar La Virgen"
    >
      <KdsRealScreen />
    </AppShell>
  );
}
