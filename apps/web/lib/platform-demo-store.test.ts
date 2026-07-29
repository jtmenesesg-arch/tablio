import { beforeEach, describe, expect, it } from "vitest";
import {
  getDinerOrderingAvailability,
  getOnboardingBootstrap,
  getSuperadminBootstrap,
  mutateOnboarding,
  mutateSuperadmin,
  resetPlatformDemo,
  setDemoDinerSubscriptionStatus,
} from "./platform-demo-store";

describe("negocio SaaS y onboarding demo", () => {
  beforeEach(() => resetPlatformDemo());

  it("guarda onboarding parcial y lo recupera", async () => {
    // Intenta perder un paso al cerrar la pestaña. Si falla, el dueño tendría
    // que comenzar nuevamente la instalación del local.
    await mutateOnboarding({
      action: "venue.save",
      name: "Bar de Prueba",
      address: "Santiago 123",
      venueType: "Bar",
      openingHours: "18:00–02:00",
    });
    expect(getOnboardingBootstrap()).toMatchObject({
      tenantName: "Bar de Prueba",
      currentStep: "size",
      completedSteps: ["venue"],
    });
  });

  it("nunca publica una importación sin revisión humana", async () => {
    // Intenta publicar el precio extraído directamente. Si falla, un OCR
    // equivocado podría vender un producto por un monto incorrecto.
    await mutateOnboarding({
      action: "menu.import",
      source: "text",
      sourceLabel: "texto",
      content: "Lager $4.500",
    });
    await expect(mutateOnboarding({ action: "menu.publish" })).rejects.toThrow(
      "Revisa y confirma",
    );
    await mutateOnboarding({ action: "menu.review.confirm" });
    const published = await mutateOnboarding({ action: "menu.publish" });
    expect(published.menu.status).toBe("published");
  });

  it("un cobro fallido crea reintento sin suspensión inmediata", async () => {
    // Intenta cortar el servicio ante el primer rechazo. Si falla, una
    // tarjeta vencida podría detener un viernes de operación.
    const failed = await mutateSuperadmin({
      action: "billing.fail",
      tenantId: "tenant-demo-pwa",
    });
    expect(
      failed.tenants.find((tenant) => tenant.id === "tenant-demo-pwa"),
    ).toMatchObject({
      subscriptionStatus: "past_due",
      operationalAccess: "full",
    });
    expect(failed.notifications.map((notice) => notice.kind)).toEqual(
      expect.arrayContaining(["charge_failed", "retry_scheduled"]),
    );
  });

  it("exige motivo para impersonar y conserva la auditoría", async () => {
    // Intenta entrar al tenant sin justificar soporte. Si falla, el acceso
    // privilegiado no tendría quién, cuándo y por qué.
    await expect(
      mutateSuperadmin({
        action: "tenant.impersonate",
        tenantId: "tenant-demo-pwa",
        reason: "ayuda",
      }),
    ).rejects.toThrow("motivo específico");
    const result = await mutateSuperadmin({
      action: "tenant.impersonate",
      tenantId: "tenant-demo-pwa",
      reason: "Revisar conexión reportada por el dueño",
    });
    expect(result.impersonationAudit[0]).toMatchObject({
      tenantName: "Bar La Esquina",
      reason: "Revisar conexión reportada por el dueño",
    });
  });

  it("oculta la morosidad al comensal incluso suspendido", () => {
    // Intenta filtrar el problema comercial al QR. Si falla, el cliente final
    // vería información privada entre Tablio y el bar.
    setDemoDinerSubscriptionStatus("suspended");
    const contract = getDinerOrderingAvailability();
    expect(contract.orderingAvailable).toBe(false);
    expect(JSON.stringify(contract)).not.toMatch(/deuda|moros|cobro|suscrip/i);
  });

  it("mantiene el estado global separado por tenant", () => {
    // Intenta convertir el panel global en una lista sin separación. Si falla,
    // soporte podría aplicar el estado de un local a otro.
    const tenants = getSuperadminBootstrap().tenants;
    expect(new Set(tenants.map((tenant) => tenant.id)).size).toBe(
      tenants.length,
    );
  });
});
