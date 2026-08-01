import { describe, expect, it } from "vitest";
import { TableManagementDemoStore } from "./table-management-demo-store";

describe("TableManagementDemoStore", () => {
  it("crea una mesa con QR y código sin exponer secretos en el listado", () => {
    // Intenta filtrar el token o el código al navegador. Si falla, una persona
    // con acceso al panel podría copiar credenciales internas sin auditoría.
    const store = new TableManagementDemoStore();
    const snapshot = store.mutate({
      action: "table.create",
      tableNumber: "42",
      displayName: "Mesa 42",
      zoneCode: "terraza",
      capacity: 4,
    });
    expect(snapshot.tables.some((table) => table.tableNumber === "42")).toBe(
      true,
    );
    expect(JSON.stringify(snapshot)).not.toContain("qrToken");
    expect(JSON.stringify(snapshot)).not.toContain("presenceCode");
  });

  it("rechaza toda la creación masiva si un número ya existe", () => {
    // Intenta dejar una zona creada a medias. Si falla, el dueño imprimiría
    // tarjetas incompletas y tendría que descubrir manualmente qué faltó.
    const store = new TableManagementDemoStore();
    const before = store.snapshot().tables.length;
    expect(() =>
      store.mutate({
        action: "table.create_bulk",
        zoneCode: "terraza",
        startNumber: 1,
        count: 3,
        namePrefix: "Mesa",
        capacity: 4,
      }),
    ).toThrow("ya existe");
    expect(store.snapshot().tables).toHaveLength(before);
  });

  it("regenerar cambia el QR y deja una sola versión activa", () => {
    // Intenta conservar funcionando el QR anterior. Si falla, una tarjeta
    // perdida o fotografiada seguiría abriendo la mesa después de regenerarla.
    const store = new TableManagementDemoStore();
    const before = store.printable("2", "Comprobar QR antes de rotar").qrToken;
    store.mutate({
      action: "qr.rotate",
      tableNumber: "2",
      reason: "Tarjeta dañada",
    });
    const after = store.printable("2", "Comprobar QR después de rotar").qrToken;
    expect(after).not.toBe(before);
    expect(
      store.snapshot().tables.find((table) => table.tableNumber === "2")
        ?.qrState,
    ).toBe("active");
  });
});
