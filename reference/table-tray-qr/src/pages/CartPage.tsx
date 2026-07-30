import { useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { motion, AnimatePresence } from "framer-motion";
import { ArrowLeft, Trash2, Minus, Plus, ArrowRight } from "lucide-react";
import { useCartStore } from "@/store/cartStore";
import { formatCLP } from "@/lib/format";
import { supabase } from "@/integrations/supabase/client";

/* fetch primary color */
async function fetchPrimaryColor(slug: string): Promise<string> {
  const { data } = await supabase
    .from("tenants")
    .select("primary_color")
    .eq("slug", slug)
    .maybeSingle();
  return data?.primary_color || "#E8531D";
}

export default function CartPage() {
  const { slug } = useParams<{ slug: string }>();
  const navigate = useNavigate();

  const items = useCartStore((s) => s.items);
  const updateQuantity = useCartStore((s) => s.updateQuantity);
  const removeItem = useCartStore((s) => s.removeItem);
  const clearCart = useCartStore((s) => s.clearCart);
  const totalPrice = useCartStore((s) => s.getTotalPrice());

  const { data: primaryColor = "#E8531D" } = useQuery({
    queryKey: ["primary-color", slug],
    queryFn: () => fetchPrimaryColor(slug!),
    enabled: !!slug,
    staleTime: Infinity,
  });

  const [orderNotes, setOrderNotes] = useState("");
  const [showClearConfirm, setShowClearConfirm] = useState(false);

  const handleConfirm = () => {
    navigate(`/${slug}/confirm`, { state: { orderNotes: orderNotes.trim(), autoScan: true } });
  };

  return (
    <motion.div
      initial={{ x: "100%" }}
      animate={{ x: 0 }}
      exit={{ x: "100%" }}
      transition={{ type: "tween", duration: 0.25 }}
      className="min-h-screen bg-background pb-28"
    >
      {/* Header */}
      <header className="sticky top-0 z-40 flex h-14 items-center justify-between border-b border-border bg-background px-4">
        <button onClick={() => navigate(`/${slug}/menu`)} className="flex h-9 w-9 items-center justify-center rounded-full text-foreground">
          <ArrowLeft className="h-5 w-5" />
        </button>
        <span className="text-sm font-bold text-foreground">Tu pedido</span>
        {items.length > 0 ? (
          <button onClick={() => setShowClearConfirm(true)} className="text-xs font-semibold text-destructive">
            Vaciar
          </button>
        ) : (
          <div className="w-9" />
        )}
      </header>

      {/* Clear confirm modal */}
      <AnimatePresence>
        {showClearConfirm && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 flex items-center justify-center bg-foreground/40 px-6"
            onClick={() => setShowClearConfirm(false)}
          >
            <motion.div
              initial={{ scale: 0.9, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.9, opacity: 0 }}
              onClick={(e) => e.stopPropagation()}
              className="w-full max-w-sm rounded-2xl bg-background p-6 shadow-xl"
            >
              <h3 className="text-base font-bold text-foreground">¿Vaciar el carrito?</h3>
              <p className="mt-1 text-sm text-muted-foreground">Se eliminarán todos los platos.</p>
              <div className="mt-5 flex gap-3">
                <button
                  onClick={() => setShowClearConfirm(false)}
                  className="flex-1 rounded-xl border border-border py-3 text-sm font-semibold text-foreground"
                >
                  No
                </button>
                <button
                  onClick={() => { clearCart(); setShowClearConfirm(false); }}
                  className="flex-1 rounded-xl bg-destructive py-3 text-sm font-semibold text-destructive-foreground"
                >
                  Sí, vaciar
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Body */}
      {items.length === 0 ? (
        <div className="flex flex-col items-center justify-center px-6 pt-24 text-center">
          <div className="text-[96px] leading-none mb-4">🛒</div>
          <h2 className="text-lg font-bold text-foreground">Tu carrito está vacío</h2>
          <p className="mt-1 text-sm text-muted-foreground">Agrega platos desde el menú</p>
          <button
            onClick={() => navigate(`/${slug}/menu`)}
            className="mt-6 flex items-center gap-2 rounded-2xl px-6 py-3 text-sm font-semibold text-white"
            style={{ backgroundColor: primaryColor }}
          >
            Ver el menú <ArrowRight className="h-4 w-4" />
          </button>
        </div>
      ) : (
        <div className="px-4 pt-3">
          {/* Items */}
          <AnimatePresence initial={false}>
            {items.map((item) => (
              <motion.div
                key={item.id}
                layout
                initial={{ opacity: 1, height: "auto" }}
                exit={{ opacity: 0, height: 0, marginBottom: 0, overflow: "hidden" }}
                transition={{ duration: 0.2 }}
                className="mb-3"
              >
                <div className="rounded-xl border border-border bg-card p-3">
                  <div className="flex items-start justify-between">
                    <div className="flex-1 min-w-0">
                      <h3 className="text-sm font-bold text-card-foreground truncate">{item.name}</h3>
                      {item.selectedModifiers.length > 0 && (
                        <div className="mt-1 flex flex-wrap gap-1">
                          {item.selectedModifiers.map((m, i) => (
                            <span key={i} className="text-xs text-muted-foreground">
                              {m.modifierName}{m.extraPrice > 0 ? ` (+${formatCLP(m.extraPrice)})` : ""}
                              {i < item.selectedModifiers.length - 1 ? "," : ""}
                            </span>
                          ))}
                        </div>
                      )}
                      {item.itemNotes && (
                        <p className="mt-1 text-xs italic text-muted-foreground truncate">
                          Nota: {item.itemNotes}
                        </p>
                      )}
                    </div>
                    <button onClick={() => removeItem(item.id)} className="ml-2 flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-muted-foreground hover:text-destructive">
                      <Trash2 className="h-4 w-4" />
                    </button>
                  </div>

                  <div className="mt-3 flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <button
                        onClick={() => updateQuantity(item.id, item.quantity - 1)}
                        className="flex h-8 w-8 items-center justify-center rounded-full border border-border text-foreground"
                      >
                        <Minus className="h-3.5 w-3.5" />
                      </button>
                      <span className="w-5 text-center text-sm font-bold text-foreground">{item.quantity}</span>
                      <button
                        onClick={() => updateQuantity(item.id, Math.min(20, item.quantity + 1))}
                        className="flex h-8 w-8 items-center justify-center rounded-full text-white"
                        style={{ backgroundColor: primaryColor }}
                      >
                        <Plus className="h-3.5 w-3.5" />
                      </button>
                    </div>
                    <span className="text-sm font-bold text-card-foreground">{formatCLP(item.subtotal)}</span>
                  </div>
                </div>
              </motion.div>
            ))}
          </AnimatePresence>

          {/* Summary */}
          <div className="mt-2 rounded-xl border border-border bg-card p-4">
            <div className="flex items-center justify-between">
              <span className="text-sm text-muted-foreground">Subtotal</span>
              <span className="text-sm font-bold text-card-foreground">{formatCLP(totalPrice)}</span>
            </div>
          </div>

          {/* Order notes */}
          <div className="mt-4 mb-4">
            <label className="text-[13px] font-bold text-muted-foreground">Nota general para el pedido (opcional)</label>
            <textarea
              value={orderNotes}
              onChange={(e) => setOrderNotes(e.target.value.slice(0, 300))}
              placeholder="Ej: somos celíacos, traer todo junto"
              className="mt-1.5 w-full rounded-xl border border-border bg-card px-3 py-2.5 text-sm text-foreground placeholder:text-muted-foreground resize-none outline-none focus:ring-1 focus:ring-ring"
              rows={2}
            />
            <p className="mt-1 text-right text-[11px] text-muted-foreground">{orderNotes.length}/300</p>
          </div>
        </div>
      )}

      {/* Footer */}
      {items.length > 0 && (
        <div className="fixed bottom-0 left-0 right-0 z-40 border-t border-border bg-background px-4 py-4 shadow-[0_-4px_12px_rgba(0,0,0,0.05)]">
          <div className="flex items-center justify-between mb-3">
            <span className="text-sm text-muted-foreground">Total</span>
            <span className="text-lg font-bold" style={{ color: primaryColor }}>{formatCLP(totalPrice)}</span>
          </div>
          <button
            onClick={handleConfirm}
            className="flex w-full items-center justify-center gap-2 rounded-2xl py-4 text-base font-semibold text-white shadow transition-transform active:scale-[0.97]"
            style={{ backgroundColor: primaryColor, minHeight: "3.5rem" }}
          >
            Confirmar pedido <ArrowRight className="h-5 w-5" />
          </button>
        </div>
      )}
    </motion.div>
  );
}
