import { NextResponse } from "next/server";
import {
  requireAuthenticatedTenantClient,
  statusForPostgrestError,
} from "@/lib/supabase/route-handler-client";

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { supabase, status } = await requireAuthenticatedTenantClient();
  if (!supabase) return NextResponse.json({ error: "no session" }, { status });

  const { id } = await params;
  const body = (await request.json()) as { pin?: string; reason?: string };

  const { error } = await supabase.rpc("set_employee_pin", {
    p_employee_id: id,
    p_pin: body.pin ?? "",
    p_reason: body.reason ?? "",
  });

  if (error) {
    return NextResponse.json(
      { error: error.message },
      { status: statusForPostgrestError(error) },
    );
  }
  return NextResponse.json({ ok: true });
}
