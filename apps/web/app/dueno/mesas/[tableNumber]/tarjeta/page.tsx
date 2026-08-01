import QRCode from "qrcode";
import { PrintButton } from "@/components/table/print-button";
import { QrPrintCard } from "@/components/table/qr-print-card";
import { serverOrigin } from "@/lib/server-origin";
import { tableManagementDemoStore } from "@/lib/table-management-demo-store";

export const dynamic = "force-dynamic";

export default async function TablePrintPage({
  params,
}: {
  params: Promise<{ tableNumber: string }>;
}) {
  const { tableNumber } = await params;
  const table = tableManagementDemoStore.printable(
    decodeURIComponent(tableNumber),
    "Impresión individual solicitada por el dueño",
  );
  const origin = await serverOrigin();
  const qrSvg = await QRCode.toString(`${origin}/mesa/${table.qrToken}`, {
    type: "svg",
    errorCorrectionLevel: "H",
    margin: 2,
    width: 512,
  });
  return (
    <main className="mx-auto min-h-dvh max-w-3xl space-y-6 bg-background p-6 print:max-w-none print:bg-card print:p-0">
      <div className="flex items-center justify-between gap-4 print:hidden">
        <div>
          <p className="text-label uppercase tracking-wide text-muted-foreground">
            Tarjeta lista
          </p>
          <h1 className="text-h1">Mesa {table.tableNumber}</h1>
        </div>
        <PrintButton />
      </div>
      <QrPrintCard {...table} qrSvg={qrSvg} />
    </main>
  );
}
