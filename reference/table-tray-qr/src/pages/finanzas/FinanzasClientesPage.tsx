import { useEffect, useState } from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { supabase } from '@/integrations/supabase/client';
import { exportToCSV } from '@/lib/export-utils';
import { Download, Calendar, AlertTriangle } from 'lucide-react';
import { format, addDays } from 'date-fns';
import { es } from 'date-fns/locale';

const PILOT_THRESHOLD = 5;
const PILOT_PRICE = 199000;
const COMMERCIAL_PRICE = 299000;

interface Tenant {
  id: string;
  name: string;
  plan_status: string | null;
  created_at: string | null;
  plan_id: string | null;
  is_active: boolean | null;
  trial_ends_at: string | null;
  email: string;
}

interface Plan {
  id: string;
  name: string;
  display_name: string;
}

export default function FinanzasClientesPage() {
  const [tenants, setTenants] = useState<Tenant[]>([]);
  const [plans, setPlans] = useState<Plan[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const load = async () => {
      const [t, p] = await Promise.all([
        supabase.from('tenants').select('id, name, plan_status, created_at, plan_id, is_active, trial_ends_at, email'),
        supabase.from('plans').select('id, name, display_name'),
      ]);
      setTenants((t.data || []) as Tenant[]);
      setPlans((p.data || []) as Plan[]);
      setLoading(false);
    };
    load();
  }, []);

  if (loading) {
    return <div className="flex items-center justify-center h-64"><div className="animate-spin h-6 w-6 border-2 border-primary border-t-transparent rounded-full" /></div>;
  }

  const getPrice = (index: number) => index < PILOT_THRESHOLD ? PILOT_PRICE : COMMERCIAL_PRICE;
  const getPlanLabel = (status: string | null) => {
    if (status === 'active' || status === 'paying') return 'Pagando';
    if (status === 'pilot') return 'Piloto';
    return 'Trial';
  };

  const paying = tenants.filter(t => t.plan_status === 'active' || t.plan_status === 'paying')
    .sort((a, b) => new Date(a.created_at || '').getTime() - new Date(b.created_at || '').getTime());
  const pilots = tenants.filter(t => t.plan_status === 'trial' || t.plan_status === 'pilot');

  // MRR with phase pricing
  const currentMRR = paying.reduce((s, _, i) => s + getPrice(i), 0);
  const expectedConversions = pilots.length;
  const nextPrice = paying.length >= PILOT_THRESHOLD ? COMMERCIAL_PRICE : PILOT_PRICE;
  const proj30 = currentMRR + Math.round(expectedConversions * 0.3 * nextPrice);
  const proj60 = currentMRR + Math.round(expectedConversions * 0.5 * nextPrice);
  const proj90 = currentMRR + Math.round(expectedConversions * 0.7 * nextPrice);

  const handleExport = (data: any[], name: string) => {
    exportToCSV(data.map((t, i) => ({
      Nombre: t.name,
      Email: t.email,
      Estado: getPlanLabel(t.plan_status),
      'Monto CLP': getPrice(i).toLocaleString('es-CL'),
      'Fecha inicio': t.created_at ? format(new Date(t.created_at), 'dd/MM/yyyy') : '',
    })), name);
  };

  return (
    <div className="p-6 space-y-6 max-w-6xl">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-foreground">Clientes y Cobros</h1>
      </div>

      {/* Projections */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {[
          { label: '30 días', value: proj30 },
          { label: '60 días', value: proj60 },
          { label: '90 días', value: proj90 },
        ].map(p => (
          <Card key={p.label}>
            <CardContent className="p-4">
              <p className="text-xs text-muted-foreground font-medium">Proyección {p.label}</p>
              <p className="text-xl font-bold text-foreground mt-1">${p.value.toLocaleString()}/mo</p>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Paying clients */}
      <Card>
        <CardContent className="p-4">
          <div className="flex items-center justify-between mb-3">
            <h2 className="text-sm font-semibold text-foreground">Clientes pagando ({paying.length})</h2>
            <Button variant="outline" size="sm" onClick={() => handleExport(paying, 'clientes_pagando')}>
              <Download className="w-3 h-3 mr-1" /> CSV
            </Button>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border text-left">
                  <th className="pb-2 font-medium text-muted-foreground">Restaurante</th>
                  <th className="pb-2 font-medium text-muted-foreground">Plan</th>
                  <th className="pb-2 font-medium text-muted-foreground">Monto</th>
                  <th className="pb-2 font-medium text-muted-foreground">Desde</th>
                </tr>
              </thead>
              <tbody>
                {paying.map((t, i) => {
                  const price = getPrice(i);
                  return (
                    <tr key={t.id} className="border-b border-border/50">
                      <td className="py-2 text-foreground font-medium">{t.name}</td>
                      <td className="py-2"><Badge variant="outline" className="text-xs">{i < PILOT_THRESHOLD ? 'Piloto' : 'Comercial'}</Badge></td>
                      <td className="py-2 text-foreground">${price.toLocaleString('es-CL')}</td>
                      <td className="py-2 text-muted-foreground">
                        {t.created_at ? format(new Date(t.created_at), 'd MMM yyyy', { locale: es }) : '—'}
                      </td>
                    </tr>
                  );
                })}
                {paying.length === 0 && (
                  <tr><td colSpan={4} className="py-6 text-center text-muted-foreground">Sin clientes pagando</td></tr>
                )}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>

      {/* Pilot clients */}
      <Card>
        <CardContent className="p-4">
          <div className="flex items-center justify-between mb-3">
            <h2 className="text-sm font-semibold text-foreground">En piloto ({pilots.length})</h2>
            <Button variant="outline" size="sm" onClick={() => handleExport(pilots, 'clientes_piloto')}>
              <Download className="w-3 h-3 mr-1" /> CSV
            </Button>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border text-left">
                  <th className="pb-2 font-medium text-muted-foreground">Restaurante</th>
                  <th className="pb-2 font-medium text-muted-foreground">Plan</th>
                  <th className="pb-2 font-medium text-muted-foreground">Fin del piloto</th>
                  <th className="pb-2 font-medium text-muted-foreground">Estado</th>
                </tr>
              </thead>
              <tbody>
                {pilots.map(t => {
                  const trialEnd = t.trial_ends_at ? new Date(t.trial_ends_at) : null;
                  const isExpiring = trialEnd && trialEnd.getTime() - Date.now() < 7 * 24 * 60 * 60 * 1000;
                  return (
                    <tr key={t.id} className="border-b border-border/50">
                      <td className="py-2 text-foreground font-medium">{t.name}</td>
                      <td className="py-2"><Badge variant="outline" className="text-xs">Piloto</Badge></td>
                      <td className="py-2 text-muted-foreground">
                        {trialEnd ? format(trialEnd, 'd MMM yyyy', { locale: es }) : '—'}
                      </td>
                      <td className="py-2">
                        {isExpiring ? (
                          <Badge variant="outline" className="text-xs border-destructive/50 text-destructive">
                            <AlertTriangle className="w-3 h-3 mr-1" /> Por vencer
                          </Badge>
                        ) : (
                          <Badge variant="outline" className="text-xs">Activo</Badge>
                        )}
                      </td>
                    </tr>
                  );
                })}
                {pilots.length === 0 && (
                  <tr><td colSpan={4} className="py-6 text-center text-muted-foreground">Sin pilotos activos</td></tr>
                )}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
