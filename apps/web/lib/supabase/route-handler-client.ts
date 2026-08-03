import { createClient } from "@/lib/supabase/server";

// For Route Handlers under app/api/** that need a real, RLS-scoped Supabase
// client (the Tarea 4 screens: Equipo, Configuración, Soporte, Reportes).
// Never service_role — the caller's own cookies are the only source of
// identity, and Postgres (private.require_tenant_context()/has_permission())
// stays the single source of truth for authorization. This helper only
// translates the two outcomes a route needs to react to: no session (401),
// or a Postgres permission error (403). It does not re-implement any
// business rule.
export async function requireAuthenticatedTenantClient() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return { supabase: null, status: 401 as const };
  }

  return { supabase, status: null };
}

// Postgres raises 42501 (insufficient_privilege) from
// private.require_tenant_context()/has_permission() when there's no active
// tenant or the role lacks the permission — that maps to HTTP 403, not 500.
export function statusForPostgrestError(error: { code?: string } | null): number {
  if (!error) return 500;
  if (error.code === "42501") return 403;
  return 500;
}
