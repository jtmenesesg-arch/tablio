import { expect, test, type BrowserContext, type Page } from "@playwright/test";

test.describe.configure({ mode: "serial" });

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
  await expect(page.getByRole("heading", { name })).toBeVisible();
  await page.getByRole("button", { name: /^Agregar \$/ }).click();
  await expect(page.getByRole("heading", { name })).toBeHidden();
}

async function cartSnapshot(page: Page) {
  return page.evaluate(async () => {
    const response = await fetch("/api/diner?qr=demo-mesa-8", {
      cache: "no-store",
    });
    return response.json() as Promise<{
      cart: {
        id: string;
        lines: Array<{ productName: string }>;
      };
      orders: unknown[];
    }>;
  });
}

test("flujo completo: entrar, pedir, pagar, ver estados y repetir ronda", async ({
  page,
}) => {
  // Este test intenta romper el recorrido principal. Si falla, un comensal
  // podría pagar y quedar sin confirmación o sin ver sus comandas.
  await enterTable(page);
  await addProduct(page, "Lager de la casa");
  await addProduct(page, "Hamburguesa clásica");

  await page.getByLabel("Mi pedido, 2 productos").click();
  await expect(page.getByRole("heading", { name: "Mi pedido" })).toBeVisible();
  await page.getByRole("button", { name: "Ir al pago" }).click();
  await page.getByLabel(/Tu nombre o apodo/).fill("Cata");
  await expect(page.getByText("Para que el garzón te encuentre")).toBeVisible();
  await page.getByRole("button", { name: "Preparar pago" }).click();
  await expect(page.getByText("Total a pagar")).toBeVisible();
  await page.getByRole("button", { name: /Pagar en modo demo/ }).click();

  await expect(
    page.getByRole("heading", { name: "Estamos confirmando tu pago" }),
  ).toBeVisible();
  await expect(
    page.getByRole("heading", { name: "Tu pedido ya está en la barra" }),
  ).toBeVisible({ timeout: 8_000 });
  await expect(page.getByText("Cata", { exact: true })).toBeVisible();
  await expect(page.getByText("Barra", { exact: true })).toBeVisible();
  await expect(page.getByText("Cocina", { exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Pedir otra ronda" }).click();
  await expect(
    page.getByRole("heading", { name: "¿Qué te tinca?" }),
  ).toBeVisible();
});

test("el frontend no puede marcar un pago como confirmado", async ({
  page,
}) => {
  // Este test intenta falsificar una aprobación desde el teléfono. Si falla,
  // alguien podría crear un pedido sin confirmación server-side.
  await enterTable(page);
  const forged = await page.evaluate(async () => {
    const response = await fetch("/api/diner", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        action: "payment.confirm",
        status: "confirmed",
        approved: true,
      }),
    });
    return { status: response.status, body: await response.json() };
  });
  expect(forged.status).toBe(400);
  const snapshot = await cartSnapshot(page);
  expect(snapshot.orders).toHaveLength(0);
});

test("dos dispositivos de la misma mesa conservan carritos separados", async ({
  browser,
}) => {
  // Este test intenta mezclar dos teléfonos. Si falla, una persona podría
  // terminar pagando los productos de otra.
  const firstContext = await browser.newContext();
  const secondContext = await browser.newContext();
  try {
    const first = await firstContext.newPage();
    const second = await secondContext.newPage();
    await enterTable(first);
    await addProduct(first, "Lager de la casa");
    await enterTable(second);
    await addProduct(second, "Papas crujientes");

    const firstCart = await cartSnapshot(first);
    const secondCart = await cartSnapshot(second);
    expect(firstCart.cart.id).not.toBe(secondCart.cart.id);
    expect(firstCart.cart.lines.map((line) => line.productName)).toEqual([
      "Lager de la casa",
    ]);
    expect(secondCart.cart.lines.map((line) => line.productName)).toEqual([
      "Papas crujientes",
    ]);
  } finally {
    await closeContexts(firstContext, secondContext);
  }
});

test("recupera la sesión y el carrito después de recargar", async ({
  page,
}) => {
  // Este test intenta perder una ronda por una recarga o cambio de red. Si
  // falla, el comensal tendría que armar el carrito desde cero.
  await enterTable(page);
  await addProduct(page, "Spritz cítrico");
  await page.reload();
  await expect(
    page.getByRole("heading", { name: "¿Qué te tinca?" }),
  ).toBeVisible();
  await page.getByLabel("Mi pedido, 1 producto").click();
  await expect(page.getByText("Spritz cítrico", { exact: true })).toBeVisible();
});

test("un producto agotado no se puede agregar ni llevar a pago", async ({
  page,
  request,
}) => {
  // Este test intenta cobrar un producto agotado. Si falla, el bar recibiría
  // plata por algo que ya no puede producir.
  await enterTable(page);
  await request.post("/api/diner/test", {
    headers: { "x-tablio-e2e": "1" },
    data: { productId: "burger-clasica", available: false },
  });
  try {
    const productButton = page.getByRole("button", {
      name: "Ver Hamburguesa clásica",
    });
    await expect(productButton).toBeDisabled({ timeout: 6_000 });
    await expect(
      productButton.locator("..").getByText("Agotado", { exact: true }),
    ).toBeVisible();

    const forcedAdd = await page.evaluate(async () => {
      const response = await fetch("/api/diner", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          action: "cart.add",
          productId: "burger-clasica",
          variantId: "burger-carne",
          quantity: 1,
        }),
      });
      return response.status;
    });
    expect(forcedAdd).toBe(409);
  } finally {
    await request.post("/api/diner/test", {
      headers: { "x-tablio-e2e": "1" },
      data: { productId: "burger-clasica", available: true },
    });
  }
});

test("pagar con el garzón no crea pedido ni comandas", async ({ page }) => {
  // Este test intenta confundir una solicitud al garzón con un pedido pagado.
  // Si falla, cocina podría producir algo que todavía no fue cobrado.
  await enterTable(page);
  await addProduct(page, "Papas crujientes");
  await page.getByLabel("Mi pedido, 1 producto").click();
  await page
    .getByRole("button", { name: "Prefiero pagar con el garzón" })
    .click();
  await expect(
    page.getByText("Pendiente de pago con el garzón", { exact: true }),
  ).toBeVisible();
  await expect(
    page.getByText("Tu pedido aún no fue enviado a la barra.", { exact: true }),
  ).toBeVisible();
  const snapshot = await cartSnapshot(page);
  expect(snapshot.orders).toHaveLength(0);
});

async function closeContexts(...contexts: BrowserContext[]) {
  await Promise.all(contexts.map((context) => context.close()));
}
