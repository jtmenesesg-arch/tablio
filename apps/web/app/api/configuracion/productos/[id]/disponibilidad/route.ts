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
  const body = (await request.json()) as { available?: boolean; reason?: string };

  const { data, error } = await supabase.rpc("set_product_availability", {
    p_product_id: id,
    p_available: body.available ?? true,
    p_reason: body.reason ?? "",
  });

  if (error) {
    return NextResponse.json(
      { error: error.message },
      { status: statusForPostgrestError(error) },
    );
  }
  return NextResponse.json({ result: data });
}
