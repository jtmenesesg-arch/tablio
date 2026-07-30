import { useEffect, useState, useRef } from 'react';
import { useWaiters } from '@/contexts/WaitersContext';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { useToast } from '@/hooks/use-toast';
import { Bell, Receipt, ChefHat, Loader2, UtensilsCrossed, CheckCircle2, Truck } from 'lucide-react';
import { formatCLP } from '@/lib/format';
import { motion, AnimatePresence } from 'framer-motion';

interface TableGroup {
  tableId: string;
  tableNumber: number;
  calls: CallNotif[];
  billRequests: BillNotif[];
  orders: OrderNotif[];
}

interface CallNotif {
  id: string;
  createdAt: string;
  reason: string;
}

interface BillNotif {
  id: string;
  createdAt: string;
  totalAmount: number;
  tipAmount: number;
}

interface OrderNotif {
  id: string;
  orderNumber: number;
  status: string;
  createdAt: string;
  items: { menu_item_name: string; quantity: number }[];
}

function minutesAgo(d: string) {
  return Math.floor((Date.now() - new Date(d).getTime()) / 60000);
}

function timeAgo(iso: string): string {
  const mins = Math.floor((Date.now() - new Date(iso).getTime()) / 60000);
  if (mins < 1) return "ahora";
  if (mins === 1) return "hace 1 min";
  return `hace ${mins} min`;
}

function playSound() {
  try {
    const ctx = new AudioContext();
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.frequency.setValueAtTime(880, ctx.currentTime);
    osc.frequency.setValueAtTime(660, ctx.currentTime + 0.1);
    gain.gain.setValueAtTime(0.3, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.4);
    osc.start(ctx.currentTime);
    osc.stop(ctx.currentTime + 0.4);
  } catch {}
}

async function getMyTableIds(branchId: string, staffId: string): Promise<string[]> {
  const { data } = await supabase
    .from('tables')
    .select('id, assigned_waiter_id')
    .eq('branch_id', branchId);
  if (!data) return [];
  return data
    .filter(t => t.assigned_waiter_id === staffId)
    .map(t => t.id);
}

const STATUS_LABELS: Record<string, string> = {
  confirmed: 'Nuevo',
  in_kitchen: 'En cocina',
  ready: 'Listo para entregar',
  delivered: 'Entregado',
};

const STATUS_COLORS: Record<string, string> = {
  confirmed: 'bg-red-100 text-red-700 border-red-200',
  in_kitchen: 'bg-amber-100 text-amber-700 border-amber-200',
  ready: 'bg-green-100 text-green-700 border-green-200',
};

