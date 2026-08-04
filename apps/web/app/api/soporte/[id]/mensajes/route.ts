import { NextResponse } from "next/server";
import {
  requireAuthenticatedTenantClient,
  requireTenantId,
  statusForPostgrestError,
} from "@/lib/supabase/route-handler-client";

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { supabase, status } = await requireAuthenticatedTenantClient();
  if (!supabase) return NextResponse.json({ error: "no session" }, { status });

  const { tenantId, status: tenantStatus } = await requireTenantId(supabase);
  if (!tenantId)
    return NextResponse.json({ error: "no tenant" }, { status: tenantStatus ?? 500 });

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "no session" }, { status: 401 });

  const { id } = await params;
  const body = (await request.json()) as { message?: string };

  const { data, error } = await supabase
    .from("support_ticket_messages")
    .insert({
      tenant_id: tenantId,
      ticket_id: id,
      author_type: "owner",
      author_user_id: user.id,
      body: body.message ?? "",
    })
    .select("id, author_type, body, created_at")
    .single();

  if (error) {
    return NextResponse.json(
      { error: error.message },
      { status: statusForPostgrestError(error) },
    );
  }

  // A reply reopens a resolved/closed ticket back to open — matches the
  // mental model of "I wrote back, someone still needs to look at this."
  await supabase
    .from("support_tickets")
    .update({ status: "open" })
    .eq("id", id)
    .in("status", ["resolved", "closed"]);

  return NextResponse.json({ message: data }, { status: 201 });
}
