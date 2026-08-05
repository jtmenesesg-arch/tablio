// OI-034 Incremento 5: hace de "proveedor de pago" — NUNCA se invoca desde
// el navegador del comensal, sólo por pg_cron (ver
// supabase/migrations/20260805142000_sprint_14_payment_worker_schedule.sql).
// Decide el resultado (siempre "approved" en este incremento — rechazos
// quedan para un incremento aparte, el código de rechazo en
// confirm_provider_payment_event ya existe y está cubierto por pgTAP) y
// llama al webhook real por HTTP, firmado con HMAC — el mismo camino que
// usaría un proveedor real. Cuando se conecte una pasarela real, esta
// función entera deja de existir: el proveedor llama al webhook
// directamente. Lo que NO cambia es el webhook receptor
// (apps/web/app/api/payments/webhook/route.ts) ni la verificación de firma.
//
// Nota de honestidad explícita (pedida por el fundador): el disparador acá
// es pg_cron cada 1 minuto (mínimo de granularidad de pg_cron en este
// proyecto), no segundos como un proveedor real podría tardar. Es una
// latencia real y hablada, no oculta — se documenta también en
// docs/BUILD_LOG.md y DEMO_ACCESS.md.

const supabaseUrl = Deno.env.get("SUPABASE_URL");
const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
const workerName = "simulated-payment-provider-v1";

if (!supabaseUrl || !serviceRoleKey) {
  throw new Error("Supabase worker environment is incomplete");
}

type ClaimedIntent = {
  intent_id: string;
  tenant_id: string;
  provider_payment_id: string;
  amount_clp: number;
  currency: string;
  checkout_quote_id: string;
  provider_merchant_id: string;
};

type WorkerConfig = {
  webhookUrl: string;
  webhookSecret: string;
};

async function rest<T>(path: string, init: RequestInit = {}): Promise<T> {
  const response = await fetch(`${supabaseUrl}/rest/v1/${path}`, {
    ...init,
    headers: {
      apikey: serviceRoleKey!,
      authorization: `Bearer ${serviceRoleKey}`,
      "content-type": "application/json",
      ...(init.headers ?? {}),
    },
  });
  const text = await response.text();
  if (!response.ok) {
    throw new Error(`Supabase ${path} failed (${response.status}): ${text}`);
  }
  return (text ? JSON.parse(text) : null) as T;
}

async function rpc<T>(name: string, parameters: Record<string, unknown>): Promise<T> {
  return rest<T>(`rpc/${name}`, { method: "POST", body: JSON.stringify(parameters) });
}

async function hmacHex(secret: string, message: string): Promise<string> {
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const signature = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(message));
  return Array.from(new Uint8Array(signature))
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");
}

async function notifyIntent(config: WorkerConfig, intent: ClaimedIntent) {
  const timestamp = Math.floor(Date.now() / 1000);
  const body = JSON.stringify({
    provider: "tablio-simulado",
    providerEventId: crypto.randomUUID(),
    providerPaymentId: intent.provider_payment_id,
    eventKind: "payment",
    normalizedStatus: "approved",
    amountClp: intent.amount_clp,
    currency: intent.currency,
    providerMerchantId: intent.provider_merchant_id,
    checkoutQuoteId: intent.checkout_quote_id,
    tenantId: intent.tenant_id,
    occurredAt: new Date().toISOString(),
  });
  const signature = await hmacHex(config.webhookSecret, `${timestamp}.${body}`);

  const response = await fetch(config.webhookUrl, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-tablio-signature": `sha256=${signature}`,
      "x-tablio-timestamp": String(timestamp),
    },
    body,
  });
  const text = await response.text();
  if (!response.ok) {
    throw new Error(`webhook POST failed (${response.status}): ${text}`);
  }
  return text ? JSON.parse(text) : null;
}

async function handleRequest(request: Request): Promise<Response> {
  const calledWithServiceRole =
    request.headers.get("authorization") === `Bearer ${serviceRoleKey}`;
  if (!calledWithServiceRole) {
    const candidate = request.headers.get("x-tablio-cron-secret");
    if (
      !candidate ||
      !(await rpc<boolean>("worker_validate_payment_cron_secret", { p_candidate: candidate }))
    ) {
      return new Response("Forbidden", { status: 403 });
    }
  }

  if (request.method !== "POST") {
    return new Response("Method not allowed", { status: 405 });
  }

  const config = await rpc<WorkerConfig>("worker_get_payment_worker_config", {});
  const intents = await rpc<ClaimedIntent[]>("worker_claim_pending_payment_intents", {
    p_limit: 20,
  });

  const results = [];
  for (const intent of intents) {
    try {
      results.push({ intentId: intent.intent_id, outcome: await notifyIntent(config, intent) });
    } catch (error) {
      results.push({
        intentId: intent.intent_id,
        outcome: "webhook_delivery_failed",
        error: error instanceof Error ? error.message : "unknown",
      });
    }
  }

  return Response.json({ worker: workerName, processed: results.length, results });
}

Deno.serve(async (request) => {
  try {
    return await handleRequest(request);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown worker request failure";
    console.error(JSON.stringify({ worker: workerName, error: message }));
    return Response.json({ worker: workerName, error: message }, { status: 500 });
  }
});
