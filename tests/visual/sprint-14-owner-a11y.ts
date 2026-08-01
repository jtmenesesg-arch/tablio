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
const clickRoleName = process.env.TABLIO_A11Y_CLICK_ROLE_NAME;
const storageStatePath = process.env.TABLIO_A11Y_STORAGE_STATE;

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
      storageState: storageStatePath,
    });
    await page.goto(`${baseUrl}${route}`, { waitUntil: "networkidle" });
    await page.locator(readySelector).waitFor({ state: "visible" });
    if (clickRoleName) {
      await page.getByRole("button", { name: clickRoleName }).click();
      // A pointer click sets the input modality to "mouse", which makes the
      // browser's :focus-visible heuristic ignore the script-driven
      // element.focus() calls below and reports false positives. One
      // keyboard press restores "keyboard" modality before auditing focus.
      await page.keyboard.press("Tab");
      await page.keyboard.press("Shift+Tab");
      // Tab-switch buttons animate their active/inactive colors over
      // var(--motion-feedback) (120ms). Without waiting past that, the
      // audit can sample a still-interpolating background mid-transition
      // and report a false contrast failure.
      await page.waitForTimeout(250);
    }

    const audit = await page.evaluate(() => {
      type Rgb = { r: number; g: number; b: number; a: number };

      function parseRgb(value: string): Rgb | undefined {
        const rgbMatch = value.match(
          /rgba?\(\s*([\d.]+)[,\s]+([\d.]+)[,\s]+([\d.]+)(?:\s*[,/]\s*([\d.]+))?\s*\)/,
        );
        if (rgbMatch) {
          return {
            r: Number(rgbMatch[1]),
            g: Number(rgbMatch[2]),
            b: Number(rgbMatch[3]),
            a: rgbMatch[4] === undefined ? 1 : Number(rgbMatch[4]),
          };
        }
        // Chromium reports colors built from an opacity modifier (e.g. a
        // Tailwind `/70` on a CSS-variable color) as oklab(), not rgb(),
        // because the underlying color-mix() can't always round-trip through
        // sRGB without loss. Convert with the standard Ottosson oklab ->
        // linear-sRGB matrices so these still get a real contrast ratio
        // instead of silently reading as a false failure.
        const oklabMatch = value.match(
          /oklab\(\s*([\d.]+)\s+(-?[\d.]+)\s+(-?[\d.]+)(?:\s*\/\s*([\d.]+))?\s*\)/,
        );
        if (oklabMatch) {
          const L = Number(oklabMatch[1]);
          const a = Number(oklabMatch[2]);
          const bChan = Number(oklabMatch[3]);
          const l_ = L + 0.3963377774 * a + 0.2158037573 * bChan;
          const m_ = L - 0.1055613458 * a - 0.0638541728 * bChan;
          const s_ = L - 0.0894841775 * a - 1.2914855480 * bChan;
          const l = l_ ** 3;
          const m = m_ ** 3;
          const s = s_ ** 3;
          const toSrgb = (linear: number) => {
            const clamped = Math.min(1, Math.max(0, linear));
            const encoded =
              clamped <= 0.0031308
                ? 12.92 * clamped
                : 1.055 * clamped ** (1 / 2.4) - 0.055;
            return Math.round(encoded * 255);
          };
          return {
            r: toSrgb(4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s),
            g: toSrgb(-1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s),
            b: toSrgb(-0.0041960863 * l - 0.7034186147 * m + 1.707614701 * s),
            a: oklabMatch[4] === undefined ? 1 : Number(oklabMatch[4]),
          };
        }
        return undefined;
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

      // A contrast ratio this low means the text and its real computed
      // background are, for practical purposes, the same color — not "hard
      // to read", but invisible. This happened for real (black text on a
      // black card) and slipped past manual review; it must be impossible
      // to miss in the audit output, so it gets its own category instead of
      // being just another row in the general AA list below.
      const INVISIBLE_RATIO_THRESHOLD = 1.5;

      const textAudit = Array.from(document.body.querySelectorAll("*"))
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
          const ratio = foreground
            ? Math.round(contrast(foreground, backdrop) * 100) / 100
            : undefined;
          return {
            text: (element.textContent ?? "").trim().slice(0, 80),
            ratio,
            required,
          };
        });

      const textFailures = textAudit
        .filter((item) => item.ratio !== undefined)
        .filter((item) => (item.ratio as number) < item.required)
        .map(({ text, ratio, required }) => ({ text, ratio, required }));

      const invisibleTextFailures = textAudit
        .filter((item) => item.ratio !== undefined)
        .filter((item) => (item.ratio as number) < INVISIBLE_RATIO_THRESHOLD)
        .map(({ text, ratio }) => ({ text, ratio }));

      // A color the script couldn't parse (color(), lab(), etc. beyond the
      // rgb()/oklab() cases already handled above) is a gap in the audit
      // itself, not a contrast verdict — surfaced separately so it can't be
      // mistaken for either a pass or an invisible-text failure.
      const unparseableTextColors = textAudit
        .filter((item) => item.ratio === undefined)
        .map(({ text }) => text);

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
        invisibleTextFailures,
        unparseableTextColors,
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
    invisibleText:
      "ratio < 1.5 entre texto y su fondo real computado — prácticamente el mismo color, no un incumplimiento de AA sino texto invisible; rompe el build aparte de la regla de AA",
    touchTarget: "56 × 56 px mínimo",
    focus: "indicador visible por outline o ring",
    gradients: "cero en producto",
    overflow: "sin desborde horizontal de página",
  },
  results,
  passed: results.every(
    (result) =>
      result.textFailures.length === 0 &&
      result.invisibleTextFailures.length === 0 &&
      result.touchFailures.length === 0 &&
      result.focusFailures.length === 0 &&
      result.gradients.length === 0 &&
      !result.horizontalOverflow,
  ),
};

if (
  results.some((result) => result.invisibleTextFailures.length > 0)
) {
  process.stderr.write(
    "\n⚠ TEXTO INVISIBLE: hay texto con contraste prácticamente nulo contra su fondo real. Ver 'invisibleTextFailures' en el reporte.\n\n",
  );
}
if (results.some((result) => result.unparseableTextColors.length > 0)) {
  process.stderr.write(
    "\n⚠ El script no pudo interpretar el color de algún texto (formato CSS no soportado por parseRgb) — revisar manualmente, no cuenta como pase ni como falla. Ver 'unparseableTextColors'.\n\n",
  );
}

mkdirSync(dirname(outputPath), { recursive: true });
writeFileSync(outputPath, `${JSON.stringify(report, null, 2)}\n`, "utf8");
process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
if (!report.passed) process.exitCode = 1;
