import { useMemo } from "react";
import { Users, PhoneCall, Receipt, LayoutGrid } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import ReportKPICard from "./ReportKPICard";
import { fmtMin } from "@/lib/report-utils";

interface WaiterCall {
  id: string;
  table_id: string;
  status: string;
  created_at: string;
}

interface BillRequest {
  id: string;
  table_id: string;
  status: string;
  requested_at: string;
  attended_at: string | null;
}

interface Order {
  id: string;
  table_id: string;
  session_id: string;
  delivered_at: string | null;
  status: string;
}

interface StaffUser {
  id: string;
  name: string;
}

interface TableInfo {
  id: string;
  assigned_waiter_id: string | null;
  number: number;
}

interface Session {
  id: string;
  table_id: string;
  closed_at: string | null;
}

interface Props {
  waiterCalls: WaiterCall[];
  billRequests: BillRequest[];
  orders: Order[];
  staff: StaffUser[];
  tables: TableInfo[];
  sessions: Session[];
}

export default function TeamTab({ waiterCalls, billRequests, orders, staff, tables, sessions }: Props) {
  // Avg waiter call response time
  const avgCallResponse = useMemo(() => {
    const attended = waiterCalls.filter(w => w.status === "attended");
    // We don't have attended_at on waiter_calls, so skip for now
    return 0;
  }, [waiterCalls]);

  // Bill request response time
  const avgBillResponse = useMemo(() => {
    const attended = billRequests.filter(b => b.attended_at);
    if (attended.length === 0) return 0;
    const total = attended.reduce((s, b) => {
      return s + (new Date(b.attended_at!).getTime() - new Date(b.requested_at).getTime()) / 1000;
    }, 0);
    return total / attended.length;
  }, [billRequests]);

  // Orders per waiter (via table assignment)
  const waiterStats = useMemo(() => {
    const tableToWaiter: Record<string, string> = {};
    tables.forEach(t => { if (t.assigned_waiter_id) tableToWaiter[t.id] = t.assigned_waiter_id; });

    const waiterOrders: Record<string, number> = {};
    const waiterSessions: Record<string, Set<string>> = {};

    orders.forEach(o => {
      const wid = tableToWaiter[o.table_id];
      if (wid) {
        waiterOrders[wid] = (waiterOrders[wid] ?? 0) + 1;
        if (!waiterSessions[wid]) waiterSessions[wid] = new Set();
        waiterSessions[wid].add(o.session_id);
      }
    });

    return staff.map(s => ({
      name: s.name,
      orders: waiterOrders[s.id] ?? 0,
      sessions: waiterSessions[s.id]?.size ?? 0,
    })).sort((a, b) => b.orders - a.orders);
  }, [orders, tables, staff]);

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <ReportKPICard label="Llamadas al mozo" value={waiterCalls.length} icon={PhoneCall} />
        <ReportKPICard label="Solicitudes de cuenta" value={billRequests.length} icon={Receipt} />
        <ReportKPICard label="Tiempo resp. cuenta" value={avgBillResponse > 0 ? fmtMin(avgBillResponse) : "N/A"} icon={Receipt} />
        <ReportKPICard label="Mozos activos" value={staff.length} icon={Users} />
      </div>

      <Card>
        <CardHeader><CardTitle className="text-sm">Rendimiento por mozo</CardTitle></CardHeader>
        <CardContent>
          {waiterStats.length === 0 ? (
            <p className="text-sm text-muted-foreground text-center py-8">Sin datos de asignación</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-border">
                    <th className="text-left py-2 text-muted-foreground font-medium">Mozo</th>
                    <th className="text-right py-2 text-muted-foreground font-medium">Pedidos</th>
                    <th className="text-right py-2 text-muted-foreground font-medium">Mesas atendidas</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {waiterStats.map(w => (
                    <tr key={w.name}>
                      <td className="py-2 font-medium text-foreground">{w.name}</td>
                      <td className="py-2 text-right font-semibold">{w.orders}</td>
                      <td className="py-2 text-right text-muted-foreground">{w.sessions}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
