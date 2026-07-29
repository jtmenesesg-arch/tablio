import { NextResponse } from "next/server";
import type { SubscriptionStatus } from "@tablio/application";
import {
  resetPlatformDemo,
  setDemoDinerSubscriptionStatus,
} from "../../../../lib/platform-demo-store";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  const body = (await request.json()) as
    | { action: "reset" }
    | { action: "diner_subscription"; status: SubscriptionStatus };
  if (body.action === "reset") resetPlatformDemo();
  else if (body.action === "diner_subscription") {
    setDemoDinerSubscriptionStatus(body.status);
  } else {
    return NextResponse.json({ error: "Acción inválida." }, { status: 400 });
  }
  return NextResponse.json({ ok: true });
}
