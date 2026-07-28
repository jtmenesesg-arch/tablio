import { NextResponse } from "next/server";
import {
  SimulatedPaymentLab,
  type DemoScenario,
} from "@tablio/payments-simulated";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const scenarios = new Set<DemoScenario>([
  "approved",
  "rejected",
  "duplicate",
  "late",
  "out_of_order",
  "partial_refund",
  "full_refund",
]);

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as { scenario?: unknown };
    if (
      typeof body.scenario !== "string" ||
      !scenarios.has(body.scenario as DemoScenario)
    ) {
      return NextResponse.json(
        { error: "Escenario demo inválido" },
        { status: 400 },
      );
    }

    const lab = new SimulatedPaymentLab();
    const result = await lab.run(body.scenario as DemoScenario);
    return NextResponse.json(result, {
      headers: {
        "cache-control": "no-store",
        "x-tablio-demo-mode": "true",
      },
    });
  } catch {
    return NextResponse.json(
      { error: "No se pudo ejecutar la simulación" },
      { status: 500 },
    );
  }
}
