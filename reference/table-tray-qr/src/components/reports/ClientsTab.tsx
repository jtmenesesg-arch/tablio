import { useMemo } from "react";
import { Users, TrendingDown, Heart, PieChart as PieIcon } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { PieChart, Pie, Cell, ResponsiveContainer, Tooltip, BarChart, Bar, XAxis, YAxis } from "recharts";
import ReportKPICard from "./ReportKPICard";

const PIE_COLORS = ["hsl(var(--primary))", "#10b981", "#f59e0b", "#8b5cf6", "#ec4899"];

interface Session {
  id: string;
  opened_at: string;
  total_amount: number;
}

interface Order {
  session_id: string;
}

interface BillRequest {
  tip_percentage: number | null;
  tip_amount: number | null;
  total_amount: number;
}

interface Props {
  sessions: Session[];
  orders: Order[];
  billRequests: BillRequest[];
}

export default function ClientsTab({ sessions, orders, billRequests }: Props) {
  // Sessions per day
  const sessionsPerDay = useMemo(() => {
    const map: Record<string, number> = {};
    sessions.forEach(s => {
      const day = s.opened_at.split("T")[0];
      map[day] = (map[day] ?? 0) + 1;
    });
    return Object.entries(map)
      .sort((a, b) => a[0].localeCompare(b[0]))
      .slice(-14)
      .map(([day, count]) => ({ day: day.slice(5), sesiones: count }));
  }, [sessions]);

  // Bounce rate: sessions with no orders
  const sessionWithOrder = new Set(orders.map(o => o.session_id));
  const totalSessions = sessions.length;
  const bounceSessions = sessions.filter(s => !sessionWithOrder.has(s.id)).length;
  const bounceRate = totalSessions > 0 ? Math.round((bounceSessions / totalSessions) * 100) : 0;

  // Tip distribution
  const tipData = useMemo(() => {
    const map: Record<string, number> = { "10%": 0, "15%": 0, "20%": 0, "Otro": 0, "Sin propina": 0 };
    billRequests.forEach(b => {
      if (!b.tip_percentage || b.tip_percentage === 0) {
        map["Sin propina"]++;
      } else if (b.tip_percentage === 10) {
        map["10%"]++;
      } else if (b.tip_percentage === 15) {
        map["15%"]++;
      } else if (b.tip_percentage === 20) {
        map["20%"]++;
      } else {
        map["Otro"]++;
      }
    });
    return Object.entries(map).filter(([, v]) => v > 0).map(([name, value]) => ({ name, value }));
  }, [billRequests]);

  // Avg tip
  const avgTip = useMemo(() => {
    const withTip = billRequests.filter(b => b.tip_percentage && b.tip_percentage > 0);
    if (withTip.length === 0) return 0;
    return Math.round(withTip.reduce((s, b) => s + (b.tip_percentage ?? 0), 0) / withTip.length);
  }, [billRequests]);

  const avgSessionsPerDay = sessionsPerDay.length > 0
    ? Math.round(sessionsPerDay.reduce((s, d) => s + d.sesiones, 0) / sessionsPerDay.length)
    : 0;

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <ReportKPICard label="Sesiones totales" value={totalSessions} icon={Users} subtitle={`~${avgSessionsPerDay}/día`} />
        <ReportKPICard label="Bounce rate" value={bounceRate + "%"} icon={TrendingDown} subtitle={`${bounceSessions} sin pedido`} />
        <ReportKPICard label="Propina promedio" value={avgTip + "%"} icon={Heart} />
        <ReportKPICard label="Cuentas con propina" value={billRequests.filter(b => (b.tip_amount ?? 0) > 0).length} icon={PieIcon} />
      </div>

      <div className="grid md:grid-cols-2 gap-4">
        <Card>
          <CardHeader><CardTitle className="text-sm">Sesiones por día</CardTitle></CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={220}>
              <BarChart data={sessionsPerDay}>
                <XAxis dataKey="day" tick={{ fontSize: 10 }} />
                <YAxis tick={{ fontSize: 10 }} />
                <Tooltip />
                <Bar dataKey="sesiones" fill="hsl(var(--primary))" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>

        <Card>
          <CardHeader><CardTitle className="text-sm">Distribución de propinas</CardTitle></CardHeader>
          <CardContent>
            {tipData.length === 0 ? (
              <p className="text-sm text-muted-foreground text-center py-8">Sin datos</p>
            ) : (
              <div className="flex items-center gap-4">
                <ResponsiveContainer width="50%" height={180}>
                  <PieChart>
                    <Pie data={tipData} dataKey="value" cx="50%" cy="50%" outerRadius={70} innerRadius={40}>
                      {tipData.map((_, i) => <Cell key={i} fill={PIE_COLORS[i % PIE_COLORS.length]} />)}
                    </Pie>
                    <Tooltip />
                  </PieChart>
                </ResponsiveContainer>
                <div className="space-y-2">
                  {tipData.map((d, i) => (
                    <div key={d.name} className="flex items-center gap-2 text-sm">
                      <div className="w-3 h-3 rounded-full" style={{ backgroundColor: PIE_COLORS[i % PIE_COLORS.length] }} />
                      <span className="text-muted-foreground">{d.name}</span>
                      <span className="font-semibold">{d.value}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
