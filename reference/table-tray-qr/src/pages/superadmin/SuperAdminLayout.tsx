import { Outlet, useNavigate, useLocation } from 'react-router-dom';
import { Building2, BarChart2, ToggleLeft, Settings, LogIn, Users, LogOut } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { useIsMobile } from '@/hooks/use-mobile';
import { useSuperAdmin } from '@/contexts/SuperAdminContext';
import { supabase } from '@/integrations/supabase/client';
import { useState } from 'react';
import ThemeToggle from '@/components/ThemeToggle';
import GlobalSearch from '@/components/GlobalSearch';

const NAV_ITEMS = [
  { path: '/superadmin/tenants', icon: Building2, label: 'Tenants' },
  { path: '/superadmin/equipo', icon: Users, label: 'Equipo' },
  { path: '/superadmin/metricas', icon: BarChart2, label: 'Métricas' },
  { path: '/superadmin/flags', icon: ToggleLeft, label: 'Flags' },
  { path: '/superadmin/config', icon: Settings, label: 'Config' },
];

function SuperAdminLogin() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError('');
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    if (error) setError(error.message);
    setLoading(false);
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-background px-4">
      <form onSubmit={handleLogin} className="w-full max-w-sm space-y-4">
        <div className="text-center mb-6">
          <Badge className="bg-secondary text-secondary-foreground mb-2">SuperAdmin</Badge>
          <h1 className="text-xl font-bold text-foreground">Acceso restringido</h1>
        </div>
        <Input placeholder="Email" type="email" value={email} onChange={e => setEmail(e.target.value)} required />
        <Input placeholder="Contraseña" type="password" value={password} onChange={e => setPassword(e.target.value)} required />
        {error && <p className="text-destructive text-sm">{error}</p>}
        <Button type="submit" className="w-full gap-2" disabled={loading}>
          <LogIn className="w-4 h-4" />
          {loading ? 'Ingresando...' : 'Ingresar'}
        </Button>
      </form>
    </div>
  );
}

export default function SuperAdminLayout() {
  const navigate = useNavigate();
  const location = useLocation();
  const isMobile = useIsMobile();
  const { isPlatformAdmin, isLoading, impersonating, setImpersonating } = useSuperAdmin();

  const handleLogout = async () => {
    await supabase.auth.signOut();
    navigate('/superadmin');
  };

  if (isLoading) {
    return (
      <div className="flex h-screen items-center justify-center bg-background">
        <div className="animate-spin h-8 w-8 border-4 border-primary border-t-transparent rounded-full" />
      </div>
    );
  }

  if (!isPlatformAdmin) {
    return <SuperAdminLogin />;
  }

  return (
    <div className="min-h-screen bg-background flex">
      {!isMobile && (
        <aside className="w-56 border-r border-border bg-card flex flex-col shrink-0">
          <div className="h-14 flex items-center gap-2 px-4 border-b border-border">
            <span className="font-bold text-foreground text-sm">Tablio</span>
            <Badge className="bg-secondary text-secondary-foreground text-[10px]">Founder</Badge>
          </div>
          <nav className="flex-1 p-2 space-y-1">
            {NAV_ITEMS.map(item => {
              const active = location.pathname.startsWith(item.path);
              return (
                <button
                  key={item.path}
                  onClick={() => navigate(item.path)}
                  className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm transition-colors ${
                    active ? 'bg-primary/10 text-primary font-medium' : 'text-muted-foreground hover:bg-muted'
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
              className="w-full flex items-center gap-3 px-3 py-2 rounded-lg text-sm text-muted-foreground hover:bg-muted transition-colors"
            >
              <LogOut className="w-4 h-4" />
              Cerrar sesión
            </button>
          </div>
        </aside>
      )}

      <div className="flex-1 flex flex-col min-w-0">
        <header className="h-12 flex items-center justify-between px-4 border-b border-border bg-card">
          <div className="flex items-center gap-2">
            {isMobile && <span className="font-bold text-foreground text-sm">Tablio</span>}
            <GlobalSearch />
          </div>
          <div className="flex items-center gap-2">
            {impersonating && (
              <Button variant="outline" size="sm" onClick={() => setImpersonating(null)} className="text-xs gap-1">
                Dejar de impersonar
              </Button>
            )}
            {isMobile && <ThemeToggle />}
            {isMobile && (
              <button onClick={handleLogout} className="text-muted-foreground">
                <LogOut className="w-4 h-4" />
              </button>
            )}
          </div>
        </header>

        <main className="flex-1 overflow-auto">
          <Outlet />
        </main>

        {isMobile && (
          <nav className="h-16 border-t border-border bg-card flex items-center justify-around shrink-0">
            {NAV_ITEMS.map(item => {
              const active = location.pathname.startsWith(item.path);
              return (
                <button
                  key={item.path}
                  onClick={() => navigate(item.path)}
                  className={`flex flex-col items-center gap-0.5 px-3 py-1 ${active ? 'text-primary' : 'text-muted-foreground'}`}
                >
                  <item.icon className="w-5 h-5" />
                  <span className="text-[10px] font-medium">{item.label}</span>
                </button>
              );
            })}
          </nav>
        )}
      </div>
    </div>
  );
}
