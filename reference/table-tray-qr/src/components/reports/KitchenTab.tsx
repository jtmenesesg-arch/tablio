import { useMemo } from "react";
import { Clock, Gauge, ChefHat, AlertTriangle } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer } from "recharts";
import ReportKPICard from "./ReportKPICard";
import { fmtMin } from "@/lib/report-utils";

interface Order {
  confirmed_at: string;
  kitchen_accepted_at: string | null;
  ready_at: string | null;
  delivered_at: string | null;
  status: string;
}

const BENCHMARK_MINUTES = 15;

interface Props { orders: Order[] }

export default function KitchenTab({ orders }: Props) {
  const withKitchen = orders.filter(o => o.kitchen_accepted_at && o.ready_at);

  // Avg prep time
  const avgPrepTime = useMemo(() => {
    if (withKitchen.length === 0) return 0;
    const total = withKitchen.reduce((s, o) => {
      return s + (new Date(o.ready_at!).getTime() - new Date(o.kitchen_accepted_at!).getTime()) / 1000;
    }, 0);
    return total / withKitchen.length;
  }, [withKitchen]);

  // Avg total time (confirm → deliver)
  const delivered = orders.filter(o => o.delivered_at && o.confirmed_at);
  const avgTotalTime = useMemo(() => {
    if (delivered.length === 0) return 0;
    const total = delivered.reduce((s, o) => {
      return s + (new Date(o.delivered_at!).getTime() - new Date(o.confirmed_at).getTime()) / 1000;
    }, 0);
    return total / delivered.length;
  }, [delivered]);

  // On time vs late
  const onTime = withKitchen.filter(o => {
    const mins = (new Date(o.ready_at!).getTime() - new Date(o.kitchen_accepted_at!).getTime()) / 60000;
    return mins <= BENCHMARK_MINUTES;
  }).length;
  const late = withKitchen.length - onTime;
  const onTimeRate = withKitchen.length > 0 ? Math.round((onTime / withKitchen.length) * 100) : 0;

  // Kitchen load by hour
  const loadByHour = useMemo(() => {
    const map: Record<number, number> = {};
    for (let h = 8; h <= 23; h++) map[h] = 0;
    orders.filter(o => o.kitchen_accepted_at).forEach(o => {
      const h = new Date(o.kitchen_accepted_at!).getHours();
      map[h] = (map[h] ?? 0) + 1;
    });
    return Object.entries(map).map(([h, count]) => ({ hora: `${h}:00`, pedidos: count }));
  }, [orders]);

  // Avg acceptance time (confirm → kitchen_accepted)
  const withAccepted = orders.filter(o => o.kitchen_accepted_at && o.confirmed_at);
  const avgAcceptTime = useMemo(() => {
    if (withAccepted.length === 0) return 0;
    const total = withAccepted.reduce((s, o) => {
      return s + (new Date(o.kitchen_accepted_at!).getTime() - new Date(o.confirmed_at).getTime()) / 1000;
    }, 0);
    return total / withAccepted.length;
  }, [withAccepted]);

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <ReportKPICard label="Tiempo prep. promedio" value={fmtMin(avgPrepTime)} icon={ChefHat} />
        <ReportKPICard label="Tiempo total promedio" value={fmtMin(avgTotalTime)} icon={Clock} subtitle="Confirmado → Entregado" />
        <ReportKPICard label="A tiempo (≤15 min)" value={onTimeRate + "%"} icon={Gauge} subtitle={`${onTime} a tiempo, ${late} tarde`} />
        <ReportKPICard label="Tiempo de aceptación" value={fmtMin(avgAcceptTime)} icon={AlertTriangle} subtitle="Confirmado → En cocina" />
      </div>

      <Card>
        <CardHeader><CardTitle className="text-sm">Carga de cocina por hora</CardTitle></CardHeader>
        <CardContent>
          <ResponsiveContainer width="100%" height={220}>
            <BarChart data={loadByHour}>
              <XAxis dataKey="hora" tick={{ fontSize: 10 }} />
              <YAxis tick={{ fontSize: 10 }} />
              <Tooltip />
              <Bar dataKey="pedidos" fill="hsl(var(--primary))" radius={[4, 4, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </CardContent>
      </Card>
    </div>
  );
}
