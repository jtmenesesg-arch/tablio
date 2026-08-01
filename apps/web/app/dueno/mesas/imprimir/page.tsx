import QRCode from "qrcode";
import { PrintButton } from "@/components/table/print-button";
import { QrPrintCard } from "@/components/table/qr-print-card";
import { serverOrigin } from "@/lib/server-origin";
import { tableManagementDemoStore } from "@/lib/table-management-demo-store";

export const dynamic = "force-dynamic";

export default async function PrintAllTablesPage() {
  const snapshot = tableManagementDemoStore.snapshot();
  const origin = await serverOrigin();
  const cards = await Promise.all(
    snapshot.tables
      .filter((table) => table.qrState === "active")
      .map(async (table) => {
        const printable = tableManagementDemoStore.printable(
          table.tableNumber,
          "Impresión masiva solicitada por el dueño",
        );
        return {
          ...printable,
          qrSvg: await QRCode.toString(`${origin}/mesa/${printable.qrToken}`, {
            type: "svg",
            errorCorrectionLevel: "H",
            margin: 2,
            width: 512,
          }),
        };
      }),
  );
  return (
    <main className="min-h-dvh bg-background p-6 print:bg-card print:p-0">
      <div className="mx-auto mb-6 flex max-w-5xl items-center justify-between gap-4 print:hidden">
        <div>
          <p className="text-label uppercase tracking-wide text-muted-foreground">
            Hoja de impresión
          </p>
          <h1 className="text-h1">Todas las tarjetas</h1>
        </div>
        <PrintButton label="Imprimir todas" />
      </div>
      <section className="mx-auto grid max-w-5xl gap-6 md:grid-cols-2 print:grid-cols-2 print:gap-4">
        {cards.map((card) => (
          <QrPrintCard key={card.tableNumber} {...card} />
        ))}
      </section>
    </main>
  );
}
