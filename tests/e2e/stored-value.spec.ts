import { expect, test, type Page } from "@playwright/test";

test.describe.configure({ mode: "serial" });

async function enterTable(page: Page) {
  await page.goto("/mesa/demo-mesa-8");
  await page.getByLabel("Código de la mesa").fill("4826");
  await page.getByRole("button", { name: "Entrar a la carta" }).click();
}

async function firstPaymentAndIdentity(page: Page) {
  await page.getByRole("button", { name: "Ver Papas crujientes" }).click();
  await page.getByRole("button", { name: /^Agregar \$/ }).click();
  await page.getByLabel("Mi pedido, 1 producto").click();
  await page.getByRole("button", { name: "Ir al pago" }).click();
  await page.getByRole("button", { name: "Preparar pago" }).click();
  await page.getByRole("button", { name: /Pagar en modo demo/ }).click();
  await expect(
    page.getByRole("heading", { name: "Tu pedido ya está en la barra" }),
  ).toBeVisible({ timeout: 8_000 });
  await page.getByRole("button", { name: "Quiero mis sellos" }).click();
  await page.getByRole("button", { name: "Correo" }).click();
  await page.getByLabel("Correo").fill("saldo@example.com");
  await page.getByLabel(/Acepto que este local recuerde/).check();
  await page.getByLabel(/Acepto usar este dato para recuperar/).check();
  await page.getByRole("button", { name: "Enviar código" }).click();
  await page.getByLabel("Código de 6 dígitos").fill("735204");
  await page.getByRole("button", { name: "Recuperar mis sellos" }).click();
}

test("recarga, alerta de pasivo y pago mixto quedan claros", async ({
  page,
  context,
}) => {
  // Intenta romper la cadena completa: el frontend nunca acredita ni confirma,
  // el quote congela saldo + diferencia y plataforma ve la exposición.
  await page.request.post("/api/diner/test", {
    headers: { "x-tablio-e2e": "1" },
    data: { action: "loyalty.reset" },
  });
  await enterTable(page);
  await firstPaymentAndIdentity(page);
  await page.getByRole("button", { name: "Sellos", exact: true }).click();
  await page.getByRole("button", { name: "Aceptar y activar" }).click();
  await page.getByLabel("Cargar dinero en demo").selectOption("30000");
  await page.getByRole("button", { name: "Cargar en modo demo" }).click();
  await expect(page.getByRole("heading", { name: "$34.500" })).toBeVisible();
  await expect(
    page.getByText(/\$30.000 cargados · \$4.500 de bono/),
  ).toBeVisible();

  const superadmin = await context.newPage();
  await superadmin.goto("/superadmin");
  await expect(
    superadmin.getByText("Pasivo de clientes").locator(".."),
  ).toContainText("$34.500");
  await superadmin.locator('[data-tenant-id="tenant-demo-pwa"]').click();
  await expect(
    superadmin.getByText(/supera el umbral de Tablio/),
  ).toBeVisible();

  await page.getByRole("button", { name: "Carta", exact: true }).click();
  await page.getByRole("button", { name: "Ver Lager de la casa" }).click();
  await page.getByRole("button", { name: /^Agregar \$/ }).click();
  await page.getByLabel("Mi pedido, 1 producto").click();
  await page.getByRole("button", { name: "Ir al pago" }).click();
  await page.getByLabel("Usar saldo en este pedido").fill("3000");
  await page.getByRole("button", { name: "Preparar pago" }).click();
  await expect(page.getByText(/Saldo congelado: −\$3.000/)).toBeVisible();
  await expect(page.getByText("Resta pagar").locator("..")).toContainText(
    "$1.950",
  );
  await page
    .getByRole("button", { name: /Pagar diferencia en demo.*\$1.950/ })
    .click();
  await expect(
    page.getByRole("heading", { name: "Tu pedido ya está en la barra" }),
  ).toBeVisible({ timeout: 8_000 });
  await expect(page.getByText(/\$3.000 desde saldo/)).toBeVisible();

  // Si esto falla, el cliente podría aumentar la exposición del local sobre el límite.
  await page.getByRole("button", { name: "Sellos", exact: true }).click();
  await page.getByLabel("Cargar dinero en demo").selectOption("10000");
  await page.getByRole("button", { name: "Cargar en modo demo" }).click();
  await expect(
    page.getByRole("alert").filter({ hasText: "máximo de saldo" }),
  ).toBeVisible();
});
