import { useEffect, useState } from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { supabase } from '@/integrations/supabase/client';
import { exportToCSV } from '@/lib/export-utils';
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid } from 'recharts';
import { Download, TrendingDown, Users, DollarSign } from 'lucide-react';
import { format, subMonths, startOfMonth, endOfMonth } from 'date-fns';
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
}

interface Plan { id: string; name: string; display_name: string; }

export default function FinanzasChurnPage() {
  const [tenants, setTenants] = useState<Tenant[]>([]);
  const [plans, setPlans] = useState<Plan[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const load = async () => {
      const [t, p] = await Promise.all([
        supabase.from('tenants').select('id, name, plan_status, created_at, plan_id, is_active'),
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
  const getPlanDisplay = (status: string | null) => {
    if (status === 'active' || status === 'paying') return 'Pagando';
    if (status === 'pilot') return 'Piloto';
    return 'Trial';
  };

  const paying = tenants.filter(t => (t.plan_status === 'active' || t.plan_status === 'paying') && t.is_active !== false)
    .sort((a, b) => new Date(a.created_at || '').getTime() - new Date(b.created_at || '').getTime());
  const churned = tenants.filter(t => t.is_active === false);

  // Churn rate
  const totalEver = paying.length + churned.length;
  const churnRate = totalEver > 0 ? ((churned.length / totalEver) * 100) : 0;

  // Revenue churned (assume avg commercial price for churned)
  const churnedRevenue = churned.length * COMMERCIAL_PRICE;
  const currentMRR = paying.reduce((s, _, i) => s + getPrice(i), 0);

  // NRR
  const nrr = currentMRR > 0 ? Math.round(((currentMRR) / (currentMRR + churnedRevenue)) * 100) : 100;

  // Cohort data (simplified by month)
  const now = new Date();
  const cohortData = Array.from({ length: 6 }, (_, i) => {
    const monthDate = subMonths(now, 5 - i);
    const monthStart = startOfMonth(monthDate);
    const monthEnd = endOfMonth(monthDate);
    const label = format(monthDate, 'MMM yy', { locale: es });

    const createdInMonth = tenants.filter(t =>
      t.created_at && new Date(t.created_at) >= monthStart && new Date(t.created_at) <= monthEnd
    );
    const stillActive = createdInMonth.filter(t => t.is_active !== false).length;
    const total = createdInMonth.length;

    return {
      month: label,
      total,
      activos: stillActive,
      churned: total - stillActive,
      retention: total > 0 ? Math.round((stillActive / total) * 100) : 0,
    };
  });

  return (
    <div className="p-6 space-y-6 max-w-6xl">
      <h1 className="text-2xl font-bold text-foreground">Churn y Retención</h1>

      {/* KPIs */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center justify-between">
              <p className="text-xs text-muted-foreground font-medium">Churn rate</p>
              <TrendingDown className="w-4 h-4 text-destructive" />
            </div>
            <p className="text-2xl font-bold text-foreground mt-1">{churnRate.toFixed(1)}%</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <p className="text-xs text-muted-foreground font-medium">Clientes perdidos</p>
            <p className="text-2xl font-bold text-foreground mt-1">{churned.length}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <p className="text-xs text-muted-foreground font-medium">Revenue perdido</p>
            <p className="text-2xl font-bold text-destructive mt-1">${churnedRevenue.toLocaleString()}/mo</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center justify-between">
              <p className="text-xs text-muted-foreground font-medium">NRR</p>
              <DollarSign className="w-4 h-4 text-primary" />
            </div>
            <p className={`text-2xl font-bold mt-1 ${nrr >= 100 ? 'text-primary' : 'text-destructive'}`}>{nrr}%</p>
          </CardContent>
        </Card>
      </div>

      {/* Cohort chart */}
      <Card>
        <CardContent className="p-4">
          <h2 className="text-sm font-semibold text-foreground mb-4">Retención por cohorte (6 meses)</h2>
          <div className="h-56">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={cohortData}>
                <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                <XAxis dataKey="month" tick={{ fontSize: 11, fill: 'hsl(var(--muted-foreground))' }} />
                <YAxis tick={{ fontSize: 11, fill: 'hsl(var(--muted-foreground))' }} />
                <Tooltip
                  contentStyle={{ background: 'hsl(var(--card))', border: '1px solid hsl(var(--border))', borderRadius: 8, fontSize: 12 }}
                />
                <Bar dataKey="activos" name="Activos" fill="hsl(var(--primary))" radius={[4, 4, 0, 0]} />
                <Bar dataKey="churned" name="Churned" fill="hsl(var(--destructive))" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </CardContent>
      </Card>

      {/* Churned clients table */}
      <Card>
        <CardContent className="p-4">
          <div className="flex items-center justify-between mb-3">
            <h2 className="text-sm font-semibold text-foreground">Clientes churneados ({churned.length})</h2>
            <Button variant="outline" size="sm" onClick={() => exportToCSV(
              churned.map(t => ({ Nombre: t.name, Plan: getPlanDisplay(t.plan_id), Inicio: t.created_at || '' })),
              'clientes_churneados'
            )}>
              <Download className="w-3 h-3 mr-1" /> CSV
            </Button>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border text-left">
                  <th className="pb-2 font-medium text-muted-foreground">Restaurante</th>
                  <th className="pb-2 font-medium text-muted-foreground">Plan</th>
                  <th className="pb-2 font-medium text-muted-foreground">Revenue perdido</th>
                  <th className="pb-2 font-medium text-muted-foreground">Inicio</th>
                </tr>
              </thead>
              <tbody>
                {churned.map(t => (
                  <tr key={t.id} className="border-b border-border/50">
                    <td className="py-2 text-foreground font-medium">{t.name}</td>
                    <td className="py-2"><Badge variant="outline" className="text-xs">{getPlanDisplay(t.plan_status)}</Badge></td>
                    <td className="py-2 text-destructive">${COMMERCIAL_PRICE.toLocaleString('es-CL')}</td>
                    <td className="py-2 text-muted-foreground">
                      {t.created_at ? format(new Date(t.created_at), 'd MMM yyyy', { locale: es }) : '—'}
                    </td>
                  </tr>
                ))}
                {churned.length === 0 && (
                  <tr><td colSpan={4} className="py-6 text-center text-muted-foreground">Sin churn registrado 🎉</td></tr>
                )}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
