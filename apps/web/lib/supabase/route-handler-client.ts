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

// Every tenant has exactly one venue today (frozen decision, single-venue
// beachhead) — the Configuración routes all need its id to scope zones,
// stations, tables, and catalog writes.
export async function requirePrimaryVenueId(
  supabase: Awaited<ReturnType<typeof createClient>>,
): Promise<{ venueId: string | null; status: number | null }> {
  const { data, error } = await supabase
    .from("venues")
    .select("id")
    .limit(1)
    .maybeSingle();
  if (error) return { venueId: null, status: statusForPostgrestError(error) };
  if (!data) return { venueId: null, status: 404 };
  return { venueId: data.id as string, status: null };
}

// Plain inserts (zones, stations — no RPC needed for these) require
// tenant_id explicitly; there's no column default. The value
// only exists as the `tenant_id` JWT claim custom_access_token_hook injects,
// same decode approach already used in app/login/page.tsx's hasTenantClaim.
export async function requireTenantId(
  supabase: Awaited<ReturnType<typeof createClient>>,
): Promise<{ tenantId: string | null; status: number | null }> {
  const {
    data: { session },
  } = await supabase.auth.getSession();
  const payload = session?.access_token.split(".")[1];
  if (!payload) return { tenantId: null, status: 401 };
  try {
    const claims = JSON.parse(Buffer.from(payload, "base64url").toString("utf8")) as {
      tenant_id?: string;
    };
    if (!claims.tenant_id) return { tenantId: null, status: 403 };
    return { tenantId: claims.tenant_id, status: null };
  } catch {
    return { tenantId: null, status: 401 };
  }
}
