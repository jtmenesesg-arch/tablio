import { expect, test, type Page } from "@playwright/test";

test.describe.configure({ mode: "serial" });

async function resetKds(page: Page) {
  const response = await page.request.post("/api/kds/test", {
    data: { action: "reset" },
  });
  expect(response.ok()).toBe(true);
}

async function createPaidTicket(
  page: Page,
  stationId: "barra" | "cocina",
  orderNumber: number,
) {
  const response = await page.request.post("/api/kds/test", {
    data: { action: "create_paid_ticket", stationId, orderNumber },
  });
  expect(response.ok()).toBe(true);
  return (await response.json()) as { ticketId: string };
}

async function enterTable(page: Page) {
  await page.goto("/mesa/demo-mesa-8");
  await page.getByLabel("Código de la mesa").fill("4826");
  await page.getByRole("button", { name: "Entrar a la carta" }).click();
  await expect(
    page.getByRole("heading", { name: "¿Qué te tinca?" }),
  ).toBeVisible();
}

async function addProduct(page: Page, name: string) {
  await page.getByRole("button", { name: `Ver ${name}` }).click();
  await page.getByRole("button", { name: /^Agregar \$/ }).click();
}

test("un pedido pagado llega a cada estación y avanza por separado", async ({
  browser,
  page,
}) => {
  // Intenta romper la cadena pago → estación. Si falla, una comanda pagada
  // podría no llegar o una estación podría mover el trabajo de la otra.
  await resetKds(page);
  const barContext = await browser.newContext({
    viewport: { width: 1280, height: 800 },
  });
  const kitchenContext = await browser.newContext({
    viewport: { width: 1280, height: 800 },
  });
  try {
    const bar = await barContext.newPage();
    const kitchen = await kitchenContext.newPage();
    await bar.goto("/kds");
    await kitchen.goto("/kds");
    await bar.getByRole("button", { name: "Barra" }).click();
    await kitchen.getByRole("button", { name: "Cocina" }).click();
    await expect(bar.getByText("En línea")).toBeVisible();
    await expect(kitchen.getByText("En línea")).toBeVisible();

    await enterTable(page);
    await addProduct(page, "Lager de la casa");
    await addProduct(page, "Hamburguesa clásica");
    await page.getByLabel("Mi pedido, 2 productos").click();
    await page.getByRole("button", { name: "Ir al pago" }).click();
    await page.getByLabel(/Tu nombre o apodo/).fill("Cata");
    await page.getByRole("button", { name: "Preparar pago" }).click();
    await page.getByRole("button", { name: /Pagar en modo demo/ }).click();

    await expect(
      page.getByRole("heading", { name: "Tu pedido ya está en la barra" }),
    ).toBeVisible({ timeout: 8_000 });
    await expect(
      bar.getByTestId("kds-ticket").getByText(/Lager de la casa/),
    ).toBeVisible({ timeout: 5_000 });
    await expect(
      bar.getByTestId("kds-ticket").getByText(/Hamburguesa clásica/),
    ).toHaveCount(0);
    await expect(
      kitchen.getByTestId("kds-ticket").getByText(/Hamburguesa clásica/),
    ).toBeVisible();
    await expect(
      kitchen.getByTestId("kds-ticket").getByText(/Lager de la casa/),
    ).toHaveCount(0);
    await expect(bar.getByText("✓ Pagado")).toBeVisible();

    await bar.getByRole("button", { name: "Tomar comanda" }).click();
    await expect(bar.getByText("Tomada", { exact: true })).toBeVisible();
    await expect(kitchen.getByText("Nueva", { exact: true })).toBeVisible();
  } finally {
    await barContext.close();
    await kitchenContext.close();
  }
});

