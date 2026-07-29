import { mkdirSync, writeFileSync } from "node:fs";
import { cpus, platform, release } from "node:os";
import { dirname, resolve } from "node:path";
import { performance } from "node:perf_hooks";

type Percentiles = {
  samples: number;
  p50Ms: number;
  p95Ms: number;
  p99Ms: number;
  maxMs: number;
};

type CheckoutResult = {
  confirmationToKdsMs: number;
  requestMs: number;
  ticketId: string;
};

const baseUrl = process.env.TABLIO_LOAD_BASE_URL ?? "http://localhost:3100";
const quick = process.env.TABLIO_LOAD_QUICK === "1";
const outputPath = resolve(
  process.env.TABLIO_LOAD_OUTPUT ?? "docs/evidence/SPRINT-10-LOAD-RESULTS.json",
);

function percentile(values: readonly number[], quantile: number): number {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((left, right) => left - right);
  const index = (sorted.length - 1) * quantile;
  const lower = Math.floor(index);
  const upper = Math.ceil(index);
  if (lower === upper) return Math.round(sorted[lower]);
  const weight = index - lower;
  return Math.round(sorted[lower] * (1 - weight) + sorted[upper] * weight);
}

function summarize(values: readonly number[]): Percentiles {
  return {
    samples: values.length,
    p50Ms: percentile(values, 0.5),
    p95Ms: percentile(values, 0.95),
    p99Ms: percentile(values, 0.99),
    maxMs: Math.round(Math.max(0, ...values)),
  };
}

async function jsonRequest<T>(
  path: string,
  options: RequestInit = {},
): Promise<{ body: T; response: Response; elapsedMs: number }> {
  const started = performance.now();
  const response = await fetch(`${baseUrl}${path}`, options);
  const elapsedMs = performance.now() - started;
  const body = (await response.json()) as T & { error?: string };
  if (!response.ok) {
    throw new Error(
      `${options.method ?? "GET"} ${path}: ${response.status} ${body.error ?? ""}`,
    );
  }
  return { body, response, elapsedMs };
}

function headers(cookie?: string): HeadersInit {
  return {
    "content-type": "application/json",
    ...(cookie ? { cookie } : {}),
  };
}

function post<T>(path: string, body: unknown, cookie?: string) {
  return jsonRequest<T>(path, {
    method: "POST",
    headers: headers(cookie),
    body: JSON.stringify(body),
  });
}

function deviceCookie(response: Response): string {
  const value = response.headers.get("set-cookie")?.split(";")[0];
  if (!value) throw new Error("La sesión de dispositivo no entregó cookie");
  return value;
}

async function resetKds() {
  await post("/api/kds/test", { action: "reset" });
}

async function heartbeat(clientId: string) {
  await post("/api/kds", {
    action: "heartbeat",
    clientId,
    stationId: "all",
  });
}

async function disconnect(clientId: string) {
  await post("/api/kds", { action: "disconnect", clientId });
}

async function checkout(index: number): Promise<CheckoutResult> {
  const started = performance.now();
  const joined = await post<{
    session: { alias: string };
  }>("/api/diner", {
    action: "join",
    qrToken: "demo-mesa-8",
    presenceCode: "4826",
  });
  const cookie = deviceCookie(joined.response);
  await post(
    "/api/diner",
    {
      action: "cart.add",
      productId: "lager-casa",
      variantId: "lager-330",
      quantity: 1,
      note: `Carga Sprint 10 #${index}`,
    },
    cookie,
  );
  const quote = await post<{
    quote: { id: string };
  }>(
    "/api/diner",
    {
      action: "quote.create",
      tipClp: 0,
      displayName: `Carga ${index}`,
      idempotencyKey: `s10-quote-${index}`,
    },
    cookie,
  );
  await post(
    "/api/diner",
    {
      action: "payment.start",
      quoteId: quote.body.quote.id,
      idempotencyKey: `s10-payment-${index}`,
    },
    cookie,
  );
  await new Promise((resolvePromise) => setTimeout(resolvePromise, 700));
  const confirmed = await jsonRequest<{
    orders: Array<{
      confirmedAt: string;
      tickets: Array<{ id: string }>;
    }>;
  }>("/api/diner?qr=demo-mesa-8", { headers: { cookie } });
  const order = confirmed.body.orders[0];
  if (!order) throw new Error(`Checkout ${index} no produjo pedido confirmado`);
  const ticket = order.tickets[0];
  if (!ticket) throw new Error(`Checkout ${index} no produjo comanda`);
  await post("/api/kds", {
    action: "ticket.visible",
    ticketId: ticket.id,
    clientId: "s10-kds-primary",
    source: "realtime",
  });
  return {
    confirmationToKdsMs: Date.now() - Date.parse(order.confirmedAt),
    requestMs: performance.now() - started,
    ticketId: ticket.id,
  };
}

