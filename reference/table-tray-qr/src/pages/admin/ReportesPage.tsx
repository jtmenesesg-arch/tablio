import { useEffect, useState, useCallback } from "react";
import { useAdmin } from "@/contexts/AdminContext";
import { supabase } from "@/integrations/supabase/client";
import { Loader2 } from "lucide-react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import PeriodSelector from "@/components/reports/PeriodSelector";
import SalesTab from "@/components/reports/SalesTab";
import OrdersTab from "@/components/reports/OrdersTab";
import MenuTab from "@/components/reports/MenuTab";
import TablesTab from "@/components/reports/TablesTab";
import KitchenTab from "@/components/reports/KitchenTab";
import TeamTab from "@/components/reports/TeamTab";
import ClientsTab from "@/components/reports/ClientsTab";
import { periodRange, fetchAll, type Period } from "@/lib/report-utils";

function exportOrdersCSV(orders: any[], period: string) {
  if (!orders.length) return;
  const headers = ['Número', 'Estado', 'Total', 'Mesa', 'Fecha'];
  const rows = orders
    .filter(o => o.status !== 'cancelled')
    .map(o => [
      String(o.order_number ?? '').padStart(3, '0'),
      o.status ?? '',
      String(o.total_amount ?? 0),
      String(o.table_id ?? ''),
      o.confirmed_at ? new Date(o.confirmed_at).toLocaleDateString('es-CL') : '',
    ]);
  const csv = [headers, ...rows].map(r => r.join(';')).join('\n');
  const blob = new Blob(['\uFEFF' + csv], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `reporte-${period}-${new Date().toISOString().slice(0, 10)}.csv`;
  a.click();
  URL.revokeObjectURL(url);
}

export default function ReportesPage() {
  const { branchId } = useAdmin();
  const [loading, setLoading] = useState(true);
  const [period, setPeriod] = useState<Period>("day");

  // Data
  const [orders, setOrders] = useState<any[]>([]);
  const [prevOrders, setPrevOrders] = useState<any[]>([]);
  const [orderItems, setOrderItems] = useState<any[]>([]);
  const [cancelledOrderItems, setCancelledOrderItems] = useState<any[]>([]);
  const [sessions, setSessions] = useState<any[]>([]);
  const [tables, setTables] = useState<any[]>([]);
  const [allMenuItems, setAllMenuItems] = useState<any[]>([]);
  const [categories, setCategories] = useState<any[]>([]);
  const [waiterCalls, setWaiterCalls] = useState<any[]>([]);
  const [billRequests, setBillRequests] = useState<any[]>([]);
  const [staff, setStaff] = useState<any[]>([]);

  const fetchData = useCallback(async () => {
    if (!branchId) return;
    setLoading(true);

    const { from, to } = periodRange(period);
    const prev = periodRange(period, -1);
    const fromStr = from.toISOString();
    const toStr = to.toISOString();
    const prevFromStr = prev.from.toISOString();
    const prevToStr = prev.to.toISOString();

    const f = (col: string, op: string, val: string | boolean) => ({ column: col, op, value: val });

    const [
      ordersData, prevOrdersData, sessionsData, tablesData,
      menuItemsData, categoriesData, waiterCallsData, billData, staffData,
    ] = await Promise.all([
      fetchAll("orders", "id, total_amount, confirmed_at, status, table_id, session_id, cancelled_reason, notes, kitchen_accepted_at, ready_at, delivered_at", [
        f("branch_id", "eq", branchId), f("confirmed_at", "gte", fromStr), f("confirmed_at", "lte", toStr),
      ]),
      fetchAll("orders", "id, total_amount, confirmed_at, status, table_id, session_id", [
        f("branch_id", "eq", branchId), f("confirmed_at", "gte", prevFromStr), f("confirmed_at", "lte", prevToStr),
      ]),
      fetchAll("table_sessions", "id, table_id, opened_at, closed_at, total_amount, tip_amount", [
        f("branch_id", "eq", branchId), f("opened_at", "gte", fromStr), f("opened_at", "lte", toStr),
      ]),
      supabase.from("tables").select("id, number, name, assigned_waiter_id, capacity").eq("branch_id", branchId).then(r => r.data ?? []),
      supabase.from("menu_items").select("id, name, category_id").then(r => r.data ?? []),
      supabase.from("categories").select("id, name, emoji").then(r => r.data ?? []),
      fetchAll("waiter_calls", "id, table_id, status, created_at", [
        f("branch_id", "eq", branchId), f("created_at", "gte", fromStr), f("created_at", "lte", toStr),
      ]),
      fetchAll("bill_requests", "id, table_id, status, requested_at, attended_at, tip_percentage, tip_amount, total_amount", [
        f("branch_id", "eq", branchId), f("requested_at", "gte", fromStr), f("requested_at", "lte", toStr),
      ]),
      supabase.from("staff_users").select("id, name").eq("branch_id", branchId).eq("is_active", true).eq("role", "waiter").then(r => r.data ?? []),
    ]);

    setOrders(ordersData);
    setPrevOrders(prevOrdersData);
    setSessions(sessionsData);
    setTables(tablesData);
    setAllMenuItems(menuItemsData);
    setCategories(categoriesData);
    setWaiterCalls(waiterCallsData);
    setBillRequests(billData);
    setStaff(staffData);

    // Fetch order items for current period orders
    const activeOrders = (ordersData as any[]).filter((o: any) => o.status !== "cancelled");
    const cancelledOrders = (ordersData as any[]).filter((o: any) => o.status === "cancelled");

    if (activeOrders.length > 0) {
      const ids = activeOrders.map((o: any) => o.id);
      // Batch in chunks of 100
      const chunks: string[][] = [];
      for (let i = 0; i < ids.length; i += 100) chunks.push(ids.slice(i, i + 100));
      const allItems: any[] = [];
      for (const chunk of chunks) {
        const { data } = await supabase.from("order_items").select("menu_item_name, menu_item_id, quantity, unit_price, subtotal, selected_modifiers").in("order_id", chunk);
        if (data) allItems.push(...data);
      }
      setOrderItems(allItems);
    } else {
      setOrderItems([]);
    }

    if (cancelledOrders.length > 0) {
      const ids = cancelledOrders.map((o: any) => o.id);
      const { data } = await supabase.from("order_items").select("menu_item_name, quantity").in("order_id", ids.slice(0, 100));
      setCancelledOrderItems(data ?? []);
    } else {
      setCancelledOrderItems([]);
    }

    setLoading(false);
  }, [branchId, period]);

  useEffect(() => { fetchData(); }, [fetchData]);

  const daysInPeriod = period === "day" ? 1 : period === "week" ? 7 : period === "month" ? 30 : 365;

  if (loading) {
    return <div className="flex items-center justify-center h-64"><Loader2 className="w-6 h-6 animate-spin text-muted-foreground" /></div>;
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between flex-wrap gap-2">
        <h1 className="text-xl font-bold text-foreground">Reportes</h1>
        <div className="flex items-center gap-3">
          <PeriodSelector value={period} onChange={setPeriod} />
          <button
            onClick={fetchData}
            className="flex items-center gap-1.5 rounded-lg border border-border px-3 py-2 text-sm font-medium text-foreground hover:bg-accent transition-colors"
          >
            ↻ Actualizar
          </button>
          <button
            onClick={() => exportOrdersCSV(orders, period)}
            disabled={loading || orders.length === 0}
            className="flex items-center gap-1.5 rounded-lg border border-border px-3 py-2 text-sm font-medium text-foreground hover:bg-accent transition-colors disabled:opacity-40"
          >
            <span>⬇</span> Exportar CSV
          </button>
        </div>
      </div>

      <Tabs defaultValue="ventas" className="space-y-4">
        <TabsList className="grid grid-cols-4 lg:grid-cols-7 h-auto">
          <TabsTrigger value="ventas" className="text-xs">Ventas</TabsTrigger>
          <TabsTrigger value="pedidos" className="text-xs">Pedidos</TabsTrigger>
          <TabsTrigger value="menu" className="text-xs">Menú</TabsTrigger>
          <TabsTrigger value="mesas" className="text-xs">Mesas</TabsTrigger>
          <TabsTrigger value="cocina" className="text-xs">Cocina</TabsTrigger>
          <TabsTrigger value="equipo" className="text-xs">Equipo</TabsTrigger>
          <TabsTrigger value="clientes" className="text-xs">Clientes</TabsTrigger>
        </TabsList>

        <TabsContent value="ventas">
          <SalesTab orders={orders} prevOrders={prevOrders} daysInPeriod={daysInPeriod} sessions={sessions} billRequests={billRequests} />
        </TabsContent>
        <TabsContent value="pedidos">
          <OrdersTab orders={orders} prevOrders={prevOrders} />
        </TabsContent>
        <TabsContent value="menu">
          <MenuTab orderItems={orderItems} allMenuItems={allMenuItems} categories={categories} cancelledOrderItems={cancelledOrderItems} />
        </TabsContent>
        <TabsContent value="mesas">
          <TablesTab sessions={sessions} orders={orders} tables={tables} totalTables={tables.length} />
        </TabsContent>
        <TabsContent value="cocina">
          <KitchenTab orders={orders} />
        </TabsContent>
        <TabsContent value="equipo">
          <TeamTab waiterCalls={waiterCalls} billRequests={billRequests} orders={orders} staff={staff} tables={tables} sessions={sessions} />
        </TabsContent>
        <TabsContent value="clientes">
          <ClientsTab sessions={sessions} orders={orders} billRequests={billRequests} />
        </TabsContent>
      </Tabs>
    </div>
  );
}
