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
    .from("tables")
    .select("id, table_number, display_name, capacity, qr_active, zone_id, zones(name)")
    .order("table_number", { ascending: true });

  if (error) {
    return NextResponse.json(
      { error: error.message },
      { status: statusForPostgrestError(error) },
    );
  }
  return NextResponse.json({ tables: data });
}

export async function POST(request: Request) {
  const { supabase, status } = await requireAuthenticatedTenantClient();
  if (!supabase) return NextResponse.json({ error: "no session" }, { status });

  const { venueId, status: venueStatus } = await requirePrimaryVenueId(supabase);
  if (!venueId)
    return NextResponse.json({ error: "no venue" }, { status: venueStatus ?? 500 });

  const body = (await request.json()) as {
    zoneId?: string;
    startNumber?: number;
    count?: number;
    namePrefix?: string;
    capacity?: number;
  };

  const { data, error } = await supabase.rpc("create_tables_with_assets", {
    p_venue_id: venueId,
    p_zone_id: body.zoneId ?? "",
    p_start_number: body.startNumber ?? 1,
    p_count: body.count ?? 1,
    p_name_prefix: body.namePrefix ?? "Mesa",
    p_capacity: body.capacity ?? 4,
  });

  if (error) {
    return NextResponse.json(
      { error: error.message },
      { status: statusForPostgrestError(error) },
    );
  }
  return NextResponse.json({ tables: data }, { status: 201 });
}
