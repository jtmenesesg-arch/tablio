import { expect, test, type Page } from "@playwright/test";

test.describe.configure({ mode: "serial" });

async function resetCredit(page: Page, seed = true) {
  const response = await page.request.post("/api/table-credit/test", {
    data: { action: "reset", seed },
  });
  expect(response.ok()).toBe(true);
}

async function loginWaiter(page: Page) {
  await page.context().clearCookies();
  await page.goto("/garzon");
  await page.getByLabel("PIN personal").fill("2468");
  await page.getByRole("button", { name: "Entrar" }).click();
  await page.getByRole("button", { name: /Terraza/ }).click();
  await page.getByRole("button", { name: "Empezar turno" }).click();
}

test("caja y garzón separan prepago y crédito en la misma mesa", async ({
  page,
}) => {
  // Intenta mezclar plata ya pagada con deuda de la mesa. Si falla, el equipo
  // podría cobrar dos veces o entregar creyendo que el crédito ya se pagó.
  await resetCredit(page);
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.goto("/caja");
  await expect(
    page.getByText("$32.000 pagados por app · $18.500 en crédito"),
  ).toBeVisible();

  await loginWaiter(page);
  await page.getByRole("button", { name: "Mesas", exact: true }).click();
  const table = page.getByRole("article").filter({ hasText: "Mesa 8" });
  await expect(
    table.getByText("CRÉDITO · $32.000 app · $18.500 pendiente"),
  ).toBeVisible();
});

test("pago parcial deja saldo, comprobante y código vivo de un solo uso", async ({
  page,
}) => {
  // Intenta duplicar un pago o aceptar un screenshot viejo. Si falla, caja
  // perdería la verdad del saldo o validaría un comprobante reutilizado.
  await resetCredit(page);
  await page.goto("/credito");
  await page.getByRole("button", { name: "Registrar pago parcial" }).click();
  await expect(page.getByText("Saldo del crédito").locator("..")).toContainText(
    "$10.000",
  );
  await expect(page.getByText("En cola: 1.")).toBeVisible();

  const bootstrap = (await (
    await page.request.get("/api/table-credit")
  ).json()) as { accounts: Array<{ id: string; outstandingClp: number }> };
  const account = bootstrap.accounts[0]!;
  expect(
    (
      await page.request.post("/api/table-credit", {
        data: {
          action: "payment.add",
          accountId: account.id,
          amountClp: account.outstandingClp,
          method: "in_person",
          idempotencyKey: "e2e:credit:settle",
        },
      })
    ).ok(),
  ).toBe(true);
  await page.reload();
  await page.getByRole("button", { name: "Generar código vivo" }).click();
  const code = await page.locator(".creditLiveCode strong").innerText();

  await page.getByLabel("Código que muestra el cliente").fill("000000");
  await page
    .getByRole("button", { name: "Validar contra el servidor" })
    .click();
  await expect(page.locator(".creditError")).toContainText("Código inválido");

  await page.getByLabel("Código que muestra el cliente").fill(code);
  await page
    .getByRole("button", { name: "Validar contra el servidor" })
    .click();
  await expect(page.locator(".creditLiveCode")).toBeHidden();
  await page
    .getByRole("button", { name: "Validar contra el servidor" })
    .click();
  await expect(page.locator(".creditError")).toContainText("ya utilizado");
});

test("una fuga alimenta el costo mensual y su tendencia para el dueño", async ({
  page,
}) => {
  // Intenta dejar la pérdida sólo en el cierre del turno. Si falla, el dueño
  // no podría medir cuánto le cuesta mantener activo el crédito de mesa.
  await resetCredit(page);
  await page.goto("/credito");
  await page.getByRole("button", { name: "Cerrar con fuga" }).click();
  await page.goto("/caja");
  await page.getByRole("button", { name: "Cierre", exact: true }).click();
  await expect(page.getByTestId("cashier-shift-credit-loss")).toContainText(
    "Fuga de crédito de mesa: $18.500",
  );
  await page.goto("/dueno");
  await expect(
    page.getByText("El costo real del crédito de mesa este mes"),
  ).toBeVisible();
  await expect(page.getByTestId("owner-leakage")).toContainText("$54.500");
  await expect(page.getByTestId("owner-leakage")).toContainText("14% más");
});

test("un tenant nuevo muestra datos actuales y explica cuándo comparará", async ({
  page,
}) => {
  // Intenta renderizar una pantalla vacía por falta de historia. Si falla, un
  // bar recién instalado parecería roto aunque ya tenga ventas del día.
  await resetCredit(page);
  await page.goto("/dueno");
  await page.getByRole("button", { name: "Ver instalación nueva" }).click();
  await expect(
    page.getByText("Estamos aprendiendo cómo funciona tu bar."),
  ).toBeVisible();
  await expect(page.getByText(/Hoy llevas \$\d/)).toBeVisible();
  await expect(
    page.getByText(/La primera comparación aparecerá desde el/),
  ).toBeVisible();
  await expect(page.getByRole("heading", { name: "Productos" })).toBeVisible();
});
