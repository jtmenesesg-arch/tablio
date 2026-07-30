import { useMemo } from "react";
import { DollarSign, TrendingUp, Receipt, BarChart3, Heart } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer } from "recharts";
import ReportKPICard from "./ReportKPICard";
import { fmtCLP, pctChange } from "@/lib/report-utils";

interface Order {
  total_amount: number;
  confirmed_at: string;
  status: string;
  table_id: string;
  session_id: string;
}

interface Session {
  id: string;
  total_amount: number;
  tip_amount: number | null;
}

interface BillRequest {
  tip_amount: number | null;
  tip_percentage: number | null;
  total_amount: number;
  status?: string;
}

interface Props {
  orders: Order[];
  prevOrders: Order[];
  daysInPeriod: number;
  sessions: Session[];
  billRequests: BillRequest[];
}

export default function SalesTab({ orders, prevOrders, daysInPeriod, sessions, billRequests }: Props) {
  // Filter out cancelled orders for sales calculations
  const activeOrders = orders.filter(o => o.status !== "cancelled");
  const activePrevOrders = prevOrders.filter(o => o.status !== "cancelled");

  const totalSales = activeOrders.reduce((s, o) => s + o.total_amount, 0);
  const prevSales = activePrevOrders.reduce((s, o) => s + o.total_amount, 0);
  const totalOrders = activeOrders.length;
  const avgTicket = totalOrders > 0 ? Math.round(totalSales / totalOrders) : 0;

  // Tips from bill_requests (most accurate source)
  const paidBillRequests = billRequests.filter(b => b.status === 'paid');
  const totalTips = paidBillRequests.reduce((s, b) => s + (b.tip_amount ?? 0), 0);
  // Fallback: also sum from sessions if bill_requests is empty
  const totalTipsFromSessions = sessions.reduce((s, ses) => s + (ses.tip_amount ?? 0), 0);
  const tips = totalTips > 0 ? totalTips : totalTipsFromSessions;

  // Ticket per table (unique sessions)
  const uniqueSessions = new Set(activeOrders.map(o => o.session_id)).size;
  const avgTicketPerTable = uniqueSessions > 0 ? Math.round(totalSales / uniqueSessions) : 0;

  // Projection for month
  const daysPassed = Math.max(1, Math.min(daysInPeriod, new Date().getDate()));
  const dailyAvg = totalSales / daysPassed;
  const projection = Math.round(dailyAvg * daysInPeriod);

  // Hourly data (only active orders)
  const hourlyData = useMemo(() => {
    const hours: Record<number, number> = {};
    for (let h = 8; h <= 23; h++) hours[h] = 0;
    activeOrders.forEach(o => {
      const h = new Date(o.confirmed_at).getHours();
      hours[h] = (hours[h] ?? 0) + o.total_amount;
    });
    return Object.entries(hours).map(([h, v]) => ({ hora: `${h}:00`, ventas: v }));
  }, [activeOrders]);

  // Heatmap: day of week × hour
  const heatmap = useMemo(() => {
    const dayNames = ["Dom", "Lun", "Mar", "Mié", "Jue", "Vie", "Sáb"];
    const map: Record<string, number> = {};
    activeOrders.forEach(o => {
      const d = new Date(o.confirmed_at);
      const key = `${dayNames[d.getDay()]}-${d.getHours()}`;
      map[key] = (map[key] ?? 0) + o.total_amount;
    });
    let peak = { key: "", value: 0 };
    Object.entries(map).forEach(([k, v]) => { if (v > peak.value) peak = { key: k, value: v }; });
    return { map, peak, dayNames };
  }, [activeOrders]);

  // Peak days
  const peakDays = useMemo(() => {
    const dayNames = ["Dom", "Lun", "Mar", "Mié", "Jue", "Vie", "Sáb"];
    const daySales: Record<number, number> = {};
    activeOrders.forEach(o => {
      const dow = new Date(o.confirmed_at).getDay();
      daySales[dow] = (daySales[dow] ?? 0) + o.total_amount;
    });
    return Object.entries(daySales)
      .map(([d, v]) => ({ day: dayNames[Number(d)], ventas: v }))
      .sort((a, b) => b.ventas - a.ventas);
  }, [activeOrders]);

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 lg:grid-cols-5 gap-3">
        <ReportKPICard label="Ventas totales" value={fmtCLP(totalSales)} icon={DollarSign} trend={pctChange(totalSales, prevSales)} />
        <ReportKPICard label="Pedidos" value={totalOrders} icon={TrendingUp} trend={pctChange(totalOrders, activePrevOrders.length)} />
        <ReportKPICard label="Ticket promedio pedido" value={fmtCLP(avgTicket)} icon={Receipt} />
        <ReportKPICard label="Ticket promedio mesa" value={fmtCLP(avgTicketPerTable)} icon={BarChart3} subtitle={`${uniqueSessions} sesiones`} />
        <ReportKPICard label="Propinas recaudadas" value={fmtCLP(tips)} icon={Heart} subtitle={`${billRequests.filter(b => (b.tip_amount ?? 0) > 0).length} cuentas con propina`} />
      </div>

      {daysInPeriod >= 28 && (
        <Card>
          <CardContent className="p-4">
            <p className="text-xs text-muted-foreground">Proyección del mes</p>
            <p className="text-xl font-bold text-foreground">{fmtCLP(projection)}</p>
            <p className="text-xs text-muted-foreground">Basado en {fmtCLP(Math.round(dailyAvg))}/día</p>
          </CardContent>
        </Card>
      )}

      <Card>
        <CardHeader><CardTitle className="text-sm">Ventas por hora</CardTitle></CardHeader>
        <CardContent>
          <ResponsiveContainer width="100%" height={220}>
            <BarChart data={hourlyData}>
              <XAxis dataKey="hora" tick={{ fontSize: 10 }} />
              <YAxis tick={{ fontSize: 10 }} tickFormatter={(v) => `$${(v / 1000).toFixed(0)}k`} />
              <Tooltip formatter={(v: number) => fmtCLP(v)} />
              <Bar dataKey="ventas" fill="hsl(var(--primary))" radius={[4, 4, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </CardContent>
      </Card>

      <div className="grid md:grid-cols-2 gap-4">
        <Card>
          <CardHeader><CardTitle className="text-sm">Ventas por día de la semana</CardTitle></CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={200}>
              <BarChart data={peakDays} layout="vertical">
                <XAxis type="number" tick={{ fontSize: 10 }} tickFormatter={(v) => `$${(v/1000).toFixed(0)}k`} />
                <YAxis type="category" dataKey="day" tick={{ fontSize: 11 }} width={40} />
                <Tooltip formatter={(v: number) => fmtCLP(v)} />
                <Bar dataKey="ventas" fill="hsl(var(--primary))" radius={[0, 4, 4, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>

        <Card>
          <CardHeader><CardTitle className="text-sm">Heatmap: Pico de ventas</CardTitle></CardHeader>
          <CardContent>
            {heatmap.peak.key ? (
              <div className="space-y-2">
                <div className="text-center py-4">
                  <p className="text-3xl font-bold text-primary">{heatmap.peak.key.replace("-", " a las ")}:00</p>
                  <p className="text-sm text-muted-foreground mt-1">Peak de ventas: {fmtCLP(heatmap.peak.value)}</p>
                </div>
                <div className="grid grid-cols-7 gap-1">
                  {heatmap.dayNames.map(day => {
                    const dayTotal = Object.entries(heatmap.map)
                      .filter(([k]) => k.startsWith(day))
                      .reduce((s, [, v]) => s + v, 0);
                    const maxDay = Math.max(...heatmap.dayNames.map(d =>
                      Object.entries(heatmap.map).filter(([k]) => k.startsWith(d)).reduce((s, [, v]) => s + v, 0)
                    ), 1);
                    const intensity = dayTotal / maxDay;
                    return (
                      <div key={day} className="text-center">
                        <div
                          className="h-8 rounded"
                          style={{ backgroundColor: `hsl(var(--primary) / ${0.1 + intensity * 0.9})` }}
                        />
                        <span className="text-[10px] text-muted-foreground">{day}</span>
                      </div>
                    );
                  })}
                </div>
              </div>
            ) : (
              <p className="text-sm text-muted-foreground text-center py-8">Sin datos</p>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
