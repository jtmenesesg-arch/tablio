import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { performance } from "node:perf_hooks";
import { chromium } from "@playwright/test";

const baseUrl = process.env.TABLIO_PERF_BASE_URL ?? "http://localhost:3102";
const outputPath = resolve(
  process.env.TABLIO_PERF_OUTPUT ??
    "docs/evidence/SPRINT-14-OWNER-PERFORMANCE.json",
);
const readySelector =
  process.env.TABLIO_PERF_READY_SELECTOR ?? "[data-owner-dashboard-ready]";
const executablePath =
  process.env.TABLIO_CHROME_PATH ??
  "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";
const sampleCount = Number(process.env.TABLIO_PERF_SAMPLES ?? "7");

function percentile(values: readonly number[], quantile: number): number {
  const sorted = [...values].sort((left, right) => left - right);
  const index = (sorted.length - 1) * quantile;
  const lower = Math.floor(index);
  const upper = Math.ceil(index);
  if (lower === upper) return Math.round(sorted[lower]);
  const weight = index - lower;
  return Math.round(sorted[lower] * (1 - weight) + sorted[upper] * weight);
}

function summary(values: readonly number[]) {
  return {
    p50: percentile(values, 0.5),
    p95: percentile(values, 0.95),
    p99: percentile(values, 0.99),
  };
}

async function main() {
  const browser = await chromium.launch({ executablePath, headless: true });
  const samples = [];

  try {
    for (let index = 0; index < sampleCount; index += 1) {
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
      await page.goto(`${baseUrl}/dueno`, { waitUntil: "domcontentloaded" });
      await page.locator(readySelector).waitFor({ state: "visible" });
      const usableMs = Math.round(performance.now() - started);
      const timing = await page.evaluate(() => {
        const entries = performance.getEntries();
        const navigation = entries.find(
          (entry) => String(entry.entryType) === "navigation",
        ) as PerformanceNavigationTiming;
        const paints = entries.filter(
          (entry) => String(entry.entryType) === "paint",
        );
        const resources = entries
          .filter((entry) => entry.entryType === "resource")
          .map((entry) => {
            const resource = entry as PerformanceResourceTiming;
            return {
              name: resource.name,
              transferSize: resource.transferSize,
            };
          })
          .sort((left, right) => right.transferSize - left.transferSize);
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
          resources,
        };
      });
      samples.push({ run: index + 1, usableMs, ...timing });
      await context.close();
    }
  } finally {
    await browser.close();
  }

  const usable = samples.map((sample) => sample.usableMs);
  const transferred = samples.map((sample) => sample.transferredBytes);
  const result = {
    generatedAt: new Date().toISOString(),
    environment: {
      baseUrl,
      route: "/dueno",
      readySelector,
      viewport: "360x740",
      browser: "system Google Chrome",
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
    },
    timingSummary: {
      domContentLoadedMs: summary(
        samples.map((sample) => sample.domContentLoadedMs),
      ),
      loadMs: summary(samples.map((sample) => sample.loadMs)),
      firstContentfulPaintMs: summary(
        samples.map((sample) => sample.firstContentfulPaintMs),
      ),
    },
    transferSummary: {
      p50Bytes: percentile(transferred, 0.5),
      p95Bytes: percentile(transferred, 0.95),
    },
  };

  mkdirSync(dirname(outputPath), { recursive: true });
  writeFileSync(outputPath, `${JSON.stringify(result, null, 2)}\n`, "utf8");
  process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
}

await main();
