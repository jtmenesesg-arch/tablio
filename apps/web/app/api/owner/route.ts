import { NextResponse } from "next/server";
import {
  OWNER_DEMO_TENANT_ID,
  ownerDemoStore,
} from "../../../lib/owner-demo-store";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  try {
    const url = new URL(request.url);
    const venueId = url.searchParams.get("venue") ?? "all";
    const newTenant = url.searchParams.get("new") === "1";
    if (url.searchParams.get("format") === "csv") {
      return new NextResponse(
        ownerDemoStore.exportCsv({
          tenantId: OWNER_DEMO_TENANT_ID,
          venueId,
        }),
        {
          headers: {
            "content-type": "text/csv; charset=utf-8",
            "content-disposition":
              'attachment; filename="tablio-resumen-dueno.csv"',
          },
        },
      );
    }
    return NextResponse.json(
      ownerDemoStore.dashboard({
        tenantId: OWNER_DEMO_TENANT_ID,
        venueId,
        newTenant,
      }),
    );
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Consulta inválida." },
      { status: 403 },
    );
  }
}
