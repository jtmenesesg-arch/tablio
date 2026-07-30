import { Outlet, useNavigate, useLocation } from 'react-router-dom';
import { LayoutDashboard, Users, DollarSign, Kanban, Settings, LogOut, Eye, X } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { supabase } from '@/integrations/supabase/client';
import { useJefeVentas } from '@/contexts/JefeVentasContext';
import ThemeToggle from '@/components/ThemeToggle';

const NAV_ITEMS = [
  { path: '/jefe-ventas/dashboard', icon: LayoutDashboard, label: 'Dashboard' },
  { path: '/jefe-ventas/equipo', icon: Users, label: 'Equipo' },
  { path: '/jefe-ventas/comisiones', icon: DollarSign, label: 'Comisiones' },
  { path: '/jefe-ventas/pipeline', icon: Kanban, label: 'Pipeline' },
  { path: '/jefe-ventas/perfil', icon: Settings, label: 'Mi perfil' },
];

export default function JefeVentasLayout() {
  const navigate = useNavigate();
  const location = useLocation();
  const { profile, isLoading, isAuthenticated, impersonatingId, setImpersonatingId } = useJefeVentas();

  const handleLogout = async () => {
    sessionStorage.removeItem('jv_impersonating');
    sessionStorage.removeItem('superadmin_impersonating');
    await supabase.auth.signOut();
    navigate('/login');
  };

  const exitImpersonation = () => {
    setImpersonatingId(null);
    sessionStorage.removeItem('superadmin_impersonating');
    navigate('/superadmin/equipo');
  };

  if (isLoading) {
    return (
      <div className="flex h-screen items-center justify-center bg-background">
        <div className="animate-spin h-8 w-8 border-4 border-primary border-t-transparent rounded-full" />
      </div>
    );
  }

  if (!isAuthenticated) {
    navigate('/login');
    return null;
  }

  return (
    <div className="min-h-screen bg-background flex">
      {/* Impersonation banner */}
      {impersonatingId && (
        <div className="fixed top-0 left-0 right-0 z-50 bg-amber-500 text-black text-center py-1.5 text-sm font-medium flex items-center justify-center gap-2">
          <Eye className="w-4 h-4" />
          VISTA PREVIA — Estás viendo como otro usuario
          <Button variant="ghost" size="sm" onClick={exitImpersonation} className="h-6 text-black hover:bg-amber-600 gap-1 ml-2">
            <X className="w-3 h-3" />Salir
          </Button>
        </div>
      )}

      <aside className={`w-56 border-r border-border bg-card flex flex-col shrink-0 ${impersonatingId ? 'pt-10' : ''}`}>
        <div className="h-14 flex items-center gap-2 px-5 border-b border-border">
          <span className="font-bold text-foreground text-lg tracking-tight">tablio</span>
          <Badge className="bg-primary/10 text-primary border-primary/20 text-[10px]">Jefe Ventas</Badge>
        </div>
        <nav className="flex-1 p-3 space-y-1">
          {NAV_ITEMS.map(item => {
            const active = location.pathname.startsWith(item.path);
            return (
              <button
                key={item.path}
                onClick={() => navigate(item.path)}
                className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm transition-colors ${
                  active ? 'bg-primary/10 text-primary font-semibold' : 'text-muted-foreground hover:bg-muted'
                }`}
              >
                <item.icon className="w-4 h-4" />
                {item.label}
              </button>
            );
          })}
        </nav>
        <div className="p-3 border-t border-border space-y-2">
          <div className="px-3 py-1">
            <p className="text-xs text-muted-foreground truncate">{profile?.name}</p>
            <p className="text-[10px] text-muted-foreground/60 truncate">{profile?.email}</p>
          </div>
          <div className="flex items-center justify-between px-1">
            <ThemeToggle />
          </div>
          <button
            onClick={handleLogout}
            className="w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm text-muted-foreground hover:bg-muted transition-colors"
          >
            <LogOut className="w-4 h-4" />
            Cerrar sesión
          </button>
        </div>
      </aside>
      <div className={`flex-1 flex flex-col min-w-0 ${impersonatingId ? 'pt-10' : ''}`}>
        <main className="flex-1 overflow-auto">
          <Outlet />
        </main>
      </div>
    </div>
  );
}
