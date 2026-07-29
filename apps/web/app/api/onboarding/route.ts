import { NextResponse } from "next/server";
import type { OnboardingMutation } from "../../../lib/platform-contract";
import {
  PlatformDemoError,
  getOnboardingBootstrap,
  mutateOnboarding,
} from "../../../lib/platform-demo-store";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function errorResponse(error: unknown) {
  return NextResponse.json(
    {
      error:
        error instanceof Error ? error.message : "No pudimos guardar el paso.",
    },
    {
      status: error instanceof PlatformDemoError ? error.status : 500,
      headers: { "cache-control": "no-store" },
    },
  );
}

export function GET() {
  return NextResponse.json(getOnboardingBootstrap(), {
    headers: { "cache-control": "no-store", "x-tablio-demo-mode": "true" },
  });
}

export async function POST(request: Request) {
  try {
    const mutation = (await request.json()) as OnboardingMutation;
    if (!mutation || typeof mutation.action !== "string") {
      throw new PlatformDemoError("Solicitud inválida.");
    }
    return NextResponse.json(await mutateOnboarding(mutation), {
      headers: { "cache-control": "no-store", "x-tablio-demo-mode": "true" },
    });
  } catch (error) {
    return errorResponse(error);
  }
}
