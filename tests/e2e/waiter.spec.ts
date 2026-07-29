import { expect, test, type Page } from "@playwright/test";

test.describe.configure({ mode: "serial" });

async function reset(page: Page) {
  await page.context().clearCookies();
  expect(
    (
      await page.request.post("/api/waiter/test", {
        data: { action: "reset" },
      })
    ).ok(),
  ).toBe(true);
  expect(
    (
      await page.request.post("/api/kds/test", {
        data: { action: "reset" },
      })
    ).ok(),
  ).toBe(true);
}

async function login(page: Page, pin = "2468", zone = "Terraza") {
  await page.goto("/garzon");
  await page.getByLabel("PIN personal").fill(pin);
  await page.getByRole("button", { name: "Entrar" }).click();
  await expect(
    page.getByRole("heading", { name: "¿Qué zona cubres?" }),
  ).toBeVisible();
  await page.getByRole("button", { name: new RegExp(zone) }).click();
  await page.getByRole("button", { name: "Empezar turno" }).click();
  await expect(page.getByRole("heading", { name: "Tu cola" })).toBeVisible();
}

async function enterTable(page: Page) {
  await page.goto("/mesa/demo-mesa-8");
  await page.getByLabel("Código de la mesa").fill("4826");
  await page.getByRole("button", { name: "Entrar a la carta" }).click();
}

async function createReadyTicket(page: Page, orderNumber: number) {
  const created = await page.request.post("/api/kds/test", {
    data: { action: "create_paid_ticket", stationId: "barra", orderNumber },
  });
  const { ticketId } = (await created.json()) as { ticketId: string };
  for (const transition of [
    ["queued", "acknowledged", 0],
    ["acknowledged", "in_preparation", 1],
    ["in_preparation", "ready", 2],
  ] as const) {
    const response = await page.request.post("/api/kds", {
      data: {
        action: "ticket.transition",
        ticketId,
        expectedState: transition[0],
        targetState: transition[1],
        expectedVersion: transition[2],
      },
    });
    expect(response.ok()).toBe(true);
  }
  return ticketId;
}

test("un llamado aparece en vivo sólo en la cobertura correcta", async ({
  browser,
  page,
}) => {
  // Intenta perder o filtrar mal un llamado. Si falla, una mesa puede esperar
  // sin que su garzón lo vea o exponer tareas a un sector incorrecto.
  await reset(page);
  await login(page);
  const dinerContext = await browser.newContext();
  try {
    const diner = await dinerContext.newPage();
    await enterTable(diner);
    await diner.getByRole("button", { name: "Ayuda" }).click();
    await diner.getByRole("button", { name: /Llamar al garzón/ }).click();
    await expect(page.getByText("Mesa 8 · Llamar al garzón")).toBeVisible({
      timeout: 4_000,
    });
    await expect(page.getByText("En línea")).toBeVisible();
  } finally {
    await dinerContext.close();
  }
});

test("una entrega READY se completa desde el panel sin duplicarse", async ({
  page,
}) => {
  // Intenta desacoplar READY de la entrega real. Si falla, la misma comanda
  // podría seguir pendiente o completarse dos veces.
  await reset(page);
  await login(page);
  const ticketId = await createReadyTicket(page, 451);
  await expect(page.getByText(/Pedido 451 · LISTO/)).toBeVisible({
    timeout: 4_000,
  });
  await expect(page.getByText("PAGADO")).toBeVisible();
  await page.getByRole("button", { name: "Entregado" }).click();
  await expect(page.getByText(/Pedido 451 · LISTO/)).toBeHidden();
  const kds = await page.request.post("/api/kds/test", {
    data: { action: "ticket_state", ticketId },
  });
  expect(((await kds.json()) as { state: string }).state).toBe("completed");
});

test("pagar con garzón queda NO PAGADO y no crea pedido ni comanda", async ({
  browser,
  page,
}) => {
  // Intenta hacer pasar una solicitud manual por una venta. Si falla, la
  // cocina podría producir antes de recibir confirmación de pago.
  await reset(page);
  await login(page);
  const dinerContext = await browser.newContext();
  try {
    const diner = await dinerContext.newPage();
    await enterTable(diner);
    await diner.getByRole("button", { name: "Ver Lager de la casa" }).click();
    await diner.getByRole("button", { name: /^Agregar \$/ }).click();
    await diner.getByLabel("Mi pedido, 1 producto").click();
    await diner
      .getByRole("button", { name: "Prefiero pagar con el garzón" })
      .click();
    await expect(page.getByText(/PAGO PENDIENTE/)).toBeVisible({
      timeout: 4_000,
    });
    await expect(
      page.getByText("NO PAGADO · nada fue enviado a la barra"),
    ).toBeVisible();
    const kds = await page.request.get("/api/kds?station=all");
    expect(((await kds.json()) as { tickets: unknown[] }).tickets).toHaveLength(
      0,
    );
  } finally {
    await dinerContext.close();
  }
});

test("una tarea antigua vence la prioridad y el cierre advierte pendientes", async ({
  browser,
  page,
}) => {
  // Intenta enterrar una tarea vieja y cerrar el turno sin advertencia. Si
  // falla, un llamado puede quedar invisible cuando el garzón se retira.
  await reset(page);
  await login(page);
  const dinerContext = await browser.newContext();
  try {
    const diner = await dinerContext.newPage();
    await enterTable(diner);
    await diner.getByRole("button", { name: "Ayuda" }).click();
    await diner.getByRole("button", { name: /Pedir agua/ }).click();
    await expect(page.getByText("Mesa 8 · Pedir agua")).toBeVisible();
    const bootstrap = (await (
      await page.request.get("/api/waiter")
    ).json()) as { tasks: Array<{ id: string }> };
    await page.request.post("/api/waiter/test", {
      data: {
        action: "age_task",
        taskId: bootstrap.tasks[0].id,
        seconds: 12 * 60 + 1,
      },
    });
    await page.reload();
    await expect(page.getByText("CRÍTICA · SUPERÓ 12 MIN")).toBeVisible();
    await page.getByRole("button", { name: "Turno" }).click();
    await page.getByRole("button", { name: "Cerrar turno" }).click();
    const closeDialog = page.getByRole("dialog", {
      name: "¿Cerrar turno?",
    });
    await expect(closeDialog.getByText(/Tienes 1 llamado/)).toBeVisible();
    await expect(
      closeDialog.getByText(/quedarán sin asignar y visibles para todos/),
    ).toBeVisible();
  } finally {
    await dinerContext.close();
  }
});
