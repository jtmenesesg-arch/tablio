import "server-only";

import { headers } from "next/headers";

export async function serverOrigin(): Promise<string> {
  const requestHeaders = await headers();
  const host =
    requestHeaders.get("x-forwarded-host") ?? requestHeaders.get("host");
  const protocol =
    requestHeaders.get("x-forwarded-proto") ??
    (host?.includes("localhost") ? "http" : "https");
  if (!host)
    throw new Error("No pudimos determinar la dirección pública de Tablio.");
  return `${protocol}://${host}`;
}
