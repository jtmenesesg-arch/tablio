import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import {
  DinerError,
  resetLoyaltyForTest,
  seedLoyaltyProgressForTest,
  setProductAvailabilityForTest,
  resetCheckoutEngagementForTest,
  setDemoPromotion,
  setDemoTableClosedForTest,
} from "../../../../lib/diner-demo-store";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  try {
    if (
      process.env.TABLIO_E2E !== "1" ||
      request.headers.get("x-tablio-e2e") !== "1"
    ) {
      throw new DinerError("No encontrado.", 404);
    }
    const body = (await request.json()) as {
      action?: unknown;
      productId?: unknown;
      available?: unknown;
      stamps?: unknown;
      enabled?: unknown;
      tableId?: unknown;
    };
    if (body.action === "loyalty.reset") {
      resetLoyaltyForTest();
      return NextResponse.json({ ok: true });
    }
    if (body.action === "engagement.reset") {
      resetCheckoutEngagementForTest();
      return NextResponse.json({ ok: true });
    }
    if (
      body.action === "engagement.promotion" &&
      typeof body.enabled === "boolean"
    ) {
      setDemoPromotion(body.enabled);
      return NextResponse.json({ ok: true });
    }
    if (
      body.action === "engagement.table_closed" &&
      typeof body.tableId === "string" &&
      typeof body.enabled === "boolean"
    ) {
      setDemoTableClosedForTest(body.tableId, body.enabled);
      return NextResponse.json({ ok: true });
    }
    if (body.action === "loyalty.seed" && typeof body.stamps === "number") {
      const cookieStore = await cookies();
      seedLoyaltyProgressForTest(
        cookieStore.get("tablio_diner_device")?.value,
        body.stamps,
      );
      return NextResponse.json({ ok: true });
    }
    if (
      typeof body.productId !== "string" ||
      typeof body.available !== "boolean"
    ) {
      throw new DinerError("Solicitud de prueba inválida.", 400);
    }
    setProductAvailabilityForTest(body.productId, body.available);
    return NextResponse.json({ ok: true });
  } catch (error) {
    const status = error instanceof DinerError ? error.status : 500;
    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "No se pudo preparar el test.",
      },
      { status },
    );
  }
}
