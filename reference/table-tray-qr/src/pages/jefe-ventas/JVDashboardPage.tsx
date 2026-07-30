import { useEffect, useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import { supabase } from '@/integrations/supabase/client';
import { Target, Users, DollarSign, TrendingUp, Loader2, BarChart3, AlertTriangle } from 'lucide-react';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, PieChart, Pie, Cell } from 'recharts';

const PILOT_THRESHOLD = 5;
const PILOT_PRICE = 199000;
const COMMERCIAL_PRICE = 299000;

const STAGE_ORDER = ['contactado', 'demo_agendada', 'demo_hecha', 'piloto_activo', 'cliente_pagando'];
const STAGE_LABELS: Record<string, string> = {
  contactado: 'Contactado', demo_agendada: 'Demo agendada', demo_hecha: 'Demo hecha',
  piloto_activo: 'Piloto activo', cliente_pagando: 'Pagando',
};
const STAGE_COLORS = ['hsl(16,80%,51%)', 'hsl(30,90%,55%)', 'hsl(45,90%,50%)', 'hsl(200,70%,50%)', 'hsl(145,60%,42%)'];
const ZONE_COLORS = ['hsl(16,80%,51%)', 'hsl(200,70%,50%)', 'hsl(145,60%,42%)', 'hsl(45,90%,50%)', 'hsl(280,60%,55%)'];

