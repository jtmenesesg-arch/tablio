import { useEffect, useState } from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { Progress } from '@/components/ui/progress';
import { supabase } from '@/integrations/supabase/client';
import { useSeller } from '@/contexts/SellerContext';
import { format, startOfWeek, endOfWeek, startOfMonth, endOfMonth } from 'date-fns';
import { TrendingUp, Target, DollarSign, BarChart3 } from 'lucide-react';

export default function SellerNumerosPage() {
  const { seller } = useSeller();
  const [stats, setStats] = useState({
    weekVisits: 0, monthVisits: 0,
    weekDemos: 0, monthDemos: 0,
    weekPilots: 0, monthPilots: 0,
    weekCloses: 0, monthCloses: 0,
    totalLeads: 0,
    conversionRate: 0,
  });
  const [goals, setGoals] = useState({
    visits_goal: 0, demos_goal: 0, pilots_goal: 0, closes_goal: 0, commission_per_close: 0,
  });
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!seller) return;
    const load = async () => {
      const now = new Date();
      const weekStart = startOfWeek(now, { weekStartsOn: 1 }).toISOString();
      const weekEnd = endOfWeek(now, { weekStartsOn: 1 }).toISOString();
      const monthStart = startOfMonth(now).toISOString();
      const monthEnd = endOfMonth(now).toISOString();
      const monthStr = format(now, 'yyyy-MM');

      const [weekAct, monthAct, goalsRes, leadsRes] = await Promise.all([
        supabase.from('lead_activities').select('type').eq('user_id', seller.id).gte('created_at', weekStart).lte('created_at', weekEnd),
        supabase.from('lead_activities').select('type').eq('user_id', seller.id).gte('created_at', monthStart).lte('created_at', monthEnd),
        supabase.from('seller_goals').select('*').eq('seller_id', seller.id).eq('period', monthStr).maybeSingle(),
        supabase.from('leads').select('id, stage').eq('assigned_seller_id', seller.id),
      ]);

      const wa = weekAct.data || [];
      const ma = monthAct.data || [];
      const leads = leadsRes.data || [];
      const paying = leads.filter((l: any) => l.stage === 'pagando').length;

      setStats({
        weekVisits: wa.filter((a: any) => a.type === 'visita').length,
        monthVisits: ma.filter((a: any) => a.type === 'visita').length,
        weekDemos: wa.filter((a: any) => a.type === 'demo').length,
        monthDemos: ma.filter((a: any) => a.type === 'demo').length,
        weekPilots: wa.filter((a: any) => a.type === 'piloto').length,
        monthPilots: ma.filter((a: any) => a.type === 'piloto').length,
        weekCloses: wa.filter((a: any) => a.type === 'cierre').length,
        monthCloses: ma.filter((a: any) => a.type === 'cierre').length,
        totalLeads: leads.length,
        conversionRate: leads.length > 0 ? Math.round((paying / leads.length) * 100) : 0,
      });

      if (goalsRes.data) {
        const g = goalsRes.data as any;
        setGoals({
          visits_goal: g.visits_goal || 0,
          demos_goal: g.demos_goal || 0,
          pilots_goal: g.pilots_goal || 0,
          closes_goal: g.closes_goal || 0,
          commission_per_close: g.commission_per_close || 0,
        });
      }

      setLoading(false);
    };
    load();
  }, [seller]);

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin h-6 w-6 border-2 border-primary border-t-transparent rounded-full" />
      </div>
    );
  }

  const kpis = [
    { label: 'Visitas', week: stats.weekVisits, month: stats.monthVisits, goal: goals.visits_goal, icon: Target },
    { label: 'Demos', week: stats.weekDemos, month: stats.monthDemos, goal: goals.demos_goal, icon: BarChart3 },
    { label: 'Pilotos', week: stats.weekPilots, month: stats.monthPilots, goal: goals.pilots_goal, icon: TrendingUp },
    { label: 'Cierres', week: stats.weekCloses, month: stats.monthCloses, goal: goals.closes_goal, icon: DollarSign },
  ];

  const commission = stats.monthCloses * goals.commission_per_close;

  return (
    <div className="p-4 max-w-lg mx-auto space-y-4">
      <h1 className="text-lg font-bold text-foreground">Mis Números</h1>

      {/* Conversion */}
      <Card className="border-primary/20">
        <CardContent className="p-4 flex items-center justify-between">
          <div>
            <p className="text-xs text-muted-foreground">Conversión personal</p>
            <p className="text-3xl font-bold text-primary">{stats.conversionRate}%</p>
          </div>
          <div className="text-right">
            <p className="text-xs text-muted-foreground">Total leads</p>
            <p className="text-2xl font-bold text-foreground">{stats.totalLeads}</p>
          </div>
        </CardContent>
      </Card>

      {/* KPIs */}
      <div className="grid grid-cols-2 gap-3">
        {kpis.map(kpi => (
          <Card key={kpi.label}>
            <CardContent className="p-3 space-y-2">
              <div className="flex items-center gap-2">
                <kpi.icon className="w-4 h-4 text-primary" />
                <span className="text-xs font-medium text-muted-foreground">{kpi.label}</span>
              </div>
              <div className="flex items-baseline gap-1">
                <span className="text-2xl font-bold text-foreground">{kpi.week}</span>
                <span className="text-xs text-muted-foreground">sem</span>
                <span className="text-muted-foreground mx-1">·</span>
                <span className="text-lg font-semibold text-foreground">{kpi.month}</span>
                <span className="text-xs text-muted-foreground">mes</span>
              </div>
              {kpi.goal > 0 && (
                <div className="space-y-1">
                  <Progress value={Math.min((kpi.month / kpi.goal) * 100, 100)} className="h-1.5" />
                  <p className="text-[10px] text-muted-foreground text-right">{kpi.month}/{kpi.goal}</p>
                </div>
              )}
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Commissions */}
      {goals.commission_per_close > 0 && (
        <Card className="border-primary/20 bg-primary/5">
          <CardContent className="p-4">
            <p className="text-xs text-muted-foreground mb-1">Comisiones del mes</p>
            <p className="text-2xl font-bold text-primary">
              ${commission.toLocaleString('es-CL')}
            </p>
            <p className="text-xs text-muted-foreground mt-1">
              {stats.monthCloses} cierres × ${goals.commission_per_close.toLocaleString('es-CL')} c/u
            </p>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
