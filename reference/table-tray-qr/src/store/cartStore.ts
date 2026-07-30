import { create } from "zustand";
import { persist, createJSONStorage } from "zustand/middleware";

export interface CartModifier {
  groupName: string;
  modifierName: string;
  extraPrice: number;
}

export interface CartItem {
  id: string;
  menuItemId: string;
  name: string;
  unitPrice: number;
  quantity: number;
  selectedModifiers: CartModifier[];
  itemNotes: string;
  subtotal: number;
}

interface CartState {
  items: CartItem[];
  tableToken: string | null;
  tenantId: string | null;
  branchId: string | null;
  tableNumber: number | null;
  addItem: (item: Omit<CartItem, "id" | "subtotal">) => void;
  removeItem: (id: string) => void;
  updateQuantity: (id: string, quantity: number) => void;
  clearCart: () => void;
  setTableContext: (tenantId: string | null, branchId: string | null) => void;
  setTableToken: (token: string) => void;
  setTableNumber: (num: number) => void;
  getTotalItems: () => number;
  getTotalPrice: () => number;
}

const calcSubtotal = (item: Pick<CartItem, "unitPrice" | "quantity" | "selectedModifiers">) =>
  (item.unitPrice + item.selectedModifiers.reduce((s, m) => s + m.extraPrice, 0)) * item.quantity;

export const useCartStore = create<CartState>()(
  persist(
    (set, get) => ({
      items: [],
      tableToken: null,
      tenantId: null,
      branchId: null,
      tableNumber: null,

      addItem: (item) => {
        const existing = get().items.find(
          (i) =>
            i.menuItemId === item.menuItemId &&
            JSON.stringify(i.selectedModifiers) === JSON.stringify(item.selectedModifiers) &&
            i.itemNotes === item.itemNotes
        );

        if (existing) {
          set((s) => ({
            items: s.items.map((i) =>
              i.id === existing.id
                ? { ...i, quantity: i.quantity + item.quantity, subtotal: calcSubtotal({ ...i, quantity: i.quantity + item.quantity }) }
                : i
            ),
          }));
        } else {
          const id = crypto.randomUUID();
          const subtotal = calcSubtotal(item);
          set((s) => ({ items: [...s.items, { ...item, id, subtotal }] }));
        }
      },

      removeItem: (id) => set((s) => ({ items: s.items.filter((i) => i.id !== id) })),

      updateQuantity: (id, quantity) => {
        if (quantity <= 0) {
          set((s) => ({ items: s.items.filter((i) => i.id !== id) }));
          return;
        }
        set((s) => ({
          items: s.items.map((i) =>
            i.id === id ? { ...i, quantity, subtotal: calcSubtotal({ ...i, quantity }) } : i
          ),
        }));
      },

      clearCart: () => set({ items: [] }),

      setTableContext: (tenantId, branchId) => set({ tenantId, branchId }),

      setTableToken: (token) => set({ tableToken: token }),

      setTableNumber: (num) => set({ tableNumber: num }),

      getTotalItems: () => get().items.reduce((s, i) => s + i.quantity, 0),

      getTotalPrice: () => get().items.reduce((s, i) => s + i.subtotal, 0),
    }),
    {
      name: "tablio-cart",
      storage: createJSONStorage(() => sessionStorage),
      partialize: (state) => ({
        items: state.items,
        tableToken: state.tableToken,
        tenantId: state.tenantId,
        branchId: state.branchId,
        tableNumber: state.tableNumber,
      }),
    }
  )
);