test("al reconectar recupera comandas creadas mientras no había pantalla", async ({
  page,
}) => {
  // Intenta perder avisos durante una desconexión. Si falla, la ausencia del
  // websocket podría ocultar para siempre un pedido confirmado.
  await resetKds(page);
  await createPaidTicket(page, "barra", 211);
  await createPaidTicket(page, "barra", 212);
  await page.setViewportSize({ width: 1280, height: 800 });
  await page.goto("/kds");
  await page.getByRole("button", { name: "Barra" }).click();
  await expect(page.getByText("Pedido 211")).toBeVisible();
  await expect(page.getByText("Pedido 212")).toBeVisible();
  await expect(page.getByText("2", { exact: true }).first()).toBeVisible();
});

test("agotar en KDS actualiza la carta sin esperar el sondeo de respaldo", async ({
  browser,
  page,
}) => {
  // Intenta vender un producto ya agotado. Si falla, el comensal podría seguir
  // agregándolo durante los 45 segundos del sondeo de seguridad.
  await resetKds(page);
  const dinerContext = await browser.newContext();
  try {
    const diner = await dinerContext.newPage();
    await enterTable(diner);
    await page.setViewportSize({ width: 1280, height: 800 });
    await page.goto("/kds");
    const productToggle = page
      .getByRole("button")
      .filter({ hasText: "Hamburguesa clásica" });
    await expect(productToggle).toContainText("Disponible");
    await productToggle.click();
    await expect(productToggle).toContainText("Agotado");
    const dinerProduct = diner
      .getByRole("button", { name: "Ver Hamburguesa clásica" })
      .locator("..");
    await expect(dinerProduct.getByText("Agotado")).toBeVisible({
      timeout: 3_000,
    });
  } finally {
    await dinerContext.close();
  }
});

test("mide p50 p95 p99 sólo con KDS conectado y separa pantalla ausente", async ({
  page,
}) => {
  // Intenta inflar la latencia con tiempo en que ninguna tablet estaba
  // conectada. Si falla, el p95 no mediría el sistema real.
  await resetKds(page);
  await page.setViewportSize({ width: 1280, height: 800 });
  await page.goto("/kds");
  await page.getByRole("button", { name: "Barra" }).click();
  await expect(page.getByText("En línea")).toBeVisible();

  for (let index = 0; index < 12; index += 1) {
    await createPaidTicket(page, "barra", 300 + index);
    await expect(page.getByText(`Pedido ${300 + index}`)).toBeVisible({
      timeout: 3_000,
    });
  }
  await createPaidTicket(page, "cocina", 399);

  await expect
    .poll(
      async () => {
        const response = await page.request.get("/api/kds?station=all");
        const body = (await response.json()) as {
          latency: {
            connectedSampleCount: number;
            noKdsConnectedCount: number;
            p50Ms?: number;
            p95Ms?: number;
            p99Ms?: number;
          };
        };
        return body.latency;
      },
      { timeout: 8_000 },
    )
    .toMatchObject({
      connectedSampleCount: 12,
      noKdsConnectedCount: 1,
    });

  const response = await page.request.get("/api/kds?station=all");
  const body = (await response.json()) as {
    latency: {
      connectedSampleCount: number;
      noKdsConnectedCount: number;
      p50Ms: number;
      p95Ms: number;
      p99Ms: number;
    };
  };
  process.stdout.write(`KDS_LATENCY ${JSON.stringify(body.latency)}\n`);
  expect(body.latency.p50Ms).toBeLessThanOrEqual(body.latency.p95Ms);
  expect(body.latency.p95Ms).toBeLessThanOrEqual(body.latency.p99Ms);
  expect(body.latency.p95Ms).toBeLessThanOrEqual(2_000);
});

test("la pantalla muestra siempre conexión y última sincronización", async ({
  page,
}) => {
  // Intenta hacer indistinguible una pantalla congelada de una barra tranquila.
  // Si falla, el equipo podría ignorar una caída durante toda la noche.
  await resetKds(page);
  await page.setViewportSize({ width: 1280, height: 800 });
  await page.goto("/kds");
  await expect(page.getByText("En línea")).toBeVisible();
  await expect(page.getByText(/Actualizado (ahora|hace \d+ s)/)).toBeVisible();
  await expect(
    page.getByText(
      "La pantalla está sincronizada. Los pedidos pagados aparecerán aquí.",
    ),
  ).toBeVisible();
});
