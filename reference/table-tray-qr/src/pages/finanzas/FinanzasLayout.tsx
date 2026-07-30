import { Outlet, useNavigate, useLocation } from 'react-router-dom';
import { DollarSign, Users, TrendingDown, PieChart, LogOut } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { supabase } from '@/integrations/supabase/client';
import { useState, useEffect } from 'react';
import ThemeToggle from '@/components/ThemeToggle';

const NAV_ITEMS = [
  { path: '/finanzas/revenue', icon: DollarSign, label: 'Revenue' },
  { path: '/finanzas/clientes', icon: Users, label: 'Clientes' },
  { path: '/finanzas/churn', icon: TrendingDown, label: 'Churn' },
  { path: '/finanzas/costos', icon: PieChart, label: 'Costos' },
];

export default function FinanzasLayout() {
  const navigate = useNavigate();
  const location = useLocation();
  const [authorized, setAuthorized] = useState(false);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    const check = async () => {
      try {
        const { data: { session } } = await supabase.auth.getSession();
        if (!session) {
          setIsLoading(false);
          navigate('/login', { replace: true });
          return;
        }
        // Allow platform admins or backoffice members with role 'finanzas' or 'jefe_ventas'
        const [adminRes, memberRes] = await Promise.all([
          supabase.from('platform_admins').select('id').eq('user_id', session.user.id).maybeSingle(),
          supabase.from('backoffice_members').select('id, role').eq('user_id', session.user.id).eq('is_active', true).maybeSingle(),
        ]);
        const isAdmin = !!adminRes.data;
        const member = memberRes.data as any;
        const allowedRoles = ['finanzas', 'jefe_ventas', 'superadmin'];
        const auth = isAdmin || (member && allowedRoles.includes(member.role));
        setAuthorized(auth);
        if (!auth) {
          navigate('/login', { replace: true });
        }
        setIsLoading(false);
      } catch (err) {
        console.error('FinanzasLayout: auth check error', err);
        setIsLoading(false);
        navigate('/login', { replace: true });
      }
    };
    check();
    const { data: { subscription } } = supabase.auth.onAuthStateChange(() => check());
    return () => subscription.unsubscribe();
  }, [navigate]);

  const handleLogout = async () => {
    await supabase.auth.signOut();
    navigate('/login');
  };

  if (isLoading) {
    return (
      <div className="flex h-screen items-center justify-center bg-background">
        <div className="animate-spin h-8 w-8 border-4 border-primary border-t-transparent rounded-full" />
      </div>
    );
  }

  if (!authorized) return null;

  return (
    <div className="min-h-screen bg-background flex">
      <aside className="w-56 border-r border-border bg-card flex flex-col shrink-0">
        <div className="h-14 flex items-center gap-2 px-5 border-b border-border">
          <span className="font-bold text-foreground text-lg tracking-tight">Tablio</span>
          <Badge className="bg-secondary text-secondary-foreground text-[10px]">Finanzas</Badge>
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
        <div className="p-3 border-t border-border space-y-1">
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
      <div className="flex-1 flex flex-col min-w-0">
        <main className="flex-1 overflow-auto">
          <Outlet />
        </main>
      </div>
    </div>
  );
}
