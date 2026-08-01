import { TablioLogo } from "@/components/operational/app-shell";
import type { PresenceDeliveryLevel } from "@/lib/table-management-contract";

export function QrPrintCard({
  displayName,
  presenceCode,
  presenceDeliveryLevel,
  presenceRequired,
  qrSvg,
  tableNumber,
  tenantName,
}: {
  displayName: string;
  presenceCode: string;
  presenceDeliveryLevel: PresenceDeliveryLevel;
  presenceRequired: boolean;
  qrSvg: string;
  tableNumber: string;
  tenantName: string;
}) {
  const printsCode =
    presenceRequired && presenceDeliveryLevel === "printed_with_qr";
  return (
    <article className="break-inside-avoid rounded-surface-xl border border-border bg-card p-6 text-center text-card-foreground">
      <div className="flex items-center justify-between gap-4 text-left">
        <TablioLogo />
        <p className="text-small font-bold">{tenantName}</p>
      </div>
      <div className="mt-6 space-y-1">
        <p className="text-label uppercase tracking-wide text-muted-foreground">
          {displayName}
        </p>
        <h1 className="text-display tracking-tight">MESA {tableNumber}</h1>
      </div>
      <div
        aria-label={`Código QR de la mesa ${tableNumber}`}
        className="mx-auto my-6 max-w-qr-print [&_svg]:h-auto [&_svg]:w-full"
        dangerouslySetInnerHTML={{ __html: qrSvg }}
      />
      {printsCode ? (
        <div className="rounded-surface-lg bg-muted p-4">
          <p className="text-label uppercase tracking-wide text-muted-foreground">
            Código de la mesa
          </p>
          <p className="mt-1 text-h1 tracking-widest">{presenceCode}</p>
        </div>
      ) : null}
      <p className="mt-6 text-body font-bold">
        Escanea, pide y paga desde tu celular.
      </p>
    </article>
  );
}
