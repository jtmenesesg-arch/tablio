const supabaseUrl = Deno.env.get("SUPABASE_URL");
const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
const workerName = "tax-document-consumer-v1";

if (!supabaseUrl || !serviceRoleKey) {
  throw new Error("Supabase worker environment is incomplete");
}

type QueueMessage = {
  message_id: number;
  message: {
    outbox_message_id: string;
    tenant_id: string;
    topic: string;
    deduplication_key: string;
    payload: Record<string, unknown>;
  };
};

type TaxDocumentRow = {
  id: string;
  tenant_id: string;
  provider_code: string;
  provider_account_id: string;
  kind: "electronic_receipt" | "credit_note";
  status:
    "queued" | "processing" | "waiting_for_original" | "issued" | "failed";
  idempotency_key: string;
  amount_clp: number;
};

async function rest<T>(path: string, init: RequestInit = {}): Promise<T> {
  const response = await fetch(`${supabaseUrl}/rest/v1/${path}`, {
    ...init,
    headers: {
      apikey: serviceRoleKey,
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

async function rpc<T>(
  name: string,
  parameters: Record<string, unknown>,
): Promise<T> {
  return rest<T>(`rpc/${name}`, {
    method: "POST",
    body: JSON.stringify(parameters),
  });
}

async function documentById(id: string): Promise<TaxDocumentRow> {
  const rows = await rest<TaxDocumentRow[]>(
    `tax_documents?select=id,tenant_id,provider_code,provider_account_id,kind,status,idempotency_key,amount_clp&id=eq.${encodeURIComponent(id)}&limit=1`,
  );
  if (!rows[0]) throw new Error("Tax document was not found after preparation");
  return rows[0];
}

function requireId(value: unknown, label: string): string {
  if (typeof value !== "string" || !value) {
    throw new Error(`${label} is required`);
  }
  return value;
}

async function prepareDocument(
  envelope: QueueMessage["message"],
): Promise<string | undefined> {
  if (envelope.topic === "tax_document.order_confirmed") {
    const result = await rpc<{
      tax_document_id?: string;
      expected_backing: string;
    }>("worker_prepare_tax_order", {
      p_order_id: requireId(envelope.payload.order_id, "order_id"),
    });
    return result.tax_document_id;
  }
  if (envelope.topic === "tax_document.refund_requested") {
    const result = await rpc<{
      tax_document_id?: string;
      status: string;
    }>("worker_prepare_tax_refund", {
      p_refund_id: requireId(envelope.payload.refund_id, "refund_id"),
    });
    if (result.status === "money_refund_not_completed") {
      throw new Error("Money refund is not completed yet");
    }
    return result.tax_document_id;
  }
  if (envelope.topic === "tax_document.retry") {
    return requireId(envelope.payload.tax_document_id, "tax_document_id");
  }
  throw new Error(`Unsupported tax topic: ${envelope.topic}`);
}

async function simulateProvider(
  document: TaxDocumentRow,
  payload: Record<string, unknown>,
): Promise<void> {
  if (document.provider_code !== "simulated") {
    throw new Error(
      `No production adapter deployed for provider ${document.provider_code}`,
    );
  }
  const delayMs =
    typeof payload.tax_demo_delay_ms === "number"
      ? Math.min(Math.max(payload.tax_demo_delay_ms, 0), 10_000)
      : 25;
  await new Promise((resolve) => setTimeout(resolve, delayMs));
  if (payload.tax_demo_outcome === "failure") {
    throw new Error("Simulated DTE provider failure");
  }
}

async function consume(item: QueueMessage): Promise<"completed" | "duplicate"> {
  const envelope = item.message;
  const lockToken = await rpc<string | null>("worker_claim_tax_event", {
    p_tenant_id: envelope.tenant_id,
    p_event_id: envelope.outbox_message_id,
    p_lease_seconds: 120,
  });

  if (!lockToken) {
    await rpc("worker_complete_tax_outbox", {
      p_tenant_id: envelope.tenant_id,
      p_outbox_message_id: envelope.outbox_message_id,
      p_queue_message_id: item.message_id,
      p_worker_name: workerName,
    });
    return "duplicate";
  }

  const startedAt = Date.now();
  try {
    const documentId = await prepareDocument(envelope);
    if (documentId) {
      const document = await documentById(documentId);
      if (document.status !== "issued") {
        try {
          await simulateProvider(document, envelope.payload);
          const providerDocumentId = `demo-dte:${document.id}`;
          const folio = `SIM-${document.id.slice(0, 8).toUpperCase()}`;
          await rpc("worker_record_tax_result", {
            p_tax_document_id: document.id,
            p_outcome: "issued",
            p_provider_document_id: providerDocumentId,
            p_folio: folio,
            p_representation_url: `${supabaseUrl}/functions/v1/tax-document-consumer?document=${encodeURIComponent(providerDocumentId)}`,
            p_stamp: `TED-DEMO-${folio}`,
            p_duration_ms: Date.now() - startedAt,
          });
        } catch (error) {
          const message =
            error instanceof Error ? error.message : "Unknown provider failure";
          await rpc("worker_record_tax_result", {
            p_tax_document_id: document.id,
            p_outcome: "failed",
            p_error_code: "SIMULATED_PROVIDER_FAILURE",
            p_error_message: message,
            p_duration_ms: Date.now() - startedAt,
          });
          throw error;
        }
      }
    }

    await rpc("worker_complete_tax_event", {
      p_tenant_id: envelope.tenant_id,
      p_event_id: envelope.outbox_message_id,
      p_lock_token: lockToken,
      p_result: {
        tax_document_id: documentId ?? null,
        idempotency_key: envelope.deduplication_key,
      },
    });
    await rpc("worker_complete_tax_outbox", {
      p_tenant_id: envelope.tenant_id,
      p_outbox_message_id: envelope.outbox_message_id,
      p_queue_message_id: item.message_id,
      p_worker_name: workerName,
    });
    return "completed";
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Unknown tax consumer failure";
    await rpc("worker_fail_tax_outbox", {
      p_tenant_id: envelope.tenant_id,
      p_outbox_message_id: envelope.outbox_message_id,
      p_queue_message_id: item.message_id,
      p_worker_name: workerName,
      p_error: message,
    });
    throw error;
  }
}

async function handleRequest(request: Request): Promise<Response> {
  const calledWithServiceRole =
    request.headers.get("authorization") === `Bearer ${serviceRoleKey}`;
  if (!calledWithServiceRole) {
    const candidate = request.headers.get("x-tablio-cron-secret");
    if (
      !candidate ||
      !(await rpc<boolean>("worker_validate_tax_cron_secret", {
        p_candidate: candidate,
      }))
    ) {
      return new Response("Forbidden", { status: 403 });
    }
  }

  const url = new URL(request.url);
  if (request.method === "GET" && url.searchParams.has("document")) {
    const document = url.searchParams.get("document")!;
    return new Response(
      `<!doctype html><html lang="es"><meta charset="utf-8"><title>DTE demo</title><body><h1>Documento tributario simulado</h1><p>${document}</p><strong>NO ES UN DTE REAL</strong></body></html>`,
      { headers: { "content-type": "text/html; charset=utf-8" } },
    );
  }

  if (request.method !== "POST") {
    return new Response("Method not allowed", { status: 405 });
  }

  await rpc("worker_enqueue_pending_outbox", { p_limit: 100 });
  const messages = await rpc<QueueMessage[]>("worker_read_tax_messages", {
    p_visibility_timeout_seconds: 120,
    p_limit: 20,
  });
  const results = [];
  for (const message of messages) {
    try {
      results.push({
        messageId: message.message_id,
        outcome: await consume(message),
      });
    } catch (error) {
      results.push({
        messageId: message.message_id,
        outcome: "retry_or_dead_letter",
        error: error instanceof Error ? error.message : "unknown",
      });
    }
  }
  return Response.json({
    worker: workerName,
    processed: results.length,
    results,
  });
}

Deno.serve(async (request) => {
  try {
    return await handleRequest(request);
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Unknown worker request failure";
    console.error(JSON.stringify({ worker: workerName, error: message }));
    return Response.json(
      { worker: workerName, error: message },
      { status: 500 },
    );
  }
});
