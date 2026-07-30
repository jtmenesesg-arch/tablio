import { useEffect, useState } from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { supabase } from '@/integrations/supabase/client';
import { AreaChart, Area, XAxis, YAxis, Tooltip, ResponsiveContainer, BarChart, Bar, CartesianGrid, Legend } from 'recharts';
import { DollarSign, TrendingUp, ArrowUpRight, ArrowDownRight } from 'lucide-react';

// Tablio pricing phases
const PILOT_THRESHOLD = 5;
const PILOT_PRICE = 199000;
const COMMERCIAL_PRICE = 299000;

const PLAN_LABELS: Record<string, string> = {
  'pilot': 'Piloto ($199k)',
  'trial': 'Trial',
  'active': 'Activo ($299k)',
  'paying': 'Pagando ($299k)',
};

interface Tenant {
  id: string;
  name: string;
  plan_status: string | null;
  created_at: string | null;
  plan_id: string | null;
  is_active: boolean | null;
}

interface Plan {
  id: string;
  name: string;
  display_name: string;
}

export default function FinanzasRevenuePage() {
  const [tenants, setTenants] = useState<Tenant[]>([]);
  const [plans, setPlans] = useState<Plan[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const load = async () => {
      const [tenantsRes, plansRes] = await Promise.all([
        supabase.from('tenants').select('id, name, plan_status, created_at, plan_id, is_active'),
        supabase.from('plans').select('id, name, display_name'),
      ]);
      setTenants((tenantsRes.data || []) as Tenant[]);
      setPlans((plansRes.data || []) as Plan[]);
      setLoading(false);
    };
    load();
  }, []);

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin h-6 w-6 border-2 border-primary border-t-transparent rounded-full" />
      </div>
    );
  }

  const getPlanLabel = (status: string | null) => PLAN_LABELS[status || 'trial'] || status || 'Trial';

  const getPrice = (t: Tenant, index: number) => {
    // Global: first 5 tenants at pilot price, rest at commercial
    return index < PILOT_THRESHOLD ? PILOT_PRICE : COMMERCIAL_PRICE;
  };

  const payingTenants = tenants.filter(t => t.plan_status === 'active' || t.plan_status === 'paying');
  const pilotTenants = tenants.filter(t => t.plan_status === 'trial' || t.plan_status === 'pilot');
  const churnedTenants = tenants.filter(t => t.is_active === false);

  // All active tenants sorted by creation for pricing
  const allActive = [...payingTenants, ...pilotTenants].sort((a, b) =>
    new Date(a.created_at || '').getTime() - new Date(b.created_at || '').getTime()
  );

  // MRR calculation with phase logic
  const mrr = allActive.reduce((sum, t, i) => {
    if (t.plan_status === 'active' || t.plan_status === 'paying') {
      return sum + getPrice(t, i);
    }
    return sum; // pilots/trial don't pay yet
  }, 0);
  const arr = mrr * 12;

  // Plan breakdown by phase
  const pilotCount = payingTenants.filter((_, i) => i < PILOT_THRESHOLD).length;
  const commercialCount = Math.max(0, payingTenants.length - PILOT_THRESHOLD);
  const planBreakdown = [
    { plan: `Piloto ($${PILOT_PRICE.toLocaleString('es-CL')})`, count: Math.min(pilotCount, PILOT_THRESHOLD), revenue: Math.min(pilotCount, PILOT_THRESHOLD) * PILOT_PRICE },
    { plan: `Comercial ($${COMMERCIAL_PRICE.toLocaleString('es-CL')})`, count: commercialCount, revenue: commercialCount * COMMERCIAL_PRICE },
  ].filter(p => p.count > 0);

  // Historical MRR
  const now = new Date();
  const monthlyData = Array.from({ length: 12 }, (_, i) => {
    const date = new Date(now.getFullYear(), now.getMonth() - 11 + i, 1);
    const monthStr = date.toLocaleDateString('es-CL', { month: 'short', year: '2-digit' });
    const activeAtDate = payingTenants.filter(t =>
      t.created_at && new Date(t.created_at) <= new Date(date.getFullYear(), date.getMonth() + 1, 0)
    );
    const mrrAtDate = activeAtDate.reduce((sum, t, idx) => sum + (idx < PILOT_THRESHOLD ? PILOT_PRICE : COMMERCIAL_PRICE), 0);
    return { month: monthStr, mrr: mrrAtDate };
  });

  // Revenue movements (simplified)
  const prevMonthMRR = monthlyData.length >= 2 ? monthlyData[monthlyData.length - 2].mrr : 0;
  const newRevenue = Math.max(0, mrr - prevMonthMRR);
  const mrrDelta = prevMonthMRR > 0 ? ((mrr - prevMonthMRR) / prevMonthMRR * 100) : 0;

  return (
    <div className="p-6 space-y-6 max-w-6xl">
      <h1 className="text-2xl font-bold text-foreground">Revenue</h1>

      {/* Top KPIs */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center justify-between">
              <p className="text-xs text-muted-foreground font-medium">MRR</p>
              <DollarSign className="w-4 h-4 text-primary" />
            </div>
            <p className="text-2xl font-bold text-foreground mt-1">${mrr.toLocaleString()}</p>
            <div className={`flex items-center gap-1 mt-1 text-xs ${mrrDelta >= 0 ? 'text-primary' : 'text-destructive'}`}>
              {mrrDelta >= 0 ? <ArrowUpRight className="w-3 h-3" /> : <ArrowDownRight className="w-3 h-3" />}
              {Math.abs(mrrDelta).toFixed(1)}% vs mes anterior
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center justify-between">
              <p className="text-xs text-muted-foreground font-medium">ARR</p>
              <TrendingUp className="w-4 h-4 text-primary" />
            </div>
            <p className="text-2xl font-bold text-foreground mt-1">${arr.toLocaleString()}</p>
            <p className="text-xs text-muted-foreground mt-1">Proyección anual</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <p className="text-xs text-muted-foreground font-medium">Clientes pagando</p>
            <p className="text-2xl font-bold text-foreground mt-1">{payingTenants.length}</p>
            <p className="text-xs text-muted-foreground mt-1">{pilotTenants.length} en piloto</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <p className="text-xs text-muted-foreground font-medium">Nuevo revenue</p>
            <p className="text-2xl font-bold text-primary mt-1">+${newRevenue.toLocaleString()}</p>
            <p className="text-xs text-muted-foreground mt-1">Este mes</p>
          </CardContent>
        </Card>
      </div>

      {/* MRR Chart */}
      <Card>
        <CardContent className="p-4">
          <h2 className="text-sm font-semibold text-foreground mb-4">MRR histórico (12 meses)</h2>
          <div className="h-64">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={monthlyData}>
                <defs>
                  <linearGradient id="mrrGrad" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="hsl(var(--primary))" stopOpacity={0.3} />
                    <stop offset="95%" stopColor="hsl(var(--primary))" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                <XAxis dataKey="month" tick={{ fontSize: 11, fill: 'hsl(var(--muted-foreground))' }} />
                <YAxis tick={{ fontSize: 11, fill: 'hsl(var(--muted-foreground))' }} tickFormatter={v => `$${v}`} />
                <Tooltip
                  contentStyle={{ background: 'hsl(var(--card))', border: '1px solid hsl(var(--border))', borderRadius: 8, fontSize: 12 }}
                  formatter={(v: number) => [`$${v.toLocaleString()}`, 'MRR']}
                />
                <Area type="monotone" dataKey="mrr" stroke="hsl(var(--primary))" fill="url(#mrrGrad)" strokeWidth={2} />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </CardContent>
      </Card>

      {/* Plan breakdown */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <Card>
          <CardContent className="p-4">
            <h2 className="text-sm font-semibold text-foreground mb-3">Desglose por plan</h2>
            <div className="space-y-3">
              {planBreakdown.map(pb => (
                <div key={pb.plan} className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <Badge variant="outline" className="text-xs">{pb.plan}</Badge>
                    <span className="text-sm text-muted-foreground">{pb.count} clientes</span>
                  </div>
                  <span className="text-sm font-semibold text-foreground">${pb.revenue.toLocaleString()}/mo</span>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <h2 className="text-sm font-semibold text-foreground mb-3">Revenue por plan</h2>
            <div className="h-48">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={planBreakdown}>
                  <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                  <XAxis dataKey="plan" tick={{ fontSize: 11, fill: 'hsl(var(--muted-foreground))' }} />
                  <YAxis tick={{ fontSize: 11, fill: 'hsl(var(--muted-foreground))' }} tickFormatter={v => `$${v}`} />
                  <Tooltip
                    contentStyle={{ background: 'hsl(var(--card))', border: '1px solid hsl(var(--border))', borderRadius: 8, fontSize: 12 }}
                    formatter={(v: number) => [`$${v.toLocaleString()}`, 'Revenue']}
                  />
                  <Bar dataKey="revenue" fill="hsl(var(--primary))" radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
