import { NextResponse } from "next/server";
import type { TableCreditMutation } from "../../../lib/table-credit-contract";
import {
  creditDemoActor,
  TableCreditError,
  tableCreditDemoStore,
} from "../../../lib/table-credit-demo-store";

export const dynamic = "force-dynamic";

export async function GET() {
  return NextResponse.json(tableCreditDemoStore.bootstrap(creditDemoActor));
}

export async function POST(request: Request) {
  try {
    const mutation = (await request.json()) as TableCreditMutation;
    return NextResponse.json(
      tableCreditDemoStore.mutate(creditDemoActor, mutation),
    );
  } catch (error) {
    const status = error instanceof TableCreditError ? error.status : 500;
    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "No pudimos guardar la acción.",
      },
      { status },
    );
  }
}