async function scanBurst(count: number) {
  const requests = await Promise.all(
    Array.from({ length: count }, async () => {
      const started = performance.now();
      const response = await fetch(`${baseUrl}/mesa/demo-mesa-8`);
      if (!response.ok) throw new Error(`scan: ${response.status}`);
      await response.text();
      return performance.now() - started;
    }),
  );
  return summarize(requests);
}

function subscribe(path: string, signal: AbortSignal) {
  const state = { events: 0, connected: false };
  const done = (async () => {
    const response = await fetch(`${baseUrl}${path}`, { signal });
    if (!response.ok || !response.body) {
      throw new Error(`No se pudo abrir stream ${path}`);
    }
    state.connected = true;
    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let buffer = "";
    while (!signal.aborted) {
      const chunk = await reader.read();
      if (chunk.done) break;
      buffer += decoder.decode(chunk.value, { stream: true });
      const frames = buffer.split("\n\n");
      buffer = frames.pop() ?? "";
      state.events += frames.filter((frame) => frame.includes("event:")).length;
    }
  })().catch((error: unknown) => {
    if (!signal.aborted) throw error;
  });
  return { state, done };
}

async function fanoutSnapshot(readers: number): Promise<Percentiles> {
  const durations = await Promise.all(
    Array.from({ length: readers }, async (_, index) => {
      const started = performance.now();
      const path = index % 2 === 0 ? "/api/kds?station=all" : "/api/waiter";
      const response = await fetch(`${baseUrl}${path}`);
      if (!response.ok) throw new Error(`fanout ${path}: ${response.status}`);
      await response.json();
      return performance.now() - started;
    }),
  );
  return summarize(durations);
}

async function runProfile(input: {
  name: string;
  count: number;
  batchSize: number;
  intervalMs: number;
  fanoutReaders: number;
}) {
  await resetKds();
  const stableClients = [
    "s10-kds-primary",
    "s10-kds-secondary",
    "s10-kds-kitchen",
    "s10-kds-all",
    "s10-kds-reconnect",
  ];
  await Promise.all(stableClients.map(heartbeat));
  const heartbeatTimer = setInterval(() => {
    void Promise.all(stableClients.slice(0, 4).map(heartbeat));
  }, 20_000);

  const streamController = new AbortController();
  const kdsStreams = Array.from({ length: 4 }, () =>
    subscribe("/api/kds/events", streamController.signal),
  );
  const waiterStreams = Array.from({ length: 8 }, () =>
    subscribe("/api/waiter/events", streamController.signal),
  );
  while (
    ![...kdsStreams, ...waiterStreams].every((item) => item.state.connected)
  ) {
    await new Promise((resolvePromise) => setTimeout(resolvePromise, 25));
  }

  const results: CheckoutResult[] = [];
  const fanoutSamples: number[] = [];
  const errors: string[] = [];
  const batches = Math.ceil(input.count / input.batchSize);
  const profileStarted = performance.now();
  let reconnectEvidence:
    { disconnectedMs: number; recoveredTickets: number } | undefined;

  for (let batch = 0; batch < batches; batch += 1) {
    const remaining = input.count - results.length;
    const currentSize = Math.min(input.batchSize, remaining);
    const batchResults = await Promise.allSettled(
      Array.from({ length: currentSize }, (_, offset) =>
        checkout(batch * input.batchSize + offset + 1),
      ),
    );
    for (const result of batchResults) {
      if (result.status === "fulfilled") results.push(result.value);
      else errors.push(String(result.reason));
    }

    const fanout = await fanoutSnapshot(input.fanoutReaders);
    fanoutSamples.push(fanout.p50Ms, fanout.p95Ms, fanout.p99Ms);

    if (batch === Math.floor(batches / 2) && !reconnectEvidence) {
      const disconnectedAt = performance.now();
      await disconnect("s10-kds-reconnect");
      const recovered = await jsonRequest<{ tickets: unknown[] }>(
        "/api/kds?station=all",
      );
      await heartbeat("s10-kds-reconnect");
      reconnectEvidence = {
        disconnectedMs: Math.round(performance.now() - disconnectedAt),
        recoveredTickets: recovered.body.tickets.length,
      };
    }

    if (batch < batches - 1) {
      const nextTarget =
        profileStarted + (batch + 1) * Math.max(0, input.intervalMs);
      const remainingWait = nextTarget - performance.now();
      if (remainingWait > 0) {
        await new Promise((resolvePromise) =>
          setTimeout(resolvePromise, remainingWait),
        );
      }
    }
  }

  clearInterval(heartbeatTimer);
  await new Promise((resolvePromise) => setTimeout(resolvePromise, 100));
  streamController.abort();
  await Promise.allSettled(
    [...kdsStreams, ...waiterStreams].map((item) => item.done),
  );
  const snapshot = await jsonRequest<{
    tickets: unknown[];
    printJobs: unknown[];
    latency: {
      connectedSampleCount: number;
      noKdsConnectedCount: number;
      connectedNotYetVisibleCount: number;
      p50Ms?: number;
      p95Ms?: number;
      p99Ms?: number;
    };
  }>("/api/kds?station=all");

  return {
    name: input.name,
    configuredOrders: input.count,
    successfulOrders: results.length,
    errors,
    elapsedMs: Math.round(performance.now() - profileStarted),
    confirmationToKds: summarize(
      results.map((result) => result.confirmationToKdsMs),
    ),
    fullCheckout: summarize(results.map((result) => result.requestMs)),
    fanoutReads: summarize(fanoutSamples),
    streams: {
      kdsClients: kdsStreams.length,
      waiterClients: waiterStreams.length,
      kdsEventsReceived: kdsStreams.reduce(
        (sum, stream) => sum + stream.state.events,
        0,
      ),
      waiterEventsReceived: waiterStreams.reduce(
        (sum, stream) => sum + stream.state.events,
        0,
      ),
    },
    reconnect: reconnectEvidence,
    durabilitySnapshot: {
      pendingTickets: snapshot.body.tickets.length,
      queuedPrintJobs: snapshot.body.printJobs.length,
      noKdsConnectedCount: snapshot.body.latency.noKdsConnectedCount,
      connectedNotYetVisibleCount:
        snapshot.body.latency.connectedNotYetVisibleCount,
    },
  };
}

