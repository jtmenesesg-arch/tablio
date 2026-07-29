import type { Metadata } from "next";
import { WaiterPanel } from "./waiter-panel";

export const metadata: Metadata = {
  title: "Panel del garzón",
  description: "Tareas, mesas y entregas en vivo.",
};

export default function WaiterPage() {
  return <WaiterPanel />;
}
