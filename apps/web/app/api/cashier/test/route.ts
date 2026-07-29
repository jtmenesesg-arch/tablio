import { NextResponse } from "next/server";
import {
  CashierConflictError,
  expireManualProductionForTest,
  resetCashierForTest,
  seedCashierExceptionForTest,
} from "../../../../lib/cashier-demo-store";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as
      | { action: "reset" }
      | { action: "expire_manual_window" }
      | {
          action: "seed_exception";
          type:
            | "payment_approved_without_order"
            | "approved_after_quote_expired"
            | "amount_or_currency_mismatch"
            | "merchant_or_tenant_mismatch"
            | "tax_document_failed"
            | "refund_not_reflected"
            | "settlement_difference";
          deduplicationKey: string;
        };
    if (body.action === "reset") resetCashierForTest();
    else if (body.action === "expire_manual_window") {
      expireManualProductionForTest();
    } else if (body.action === "seed_exception") {
      seedCashierExceptionForTest(body);
    } else {
      throw new CashierConflictError("Acción de prueba inválida.", 400);
    }
    return NextResponse.json({ ok: true });
  } catch (error) {
    const status = error instanceof CashierConflictError ? error.status : 400;
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Error de prueba." },
      { status },
    );
  }
}
