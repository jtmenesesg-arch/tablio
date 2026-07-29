import { expect, test, type Page } from "@playwright/test";

test.describe.configure({ mode: "serial" });

async function reset(page: Page) {
  expect(
    (
      await page.request.post("/api/cashier/test", {
        data: { action: "reset" },
      })
    ).ok(),
  ).toBe(true);
}

async function openCashier(page: Page) {
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.goto("/caja");
  await expect(
    page.getByRole("heading", { name: /Caja · Bar La Esquina/ }),
  ).toBeVisible();
}

test("muestra el estado exacto de las mesas y la alerta financiera inmediata", async ({
  page,
}) => {
  // Intenta esconder una entrega o una aprobación tardía. Si falla, caja
  // podría creer que el local está tranquilo mientras hay dinero en riesgo.
  await reset(page);
  await openCashier(page);
  await expect(page.getByText("Conectado")).toBeVisible();
  const table = page.getByRole("article").filter({ hasText: "Mesa 8" });
  await expect(table.getByText("Requiere entrega")).toBeVisible();
  await expect(table.getByText("5 personas · 4 pedidos")).toBeVisible();
  await expect(table.getByText("$48.600 procesados")).toBeVisible();
  await expect(page.getByText("1 excepción crítica")).toBeVisible();
});

test("expone ambas horas y corta la producción manual a los veinte minutos", async ({
  page,
}) => {
  // Intenta producir para un cliente que probablemente ya se fue. Si falla,
  // una aprobación vieja podría mandar comida a una mesa vacía.
  await reset(page);
  await openCashier(page);
  await page.getByRole("button", { name: /Excepciones/ }).click();
  const late = page.locator(
    '[data-exception-type="approved_after_quote_expired"]',
  );
  await expect(late.getByText(/Proveedor:/)).toBeVisible();
  await expect(late.getByText(/Recepción:/)).toBeVisible();
  await expect(late.getByText(/5 min desde la aprobación/)).toBeVisible();
  await expect(
    late.getByRole("button", { name: "Producir manualmente" }),
  ).toBeEnabled();

  expect(
    (
      await page.request.post("/api/cashier/test", {
        data: { action: "expire_manual_window" },
      })
    ).ok(),
  ).toBe(true);
  await page.reload();
  await page.getByRole("button", { name: /Excepciones/ }).click();
  const expired = page.locator(
    '[data-exception-type="approved_after_quote_expired"]',
  );
  await expect(expired.getByText(/sólo reembolsar o escalar/)).toBeVisible();
  await expect(
    expired.getByRole("button", { name: "Producir manualmente" }),
  ).toBeDisabled();
});

test("un reembolso repetido produce un solo efecto y distingue la propina", async ({
  page,
}) => {
  // Repite la misma devolución como lo haría un doble clic o un reintento.
  // Si falla, se devolvería dos veces dinero o propina.
  await reset(page);
  const mutation = {
    action: "refund.request",
    paymentId: "payment-previous-shift",
    amountClp: 5_000,
    idempotencyKey: "e2e:refund:closed-shift",
    reason: "Reclamo posterior al cierre",
  };
  const first = await page.request.post("/api/cashier", { data: mutation });
  const repeated = await page.request.post("/api/cashier", { data: mutation });
  expect(first.ok()).toBe(true);
  expect(repeated.ok()).toBe(true);
  const firstBody = (await first.json()) as {
    refundId: string;
    bootstrap: {
      metrics: {
        localTipAdjustmentsClp: number;
        tipRefundedOpenShiftClp: number;
      };
    };
  };
  const repeatedBody = (await repeated.json()) as {
    refundId: string;
    idempotentReplay: boolean;
  };
  expect(repeatedBody.refundId).toBe(firstBody.refundId);
  expect(repeatedBody.idempotentReplay).toBe(true);
  expect(firstBody.bootstrap.metrics).toMatchObject({
    localTipAdjustmentsClp: 500,
    tipRefundedOpenShiftClp: 0,
  });
});

test("congela el cierre, explica el abono y permite descargar evidencia", async ({
  page,
}) => {
  // Intenta cerrar con excepciones sin dejar explicación o cambiar la suma.
  // Si falla, el cierre no podría explicar cada peso ni reconstruirse.
  await reset(page);
  await openCashier(page);
  await page.getByRole("button", { name: "Cierre" }).click();
  page.on("dialog", async (dialog) => {
    await dialog.accept(
      dialog.message().includes("Efectivo")
        ? "0"
        : "Excepciones revisadas y escaladas",
    );
  });
  await page.getByRole("button", { name: "Ejecutar cierre inmutable" }).click();
  await expect(page.getByText("CIERRE CONGELADO")).toBeVisible();
  await expect(page.getByText("Abono esperado")).toBeVisible();
  await expect(page.getByText("$60.091")).toBeVisible();

  const closureCsv = await page.request.get("/api/cashier?export=closure");
  expect(closureCsv.ok()).toBe(true);
  expect(await closureCsv.text()).toContain("abono_esperado,60091");
  const exceptionsCsv = await page.request.get(
    "/api/cashier?export=exceptions",
  );
  expect(exceptionsCsv.ok()).toBe(true);
  expect(await exceptionsCsv.text()).toContain(
    "id,tipo,estado,monto_clp,hora_proveedor,hora_recepcion",
  );
});
