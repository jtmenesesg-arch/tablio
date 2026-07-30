import { useState, useEffect, useRef } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Search, X, Building2, Users, MapPin, UserCircle } from 'lucide-react';
import { useNavigate } from 'react-router-dom';

interface SearchResult {
  type: 'tenant' | 'lead' | 'member';
  id: string;
  title: string;
  subtitle: string;
  badge?: string;
}

export default function GlobalSearch() {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<SearchResult[]>([]);
  const [loading, setLoading] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const navigate = useNavigate();

  // Keyboard shortcut Cmd/Ctrl+K
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
        e.preventDefault();
        setOpen(true);
        setTimeout(() => inputRef.current?.focus(), 100);
      }
      if (e.key === 'Escape') setOpen(false);
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, []);

  useEffect(() => {
    if (query.length < 2) { setResults([]); return; }
    const timer = setTimeout(async () => {
      setLoading(true);
      const q = query.toLowerCase();
      const [tenantsRes, leadsRes, membersRes] = await Promise.all([
        supabase.from('tenants').select('id, name, slug, plan_status').ilike('name', `%${q}%`).limit(5),
        supabase.from('leads').select('id, restaurant_name, stage, zone').ilike('restaurant_name', `%${q}%`).limit(5),
        supabase.from('backoffice_members').select('id, name, role, zone').ilike('name', `%${q}%`).limit(5),
      ]);
      const r: SearchResult[] = [
        ...(tenantsRes.data || []).map((t: any) => ({
          type: 'tenant' as const, id: t.id,
          title: t.name, subtitle: t.slug,
          badge: t.plan_status,
        })),
        ...(leadsRes.data || []).map((l: any) => ({
          type: 'lead' as const, id: l.id,
          title: l.restaurant_name, subtitle: `${l.stage} · ${l.zone || ''}`,
          badge: l.stage,
        })),
        ...(membersRes.data || []).map((m: any) => ({
          type: 'member' as const, id: m.id,
          title: m.name, subtitle: `${m.role} · ${m.zone || ''}`,
          badge: m.role,
        })),
      ];
      setResults(r);
      setLoading(false);
    }, 300);
    return () => clearTimeout(timer);
  }, [query]);

  const handleSelect = (r: SearchResult) => {
    setOpen(false);
    setQuery('');
    if (r.type === 'tenant') navigate('/superadmin/tenants');
    else if (r.type === 'lead') navigate('/backoffice/pipeline');
    else if (r.type === 'member') navigate('/backoffice/vendedores');
  };

  const icons = { tenant: Building2, lead: MapPin, member: UserCircle };

  if (!open) {
    return (
      <button
        onClick={() => { setOpen(true); setTimeout(() => inputRef.current?.focus(), 100); }}
        className="flex items-center gap-2 px-3 py-1.5 rounded-lg border border-border bg-muted/50 text-muted-foreground text-sm hover:bg-muted transition-colors"
      >
        <Search className="w-3.5 h-3.5" />
        <span className="hidden md:inline">Buscar...</span>
        <kbd className="hidden md:inline text-[10px] bg-background px-1.5 py-0.5 rounded border border-border font-mono">⌘K</kbd>
      </button>
    );
  }

  return (
    <div className="fixed inset-0 z-[100] flex items-start justify-center pt-[15vh]" onClick={() => setOpen(false)}>
      <div className="fixed inset-0 bg-black/50" />
      <div
        className="relative w-full max-w-lg bg-card border border-border rounded-xl shadow-2xl overflow-hidden"
        onClick={e => e.stopPropagation()}
      >
        <div className="flex items-center gap-2 px-4 border-b border-border">
          <Search className="w-4 h-4 text-muted-foreground shrink-0" />
          <Input
            ref={inputRef}
            value={query}
            onChange={e => setQuery(e.target.value)}
            placeholder="Buscar clientes, leads, equipo, zonas..."
            className="border-0 focus-visible:ring-0 text-sm h-12"
          />
          <button onClick={() => setOpen(false)} className="text-muted-foreground hover:text-foreground">
            <X className="w-4 h-4" />
          </button>
        </div>
        {results.length > 0 && (
          <div className="max-h-80 overflow-y-auto p-2">
            {results.map(r => {
              const Icon = icons[r.type];
              return (
                <button
                  key={`${r.type}-${r.id}`}
                  onClick={() => handleSelect(r)}
                  className="w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-left hover:bg-muted transition-colors"
                >
                  <Icon className="w-4 h-4 text-muted-foreground shrink-0" />
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-foreground truncate">{r.title}</p>
                    <p className="text-xs text-muted-foreground truncate">{r.subtitle}</p>
                  </div>
                  {r.badge && <Badge variant="outline" className="text-[10px] shrink-0">{r.badge}</Badge>}
                </button>
              );
            })}
          </div>
        )}
        {query.length >= 2 && results.length === 0 && !loading && (
          <div className="p-6 text-center text-sm text-muted-foreground">Sin resultados para "{query}"</div>
        )}
        {loading && (
          <div className="p-4 text-center text-sm text-muted-foreground">Buscando...</div>
        )}
      </div>
    </div>
  );
}
