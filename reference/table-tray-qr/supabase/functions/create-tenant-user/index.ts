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

    // Verify caller is authenticated
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      return new Response(JSON.stringify({ error: "No autorizado" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const { email, password, tenant_id, branch_id } = await req.json();

    if (!email || !password || password.length < 6) {
      return new Response(
        JSON.stringify({ error: "Email y contraseña (mín 6 caracteres) requeridos" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Try to create user; if already exists, look up existing user
    let userId: string;
    const { data, error } = await supabaseAdmin.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
    });

    if (error) {
      if (error.message.includes("already been registered")) {
        const { data: listData, error: listError } = await supabaseAdmin.auth.admin.listUsers();
        if (listError) {
          return new Response(
            JSON.stringify({ error: listError.message }),
            { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
          );
        }
        const existingUser = listData.users.find((u) => u.email === email);
        if (!existingUser) {
          return new Response(
            JSON.stringify({ error: "No se pudo encontrar el usuario existente" }),
            { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
          );
        }
        userId = existingUser.id;
      } else {
        return new Response(
          JSON.stringify({ error: error.message }),
          { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }
    } else {
      userId = data.user.id;
    }

    // Add to tenant_members if tenant_id provided (for staff users)
    if (tenant_id) {
      // Check if already a member
      const { data: existing } = await supabaseAdmin
        .from("tenant_members")
        .select("id")
        .eq("user_id", userId)
        .eq("tenant_id", tenant_id)
        .maybeSingle();

      if (!existing) {
        await supabaseAdmin
          .from("tenant_members")
          .insert({
            user_id: userId,
            tenant_id,
            branch_id: branch_id || null,
            role: "staff",
            is_active: true,
          });
      }
    }

    return new Response(
      JSON.stringify({ user_id: userId }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (e) {
    return new Response(
      JSON.stringify({ error: e.message }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
