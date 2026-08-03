import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";

// Server-side client for Server Components, Route Handlers, and Server
// Actions. Always constructed with the publishable/anon key and the
// requester's own cookies — never service_role. Authorization is enforced by
// Postgres (RLS + private.require_tenant_context()/has_permission()), not by
// this helper; it only carries the caller's real identity through.
//
// Server Components can only read cookies, not write them (Next.js
// forbids it outside a Route Handler or Server Action) — the try/catch below
// is that constraint, not an error we're hiding. Session refresh instead
// happens in middleware.ts, which runs on every request and can write
// cookies, so a Server Component silently failing to persist a refreshed
// cookie here is fine as long as the middleware already did it.
export async function createClient() {
  const cookieStore = await cookies();

  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!,
    {
      cookies: {
        getAll() {
          return cookieStore.getAll();
        },
        setAll(cookiesToSet) {
          try {
            for (const { name, value, options } of cookiesToSet) {
              cookieStore.set(name, value, options);
            }
          } catch {
            // Called from a Server Component — see comment above.
          }
        },
      },
    },
  );
}
