import { NextResponse } from "next/server";
import {
  createPaidTicketForLatencyTest,
  getKdsBootstrap,
  kdsTicketStates,
  KdsConflictError,
  resetKdsForTest,
} from "../../../../lib/kds-demo-store";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as {
      action?: string;
      stationId?: "barra" | "cocina";
      orderNumber?: number;
      ticketId?: string;
    };
    if (body.action === "reset") {
      resetKdsForTest();
      return NextResponse.json(getKdsBootstrap("all"));
    }
    if (body.action === "create_paid_ticket" && body.stationId) {
      const ticketId = createPaidTicketForLatencyTest({
        stationId: body.stationId,
        orderNumber: body.orderNumber,
      });
      return NextResponse.json({
        ticketId,
        bootstrap: getKdsBootstrap(body.stationId),
      });
    }
    if (body.action === "ticket_state" && body.ticketId) {
      return NextResponse.json({
        state: kdsTicketStates([body.ticketId]).get(body.ticketId),
      });
    }
    throw new KdsConflictError("Acción de prueba inválida.", 400);
  } catch (error) {
    const status = error instanceof KdsConflictError ? error.status : 400;
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Prueba inválida." },
      { status },
    );
  }
}
