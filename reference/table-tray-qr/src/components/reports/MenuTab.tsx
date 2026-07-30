import { useMemo } from "react";
import { Flame, TrendingDown, Tag, Settings2 } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer } from "recharts";
import ReportKPICard from "./ReportKPICard";
import { fmtCLP } from "@/lib/report-utils";

const COLORS = ["hsl(var(--primary))", "#10b981", "#f59e0b", "#8b5cf6", "#ec4899", "#06b6d4", "#ef4444", "#84cc16", "#6366f1", "#f97316"];

interface OrderItem {
  menu_item_name: string;
  menu_item_id: string;
  quantity: number;
  unit_price: number;
  subtotal: number;
  selected_modifiers: unknown;
}

interface AllMenuItem {
  id: string;
  name: string;
  category_id: string;
}

interface Category {
  id: string;
  name: string;
  emoji: string | null;
}

interface CancelledOrder {
  id: string;
  items: string[];
}

interface Props {
  orderItems: OrderItem[];
  allMenuItems: AllMenuItem[];
  categories: Category[];
  cancelledOrderItems: { menu_item_name: string; quantity: number }[];
}

export default function MenuTab({ orderItems, allMenuItems, categories, cancelledOrderItems }: Props) {
  // Top 10 by quantity
  const topByQty = useMemo(() => {
    const map: Record<string, number> = {};
    orderItems.forEach(i => { map[i.menu_item_name] = (map[i.menu_item_name] ?? 0) + i.quantity; });
    return Object.entries(map).sort((a, b) => b[1] - a[1]).slice(0, 10).map(([name, qty]) => ({ name, qty }));
  }, [orderItems]);

  // Top 10 by revenue
  const topByRevenue = useMemo(() => {
    const map: Record<string, number> = {};
    orderItems.forEach(i => { map[i.menu_item_name] = (map[i.menu_item_name] ?? 0) + i.subtotal; });
    return Object.entries(map).sort((a, b) => b[1] - a[1]).slice(0, 10).map(([name, revenue]) => ({ name, revenue }));
  }, [orderItems]);

  // Items never ordered
  const orderedIds = new Set(orderItems.map(i => i.menu_item_id));
  const neverOrdered = allMenuItems.filter(m => !orderedIds.has(m.id));

  // Category popularity
  const categoryData = useMemo(() => {
    const itemToCategory: Record<string, string> = {};
    allMenuItems.forEach(m => { itemToCategory[m.id] = m.category_id; });
    const catMap: Record<string, number> = {};
    orderItems.forEach(i => {
      const catId = itemToCategory[i.menu_item_id];
      if (catId) catMap[catId] = (catMap[catId] ?? 0) + i.quantity;
    });
    return Object.entries(catMap)
      .map(([id, qty]) => {
        const cat = categories.find(c => c.id === id);
        return { name: cat ? `${cat.emoji ?? ""} ${cat.name}`.trim() : id.slice(0, 6), qty };
      })
      .sort((a, b) => b.qty - a.qty);
  }, [orderItems, allMenuItems, categories]);

  // Top modifiers
  const topModifiers = useMemo(() => {
    const map: Record<string, number> = {};
    orderItems.forEach(i => {
      if (Array.isArray(i.selected_modifiers)) {
        (i.selected_modifiers as { name?: string }[]).forEach(m => {
          if (m && typeof m === "object" && m.name) {
            map[m.name] = (map[m.name] ?? 0) + 1;
          }
        });
      }
    });
    return Object.entries(map).sort((a, b) => b[1] - a[1]).slice(0, 10);
  }, [orderItems]);

  // Items with highest cancellation
  const cancelledItems = useMemo(() => {
    const map: Record<string, number> = {};
    cancelledOrderItems.forEach(i => { map[i.menu_item_name] = (map[i.menu_item_name] ?? 0) + i.quantity; });
    return Object.entries(map).sort((a, b) => b[1] - a[1]).slice(0, 5);
  }, [cancelledOrderItems]);

  const uniqueItems = new Set(orderItems.map(i => i.menu_item_name)).size;

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <ReportKPICard label="Platos distintos vendidos" value={uniqueItems} icon={Flame} subtitle={`de ${allMenuItems.length} totales`} />
        <ReportKPICard label="Nunca pedidos" value={neverOrdered.length} icon={TrendingDown} subtitle="Candidatos a eliminar" />
        <ReportKPICard label="Categorías activas" value={categoryData.length} icon={Tag} />
        <ReportKPICard label="Modificadores usados" value={topModifiers.length} icon={Settings2} />
      </div>

      <div className="grid md:grid-cols-2 gap-4">
        <Card>
          <CardHeader><CardTitle className="text-sm">Top 10 por cantidad</CardTitle></CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={300}>
              <BarChart data={topByQty} layout="vertical">
                <XAxis type="number" tick={{ fontSize: 10 }} />
                <YAxis type="category" dataKey="name" tick={{ fontSize: 10 }} width={100} />
                <Tooltip />
                <Bar dataKey="qty" fill="hsl(var(--primary))" radius={[0, 4, 4, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>

        <Card>
          <CardHeader><CardTitle className="text-sm">Top 10 por revenue</CardTitle></CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={300}>
              <BarChart data={topByRevenue} layout="vertical">
                <XAxis type="number" tick={{ fontSize: 10 }} tickFormatter={v => `$${(v/1000).toFixed(0)}k`} />
                <YAxis type="category" dataKey="name" tick={{ fontSize: 10 }} width={100} />
                <Tooltip formatter={(v: number) => fmtCLP(v)} />
                <Bar dataKey="revenue" fill="#10b981" radius={[0, 4, 4, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>
      </div>

      <div className="grid md:grid-cols-2 gap-4">
        <Card>
          <CardHeader><CardTitle className="text-sm">Categorías más populares</CardTitle></CardHeader>
          <CardContent>
            {categoryData.length === 0 ? (
              <p className="text-sm text-muted-foreground text-center py-8">Sin datos</p>
            ) : (
              <div className="space-y-2">
                {categoryData.map((c, i) => {
                  const max = categoryData[0]?.qty ?? 1;
                  return (
                    <div key={c.name} className="flex items-center gap-3">
                      <div className="flex-1">
                        <p className="text-sm font-medium">{c.name}</p>
                        <div className="h-2 bg-muted rounded-full mt-1 overflow-hidden">
                          <div className="h-full rounded-full" style={{ width: `${(c.qty / max) * 100}%`, backgroundColor: COLORS[i % COLORS.length] }} />
                        </div>
                      </div>
                      <span className="text-sm font-semibold">{c.qty}</span>
                    </div>
                  );
                })}
              </div>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader><CardTitle className="text-sm">Modificadores más elegidos</CardTitle></CardHeader>
          <CardContent>
            {topModifiers.length === 0 ? (
              <p className="text-sm text-muted-foreground text-center py-8">Sin modificadores</p>
            ) : (
              <div className="space-y-2">
                {topModifiers.map(([name, count]) => (
                  <div key={name} className="flex items-center justify-between text-sm">
                    <span className="text-foreground">{name}</span>
                    <span className="font-semibold">{count}</span>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      <div className="grid md:grid-cols-2 gap-4">
        <Card>
          <CardHeader><CardTitle className="text-sm">Platos nunca pedidos</CardTitle></CardHeader>
          <CardContent>
            {neverOrdered.length === 0 ? (
              <p className="text-sm text-muted-foreground text-center py-8">Todos tienen ventas 🎉</p>
            ) : (
              <div className="space-y-1 max-h-48 overflow-y-auto">
                {neverOrdered.map(m => (
                  <p key={m.id} className="text-sm text-muted-foreground">{m.name}</p>
                ))}
              </div>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader><CardTitle className="text-sm">Platos con más cancelaciones</CardTitle></CardHeader>
          <CardContent>
            {cancelledItems.length === 0 ? (
              <p className="text-sm text-muted-foreground text-center py-8">Sin cancelaciones</p>
            ) : (
              <div className="space-y-2">
                {cancelledItems.map(([name, count]) => (
                  <div key={name} className="flex items-center justify-between text-sm">
                    <span className="text-foreground truncate max-w-[200px]">{name}</span>
                    <span className="font-semibold text-destructive">{count}</span>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
