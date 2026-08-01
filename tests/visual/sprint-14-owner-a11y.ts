import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { chromium } from "@playwright/test";

const baseUrl = process.env.TABLIO_VISUAL_BASE_URL ?? "http://localhost:3102";
const outputPath = resolve(
  process.env.TABLIO_A11Y_OUTPUT ?? "docs/evidence/SPRINT-14-OWNER-A11Y.json",
);
const executablePath =
  process.env.TABLIO_CHROME_PATH ??
  "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";
const route = process.env.TABLIO_A11Y_ROUTE ?? "/dueno";
const readySelector =
  process.env.TABLIO_A11Y_READY_SELECTOR ?? "[data-owner-dashboard-ready]";

const browser = await chromium.launch({ executablePath, headless: true });
const results = [];

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

    const audit = await page.evaluate(() => {
      type Rgb = { r: number; g: number; b: number; a: number };

      function parseRgb(value: string): Rgb | undefined {
        const match = value.match(
          /rgba?\(\s*([\d.]+)[,\s]+([\d.]+)[,\s]+([\d.]+)(?:\s*[,/]\s*([\d.]+))?\s*\)/,
        );
        if (!match) return undefined;
        return {
          r: Number(match[1]),
          g: Number(match[2]),
          b: Number(match[3]),
          a: match[4] === undefined ? 1 : Number(match[4]),
        };
      }

      function background(element: Element): Rgb {
        let current: Element | null = element;
        while (current) {
          const parsed = parseRgb(getComputedStyle(current).backgroundColor);
          if (parsed && parsed.a > 0.98) return parsed;
          current = current.parentElement;
        }
        return { r: 255, g: 255, b: 255, a: 1 };
      }

      function luminance(color: Rgb): number {
        const channels = [color.r, color.g, color.b].map((channel) => {
          const value = channel / 255;
          return value <= 0.04045
            ? value / 12.92
            : ((value + 0.055) / 1.055) ** 2.4;
        });
        return (
          channels[0] * 0.2126 + channels[1] * 0.7152 + channels[2] * 0.0722
        );
      }

      function contrast(foreground: Rgb, backdrop: Rgb): number {
        const lighter = Math.max(luminance(foreground), luminance(backdrop));
        const darker = Math.min(luminance(foreground), luminance(backdrop));
        return (lighter + 0.05) / (darker + 0.05);
      }

      const textFailures = Array.from(document.body.querySelectorAll("*"))
        .filter((element) => {
          const html = element as HTMLElement;
          const text = html.innerText?.trim();
          const rect = html.getBoundingClientRect();
          return (
            text &&
            element.children.length === 0 &&
            !element.closest('[aria-hidden="true"]') &&
            rect.width > 0 &&
            rect.height > 0
          );
        })
        .map((element) => {
          const style = getComputedStyle(element);
          const foreground = parseRgb(style.color);
          const backdrop = background(element);
          const fontSize = Number.parseFloat(style.fontSize);
          const fontWeight = Number.parseInt(style.fontWeight, 10) || 400;
          const required =
            fontSize >= 24 || (fontSize >= 18.66 && fontWeight >= 700)
              ? 3
              : 4.5;
          const ratio = foreground ? contrast(foreground, backdrop) : 0;
          return {
            text: (element.textContent ?? "").trim().slice(0, 80),
            ratio: Math.round(ratio * 100) / 100,
            required,
          };
        })
        .filter((item) => item.ratio < item.required);

      const touchFailures = Array.from(
        document.querySelectorAll<HTMLElement>(
          "a[href], button:not([disabled]), select, input, textarea",
        ),
      )
        .filter((element) => {
          const style = getComputedStyle(element);
          const rect = element.getBoundingClientRect();
          return (
            style.display !== "none" &&
            style.visibility !== "hidden" &&
            rect.width > 0 &&
            rect.height > 0
          );
        })
        .map((element) => {
          const rect = element.getBoundingClientRect();
          return {
            label:
              element.getAttribute("aria-label") ??
              element.textContent?.trim().slice(0, 60) ??
              element.tagName,
            width: Math.round(rect.width),
            height: Math.round(rect.height),
          };
        })
        .filter((item) => item.width < 56 || item.height < 56);

      const focusFailures: string[] = [];
      const interactive = Array.from(
        document.querySelectorAll<HTMLElement>(
          "a[href], button:not([disabled]), select, input, textarea",
        ),
      ).filter((element) => {
        const rect = element.getBoundingClientRect();
        return rect.width > 0 && rect.height > 0;
      });
      for (const element of interactive) {
        element.focus();
        const style = getComputedStyle(element);
        const hasFocusIndicator =
          (style.outlineStyle !== "none" &&
            Number.parseFloat(style.outlineWidth) > 0) ||
          style.boxShadow !== "none";
        if (!hasFocusIndicator) {
          focusFailures.push(
            element.getAttribute("aria-label") ??
              element.textContent?.trim().slice(0, 60) ??
              element.tagName,
          );
        }
      }

      const gradients = Array.from(document.body.querySelectorAll("*"))
        .filter((element) =>
          getComputedStyle(element).backgroundImage.includes("gradient"),
        )
        .map((element) => element.tagName.toLowerCase());

      return {
        checkedTextNodes: Array.from(
          document.body.querySelectorAll("*"),
        ).filter((element) => element.children.length === 0).length,
        textFailures,
        touchFailures,
        focusFailures,
        gradients,
        horizontalOverflow:
          document.documentElement.scrollWidth >
          document.documentElement.clientWidth,
      };
    });

    results.push({ viewport, ...audit });
    await page.close();
  }
} finally {
  await browser.close();
}

const report = {
  generatedAt: new Date().toISOString(),
  route,
  rules: {
    textContrast: "WCAG AA: 4.5:1 normal, 3:1 texto grande",
    touchTarget: "56 × 56 px mínimo",
    focus: "indicador visible por outline o ring",
    gradients: "cero en producto",
    overflow: "sin desborde horizontal de página",
  },
  results,
  passed: results.every(
    (result) =>
      result.textFailures.length === 0 &&
      result.touchFailures.length === 0 &&
      result.focusFailures.length === 0 &&
      result.gradients.length === 0 &&
      !result.horizontalOverflow,
  ),
};

mkdirSync(dirname(outputPath), { recursive: true });
writeFileSync(outputPath, `${JSON.stringify(report, null, 2)}\n`, "utf8");
process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
if (!report.passed) process.exitCode = 1;
