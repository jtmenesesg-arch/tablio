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
    .from("products")
    .select(
      "id, name, description, unit_price_clp, allergens, track_stock, available_for_order, menu_category_id, menu_categories(name), inventory_levels(on_hand_quantity)",
    )
    .order("name", { ascending: true });

  if (error) {
    return NextResponse.json(
      { error: error.message },
      { status: statusForPostgrestError(error) },
    );
  }
  return NextResponse.json({ products: data });
}

export async function POST(request: Request) {
  const { supabase, status } = await requireAuthenticatedTenantClient();
  if (!supabase) return NextResponse.json({ error: "no session" }, { status });

  const { venueId, status: venueStatus } = await requirePrimaryVenueId(supabase);
  if (!venueId)
    return NextResponse.json({ error: "no venue" }, { status: venueStatus ?? 500 });

  const body = (await request.json()) as {
    menuCategoryId?: string;
    defaultStationId?: string;
    name?: string;
    description?: string;
    unitPriceClp?: number;
    allergens?: string[];
    trackStock?: boolean;
  };

  const { data, error } = await supabase.rpc("create_product", {
    p_venue_id: venueId,
    p_menu_category_id: body.menuCategoryId ?? null,
    p_default_station_id: body.defaultStationId ?? null,
    p_name: body.name ?? "",
    p_description: body.description ?? null,
    p_unit_price_clp: body.unitPriceClp ?? 0,
    p_allergens: body.allergens ?? [],
    p_track_stock: body.trackStock ?? false,
  });

  if (error) {
    return NextResponse.json(
      { error: error.message },
      { status: statusForPostgrestError(error) },
    );
  }
  return NextResponse.json({ id: data }, { status: 201 });
}
