import { useEffect, useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import { supabase } from '@/integrations/supabase/client';
import { DollarSign, Users, TrendingUp, Target, BarChart3, AlertTriangle } from 'lucide-react';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, PieChart, Pie, Cell, FunnelChart, Funnel, LabelList } from 'recharts';

const STAGE_ORDER = ['contactado', 'demo_agendada', 'demo_hecha', 'piloto_activo', 'cliente_pagando', 'frio'];
const STAGE_LABELS: Record<string, string> = {
  contactado: 'Contactado',
  demo_agendada: 'Demo agendada',
  demo_hecha: 'Demo hecha',
  piloto_activo: 'Piloto activo',
  cliente_pagando: 'Pagando',
  frio: 'Frío',
};
const STAGE_COLORS = ['hsl(16,80%,51%)', 'hsl(30,90%,55%)', 'hsl(45,90%,50%)', 'hsl(200,70%,50%)', 'hsl(145,60%,42%)', 'hsl(220,15%,60%)'];

const ZONE_COLORS = ['hsl(16,80%,51%)', 'hsl(200,70%,50%)', 'hsl(145,60%,42%)', 'hsl(45,90%,50%)', 'hsl(280,60%,55%)'];

interface Lead {
  id: string;
  stage: string;
  zone: string | null;
  monthly_value: number | null;
  assigned_seller_id: string | null;
  next_action_date: string | null;
  updated_at: string | null;
  restaurant_name: string;
}

interface Seller {
  id: string;
  name: string;
}

