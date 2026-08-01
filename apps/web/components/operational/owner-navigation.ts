import type { AppShellNavItem } from "./app-shell";
import {
  LayoutIcon,
  MoneyIcon,
  SettingsIcon,
  TableIcon,
  TeamIcon,
} from "@/components/ui/icons";

export type OwnerNavigationKey = "summary" | "tables" | "cashier" | "configure";

export function ownerNavigation(
  active: OwnerNavigationKey,
): readonly AppShellNavItem[] {
  return [
    {
      active: active === "summary",
      href: "/dueno",
      icon: LayoutIcon,
      label: "Resumen",
    },
    {
      active: active === "tables",
      href: "/dueno/mesas",
      icon: TableIcon,
      label: "Mesas",
    },
    {
      active: active === "cashier",
      href: "/caja",
      icon: MoneyIcon,
      label: "Caja",
    },
    { href: "/garzon", icon: TeamIcon, label: "Equipo" },
    {
      active: active === "configure",
      href: "/onboarding",
      icon: SettingsIcon,
      label: "Configurar",
    },
  ];
}
