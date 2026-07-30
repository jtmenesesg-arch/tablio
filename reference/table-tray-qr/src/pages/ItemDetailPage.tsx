import { useState, useMemo, useRef, useCallback, useEffect } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { motion, AnimatePresence } from "framer-motion";
import { ArrowLeft, Clock, Camera, Minus, Plus, Check } from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";
import { useCartStore, type CartModifier } from "@/store/cartStore";
import { formatCLP } from "@/lib/format";

/* ---------- types ---------- */
interface Modifier {
  id: string;
  name: string;
  extra_price: number;
}

interface ModifierGroup {
  id: string;
  name: string;
  type: string;
  required: boolean;
  min_selections: number;
  max_selections: number;
  modifiers: Modifier[];
}

interface ItemDetail {
  id: string;
  name: string;
  description_short: string | null;
  description_long: string | null;
  price: number;
  image_url: string | null;
  image_is_real: boolean;
  status: string | null;
  labels: string[] | null;
  allergens: string[] | null;
  prep_time_minutes: number | null;
  total_orders: number | null;
}

interface ItemData {
  item: ItemDetail;
  groups: ModifierGroup[];
}

/* ---------- constants ---------- */
const ALLERGEN_MAP: Record<string, string> = {
  gluten: "🌾 Gluten",
  lactosa: "🥛 Lactosa",
  frutos_secos: "🥜 Frutos secos",
  mariscos: "🦐 Mariscos",
  huevo: "🥚 Huevo",
  soja: "🫘 Soja",
  pescado: "🐟 Pescado",
  apio: "🌿 Apio",
  mostaza: "🟡 Mostaza",
  sesamo: "🌰 Sésamo",
  sulfitos: "🍷 Sulfitos",
  altramuces: "🌱 Altramuces",
  moluscos: "🦑 Moluscos",
  cacahuetes: "🥜 Cacahuetes",
};

const LABEL_STYLES: Record<string, { bg: string; text: string; label: string }> = {
  vegano: { bg: "#dcfce7", text: "#166534", label: "Vegano 🌱" },
  sin_gluten: { bg: "#dbeafe", text: "#1e40af", label: "Sin gluten" },
  picante: { bg: "#fee2e2", text: "#991b1b", label: "Picante 🌶" },
  nuevo: { bg: "#ffedd5", text: "#9a3412", label: "Nuevo ✨" },
  recomendado: { bg: "#fef9c3", text: "#854d0e", label: "Recomendado ⭐" },
};

/* ---------- fetcher ---------- */
async function fetchItemDetail(id: string): Promise<ItemData | null> {
  const { data: mi } = await supabase
    .from("menu_items")
    .select("id, name, description_short, description_long, price, image_url, image_is_real, status, labels, allergens, prep_time_minutes, total_orders")
    .eq("id", id)
    .maybeSingle();
  if (!mi) return null;

  const { data: groups } = await supabase
    .from("modifier_groups")
    .select("id, name, type, required, min_selections, max_selections, sort_order")
    .eq("menu_item_id", id)
    .order("sort_order");

  const groupList: ModifierGroup[] = [];
  if (groups && groups.length > 0) {
    const groupIds = groups.map((g) => g.id);
    const { data: mods } = await supabase
      .from("modifiers")
      .select("id, name, extra_price, group_id")
      .in("group_id", groupIds)
      .eq("is_available", true)
      .order("sort_order");

    const modsByGroup = new Map<string, Modifier[]>();
    (mods || []).forEach((m: any) => {
      const list = modsByGroup.get(m.group_id) || [];
      list.push({ id: m.id, name: m.name, extra_price: m.extra_price || 0 });
      modsByGroup.set(m.group_id, list);
    });

    for (const g of groups) {
      groupList.push({
        id: g.id,
        name: g.name,
        type: g.type,
        required: g.required ?? false,
        min_selections: g.min_selections ?? 0,
        max_selections: g.max_selections ?? 1,
        modifiers: modsByGroup.get(g.id) || [],
      });
    }
  }

  return {
    item: {
      id: mi.id,
      name: mi.name,
      description_short: mi.description_short,
      description_long: mi.description_long,
      price: mi.price,
      image_url: mi.image_url,
      image_is_real: mi.image_is_real ?? false,
      status: mi.status,
      labels: mi.labels as string[] | null,
      allergens: mi.allergens as string[] | null,
      prep_time_minutes: mi.prep_time_minutes,
      total_orders: mi.total_orders,
    },
    groups: groupList.filter((g) => g.modifiers.length > 0),
  };
}

