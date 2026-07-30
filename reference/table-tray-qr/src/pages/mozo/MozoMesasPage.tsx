import { useEffect, useState, useRef, useCallback } from 'react';
import { useWaiters } from '@/contexts/WaitersContext';
import { supabase } from '@/integrations/supabase/client';
import { formatCLP } from '@/lib/format';
import { Sheet, SheetContent, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { useToast } from '@/hooks/use-toast';
import { Loader2, Clock, Receipt } from 'lucide-react';

interface TableData {
  id: string;
  number: number;
  name: string | null;
  status: string | null;
  capacity: number | null;
  assigned_waiter_id: string | null;
  hasNewOrder: boolean;
  hasReadyFood: boolean;
  hasBillRequest: boolean;
  hasWaiterCall: boolean;
  readyOrdersCount: number;
  sessionTotal: number;
  sessionOpenedAt: string | null;
  activeOrdersCount: number;
  tipAmount: number;
  tipPercentage: number;
}

interface OrderWithItems {
  id: string;
  order_number: number;
  status: string;
  total_amount: number;
  items: { menu_item_name: string; quantity: number }[];
}

function minutesAgo(dateStr: string) {
  return Math.floor((Date.now() - new Date(dateStr).getTime()) / 60000);
}

function getTablePriority(t: TableData, staffId: string): number {
  const isMine = t.assigned_waiter_id === staffId;
  if (isMine && t.hasBillRequest) return 1;
  if (isMine && t.hasReadyFood) return 2;
  if (isMine && t.hasWaiterCall) return 3;
  if (!t.assigned_waiter_id && t.hasNewOrder) return 4;
  if (isMine) return 5;
  if (t.assigned_waiter_id && !isMine) return 6;
  return 7;
}

function playAlert() {
  try {
    const ctx = new AudioContext();
    const o = ctx.createOscillator();
    const g = ctx.createGain();
    o.connect(g); g.connect(ctx.destination);
    o.frequency.setValueAtTime(880, ctx.currentTime);
    o.frequency.setValueAtTime(1100, ctx.currentTime + 0.1);
    g.gain.setValueAtTime(0.2, ctx.currentTime);
    g.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.35);
    o.start(); o.stop(ctx.currentTime + 0.35);
  } catch { /* ignore */ }
}

function getPriorityStyles(priority: number): string {
  switch (priority) {
    case 1: return 'bg-[#FDE8E8] dark:bg-[#C0280F]/10 border-l-4 border-[#C0280F] animate-pulse';
    case 2: return 'bg-[#E8F5EE] dark:bg-[#1A6B45]/10 border-l-4 border-[#1A6B45] animate-pulse';
    case 3: return 'bg-[#FEF0E8] dark:bg-[#B87C10]/10 border-l-4 border-[#B87C10] animate-pulse';
    case 4: return 'bg-accent dark:bg-accent border-l-4 border-primary animate-pulse';
    case 5: return 'bg-muted dark:bg-muted border-l-4 border-border';
    case 6: return 'bg-card border-l-4 border-border opacity-60';
    default: return 'bg-card border border-border opacity-40';
  }
}

function getStatusPill(t: TableData): string {
  if (t.hasBillRequest) return '🧾 Pide la cuenta';
  if (t.hasReadyFood) return '✓ Lista para entregar';
  if (t.activeOrdersCount > 0) return '🍳 En cocina';
  if ((t.status === 'occupied' || t.status === 'waiting_bill') && t.sessionOpenedAt) {
    return `Ocupada · ${minutesAgo(t.sessionOpenedAt)}min`;
  }
  return 'Libre';
}

