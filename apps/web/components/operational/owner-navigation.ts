import type { AppShellNavItem } from "./app-shell";
import {
  LayoutIcon,
  MoneyIcon,
  ReportsIcon,
  SettingsIcon,
  SupportIcon,
  TableIcon,
  TeamIcon,
} from "@/components/ui/icons";

export type OwnerNavigationKey =
  | "summary"
  | "tables"
  | "cashier"
  | "team"
  | "configure"
  | "support"
  | "reports";

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
    {
      active: active === "team",
      href: "/equipo",
      icon: TeamIcon,
      label: "Equipo",
    },
    {
      active: active === "configure",
      href: "/configuracion",
      icon: SettingsIcon,
      label: "Configurar",
    },
    {
      active: active === "reports",
      href: "/reportes",
      icon: ReportsIcon,
      label: "Reportes",
    },
    {
      active: active === "support",
      href: "/soporte",
      icon: SupportIcon,
      label: "Soporte",
    },
  ];
}
