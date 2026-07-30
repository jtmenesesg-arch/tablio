import { Outlet, useNavigate, useLocation } from 'react-router-dom';
import { CalendarCheck, ClipboardList, BarChart3, BookOpen, PlusCircle, LogOut, DollarSign, Eye, X } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { useSeller } from '@/contexts/SellerContext';
import { supabase } from '@/integrations/supabase/client';
import ThemeToggle from '@/components/ThemeToggle';

const NAV_ITEMS = [
  { path: '/vendedor/mi-dia', icon: CalendarCheck, label: 'Mi día' },
  { path: '/vendedor/registro', icon: PlusCircle, label: 'Visita' },
  { path: '/vendedor/pipeline', icon: ClipboardList, label: 'Pipeline' },
  { path: '/vendedor/comisiones', icon: DollarSign, label: 'Comisiones' },
  { path: '/vendedor/numeros', icon: BarChart3, label: 'Números' },
  { path: '/vendedor/recursos', icon: BookOpen, label: 'Recursos' },
];

export default function SellerLayout() {
  const navigate = useNavigate();
  const location = useLocation();
  const { seller, isLoading, isAuthenticated, impersonatingId } = useSeller();

  const handleLogout = async () => {
    sessionStorage.removeItem('superadmin_impersonating');
    await supabase.auth.signOut();
    navigate('/login');
  };

  const exitImpersonation = () => {
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
    <div className="min-h-screen bg-background flex flex-col">
      {/* Impersonation banner */}
      {impersonatingId && (
        <div className="bg-amber-500 text-black text-center py-1.5 text-sm font-medium flex items-center justify-center gap-2 shrink-0">
          <Eye className="w-4 h-4" />
          VISTA PREVIA
          <Button variant="ghost" size="sm" onClick={exitImpersonation} className="h-6 text-black hover:bg-amber-600 gap-1 ml-2">
            <X className="w-3 h-3" />Salir
          </Button>
        </div>
      )}

      {/* Top header - compact */}
      <header className="h-12 flex items-center justify-between px-4 border-b border-border bg-card shrink-0">
        <div className="flex items-center gap-2">
          <span className="font-bold text-foreground">Tablio</span>
          <Badge variant="outline" className="text-[10px] border-primary text-primary">{seller?.zone || 'Vendedor'}</Badge>
        </div>
        <div className="flex items-center gap-2">
          <ThemeToggle />
          <span className="text-xs text-muted-foreground truncate max-w-[100px]">{seller?.name}</span>
          <button onClick={handleLogout} className="text-muted-foreground hover:text-foreground transition-colors">
            <LogOut className="w-4 h-4" />
          </button>
        </div>
      </header>

      {/* Content */}
      <main className="flex-1 overflow-auto pb-20">
        <Outlet />
      </main>

      {/* Bottom nav - mobile-first */}
      <nav className="fixed bottom-0 left-0 right-0 h-16 border-t border-border bg-card flex items-center justify-around z-50">
        {NAV_ITEMS.map(item => {
          const active = location.pathname === item.path;
          return (
            <button
              key={item.path}
              onClick={() => navigate(item.path)}
              className={`flex flex-col items-center gap-0.5 px-2 py-1 transition-colors ${
                active ? 'text-primary' : 'text-muted-foreground'
              }`}
            >
              <item.icon className={`w-5 h-5 ${active ? 'stroke-[2.5]' : ''}`} />
              <span className="text-[10px] font-medium">{item.label}</span>
            </button>
          );
        })}
      </nav>
    </div>
  );
}
