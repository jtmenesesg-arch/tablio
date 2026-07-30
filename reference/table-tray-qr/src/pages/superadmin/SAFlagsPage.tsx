import { useEffect, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Switch } from '@/components/ui/switch';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent } from '@/components/ui/card';
import { useToast } from '@/hooks/use-toast';
import { Loader2, Info } from 'lucide-react';

interface Flag {
  key: string;
  label: string;
  description: string;
  enabled: boolean;
  fromDb: boolean;
  upcoming?: boolean;
}

const FLAG_DEFS: { key: string; label: string; desc: string; upcoming?: boolean }[] = [
  { key: 'kds_enabled', label: 'KDS de cocina', desc: 'Habilita la pantalla de cocina para gestión de pedidos' },
  { key: 'bill_request_enabled', label: 'Solicitud de cuenta', desc: 'Permite a los clientes solicitar la cuenta desde la app' },
  { key: 'waiter_call_enabled', label: 'Llamar al mozo', desc: 'Permite a los clientes llamar al mozo desde la app' },
  { key: 'modifiers_enabled', label: 'Modificadores de platos', desc: 'Habilita opciones de personalización en los platos' },
  { key: 'loyalty_enabled', label: 'Programa de fidelidad', desc: 'Sistema de puntos y recompensas', upcoming: true },
  { key: 'multi_branch_enabled', label: 'Multi sucursal', desc: 'Soporte para múltiples sucursales por tenant', upcoming: true },
];

export default function SAFlagsPage() {
  const { toast } = useToast();
  const [flags, setFlags] = useState<Flag[]>([]);
  const [loading, setLoading] = useState(true);
  const [tableExists, setTableExists] = useState(true);

  useEffect(() => {
    const load = async () => {
      const { data, error } = await supabase.from('feature_flags').select('key, default_enabled, description');

      if (error) {
        setTableExists(false);
        setFlags(FLAG_DEFS.map(f => ({ key: f.key, label: f.label, description: f.desc, enabled: false, fromDb: false, upcoming: f.upcoming })));
        setLoading(false);
        return;
      }

      const dbMap: Record<string, boolean> = {};
      data?.forEach(d => { dbMap[d.key] = d.default_enabled ?? false; });

      setFlags(FLAG_DEFS.map(f => ({
        key: f.key,
        label: f.label,
        description: f.desc,
        enabled: dbMap[f.key] ?? false,
        fromDb: f.key in dbMap,
        upcoming: f.upcoming,
      })));
      setLoading(false);
    };
    load();
  }, []);

  const toggleFlag = async (key: string) => {
    const flag = flags.find(f => f.key === key);
    if (!flag || flag.upcoming) return;

    const newVal = !flag.enabled;

    if (flag.fromDb) {
      await supabase.from('feature_flags').update({ default_enabled: newVal }).eq('key', key);
    } else {
      await supabase.from('feature_flags').insert({ key, default_enabled: newVal, description: flag.description });
    }

    setFlags(prev => prev.map(f => f.key === key ? { ...f, enabled: newVal, fromDb: true } : f));
    toast({ title: `${flag.label} ${newVal ? 'activado' : 'desactivado'}` });
  };

  if (loading) return <div className="flex items-center justify-center h-64"><Loader2 className="w-6 h-6 animate-spin text-muted-foreground" /></div>;

  return (
    <div className="p-6 space-y-6">
      <h1 className="text-xl font-bold text-foreground">Feature Flags</h1>

      {!tableExists && (
        <div className="flex items-center gap-2 bg-amber-50 border border-amber-200 rounded-lg p-3 text-amber-800 text-sm">
          <Info className="w-4 h-4 shrink-0" />
          <span>Los flags se muestran en modo local. Configura la tabla feature_flags para persistirlos.</span>
        </div>
      )}

      <Card>
        <CardContent className="p-0 divide-y divide-border">
          {flags.map(f => (
            <div key={f.key} className="flex items-center justify-between px-4 py-4">
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <span className="font-medium text-sm text-foreground">{f.label}</span>
                  {f.upcoming && <Badge variant="secondary" className="text-[10px]">Próximamente</Badge>}
                </div>
                <p className="text-xs text-muted-foreground mt-0.5">{f.description}</p>
                <p className="text-[10px] text-muted-foreground font-mono mt-0.5">{f.key}</p>
              </div>
              <Switch
                checked={f.enabled}
                onCheckedChange={() => toggleFlag(f.key)}
                disabled={!!f.upcoming}
              />
            </div>
          ))}
        </CardContent>
      </Card>

      <p className="text-xs text-muted-foreground">Los flags por tenant estarán disponibles en v2.</p>
    </div>
  );
}