export default function BackofficeDashboard() {
  const [leads, setLeads] = useState<Lead[]>([]);
  const [sellers, setSellers] = useState<Seller[]>([]);
  const [tenants, setTenants] = useState<{ id: string; plan_status: string | null; created_at: string | null }[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const load = async () => {
      const [leadsRes, sellersRes, tenantsRes] = await Promise.all([
        supabase.from('leads').select('*'),
        supabase.from('backoffice_members').select('id, name').eq('role', 'vendedor'),
        supabase.from('tenants').select('id, plan_status, created_at'),
      ]);
      setLeads((leadsRes.data as Lead[]) || []);
      setSellers((sellersRes.data as Seller[]) || []);
      setTenants(tenantsRes.data || []);
      setLoading(false);
    };
    load();
  }, []);

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin h-8 w-8 border-4 border-primary border-t-transparent rounded-full" />
      </div>
    );
  }

  const paying = leads.filter(l => l.stage === 'cliente_pagando');
  const pilots = leads.filter(l => l.stage === 'piloto_activo');
  const mrr = paying.reduce((sum, l) => sum + (l.monthly_value || 0), 0);
  const arr = mrr * 12;
  const goalMRR = 10166;
  const goalClients = 34;
  const mrrProgress = Math.min(100, (mrr / goalMRR) * 100);

  // Stale leads: no update in 7+ days
  const now = new Date();
  const staleLeads = leads.filter(l => {
    if (l.stage === 'cliente_pagando' || l.stage === 'frio') return false;
    if (!l.updated_at) return true;
    const diff = (now.getTime() - new Date(l.updated_at).getTime()) / (1000 * 60 * 60 * 24);
    return diff > 7;
  });

  // Churn
  const churned = tenants.filter(t => t.plan_status === 'churned').length;
  const totalEver = tenants.length;
  const churnRate = totalEver > 0 ? ((churned / totalEver) * 100).toFixed(1) : '0';

  // Pipeline funnel data
  const funnelData = STAGE_ORDER.filter(s => s !== 'frio').map((stage, i) => ({
    name: STAGE_LABELS[stage],
    value: leads.filter(l => l.stage === stage).length,
    fill: STAGE_COLORS[i],
  }));

  // Zone distribution
  const zones = [...new Set(leads.map(l => l.zone).filter(Boolean))];
  const zoneData = zones.map((z, i) => ({
    name: z,
    value: leads.filter(l => l.zone === z).length,
    fill: ZONE_COLORS[i % ZONE_COLORS.length],
  }));

  // Seller performance
  const sellerPerf = sellers.map(s => {
    const sl = leads.filter(l => l.assigned_seller_id === s.id);
    return {
      name: s.name.split(' ')[0],
      leads: sl.length,
      demos: sl.filter(l => ['demo_agendada', 'demo_hecha', 'piloto_activo', 'cliente_pagando'].includes(l.stage)).length,
      pagando: sl.filter(l => l.stage === 'cliente_pagando').length,
    };
  });

  return (
    <div className="p-4 md:p-6 space-y-6 max-w-7xl mx-auto">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold text-foreground tracking-tight">Dashboard</h1>
        <p className="text-sm text-muted-foreground">Vista ejecutiva — Tablio CRM</p>
      </div>

      {/* KPIs Row */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <KPICard icon={DollarSign} label="MRR" value={`$${mrr.toLocaleString('en-US')}`} subtitle="USD/mes" />
        <KPICard icon={TrendingUp} label="ARR" value={`$${arr.toLocaleString('en-US')}`} subtitle="USD/año" />
        <KPICard icon={Users} label="Clientes pagando" value={paying.length} subtitle={`+ ${pilots.length} en piloto`} />
        <KPICard icon={BarChart3} label="Churn rate" value={`${churnRate}%`} subtitle={`${churned} churneados`} />
      </div>

      {/* Goal progress */}
      <Card>
        <CardContent className="p-4">
          <div className="flex items-center justify-between mb-2">
            <div className="flex items-center gap-2">
              <Target className="w-4 h-4 text-primary" />
              <span className="text-sm font-semibold text-foreground">Meta al 16 de junio</span>
            </div>
            <span className="text-sm font-bold text-primary">{mrrProgress.toFixed(0)}%</span>
          </div>
          <Progress value={mrrProgress} className="h-3" />
          <div className="flex justify-between mt-2 text-xs text-muted-foreground">
            <span>${mrr.toLocaleString('en-US')} actual</span>
            <span>${goalMRR.toLocaleString('en-US')} meta ({goalClients} clientes × $299)</span>
          </div>
        </CardContent>
      </Card>

      {/* Alerts */}
      {staleLeads.length > 0 && (
        <Card className="border-destructive/30 bg-destructive/5">
          <CardContent className="p-4">
            <div className="flex items-center gap-2 mb-2">
              <AlertTriangle className="w-4 h-4 text-destructive" />
              <span className="text-sm font-semibold text-destructive">{staleLeads.length} leads estancados (+7 días sin actualizar)</span>
            </div>
            <div className="flex flex-wrap gap-1.5">
              {staleLeads.slice(0, 5).map(l => (
                <Badge key={l.id} variant="outline" className="text-xs border-destructive/30 text-destructive">
                  {l.restaurant_name}
                </Badge>
              ))}
              {staleLeads.length > 5 && (
                <Badge variant="outline" className="text-xs border-destructive/30 text-destructive">
                  +{staleLeads.length - 5} más
                </Badge>
              )}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Charts row */}
      <div className="grid md:grid-cols-2 gap-4">
        {/* Pipeline funnel */}
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-semibold">Pipeline por etapa</CardTitle>
          </CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={220}>
              <BarChart data={funnelData} layout="vertical">
                <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                <XAxis type="number" tick={{ fontSize: 11, fill: 'hsl(var(--muted-foreground))' }} />
                <YAxis dataKey="name" type="category" width={100} tick={{ fontSize: 11, fill: 'hsl(var(--muted-foreground))' }} />
                <Tooltip
                  contentStyle={{ background: 'hsl(var(--card))', border: '1px solid hsl(var(--border))', borderRadius: 8, fontSize: 12 }}
                />
                <Bar dataKey="value" radius={[0, 6, 6, 0]}>
                  {funnelData.map((entry, i) => (
                    <Cell key={i} fill={entry.fill} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>

        {/* Zone distribution */}
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-semibold">Leads por zona</CardTitle>
          </CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={220}>
              <PieChart>
                <Pie data={zoneData} dataKey="value" nameKey="name" cx="50%" cy="50%" innerRadius={50} outerRadius={80} paddingAngle={3}>
                  {zoneData.map((entry, i) => (
                    <Cell key={i} fill={entry.fill} />
                  ))}
                </Pie>
                <Tooltip
                  contentStyle={{ background: 'hsl(var(--card))', border: '1px solid hsl(var(--border))', borderRadius: 8, fontSize: 12 }}
                />
              </PieChart>
            </ResponsiveContainer>
            <div className="flex flex-wrap gap-2 justify-center mt-1">
              {zoneData.map((z, i) => (
                <div key={i} className="flex items-center gap-1 text-xs text-muted-foreground">
                  <span className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: z.fill }} />
                  {z.name} ({z.value})
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Seller performance */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm font-semibold">Rendimiento por vendedor</CardTitle>
        </CardHeader>
        <CardContent>
          <ResponsiveContainer width="100%" height={200}>
            <BarChart data={sellerPerf}>
              <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
              <XAxis dataKey="name" tick={{ fontSize: 12, fill: 'hsl(var(--muted-foreground))' }} />
              <YAxis tick={{ fontSize: 11, fill: 'hsl(var(--muted-foreground))' }} />
              <Tooltip
                contentStyle={{ background: 'hsl(var(--card))', border: '1px solid hsl(var(--border))', borderRadius: 8, fontSize: 12 }}
              />
              <Bar dataKey="leads" name="Leads" fill="hsl(16,80%,51%)" radius={[4, 4, 0, 0]} />
              <Bar dataKey="demos" name="Demos" fill="hsl(200,70%,50%)" radius={[4, 4, 0, 0]} />
              <Bar dataKey="pagando" name="Pagando" fill="hsl(145,60%,42%)" radius={[4, 4, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </CardContent>
      </Card>
    </div>
  );
}

function KPICard({ icon: Icon, label, value, subtitle }: { icon: any; label: string; value: string | number; subtitle?: string }) {
  return (
    <Card>
      <CardContent className="p-4">
        <div className="flex items-center justify-between mb-1">
          <span className="text-xs font-medium text-muted-foreground">{label}</span>
          <Icon className="h-4 w-4 text-muted-foreground" />
        </div>
        <p className="text-2xl font-bold text-foreground">{value}</p>
        {subtitle && <p className="text-xs text-muted-foreground mt-0.5">{subtitle}</p>}
      </CardContent>
    </Card>
  );
}
