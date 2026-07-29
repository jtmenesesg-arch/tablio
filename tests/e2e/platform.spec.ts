import { expect, test, type Page } from "@playwright/test";

test.describe.configure({ mode: "serial" });

async function reset(page: Page) {
  expect(
    (
      await page.request.post("/api/platform/test", {
        data: { action: "reset" },
      })
    ).ok(),
  ).toBe(true);
}

test("onboarding completo deja un tenant operativo", async ({ page }) => {
  // Recorre todos los pasos como un dueño real. Si falla, el local no podría
  // pasar de datos parciales a una operación verificada.
  await reset(page);
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.goto("/onboarding");
  await page.getByLabel("Nombre del local").fill("Bar E2E");
  await page.getByLabel("Dirección").fill("Providencia 123");
  await page.getByRole("button", { name: "Guardar y continuar" }).click();

  await page.getByLabel(/Zonas · una por línea/).fill("Salón:8\nTerraza:5");
  await page.getByLabel(/Estaciones separadas/).fill("Barra, Cocina");
  await page.getByRole("button", { name: "Guardar tamaño" }).click();
  await page
    .locator(".stepNav")
    .getByRole("button", { name: /Tamaño$/ })
    .click();
  await expect(page.getByText("Flujo", { exact: true })).toBeVisible();
  await page
    .locator(".stepNav")
    .getByRole("button", { name: /Carta$/ })
    .click();

  await page.getByRole("button", { name: "Extraer borrador" }).click();
  await expect(page.getByText("Revisión humana obligatoria")).toBeVisible();
  await page.getByRole("button", { name: "Confirmar revisión" }).click();
  await page.getByRole("button", { name: "Publicar carta revisada" }).click();

  await page.getByLabel("RUT del emisor").fill("76.123.456-7");
  await page.getByLabel("Giro").fill("Bar y restaurante");
  await page.getByRole("button", { name: "Guardar datos tributarios" }).click();

  await page.getByRole("button", { name: "Conectar mi cuenta" }).click();
  await page.getByRole("button", { name: "Verificar comercio" }).click();

  await page.getByLabel("Nombre", { exact: true }).fill("Camila");
  await page.getByLabel("PIN de 4 dígitos").fill("2468");
  await page.getByRole("button", { name: "Agregar persona" }).click();

  await page.getByRole("button", { name: "Generar QRs" }).click();
  await page.locator(".stepNav").getByRole("button", { name: /QRs$/ }).click();
  await expect(page.getByText("4101")).toBeVisible();
  await page
    .locator(".stepNav")
    .getByRole("button", { name: /Prueba$/ })
    .click();

  await page.getByRole("button", { name: "Ejecutar prueba completa" }).click();
  await page
    .locator(".stepNav")
    .getByRole("button", { name: /Prueba$/ })
    .click();
  await expect(page.getByText("Venta demo").locator("..")).toContainText(
    "passed",
  );
  await page
    .locator(".stepNav")
    .getByRole("button", { name: /Producción$/ })
    .click();

  await page
    .getByRole("button", { name: "Conectar cobro demo de Tablio" })
    .click();
  await page.getByRole("button", { name: "Habilitar producción" }).click();
  await expect(page.getByText("100%")).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Producción habilitada" }),
  ).toBeVisible();
});

test("onboarding parcial sobrevive una recarga", async ({ page }) => {
  // Guarda sólo el primer paso y recarga. Si falla, cerrar la pestaña
  // obligaría al dueño a empezar de cero.
  await reset(page);
  await page.goto("/onboarding");
  await page.getByLabel("Nombre del local").fill("Bar Parcial");
  await page.getByLabel("Dirección").fill("Ñuñoa 456");
  await page.getByRole("button", { name: "Guardar y continuar" }).click();
  await page.reload();
  await expect(
    page.getByRole("heading", { name: "Bar Parcial" }),
  ).toBeVisible();
  await expect(page.getByText("11%")).toBeVisible();
  await expect(
    page.getByRole("heading", { name: "Mesas, zonas y estaciones" }),
  ).toBeVisible();
});

test("importación nunca publica sin confirmación humana", async ({ page }) => {
  // Salta visualmente a Carta e intenta publicar el borrador. Si falla, un
  // precio extraído podría llegar a clientes sin revisión.
  await reset(page);
  await page.goto("/onboarding");
  await page
    .locator(".stepNav")
    .getByRole("button", { name: /Carta$/ })
    .click();
  await page.getByRole("button", { name: "Extraer borrador" }).click();
  await expect(
    page.getByRole("button", { name: "Publicar carta revisada" }),
  ).toBeDisabled();
  const response = await page.request.post("/api/onboarding", {
    data: { action: "menu.publish" },
  });
  expect(response.status()).toBe(400);
});

test("morosidad administrativa mantiene pedidos y suspensión es neutra", async ({
  page,
}) => {
  // Prueba ambos extremos de la escalera. Si falla, el bar podría dejar de
  // vender demasiado pronto o el comensal conocería su deuda.
  await reset(page);
  await page.request.post("/api/platform/test", {
    data: {
      action: "diner_subscription",
      status: "admin_restricted",
    },
  });
  await page.goto("/mesa/demo-mesa-8");
  await page.getByLabel("Código de la mesa").fill("4826");
  await page.getByRole("button", { name: "Entrar a la carta" }).click();
  await expect(
    page.getByRole("heading", { name: "¿Qué te tinca?" }),
  ).toBeVisible();

  await page.request.post("/api/platform/test", {
    data: { action: "diner_subscription", status: "suspended" },
  });
  await page.goto("/mesa/demo-mesa-8");
  await expect(
    page.getByRole("heading", { name: "Habla con el equipo del local" }),
  ).toBeVisible();
  const content = await page.locator("body").innerText();
  expect(content).not.toMatch(/deuda|moros|cobro|suscrip|plan comercial/i);
});

test("superadmin audita soporte y recupera un cobro fallido", async ({
  page,
}) => {
  // Intenta impersonar sin rastro y cobrar sin reintento. Si falla, soporte
  // tendría acceso invisible o suspendería por un rechazo aislado.
  await reset(page);
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.goto("/superadmin");
  await page.getByRole("row", { name: /Bar La Esquina/ }).click();

  page.once("dialog", (dialog) =>
    dialog.accept("Revisar conexión solicitada por el dueño"),
  );
  await page.getByRole("button", { name: "Entrar como soporte" }).click();
  await expect(
    page.getByText("Revisar conexión solicitada por el dueño"),
  ).toBeVisible();

  await page.getByRole("button", { name: "Simular cobro fallido" }).click();
  const tenantRow = page.getByRole("row", { name: /Bar La Esquina/ });
  await expect(
    tenantRow.getByText("Cobro fallido", { exact: true }),
  ).toBeVisible();
  await expect(
    page.getByText("Reintento automático agendado en 24 horas."),
  ).toBeVisible();
  await page.getByRole("button", { name: "Reintentar" }).click();
  await expect(tenantRow.getByText("Al día", { exact: true })).toBeVisible();
});
