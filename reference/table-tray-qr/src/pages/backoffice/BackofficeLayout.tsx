import { Outlet, useNavigate, useLocation } from 'react-router-dom';
import { LayoutDashboard, Users, Kanban, LogOut } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { useIsMobile } from '@/hooks/use-mobile';
import { useSuperAdmin } from '@/contexts/SuperAdminContext';
import { supabase } from '@/integrations/supabase/client';
import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { LogIn } from 'lucide-react';
import ThemeToggle from '@/components/ThemeToggle';
import GlobalSearch from '@/components/GlobalSearch';

const NAV_ITEMS = [
  { path: '/backoffice/dashboard', icon: LayoutDashboard, label: 'Dashboard' },
  { path: '/backoffice/vendedores', icon: Users, label: 'Vendedores' },
  { path: '/backoffice/pipeline', icon: Kanban, label: 'Pipeline' },
];

function BackofficeLogin() {
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
          <h1 className="text-2xl font-bold text-foreground tracking-tight">Tablio</h1>
          <Badge className="bg-primary text-primary-foreground mt-1">Backoffice</Badge>
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

export default function BackofficeLayout() {
  const navigate = useNavigate();
  const location = useLocation();
  const isMobile = useIsMobile();
  const { isPlatformAdmin, isLoading } = useSuperAdmin();

  const handleLogout = async () => {
    await supabase.auth.signOut();
    navigate('/backoffice');
  };

  if (isLoading) {
    return (
      <div className="flex h-screen items-center justify-center bg-background">
        <div className="animate-spin h-8 w-8 border-4 border-primary border-t-transparent rounded-full" />
      </div>
    );
  }

  if (!isPlatformAdmin) {
    return <BackofficeLogin />;
  }

  return (
    <div className="min-h-screen bg-background flex">
      {!isMobile && (
        <aside className="w-60 border-r border-border bg-card flex flex-col shrink-0">
          <div className="h-14 flex items-center gap-2 px-5 border-b border-border">
            <span className="font-bold text-foreground text-lg tracking-tight">Tablio</span>
            <Badge className="bg-primary text-primary-foreground text-[10px]">CRM</Badge>
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
      )}

      <div className="flex-1 flex flex-col min-w-0">
        <header className="h-12 flex items-center justify-between px-4 border-b border-border bg-card">
          <div className="flex items-center gap-2">
            {isMobile && (
              <>
                <span className="font-bold text-foreground">Tablio</span>
                <Badge className="bg-primary text-primary-foreground text-[10px]">CRM</Badge>
              </>
            )}
            <GlobalSearch />
          </div>
          <div className="flex items-center gap-2">
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
