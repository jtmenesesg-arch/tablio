import { useMemo } from "react";
import { ShoppingBag, XCircle, RotateCcw, StickyNote } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { PieChart, Pie, Cell, ResponsiveContainer, Tooltip } from "recharts";
import ReportKPICard from "./ReportKPICard";
import { fmtCLP, pctChange } from "@/lib/report-utils";

const PIE_COLORS = ["hsl(var(--primary))", "#10b981", "#f59e0b", "#ef4444", "#8b5cf6"];

interface Order {
  id: string;
  total_amount: number;
  confirmed_at: string;
  status: string;
  table_id: string;
  session_id: string;
  cancelled_reason: string | null;
  notes: string | null;
}

interface Props {
  orders: Order[];
  prevOrders: Order[];
}

export default function OrdersTab({ orders, prevOrders }: Props) {
  const total = orders.length;
  const delivered = orders.filter(o => o.status === "delivered").length;
  const cancelled = orders.filter(o => o.status === "cancelled").length;
  const inKitchen = orders.filter(o => ["confirmed", "in_kitchen"].includes(o.status)).length;
  const ready = orders.filter(o => o.status === "ready").length;
  const cancelRate = total > 0 ? Math.round((cancelled / total) * 100) : 0;
  const withNotes = orders.filter(o => o.notes && o.notes.trim().length > 0).length;
  const notesPct = total > 0 ? Math.round((withNotes / total) * 100) : 0;

  // Re-orders per session
  const sessionCounts = useMemo(() => {
    const map: Record<string, number> = {};
    orders.forEach(o => { map[o.session_id] = (map[o.session_id] ?? 0) + 1; });
    const multiOrder = Object.values(map).filter(c => c > 1).length;
    const totalSessions = Object.keys(map).length;
    return { multiOrder, totalSessions, rate: totalSessions > 0 ? Math.round((multiOrder / totalSessions) * 100) : 0 };
  }, [orders]);

  // Revenue by table
  const tableRevenue = useMemo(() => {
    const map: Record<string, number> = {};
    orders.filter(o => o.status !== "cancelled").forEach(o => {
      map[o.table_id] = (map[o.table_id] ?? 0) + o.total_amount;
    });
    return Object.entries(map)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 10)
      .map(([id, revenue]) => ({ id: id.slice(0, 6), revenue }));
  }, [orders]);

  // Cancel reasons
  const cancelReasons = useMemo(() => {
    const map: Record<string, number> = {};
    orders.filter(o => o.status === "cancelled" && o.cancelled_reason).forEach(o => {
      const reason = o.cancelled_reason || "Sin motivo";
      map[reason] = (map[reason] ?? 0) + 1;
    });
    return Object.entries(map).sort((a, b) => b[1] - a[1]).slice(0, 5);
  }, [orders]);

  const statusData = [
    { name: "Entregados", value: delivered },
    { name: "En cocina", value: inKitchen },
    { name: "Listos", value: ready },
    { name: "Cancelados", value: cancelled },
  ].filter(d => d.value > 0);

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <ReportKPICard label="Total pedidos" value={total} icon={ShoppingBag} trend={pctChange(total, prevOrders.length)} />
        <ReportKPICard label="Tasa cancelación" value={cancelRate + "%"} icon={XCircle} subtitle={`${cancelled} cancelados`} />
        <ReportKPICard label="Re-pedidos (misma sesión)" value={sessionCounts.rate + "%"} icon={RotateCcw} subtitle={`${sessionCounts.multiOrder} de ${sessionCounts.totalSessions} sesiones`} />
        <ReportKPICard label="Con notas especiales" value={notesPct + "%"} icon={StickyNote} subtitle={`${withNotes} pedidos`} />
      </div>

      <div className="grid md:grid-cols-2 gap-4">
        <Card>
          <CardHeader><CardTitle className="text-sm">Pedidos por estado</CardTitle></CardHeader>
          <CardContent>
            {statusData.length === 0 ? (
              <p className="text-sm text-muted-foreground text-center py-8">Sin datos</p>
            ) : (
              <div className="flex items-center gap-4">
                <ResponsiveContainer width="50%" height={180}>
                  <PieChart>
                    <Pie data={statusData} dataKey="value" cx="50%" cy="50%" outerRadius={70} innerRadius={40}>
                      {statusData.map((_, i) => <Cell key={i} fill={PIE_COLORS[i % PIE_COLORS.length]} />)}
                    </Pie>
                    <Tooltip />
                  </PieChart>
                </ResponsiveContainer>
                <div className="space-y-2">
                  {statusData.map((d, i) => (
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

        <Card>
          <CardHeader><CardTitle className="text-sm">Motivos de cancelación</CardTitle></CardHeader>
          <CardContent>
            {cancelReasons.length === 0 ? (
              <p className="text-sm text-muted-foreground text-center py-8">Sin cancelaciones</p>
            ) : (
              <div className="space-y-2">
                {cancelReasons.map(([reason, count]) => (
                  <div key={reason} className="flex items-center justify-between text-sm">
                    <span className="text-foreground truncate max-w-[200px]">{reason}</span>
                    <span className="font-semibold">{count}</span>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader><CardTitle className="text-sm">Ingresos por mesa (Top 10)</CardTitle></CardHeader>
        <CardContent>
          {tableRevenue.length === 0 ? (
            <p className="text-sm text-muted-foreground text-center py-8">Sin datos</p>
          ) : (
            <div className="space-y-2">
              {tableRevenue.map((t, i) => {
                const max = tableRevenue[0]?.revenue ?? 1;
                return (
                  <div key={t.id} className="flex items-center gap-3">
                    <span className="text-xs font-bold text-muted-foreground w-5">{i + 1}</span>
                    <div className="flex-1">
                      <div className="h-5 bg-muted rounded-full overflow-hidden">
                        <div className="h-full rounded-full bg-primary/80" style={{ width: `${(t.revenue / max) * 100}%` }} />
                      </div>
                    </div>
                    <span className="text-sm font-semibold min-w-[80px] text-right">{fmtCLP(t.revenue)}</span>
                  </div>
                );
              })}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
