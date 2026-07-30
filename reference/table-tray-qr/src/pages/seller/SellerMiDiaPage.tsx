import { useEffect, useState } from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import { supabase } from '@/integrations/supabase/client';
import { useSeller } from '@/contexts/SellerContext';
import { CalendarCheck, AlertTriangle, Phone, MapPin } from 'lucide-react';
import { format, startOfWeek, endOfWeek, startOfMonth, subDays } from 'date-fns';
import { es } from 'date-fns/locale';

interface Lead {
  id: string;
  restaurant_name: string;
  owner_name: string | null;
  phone: string | null;
  stage: string;
  temperature: string | null;
  next_action: string | null;
  next_action_date: string | null;
  zone: string | null;
  updated_at: string | null;
}

interface Goals {
  visits_goal: number;
  demos_goal: number;
  pilots_goal: number;
}

export default function SellerMiDiaPage() {
  const { seller } = useSeller();
  const [todayLeads, setTodayLeads] = useState<Lead[]>([]);
  const [staleLeads, setStaleLeads] = useState<Lead[]>([]);
  const [goals, setGoals] = useState<Goals>({ visits_goal: 10, demos_goal: 5, pilots_goal: 2 });
  const [weeklyStats, setWeeklyStats] = useState({ visits: 0, demos: 0, pilots: 0 });
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!seller) return;
    const load = async () => {
      const today = format(new Date(), 'yyyy-MM-dd');
      const twoDaysAgo = subDays(new Date(), 2).toISOString();
      const weekStart = startOfWeek(new Date(), { weekStartsOn: 1 }).toISOString();
      const weekEnd = endOfWeek(new Date(), { weekStartsOn: 1 }).toISOString();
      const monthStr = format(new Date(), 'yyyy-MM');

      // Parallel queries
      const [leadsRes, goalsRes, activitiesRes] = await Promise.all([
        supabase
          .from('leads')
          .select('*')
          .eq('assigned_seller_id', seller.id)
          .not('stage', 'in', '("pagando","perdido")'),
        supabase
          .from('seller_goals')
          .select('*')
          .eq('seller_id', seller.id)
          .eq('period', monthStr)
          .maybeSingle(),
        supabase
          .from('lead_activities')
          .select('type, created_at')
          .eq('user_id', seller.id)
          .gte('created_at', weekStart)
          .lte('created_at', weekEnd),
      ]);

      const leads = (leadsRes.data || []) as Lead[];

      // Leads with next_action_date = today
      const todayL = leads.filter(l => l.next_action_date === today);
      setTodayLeads(todayL);

      // Stale leads (not updated in 48h)
      const staleL = leads.filter(l => l.updated_at && l.updated_at < twoDaysAgo);
      setStaleLeads(staleL);

      // Goals
      if (goalsRes.data) {
        setGoals({
          visits_goal: (goalsRes.data as any).visits_goal || 10,
          demos_goal: (goalsRes.data as any).demos_goal || 5,
          pilots_goal: (goalsRes.data as any).pilots_goal || 2,
        });
      }

      // Weekly stats from activities
      const activities = activitiesRes.data || [];
      setWeeklyStats({
        visits: activities.filter((a: any) => a.type === 'visita').length,
        demos: activities.filter((a: any) => a.type === 'demo').length,
        pilots: activities.filter((a: any) => a.type === 'piloto').length,
      });

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

  const goalItems = [
    { label: 'Visitas', current: weeklyStats.visits, target: goals.visits_goal, color: 'bg-primary' },
    { label: 'Demos', current: weeklyStats.demos, target: goals.demos_goal, color: 'bg-secondary' },
    { label: 'Pilotos', current: weeklyStats.pilots, target: goals.pilots_goal, color: 'bg-[#1A6B45]' },
  ];

  return (
    <div className="p-4 space-y-4 max-w-lg mx-auto">
      {/* Greeting */}
      <div>
        <h1 className="text-xl font-bold text-foreground">
          Hola, {seller?.name?.split(' ')[0]} 👋
        </h1>
        <p className="text-sm text-muted-foreground">
          {format(new Date(), "EEEE d 'de' MMMM", { locale: es })}
        </p>
      </div>

      {/* Stale leads alert */}
      {staleLeads.length > 0 && (
        <Card className="border-destructive/30 bg-destructive/5">
          <CardContent className="p-3 flex items-center gap-3">
            <AlertTriangle className="w-5 h-5 text-destructive shrink-0" />
            <p className="text-sm text-foreground">
              Tienes <span className="font-bold">{staleLeads.length} leads</span> sin actualizar hace +48h
            </p>
          </CardContent>
        </Card>
      )}

      {/* Weekly goals */}
      <Card>
        <CardContent className="p-4 space-y-3">
          <h2 className="text-sm font-semibold text-foreground">Meta de la semana</h2>
          {goalItems.map(g => (
            <div key={g.label} className="space-y-1">
              <div className="flex justify-between text-xs">
                <span className="text-muted-foreground">{g.label}</span>
                <span className="font-medium text-foreground">{g.current}/{g.target}</span>
              </div>
              <Progress value={g.target > 0 ? Math.min((g.current / g.target) * 100, 100) : 0} className="h-2" />
            </div>
          ))}
        </CardContent>
      </Card>

      {/* Today's leads */}
      <div>
        <h2 className="text-sm font-semibold text-foreground mb-2 flex items-center gap-2">
          <CalendarCheck className="w-4 h-4 text-primary" />
          Para hoy ({todayLeads.length})
        </h2>
        {todayLeads.length === 0 ? (
          <Card>
            <CardContent className="p-4 text-center text-sm text-muted-foreground">
              No tienes leads agendados para hoy
            </CardContent>
          </Card>
        ) : (
          <div className="space-y-2">
            {todayLeads.map(lead => (
              <Card key={lead.id} className="active:scale-[0.98] transition-transform">
                <CardContent className="p-3">
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <p className="font-medium text-foreground text-sm truncate">{lead.restaurant_name}</p>
                      {lead.owner_name && (
                        <p className="text-xs text-muted-foreground">{lead.owner_name}</p>
                      )}
                    </div>
                    <Badge variant="outline" className={`shrink-0 text-[10px] ${
                      lead.temperature === 'caliente' ? 'border-destructive text-destructive' :
                      lead.temperature === 'tibio' ? 'border-[#B87C10] text-[#B87C10]' :
                      'border-muted-foreground text-muted-foreground'
                    }`}>
                      {lead.temperature === 'caliente' ? '🔥' : lead.temperature === 'tibio' ? '🌤' : '❄️'} {lead.temperature}
                    </Badge>
                  </div>
                  <div className="flex items-center gap-3 mt-2">
                    {lead.next_action && (
                      <span className="text-xs text-primary font-medium">→ {lead.next_action}</span>
                    )}
                    {lead.zone && (
                      <span className="text-xs text-muted-foreground flex items-center gap-0.5">
                        <MapPin className="w-3 h-3" />{lead.zone}
                      </span>
                    )}
                  </div>
                  {lead.phone && (
                    <a href={`tel:${lead.phone}`} className="mt-2 inline-flex items-center gap-1 text-xs text-primary font-medium">
                      <Phone className="w-3 h-3" />{lead.phone}
                    </a>
                  )}
                </CardContent>
              </Card>
            ))}
          </div>
        )}
      </div>

      {/* Stale leads list */}
      {staleLeads.length > 0 && (
        <div>
          <h2 className="text-sm font-semibold text-foreground mb-2 flex items-center gap-2">
            <AlertTriangle className="w-4 h-4 text-destructive" />
            Leads sin actualizar
          </h2>
          <div className="space-y-2">
            {staleLeads.slice(0, 5).map(lead => (
              <Card key={lead.id} className="border-destructive/20">
                <CardContent className="p-3 flex items-center justify-between">
                  <div>
                    <p className="text-sm font-medium text-foreground">{lead.restaurant_name}</p>
                    <p className="text-xs text-muted-foreground">{lead.stage} · {lead.zone}</p>
                  </div>
                  <Badge variant="outline" className="text-[10px] border-destructive/30 text-destructive">
                    Pendiente
                  </Badge>
                </CardContent>
              </Card>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
