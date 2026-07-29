import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { performance } from "node:perf_hooks";
import { chromium } from "@playwright/test";

const baseUrl = process.env.TABLIO_PERF_BASE_URL ?? "http://localhost:3100";
const outputPath = resolve(
  process.env.TABLIO_PERF_OUTPUT ??
    "docs/evidence/SPRINT-10-PWA-PERFORMANCE.json",
);

function percentile(values: readonly number[], quantile: number): number {
  const sorted = [...values].sort((left, right) => left - right);
  const index = (sorted.length - 1) * quantile;
  const lower = Math.floor(index);
  const upper = Math.ceil(index);
  if (lower === upper) return Math.round(sorted[lower]);
  const weight = index - lower;
  return Math.round(sorted[lower] * (1 - weight) + sorted[upper] * weight);
}

async function main() {
  const browser = await chromium.launch({ headless: true });
  const samples = [];
  try {
    for (let index = 0; index < 3; index += 1) {
      const context = await browser.newContext({
        viewport: { width: 360, height: 740 },
        deviceScaleFactor: 1,
        isMobile: true,
        hasTouch: true,
        serviceWorkers: "block",
      });
      const page = await context.newPage();
      const cdp = await context.newCDPSession(page);
      await cdp.send("Network.enable");
      await cdp.send("Network.setCacheDisabled", { cacheDisabled: true });
      await cdp.send("Network.emulateNetworkConditions", {
        offline: false,
        latency: 150,
        downloadThroughput: 1_600_000 / 8,
        uploadThroughput: 750_000 / 8,
        connectionType: "cellular4g",
      });
      await cdp.send("Emulation.setCPUThrottlingRate", { rate: 4 });

      const started = performance.now();
      await page.goto(`${baseUrl}/mesa/demo-mesa-8`, {
        waitUntil: "domcontentloaded",
      });
      await page
        .getByRole("heading", { name: "Bar La Esquina · Mesa 8" })
        .waitFor({ state: "visible" });
      const usableMs = Math.round(performance.now() - started);
      const timing = await page.evaluate(() => {
        const entries = performance.getEntries();
        const navigation = entries.find(
          (entry) => String(entry.entryType) === "navigation",
        ) as PerformanceNavigationTiming;
        const paints = entries.filter(
          (entry) => String(entry.entryType) === "paint",
        );
        return {
          domContentLoadedMs: Math.round(
            navigation.domContentLoadedEventEnd - navigation.startTime,
          ),
          loadMs: Math.round(navigation.loadEventEnd - navigation.startTime),
          firstContentfulPaintMs: Math.round(
            paints.find((entry) => entry.name === "first-contentful-paint")
              ?.startTime ?? 0,
          ),
          transferredBytes: entries
            .filter((entry) => entry.entryType === "resource")
            .reduce(
              (sum, entry) =>
                sum + (entry as PerformanceResourceTiming).transferSize,
              0,
            ),
        };
      });
      samples.push({ run: index + 1, usableMs, ...timing });
      await context.close();
    }
  } finally {
    await browser.close();
  }

  const usable = samples.map((sample) => sample.usableMs);
  const result = {
    generatedAt: new Date().toISOString(),
    environment: {
      baseUrl,
      viewport: "360x740",
      cpuThrottle: 4,
      network: {
        profile: "slow_4g",
        roundTripLatencyMs: 150,
        downloadKbps: 1_600,
        uploadKbps: 750,
        cache: "disabled",
        serviceWorker: "blocked",
      },
    },
    samples,
    usableSummary: {
      samples: usable.length,
      p50Ms: percentile(usable, 0.5),
      p95Ms: percentile(usable, 0.95),
      p99Ms: percentile(usable, 0.99),
      maxMs: Math.max(...usable),
      budgetMs: 5_000,
    },
  };
  mkdirSync(dirname(outputPath), { recursive: true });
  writeFileSync(outputPath, `${JSON.stringify(result, null, 2)}\n`, "utf8");
  process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
  if (result.usableSummary.p95Ms > result.usableSummary.budgetMs) {
    process.exitCode = 1;
  }
}

await main();
