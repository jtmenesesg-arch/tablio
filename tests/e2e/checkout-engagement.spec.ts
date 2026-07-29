import { expect, test, type Page } from "@playwright/test";

test.describe.configure({ mode: "serial" });

async function reset(page: Page) {
  await page.request.post("/api/diner/test", {
    headers: { "x-tablio-e2e": "1" },
    data: { action: "engagement.reset" },
  });
}

async function enter(page: Page, table: 8 | 9) {
  await page.goto(`/mesa/demo-mesa-${table}`);
  await page
    .getByLabel("Código de la mesa")
    .fill(table === 8 ? "4826" : "9174");
  await page.getByRole("button", { name: "Entrar a la carta" }).click();
  await expect(
    page.getByRole("heading", { name: "¿Qué te tinca?" }),
  ).toBeVisible();
}

async function addLager(page: Page, invite = false) {
  await page.getByRole("button", { name: "Ver Lager de la casa" }).click();
  if (invite) await page.getByLabel("Invitar a Mesa 9").check();
  await page.getByRole("button", { name: /^Agregar \$/ }).click();
}

async function pay(page: Page) {
  await page.getByRole("button", { name: "Preparar pago" }).click();
  await page.getByRole("button", { name: /Pagar en modo demo/ }).click();
  await expect(
    page.getByRole("heading", { name: "Tu pedido ya está en la barra" }),
  ).toBeVisible({ timeout: 8_000 });
}

test("upsell explícito, happy hour congelado y propina atribuida", async ({
  page,
}) => {
  // Intenta cambiar el precio después de congelar el quote o cobrar un upsell
  // no aceptado. Si falla, el cierre dejaría de explicar el total pagado.
  await reset(page);
  await page.request.post("/api/diner/test", {
    headers: { "x-tablio-e2e": "1" },
    data: { action: "engagement.promotion", enabled: true },
  });
  await enter(page, 8);
  await addLager(page);
  await page.getByLabel("Mi pedido, 1 producto").click();
  await page.getByRole("button", { name: "Ir al pago" }).click();
  await expect(page.getByText("¿Le sumas algo?")).toBeVisible();
  await page
    .getByRole("article")
    .filter({ hasText: "Papas crujientes" })
    .getByRole("button", { name: "Sumar" })
    .click();
  await page.getByLabel("Elena").check();
  await page.getByRole("button", { name: "Preparar pago" }).click();
  await expect(page.getByText(/Happy hour:.*precio congelado/)).toBeVisible();
  await expect(page.getByText("Propina para Elena")).toBeVisible();
  const frozenTotal = await page
    .locator(".paymentTotal")
    .getByText(/\$/)
    .first()
    .textContent();

  await page.request.post("/api/diner/test", {
    headers: { "x-tablio-e2e": "1" },
    data: { action: "engagement.promotion", enabled: false },
  });
  await page.reload();
  await page.getByLabel("Mi pedido, 2 productos").click();
  await page.getByRole("button", { name: "Ir al pago" }).click();
  await expect(
    page.locator(".paymentTotal").getByText(frozenTotal!),
  ).toBeVisible();
  await page.getByRole("button", { name: /Pagar en modo demo/ }).click();
  await expect(
    page.getByRole("heading", { name: "Tu pedido ya está en la barra" }),
  ).toBeVisible({ timeout: 8_000 });

  await page.goto("/dueno");
  await expect(page.getByText("Ingreso incremental atribuible")).toBeVisible();
  await expect(page.getByText("Elena · Tarjeta demo")).toBeVisible();
  await page.goto("/caja");
  await page.getByRole("button", { name: "Cierre" }).click();
  await expect(page.getByText("Elena")).toBeVisible();
});

test("rechazar upsell no cambia el total ni bloquea el pago", async ({
  page,
}) => {
  // Intenta convertir una sugerencia en un paso obligatorio. Si falla, una
  // persona apurada no podría pagar el carrito original de inmediato.
  await reset(page);
  await enter(page, 8);
  await addLager(page);
  await page.getByLabel("Mi pedido, 1 producto").click();
  await page.getByRole("button", { name: "Ir al pago" }).click();
  await page
    .getByRole("article")
    .filter({ hasText: "Papas crujientes" })
    .getByRole("button", { name: "Ignorar Papas crujientes" })
    .click();
  await expect(page.getByText("Papas crujientes")).toHaveCount(0);
  await pay(page);
  await expect(page.getByText("$4.950").first()).toBeVisible();
});

