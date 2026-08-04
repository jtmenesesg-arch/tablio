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
    .from("zones")
    .select("id, code, name, zone_type, active, sort_order")
    .order("sort_order", { ascending: true });

  if (error) {
    return NextResponse.json(
      { error: error.message },
      { status: statusForPostgrestError(error) },
    );
  }
  return NextResponse.json({ zones: data });
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
    zoneType?: string;
  };

  const { data, error } = await supabase
    .from("zones")
    .insert({
      tenant_id: tenantId,
      venue_id: venueId,
      code: body.code ?? "",
      name: body.name ?? "",
      zone_type: body.zoneType ?? "general",
    })
    .select("id, code, name, zone_type, active, sort_order")
    .single();

  if (error) {
    return NextResponse.json(
      { error: error.message },
      { status: statusForPostgrestError(error) },
    );
  }
  return NextResponse.json({ zone: data }, { status: 201 });
}
