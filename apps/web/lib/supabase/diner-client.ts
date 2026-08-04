import { createClient } from "@supabase/supabase-js";

// The diner is never a Supabase Auth user — there's no login, no cookie
// session to restore. Their identity is the device-session token from
// OI-034 Incremento 1 (enter_table/require_diner_device_session), passed
// explicitly as an RPC argument on every call. This client is stateless on
// purpose: anon key only, never service_role, matching every other route
// in this codebase.
export function createDinerClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!,
  );
}