export default function MozoNotificacionesPage() {
  const { branchId, staffId } = useWaiters();
  const { toast } = useToast();
  const [groups, setGroups] = useState<TableGroup[]>([]);
  const [loading, setLoading] = useState(true);
  const [actionLoading, setActionLoading] = useState<string | null>(null);
  const soundEnabled = useRef(false);

  const fetchAll = async () => {
    const myTableIds = await getMyTableIds(branchId, staffId);
    if (myTableIds.length === 0) {
      setGroups([]);
      setLoading(false);
      return;
    }

    // Fetch table numbers
    const { data: tablesData } = await supabase
      .from('tables')
      .select('id, number')
      .in('id', myTableIds);
    const tableMap: Record<string, number> = {};
    tablesData?.forEach(t => { tableMap[t.id] = t.number; });

    const [{ data: calls }, { data: bills }, { data: ordersData }] = await Promise.all([
      supabase
        .from('waiter_calls')
        .select('id, table_id, created_at, reason, status')
        .eq('branch_id', branchId)
        .eq('status', 'pending')
        .in('table_id', myTableIds)
        .order('created_at', { ascending: false }),
      supabase
        .from('bill_requests')
        .select('id, table_id, requested_at, total_amount, tip_amount, status')
        .eq('branch_id', branchId)
        .eq('status', 'pending')
        .in('table_id', myTableIds)
        .order('requested_at', { ascending: false }),
      supabase
        .from('orders')
        .select('id, table_id, confirmed_at, order_number, status')
        .eq('branch_id', branchId)
        .in('status', ['confirmed', 'in_kitchen', 'ready'])
        .in('table_id', myTableIds)
        .order('confirmed_at', { ascending: false }),
    ]);

    // Get order items
    let orderItemsMap: Record<string, { menu_item_name: string; quantity: number }[]> = {};
    if (ordersData && ordersData.length > 0) {
      const { data: items } = await supabase
        .from('order_items')
        .select('order_id, menu_item_name, quantity')
        .in('order_id', ordersData.map(o => o.id));
      items?.forEach(i => {
        if (!orderItemsMap[i.order_id]) orderItemsMap[i.order_id] = [];
        orderItemsMap[i.order_id].push(i);
      });
    }

    // Group by table
    const groupMap: Record<string, TableGroup> = {};

    const ensureGroup = (tableId: string) => {
      if (!groupMap[tableId]) {
        groupMap[tableId] = {
          tableId,
          tableNumber: tableMap[tableId] ?? 0,
          calls: [],
          billRequests: [],
          orders: [],
        };
      }
      return groupMap[tableId];
    };

    calls?.forEach(c => {
      ensureGroup(c.table_id).calls.push({
        id: c.id,
        createdAt: c.created_at ?? '',
        reason: c.reason ?? 'help',
      });
    });

    bills?.forEach(b => {
      ensureGroup(b.table_id).billRequests.push({
        id: b.id,
        createdAt: b.requested_at ?? '',
        totalAmount: b.total_amount,
        tipAmount: b.tip_amount ?? 0,
      });
    });

    ordersData?.forEach(o => {
      ensureGroup(o.table_id).orders.push({
        id: o.id,
        orderNumber: o.order_number,
        status: o.status ?? 'confirmed',
        createdAt: o.confirmed_at ?? '',
        items: orderItemsMap[o.id] ?? [],
      });
    });

    // Sort groups: tables with urgent items first
    const sorted = Object.values(groupMap).sort((a, b) => {
      const aUrgent = a.calls.length + a.billRequests.length + a.orders.filter(o => o.status === 'confirmed').length;
      const bUrgent = b.calls.length + b.billRequests.length + b.orders.filter(o => o.status === 'confirmed').length;
      return bUrgent - aUrgent || a.tableNumber - b.tableNumber;
    });

    setGroups(sorted);
    setLoading(false);
  };

  useEffect(() => {
    fetchAll();

    const channel = supabase
      .channel('mozo-notifs')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'waiter_calls', filter: `branch_id=eq.${branchId}` }, () => { fetchAll(); if (soundEnabled.current) { playSound(); navigator.vibrate?.(200); } })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'bill_requests', filter: `branch_id=eq.${branchId}` }, () => { fetchAll(); if (soundEnabled.current) { playSound(); navigator.vibrate?.(200); } })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'orders', filter: `branch_id=eq.${branchId}` }, () => { fetchAll(); if (soundEnabled.current) { playSound(); navigator.vibrate?.(200); } })
      .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'tables', filter: `branch_id=eq.${branchId}` }, () => fetchAll())
      .subscribe();

    const enableSound = () => { soundEnabled.current = true; };
    document.addEventListener('click', enableSound, { once: true });

    return () => {
      supabase.removeChannel(channel);
      document.removeEventListener('click', enableSound);
    };
  }, [branchId, staffId]);

  const handleCallAttend = async (id: string) => {
    setActionLoading(id);
    await supabase.from('waiter_calls').update({ status: 'attended' }).eq('id', id);
    toast({ title: 'Llamada atendida' });
    fetchAll();
    setActionLoading(null);
  };

  const handleBillAttend = async (id: string, tableId: string) => {
    setActionLoading(id);
    await supabase.from('bill_requests').update({ status: 'attending', attended_at: new Date().toISOString() }).eq('id', id);
    toast({ title: 'Cuenta en camino' });
    fetchAll();
    setActionLoading(null);
  };

  const handleBillClose = async (billId: string, tableId: string) => {
    setActionLoading(billId);
    const now = new Date().toISOString();
    await supabase.from('bill_requests').update({ status: 'paid', attended_at: now }).eq('id', billId);
    await supabase.from('table_sessions').update({ is_active: false, closed_at: now }).eq('table_id', tableId).eq('is_active', true);
    await supabase.from('orders').update({ status: 'delivered', delivered_at: now }).eq('table_id', tableId).in('status', ['confirmed', 'in_kitchen', 'ready']);
    await supabase.from('tables').update({ status: 'free', assigned_waiter_id: null }).eq('id', tableId);
    toast({ title: 'Mesa cerrada y cuenta completada ✓' });
    fetchAll();
    setActionLoading(null);
  };

  const handleOrderAction = async (order: OrderNotif) => {
    setActionLoading(order.id);
    const now = new Date().toISOString();
    if (order.status === 'confirmed') {
      await supabase.from('orders').update({ status: 'in_kitchen', kitchen_accepted_at: now }).eq('id', order.id);
      toast({ title: `Pedido #${order.orderNumber} enviado a cocina` });
    } else if (order.status === 'in_kitchen') {
      await supabase.from('orders').update({ status: 'ready', ready_at: now }).eq('id', order.id);
      toast({ title: `Pedido #${order.orderNumber} listo` });
    } else if (order.status === 'ready') {
      await supabase.from('orders').update({ status: 'delivered', delivered_at: now }).eq('id', order.id);
      toast({ title: `Pedido #${order.orderNumber} entregado` });
    }
    fetchAll();
    setActionLoading(null);
  };

  const getOrderActionLabel = (status: string) => {
    switch (status) {
      case 'confirmed': return 'Enviar a cocina';
      case 'in_kitchen': return 'Marcar listo';
      case 'ready': return 'Marcar entregado';
      default: return '';
    }
  };

  const getOrderActionIcon = (status: string) => {
    switch (status) {
      case 'confirmed': return <ChefHat className="w-4 h-4 mr-1.5" />;
      case 'in_kitchen': return <CheckCircle2 className="w-4 h-4 mr-1.5" />;
      case 'ready': return <Truck className="w-4 h-4 mr-1.5" />;
      default: return null;
    }
  };

  const getOrderActionStyle = (status: string) => {
    switch (status) {
      case 'confirmed': return 'bg-primary hover:bg-primary/90 text-primary-foreground';
      case 'in_kitchen': return 'bg-amber-600 hover:bg-amber-700 text-white';
      case 'ready': return 'bg-green-600 hover:bg-green-700 text-white';
      default: return '';
    }
  };

  const REASON_MAP: Record<string, string> = { help: 'Necesita ayuda', problem: 'Problema', change: 'Cambio' };

  const totalNotifs = groups.reduce((acc, g) => acc + g.calls.length + g.billRequests.length + g.orders.length, 0);

  if (loading) return <div className="flex items-center justify-center h-64"><Loader2 className="w-6 h-6 animate-spin text-muted-foreground" /></div>;

  return (
    <div className="p-4">
      <h2 className="text-lg font-bold text-foreground mb-4">
        Notificaciones
        {totalNotifs > 0 && (
          <Badge variant="destructive" className="ml-2 text-xs">{totalNotifs}</Badge>
        )}
      </h2>

      {groups.length === 0 ? (
        <div className="text-center py-16">
          <Bell className="w-10 h-10 text-muted-foreground/40 mx-auto mb-2" />
          <p className="text-muted-foreground text-sm">Sin notificaciones pendientes</p>
          <p className="text-muted-foreground/60 text-xs mt-1">Las alertas aparecerán aquí agrupadas por mesa</p>
        </div>
      ) : (
        <AnimatePresence mode="popLayout">
          <div className="space-y-4">
            {groups.map(group => (
              <motion.div
                key={group.tableId}
                layout
                initial={{ opacity: 0, y: -10 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, x: 100 }}
                className="bg-card border border-border rounded-xl overflow-hidden"
              >
                {/* Table header */}
                <div className="bg-muted/50 px-4 py-2.5 flex items-center justify-between border-b border-border">
                  <div className="flex items-center gap-2">
                    <span className="text-lg font-bold text-foreground">Mesa {group.tableNumber}</span>
                    <div className="flex gap-1">
                      {group.calls.length > 0 && (
                        <Badge variant="outline" className="text-[10px] bg-amber-50 text-amber-700 border-amber-200">
                          🛎 {group.calls.length}
                        </Badge>
                      )}
                      {group.billRequests.length > 0 && (
                        <Badge variant="outline" className="text-[10px] bg-red-50 text-red-700 border-red-200">
                          🧾 {group.billRequests.length}
                        </Badge>
                      )}
                      {group.orders.length > 0 && (
                        <Badge variant="outline" className="text-[10px] bg-blue-50 text-blue-700 border-blue-200">
                          🍳 {group.orders.length}
                        </Badge>
                      )}
                    </div>
                  </div>
                </div>

                <div className="p-3 space-y-2.5">
                  {/* Calls */}
                  {group.calls.map(call => {
                    const isUrgent = ((Date.now() - new Date(call.createdAt).getTime()) / 60000) > 5;
                    return (
                      <div key={`call-${call.id}`} className={`flex items-center gap-3 bg-amber-50 rounded-lg p-3 border border-amber-100 ${isUrgent ? 'animate-pulse ring-1 ring-red-400' : ''}`}>
                        <div className="w-9 h-9 rounded-full bg-amber-100 flex items-center justify-center shrink-0">
                          <Bell className="w-4 h-4 text-amber-700" />
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-semibold text-foreground">Llamada de mozo</p>
                          <p className="text-xs text-muted-foreground">{REASON_MAP[call.reason] ?? call.reason}</p>
                          <span className="text-[11px] text-muted-foreground">{timeAgo(call.createdAt)}</span>
                        </div>
                        <Button
                          size="sm"
                          variant="outline"
                          className="shrink-0 h-8"
                          disabled={actionLoading === call.id}
                          onClick={() => handleCallAttend(call.id)}
                        >
                          {actionLoading === call.id ? <Loader2 className="w-3 h-3 animate-spin" /> : 'Atender'}
                        </Button>
                      </div>
                    );
                  })}

                  {/* Bill requests */}
                  {group.billRequests.map(bill => {
                    const isUrgent = ((Date.now() - new Date(bill.createdAt).getTime()) / 60000) > 5;
                    return (
                      <div key={`bill-${bill.id}`} className={`bg-red-50 rounded-lg p-3 border border-red-100 ${isUrgent ? 'animate-pulse ring-1 ring-red-400' : ''}`}>
                        <div className="flex items-center gap-3 mb-2">
                          <div className="w-9 h-9 rounded-full bg-red-100 flex items-center justify-center shrink-0">
                            <Receipt className="w-4 h-4 text-red-700" />
                          </div>
                          <div className="flex-1 min-w-0">
                            <p className="text-sm font-semibold text-foreground">Pide la cuenta</p>
                            <p className="text-xs text-muted-foreground">
                              {formatCLP(bill.totalAmount)}
                              {bill.tipAmount > 0 && ` · Propina: ${formatCLP(bill.tipAmount)}`}
                            </p>
                            <span className="text-[11px] text-muted-foreground">{timeAgo(bill.createdAt)}</span>
                          </div>
                        </div>
                        <div className="flex gap-2">
                          <Button
                            size="sm"
                            variant="destructive"
                            className="flex-1 h-8"
                            disabled={actionLoading === bill.id}
                            onClick={() => handleBillClose(bill.id, group.tableId)}
                          >
                            {actionLoading === bill.id ? <Loader2 className="w-3 h-3 animate-spin" /> : '✓ Cobrar y cerrar mesa'}
                          </Button>
                        </div>
                      </div>
                    );
                  })}

                  {/* Orders grouped by status */}
                  {group.orders.map(order => {
                    const isUrgent = ((Date.now() - new Date(order.createdAt).getTime()) / 60000) > 5;
                    return (
                      <div key={`order-${order.id}`} className={`rounded-lg p-3 border ${STATUS_COLORS[order.status] ?? 'bg-muted/50 border-border'} ${isUrgent ? 'animate-pulse ring-1 ring-red-400' : ''}`}>
                        <div className="flex items-start justify-between mb-1.5">
                          <div className="flex items-center gap-2">
                            <UtensilsCrossed className="w-4 h-4" />
                            <span className="text-sm font-bold">Pedido #{order.orderNumber}</span>
                          </div>
                          <Badge variant="outline" className="text-[10px] border-current">
                            {STATUS_LABELS[order.status] ?? order.status}
                          </Badge>
                        </div>
                        <div className="text-xs space-y-0.5 mb-2">
                          {order.items.map((it, idx) => (
                            <p key={idx}>{it.quantity}× {it.menu_item_name}</p>
                          ))}
                        </div>
                        <div className="flex items-center justify-between">
                          <span className="text-[10px] text-muted-foreground">{timeAgo(order.createdAt)}</span>
                          <Button
                            size="sm"
                            className={`h-8 ${getOrderActionStyle(order.status)}`}
                            disabled={actionLoading === order.id}
                            onClick={() => handleOrderAction(order)}
                          >
                            {actionLoading === order.id ? (
                              <Loader2 className="w-3 h-3 animate-spin" />
                            ) : (
                              <>
                                {getOrderActionIcon(order.status)}
                                {getOrderActionLabel(order.status)}
                              </>
                            )}
                          </Button>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </motion.div>
            ))}
          </div>
        </AnimatePresence>
      )}
    </div>
  );
}
