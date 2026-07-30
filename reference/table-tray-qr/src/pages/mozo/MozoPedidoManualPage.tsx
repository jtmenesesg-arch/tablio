import { useEffect, useState, useMemo } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { useWaiters } from "@/contexts/WaitersContext";
import { supabase } from "@/integrations/supabase/client";
import { formatCLP } from "@/lib/format";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { useToast } from "@/hooks/use-toast";
import { Loader2, ArrowLeft, Plus, Minus, ShoppingCart, Trash2 } from "lucide-react";

interface Category {
  id: string;
  name: string;
  emoji: string | null;
  sort_order: number | null;
}

interface MenuItem {
  id: string;
  name: string;
  price: number;
  description_short: string | null;
  image_url: string | null;
  category_id: string;
  status: string | null;
}

interface CartItem {
  menuItem: MenuItem;
  quantity: number;
}

export default function MozoPedidoManualPage() {
  const { tableId } = useParams<{ tableId: string }>();
  const navigate = useNavigate();
  const { branchId, tenantId } = useWaiters();
  const { toast } = useToast();

  const [loading, setLoading] = useState(true);
  const [categories, setCategories] = useState<Category[]>([]);
  const [items, setItems] = useState<MenuItem[]>([]);
  const [selectedCat, setSelectedCat] = useState<string | null>(null);
  const [cart, setCart] = useState<CartItem[]>([]);
  const [cartOpen, setCartOpen] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [tableNumber, setTableNumber] = useState<number>(0);

  useEffect(() => {
    const load = async () => {
      // Get table info
      const { data: table } = await supabase
        .from("tables")
        .select("number")
        .eq("id", tableId!)
        .single();
      if (table) setTableNumber(table.number);

      // Get menu
      const { data: menu } = await supabase
        .from("menus")
        .select("id")
        .eq("branch_id", branchId)
        .eq("is_active", true)
        .limit(1)
        .maybeSingle();

      if (!menu) { setLoading(false); return; }

      const [catsRes, itemsRes] = await Promise.all([
        supabase.from("categories").select("id, name, emoji, sort_order").eq("menu_id", menu.id).eq("is_visible", true).order("sort_order"),
        supabase.from("menu_items").select("id, name, price, description_short, image_url, category_id, status").eq("tenant_id", tenantId).eq("status", "available"),
      ]);

      const cats = catsRes.data ?? [];
      setCategories(cats);
      setItems(itemsRes.data ?? []);
      if (cats.length > 0) setSelectedCat(cats[0].id);
      setLoading(false);
    };
    load();
  }, [tableId, branchId, tenantId]);

  const filteredItems = useMemo(() => {
    if (!selectedCat) return items;
    return items.filter(i => i.category_id === selectedCat);
  }, [items, selectedCat]);

  const addToCart = (item: MenuItem) => {
    setCart(prev => {
      const existing = prev.find(c => c.menuItem.id === item.id);
      if (existing) return prev.map(c => c.menuItem.id === item.id ? { ...c, quantity: c.quantity + 1 } : c);
      return [...prev, { menuItem: item, quantity: 1 }];
    });
  };

  const updateQty = (itemId: string, delta: number) => {
    setCart(prev => prev.map(c => {
      if (c.menuItem.id !== itemId) return c;
      const newQty = c.quantity + delta;
      return newQty <= 0 ? c : { ...c, quantity: newQty };
    }));
  };

  const removeFromCart = (itemId: string) => {
    setCart(prev => prev.filter(c => c.menuItem.id !== itemId));
  };

  const cartTotal = cart.reduce((s, c) => s + c.menuItem.price * c.quantity, 0);
  const cartCount = cart.reduce((s, c) => s + c.quantity, 0);

  const submitOrder = async () => {
    if (cart.length === 0) return;
    setSubmitting(true);

    // Get or create active session
    let { data: session } = await supabase
      .from("table_sessions")
      .select("id")
      .eq("table_id", tableId!)
      .eq("is_active", true)
      .limit(1)
      .maybeSingle();

    if (!session) {
      const { data: newSession } = await supabase
        .from("table_sessions")
        .insert({ table_id: tableId!, branch_id: branchId, tenant_id: tenantId })
        .select("id")
        .single();
      session = newSession;

      // Mark table as occupied
      await supabase.from("tables").update({ status: "occupied" }).eq("id", tableId!);
    }

    if (!session) {
      toast({ title: "Error", description: "No se pudo crear la sesión", variant: "destructive" });
      setSubmitting(false);
      return;
    }

    // Generate order number
    const { count } = await supabase
      .from("orders")
      .select("id", { count: "exact", head: true })
      .eq("branch_id", branchId);
    const orderNumber = (count ?? 0) + 1;

    // Insert order
    const { data: order, error } = await supabase
      .from("orders")
      .insert({
        branch_id: branchId,
        tenant_id: tenantId,
        table_id: tableId!,
        session_id: session.id,
        order_number: orderNumber,
        total_amount: cartTotal,
        status: "confirmed",
        source: "waiter",
        confirmed_at: new Date().toISOString(),
      })
      .select("id")
      .single();

    if (error || !order) {
      toast({ title: "Error", description: "No se pudo crear el pedido", variant: "destructive" });
      setSubmitting(false);
      return;
    }

    // Insert order items
    const orderItems = cart.map(c => ({
      order_id: order.id,
      tenant_id: tenantId,
      menu_item_id: c.menuItem.id,
      menu_item_name: c.menuItem.name,
      quantity: c.quantity,
      unit_price: c.menuItem.price,
      subtotal: c.menuItem.price * c.quantity,
    }));

    await supabase.from("order_items").insert(orderItems);

    // Update session total
    await supabase.rpc("get_tenant_id"); // dummy to keep session alive
    const { data: sessionOrders } = await supabase
      .from("orders")
      .select("total_amount")
      .eq("session_id", session.id)
      .neq("status", "cancelled");
    const sessionTotal = (sessionOrders ?? []).reduce((s, o) => s + o.total_amount, 0);
    await supabase.from("table_sessions").update({ total_amount: sessionTotal }).eq("id", session.id);

    toast({ title: `Pedido #${orderNumber} creado`, description: `Mesa ${tableNumber} · ${formatCLP(cartTotal)}` });
    navigate("/mozo/mesas");
  };

  if (loading) {
    return <div className="flex items-center justify-center h-64"><Loader2 className="w-6 h-6 animate-spin text-muted-foreground" /></div>;
  }

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="flex items-center gap-3 p-4 border-b border-border bg-card">
        <Button variant="ghost" size="icon" onClick={() => navigate("/mozo/mesas")}>
          <ArrowLeft className="h-5 w-5" />
        </Button>
        <div className="flex-1">
          <h2 className="text-sm font-bold">Pedido manual · Mesa {tableNumber}</h2>
          <p className="text-xs text-muted-foreground">Selecciona ítems del menú</p>
        </div>
        {cartCount > 0 && (
          <Button variant="outline" size="sm" className="relative" onClick={() => setCartOpen(true)}>
            <ShoppingCart className="h-4 w-4 mr-1" />
            {cartCount}
          </Button>
        )}
      </div>

      {/* Category tabs */}
      <div className="flex gap-2 overflow-x-auto px-4 py-3 border-b border-border bg-background no-scrollbar">
        {categories.map(cat => (
          <button
            key={cat.id}
            onClick={() => setSelectedCat(cat.id)}
            className={`shrink-0 px-3 py-1.5 rounded-full text-xs font-medium transition-colors ${
              selectedCat === cat.id
                ? "bg-primary text-primary-foreground"
                : "bg-muted text-muted-foreground"
            }`}
          >
            {cat.emoji} {cat.name}
          </button>
        ))}
      </div>

      {/* Items grid */}
      <div className="flex-1 overflow-auto p-4">
        <div className="grid grid-cols-1 gap-2">
          {filteredItems.map(item => {
            const inCart = cart.find(c => c.menuItem.id === item.id);
            return (
              <div key={item.id} className="flex items-center gap-3 bg-card border border-border rounded-lg p-3">
                {item.image_url && (
                  <img src={item.image_url} alt={item.name} className="w-12 h-12 rounded-md object-cover shrink-0" />
                )}
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium truncate">{item.name}</p>
                  {item.description_short && <p className="text-xs text-muted-foreground truncate">{item.description_short}</p>}
                  <p className="text-sm font-semibold text-primary">{formatCLP(item.price)}</p>
                </div>
                {inCart ? (
                  <div className="flex items-center gap-2">
                    <Button variant="outline" size="icon" className="h-7 w-7" onClick={() => updateQty(item.id, -1)}>
                      <Minus className="h-3 w-3" />
                    </Button>
                    <span className="text-sm font-bold w-5 text-center">{inCart.quantity}</span>
                    <Button variant="outline" size="icon" className="h-7 w-7" onClick={() => updateQty(item.id, 1)}>
                      <Plus className="h-3 w-3" />
                    </Button>
                  </div>
                ) : (
                  <Button size="sm" variant="outline" onClick={() => addToCart(item)}>
                    <Plus className="h-4 w-4" />
                  </Button>
                )}
              </div>
            );
          })}
        </div>
      </div>

      {/* Floating cart bar */}
      {cartCount > 0 && (
        <div className="border-t border-border bg-card p-4 safe-area-bottom">
          <Button className="w-full h-12" disabled={submitting} onClick={submitOrder}>
            {submitting ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}
            Confirmar pedido · {formatCLP(cartTotal)}
          </Button>
        </div>
      )}

      {/* Cart sheet */}
      <Sheet open={cartOpen} onOpenChange={setCartOpen}>
        <SheetContent side="bottom" className="max-h-[70vh] rounded-t-2xl px-4 pb-8">
          <SheetHeader className="mb-4">
            <SheetTitle>Carrito ({cartCount} ítems)</SheetTitle>
          </SheetHeader>
          <div className="space-y-2 max-h-[40vh] overflow-auto">
            {cart.map(c => (
              <div key={c.menuItem.id} className="flex items-center gap-3 p-2 bg-muted/50 rounded-lg">
                <div className="flex-1">
                  <p className="text-sm font-medium">{c.menuItem.name}</p>
                  <p className="text-xs text-muted-foreground">{formatCLP(c.menuItem.price)} × {c.quantity}</p>
                </div>
                <span className="text-sm font-semibold">{formatCLP(c.menuItem.price * c.quantity)}</span>
                <Button variant="ghost" size="icon" className="h-7 w-7 text-destructive" onClick={() => removeFromCart(c.menuItem.id)}>
                  <Trash2 className="h-4 w-4" />
                </Button>
              </div>
            ))}
          </div>
          <div className="flex justify-between items-center mt-4 text-lg font-bold">
            <span>Total</span>
            <span>{formatCLP(cartTotal)}</span>
          </div>
        </SheetContent>
      </Sheet>
    </div>
  );
}
