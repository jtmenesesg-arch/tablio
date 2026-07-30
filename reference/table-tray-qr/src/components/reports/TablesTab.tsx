import { useMemo } from "react";
import { LayoutGrid, Clock, RotateCcw, DollarSign } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer } from "recharts";
import ReportKPICard from "./ReportKPICard";
import { fmtCLP, fmtMin } from "@/lib/report-utils";

interface Session {
  id: string;
  table_id: string;
  opened_at: string;
  closed_at: string | null;
  total_amount: number;
}

interface Order {
  table_id: string;
  session_id: string;
  confirmed_at: string;
  delivered_at: string | null;
  total_amount: number;
}

interface TableInfo {
  id: string;
  number: number;
  name: string | null;
}

interface Props {
  sessions: Session[];
  orders: Order[];
  tables: TableInfo[];
  totalTables: number;
}

export default function TablesTab({ sessions, orders, tables, totalTables }: Props) {
  // Avg session duration
  const closedSessions = sessions.filter(s => s.closed_at);
  const avgDuration = useMemo(() => {
    if (closedSessions.length === 0) return 0;
    const total = closedSessions.reduce((s, ses) => {
      return s + (new Date(ses.closed_at!).getTime() - new Date(ses.opened_at).getTime()) / 1000;
    }, 0);
    return total / closedSessions.length;
  }, [closedSessions]);

  // Table rotation (sessions per table)
  const tableRotation = useMemo(() => {
    const map: Record<string, number> = {};
    sessions.forEach(s => { map[s.table_id] = (map[s.table_id] ?? 0) + 1; });
    const total = Object.values(map).reduce((s, v) => s + v, 0);
    return { total, avg: totalTables > 0 ? (total / totalTables).toFixed(1) : "0" };
  }, [sessions, totalTables]);

  // Most profitable table
  const tableRevenue = useMemo(() => {
    const map: Record<string, number> = {};
    sessions.forEach(s => { map[s.table_id] = (map[s.table_id] ?? 0) + (s.total_amount ?? 0); });
    return Object.entries(map)
      .map(([id, rev]) => {
        const t = tables.find(t => t.id === id);
        return { label: t ? (t.name || `Mesa ${t.number}`) : id.slice(0, 6), revenue: rev };
      })
      .sort((a, b) => b.revenue - a.revenue);
  }, [sessions, tables]);

  // Occupancy by hour
  const occupancyByHour = useMemo(() => {
    const hourMap: Record<number, number> = {};
    for (let h = 8; h <= 23; h++) hourMap[h] = 0;
    sessions.forEach(s => {
      const h = new Date(s.opened_at).getHours();
      hourMap[h] = (hourMap[h] ?? 0) + 1;
    });
    return Object.entries(hourMap).map(([h, count]) => ({ hora: `${h}:00`, sesiones: count }));
  }, [sessions]);

  // Avg time from confirm to deliver
  const avgDeliveryTime = useMemo(() => {
    const delivered = orders.filter(o => o.delivered_at && o.confirmed_at);
    if (delivered.length === 0) return 0;
    const total = delivered.reduce((s, o) => {
      return s + (new Date(o.delivered_at!).getTime() - new Date(o.confirmed_at).getTime()) / 1000;
    }, 0);
    return total / delivered.length;
  }, [orders]);

  // Avg wait before first order per session
  const avgWaitFirstOrder = useMemo(() => {
    const sessionFirstOrder: Record<string, number> = {};
    const sessionOpened: Record<string, number> = {};
    sessions.forEach(s => { sessionOpened[s.id] = new Date(s.opened_at).getTime(); });
    orders.forEach(o => {
      const t = new Date(o.confirmed_at).getTime();
      if (!sessionFirstOrder[o.session_id] || t < sessionFirstOrder[o.session_id]) {
        sessionFirstOrder[o.session_id] = t;
      }
    });
    const waits: number[] = [];
    Object.entries(sessionFirstOrder).forEach(([sid, firstTime]) => {
      if (sessionOpened[sid]) {
        waits.push((firstTime - sessionOpened[sid]) / 1000);
      }
    });
    return waits.length > 0 ? waits.reduce((a, b) => a + b, 0) / waits.length : 0;
  }, [sessions, orders]);

  const activeSessions = sessions.filter(s => !s.closed_at).length;
  const occupancyRate = totalTables > 0 ? Math.round((activeSessions / totalTables) * 100) : 0;

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <ReportKPICard label="Tasa ocupación actual" value={occupancyRate + "%"} icon={LayoutGrid} subtitle={`${activeSessions} de ${totalTables} mesas`} />
        <ReportKPICard label="Tiempo promedio ocupación" value={fmtMin(avgDuration)} icon={Clock} />
        <ReportKPICard label="Rotación promedio" value={tableRotation.avg + "x"} icon={RotateCcw} subtitle={`${tableRotation.total} sesiones totales`} />
        <ReportKPICard label="Tiempo pedido→entrega" value={fmtMin(avgDeliveryTime)} icon={Clock} subtitle={avgWaitFirstOrder > 0 ? `Espera 1er pedido: ${fmtMin(avgWaitFirstOrder)}` : undefined} />
      </div>

      <div className="grid md:grid-cols-2 gap-4">
        <Card>
          <CardHeader><CardTitle className="text-sm">Ocupación por hora</CardTitle></CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={220}>
              <BarChart data={occupancyByHour}>
                <XAxis dataKey="hora" tick={{ fontSize: 10 }} />
                <YAxis tick={{ fontSize: 10 }} />
                <Tooltip />
                <Bar dataKey="sesiones" fill="hsl(var(--primary))" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>

        <Card>
          <CardHeader><CardTitle className="text-sm">Mesa más rentable</CardTitle></CardHeader>
          <CardContent>
            {tableRevenue.length === 0 ? (
              <p className="text-sm text-muted-foreground text-center py-8">Sin datos</p>
            ) : (
              <div className="space-y-2">
                {tableRevenue.slice(0, 10).map((t, i) => {
                  const max = tableRevenue[0]?.revenue ?? 1;
                  return (
                    <div key={t.label} className="flex items-center gap-3">
                      <span className="text-xs font-bold text-muted-foreground w-5">{i + 1}</span>
                      <div className="flex-1">
                        <p className="text-xs font-medium">{t.label}</p>
                        <div className="h-2 bg-muted rounded-full mt-1 overflow-hidden">
                          <div className="h-full rounded-full bg-primary/80" style={{ width: `${(t.revenue / max) * 100}%` }} />
                        </div>
                      </div>
                      <span className="text-sm font-semibold">{fmtCLP(t.revenue)}</span>
                    </div>
                  );
                })}
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
