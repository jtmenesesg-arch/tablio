import type { Metadata, Viewport } from "next";
import type { ReactNode } from "react";
import "./globals.css";

export const metadata: Metadata = {
  title: {
    default: "Tablio · Pide y paga desde tu mesa",
    template: "%s · Tablio",
  },
  description:
    "Carta, pago y estado de tu pedido desde la mesa, sin descargar una app.",
  manifest: "/manifest.webmanifest",
  appleWebApp: {
    capable: true,
    statusBarStyle: "black-translucent",
    title: "Tablio",
  },
};

export const viewport: Viewport = {
  themeColor: "#111110",
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="es">
      <body>{children}</body>
    </html>
  );
}
