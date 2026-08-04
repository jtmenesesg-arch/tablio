import { NextResponse } from "next/server";
import {
  requireAuthenticatedTenantClient,
  requirePrimaryVenueId,
  requireTenantId,
  statusForPostgrestError,
} from "@/lib/supabase/route-handler-client";

export async function GET() {
  const { supabase, status } = await requireAuthenticatedTenantClient();
  if (!supabase) return NextResponse.json({ error: "no session" }, { status });

  const { data, error } = await supabase
    .from("stations")
    .select("id, code, name, station_type, active")
    .order("name", { ascending: true });

  if (error) {
    return NextResponse.json(
      { error: error.message },
      { status: statusForPostgrestError(error) },
    );
  }
  return NextResponse.json({ stations: data });
}

export async function POST(request: Request) {
  const { supabase, status } = await requireAuthenticatedTenantClient();
  if (!supabase) return NextResponse.json({ error: "no session" }, { status });

  const { venueId, status: venueStatus } = await requirePrimaryVenueId(supabase);
  if (!venueId)
    return NextResponse.json({ error: "no venue" }, { status: venueStatus ?? 500 });
  const { tenantId, status: tenantStatus } = await requireTenantId(supabase);
  if (!tenantId)
    return NextResponse.json({ error: "no tenant" }, { status: tenantStatus ?? 500 });

  const body = (await request.json()) as {
    code?: string;
    name?: string;
    stationType?: string;
  };

  const { data, error } = await supabase
    .from("stations")
    .insert({
      tenant_id: tenantId,
      venue_id: venueId,
      code: body.code ?? "",
      name: body.name ?? "",
      station_type: body.stationType ?? "",
    })
    .select("id, code, name, station_type, active")
    .single();

  if (error) {
    return NextResponse.json(
      { error: error.message },
      { status: statusForPostgrestError(error) },
    );
  }
  return NextResponse.json({ station: data }, { status: 201 });
}
