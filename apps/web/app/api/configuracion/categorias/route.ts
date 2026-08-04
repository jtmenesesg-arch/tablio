import { NextResponse } from "next/server";
import {
  requireAuthenticatedTenantClient,
  requirePrimaryVenueId,
  statusForPostgrestError,
} from "@/lib/supabase/route-handler-client";

export async function GET() {
  const { supabase, status } = await requireAuthenticatedTenantClient();
  if (!supabase) return NextResponse.json({ error: "no session" }, { status });

  const { data, error } = await supabase
    .from("menu_categories")
    .select("id, code, name, sort_order, active")
    .order("sort_order", { ascending: true });

  if (error) {
    return NextResponse.json(
      { error: error.message },
      { status: statusForPostgrestError(error) },
    );
  }
  return NextResponse.json({ categories: data });
}

export async function POST(request: Request) {
  const { supabase, status } = await requireAuthenticatedTenantClient();
  if (!supabase) return NextResponse.json({ error: "no session" }, { status });

  const { venueId, status: venueStatus } = await requirePrimaryVenueId(supabase);
  if (!venueId)
    return NextResponse.json({ error: "no venue" }, { status: venueStatus ?? 500 });

  const body = (await request.json()) as {
    code?: string;
    name?: string;
    sortOrder?: number;
  };

  const { data, error } = await supabase.rpc("create_menu_category", {
    p_venue_id: venueId,
    p_code: body.code ?? "",
    p_name: body.name ?? "",
    p_sort_order: body.sortOrder ?? 0,
  });

  if (error) {
    return NextResponse.json(
      { error: error.message },
      { status: statusForPostgrestError(error) },
    );
  }
  return NextResponse.json({ id: data }, { status: 201 });
}
