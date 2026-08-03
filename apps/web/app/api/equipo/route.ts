import { NextResponse } from "next/server";
import {
  requireAuthenticatedTenantClient,
  statusForPostgrestError,
} from "@/lib/supabase/route-handler-client";

export async function GET() {
  const { supabase, status } = await requireAuthenticatedTenantClient();
  if (!supabase) return NextResponse.json({ error: "no session" }, { status });

  const { data, error } = await supabase
    .from("employees")
    .select("id, display_name, status, created_at, employee_roles(role_code)")
    .order("created_at", { ascending: true });

  if (error) {
    return NextResponse.json(
      { error: error.message },
      { status: statusForPostgrestError(error) },
    );
  }
  return NextResponse.json({ employees: data });
}

export async function POST(request: Request) {
  const { supabase, status } = await requireAuthenticatedTenantClient();
  if (!supabase) return NextResponse.json({ error: "no session" }, { status });

  const body = (await request.json()) as {
    displayName?: string;
    pin?: string;
    roleCodes?: string[];
    reason?: string;
  };

  const { data, error } = await supabase.rpc("create_employee", {
    p_display_name: body.displayName ?? "",
    p_pin: body.pin ?? "",
    p_role_codes: body.roleCodes ?? [],
    p_reason: body.reason ?? "",
  });

  if (error) {
    return NextResponse.json(
      { error: error.message },
      { status: statusForPostgrestError(error) },
    );
  }
  return NextResponse.json({ id: data }, { status: 201 });
}
