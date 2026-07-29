import { NextResponse } from "next/server";
import type { SuperadminMutation } from "../../../lib/platform-contract";
import {
  PlatformDemoError,
  getSuperadminBootstrap,
  mutateSuperadmin,
} from "../../../lib/platform-demo-store";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function errorResponse(error: unknown) {
  return NextResponse.json(
    {
      error:
        error instanceof Error
          ? error.message
          : "No pudimos completar la acción de plataforma.",
    },
    {
      status: error instanceof PlatformDemoError ? error.status : 500,
      headers: { "cache-control": "no-store" },
    },
  );
}

export function GET() {
  return NextResponse.json(getSuperadminBootstrap(), {
    headers: { "cache-control": "no-store", "x-tablio-demo-mode": "true" },
  });
}

export async function POST(request: Request) {
  try {
    const mutation = (await request.json()) as SuperadminMutation;
    if (!mutation || typeof mutation.action !== "string") {
      throw new PlatformDemoError("Solicitud inválida.");
    }
    return NextResponse.json(await mutateSuperadmin(mutation), {
      headers: { "cache-control": "no-store", "x-tablio-demo-mode": "true" },
    });
  } catch (error) {
    return errorResponse(error);
  }
}
