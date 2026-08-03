import { NextResponse } from "next/server";
import {
  requireAuthenticatedTenantClient,
  statusForPostgrestError,
} from "@/lib/supabase/route-handler-client";

const ALLOWED_STATUSES = ["active", "suspended"] as const;

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { supabase, status } = await requireAuthenticatedTenantClient();
  if (!supabase) return NextResponse.json({ error: "no session" }, { status });

  const { id } = await params;
  const body = (await request.json()) as { status?: string };

  if (!ALLOWED_STATUSES.includes(body.status as (typeof ALLOWED_STATUSES)[number])) {
    return NextResponse.json({ error: "invalid status" }, { status: 400 });
  }

  const { error } = await supabase
    .from("employees")
    .update({ status: body.status })
    .eq("id", id);

  if (error) {
    return NextResponse.json(
      { error: error.message },
      { status: statusForPostgrestError(error) },
    );
  }
  return NextResponse.json({ ok: true });
}