async function main() {
  await fetch(`${baseUrl}/mesa/demo-mesa-8`);
  await resetKds();

  const scanCount = quick ? 24 : 240;
  const sustained = quick
    ? { count: 12, batchSize: 4, intervalMs: 200 }
    : { count: 240, batchSize: 12, intervalMs: 15_000 };
  const lastRound = quick
    ? { count: 12, batchSize: 4, intervalMs: 250 }
    : { count: 96, batchSize: 24, intervalMs: 90_000 };

  const result = {
    generatedAt: new Date().toISOString(),
    mode: quick ? "quick" : "full",
    environment: {
      node: process.version,
      platform: `${platform()} ${release()}`,
      logicalCpuCount: cpus().length,
      baseUrl,
    },
    assumptions: {
      maxTables: 60,
      seatsPerTable: 4,
      maxSeats: 240,
      maxOrdersPerPersonHour: 3,
      burstFactor: 2,
      safetyFactor: 2,
      targetOrdersPerHour: 2_880,
      targetOrdersPerMinute: 48,
      lastRoundPeople: 96,
      lastRoundWindowMinutes: 5,
      idleReferenceConfirmationToKdsMs: 103,
    },
    scanBurst: {
      configuredScans: scanCount,
      latency: await scanBurst(scanCount),
    },
    sustained: await runProfile({
      name: "carga_sostenida",
      ...sustained,
      fanoutReaders: quick ? 4 : 12,
    }),
    lastRound: await runProfile({
      name: "ultima_ronda",
      ...lastRound,
      fanoutReaders: quick ? 4 : 12,
    }),
  };

  mkdirSync(dirname(outputPath), { recursive: true });
  writeFileSync(outputPath, `${JSON.stringify(result, null, 2)}\n`, "utf8");
  process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
  const failed =
    result.sustained.errors.length > 0 ||
    result.lastRound.errors.length > 0 ||
    result.sustained.successfulOrders !== sustained.count ||
    result.lastRound.successfulOrders !== lastRound.count ||
    result.sustained.confirmationToKds.p95Ms > 2_000 ||
    result.lastRound.confirmationToKds.p95Ms > 2_000;
  if (failed) process.exitCode = 1;
}

await main();
