import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import type { WaiterMutation } from "../../../lib/waiter-contract";
import {
  getWaiterBootstrap,
  loginWaiter,
  mutateWaiter,
  WaiterConflictError,
} from "../../../lib/waiter-demo-store";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const SHIFT_COOKIE = "tablio_waiter_shift";

function errorResponse(error: unknown) {
  const status = error instanceof WaiterConflictError ? error.status : 500;
  return NextResponse.json(
    {
      error:
        error instanceof Error
          ? error.message
          : "No pudimos completar la acción.",
    },
    { status, headers: { "cache-control": "no-store" } },
  );
}

export async function GET() {
  try {
    const cookieStore = await cookies();
    return NextResponse.json(
      getWaiterBootstrap(cookieStore.get(SHIFT_COOKIE)?.value),
      { headers: { "cache-control": "no-store" } },
    );
  } catch (error) {
    return errorResponse(error);
  }
}

export async function POST(request: Request) {
  try {
    const mutation = (await request.json()) as WaiterMutation;
    if (!mutation || typeof mutation.action !== "string") {
      throw new WaiterConflictError("La solicitud no es válida.", 400);
    }
    if (mutation.action === "login") {
      const logged = loginWaiter(mutation.pin, mutation.clientFingerprint);
      const response = NextResponse.json(logged.bootstrap, {
        headers: { "cache-control": "no-store" },
      });
      response.cookies.set(SHIFT_COOKIE, logged.token, {
        httpOnly: true,
        sameSite: "lax",
        secure: process.env.NODE_ENV === "production",
        path: "/",
        maxAge: 12 * 60 * 60,
      });
      return response;
    }

    const cookieStore = await cookies();
    const token = cookieStore.get(SHIFT_COOKIE)?.value;
    if (!token) throw new WaiterConflictError("Ingresa tu PIN.", 401);
    const result = mutateWaiter(token, mutation);
    const response = NextResponse.json(result, {
      headers: { "cache-control": "no-store" },
    });
    if (mutation.action === "shift.close") {
      response.cookies.delete(SHIFT_COOKIE);
    }
    return response;
  } catch (error) {
    return errorResponse(error);
  }
}
