import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import {
  consumeIssuedLoyaltyCredential,
  DinerError,
  getDinerBootstrap,
  joinDinerSession,
  mutateDiner,
} from "../../../lib/diner-demo-store";
import {
  DinerRealError,
  getRealDinerBootstrap,
  isRealQrToken,
  joinRealDinerSession,
  mutateRealDiner,
} from "../../../lib/diner-real-store";
import type { DinerMutation } from "../../../lib/diner-contract";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const DEVICE_COOKIE = "tablio_diner_device";
const LOYALTY_COOKIE = "tablio_diner_loyalty";
const REAL_DEVICE_COOKIE = "tablio_diner_device_real";
const DEMO_QR = "demo-mesa-8";

function errorResponse(error: unknown) {
  if (error instanceof DinerRealError) {
    return NextResponse.json(
      { error: error.message },
      { status: error.status, headers: { "cache-control": "no-store" } },
    );
  }
  const status = error instanceof DinerError ? error.status : 500;
  const message =
    error instanceof DinerError
      ? error.message
      : "No pudimos completar la acción. Intenta otra vez.";
  return NextResponse.json(
    { error: message },
    {
      status,
      headers: {
        "cache-control": "no-store",
        "x-tablio-demo-mode": "true",
      },
    },
  );
}

export async function GET(request: Request) {
  try {
    const requestUrl = new URL(request.url);
    const qrToken = requestUrl.searchParams.get("qr") ?? DEMO_QR;
    const cookieStore = await cookies();

    if (isRealQrToken(qrToken)) {
      const bootstrap = await getRealDinerBootstrap(
        cookieStore.get(REAL_DEVICE_COOKIE)?.value,
      );
      return NextResponse.json(bootstrap, {
        headers: { "cache-control": "no-store" },
      });
    }

    const bootstrap = await getDinerBootstrap(
      cookieStore.get(DEVICE_COOKIE)?.value,
      qrToken,
      cookieStore.get(LOYALTY_COOKIE)?.value,
    );
    return NextResponse.json(bootstrap, {
      headers: {
        "cache-control": "no-store",
        "x-tablio-demo-mode": "true",
      },
    });
  } catch (error) {
    return errorResponse(error);
  }
}

export async function POST(request: Request) {
  try {
    const mutation = (await request.json()) as DinerMutation;
    if (!mutation || typeof mutation.action !== "string") {
      throw new DinerError("La solicitud no es válida.", 400);
    }

    if (mutation.action === "join" && isRealQrToken(mutation.qrToken)) {
      const joined = await joinRealDinerSession(
        mutation.qrToken,
        mutation.presenceCode,
      );
      const response = NextResponse.json(joined.bootstrap, {
        headers: { "cache-control": "no-store" },
      });
      response.cookies.set(REAL_DEVICE_COOKIE, joined.token, {
        httpOnly: true,
        sameSite: "lax",
        secure: process.env.NODE_ENV === "production",
        path: "/",
        maxAge: 12 * 60 * 60,
      });
      return response;
    }

    if (mutation.action === "join") {
      const cookieStore = await cookies();
      const joined = joinDinerSession(
        mutation.qrToken,
        mutation.presenceCode,
        cookieStore.get(LOYALTY_COOKIE)?.value,
      );
      const response = NextResponse.json(joined.bootstrap, {
        headers: {
          "cache-control": "no-store",
          "x-tablio-demo-mode": "true",
        },
      });
      response.cookies.set(DEVICE_COOKIE, joined.token, {
        httpOnly: true,
        sameSite: "lax",
        secure: process.env.NODE_ENV === "production",
        path: "/",
        maxAge: 12 * 60 * 60,
      });
      return response;
    }

    const cookieStore = await cookies();
    const realDeviceToken = cookieStore.get(REAL_DEVICE_COOKIE)?.value;
    if (realDeviceToken) {
      // OI-034 Incremento 3: cart.add/update/remove ya tienen RPC real.
      // Quote/pago/fidelidad/saldo (Incrementos 4-5) todavía no existen —
      // mutateRealDiner las rechaza explícito con 501, nunca cae en
      // silencio al store en memoria.
      const bootstrap = await mutateRealDiner(realDeviceToken, mutation);
      return NextResponse.json(bootstrap, {
        headers: { "cache-control": "no-store" },
      });
    }

    const deviceToken = cookieStore.get(DEVICE_COOKIE)?.value;
    const bootstrap = await mutateDiner(deviceToken, mutation);
    const response = NextResponse.json(bootstrap, {
      headers: {
        "cache-control": "no-store",
        "x-tablio-demo-mode": "true",
      },
    });
    const credential = consumeIssuedLoyaltyCredential(deviceToken);
    if (credential === null) {
      response.cookies.delete(LOYALTY_COOKIE);
    } else if (credential) {
      response.cookies.set(LOYALTY_COOKIE, credential, {
        httpOnly: true,
        sameSite: "lax",
        secure: process.env.NODE_ENV === "production",
        path: "/",
        maxAge: 365 * 24 * 60 * 60,
      });
    }
    return response;
  } catch (error) {
    return errorResponse(error);
  }
}