/* ---------- skeleton ---------- */
function DetailSkeleton() {
  return (
    <div className="min-h-screen bg-background">
      <Skeleton className="w-full" style={{ height: 280 }} />
      <div className="flex flex-col gap-3 p-4">
        <Skeleton className="h-7 w-3/4" />
        <Skeleton className="h-5 w-1/3" />
        <Skeleton className="h-4 w-full" />
        <Skeleton className="h-4 w-5/6" />
        <Skeleton className="h-10 w-full mt-4" />
        <Skeleton className="h-10 w-full" />
      </div>
    </div>
  );
}

/* ---------- tenant mini ---------- */
async function fetchPrimaryColor(slug: string): Promise<string> {
  const { data } = await supabase
    .from("tenants")
    .select("primary_color")
    .eq("slug", slug)
    .maybeSingle();
  return data?.primary_color || "#E8531D";
}

/* ---------- component ---------- */
export default function ItemDetailPage() {
  const { slug, id } = useParams<{ slug: string; id: string }>();
  const navigate = useNavigate();

  const addItem = useCartStore((s) => s.addItem);

  const { data: primaryColor = "#E8531D" } = useQuery({
    queryKey: ["primary-color", slug],
    queryFn: () => fetchPrimaryColor(slug!),
    enabled: !!slug,
    staleTime: Infinity,
  });

  const { data, isLoading } = useQuery({
    queryKey: ["item-detail", id],
    queryFn: () => fetchItemDetail(id!),
    enabled: !!id,
    staleTime: 2 * 60 * 1000,
  });

  // Local state
  const [selections, setSelections] = useState<Map<string, Set<string>>>(new Map());
  const [notes, setNotes] = useState("");
  const [quantity, setQuantity] = useState(1);
  const [invalidGroups, setInvalidGroups] = useState<Set<string>>(new Set());
  const [showSuccess, setShowSuccess] = useState(false);
  const groupRefs = useRef<Map<string, HTMLDivElement>>(new Map());

  // Reset state when item changes
  useEffect(() => {
    setSelections(new Map());
    setNotes("");
    setQuantity(1);
    setInvalidGroups(new Set());
  }, [id]);

  const item = data?.item;
  const groups = data?.groups || [];
  const isOutOfStock = item?.status === "out_of_stock";
  const hasRealImage = item?.image_url && item?.image_is_real;

  // Selection handlers
  const toggleSelection = useCallback((groupId: string, modId: string, type: string, maxSel: number) => {
    setSelections((prev) => {
      const next = new Map(prev);
      const current = new Set(next.get(groupId) || []);

      if (type === "choose_one") {
        current.clear();
        current.add(modId);
      } else {
        if (current.has(modId)) {
          current.delete(modId);
        } else {
          if (type === "choose_many" && current.size >= maxSel) return prev;
          current.add(modId);
        }
      }
      next.set(groupId, current);
      setInvalidGroups((inv) => {
        const n = new Set(inv);
        n.delete(groupId);
        return n;
      });
      return next;
    });
  }, []);

  // Price calculation
  const extraPrice = useMemo(() => {
    let total = 0;
    for (const group of groups) {
      const sel = selections.get(group.id);
      if (!sel) continue;
      for (const mod of group.modifiers) {
        if (sel.has(mod.id)) total += mod.extra_price;
      }
    }
    return total;
  }, [groups, selections]);

  const finalPrice = item ? (item.price + extraPrice) * quantity : 0;

  // Validation
  const validate = useCallback((): boolean => {
    const invalid = new Set<string>();
    for (const group of groups) {
      if (!group.required) continue;
      const sel = selections.get(group.id);
      const count = sel?.size || 0;
      if (count < group.min_selections || (group.type === "choose_one" && count === 0)) {
        invalid.add(group.id);
      }
    }
    setInvalidGroups(invalid);
    if (invalid.size > 0) {
      const firstId = [...invalid][0];
      const el = groupRefs.current.get(firstId);
      el?.scrollIntoView({ behavior: "smooth", block: "center" });
      return false;
    }
    return true;
  }, [groups, selections]);

  // Add to cart
  const handleAdd = () => {
    if (!item || isOutOfStock) return;
    if (!validate()) return;

    const selectedModifiers: CartModifier[] = [];
    for (const group of groups) {
      const sel = selections.get(group.id);
      if (!sel) continue;
      for (const mod of group.modifiers) {
        if (sel.has(mod.id)) {
          selectedModifiers.push({
            groupName: group.name,
            modifierName: mod.name,
            extraPrice: mod.extra_price,
          });
        }
      }
    }

    addItem({
      menuItemId: item.id,
      name: item.name,
      unitPrice: item.price,
      quantity,
      selectedModifiers,
      itemNotes: notes.trim(),
    });

    setShowSuccess(true);
    setTimeout(() => {
      navigate(`/${slug}/menu`);
    }, 800);
  };

  // Check if all required groups are satisfied
  const allRequiredMet = useMemo(() => {
    for (const group of groups) {
      if (!group.required) continue;
      const sel = selections.get(group.id);
      const count = sel?.size || 0;
      if (group.type === "choose_one" && count === 0) return false;
      if (count < group.min_selections) return false;
    }
    return true;
  }, [groups, selections]);

  if (isLoading) return <DetailSkeleton />;
  if (!item) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background">
        <div className="text-center">
          <p className="text-lg font-bold text-foreground">Plato no encontrado</p>
          <button onClick={() => navigate(`/${slug}/menu`)} className="mt-3 text-sm underline text-muted-foreground">
            Volver al menú
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background pb-24">
      {/* Success overlay */}
      <AnimatePresence>
        {showSuccess && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-[100] flex items-center justify-center bg-foreground/40"
          >
            <motion.div
              initial={{ scale: 0 }}
              animate={{ scale: 1 }}
              transition={{ type: "spring", stiffness: 300, damping: 20 }}
              className="flex h-20 w-20 items-center justify-center rounded-full bg-green-500"
            >
              <Check className="h-10 w-10 text-white" />
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Hero image with overlaid back button */}
      {hasRealImage ? (
        <div className="relative w-full" style={{ height: 280 }}>
          <img
            src={item.image_url!}
            alt={item.name}
            className="w-full h-full object-cover"
          />
          {/* Back button overlay */}
          <button
            onClick={() => navigate(`/${slug}/menu`)}
            className="absolute top-4 left-4 flex h-9 w-9 items-center justify-center rounded-full bg-black/40 backdrop-blur-sm text-white"
          >
            <ArrowLeft className="h-5 w-5" />
          </button>
          {/* Foto real badge */}
          <span className="absolute top-4 right-4 flex items-center gap-1 rounded-full bg-background/90 px-2 py-1 text-[11px] font-semibold text-foreground shadow">
            <Camera className="h-3 w-3" /> Foto real
          </span>
          {/* Labels overlay */}
          {item.labels && item.labels.length > 0 && (
            <div className="absolute bottom-3 left-3 flex flex-wrap gap-1">
              {item.labels.map((label) => {
                const style = LABEL_STYLES[label];
                if (!style) return null;
                return (
                  <span key={label} className="text-xs font-semibold px-2 py-0.5 rounded-full" style={{ backgroundColor: style.bg, color: style.text }}>
                    {style.label}
                  </span>
                );
              })}
            </div>
          )}
          {/* Out of stock overlay */}
          {isOutOfStock && (
            <div className="absolute inset-0 flex items-center justify-center bg-foreground/60">
              <span className="rounded-full bg-background/90 px-4 py-1.5 text-sm font-bold text-foreground">Agotado</span>
            </div>
          )}
        </div>
      ) : (
        <>
          {/* No real image — show back button normally + spacer or placeholder */}
          <button
            onClick={() => navigate(`/${slug}/menu`)}
            className="absolute left-3 top-3 z-20 flex h-9 w-9 items-center justify-center rounded-full bg-background/80 backdrop-blur-sm shadow text-foreground"
          >
            <ArrowLeft className="h-5 w-5" />
          </button>
          <div className="relative w-full overflow-hidden bg-muted" style={{ height: item.image_url ? 220 : 56 }}>
            {item.image_url ? (
              <img src={item.image_url} alt={item.name} className="h-full w-full object-cover" />
            ) : (
              <div className="flex h-full w-full items-center justify-center text-[80px]" style={{ backgroundColor: `${primaryColor}18` }}>
                🍽
              </div>
            )}
            {isOutOfStock && item.image_url && (
              <div className="absolute inset-0 flex items-center justify-center bg-foreground/60">
                <span className="rounded-full bg-background/90 px-4 py-1.5 text-sm font-bold text-foreground">Agotado</span>
              </div>
            )}
          </div>
        </>
      )}

      {/* Body */}
      <div className="px-4 pt-4">
        <h1 className="text-[22px] font-bold leading-tight text-foreground">{item.name}</h1>

        {/* Social proof */}
        {item.total_orders && item.total_orders > 5 && (
          <p className="text-xs text-muted-foreground mt-1 flex items-center gap-1">
            🔥 <span>{item.total_orders} personas lo pidieron</span>
          </p>
        )}

        {/* Prep time pill */}
        {item.prep_time_minutes && (
          <div className="flex items-center gap-1 mt-2">
            <span className="text-xs bg-muted text-muted-foreground px-2 py-1 rounded-full flex items-center gap-1">
              <Clock className="h-3 w-3" /> {item.prep_time_minutes} min aprox.
            </span>
          </div>
        )}

        <div className="mt-2 flex items-center gap-3">
          <span className="text-xl font-bold" style={{ color: primaryColor }}>
            {formatCLP(item.price)}
          </span>
        </div>

        {(item.description_long || item.description_short) && (
          <p className="mt-3 text-[15px] leading-relaxed text-muted-foreground">
            {item.description_long || item.description_short}
          </p>
        )}

        {/* Labels (only when no hero image, since hero has them overlaid) */}
        {!hasRealImage && item.labels && item.labels.length > 0 && (
          <div className="mt-3 flex flex-wrap gap-1.5">
            {item.labels.map((l) => {
              const s = LABEL_STYLES[l];
              if (!s) return null;
              return (
                <span key={l} className="rounded-full px-2.5 py-1 text-xs font-semibold" style={{ backgroundColor: s.bg, color: s.text }}>
                  {s.label}
                </span>
              );
            })}
          </div>
        )}

        {item.allergens && item.allergens.length > 0 && (
          <div className="mt-4">
            <p className="text-[13px] font-bold text-muted-foreground mb-1.5">Alérgenos</p>
            <div className="flex flex-wrap gap-1.5">
              {item.allergens.map((a) => (
                <span key={a} className="rounded-full bg-muted px-2.5 py-1 text-xs text-muted-foreground">
                  {ALLERGEN_MAP[a] || a}
                </span>
              ))}
            </div>
          </div>
        )}

        {groups.length > 0 && <hr className="my-5 border-border" />}

        {groups.map((group) => {
          const sel = selections.get(group.id) || new Set<string>();
          const isInvalid = invalidGroups.has(group.id);
          const subtitle = getGroupSubtitle(group);

          return (
            <div
              key={group.id}
              ref={(el) => { if (el) groupRefs.current.set(group.id, el); }}
              className="mb-5"
            >
              <div className="flex items-center gap-2 mb-1">
                <h3 className={`text-[15px] font-bold ${isInvalid ? "text-destructive" : "text-foreground"}`}>
                  {group.name}
                </h3>
                {group.required && (
                  <span className="rounded bg-destructive/10 px-1.5 py-0.5 text-[10px] font-bold text-destructive">
                    Requerido
                  </span>
                )}
              </div>
              <p className="text-xs text-muted-foreground mb-2">{subtitle}</p>

              {group.type === "choose_many" && (
                <p className="text-xs text-muted-foreground mb-2">
                  {sel.size} / {group.max_selections} seleccionados
                </p>
              )}

              <div className="flex flex-col gap-1">
                {group.modifiers.map((mod) => {
                  const isSelected = sel.has(mod.id);
                  const isDisabled = group.type === "choose_many" && !isSelected && sel.size >= group.max_selections;

                  return (
                    <button
                      key={mod.id}
                      onClick={() => toggleSelection(group.id, mod.id, group.type, group.max_selections)}
                      disabled={isDisabled}
                      className={`flex items-center gap-3 rounded-xl px-3 py-3 text-left transition-colors border ${
                        isSelected
                          ? "border-current bg-accent"
                          : "border-border bg-card"
                      } disabled:opacity-40`}
                      style={isSelected ? { borderColor: primaryColor } : undefined}
                    >
                      <div
                        className={`flex h-5 w-5 shrink-0 items-center justify-center rounded-${
                          group.type === "choose_one" ? "full" : "md"
                        } border-2 transition-colors`}
                        style={
                          isSelected
                            ? { backgroundColor: primaryColor, borderColor: primaryColor }
                            : { borderColor: "hsl(var(--border))" }
                        }
                      >
                        {isSelected && <Check className="h-3 w-3 text-white" />}
                      </div>

                      <span className="flex-1 text-sm text-foreground">{mod.name}</span>

                      {mod.extra_price > 0 && (
                        <span className="text-xs font-medium text-muted-foreground">+{formatCLP(mod.extra_price)}</span>
                      )}
                    </button>
                  );
                })}
              </div>
            </div>
          );
        })}

        {/* Notes */}
        <div className="mt-2 mb-5">
          <label className="text-[13px] font-bold text-muted-foreground">Nota para cocina (opcional)</label>
          <textarea
            value={notes}
            onChange={(e) => setNotes(e.target.value.slice(0, 200))}
            placeholder="Ej: sin sal, alergia al gluten, bien cocido..."
            className="mt-1.5 w-full rounded-xl border border-border bg-card px-3 py-2.5 text-sm text-foreground placeholder:text-muted-foreground resize-none outline-none focus:ring-1 focus:ring-ring"
            rows={2}
          />
          <p className="mt-1 text-right text-[11px] text-muted-foreground">{notes.length}/200</p>
        </div>

        <hr className="border-border mb-5" />

        {/* Quantity */}
        <div className="flex items-center justify-center gap-4 mb-6">
          <button
            onClick={() => setQuantity((q) => Math.max(1, q - 1))}
            className="flex h-10 w-10 items-center justify-center rounded-full border border-border text-foreground transition-colors active:bg-muted"
          >
            <Minus className="h-4 w-4" />
          </button>
          <span className="w-8 text-center text-lg font-bold text-foreground">{quantity}</span>
          <button
            onClick={() => setQuantity((q) => Math.min(20, q + 1))}
            className="flex h-10 w-10 items-center justify-center rounded-full text-white transition-colors active:opacity-80"
            style={{ backgroundColor: primaryColor }}
          >
            <Plus className="h-4 w-4" />
          </button>
        </div>
      </div>

      {/* Fixed footer */}
      <div className="fixed bottom-0 left-0 right-0 z-40 border-t border-border bg-background px-4 py-4 shadow-[0_-4px_12px_rgba(0,0,0,0.05)]">
        <button
          onClick={handleAdd}
          disabled={isOutOfStock || (!allRequiredMet && groups.some((g) => g.required))}
          className="flex w-full items-center justify-center rounded-2xl py-4 text-base font-semibold text-white shadow transition-transform active:scale-[0.97] disabled:opacity-50 disabled:cursor-not-allowed"
          style={{ backgroundColor: isOutOfStock ? "#6b7280" : primaryColor, minHeight: "3.5rem" }}
        >
          {isOutOfStock
            ? "No disponible"
            : !allRequiredMet && groups.some((g) => g.required)
              ? "Elige las opciones requeridas"
              : `Agregar al carrito · ${formatCLP(finalPrice)}`}
        </button>
      </div>
    </div>
  );
}

/* ---------- helpers ---------- */
function getGroupSubtitle(group: ModifierGroup): string {
  switch (group.type) {
    case "remove":
      return "Elige qué quitar (opcional)";
    case "add":
      return "Agregar extras (opcional)";
    case "choose_one":
      return group.required ? "Elige una opción (obligatorio)" : "Elige una opción (opcional)";
    case "choose_many":
      return `Elige entre ${group.min_selections} y ${group.max_selections} opciones`;
    default:
      return "";
  }
}