test("invitación espera, se entrega a la mesa destino y nunca produce antes", async ({
  page,
  browser,
}) => {
  // Intenta mandar una comanda antes del reclamo o a la mesa del pagador. Si
  // falla, se produciría un trago sin receptor o se entregaría en otra mesa.
  await reset(page);
  await enter(page, 8);
  await addLager(page, true);
  await page.getByLabel("Mi pedido, 1 producto").click();
  await page.getByRole("button", { name: "Ir al pago" }).click();
  await pay(page);
  await expect(page.getByText(/aún no lo reclaman/).first()).toBeVisible();

  const kitchenContext = await browser.newContext();
  const kitchenBefore = await kitchenContext.newPage();
  await kitchenBefore.goto("/kds");
  await expect(kitchenBefore.getByText(/INVITACIÓN/)).toHaveCount(0);

  const recipientContext = await browser.newContext();
  const recipient = await recipientContext.newPage();
  await enter(recipient, 9);
  await expect(recipient.getByText("Te invitaron")).toBeVisible();
  await expect(recipient.getByText(/Te lo invita/)).toBeVisible();
  await recipient.getByRole("button", { name: "Reclamar invitación" }).click();

  await kitchenBefore.reload();
  await expect(kitchenBefore.getByText(/INVITACIÓN/).first()).toBeVisible();
  await expect(kitchenBefore.getByText("Mesa 9").first()).toBeVisible();
  await kitchenContext.close();
  await recipientContext.close();
});

test("otra persona de la misma mesa puede reclamar sin que el pagador se auto-reclame", async ({
  page,
  browser,
}) => {
  // Intenta confundir dispositivo con mesa. Si falla, el pagador podría
  // reclamar su propio regalo o nadie de su mesa podría recibirlo.
  await reset(page);
  await enter(page, 8);
  await page.getByRole("button", { name: "Ver Lager de la casa" }).click();
  await page.getByLabel("Invitar a Alguien de Mesa 8").check();
  await page.getByRole("button", { name: /^Agregar \$/ }).click();
  await page.getByLabel("Mi pedido, 1 producto").click();
  await page.getByRole("button", { name: "Ir al pago" }).click();
  await pay(page);
  await page.getByRole("button", { name: "Carta", exact: true }).click();
  await expect(page.getByText("Te invitaron")).toHaveCount(0);

  const guestContext = await browser.newContext();
  const guest = await guestContext.newPage();
  await enter(guest, 8);
  await expect(guest.getByText("Te invitaron")).toBeVisible();
  await guest.getByRole("button", { name: "Reclamar invitación" }).click();
  await guestContext.close();
});

test("el pagador cancela una invitación no reclamada y una mesa cerrada la rechaza", async ({
  page,
}) => {
  // Intenta retener dinero hasta el timeout o aceptar una mesa ya cerrada. Si
  // falla, el cliente pierde control de su pago y la entrega queda sin destino.
  await reset(page);
  await enter(page, 8);
  await addLager(page, true);
  await page.getByLabel("Mi pedido, 1 producto").click();
  await page.getByRole("button", { name: "Ir al pago" }).click();
  await pay(page);
  await page.getByRole("button", { name: /Cancelar y recuperar/ }).click();
  await expect(page.getByText("Cancelado · dinero devuelto")).toBeVisible();

  await page.request.post("/api/diner/test", {
    headers: { "x-tablio-e2e": "1" },
    data: {
      action: "engagement.table_closed",
      tableId: "mesa-9",
      enabled: true,
    },
  });
  await page.getByRole("button", { name: "Pedir otra ronda" }).click();
  await addLager(page, true);
  await expect(page.locator(".inlineError")).toContainText(
    "Elige otra mesa abierta",
  );
});
