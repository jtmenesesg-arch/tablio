import { expect, test, type Locator } from "@playwright/test";

test.describe.configure({ mode: "serial" });

async function expectSolid(locator: Locator) {
  await expect(locator).toBeVisible();
  const style = await locator.evaluate((element) => {
    const computed = getComputedStyle(element);
    return {
      backgroundColor: computed.backgroundColor,
      backdropFilter: computed.backdropFilter,
      opacity: computed.opacity,
    };
  });
  expect(style.backgroundColor).not.toMatch(/rgba\([^)]*,\s*0\)/);
  expect(style.backgroundColor).not.toBe("transparent");
  expect(style.backdropFilter).toBe("none");
  expect(style.opacity).toBe("1");
}

test("un QR revocado o desconocido no abre una sesión", async ({ page }) => {
  // Intenta entrar con un QR fuera de servicio. Si falla, una foto antigua del
  // código podría abrir pedidos en una mesa que ya no corresponde.
  const response = await page.request.post("/api/diner", {
    data: {
      action: "join",
      qrToken: "qr-revocado-sprint-10",
      presenceCode: "4826",
    },
  });
  expect(response.status()).toBe(404);
  await expect(response.json()).resolves.toMatchObject({
    error: "Este QR no es válido.",
  });
});

test("una caída de red conserva el pedido y lo recupera al volver", async ({
  context,
  page,
}) => {
  // Intenta perder la venta al cambiar de WiFi a red móvil. Si falla, el
  // cliente pagaría pero la pantalla volvería a un carrito vacío.
  await page.goto("/mesa/demo-mesa-8");
  await page.getByLabel("Código de la mesa").fill("4826");
  await page.getByRole("button", { name: "Entrar a la carta" }).click();
  await page.getByRole("button", { name: "Ver Lager de la casa" }).click();
  await page.getByRole("button", { name: /^Agregar \$/ }).click();
  await page.getByLabel("Mi pedido, 1 producto").click();
  await page.getByRole("button", { name: "Ir al pago" }).click();
  await page.getByRole("button", { name: "Preparar pago" }).click();
  await page.getByRole("button", { name: /Pagar en modo demo/ }).click();
  await expect(
    page.getByRole("heading", { name: "Tu pedido ya está en la barra" }),
  ).toBeVisible({ timeout: 8_000 });
  const orderText = await page.locator(".orderIdentity").textContent();

  await context.setOffline(true);
  await expect(page.reload()).rejects.toThrow();
  await context.setOffline(false);
  await page.reload();
  await expect(
    page.getByRole("heading", { name: "Tu pedido ya está en la barra" }),
  ).toBeVisible({ timeout: 8_000 });
  await expect(page.locator(".orderIdentity")).toHaveText(orderText ?? "");
});

test("totales, pago y confirmación usan superficies sólidas", async ({
  page,
}) => {
  // Intenta esconder información financiera detrás de transparencia. Si
  // falla, el monto podría volverse ilegible con poca luz o un fondo ruidoso.
  await page.goto("/mesa/demo-mesa-8");
  await page.getByLabel("Código de la mesa").fill("4826");
  await page.getByRole("button", { name: "Entrar a la carta" }).click();
  await page.getByRole("button", { name: "Ver Lager de la casa" }).click();
  await page.getByRole("button", { name: /^Agregar \$/ }).click();
  await page.getByLabel("Mi pedido, 1 producto").click();
  await expectSolid(page.locator(".cartSummary.solidSurface"));
  await page.getByRole("button", { name: "Ir al pago" }).click();
  await expectSolid(page.locator(".financialTotal"));
  await page.getByRole("button", { name: "Preparar pago" }).click();
  await expectSolid(page.locator(".paymentTotal"));
  await expectSolid(page.getByRole("button", { name: /Pagar en modo demo/ }));
  await page.getByRole("button", { name: /Pagar en modo demo/ }).click();
  await expectSolid(page.locator(".confirmationCard.solidSurface"));
});
