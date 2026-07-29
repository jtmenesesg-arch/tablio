import { demoReceiptByProviderId } from "../../../../../lib/tax-demo-service";

export const dynamic = "force-dynamic";

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const providerId = decodeURIComponent(id);
  const record =
    demoReceiptByProviderId(providerId) ??
    (providerId === "demo-dte:caja-1041"
      ? ([
          "pedido-1041",
          {
            status: "issued" as const,
            message: "Boleta demo de caja.",
            amountClp: 20_000,
            folio: "10041",
            providerDocumentId: providerId,
          },
        ] as const)
      : undefined);
  if (!record) return new Response("Boleta no encontrada.", { status: 404 });
  const [orderId, document] = record;
  const html = `<!doctype html><html lang="es"><meta charset="utf-8"><title>Boleta demo ${document.folio}</title><body style="font-family:system-ui;max-width:520px;margin:40px auto"><h1>BOLETA ELECTRÓNICA DEMO</h1><p><strong>NO ES UN DOCUMENTO TRIBUTARIO REAL</strong></p><hr><p>Bar La Esquina Demo SpA</p><p>Folio demo: ${document.folio}</p><p>Pedido: ${orderId}</p><p>Total: $${document.amountClp.toLocaleString("es-CL")}</p><p>Estado: emitida por adaptador simulado</p></body></html>`;
  return new Response(html, {
    headers: {
      "content-type": "text/html; charset=utf-8",
      "content-disposition": `inline; filename="boleta-demo-${document.folio}.html"`,
      "cache-control": "no-store",
    },
  });
}
