import { expect, test } from "@playwright/test";

test.describe.configure({ mode: "serial" });

test.beforeEach(async ({ request }) => {
  expect((await request.post("/api/owner/tables/test")).ok()).toBe(true);
});

test("crea una mesa y sus activos sin un paso separado de QR", async ({
  page,
}) => {
  // Intenta volver al flujo antiguo donde el dueño debía acordarse de generar
  // los QR después. Si falla, una mesa podría quedar creada pero inutilizable.
  await page.goto("/dueno/mesas");
  await page.getByRole("button", { name: "Nueva mesa" }).click();
  await page.getByLabel("Número").fill("42");
  await page.getByLabel("Nombre").fill("Mesa 42");
  await page.getByLabel("Zona").selectOption("terraza");
  await page.getByRole("button", { name: "Crear mesa y QR" }).click();
  await expect(
    page.getByText("Mesa creada. Su QR y código ya están listos."),
  ).toBeVisible();
  await expect(page.getByRole("heading", { name: "Mesa 42" })).toBeVisible();
});

test("crea doce mesas de una zona en una sola acción", async ({ page }) => {
  // Intenta dejar la creación masiva a medias. Si falla, el onboarding de un
  // bar completo volvería a ser una tarea manual propensa a errores.
  await page.goto("/dueno/mesas");
  await page.getByRole("button", { name: "Crear varias" }).click();
  await page.getByLabel("Zona").selectOption("patio");
  await page.getByLabel("Primer número").fill("20");
  await page.getByLabel("Cuántas mesas").fill("12");
  await page.getByRole("button", { name: "Crear mesas y QR" }).click();
  await expect(
    page.getByText("12 mesas creadas. Cada una tiene QR y código propios."),
  ).toBeVisible();
  await expect(page.getByRole("heading", { name: "Mesa 31" })).toBeVisible();
});

test("la vista de QR no expone tokens y avisa antes de regenerar", async ({
  page,
}) => {
  // Intenta mostrar identificadores internos o regenerar sin advertir. Si
  // falla, el dueño podría copiar un secreto o inutilizar la tarjeta pegada.
  await page.goto("/dueno/mesas");
  const card = page.getByTestId("table-card-2");
  await card.getByRole("button", { name: "Ver QR" }).click();
  await expect(
    page.getByText("No mostramos tokens ni identificadores internos."),
  ).toBeVisible();
  expect(await page.locator("body").innerText()).not.toMatch(
    /[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}/i,
  );
  await page.getByRole("button", { name: "Regenerar QR" }).click();
  await expect(
    page.getByText("El QR pegado en la mesa dejará de funcionar."),
  ).toBeVisible();
});

test("el panel se adapta a móvil sin desborde horizontal", async ({ page }) => {
  // Intenta romper la operación desde un teléfono. Si falla, el dueño no
  // podría crear o imprimir mesas durante una instalación en terreno.
  await page.setViewportSize({ width: 360, height: 740 });
  await page.goto("/dueno/mesas");
  await expect(page.getByRole("heading", { name: "Mesas" })).toBeVisible();
  const overflow = await page.evaluate(
    () =>
      document.documentElement.scrollWidth -
      document.documentElement.clientWidth,
  );
  expect(overflow).toBeLessThanOrEqual(1);
  await expect(
    page.getByRole("navigation", { name: "Navegación principal" }).last(),
  ).toBeVisible();
});
