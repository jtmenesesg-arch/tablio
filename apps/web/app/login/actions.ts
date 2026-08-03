"use server";

import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";

export type LoginState = { error: string | null };

export async function signInWithPassword(
  _prevState: LoginState,
  formData: FormData,
): Promise<LoginState> {
  const email = String(formData.get("email") ?? "").trim();
  const password = String(formData.get("password") ?? "");

  if (!email || !password) {
    return { error: "Ingresa tu correo y tu contraseña." };
  }

  const supabase = await createClient();
  const { error: signInError } = await supabase.auth.signInWithPassword({
    email,
    password,
  });
  if (signInError) {
    return { error: "Correo o contraseña incorrectos." };
  }

  // RLS on tenant_memberships already scopes this to the signed-in user
  // (memberships_select_own_tenant); the status filter is a business rule,
  // not a security boundary.
  const { data: memberships, error: membershipsError } = await supabase
    .from("tenant_memberships")
    .select("tenant_id, tenants(display_name)")
    .eq("status", "active");

  if (membershipsError || !memberships || memberships.length === 0) {
    await supabase.auth.signOut();
    return { error: "Tu cuenta no tiene acceso a ningún local todavía." };
  }

  if (memberships.length === 1) {
    await activateTenantAndRedirect(memberships[0].tenant_id);
  }

  redirect("/login/seleccionar-local");
}

export async function selectTenant(
  _prevState: LoginState,
  formData: FormData,
): Promise<LoginState> {
  const tenantId = String(formData.get("tenantId") ?? "");
  if (!tenantId) {
    return { error: "Elige un local." };
  }
  return activateTenantAndRedirect(tenantId);
}

async function activateTenantAndRedirect(tenantId: string): Promise<never> {
  const supabase = await createClient();
  const { error: rpcError } = await supabase.rpc("set_active_tenant", {
    p_tenant_id: tenantId,
  });
  if (rpcError) {
    // set_active_tenant already validates membership server-side; if this
    // fails it means something changed between listing memberships and
    // activating one (revoked mid-session, etc.) — send them back to log in
    // again rather than guessing.
    redirect("/login?error=no-se-pudo-activar-el-local");
  }
  // The Custom Access Token Hook only reads private.user_tenant_context when
  // a JWT is issued or refreshed — set_active_tenant alone does not update
  // the token the client already has. Without this, every request after
  // login would still be missing the tenant_id claim.
  await supabase.auth.refreshSession();
  redirect("/dueno-real");
}
