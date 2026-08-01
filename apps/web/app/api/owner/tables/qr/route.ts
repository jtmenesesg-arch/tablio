import QRCode from "qrcode";
import { tableManagementDemoStore } from "@/lib/table-management-demo-store";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  try {
    const url = new URL(request.url);
    const tableNumber = url.searchParams.get("table") ?? "";
    const printable = tableManagementDemoStore.printable(
      tableNumber,
      "Vista previa de tarjeta desde Mesas",
    );
    const destination = `${url.origin}/mesa/${printable.qrToken}`;
    const svg = await QRCode.toString(destination, {
      type: "svg",
      errorCorrectionLevel: "H",
      margin: 2,
      width: 512,
      color: { dark: "#111110", light: "#FEFEFE" },
    });
    return new Response(svg, {
      headers: {
        "cache-control": "no-store, private",
        "content-disposition": `inline; filename="tablio-mesa-${encodeURIComponent(tableNumber)}.svg"`,
        "content-security-policy":
          "default-src 'none'; style-src 'unsafe-inline'; sandbox",
        "content-type": "image/svg+xml; charset=utf-8",
        "x-content-type-options": "nosniff",
      },
    });
  } catch (error) {
    return Response.json(
      { error: error instanceof Error ? error.message : "QR no disponible." },
      { status: 404 },
    );
  }
}
