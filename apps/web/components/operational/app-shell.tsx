import Link from "next/link";
import type { ReactNode } from "react";
import { cn } from "@/lib/cn";
import { Button } from "@/components/ui/button";
import { LogoutIcon, type IconComponent } from "@/components/ui/icons";
import { Skeleton } from "@/components/ui/skeleton";

export interface AppShellNavItem {
  active?: boolean;
  href: string;
  icon: IconComponent;
  label: string;
}

interface AppShellProps {
  banner?: ReactNode;
  branchName: string;
  children: ReactNode;
  navItems: readonly AppShellNavItem[];
  tenantName: string;
}

function TablioLogo() {
  return (
    <span
      aria-label="tablio"
      className="inline-flex text-h3 font-extrabold tracking-tight text-foreground"
    >
      tablio
      <span aria-hidden="true" className="text-brand">
        .
      </span>
    </span>
  );
}

function NavigationItem({
  compact = false,
  item,
}: {
  compact?: boolean;
  item: AppShellNavItem;
}) {
  const Icon = item.icon;
  return (
    <Link
      aria-current={item.active ? "page" : undefined}
      className={cn(
        "flex min-h-touch rounded-surface-lg text-small font-bold transition-colors duration-[var(--motion-feedback)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sidebar-ring motion-reduce:transition-none",
        compact
          ? "min-w-touch grow basis-0 flex-col items-center justify-center gap-1 px-1 py-2"
          : "items-center gap-3 px-3 py-2",
        item.active
          ? compact
            ? "text-sidebar-accent-foreground"
            : "bg-sidebar-accent text-sidebar-accent-foreground"
          : "text-muted-foreground hover:bg-muted hover:text-foreground",
      )}
      href={item.href}
      prefetch={false}
    >
      <Icon aria-hidden="true" className="size-icon shrink-0" />
      <span className={cn(!compact && "truncate")}>{item.label}</span>
    </Link>
  );
}

export function AppShell({
  banner,
  branchName,
  children,
  navItems,
  tenantName,
}: AppShellProps) {
  return (
    <div className="min-h-dvh bg-background font-sans text-foreground">
      <aside className="fixed inset-y-0 left-0 z-40 hidden w-sidebar flex-col border-r border-sidebar-border bg-sidebar text-sidebar-foreground md:flex">
        <div className="border-b border-sidebar-border p-4">
          <div className="py-2">
            <TablioLogo />
          </div>
          <p className="truncate text-small font-bold text-foreground">
            {tenantName}
          </p>
          <p className="truncate text-label text-muted-foreground">
            {branchName}
          </p>
        </div>

        <nav aria-label="Navegación principal" className="flex-1 space-y-1 p-2">
          {navItems.map((item) => (
            <NavigationItem item={item} key={item.href} />
          ))}
        </nav>

        <div className="border-t border-sidebar-border p-2">
          <Button asChild className="w-full justify-start" variant="ghost">
            <Link href="/" prefetch={false}>
              <LogoutIcon aria-hidden="true" />
              Salir de la demo
            </Link>
          </Button>
        </div>
      </aside>

      <div className="min-h-dvh md:pl-sidebar">
        {banner ? (
          <div className="sticky top-0 z-30 border-b border-primary bg-primary px-4 py-2 text-center text-label uppercase tracking-wide text-primary-foreground">
            {banner}
          </div>
        ) : null}
        <main className="mx-auto max-w-[90rem] p-4 pb-16 md:p-6">
          {children}
        </main>
      </div>

      <nav
        aria-label="Navegación principal"
        className="fixed inset-x-0 bottom-0 z-40 flex h-16 border-t border-sidebar-border bg-sidebar md:hidden"
      >
        {navItems.map((item) => (
          <NavigationItem compact item={item} key={item.href} />
        ))}
      </nav>
    </div>
  );
}

export function AppShellLoading({
  branchName = "Sucursal principal",
  navItems,
  tenantName = "Tu bar",
}: {
  branchName?: string;
  navItems: readonly AppShellNavItem[];
  tenantName?: string;
}) {
  return (
    <AppShell
      banner="Modo demo · no mueve dinero real"
      branchName={branchName}
      navItems={navItems}
      tenantName={tenantName}
    >
      <div aria-busy="true" aria-label="Cargando panel" className="space-y-6">
        <div className="space-y-3">
          <Skeleton className="h-4 w-skeleton-label" />
          <Skeleton className="h-12 w-full max-w-3xl" />
        </div>
        <div className="grid gap-4 md:grid-cols-3">
          <Skeleton className="h-loading-card" />
          <Skeleton className="h-loading-card" />
          <Skeleton className="h-loading-card" />
        </div>
        <Skeleton className="h-chart" />
      </div>
    </AppShell>
  );
}

export { TablioLogo };
