import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const supabaseAdmin = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    const { email, password, name, token } = await req.json();

    if (!email || !password || !name || !token) {
      return new Response(
        JSON.stringify({ error: "Todos los campos son obligatorios" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    if (password.length < 6) {
      return new Response(
        JSON.stringify({ error: "La contraseña debe tener al menos 6 caracteres" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // 1. Validate invitation token
    const { data: invitation, error: invError } = await supabaseAdmin
      .from("staff_invitations")
      .select("id, tenant_id, branch_id, role, expires_at, used_at")
      .eq("token", token)
      .maybeSingle();

    if (invError || !invitation) {
      return new Response(
        JSON.stringify({ error: "Invitación no válida" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    if (invitation.used_at) {
      return new Response(
        JSON.stringify({ error: "Esta invitación ya fue utilizada" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    if (new Date(invitation.expires_at) < new Date()) {
      return new Response(
        JSON.stringify({ error: "Esta invitación ha expirado" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // 2. Create auth user
    const { data: authData, error: authError } = await supabaseAdmin.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
    });

    if (authError) {
      if (authError.message.includes("already been registered")) {
        return new Response(
          JSON.stringify({ error: "Este email ya está registrado. Intenta con otro o inicia sesión." }),
          { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }
      return new Response(
        JSON.stringify({ error: authError.message }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const userId = authData.user.id;

    // 3. Create staff_users record
    const { error: staffError } = await supabaseAdmin
      .from("staff_users")
      .insert({
        name: name.trim(),
        role: invitation.role,
        branch_id: invitation.branch_id,
        tenant_id: invitation.tenant_id,
        is_active: true,
        auth_user_id: userId,
      });

    if (staffError) {
      // Rollback: delete auth user
      await supabaseAdmin.auth.admin.deleteUser(userId);
      return new Response(
        JSON.stringify({ error: "Error al crear el perfil del mozo" }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // 3b. Also add to tenant_members so get_tenant_id() works for RLS
    const { error: memberError } = await supabaseAdmin
      .from("tenant_members")
      .insert({
        user_id: userId,
        tenant_id: invitation.tenant_id,
        branch_id: invitation.branch_id,
        role: invitation.role,
        is_active: true,
      });

    if (memberError) {
      console.error("tenant_members insert error:", memberError);
      // Non-fatal: staff_users record exists, but RLS may not work
    }

    // 4. Mark invitation as used
    await supabaseAdmin
      .from("staff_invitations")
      .update({ used_at: new Date().toISOString() })
      .eq("id", invitation.id);

    return new Response(
      JSON.stringify({ success: true, user_id: userId }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (e) {
    return new Response(
      JSON.stringify({ error: e.message }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
