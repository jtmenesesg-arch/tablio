import { NextResponse } from "next/server";
import { tableManagementDemoStore } from "@/lib/table-management-demo-store";
import type { TableManagementMutation } from "@/lib/table-management-contract";

export const dynamic = "force-dynamic";

export async function GET() {
  return NextResponse.json(tableManagementDemoStore.snapshot(), {
    headers: { "cache-control": "no-store" },
  });
}

export async function POST(request: Request) {
  try {
    const mutation = (await request.json()) as TableManagementMutation;
    return NextResponse.json(tableManagementDemoStore.mutate(mutation), {
      headers: { "cache-control": "no-store" },
    });
  } catch (error) {
    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "No pudimos guardar el cambio.",
      },
      { status: 400 },
    );
  }
}
