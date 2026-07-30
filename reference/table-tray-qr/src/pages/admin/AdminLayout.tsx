import { Outlet, useLocation, useNavigate, useParams } from "react-router-dom";
import { LayoutGrid, BookOpen, QrCode, Settings, Users, LogOut, AlertTriangle, ClipboardList, BarChart3, ChefHat, Headset } from "lucide-react";
import { useAdmin } from "@/contexts/AdminContext";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";

export default function AdminLayout() {
  const { tenantName, branchName, branchId, primaryColor, isLoading, isImpersonating, logout, slug } = useAdmin();
  const location = useLocation();
  const navigate = useNavigate();
  const { slug: urlSlug } = useParams<{ slug: string }>();
  const effectiveSlug = urlSlug ?? slug;

  const NAV_ITEMS = [
    { path: `/admin/${effectiveSlug}/mesas`, label: "Mesas", icon: LayoutGrid, external: false },
    { path: `/admin/${effectiveSlug}/pedidos`, label: "Pedidos", icon: ClipboardList, external: false },
    { path: `/admin/${effectiveSlug}/menu`, label: "Menú", icon: BookOpen, external: false },
    { path: `/admin/${effectiveSlug}/reportes`, label: "Reportes", icon: BarChart3, external: false },
    { path: `/admin/${effectiveSlug}/equipo`, label: "Equipo", icon: Users, external: false },
    { path: `/admin/${effectiveSlug}/qr`, label: "QR", icon: QrCode, external: false },
    { path: `/kds?branch=${branchId}`, label: "KDS Cocina", icon: ChefHat, external: true },
    { path: `/admin/${effectiveSlug}/sucursal`, label: "Sucursal", icon: Settings, external: false },
    { path: `/admin/${effectiveSlug}/soporte`, label: "Soporte", icon: Headset, external: false },
  ];

  if (isLoading) {
    return (
      <div className="flex h-screen items-center justify-center bg-background">
        <div className="animate-spin h-8 w-8 border-4 border-primary border-t-transparent rounded-full" />
      </div>
    );
  }

  return (
    <div className="flex h-screen bg-background">
      {/* Desktop sidebar */}
      <aside className="hidden md:flex w-56 flex-col border-r border-border bg-card">
        <div className="p-4 border-b border-border">
          <h1 className="font-extrabold text-lg text-foreground truncate">tablio<span className="text-primary">.</span></h1>
          <p className="text-xs text-muted-foreground truncate">{tenantName} · {branchName}</p>
        </div>
        <nav className="flex-1 p-2 space-y-1">
          {NAV_ITEMS.map((item) => {
            const active = location.pathname.startsWith(item.path);
            return (
              <button
                key={item.path}
                onClick={() => item.external ? window.open(item.path, '_blank') : navigate(item.path)}
                className={cn(
                  "flex items-center gap-3 w-full px-3 py-2.5 rounded-lg text-sm font-medium transition-colors",
                  active
                    ? "bg-accent text-accent-foreground"
                    : "text-muted-foreground hover:bg-muted hover:text-foreground"
                )}
              >
                <item.icon className="h-5 w-5" />
                {item.label}
              </button>
            );
          })}
        </nav>
        <div className="p-2 border-t border-border">
          <button
            onClick={logout}
            className="flex items-center gap-3 w-full px-3 py-2.5 rounded-md text-sm font-medium text-muted-foreground hover:bg-accent hover:text-foreground transition-colors"
          >
            <LogOut className="h-5 w-5" />
            Cerrar sesión
          </button>
        </div>
      </aside>

      {/* Main content */}
      <main className="flex-1 flex flex-col overflow-hidden">
        {/* Impersonation banner */}
        {isImpersonating && (
          <div className="bg-amber-500/10 border-b border-amber-500/30 px-4 py-2 flex items-center justify-between">
            <div className="flex items-center gap-2 text-sm text-amber-700">
              <AlertTriangle className="h-4 w-4" />
              <span>Estás impersonando a <strong>{tenantName}</strong></span>
            </div>
            <Button variant="ghost" size="sm" onClick={logout} className="text-amber-700 hover:text-amber-900">
              Salir
            </Button>
          </div>
        )}
        <div className="flex-1 overflow-y-auto p-4 md:p-6 pb-20 md:pb-6">
          <Outlet />
        </div>
      </main>

      {/* Mobile bottom nav */}
      <nav className="md:hidden fixed bottom-0 inset-x-0 bg-card border-t border-border flex z-50">
        {NAV_ITEMS.map((item) => {
          const active = location.pathname.startsWith(item.path);
          return (
            <button
              key={item.path}
              onClick={() => item.external ? window.open(item.path, '_blank') : navigate(item.path)}
              className={cn(
                "flex-1 flex flex-col items-center py-2 gap-0.5 text-xs font-medium transition-colors",
                active ? "text-primary" : "text-muted-foreground"
              )}
            >
              <item.icon className="h-5 w-5" />
              {item.label}
            </button>
          );
        })}
      </nav>
    </div>
  );
}
