import { formatCLP } from "@/lib/format";
import { Clock, Plus, Minus, Flame } from "lucide-react";
import { useCartStore } from "@/store/cartStore";

interface MenuItemCardProps {
  item: {
    id: string;
    name: string;
    description_short: string | null;
    price: number;
    image_url: string | null;
    status: string | null;
    labels: string[] | null;
    prep_time_minutes: number | null;
    total_orders: number | null;
  };
  isHot: boolean;
  primaryColor: string;
  onTap: () => void;
}

const LABEL_MAP: Record<string, string> = {
  vegano: "Vegano",
  sin_gluten: "Sin gluten",
  picante: "Picante 🌶",
  nuevo: "Nuevo",
  recomendado: "Chef ⭐",
};

export default function MenuItemCard({ item, isHot, primaryColor, onTap }: MenuItemCardProps) {
  const cartItems = useCartStore((s) => s.items);
  const updateQuantity = useCartStore((s) => s.updateQuantity);
  const addItem = useCartStore((s) => s.addItem);
  const removeItem = useCartStore((s) => s.removeItem);

  const isOutOfStock = item.status === "out_of_stock";
  const firstLabel = item.labels?.find((l) => LABEL_MAP[l]);

  // aggregate quantity for this menu item across all cart lines
  const cartForItem = cartItems.filter((c) => c.menuItemId === item.id);
  const totalInCart = cartForItem.reduce((s, c) => s + c.quantity, 0);

  const handleQuickAdd = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (isOutOfStock) return;
    addItem({
      menuItemId: item.id,
      name: item.name,
      unitPrice: item.price,
      quantity: 1,
      selectedModifiers: [],
      itemNotes: "",
    });
  };

  const handleDecrement = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (cartForItem.length === 0) return;
    const last = cartForItem[cartForItem.length - 1];
    if (last.quantity <= 1) {
      removeItem(last.id);
    } else {
      updateQuantity(last.id, last.quantity - 1);
    }
  };

  return (
    <button
      onClick={onTap}
      disabled={isOutOfStock}
      className="flex flex-col rounded-xl bg-card shadow-sm border border-border overflow-hidden text-left transition-transform active:scale-[0.98] disabled:opacity-70"
    >
      {/* Image */}
      <div className="relative aspect-video w-full overflow-hidden">
        {item.image_url ? (
          <img src={item.image_url} alt={item.name} className="h-full w-full object-cover" loading="lazy" />
        ) : (
          <div className="flex h-full w-full items-center justify-center text-3xl" style={{ backgroundColor: `${primaryColor}18` }}>
            🍽
          </div>
        )}

        {isOutOfStock && (
          <div className="absolute inset-0 flex items-center justify-center bg-foreground/60">
            <span className="rounded-full bg-background/90 px-3 py-1 text-xs font-bold text-foreground">Agotado</span>
          </div>
        )}

        {/* Badges */}
        <div className="absolute top-1.5 left-1.5 flex gap-1">
          {isHot && (
            <span className="flex items-center gap-0.5 rounded-full bg-orange-500 px-1.5 py-0.5 text-[10px] font-bold text-white">
              <Flame className="h-3 w-3" /> Popular
            </span>
          )}
          {firstLabel && (
            <span className="rounded-full bg-background/90 px-1.5 py-0.5 text-[10px] font-semibold text-foreground">
              {LABEL_MAP[firstLabel]}
            </span>
          )}
        </div>
      </div>

      {/* Info */}
      <div className="flex flex-1 flex-col gap-1 p-2.5 pb-3 relative">
        <h3 className="text-sm font-bold leading-tight line-clamp-2 text-card-foreground">{item.name}</h3>
        {item.description_short && (
          <p className="text-xs leading-snug text-muted-foreground line-clamp-2">{item.description_short}</p>
        )}
        <div className="mt-auto flex items-end justify-between pt-1">
          <div>
            <span className="text-sm font-bold text-card-foreground">{formatCLP(item.price)}</span>
            {item.prep_time_minutes && (
              <span className="ml-1.5 inline-flex items-center gap-0.5 text-[11px] text-muted-foreground">
                <Clock className="h-3 w-3" />~{item.prep_time_minutes} min
              </span>
            )}
          </div>

          {/* Quick add / quantity */}
          {!isOutOfStock && (
            <div className="flex items-center" onClick={(e) => e.stopPropagation()}>
              {totalInCart > 0 ? (
                <div className="flex items-center gap-1">
                  <button
                    onClick={handleDecrement}
                    className="flex h-7 w-7 items-center justify-center rounded-full border border-border text-foreground"
                  >
                    <Minus className="h-3.5 w-3.5" />
                  </button>
                  <span className="w-5 text-center text-xs font-bold text-foreground">{totalInCart}</span>
                  <button
                    onClick={handleQuickAdd}
                    className="flex h-7 w-7 items-center justify-center rounded-full text-white"
                    style={{ backgroundColor: primaryColor }}
                  >
                    <Plus className="h-3.5 w-3.5" />
                  </button>
                </div>
              ) : (
                <button
                  onClick={handleQuickAdd}
                  className="flex h-7 w-7 items-center justify-center rounded-full text-white shadow-sm"
                  style={{ backgroundColor: primaryColor }}
                >
                  <Plus className="h-4 w-4" />
                </button>
              )}
            </div>
          )}
        </div>
      </div>
    </button>
  );
}
