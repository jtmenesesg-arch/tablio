import { useState, useEffect, useCallback, useRef, useMemo } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { motion, AnimatePresence } from "framer-motion";
import { Volume2, VolumeX, Wifi, WifiOff, LogIn, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";

/* ===================== TYPES ===================== */
interface KDSOrderItem {
  id: string;
  menu_item_name: string;
  quantity: number;
  selected_modifiers: any;
  item_notes: string | null;
}

interface KDSOrder {
  id: string;
  order_number: number;
  status: string;
  confirmed_at: string | null;
  kitchen_accepted_at: string | null;
  notes: string | null;
  table_number: number;
  table_name: string | null;
  items: KDSOrderItem[];
}

interface BranchInfo {
  id: string;
  name: string;
  restaurant_name: string;
  tenant_name: string;
  primary_color: string;
}

interface RecentlyDeliveredEntry {
  id: string;
  table_number: number;
  order_number: number;
  delivered_at: string;
}

/* ===================== HELPERS ===================== */
function playNewOrderSound() {
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
  } catch {
    // AudioContext not available
  }
}

async function fetchOrderWithItems(orderId: string): Promise<KDSOrder | null> {
  const { data: o } = await supabase
    .from("orders")
    .select("id, order_number, status, confirmed_at, kitchen_accepted_at, notes, table_id")
    .eq("id", orderId)
    .maybeSingle();
  if (!o) return null;

  const { data: table } = await supabase
    .from("tables")
    .select("number, name")
    .eq("id", o.table_id)
    .maybeSingle();

  const { data: items } = await supabase
    .from("order_items")
    .select("id, menu_item_name, quantity, selected_modifiers, item_notes")
    .eq("order_id", o.id);

  return {
    id: o.id,
    order_number: o.order_number,
    status: o.status || "confirmed",
    confirmed_at: o.confirmed_at,
    kitchen_accepted_at: o.kitchen_accepted_at,
    notes: o.notes,
    table_number: table?.number || 0,
    table_name: table?.name || null,
    items: items || [],
  };
}

