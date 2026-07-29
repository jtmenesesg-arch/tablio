import { expect, test, type Page } from "@playwright/test";

test.describe.configure({ mode: "serial" });

async function enterTable(page: Page) {
  await page.goto("/mesa/demo-mesa-8");
  await page.getByLabel("Código de la mesa").fill("4826");
  await page.getByRole("button", { name: "Entrar a la carta" }).click();
  await expect(
    page.getByRole("heading", { name: "¿Qué te tinca?" }),
  ).toBeVisible();
}

async function addAndPay(page: Page) {
  await page.getByRole("button", { name: "Ver Papas crujientes" }).click();
  await page.getByRole("button", { name: /^Agregar \$/ }).click();
  await page.getByLabel("Mi pedido, 1 producto").click();
  await page.getByRole("button", { name: "Ir al pago" }).click();
  await page.getByRole("button", { name: "Preparar pago" }).click();
  await page.getByRole("button", { name: /Pagar en modo demo/ }).click();
  await expect(
    page.getByRole("heading", { name: "Tu pedido ya está en la barra" }),
  ).toBeVisible({ timeout: 8_000 });
}

async function activateWithEmail(page: Page, email: string) {
  await page.getByRole("button", { name: "Quiero mis sellos" }).click();
  await page.getByRole("button", { name: "Correo" }).click();
  await page.getByLabel("Correo").fill(email);
  await page.getByLabel(/Acepto que este local recuerde/).check();
  await page.getByLabel(/Acepto usar este dato para recuperar/).check();
  await page.getByRole("button", { name: "Enviar código" }).click();
  await page.getByLabel("Código de 6 dígitos").fill("735204");
  await page.getByRole("button", { name: "Recuperar mis sellos" }).click();
  await expect(
    page.getByRole("heading", { name: "¿Qué te tinca?" }),
  ).toBeVisible();
}

test("opt-in posterior al pago, premio a $0 y marca en KDS", async ({
  page,
  context,
}) => {
  // Intenta romper la cadena completa: consentimiento separado, sello por pago
  // confirmado, canje server-side y comanda inequívoca para cocina.
  await page.request.post("/api/diner/test", {
    headers: { "x-tablio-e2e": "1" },
    data: { action: "loyalty.reset" },
  });
  await enterTable(page);
  await addAndPay(page);
  await activateWithEmail(page, "fiel@example.com");
  await expect(page.getByText(/1 de 5/)).toBeVisible();

  await page.evaluate(async () => {
    await fetch("/api/diner/test", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-tablio-e2e": "1",
      },
      body: JSON.stringify({ action: "loyalty.seed", stamps: 5 }),
    });
  });
  await page.reload();
  await page.getByRole("button", { name: "Sellos", exact: true }).click();
  await page
    .getByRole("button", { name: "Agregar Papas crujientes · premio" })
    .click();
  await page.getByRole("button", { name: "Carta", exact: true }).click();
  await page.getByRole("button", { name: "Ver Lager de la casa" }).click();
  await page.getByRole("button", { name: /^Agregar \$/ }).click();
  await page.getByLabel("Mi pedido, 2 productos").click();
  await expect(page.getByText("PREMIO · $0")).toBeVisible();
  await page.getByRole("button", { name: "Ir al pago" }).click();
  await page.getByRole("button", { name: "Preparar pago" }).click();
  await page.getByRole("button", { name: /Pagar en modo demo/ }).click();
  await expect(
    page.getByRole("heading", { name: "Tu pedido ya está en la barra" }),
  ).toBeVisible({ timeout: 8_000 });

  const kds = await context.newPage();
  await kds.goto("/kds");
  await expect(kds.getByText("PREMIO · $0").first()).toBeVisible({
    timeout: 8_000,
  });
});

test("recupera sellos después de perder todos los datos del navegador", async ({
  page,
  context,
}) => {
  // Simula exactamente el fallo esperado en Safari o al limpiar datos: no debe
  // requerir al bar ni el token anterior para recuperar el saldo.
  await context.clearCookies();
  await enterTable(page);
  await page
    .getByRole("button", {
      name: /Ya tenías sellos.*Recupéralos con teléfono o correo/,
    })
    .click();
  await page.getByRole("button", { name: "Correo" }).click();
  await page.getByLabel("Correo").fill("fiel@example.com");
  await page.getByRole("button", { name: "Enviar código" }).click();
  await page.getByLabel("Código de 6 dígitos").fill("735204");
  await page.getByRole("button", { name: "Recuperar mis sellos" }).click();
  await expect(page.getByText(/0 de 5|5 de 5/)).toBeVisible();
});

test("un teléfono compartido solo muestra una identidad enmascarada", async ({
  page,
}) => {
  // Si esto falla, otra persona de la mesa podría leer el nombre del titular.
  await enterTable(page);
  await addAndPay(page);
  await activateWithEmail(page, "compartido@example.com");
  await page.context().clearCookies({ name: "tablio_diner_device" });
  await enterTable(page);
  await expect(
    page.getByRole("heading", { name: "¿Este perfil es tuyo?" }),
  ).toBeVisible();
  await expect(page.getByText(/^Perfil •\d{3}$/)).toBeVisible();
  await expect(page.getByText("compartido@example.com")).toHaveCount(0);
  await page.getByRole("button", { name: "No soy yo" }).click();
  await expect(
    page.getByRole("heading", { name: "¿Este perfil es tuyo?" }),
  ).toHaveCount(0);
});
