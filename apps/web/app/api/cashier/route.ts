import { NextResponse } from "next/server";
import type { CashierMutation } from "../../../lib/cashier-contract";
import {
  CashierConflictError,
  exportCashierCsv,
  getCashierBootstrap,
  mutateCashier,
} from "../../../lib/cashier-demo-store";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function errorResponse(error: unknown) {
  const status = error instanceof CashierConflictError ? error.status : 500;
  return NextResponse.json(
    {
      error:
        error instanceof Error
          ? error.message
          : "No pudimos completar la acción.",
    },
    { status, headers: { "cache-control": "no-store" } },
  );
}

export function GET(request: Request) {
  try {
    const url = new URL(request.url);
    const exportKind = url.searchParams.get("export");
    if (exportKind === "closure" || exportKind === "exceptions") {
      const csv = exportCashierCsv(exportKind);
      return new Response(csv, {
        headers: {
          "cache-control": "no-store",
          "content-disposition": `attachment; filename="tablio-${exportKind}.csv"`,
          "content-type": "text/csv; charset=utf-8",
        },
      });
    }
    return NextResponse.json(getCashierBootstrap(), {
      headers: { "cache-control": "no-store" },
    });
  } catch (error) {
    return errorResponse(error);
  }
}

export async function POST(request: Request) {
  try {
    const mutation = (await request.json()) as CashierMutation;
    if (!mutation || typeof mutation.action !== "string") {
      throw new CashierConflictError("La solicitud no es válida.", 400);
    }
    return NextResponse.json(mutateCashier(mutation), {
      headers: { "cache-control": "no-store" },
    });
  } catch (error) {
    return errorResponse(error);
  }
}
