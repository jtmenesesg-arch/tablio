import { createBrowserClient } from "@supabase/ssr";

// Browser-side client for Client Components. Only ever constructed with the
// publishable/anon key — it runs in the user's browser, so anything stronger
// would be exposed. The user's identity comes entirely from the session
// cookies that `middleware.ts` and the server client keep in sync; this
// client never sees or needs service_role.
export function createClient() {
  return createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!,
  );
}
