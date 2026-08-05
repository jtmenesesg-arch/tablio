import { createClient } from "@supabase/supabase-js";
import { timingSafeEqual, createHmac } from "node:crypto";
import { NextResponse } from "next/server";

// OI-034 Incremento 5: receptor real del webhook de pago. Esta ruta NUNCA
// la llama el navegador del comensal — la llama el proveedor de pago (hoy,
// el worker simulado de supabase/functions/simulated-payment-provider,
// disparado por pg_cron; el día que se conecte una pasarela real, la va a
// llamar directo). La autenticación acá es la firma HMAC, no una sesión ni
// una cookie — así funciona cualquier webhook de pago real. Cuando cambie
// el proveedor, sólo cambia quién firma con qué secreto — esta verificación
// y todo lo que sigue queda igual.
//
// service_role se usa acá a propósito: esta NO es una ruta de usuario
// (AGENTS.md §4 la permite fuera de rutas de usuario) — nadie con sesión de
// comensal puede alcanzarla sin la firma correcta.

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const SIGNATURE_WINDOW_SECONDS = 300;

function serviceRoleClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.PAYMENT_WEBHOOK_SERVICE_ROLE_KEY!,
  );
}

function verifySignature(
  rawBody: string,
  timestampHeader: string | null,
  signatureHeader: string | null,
): boolean {
  if (!timestampHeader || !signatureHeader) return false;
  const timestamp = Number(timestampHeader);
  if (!Number.isFinite(timestamp)) return false;
  if (Math.abs(Date.now() / 1000 - timestamp) > SIGNATURE_WINDOW_SECONDS) {
    return false;
  }

  const expected = createHmac("sha256", process.env.PAYMENT_WEBHOOK_SECRET!)
    .update(`${timestampHeader}.${rawBody}`)
    .digest("hex");
  const provided = signatureHeader.replace(/^sha256=/, "");

  const expectedBuf = Buffer.from(expected, "hex");
  const providedBuf = Buffer.from(provided, "hex");
  if (expectedBuf.length !== providedBuf.length) return false;
  return timingSafeEqual(expectedBuf, providedBuf);
}

type WebhookPayload = {
  provider: string;
  providerEventId: string;
  providerPaymentId: string;
  eventKind: string;
  normalizedStatus: string;
  amountClp: number;
  currency: string;
  providerMerchantId: string;
  checkoutQuoteId: string;
  tenantId: string;
  occurredAt: string;
};

export async function POST(request: Request) {
  const rawBody = await request.text();
  const signatureValid = verifySignature(
    rawBody,
    request.headers.get("x-tablio-timestamp"),
    request.headers.get("x-tablio-signature"),
  );

  if (!signatureValid) {
    // Firma inválida o vencida: se rechaza en la puerta, nunca se escribe
    // nada en la base. No es lo mismo que "el proveedor mandó algo que no
    // pudo verificar" (ese caso sí lo maneja confirm_provider_payment_event
    // con p_signature_verified=false) — acá directamente no confiamos en
    // que el remitente sea quien dice ser.
    return NextResponse.json({ error: "invalid signature" }, { status: 401 });
  }

  let payload: WebhookPayload;
  try {
    payload = JSON.parse(rawBody);
  } catch {
    return NextResponse.json({ error: "invalid payload" }, { status: 400 });
  }

  const now = new Date();
  const supabase = serviceRoleClient();
  const { data, error } = await supabase.rpc("worker_confirm_provider_payment_event", {
    p_tenant_id: payload.tenantId,
    p_provider: payload.provider,
    p_provider_event_id: payload.providerEventId,
    p_provider_payment_id: payload.providerPaymentId,
    p_event_kind: payload.eventKind,
    p_normalized_status: payload.normalizedStatus,
    p_amount_clp: payload.amountClp,
    p_currency: payload.currency,
    p_provider_merchant_id: payload.providerMerchantId,
    p_checkout_quote_id: payload.checkoutQuoteId,
    p_signature_verified: true,
    p_server_verified: true,
    p_occurred_at: payload.occurredAt,
    p_received_at: now.toISOString(),
    p_payload: payload,
  });

  if (error) {
    console.error("payment webhook confirm failed", error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json(data, { headers: { "cache-control": "no-store" } });
}
