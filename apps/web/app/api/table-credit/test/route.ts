import { NextResponse } from "next/server";
import {
  TableCreditError,
  tableCreditDemoStore,
} from "../../../../lib/table-credit-demo-store";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  try {
    if (process.env.TABLIO_E2E !== "1") {
      throw new TableCreditError("Ruta disponible sólo en pruebas.", 404);
    }
    const body = (await request.json()) as {
      action: "reset";
      seed?: boolean;
    };
    if (body.action !== "reset") {
      throw new TableCreditError("Acción de prueba inválida.", 400);
    }
    tableCreditDemoStore.reset(body.seed ?? true);
    return NextResponse.json({ ok: true });
  } catch (error) {
    const status = error instanceof TableCreditError ? error.status : 400;
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Error de prueba." },
      { status },
    );
  }
}
