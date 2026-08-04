import { NextResponse } from "next/server";
import {
  requireAuthenticatedTenantClient,
  requireTenantId,
  statusForPostgrestError,
} from "@/lib/supabase/route-handler-client";

export async function GET() {
  const { supabase, status } = await requireAuthenticatedTenantClient();
  if (!supabase) return NextResponse.json({ error: "no session" }, { status });

  const { data, error } = await supabase
    .from("support_tickets")
    .select("id, subject, category, status, created_at, updated_at")
    .order("updated_at", { ascending: false });

  if (error) {
    return NextResponse.json(
      { error: error.message },
      { status: statusForPostgrestError(error) },
    );
  }
  return NextResponse.json({ tickets: data });
}

export async function POST(request: Request) {
  const { supabase, status } = await requireAuthenticatedTenantClient();
  if (!supabase) return NextResponse.json({ error: "no session" }, { status });

  const { tenantId, status: tenantStatus } = await requireTenantId(supabase);
  if (!tenantId)
    return NextResponse.json({ error: "no tenant" }, { status: tenantStatus ?? 500 });

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "no session" }, { status: 401 });

  const body = (await request.json()) as {
    subject?: string;
    category?: string;
    message?: string;
  };

  const { data: ticket, error: ticketError } = await supabase
    .from("support_tickets")
    .insert({
      tenant_id: tenantId,
      created_by: user.id,
      subject: body.subject ?? "",
      category: body.category ?? "other",
    })
    .select("id, subject, category, status, created_at, updated_at")
    .single();

  if (ticketError) {
    return NextResponse.json(
      { error: ticketError.message },
      { status: statusForPostgrestError(ticketError) },
    );
  }

  const { error: messageError } = await supabase.from("support_ticket_messages").insert({
    tenant_id: tenantId,
    ticket_id: ticket.id,
    author_type: "owner",
    author_user_id: user.id,
    body: body.message ?? "",
  });

  if (messageError) {
    return NextResponse.json(
      { error: messageError.message },
      { status: statusForPostgrestError(messageError) },
    );
  }

  return NextResponse.json({ ticket }, { status: 201 });
}
