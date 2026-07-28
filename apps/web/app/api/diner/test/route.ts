import { NextResponse } from "next/server";
import {
  DinerError,
  setProductAvailabilityForTest,
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
      productId?: unknown;
      available?: unknown;
    };
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
