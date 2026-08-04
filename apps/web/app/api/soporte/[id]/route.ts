import { NextResponse } from "next/server";
import {
  requireAuthenticatedTenantClient,
  statusForPostgrestError,
} from "@/lib/supabase/route-handler-client";

const ALLOWED_STATUSES = ["open", "in_progress", "resolved", "closed"] as const;

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { supabase, status } = await requireAuthenticatedTenantClient();
  if (!supabase) return NextResponse.json({ error: "no session" }, { status });

  const { id } = await params;

  const [ticketResult, messagesResult] = await Promise.all([
    supabase
      .from("support_tickets")
      .select("id, subject, category, status, created_at, updated_at")
      .eq("id", id)
      .single(),
    supabase
      .from("support_ticket_messages")
      .select("id, author_type, body, created_at")
      .eq("ticket_id", id)
      .order("created_at", { ascending: true }),
  ]);

  if (ticketResult.error) {
    return NextResponse.json(
      { error: ticketResult.error.message },
      { status: statusForPostgrestError(ticketResult.error) },
    );
  }
  if (messagesResult.error) {
    return NextResponse.json(
      { error: messagesResult.error.message },
      { status: statusForPostgrestError(messagesResult.error) },
    );
  }

  return NextResponse.json({ ticket: ticketResult.data, messages: messagesResult.data });
}

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
    .from("support_tickets")
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
