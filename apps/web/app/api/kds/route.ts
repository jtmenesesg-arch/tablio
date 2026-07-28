import { NextResponse } from "next/server";
import type { KdsMutation } from "../../../lib/kds-contract";
import {
  getKdsBootstrap,
  KdsConflictError,
  mutateKds,
} from "../../../lib/kds-demo-store";

export const dynamic = "force-dynamic";

export function GET(request: Request) {
  const station =
    new URL(request.url).searchParams.get("station")?.toLowerCase() ?? "all";
  return NextResponse.json(getKdsBootstrap(station), {
    headers: { "cache-control": "no-store" },
  });
}

export async function POST(request: Request) {
  try {
    const mutation = (await request.json()) as KdsMutation;
    return NextResponse.json(mutateKds(mutation), {
      headers: { "cache-control": "no-store" },
    });
  } catch (error) {
    const status = error instanceof KdsConflictError ? error.status : 400;
    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "No pudimos actualizar el KDS.",
      },
      { status },
    );
  }
}