function formatTimer(seconds: number): string {
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return `${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
}

function getTimerColor(seconds: number): string {
  if (seconds < 600) return "#1A6B45";
  if (seconds < 1200) return "#B87C10";
  return "#C0280F";
}

/* ===================== COMPONENTS ===================== */

/* --- Timer --- */
function OrderTimer({ confirmedAt }: { confirmedAt: string | null }) {
  const [elapsed, setElapsed] = useState(0);

  useEffect(() => {
    if (!confirmedAt) return;
    const start = new Date(confirmedAt).getTime();
    const tick = () => setElapsed(Math.floor((Date.now() - start) / 1000));
    tick();
    const id = setInterval(tick, 1000);
    return () => clearInterval(id);
  }, [confirmedAt]);

  const color = getTimerColor(elapsed);
  const isPulsing = elapsed >= 1200;

  return (
    <span
      className={`font-mono text-sm font-bold ${isPulsing ? "animate-pulse" : ""}`}
      style={{ color }}
    >
      ⏱ {formatTimer(elapsed)}
    </span>
  );
}

/* --- Order Card --- */
function OrderCard({
  order,
  column,
  onAction,
  onDisableItem,
}: {
  order: KDSOrder;
  column: "new" | "kitchen" | "ready";
  onAction: (orderId: string, newStatus: string) => void;
  onDisableItem?: (itemId: string, itemName: string) => void;
}) {
  const borderColor = column === "new" ? "#EF4444" : column === "kitchen" ? "#F59E0B" : "#22C55E";

  const modifiers = (mods: any): string[] => {
    if (!mods) return [];
    if (Array.isArray(mods)) return mods.map((m: any) => m.modifierName || m.name || String(m));
    return [];
  };

  return (
    <motion.div
      layout
      initial={{ opacity: 0, y: -20 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, height: 0, marginBottom: 0 }}
      transition={{ duration: 0.25 }}
      className="mb-3 rounded-lg overflow-hidden"
      style={{
        backgroundColor: "#1A1A1A",
        borderLeft: `3px solid ${borderColor}`,
      }}
    >
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3">
        <div>
          <span className="text-[22px] font-bold text-white">
            Mesa {order.table_number}
          </span>
          <p className="text-xs text-gray-500">
            Pedido #{String(order.order_number).padStart(3, "0")}
          </p>
        </div>
        <OrderTimer confirmedAt={order.confirmed_at} />
      </div>

      <hr className="border-gray-800" />

      {/* Items */}
      <div className="px-4 py-3 space-y-2">
        {order.items.map((item) => (
          <div key={item.id}>
            <div className="flex items-center justify-between gap-2">
              <p className="text-[17px] text-white flex-1">
                {item.quantity}× {item.menu_item_name}
              </p>
              {(column === "new" || column === "kitchen") && onDisableItem && (
                <button
                  onClick={() => onDisableItem(item.id, item.menu_item_name)}
                  className="shrink-0 rounded px-1.5 py-0.5 text-[10px] font-bold"
                  style={{ backgroundColor: "rgba(239,68,68,0.15)", color: "#EF4444" }}
                  title="Marcar agotado"
                >
                  86
                </button>
              )}
            </div>
            {modifiers(item.selected_modifiers).map((mod, i) => (
              <p key={i} className="text-sm text-gray-400 pl-4">
                {mod}
              </p>
            ))}
            {item.item_notes && (
              <p className="text-sm font-bold pl-4 mt-0.5 rounded px-1.5 py-0.5 inline-block"
                style={{ color: "#EF4444", backgroundColor: "rgba(239,68,68,0.1)" }}>
                ⚠ {item.item_notes}
              </p>
            )}
          </div>
        ))}
      </div>

      {/* General notes */}
      {order.notes && (
        <>
          <hr className="border-gray-800" />
          <div className="px-4 py-2">
            <p className="text-sm font-bold rounded px-2 py-1 inline-block"
              style={{ color: "#EF4444", backgroundColor: "rgba(239,68,68,0.1)" }}>
              ⚠ {order.notes}
            </p>
          </div>
        </>
      )}

      {/* Action buttons */}
      {column === "new" && (
        <div className="px-4 pb-3">
          <button
            onClick={() => onAction(order.id, "in_kitchen")}
            className="w-full rounded-lg py-4 text-lg font-bold text-white transition-opacity active:opacity-80"
            style={{ backgroundColor: "#E8531D", minHeight: 56 }}
          >
            ACEPTAR
          </button>
        </div>
      )}
      {column === "kitchen" && (
        <div className="px-4 pb-3">
          <button
            onClick={() => onAction(order.id, "ready")}
            className="w-full rounded-lg py-4 text-lg font-bold text-white transition-opacity active:opacity-80"
            style={{ backgroundColor: "#1A6B45", minHeight: 56 }}
          >
            LISTO
          </button>
        </div>
      )}
      {column === "ready" && (
        <div className="px-4 pb-3">
          <button
            onClick={() => onAction(order.id, "delivered")}
            className="w-full rounded-lg py-4 text-lg font-bold text-white transition-opacity active:opacity-80"
            style={{ backgroundColor: "#6366F1", minHeight: 56 }}
          >
            ✓ ENTREGADO
          </button>
        </div>
      )}
    </motion.div>
  );
}

/* --- Column --- */
function KDSColumn({
  title,
  count,
  color,
  bgColor,
  orders,
  column,
  onAction,
  onDisableItem,
  recentlyDelivered,
  groupedNewItems,
}: {
  title: string;
  count: number;
  color: string;
  bgColor: string;
  orders: KDSOrder[];
  column: "new" | "kitchen" | "ready";
  onAction: (orderId: string, newStatus: string) => void;
  onDisableItem?: (itemId: string, itemName: string) => void;
  recentlyDelivered?: RecentlyDeliveredEntry[];
  groupedNewItems?: { name: string; totalQty: number; tables: number[] }[];
}) {
  return (
    <div className="flex flex-col min-h-0 flex-1">
      {/* Column header */}
      <div
        className="flex items-center justify-between px-4 py-2 shrink-0"
        style={{ backgroundColor: bgColor, minHeight: 40 }}
      >
        <span className="text-sm font-bold" style={{ color }}>
          {title} ({count})
        </span>
      </div>

      {/* Scrollable body */}
      <div className="flex-1 overflow-y-auto p-3">
        {/* Grouped summary for new column */}
        {column === "new" && groupedNewItems && orders.length > 1 && groupedNewItems.length > 0 && (
          <div className="mb-3 rounded-lg p-3" style={{ backgroundColor: "#1F1F1F", border: "1px solid #2A2A2A" }}>
            <p className="text-xs font-bold mb-2" style={{ color: "#F59E0B" }}>RESUMEN DE NUEVOS</p>
            {groupedNewItems.map(g => (
              <div key={g.name} className="flex items-center justify-between py-0.5">
                <span className="text-sm text-white">{g.name}</span>
                <div className="flex items-center gap-2">
                  <span className="text-xs" style={{ color: "#6B7280" }}>
                    M: {g.tables.join(", ")}
                  </span>
                  <span className="text-sm font-bold" style={{ color: "#F59E0B" }}>×{g.totalQty}</span>
                </div>
              </div>
            ))}
          </div>
        )}

        <AnimatePresence initial={false}>
          {orders.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-40 text-gray-700">
              <p className="text-3xl mb-2">
                {column === "new" ? "📥" : column === "kitchen" ? "🍳" : "✅"}
              </p>
              <p className="text-sm">Sin pedidos</p>
            </div>
          ) : (
            orders.map((order) => (
              <OrderCard key={order.id} order={order} column={column} onAction={onAction} onDisableItem={onDisableItem} />
            ))
          )}
        </AnimatePresence>

        {/* Recently delivered log for ready column */}
        {column === "ready" && recentlyDelivered && recentlyDelivered.length > 0 && (
          <div className="mt-3 pt-3" style={{ borderTop: "1px solid #1F1F1F" }}>
            <p className="text-xs mb-2" style={{ color: "#374151", fontWeight: 700 }}>ÚLTIMOS ENTREGADOS</p>
            {recentlyDelivered.map(d => (
              <div key={d.id} className="flex items-center justify-between py-0.5 opacity-40">
                <span className="text-xs text-gray-500">Mesa {d.table_number}</span>
                <span className="text-xs text-gray-600">#{String(d.order_number).padStart(3, "0")}</span>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

/* ===================== AUTH HOOK ===================== */
function useKDSAuth() {
  const [authState, setAuthState] = useState<{
    loading: boolean;
    authenticated: boolean;
    tenantId: string | null;
  }>({ loading: true, authenticated: false, tenantId: null });

  useEffect(() => {
    async function check() {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) {
        setAuthState({ loading: false, authenticated: false, tenantId: null });
        return;
      }

      const userId = session.user.id;

      const { data: member } = await supabase
        .from("tenant_members")
        .select("tenant_id")
        .eq("user_id", userId)
        .eq("is_active", true)
        .limit(1)
        .maybeSingle();

      if (member) {
        setAuthState({ loading: false, authenticated: true, tenantId: member.tenant_id });
        return;
      }

      const { data: staff } = await supabase
        .from("staff_users")
        .select("tenant_id")
        .eq("auth_user_id", userId)
        .eq("is_active", true)
        .limit(1)
        .maybeSingle();

      if (staff) {
        setAuthState({ loading: false, authenticated: true, tenantId: staff.tenant_id });
        return;
      }

      setAuthState({ loading: false, authenticated: false, tenantId: null });
    }

    check();

    const { data: { subscription } } = supabase.auth.onAuthStateChange((event) => {
      if (event === "SIGNED_IN") check();
      if (event === "SIGNED_OUT") setAuthState({ loading: false, authenticated: false, tenantId: null });
    });

    return () => subscription.unsubscribe();
  }, []);

  return authState;
}

/* ===================== ACCESS DENIED ===================== */
function KDSAccessDenied() {
  const navigate = useNavigate();
  return (
    <div className="min-h-screen flex flex-col items-center justify-center gap-6" style={{ backgroundColor: "#0A0A0A" }}>
      <div className="text-center space-y-2">
        <p className="text-4xl">🔒</p>
        <h1 className="text-xl font-bold text-white">Acceso restringido</h1>
        <p className="text-sm text-gray-400">Necesitas iniciar sesión para acceder al KDS</p>
      </div>
      <Button
        onClick={() => navigate("/admin/login")}
        className="gap-2"
      >
        <LogIn className="h-4 w-4" />
        Iniciar sesión
      </Button>
    </div>
  );
}

/* ===================== BRANCH SELECTOR ===================== */
function BranchSelector({ tenantId }: { tenantId: string }) {
  const navigate = useNavigate();

  const { data: branches = [], isLoading } = useQuery({
    queryKey: ["kds-branches", tenantId],
    queryFn: async () => {
      const { data } = await supabase
        .from("branches")
        .select("id, name, tenant_id")
        .eq("tenant_id", tenantId)
        .eq("is_open", true);

      if (!data) return [];

      const { data: tenant } = await supabase
        .from("tenants")
        .select("name")
        .eq("id", tenantId)
        .single();

      return data.map((b) => ({
        id: b.id,
        name: b.name,
        tenant_name: tenant?.name || "",
      }));
    },
  });

  return (
    <div className="min-h-screen flex flex-col items-center justify-center" style={{ backgroundColor: "#0A0A0A" }}>
      <h1 className="text-2xl font-bold text-white mb-8">Selecciona una sucursal</h1>
      {isLoading ? (
        <p className="text-gray-500">Cargando...</p>
      ) : branches.length === 0 ? (
        <p className="text-gray-500">No hay sucursales abiertas</p>
      ) : (
        <div className="space-y-3 w-full max-w-md px-6">
          {branches.map((b) => (
            <button
              key={b.id}
              onClick={() => navigate(`/kds?branch=${b.id}`)}
              className="w-full rounded-xl p-4 text-left transition-colors hover:bg-gray-800"
              style={{ backgroundColor: "#1A1A1A" }}
            >
              <p className="text-lg font-bold text-white">{b.name}</p>
              <p className="text-sm text-gray-500">{b.tenant_name}</p>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

/* ===================== MAIN KDS PAGE ===================== */
export default function KDSPage() {
  const [searchParams] = useSearchParams();
  const branchId = searchParams.get("branch");
  const { loading, authenticated, tenantId } = useKDSAuth();

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center" style={{ backgroundColor: "#0A0A0A" }}>
        <Loader2 className="h-8 w-8 animate-spin text-gray-500" />
      </div>
    );
  }

  if (!authenticated || !tenantId) {
    return <KDSAccessDenied />;
  }

  if (!branchId) return <BranchSelector tenantId={tenantId} />;

  return <KDSBoard branchId={branchId} />;
}

function KDSBoard({ branchId }: { branchId: string }) {
  const [orders, setOrders] = useState<KDSOrder[]>([]);
  const [soundEnabled, setSoundEnabled] = useState(false);
  const [audioUnlocked, setAudioUnlocked] = useState(false);
  const [isOnline, setIsOnline] = useState(true);
  const [clock, setClock] = useState("");
  const soundEnabledRef = useRef(false);
  const [deliveredToday, setDeliveredToday] = useState(0);
  const [recentlyDelivered, setRecentlyDelivered] = useState<RecentlyDeliveredEntry[]>([]);
  const [disabledItems, setDisabledItems] = useState<Set<string>>(new Set());

  // Keep ref in sync
  useEffect(() => {
    soundEnabledRef.current = soundEnabled;
  }, [soundEnabled]);

  // Clock
  useEffect(() => {
    const tick = () => setClock(new Date().toLocaleTimeString("es-CL", { hour12: false }));
    tick();
    const id = setInterval(tick, 1000);
    return () => clearInterval(id);
  }, []);

  // Branch info
  const { data: branch } = useQuery<BranchInfo | null>({
    queryKey: ["kds-branch", branchId],
    queryFn: async () => {
      const { data } = await supabase
        .from("branches")
        .select("id, name, restaurant_id, tenant_id")
        .eq("id", branchId)
        .maybeSingle();
      if (!data) return null;

      const { data: restaurant } = await supabase
        .from("restaurants")
        .select("name")
        .eq("id", data.restaurant_id)
        .maybeSingle();

      const { data: tenant } = await supabase
        .from("tenants")
        .select("name, primary_color")
        .eq("id", data.tenant_id)
        .maybeSingle();

      return {
        id: data.id,
        name: data.name,
        restaurant_name: restaurant?.name || "",
        tenant_name: tenant?.name || "",
        primary_color: tenant?.primary_color || "#E8531D",
      };
    },
    staleTime: Infinity,
  });

  // Initial orders fetch
  const { data: initialOrders } = useQuery({
    queryKey: ["kds-orders", branchId],
    queryFn: async () => {
      const fourHoursAgo = new Date(Date.now() - 4 * 60 * 60 * 1000).toISOString();
      const { data } = await supabase
        .from("orders")
        .select("id, order_number, status, confirmed_at, kitchen_accepted_at, notes, table_id")
        .eq("branch_id", branchId)
        .in("status", ["confirmed", "in_kitchen", "ready"])
        .gte("confirmed_at", fourHoursAgo)
        .order("confirmed_at", { ascending: true });

      if (!data) return [];

      const tableIds = [...new Set(data.map((o) => o.table_id))];
      const { data: tables } = await supabase
        .from("tables")
        .select("id, number, name")
        .in("id", tableIds);
      const tableMap = new Map((tables || []).map((t) => [t.id, t]));

      const orderIds = data.map((o) => o.id);
      const { data: allItems } = await supabase
        .from("order_items")
        .select("id, order_id, menu_item_name, quantity, selected_modifiers, item_notes")
        .in("order_id", orderIds);
      const itemsByOrder = new Map<string, KDSOrderItem[]>();
      for (const item of allItems || []) {
        const arr = itemsByOrder.get(item.order_id) || [];
        arr.push(item);
        itemsByOrder.set(item.order_id, arr);
      }

      return data.map((o): KDSOrder => {
        const t = tableMap.get(o.table_id);
        return {
          id: o.id,
          order_number: o.order_number,
          status: o.status || "confirmed",
          confirmed_at: o.confirmed_at,
          kitchen_accepted_at: o.kitchen_accepted_at,
          notes: o.notes,
          table_number: t?.number || 0,
          table_name: t?.name || null,
          items: itemsByOrder.get(o.id) || [],
        };
      });
    },
    staleTime: 10000,
  });

  // Sync initial data
  useEffect(() => {
    if (initialOrders) setOrders(initialOrders);
  }, [initialOrders]);

  // Realtime subscription
  useEffect(() => {
    const channel = supabase
      .channel(`kds-${branchId}`)
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "orders", filter: `branch_id=eq.${branchId}` },
        (payload) => {
          fetchOrderWithItems(payload.new.id).then((order) => {
            if (order && ["confirmed", "in_kitchen", "ready"].includes(order.status)) {
              setOrders((prev) => {
                if (prev.some((o) => o.id === order.id)) return prev;
                return [...prev, order];
              });
              if (soundEnabledRef.current) playNewOrderSound();
            }
          });
        },
      )
      .on(
        "postgres_changes",
        { event: "UPDATE", schema: "public", table: "orders", filter: `branch_id=eq.${branchId}` },
        (payload) => {
          const updated = payload.new as any;
          if (["delivered", "cancelled"].includes(updated.status)) {
            setOrders((prev) => prev.filter((o) => o.id !== updated.id));
          } else {
            setOrders((prev) =>
              prev.map((o) =>
                o.id === updated.id
                  ? { ...o, status: updated.status, kitchen_accepted_at: updated.kitchen_accepted_at }
                  : o,
              ),
            );
          }
        },
      )
      .subscribe((status) => {
        setIsOnline(status === "SUBSCRIBED");
      });

    return () => {
      supabase.removeChannel(channel);
    };
  }, [branchId]);

  // Action handler
  const handleAction = useCallback(async (orderId: string, newStatus: string) => {
    const updateData: any = { status: newStatus };
    if (newStatus === "in_kitchen") updateData.kitchen_accepted_at = new Date().toISOString();
    if (newStatus === "ready") updateData.ready_at = new Date().toISOString();
    if (newStatus === "delivered") updateData.delivered_at = new Date().toISOString();

    // Track delivered orders
    if (newStatus === "delivered") {
      const order = orders.find(o => o.id === orderId);
      if (order) {
        setDeliveredToday(prev => prev + 1);
        setRecentlyDelivered(prev => [
          { id: orderId, table_number: order.table_number, order_number: order.order_number, delivered_at: new Date().toISOString() },
          ...prev.slice(0, 7),
        ]);
      }
    }

    // Optimistic update — remove delivered/cancelled, update others
    if (newStatus === "delivered") {
      setOrders((prev) => prev.filter((o) => o.id !== orderId));
    } else {
      setOrders((prev) =>
        prev.map((o) => (o.id === orderId ? { ...o, ...updateData } : o)),
      );
    }

    await supabase.from("orders").update(updateData).eq("id", orderId);
  }, [orders]);

  // Disable item handler (86)
  const handleDisableItem = useCallback(async (itemId: string, _itemName: string) => {
    const { data } = await supabase
      .from("order_items")
      .select("menu_item_id")
      .eq("id", itemId)
      .maybeSingle();

    if (!data?.menu_item_id) return;

    await supabase
      .from("menu_items")
      .update({ status: "out_of_stock" })
      .eq("id", data.menu_item_id);

    setDisabledItems(prev => new Set([...prev, itemId]));
  }, []);

  // Enable sound
  const toggleSound = useCallback(() => {
    if (!audioUnlocked) {
      try {
        const ctx = new AudioContext();
        ctx.resume();
        ctx.close();
      } catch { /* noop */ }
      setAudioUnlocked(true);
      setSoundEnabled(true);
    } else {
      setSoundEnabled((prev) => !prev);
    }
  }, [audioUnlocked]);

  // Categorize
  const newOrders = orders.filter((o) => o.status === "confirmed");
  const kitchenOrders = orders.filter((o) => o.status === "in_kitchen");
  const readyOrders = orders.filter((o) => o.status === "ready");

  // Grouped new items
  const groupedNewItems = useMemo(() => {
    const map = new Map<string, { name: string; totalQty: number; tables: number[] }>();
    newOrders.forEach(order => {
      order.items.forEach(item => {
        const key = item.menu_item_name;
        const existing = map.get(key);
        if (existing) {
          existing.totalQty += item.quantity;
          if (!existing.tables.includes(order.table_number)) existing.tables.push(order.table_number);
        } else {
          map.set(key, { name: item.menu_item_name, totalQty: item.quantity, tables: [order.table_number] });
        }
      });
    });
    return Array.from(map.values()).sort((a, b) => b.totalQty - a.totalQty);
  }, [newOrders]);

  return (
    <div className="h-screen flex flex-col overflow-hidden" style={{ backgroundColor: "#0A0A0A" }}>
      {/* HEADER */}
      <header
        className="flex items-center justify-between px-4 shrink-0"
        style={{ backgroundColor: "#111111", height: 48 }}
      >
        <div className="flex items-center gap-2">
          <span className="text-sm font-bold text-white">
            {branch?.restaurant_name || branch?.tenant_name || ""}
          </span>
          {branch?.name && (
            <span className="text-sm text-gray-500">· {branch.name}</span>
          )}
        </div>

        <div className="flex items-center gap-3">
          {deliveredToday > 0 && (
            <span style={{ color: "#22C55E", fontSize: 13, fontWeight: 700 }}>
              ✓ {deliveredToday} entregados
            </span>
          )}
          <span className="text-lg font-mono font-bold text-gray-300">{clock}</span>
        </div>

        <div className="flex items-center gap-4">
          {/* Connection status */}
          <div className="flex items-center gap-1.5">
            {isOnline ? (
              <>
                <Wifi className="h-4 w-4 text-green-500" />
                <span className="text-xs text-green-500">En línea</span>
              </>
            ) : (
              <>
                <WifiOff className="h-4 w-4 text-red-500" />
                <span className="text-xs text-red-500">Sin conexión</span>
              </>
            )}
          </div>

          {/* Sound toggle */}
          <button
            onClick={toggleSound}
            className="flex items-center gap-1.5 rounded-md px-2.5 py-1 text-xs font-semibold transition-colors"
            style={{
              backgroundColor: soundEnabled ? "rgba(34,197,94,0.15)" : "rgba(255,255,255,0.05)",
              color: soundEnabled ? "#22C55E" : "#6B7280",
            }}
          >
            {soundEnabled ? <Volume2 className="h-4 w-4" /> : <VolumeX className="h-4 w-4" />}
            Sonido
          </button>
        </div>
      </header>

      {/* COLUMNS */}
      <div className="flex flex-1 min-h-0 divide-x divide-gray-800">
        <KDSColumn
          title="NUEVOS"
          count={newOrders.length}
          color="#EF4444"
          bgColor="rgba(239,68,68,0.12)"
          orders={newOrders}
          column="new"
          onAction={handleAction}
          onDisableItem={handleDisableItem}
          groupedNewItems={groupedNewItems}
        />
        <KDSColumn
          title="EN COCINA"
          count={kitchenOrders.length}
          color="#F59E0B"
          bgColor="rgba(245,158,11,0.12)"
          orders={kitchenOrders}
          column="kitchen"
          onAction={handleAction}
          onDisableItem={handleDisableItem}
        />
        <KDSColumn
          title="LISTOS PARA ENTREGAR"
          count={readyOrders.length}
          color="#22C55E"
          bgColor="rgba(34,197,94,0.12)"
          orders={readyOrders}
          column="ready"
          onAction={handleAction}
          recentlyDelivered={recentlyDelivered}
        />
      </div>
    </div>
  );
}
