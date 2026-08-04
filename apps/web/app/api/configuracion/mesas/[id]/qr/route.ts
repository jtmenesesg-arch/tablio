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
  const body = (await request.json()) as { reason?: string };

  const [qrResult, presenceResult] = await Promise.all([
    supabase.rpc("reveal_table_qr_token", {
      p_table_id: id,
      p_reason: body.reason ?? "",
    }),
    supabase.rpc("reveal_table_presence_code", {
      p_table_id: id,
      p_reason: body.reason ?? "",
    }),
  ]);

  if (qrResult.error) {
    return NextResponse.json(
      { error: qrResult.error.message },
      { status: statusForPostgrestError(qrResult.error) },
    );
  }
  if (presenceResult.error) {
    return NextResponse.json(
      { error: presenceResult.error.message },
      { status: statusForPostgrestError(presenceResult.error) },
    );
  }

  return NextResponse.json({
    qrToken: qrResult.data,
    presenceCode: presenceResult.data,
  });
}
