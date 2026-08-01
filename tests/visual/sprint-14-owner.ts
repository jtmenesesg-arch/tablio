import { mkdirSync } from "node:fs";
import { resolve } from "node:path";
import { chromium } from "@playwright/test";

const baseUrl = process.env.TABLIO_VISUAL_BASE_URL ?? "http://localhost:3102";
const stage = process.env.TABLIO_VISUAL_STAGE ?? "after";
const route = process.env.TABLIO_VISUAL_ROUTE ?? "/dueno";
const subject = process.env.TABLIO_VISUAL_SUBJECT ?? "owner";
const readySelector =
  process.env.TABLIO_VISUAL_READY_SELECTOR ?? "[data-owner-dashboard-ready]";
const outputDirectory = resolve("docs/evidence/sprint-14");
const executablePath =
  process.env.TABLIO_CHROME_PATH ??
  "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";

mkdirSync(outputDirectory, { recursive: true });

const browser = await chromium.launch({ executablePath, headless: true });
try {
  for (const viewport of [
    { name: "desktop", width: 1440, height: 900 },
    { name: "mobile", width: 390, height: 844 },
  ]) {
    const page = await browser.newPage({
      viewport: { width: viewport.width, height: viewport.height },
      deviceScaleFactor: 1,
    });
    await page.goto(`${baseUrl}${route}`, { waitUntil: "networkidle" });
    await page.locator(readySelector).waitFor({ state: "visible" });
    await page.screenshot({
      path: resolve(
        outputDirectory,
        `${stage}-${subject}-${viewport.name}-viewport.png`,
      ),
      fullPage: false,
    });
    await page.screenshot({
      path: resolve(
        outputDirectory,
        `${stage}-${subject}-${viewport.name}.png`,
      ),
      fullPage: true,
    });
    await page.close();
  }
} finally {
  await browser.close();
}
