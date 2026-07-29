import { NextResponse } from "next/server";
import {
  ageWaiterTaskForTest,
  resetWaiterForTest,
  WaiterConflictError,
} from "../../../../lib/waiter-demo-store";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as
      | { action: "reset" }
      | { action: "age_task"; taskId: string; seconds: number };
    if (body.action === "reset") resetWaiterForTest();
    else if (body.action === "age_task") {
      ageWaiterTaskForTest(body.taskId, body.seconds);
    } else {
      throw new WaiterConflictError("Acción de prueba inválida.", 400);
    }
    return NextResponse.json({ ok: true });
  } catch (error) {
    const status = error instanceof WaiterConflictError ? error.status : 400;
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Error de prueba." },
      { status },
    );
  }
}