export default function JVDashboardPage() {
  const [loading, setLoading] = useState(true);
  const [data, setData] = useState<any>({});

  useEffect(() => {
    const load = async () => {
      try {
        const [tenantsRes, leadsRes, membersRes] = await Promise.all([
          supabase.from('tenants').select('id, name, plan_status, is_active, created_at'),
          supabase.from('leads').select('id, stage, assigned_seller_id, monthly_value, created_at, updated_at, zone'),
          supabase.from('backoffice_members').select('id, name, role').eq('is_active', true),
        ]);

        const tenants = tenantsRes.data || [];
        const leads = leadsRes.data || [];
        const members = membersRes.data || [];

        const paying = tenants.filter(t => t.plan_status === 'active' || t.plan_status === 'paying');
        const pilots = tenants.filter(t => t.plan_status === 'pilot' || t.plan_status === 'trial');
        const totalClients = paying.length + pilots.length;

        const isPhase0 = totalClients < PILOT_THRESHOLD;
        const currentPrice = isPhase0 ? PILOT_PRICE : COMMERCIAL_PRICE;

        const mrr = paying.reduce((s, t, i) => {
          return s + (i < PILOT_THRESHOLD ? PILOT_PRICE : COMMERCIAL_PRICE);
        }, 0);

        const sellers = members.filter(m => m.role === 'vendedor');
        const closedLeads = leads.filter(l => l.stage === 'cliente_pagando');
        const pipelineLeads = leads.filter(l => !['cliente_pagando', 'frio'].includes(l.stage));

        // Stale leads (>48h without update)
        const twoDaysAgo = new Date(Date.now() - 48 * 60 * 60 * 1000).toISOString();
        const staleLeads = leads.filter(l =>
          !['cliente_pagando', 'frio'].includes(l.stage) &&
          (!l.updated_at || l.updated_at < twoDaysAgo)
        );

        // Weekly closes
        const weekAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();
        const weeklyCloses = closedLeads.filter(l => l.created_at && l.created_at > weekAgo).length;

        // Pipeline funnel data
        const funnelData = STAGE_ORDER.map((stage, i) => ({
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

        setData({
          totalClients, paying: paying.length, pilots: pilots.length,
          isPhase0, currentPrice, mrr,
          sellers: sellers.length, closedLeads: closedLeads.length,
          pipelineLeads: pipelineLeads.length, staleLeads,
          weeklyCloses, totalLeads: leads.length,
          funnelData, zoneData, sellerPerf,
        });
      } catch (err) {
        console.error('JVDashboard load error', err);
      }
      setLoading(false);
    };
    load();
  }, []);

  if (loading) return <div className="flex items-center justify-center h-64"><Loader2 className="w-6 h-6 animate-spin text-muted-foreground" /></div>;

  const d = data;
  const phaseLabel = d.isPhase0 ? 'Fase Piloto' : 'Fase Comercial';
  const phaseProgress = Math.min((d.totalClients / PILOT_THRESHOLD) * 100, 100);

  return (
    <div className="p-6 space-y-6 max-w-7xl">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-foreground">Dashboard</h1>
          <p className="text-sm text-muted-foreground">Vista ejecutiva — Tablio Ventas</p>
        </div>
        <Badge className={`text-sm px-3 py-1 ${d.isPhase0 ? 'bg-amber-500/10 text-amber-600 border-amber-500/20' : 'bg-primary/10 text-primary border-primary/20'}`}>
          {phaseLabel} — ${(d.currentPrice).toLocaleString('es-CL')}/cliente
        </Badge>
      </div>

      {/* Phase progress */}
      <Card className="border-primary/20">
        <CardContent className="p-4">
          <div className="flex items-center justify-between mb-2">
            <div className="flex items-center gap-2">
              <Target className="w-4 h-4 text-primary" />
              <span className="text-sm font-semibold text-foreground">Progreso a Fase Comercial</span>
            </div>
            <span className="text-sm font-bold text-foreground">{d.totalClients} / {PILOT_THRESHOLD}</span>
          </div>
          <Progress value={phaseProgress} className="h-3" />
          <p className="text-xs text-muted-foreground mt-2">
            {d.isPhase0
              ? `Faltan ${PILOT_THRESHOLD - d.totalClients} pilotos para pasar a $${COMMERCIAL_PRICE.toLocaleString('es-CL')}/cliente`
              : '¡Fase comercial activa! Precio: $299.000/cliente'}
          </p>
        </CardContent>
      </Card>

      {/* KPIs */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center justify-between">
              <p className="text-xs text-muted-foreground font-medium">MRR Proyectado</p>
              <DollarSign className="w-4 h-4 text-primary" />
            </div>
            <p className="text-2xl font-bold text-foreground mt-1">${(d.mrr || 0).toLocaleString('es-CL')}</p>
            <p className="text-xs text-muted-foreground">{d.paying} clientes pagando</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <p className="text-xs text-muted-foreground font-medium">Pilotos activos</p>
            <p className="text-2xl font-bold text-foreground mt-1">{d.pilots}</p>
            <p className="text-xs text-muted-foreground">En período de prueba</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <p className="text-xs text-muted-foreground font-medium">En pipeline</p>
            <p className="text-2xl font-bold text-foreground mt-1">{d.pipelineLeads}</p>
            <p className="text-xs text-muted-foreground">{d.totalLeads} leads totales</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center justify-between">
              <p className="text-xs text-muted-foreground font-medium">Vendedores</p>
              <Users className="w-4 h-4 text-primary" />
            </div>
            <p className="text-2xl font-bold text-foreground mt-1">{d.sellers}</p>
            <p className="text-xs text-muted-foreground">activos</p>
          </CardContent>
        </Card>
      </div>

      {/* Stale leads alert */}
      {d.staleLeads?.length > 0 && (
        <Card className="border-destructive/30 bg-destructive/5">
          <CardContent className="p-4">
            <div className="flex items-center gap-2 mb-2">
              <AlertTriangle className="w-4 h-4 text-destructive" />
              <span className="text-sm font-semibold text-destructive">{d.staleLeads.length} leads sin actualizar +48h</span>
            </div>
            <div className="flex flex-wrap gap-1.5">
              {d.staleLeads.slice(0, 5).map((l: any) => (
                <Badge key={l.id} variant="outline" className="text-xs border-destructive/30 text-destructive">
                  {l.restaurant_name || l.id.slice(0, 8)}
                </Badge>
              ))}
              {d.staleLeads.length > 5 && (
                <Badge variant="outline" className="text-xs border-destructive/30 text-destructive">
                  +{d.staleLeads.length - 5} más
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
              <BarChart data={d.funnelData || []} layout="vertical">
                <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                <XAxis type="number" tick={{ fontSize: 11, fill: 'hsl(var(--muted-foreground))' }} />
                <YAxis dataKey="name" type="category" width={100} tick={{ fontSize: 11, fill: 'hsl(var(--muted-foreground))' }} />
                <Tooltip contentStyle={{ background: 'hsl(var(--card))', border: '1px solid hsl(var(--border))', borderRadius: 8, fontSize: 12 }} />
                <Bar dataKey="value" radius={[0, 6, 6, 0]}>
                  {(d.funnelData || []).map((entry: any, i: number) => (
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
                <Pie data={d.zoneData || []} dataKey="value" nameKey="name" cx="50%" cy="50%" innerRadius={50} outerRadius={80} paddingAngle={3}>
                  {(d.zoneData || []).map((entry: any, i: number) => (
                    <Cell key={i} fill={entry.fill} />
                  ))}
                </Pie>
                <Tooltip contentStyle={{ background: 'hsl(var(--card))', border: '1px solid hsl(var(--border))', borderRadius: 8, fontSize: 12 }} />
              </PieChart>
            </ResponsiveContainer>
            <div className="flex flex-wrap gap-2 justify-center mt-1">
              {(d.zoneData || []).map((z: any, i: number) => (
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
      {(d.sellerPerf || []).length > 0 && (
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-semibold">Rendimiento por vendedor</CardTitle>
          </CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={200}>
              <BarChart data={d.sellerPerf}>
                <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                <XAxis dataKey="name" tick={{ fontSize: 12, fill: 'hsl(var(--muted-foreground))' }} />
                <YAxis tick={{ fontSize: 11, fill: 'hsl(var(--muted-foreground))' }} />
                <Tooltip contentStyle={{ background: 'hsl(var(--card))', border: '1px solid hsl(var(--border))', borderRadius: 8, fontSize: 12 }} />
                <Bar dataKey="leads" name="Leads" fill="hsl(16,80%,51%)" radius={[4, 4, 0, 0]} />
                <Bar dataKey="demos" name="Demos" fill="hsl(200,70%,50%)" radius={[4, 4, 0, 0]} />
                <Bar dataKey="pagando" name="Pagando" fill="hsl(145,60%,42%)" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>
      )}

      {/* Weekly summary */}
      <Card>
        <CardHeader><CardTitle className="text-sm">Resumen semanal</CardTitle></CardHeader>
        <CardContent>
          <div className="flex items-center gap-6">
            <div className="text-center">
              <p className="text-3xl font-bold text-primary">{d.weeklyCloses}</p>
              <p className="text-xs text-muted-foreground">Cierres esta semana</p>
            </div>
            <div className="text-center">
              <p className="text-3xl font-bold text-foreground">{d.pipelineLeads}</p>
              <p className="text-xs text-muted-foreground">Leads activos</p>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
