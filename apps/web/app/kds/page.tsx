import type { Metadata } from "next";
import { KdsScreen } from "./kds-screen";

export const metadata: Metadata = {
  title: "KDS · Tablio",
  description: "Pantalla de producción por estación de Tablio.",
};

export default function KdsPage() {
  return <KdsScreen />;
}
