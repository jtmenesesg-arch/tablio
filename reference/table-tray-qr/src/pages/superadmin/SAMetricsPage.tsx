import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Progress } from "@/components/ui/progress";
import { Badge } from "@/components/ui/badge";
import { Loader2, Building2, ShoppingBag, TrendingUp, DollarSign, Users, Zap, QrCode, ChefHat, Target, BarChart3, AlertTriangle } from "lucide-react";
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, LineChart, Line, AreaChart, Area, FunnelChart, Funnel, LabelList, Cell } from "recharts";
import ReportKPICard from "@/components/reports/ReportKPICard";
import { fetchAll, startOfMonth, daysAgo, pctChange, fmtCLP } from "@/lib/report-utils";

const GOAL_DATE = "2025-06-16";
const GOAL_CLIENTS = 34;
const GOAL_MRR = 10166; // USD

export default function SAMetricsPage() {
  const [loading, setLoading] = useState(true);
  const [data, setData] = useState<any>({});

  useEffect(() => {
    const load = async () => {
      const today = new Date().toISOString().split("T")[0];
      const monthStart = startOfMonth(new Date()).toISOString();
      const weekAgo = daysAgo(7).toISOString();
      const prevMonthStart = new Date(); prevMonthStart.setMonth(prevMonthStart.getMonth() - 1); prevMonthStart.setDate(1);
      const prevMonthEnd = startOfMonth(new Date()); prevMonthEnd.setDate(prevMonthEnd.getDate() - 1);

      const [
        allTenants, activeTenantsRes, ordersToday, ordersMonth, ordersPrevMonth,
        weekOrders, staffUsers, tablesData, waiterCallsMonth, billRequestsMonth,
        allLeads, allMembers, allGoals, allActivities,
      ] = await Promise.all([
        supabase.from("tenants").select("id, name, created_at, is_active, plan_status, trial_ends_at, slug, plan_id"),
        supabase.from("tenants").select("id", { count: "exact", head: true }).eq("is_active", true),
        supabase.from("orders").select("id", { count: "exact", head: true }).gte("confirmed_at", today),
        fetchAll("orders", "id, tenant_id, confirmed_at, total_amount, status, source", [
          { column: "confirmed_at", op: "gte", value: monthStart },
        ]),
        fetchAll("orders", "id, total_amount", [
          { column: "confirmed_at", op: "gte", value: prevMonthStart.toISOString() },
          { column: "confirmed_at", op: "lte", value: prevMonthEnd.toISOString() },
        ]),
        fetchAll("orders", "confirmed_at, tenant_id", [
          { column: "confirmed_at", op: "gte", value: weekAgo },
        ]),
        supabase.from("staff_users").select("id, tenant_id, role"),
        supabase.from("tables").select("id, tenant_id, qr_token"),
        supabase.from("waiter_calls").select("id").gte("created_at", monthStart),
        supabase.from("bill_requests").select("id").gte("requested_at", monthStart),
        supabase.from("leads").select("*"),
        supabase.from("backoffice_members").select("*"),
        supabase.from("seller_goals").select("*"),
        fetchAll("lead_activities", "id, lead_id, type, created_at", []),
      ]);

      const tenants = allTenants.data ?? [];
      const activeTenantCount = activeTenantsRes.count ?? 0;
      const monthOrders = ordersMonth as any[];
      const prevMonth = ordersPrevMonth as any[];
      const leads = allLeads.data ?? [];
      const members = allMembers.data ?? [];
      const goals = allGoals.data ?? [];
      const activities = allActivities as any[];

      const totalOrdersMonth = monthOrders.length;
      const totalRevenueMonth = monthOrders.reduce((s: number, o: any) => s + (o.total_amount ?? 0), 0);
      const prevRevenueMonth = prevMonth.reduce((s: number, o: any) => s + (o.total_amount ?? 0), 0);

      const tenantsWithOrders = new Set(monthOrders.map((o: any) => o.tenant_id));
      const inactiveTenants = tenants.filter(t => t.is_active && !tenantsWithOrders.has(t.id));

      const onTrial = tenants.filter(t => t.plan_status === "trial" && t.is_active);
      const paying = tenants.filter(t => t.plan_status === "active" && t.is_active);
      const churned = tenants.filter(t => !t.is_active);

      // MRR/ARR (simplified: paying * $299 avg)
      const MRR = paying.length * 299;
      const ARR = MRR * 12;
      const prevMRR = Math.max(0, MRR - 299); // rough

      // Funnel data
      const stages = ['contactado', 'demo_agendada', 'demo_hecha', 'piloto', 'negociacion', 'cerrado', 'perdido'];
      const stageCounts: Record<string, number> = {};
      stages.forEach(s => stageCounts[s] = leads.filter(l => l.stage === s).length);
      const funnelData = [
        { name: 'Contactados', value: stageCounts.contactado + stageCounts.demo_agendada + stageCounts.demo_hecha + stageCounts.piloto + stageCounts.negociacion + stageCounts.cerrado, fill: 'hsl(var(--primary))' },
        { name: 'Demos', value: stageCounts.demo_agendada + stageCounts.demo_hecha + stageCounts.piloto + stageCounts.negociacion + stageCounts.cerrado, fill: 'hsl(var(--primary) / 0.8)' },
        { name: 'Pilotos', value: stageCounts.piloto + stageCounts.negociacion + stageCounts.cerrado, fill: 'hsl(var(--primary) / 0.6)' },
        { name: 'Pagando', value: stageCounts.cerrado + paying.length, fill: 'hsl(var(--primary) / 0.4)' },
      ];

      // Churn rate
      const churnRate = tenants.length > 0 ? Math.round((churned.length / tenants.length) * 100) : 0;

      // Goal progress
      const goalProgress = Math.round((paying.length / GOAL_CLIENTS) * 100);
      const mrrProgress = Math.round((MRR / GOAL_MRR) * 100);
      const daysToGoal = Math.max(0, Math.ceil((new Date(GOAL_DATE).getTime() - Date.now()) / 86400000));

      // Stale leads (>7 days no update)
      const sevenDaysAgo = daysAgo(7).toISOString();
      const staleLeads = leads.filter(l => l.stage !== 'cerrado' && l.stage !== 'perdido' && (!l.updated_at || l.updated_at < sevenDaysAgo));

      // Seller performance
      const sellers = members.filter(m => m.role === 'vendedor');
      const sellerPerf = sellers.map(s => {
        const myLeads = leads.filter(l => l.assigned_seller_id === s.id);
        const myActivities = activities.filter((a: any) => myLeads.some(l => l.id === a.lead_id));
        const visits = myActivities.filter((a: any) => a.type === 'visita').length;
        const demos = myLeads.filter(l => ['demo_hecha', 'piloto', 'negociacion', 'cerrado'].includes(l.stage)).length;
        const pilots = myLeads.filter(l => ['piloto', 'negociacion', 'cerrado'].includes(l.stage)).length;
        const closes = myLeads.filter(l => l.stage === 'cerrado').length;
        const conversion = myLeads.length > 0 ? Math.round((closes / myLeads.length) * 100) : 0;
        const goal = goals.find(g => g.seller_id === s.id);
        return { ...s, visits, demos, pilots, closes, conversion, totalLeads: myLeads.length, goal };
      }).sort((a, b) => b.closes - a.closes || b.demos - a.demos);

      // Zone performance
      const zones = [...new Set(leads.map(l => l.zone).filter(Boolean))] as string[];
      const zonePerf = zones.map(z => {
        const zl = leads.filter(l => l.zone === z);
        const closed = zl.filter(l => l.stage === 'cerrado').length;
        return { zone: z, total: zl.length, closed, conversion: zl.length > 0 ? Math.round((closed / zl.length) * 100) : 0 };
      }).sort((a, b) => b.conversion - a.conversion);

      // MRR history (last 12 months simulated)
      const mrrHistory: { month: string; mrr: number }[] = [];
      for (let i = 11; i >= 0; i--) {
        const d = new Date(); d.setMonth(d.getMonth() - i);
        const m = d.toISOString().slice(0, 7);
        const estimatedClients = Math.max(0, paying.length - i);
        mrrHistory.push({ month: m.slice(5), mrr: estimatedClients * 299 });
      }

      // New tenants per month (last 6)
      const newTenantsChart: { month: string; count: number }[] = [];
      for (let i = 5; i >= 0; i--) {
        const d = new Date(); d.setMonth(d.getMonth() - i);
        const m = d.toISOString().slice(0, 7);
        newTenantsChart.push({ month: m.slice(5), count: tenants.filter(t => t.created_at?.startsWith(m)).length });
      }

      // Orders per day (last 7)
      const dayNames = ["dom", "lun", "mar", "mié", "jue", "vie", "sáb"];
      const dayMap: Record<string, number> = {};
      for (let i = 6; i >= 0; i--) {
        const d = new Date(); d.setDate(d.getDate() - i);
        dayMap[d.toISOString().split("T")[0]] = 0;
      }
      (weekOrders as any[]).forEach((o: any) => {
        const key = o.confirmed_at?.split("T")[0];
        if (key && dayMap[key] !== undefined) dayMap[key]++;
      });
      const chartData = Object.entries(dayMap).map(([day, count]) => ({
        day: dayNames[new Date(day + "T12:00:00").getDay()], count,
      }));

      // Top tenants
      const tenantOrders: Record<string, { name: string; count: number; revenue: number }> = {};
      tenants.forEach(t => { tenantOrders[t.id] = { name: t.name, count: 0, revenue: 0 }; });
      monthOrders.forEach((o: any) => {
        if (tenantOrders[o.tenant_id]) {
          tenantOrders[o.tenant_id].count++;
          tenantOrders[o.tenant_id].revenue += o.total_amount ?? 0;
        }
      });
      const topTenants = Object.values(tenantOrders).sort((a, b) => b.revenue - a.revenue).slice(0, 10);
      const neverOrdered = Object.values(tenantOrders).filter(t => t.count === 0);

      // Feature usage
      const staffData = staffUsers.data ?? [];
      const tablesAll = tablesData.data ?? [];
      const tenantsWithStaff = new Set(staffData.filter(s => s.role === "waiter").map(s => s.tenant_id)).size;
      const tenantsWithQR = new Set(tablesAll.map(t => t.tenant_id)).size;
      const kdsUsage = monthOrders.filter((o: any) => o.status === "delivered" || o.status === "ready").length;
      const waiterCallCount = waiterCallsMonth.data?.length ?? 0;
      const billRequestCount = billRequestsMonth.data?.length ?? 0;
      const manualOrders = monthOrders.filter((o: any) => o.source === "manual_waiter").length;

      setData({
        activeTenantCount, totalTenants: tenants.length, ordersToday: ordersToday.count ?? 0,
        totalOrdersMonth, totalRevenueMonth, prevRevenueMonth, prevMonthOrders: prevMonth.length,
        inactiveTenants, onTrial, paying, churned, newTenantsChart, chartData, topTenants, neverOrdered,
        tenantsWithStaff, tenantsWithQR, totalStaff: staffData.length, totalTables: tablesAll.length,
        kdsUsage, waiterCallCount, billRequestCount, manualOrders,
        MRR, ARR, prevMRR, churnRate, funnelData, goalProgress, mrrProgress, daysToGoal,
        staleLeads, sellerPerf, zonePerf, mrrHistory, stageCounts, leads,
      });
      setLoading(false);
    };
    load();
  }, []);

  if (loading) return <div className="flex items-center justify-center h-64"><Loader2 className="w-6 h-6 animate-spin text-muted-foreground" /></div>;

  const d = data;
  const fmt = (n: number) => "$" + n.toLocaleString("es-CL");

  return (
    <div className="p-6 space-y-4">
      <h1 className="text-xl font-bold text-foreground">Métricas de Plataforma</h1>

      {/* Goal progress bar */}
      <Card className="border-primary/30">
        <CardContent className="p-4">
          <div className="flex items-center justify-between mb-2">
            <div className="flex items-center gap-2">
              <Target className="w-4 h-4 text-primary" />
              <span className="text-sm font-semibold text-foreground">Meta al 16 de junio</span>
            </div>
            <span className="text-xs text-muted-foreground">{d.daysToGoal} días restantes</span>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <div className="flex justify-between text-xs mb-1">
                <span className="text-muted-foreground">Clientes pagando</span>
                <span className="font-semibold">{d.paying.length} / {GOAL_CLIENTS}</span>
              </div>
              <Progress value={Math.min(d.goalProgress, 100)} className="h-2" />
            </div>
            <div>
              <div className="flex justify-between text-xs mb-1">
                <span className="text-muted-foreground">MRR (USD)</span>
                <span className="font-semibold">${d.MRR.toLocaleString()} / ${GOAL_MRR.toLocaleString()}</span>
              </div>
              <Progress value={Math.min(d.mrrProgress, 100)} className="h-2" />
            </div>
          </div>
        </CardContent>
      </Card>

      <Tabs defaultValue="ejecutiva" className="space-y-4">
        <TabsList className="grid grid-cols-5 h-auto">
          <TabsTrigger value="ejecutiva" className="text-xs">Ejecutiva</TabsTrigger>
          <TabsTrigger value="comercial" className="text-xs">Comercial</TabsTrigger>
          <TabsTrigger value="financiera" className="text-xs">Financiera</TabsTrigger>
          <TabsTrigger value="uso" className="text-xs">Uso</TabsTrigger>
          <TabsTrigger value="producto" className="text-xs">Producto</TabsTrigger>
        </TabsList>

        {/* EJECUTIVA */}
        <TabsContent value="ejecutiva">
          <div className="space-y-4">
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
              <ReportKPICard label="MRR" value={`$${d.MRR.toLocaleString()}`} icon={DollarSign} trend={pctChange(d.MRR, d.prevMRR)} subtitle={`ARR: $${d.ARR.toLocaleString()}`} />
              <ReportKPICard label="Clientes pagando" value={d.paying.length} icon={Building2} subtitle={`${d.onTrial.length} en trial · ${d.churned.length} churneados`} />
              <ReportKPICard label="Churn rate" value={`${d.churnRate}%`} icon={TrendingUp} subtitle="Mensual" />
              <ReportKPICard label="Pedidos hoy" value={d.ordersToday} icon={ShoppingBag} />
            </div>

            {/* Funnel */}
            <Card>
              <CardHeader><CardTitle className="text-sm">Pipeline (funnel)</CardTitle></CardHeader>
              <CardContent>
                <div className="space-y-2">
                  {d.funnelData.map((f: any, i: number) => {
                    const maxVal = d.funnelData[0]?.value || 1;
                    return (
                      <div key={f.name} className="flex items-center gap-3">
                        <span className="text-xs text-muted-foreground w-24">{f.name}</span>
                        <div className="flex-1 h-8 bg-muted rounded overflow-hidden">
                          <div className="h-full rounded bg-primary flex items-center px-2 text-xs font-bold text-primary-foreground transition-all" style={{ width: `${Math.max((f.value / maxVal) * 100, 8)}%`, opacity: 1 - i * 0.15 }}>
                            {f.value}
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </CardContent>
            </Card>

            {/* Stale leads alert */}
            {d.staleLeads.length > 0 && (
              <Card className="border-amber-500/30">
                <CardHeader>
                  <CardTitle className="text-sm flex items-center gap-2 text-destructive">
                    <AlertTriangle className="w-4 h-4" />
                    Leads estancados +7 días ({d.staleLeads.length})
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="space-y-1 max-h-40 overflow-auto">
                    {d.staleLeads.slice(0, 15).map((l: any) => (
                      <div key={l.id} className="flex justify-between text-sm">
                        <span className="text-foreground">{l.restaurant_name}</span>
                        <span className="text-xs text-muted-foreground">{l.stage} · {l.zone || 'sin zona'}</span>
                      </div>
                    ))}
                  </div>
                </CardContent>
              </Card>
            )}

            <Card>
              <CardHeader><CardTitle className="text-sm">Pedidos últimos 7 días</CardTitle></CardHeader>
              <CardContent>
                <ResponsiveContainer width="100%" height={200}>
                  <BarChart data={d.chartData}>
                    <XAxis dataKey="day" tick={{ fontSize: 12 }} />
                    <YAxis tick={{ fontSize: 12 }} />
                    <Tooltip />
                    <Bar dataKey="count" fill="hsl(var(--primary))" radius={[4, 4, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </CardContent>
            </Card>
          </div>
        </TabsContent>

        {/* COMERCIAL */}
        <TabsContent value="comercial">
          <div className="space-y-4">
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
              <ReportKPICard label="Total leads" value={d.leads.length} icon={Users} />
              <ReportKPICard label="Cerrados" value={d.stageCounts.cerrado ?? 0} icon={Target} />
              <ReportKPICard label="Perdidos" value={d.stageCounts.perdido ?? 0} icon={AlertTriangle} />
              <ReportKPICard label="En piloto" value={d.stageCounts.piloto ?? 0} icon={Zap} />
            </div>

            {/* Seller ranking */}
            <Card>
              <CardHeader><CardTitle className="text-sm">Ranking vendedores</CardTitle></CardHeader>
              <CardContent>
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead><tr className="border-b border-border">
                      <th className="text-left py-2 text-muted-foreground font-medium">#</th>
                      <th className="text-left py-2 text-muted-foreground font-medium">Vendedor</th>
                      <th className="text-right py-2 text-muted-foreground font-medium">Visitas</th>
                      <th className="text-right py-2 text-muted-foreground font-medium">Demos</th>
                      <th className="text-right py-2 text-muted-foreground font-medium">Pilotos</th>
                      <th className="text-right py-2 text-muted-foreground font-medium">Cierres</th>
                      <th className="text-right py-2 text-muted-foreground font-medium">Conv %</th>
                    </tr></thead>
                    <tbody className="divide-y divide-border">
                      {d.sellerPerf.map((s: any, i: number) => (
                        <tr key={s.id}>
                          <td className="py-2 font-bold text-muted-foreground">{i + 1}</td>
                          <td className="py-2">
                            <p className="font-medium text-foreground">{s.name}</p>
                            <p className="text-xs text-muted-foreground">{s.zone || '-'}</p>
                          </td>
                          <td className="py-2 text-right">{s.visits}</td>
                          <td className="py-2 text-right">{s.demos}</td>
                          <td className="py-2 text-right">{s.pilots}</td>
                          <td className="py-2 text-right font-semibold">{s.closes}</td>
                          <td className="py-2 text-right">
                            <Badge variant={s.conversion >= 20 ? 'default' : 'secondary'} className="text-xs">{s.conversion}%</Badge>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </CardContent>
            </Card>

            {/* Zone performance */}
            <Card>
              <CardHeader><CardTitle className="text-sm">Conversión por zona</CardTitle></CardHeader>
              <CardContent>
                <div className="space-y-2">
                  {d.zonePerf.map((z: any) => (
                    <div key={z.zone} className="flex items-center gap-3">
                      <span className="text-sm w-28 truncate">{z.zone}</span>
                      <div className="flex-1">
                        <Progress value={z.conversion} className="h-2" />
                      </div>
                      <span className="text-xs font-semibold w-16 text-right">{z.conversion}% ({z.closed}/{z.total})</span>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>

            {/* Pipeline by stage */}
            <Card>
              <CardHeader><CardTitle className="text-sm">Pipeline por etapa</CardTitle></CardHeader>
              <CardContent>
                <ResponsiveContainer width="100%" height={200}>
                  <BarChart data={Object.entries(d.stageCounts).filter(([k]) => k !== 'perdido').map(([k, v]) => ({ stage: k.replace('_', ' '), count: v }))}>
                    <XAxis dataKey="stage" tick={{ fontSize: 10 }} />
                    <YAxis tick={{ fontSize: 12 }} allowDecimals={false} />
                    <Tooltip />
                    <Bar dataKey="count" fill="hsl(var(--primary))" radius={[4, 4, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </CardContent>
            </Card>
          </div>
        </TabsContent>

        {/* FINANCIERA */}
        <TabsContent value="financiera">
          <div className="space-y-4">
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
              <ReportKPICard label="MRR" value={`$${d.MRR.toLocaleString()}`} icon={DollarSign} trend={pctChange(d.MRR, d.prevMRR)} />
              <ReportKPICard label="ARR" value={`$${d.ARR.toLocaleString()}`} icon={DollarSign} />
              <ReportKPICard label="Revenue plataforma (mes)" value={fmt(d.totalRevenueMonth)} icon={TrendingUp} trend={pctChange(d.totalRevenueMonth, d.prevRevenueMonth)} />
              <ReportKPICard label="Churn rate" value={`${d.churnRate}%`} icon={BarChart3} />
            </div>

            <Card>
              <CardHeader><CardTitle className="text-sm">MRR histórico (12 meses)</CardTitle></CardHeader>
              <CardContent>
                <ResponsiveContainer width="100%" height={220}>
                  <AreaChart data={d.mrrHistory}>
                    <XAxis dataKey="month" tick={{ fontSize: 12 }} />
                    <YAxis tick={{ fontSize: 12 }} />
                    <Tooltip formatter={(v: number) => `$${v.toLocaleString()}`} />
                    <Area type="monotone" dataKey="mrr" stroke="hsl(var(--primary))" fill="hsl(var(--primary) / 0.2)" strokeWidth={2} />
                  </AreaChart>
                </ResponsiveContainer>
              </CardContent>
            </Card>

            <Card>
              <CardHeader><CardTitle className="text-sm">Top tenants por revenue (mes)</CardTitle></CardHeader>
              <CardContent>
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead><tr className="border-b border-border">
                      <th className="text-left py-2 text-muted-foreground font-medium">Restaurante</th>
                      <th className="text-right py-2 text-muted-foreground font-medium">Pedidos</th>
                      <th className="text-right py-2 text-muted-foreground font-medium">Revenue</th>
                    </tr></thead>
                    <tbody className="divide-y divide-border">
                      {d.topTenants.map((t: any) => (
                        <tr key={t.name}>
                          <td className="py-2 font-medium text-foreground">{t.name}</td>
                          <td className="py-2 text-right">{t.count}</td>
                          <td className="py-2 text-right font-semibold">{fmt(t.revenue)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader><CardTitle className="text-sm">Nuevos tenants por mes</CardTitle></CardHeader>
              <CardContent>
                <ResponsiveContainer width="100%" height={200}>
                  <LineChart data={d.newTenantsChart}>
                    <XAxis dataKey="month" tick={{ fontSize: 12 }} />
                    <YAxis tick={{ fontSize: 12 }} allowDecimals={false} />
                    <Tooltip />
                    <Line type="monotone" dataKey="count" stroke="hsl(var(--primary))" strokeWidth={2} dot />
                  </LineChart>
                </ResponsiveContainer>
              </CardContent>
            </Card>
          </div>
        </TabsContent>

        {/* USO */}
        <TabsContent value="uso">
          <div className="space-y-4">
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
              <ReportKPICard label="Pedidos plataforma (mes)" value={d.totalOrdersMonth} icon={ShoppingBag} />
              <ReportKPICard label="Pedidos hoy" value={d.ordersToday} icon={ShoppingBag} />
              <ReportKPICard label="Tenants activos (con pedidos)" value={d.activeTenantCount - d.inactiveTenants.length} icon={Building2} />
              <ReportKPICard label="Total mesas registradas" value={d.totalTables} icon={QrCode} />
            </div>
            <Card>
              <CardHeader><CardTitle className="text-sm">Ranking tenants más activos (mes)</CardTitle></CardHeader>
              <CardContent>
                <div className="space-y-2">
                  {d.topTenants.slice(0, 10).map((t: any, i: number) => {
                    const max = d.topTenants[0]?.count ?? 1;
                    return (
                      <div key={t.name} className="flex items-center gap-3">
                        <span className="text-xs font-bold text-muted-foreground w-5">{i + 1}</span>
                        <div className="flex-1">
                          <p className="text-sm font-medium">{t.name}</p>
                          <div className="h-2 bg-muted rounded-full mt-1 overflow-hidden">
                            <div className="h-full rounded-full bg-primary/80" style={{ width: `${(t.count / max) * 100}%` }} />
                          </div>
                        </div>
                        <span className="text-sm font-semibold">{t.count} pedidos</span>
                      </div>
                    );
                  })}
                </div>
              </CardContent>
            </Card>

            {d.inactiveTenants.length > 0 && (
              <Card>
                <CardHeader><CardTitle className="text-sm text-amber-600">Tenants sin pedidos este mes ({d.inactiveTenants.length})</CardTitle></CardHeader>
                <CardContent>
                  <div className="space-y-1">
                    {d.inactiveTenants.slice(0, 15).map((t: any) => (
                      <p key={t.id} className="text-sm text-muted-foreground">{t.name}</p>
                    ))}
                  </div>
                </CardContent>
              </Card>
            )}
          </div>
        </TabsContent>

        {/* PRODUCTO */}
        <TabsContent value="producto">
          <div className="space-y-4">
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
              <ReportKPICard label="KDS (pedidos procesados)" value={d.kdsUsage} icon={ChefHat} subtitle="Delivered + Ready" />
              <ReportKPICard label="Llamadas al mozo" value={d.waiterCallCount} icon={Users} subtitle="Este mes" />
              <ReportKPICard label="Solicitudes de cuenta" value={d.billRequestCount} icon={DollarSign} subtitle="Este mes" />
              <ReportKPICard label="Pedidos manuales (mozo)" value={d.manualOrders} icon={Zap} subtitle={d.totalOrdersMonth > 0 ? `${Math.round((d.manualOrders / d.totalOrdersMonth) * 100)}% del total` : ""} />
            </div>
            <div className="grid md:grid-cols-2 gap-4">
              <Card>
                <CardHeader><CardTitle className="text-sm">Adopción de features</CardTitle></CardHeader>
                <CardContent>
                  <div className="space-y-3">
                    {[
                      { label: "Tenants con mozos", value: d.tenantsWithStaff, total: d.activeTenantCount },
                      { label: "Tenants con QR/mesas", value: d.tenantsWithQR, total: d.activeTenantCount },
                    ].map(f => (
                      <div key={f.label}>
                        <div className="flex justify-between text-sm mb-1">
                          <span className="text-muted-foreground">{f.label}</span>
                          <span className="font-semibold">{f.value} / {f.total}</span>
                        </div>
                        <div className="h-2 bg-muted rounded-full overflow-hidden">
                          <div className="h-full rounded-full bg-primary/80" style={{ width: `${f.total > 0 ? (f.value / f.total) * 100 : 0}%` }} />
                        </div>
                      </div>
                    ))}
                  </div>
                </CardContent>
              </Card>
              <Card>
                <CardHeader><CardTitle className="text-sm">Resumen del sistema</CardTitle></CardHeader>
                <CardContent>
                  <div className="space-y-2 text-sm">
                    <div className="flex justify-between"><span className="text-muted-foreground">Total staff registrado</span><span className="font-semibold">{d.totalStaff}</span></div>
                    <div className="flex justify-between"><span className="text-muted-foreground">Total mesas</span><span className="font-semibold">{d.totalTables}</span></div>
                    <div className="flex justify-between"><span className="text-muted-foreground">Tenants totales</span><span className="font-semibold">{d.totalTenants}</span></div>
                    <div className="flex justify-between"><span className="text-muted-foreground">Pedidos totales (mes)</span><span className="font-semibold">{d.totalOrdersMonth}</span></div>
                  </div>
                </CardContent>
              </Card>
            </div>
          </div>
        </TabsContent>
      </Tabs>
    </div>
  );
}