export default function MozoMesasPage() {
  const { branchId, staffId } = useWaiters();
  const { toast } = useToast();
  const [tables, setTables] = useState<TableData[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedTable, setSelectedTable] = useState<TableData | null>(null);
  const [sheetOpen, setSheetOpen] = useState(false);
  const [orders, setOrders] = useState<OrderWithItems[]>([]);
  const [ordersLoading, setOrdersLoading] = useState(false);
  const [actionLoading, setActionLoading] = useState<string | null>(null);
  const [transferOpen, setTransferOpen] = useState(false);
  const [otherWaiters, setOtherWaiters] = useState<{ id: string; name: string }[]>([]);
  const [confirmBillTable, setConfirmBillTable] = useState<TableData | null>(null);
  const prevUrgentRef = useRef(0);

  const fetchTables = useCallback(async () => {
    const { data: tablesData } = await supabase
      .from('tables')
      .select('id, number, name, status, capacity, assigned_waiter_id')
      .eq('branch_id', branchId)
      .order('number');

    if (!tablesData) return;

    const occupiedIds = tablesData
      .filter(t => t.status === 'occupied' || t.status === 'waiting_bill')
      .map(t => t.id);

    let sessionsMap: Record<string, { total: number; opened: string }> = {};
    let ordersMap: Record<string, { confirmed: number; ready: number; inKitchen: number }> = {};
    let billMap: Record<string, number> = {};
    let callMap: Record<string, number> = {};
    let tipMap: Record<string, { amount: number; percentage: number }> = {};

    if (occupiedIds.length > 0) {
      const [{ data: sessions }, { data: activeOrders }, { data: billReqs }, { data: waiterCalls }] = await Promise.all([
        supabase
          .from('table_sessions')
          .select('table_id, total_amount, opened_at')
          .in('table_id', occupiedIds)
          .eq('is_active', true),
        supabase
          .from('orders')
          .select('id, table_id, status')
          .in('table_id', occupiedIds)
          .in('status', ['confirmed', 'in_kitchen', 'ready']),
        supabase
          .from('bill_requests')
          .select('id, table_id, status, tip_amount, tip_percentage')
          .in('table_id', occupiedIds)
          .eq('status', 'pending'),
        supabase
          .from('waiter_calls')
          .select('id, table_id, status')
          .in('table_id', occupiedIds)
          .eq('status', 'pending'),
      ]);

      sessions?.forEach(s => {
        sessionsMap[s.table_id] = { total: s.total_amount ?? 0, opened: s.opened_at ?? '' };
      });
      activeOrders?.forEach(o => {
        if (!ordersMap[o.table_id]) ordersMap[o.table_id] = { confirmed: 0, ready: 0, inKitchen: 0 };
        if (o.status === 'confirmed') ordersMap[o.table_id].confirmed++;
        else if (o.status === 'ready') ordersMap[o.table_id].ready++;
        else if (o.status === 'in_kitchen') ordersMap[o.table_id].inKitchen++;
      });
      billReqs?.forEach(b => {
        billMap[b.table_id] = (billMap[b.table_id] ?? 0) + 1;
        tipMap[b.table_id] = { amount: (b as any).tip_amount ?? 0, percentage: (b as any).tip_percentage ?? 0 };
      });
      waiterCalls?.forEach(wc => {
        callMap[wc.table_id] = (callMap[wc.table_id] ?? 0) + 1;
      });
    }

    setTables(tablesData.map(t => {
      const om = ordersMap[t.id] ?? { confirmed: 0, ready: 0, inKitchen: 0 };
      return {
        ...t,
        hasNewOrder: om.confirmed > 0 && !t.assigned_waiter_id,
        hasReadyFood: om.ready > 0,
        hasBillRequest: (billMap[t.id] ?? 0) > 0,
        hasWaiterCall: (callMap[t.id] ?? 0) > 0,
        readyOrdersCount: om.ready,
        sessionTotal: sessionsMap[t.id]?.total ?? 0,
        sessionOpenedAt: sessionsMap[t.id]?.opened ?? null,
        activeOrdersCount: om.confirmed + om.ready + om.inKitchen,
        tipAmount: tipMap[t.id]?.amount ?? 0,
        tipPercentage: tipMap[t.id]?.percentage ?? 0,
      };
    }));
    setLoading(false);
  }, [branchId]);

  useEffect(() => {
    fetchTables();
    const channel = supabase
      .channel('mozo-mesas-full')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'tables', filter: `branch_id=eq.${branchId}` }, () => fetchTables())
      .on('postgres_changes', { event: '*', schema: 'public', table: 'orders', filter: `branch_id=eq.${branchId}` }, () => fetchTables())
      .on('postgres_changes', { event: '*', schema: 'public', table: 'bill_requests', filter: `branch_id=eq.${branchId}` }, () => fetchTables())
      .on('postgres_changes', { event: '*', schema: 'public', table: 'waiter_calls', filter: `branch_id=eq.${branchId}` }, () => fetchTables())
      .on('postgres_changes', { event: '*', schema: 'public', table: 'table_sessions', filter: `branch_id=eq.${branchId}` }, () => fetchTables())
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [branchId, fetchTables]);

  // Sound alert for urgent events
  useEffect(() => {
    const urgent = tables.filter(t => getTablePriority(t, staffId) <= 4).length;
    if (urgent > prevUrgentRef.current) playAlert();
    prevUrgentRef.current = urgent;
  }, [tables, staffId]);

  // --- Action handlers ---
  const handleTakeTable = async (tableId: string) => {
    setActionLoading(tableId);
    await supabase.from('tables').update({ assigned_waiter_id: staffId }).eq('id', tableId);
    fetchTables();
    toast({ title: 'Mesa tomada' });
    setActionLoading(null);
  };

  const handleMarkDelivered = async (tableId: string) => {
    setActionLoading(tableId);
    const now = new Date().toISOString();
    await supabase
      .from('orders')
      .update({ status: 'delivered', delivered_at: now })
      .eq('table_id', tableId)
      .eq('status', 'ready');
    fetchTables();
    toast({ title: '✓ Entregado' });
    setActionLoading(null);
  };

  const handleAttendCall = async (tableId: string) => {
    setActionLoading(tableId);
    await supabase
      .from('waiter_calls')
      .update({ status: 'attended' })
      .eq('table_id', tableId)
      .eq('status', 'pending');
    fetchTables();
    toast({ title: 'Llamada atendida' });
    setActionLoading(null);
  };

  const handleCloseBill = (table: TableData) => {
    setConfirmBillTable(table);
  };

  const executeCloseBill = async (table: TableData) => {
    setActionLoading(table.id);
    const now = new Date().toISOString();
    await supabase.from('bill_requests').update({ status: 'paid' }).eq('table_id', table.id).eq('status', 'pending');
    await supabase.from('table_sessions').update({ is_active: false, closed_at: now }).eq('table_id', table.id).eq('is_active', true);
    await supabase.from('orders').update({ status: 'delivered', delivered_at: now }).eq('table_id', table.id).in('status', ['confirmed', 'in_kitchen', 'ready']);
    await supabase.from('tables').update({ status: 'free', assigned_waiter_id: null }).eq('id', table.id);
    setConfirmBillTable(null);
    setSheetOpen(false);
    fetchTables();
    toast({ title: '✅ Mesa cerrada' });
    setActionLoading(null);
  };

  // --- Sheet ---
  const openSheet = async (table: TableData) => {
    setSelectedTable(table);
    setSheetOpen(true);
    setOrdersLoading(true);

    const { data: session } = await supabase
      .from('table_sessions')
      .select('id')
      .eq('table_id', table.id)
      .eq('is_active', true)
      .limit(1)
      .maybeSingle();

    if (!session) { setOrders([]); setOrdersLoading(false); return; }

    const { data: ordersData } = await supabase
      .from('orders')
      .select('id, order_number, status, total_amount')
      .eq('session_id', session.id)
      .in('status', ['confirmed', 'in_kitchen', 'ready', 'delivered'])
      .order('confirmed_at', { ascending: true });

    if (!ordersData || ordersData.length === 0) { setOrders([]); setOrdersLoading(false); return; }

    const { data: items } = await supabase
      .from('order_items')
      .select('order_id, menu_item_name, quantity')
      .in('order_id', ordersData.map(o => o.id));

    setOrders(ordersData.map(o => ({
      ...o,
      status: o.status ?? 'confirmed',
      items: (items ?? []).filter(i => i.order_id === o.id),
    })));
    setOrdersLoading(false);
  };

  const handleTransfer = async () => {
    setActionLoading('transfer');
    const { data } = await supabase
      .from('staff_users')
      .select('id, name')
      .eq('branch_id', branchId)
      .eq('is_active', true)
      .neq('id', staffId);
    setOtherWaiters(data ?? []);
    setActionLoading(null);
    setTransferOpen(true);
  };

  const confirmTransfer = async (newWaiterId: string) => {
    if (!selectedTable) return;
    await supabase.from('tables').update({ assigned_waiter_id: newWaiterId }).eq('id', selectedTable.id);
    setTransferOpen(false);
    setSheetOpen(false);
    fetchTables();
    toast({ title: 'Mesa transferida' });
  };

  if (loading) return <div className="flex items-center justify-center h-64"><Loader2 className="w-6 h-6 animate-spin text-muted-foreground" /></div>;

  const sortedTables = [...tables].sort((a, b) => getTablePriority(a, staffId) - getTablePriority(b, staffId));
  const freeCount = tables.filter(t => (t.status ?? 'free') === 'free').length;
  const inServiceCount = tables.filter(t => t.status === 'occupied' || t.status === 'waiting_bill').length;
  const urgentCount = tables.filter(t => getTablePriority(t, staffId) <= 3).length;

  const selectedPriority = selectedTable ? getTablePriority(selectedTable, staffId) : 7;

  return (
    <div className="p-4 pb-24">
      {/* Summary bar */}
      <div className="flex items-center gap-3 mb-4 px-1">
        <span className="text-sm text-muted-foreground">{freeCount} libres</span>
        <span className="text-sm text-muted-foreground">·</span>
        <span className="text-sm text-muted-foreground">{inServiceCount} en servicio</span>
        <span className="text-sm text-muted-foreground">·</span>
        <span className={`text-sm font-semibold ${urgentCount > 0 ? 'text-red-600' : 'text-muted-foreground'}`}>
          {urgentCount} urgentes
        </span>
        {urgentCount > 0 && (
          <span className="ml-auto bg-red-500 text-white text-[10px] font-bold rounded-full w-5 h-5 flex items-center justify-center">
            {urgentCount}
          </span>
        )}
      </div>

      {/* Table grid */}
      <div className="grid grid-cols-2 gap-3">
        {sortedTables.map(t => {
          const priority = getTablePriority(t, staffId);
          const isMine = t.assigned_waiter_id === staffId;
          const isOccupied = t.status === 'occupied' || t.status === 'waiting_bill';
          const isFree = (t.status ?? 'free') === 'free';
          const isUnassigned = !t.assigned_waiter_id;
          const styles = getPriorityStyles(priority);
          const canTake = isUnassigned && (isFree || isOccupied);

          return (
            <div
              key={t.id}
              onClick={() => isOccupied ? openSheet(t) : undefined}
              className={`rounded-xl p-3.5 transition-all relative min-h-[130px] flex flex-col ${styles} ${isOccupied ? 'cursor-pointer active:scale-[0.97]' : ''}`}
            >
              {/* TOP ROW */}
              <div className="flex items-start justify-between">
                <span className="text-4xl font-black text-foreground leading-none">{t.number}</span>
                <div className="flex items-center gap-1">
                  {t.hasBillRequest && <span className="text-lg animate-pulse">🧾</span>}
                  {t.hasReadyFood && <span className="text-lg text-green-600 animate-pulse">✓</span>}
                  {t.hasWaiterCall && <span className="text-lg">🔔</span>}
                  {isMine && <Badge className="text-[9px] px-1.5 py-0 h-4 bg-primary text-primary-foreground">YO</Badge>}
                </div>
              </div>

              {/* MIDDLE */}
              <div className="mt-2 flex-1">
                <span className="text-xs font-medium text-muted-foreground">{getStatusPill(t)}</span>
                {t.hasReadyFood && (
                  <p className="text-xs font-semibold text-green-600 mt-0.5">
                    {t.readyOrdersCount} plato{t.readyOrdersCount > 1 ? 's' : ''} listo{t.readyOrdersCount > 1 ? 's' : ''} para entregar
                  </p>
                )}
              </div>

              {/* BOTTOM */}
              <div className="mt-auto pt-2">
                {isOccupied && t.sessionTotal > 0 && (
                  <p className="text-sm font-bold text-foreground mb-1.5">{formatCLP(t.sessionTotal)}</p>
                )}

                {/* Take table - available for ANY unassigned table */}
                {canTake && (
                  <Button
                    size="sm"
                    className="w-full h-8 text-xs bg-primary hover:bg-[#B83E10] text-white"
                    disabled={actionLoading === t.id}
                    onClick={(e) => { e.stopPropagation(); handleTakeTable(t.id); }}
                  >
                    {actionLoading === t.id ? <Loader2 className="w-3 h-3 animate-spin" /> : 'Tomar mesa →'}
                  </Button>
                )}
                {!canTake && priority === 2 && (
                  <Button
                    size="sm"
                    className="w-full h-8 text-xs bg-green-600 hover:bg-green-700 text-white"
                    disabled={actionLoading === t.id}
                    onClick={(e) => { e.stopPropagation(); handleMarkDelivered(t.id); }}
                  >
                    {actionLoading === t.id ? <Loader2 className="w-3 h-3 animate-spin" /> : 'Marcar entregado ✓'}
                  </Button>
                )}
                {!canTake && priority === 3 && (
                  <Button
                    size="sm"
                    className="w-full h-8 text-xs bg-amber-500 hover:bg-amber-600 text-white"
                    disabled={actionLoading === t.id}
                    onClick={(e) => { e.stopPropagation(); handleAttendCall(t.id); }}
                  >
                    {actionLoading === t.id ? <Loader2 className="w-3 h-3 animate-spin" /> : 'Atender llamada'}
                  </Button>
                )}
                {priority === 1 && (
                  <Button
                    size="sm"
                    className="w-full h-8 text-xs bg-red-600 hover:bg-red-700 text-white"
                    disabled={actionLoading === t.id}
                    onClick={(e) => { e.stopPropagation(); handleCloseBill(t); }}
                  >
                    {actionLoading === t.id ? <Loader2 className="w-3 h-3 animate-spin" /> : 'Cobrar y cerrar mesa'}
                  </Button>
                )}
              </div>
            </div>
          );
        })}
      </div>

      {/* Table detail sheet */}
      <Sheet open={sheetOpen} onOpenChange={setSheetOpen}>
        <SheetContent side="bottom" className="max-h-[85vh] rounded-t-2xl px-4 pb-8">
          <SheetHeader className="mb-4">
            <SheetTitle className="flex items-center gap-2">
              Mesa {selectedTable?.number}
              {selectedTable?.name && <span className="text-muted-foreground font-normal">· {selectedTable.name}</span>}
              {selectedTable?.hasBillRequest && <Badge variant="destructive" className="text-[10px]">🧾 Cuenta pedida</Badge>}
            </SheetTitle>
          </SheetHeader>

          {/* Session info */}
          {selectedTable?.sessionOpenedAt && (
            <div className="flex items-center gap-4 mb-4 p-3 rounded-lg bg-muted/50">
              <div className="flex items-center gap-1.5 text-sm">
                <Clock className="w-4 h-4 text-muted-foreground" />
                <span className="text-muted-foreground">{minutesAgo(selectedTable.sessionOpenedAt)} min</span>
              </div>
              {selectedTable.sessionTotal > 0 && (
                <div className="flex items-center gap-1.5 text-sm">
                  <Receipt className="w-4 h-4 text-muted-foreground" />
                  <span className="font-semibold">{formatCLP(selectedTable.sessionTotal)}</span>
                </div>
              )}
            </div>
          )}

          {ordersLoading ? (
            <div className="flex justify-center py-8"><Loader2 className="w-5 h-5 animate-spin text-muted-foreground" /></div>
          ) : orders.length === 0 ? (
            <p className="text-muted-foreground text-center py-8 text-sm">Sin pedidos</p>
          ) : (
            <div className="space-y-2 mb-6 max-h-[40vh] overflow-auto">
              {orders.map(o => (
                <div key={o.id} className={`rounded-lg p-3 border ${
                  o.status === 'ready' ? 'bg-[#E8F5EE] dark:bg-[#1A6B45]/10 border-[#1A6B45]/20' :
                  o.status === 'in_kitchen' ? 'bg-[#FEF0E8] dark:bg-[#B87C10]/10 border-[#B87C10]/20' :
                  o.status === 'confirmed' ? 'bg-accent dark:bg-accent border-primary/20' :
                  'bg-muted/30 border-border'
                }`}>
                  <div className="flex items-center justify-between mb-1.5">
                    <span className="text-sm font-semibold">#{o.order_number}</span>
                    <Badge variant={
                      o.status === 'ready' ? 'default' :
                      o.status === 'delivered' ? 'outline' :
                      'secondary'
                    } className="text-[10px]">
                      {o.status === 'confirmed' ? 'Nuevo' :
                       o.status === 'in_kitchen' ? 'En cocina' :
                       o.status === 'ready' ? '✓ Listo' :
                       '✓ Entregado'}
                    </Badge>
                  </div>
                  {o.items.map((it, idx) => (
                    <p key={idx} className="text-sm text-foreground">{it.quantity}× {it.menu_item_name}</p>
                  ))}
                  <p className="text-xs font-semibold mt-1">{formatCLP(o.total_amount)}</p>
                </div>
              ))}
            </div>
          )}

          {/* Sheet footer: single primary action + transfer */}
          <div className="space-y-2">
            {selectedTable && selectedPriority === 1 && (
              <Button className="w-full h-12 bg-red-600 hover:bg-red-700 text-white" disabled={actionLoading === selectedTable.id} onClick={() => handleCloseBill(selectedTable)}>
                {actionLoading === selectedTable.id ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : null}
                Cobrar y cerrar mesa
              </Button>
            )}
            {selectedTable && selectedPriority === 2 && (
              <Button className="w-full h-12 bg-green-600 hover:bg-green-700 text-white" disabled={actionLoading === selectedTable.id} onClick={(e) => { e.stopPropagation(); handleMarkDelivered(selectedTable.id); }}>
                {actionLoading === selectedTable.id ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : null}
                Marcar entregado ✓
              </Button>
            )}
            {selectedTable && selectedPriority === 3 && (
              <Button className="w-full h-12 bg-amber-500 hover:bg-amber-600 text-white" disabled={actionLoading === selectedTable.id} onClick={(e) => { e.stopPropagation(); handleAttendCall(selectedTable.id); }}>
                {actionLoading === selectedTable.id ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : null}
                Atender llamada
              </Button>
            )}
            {selectedTable && selectedTable.assigned_waiter_id === staffId && (
              <button
                onClick={() => handleTransfer()}
                disabled={actionLoading === 'transfer'}
                className="w-full mt-2 py-3 rounded-xl text-sm font-semibold border border-border text-foreground flex items-center justify-center gap-2"
              >
                {actionLoading === 'transfer' ? <Loader2 className="w-4 h-4 animate-spin" /> : '↔ Transferir a otro mozo'}
              </button>
            )}
          </div>
        </SheetContent>
      </Sheet>

      {/* Transfer dialog */}
      <Dialog open={transferOpen} onOpenChange={setTransferOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Transferir Mesa {selectedTable?.number}</DialogTitle>
          </DialogHeader>
          <div className="space-y-2 mt-2">
            {otherWaiters.length === 0 ? (
              <p className="text-sm text-muted-foreground text-center py-4">No hay otros mozos disponibles</p>
            ) : (
              otherWaiters.map(w => (
                <button
                  key={w.id}
                  onClick={() => confirmTransfer(w.id)}
                  className="w-full rounded-xl border border-border p-3 text-left text-sm font-medium hover:bg-accent transition-colors"
                >
                  {w.name}
                </button>
              ))
            )}
          </div>
        </DialogContent>
      </Dialog>

      {/* Close bill confirmation dialog */}
      <Dialog open={!!confirmBillTable} onOpenChange={(open) => { if (!open) setConfirmBillTable(null); }}>
        <DialogContent className="rounded-2xl">
          <DialogHeader>
            <DialogTitle>¿Cerrar mesa {confirmBillTable?.number}?</DialogTitle>
            <DialogDescription>
              Esto marcará la cuenta como pagada, liberará la mesa y cerrará la sesión activa. Esta acción no se puede deshacer.
            </DialogDescription>
          </DialogHeader>

          {confirmBillTable && (
            <div className="rounded-xl bg-muted/50 p-4 space-y-2">
              <div className="flex items-center justify-between">
                <span className="text-sm text-muted-foreground">Total de la sesión</span>
                <span className="text-base font-bold text-foreground">
                  {confirmBillTable.sessionTotal !== undefined
                    ? formatCLP(confirmBillTable.sessionTotal)
                    : '—'}
                </span>
              </div>
              {confirmBillTable.tipAmount > 0 && (
                <div className="flex items-center justify-between">
                  <span className="text-sm text-muted-foreground">
                    Propina {confirmBillTable.tipPercentage > 0 ? `(${confirmBillTable.tipPercentage}%)` : ''}
                  </span>
                  <span className="text-base font-bold text-green-600">
                    {formatCLP(confirmBillTable.tipAmount)}
                  </span>
                </div>
              )}
              <div className="flex items-center justify-between">
                <span className="text-sm text-muted-foreground">Mesa</span>
                <span className="text-sm font-medium text-foreground">Mesa {confirmBillTable.number}</span>
              </div>
            </div>
          )}

          <DialogFooter className="flex-row gap-2 sm:flex-row">
            <button
              onClick={() => setConfirmBillTable(null)}
              className="flex-1 rounded-xl border border-border py-3 text-sm font-semibold text-foreground hover:bg-muted transition-colors"
            >
              Cancelar
            </button>
            <button
              onClick={() => confirmBillTable && executeCloseBill(confirmBillTable)}
              className="flex-1 rounded-xl py-3 text-sm font-bold text-white transition-colors"
              style={{ backgroundColor: '#E8531D' }}
            >
              Sí, cerrar mesa
            </button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
