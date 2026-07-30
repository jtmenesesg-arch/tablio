import { motion } from "framer-motion";
import { formatCLP } from "@/lib/format";
import { ShoppingBag } from "lucide-react";

interface FloatingCartBarProps {
  totalItems: number;
  totalPrice: number;
  primaryColor: string;
  onTap: () => void;
}

export default function FloatingCartBar({ totalItems, totalPrice, primaryColor, onTap }: FloatingCartBarProps) {
  if (totalItems === 0) return null;

  return (
    <motion.div
      initial={{ y: 80, opacity: 0 }}
      animate={{ y: 0, opacity: 1 }}
      exit={{ y: 80, opacity: 0 }}
      className="fixed bottom-4 left-4 right-4 z-50"
    >
      <button
        onClick={onTap}
        className="flex w-full items-center justify-between rounded-2xl px-5 py-4 text-white shadow-lg transition-transform active:scale-[0.97]"
        style={{ backgroundColor: primaryColor, minHeight: "3.5rem" }}
      >
        <span className="flex items-center gap-2 text-sm font-medium">
          <ShoppingBag className="h-4 w-4" />
          {totalItems} {totalItems === 1 ? "ítem" : "ítems"}
        </span>
        <span className="text-sm font-semibold">Ver pedido</span>
        <span className="text-sm font-bold">{formatCLP(totalPrice)}</span>
      </button>
    </motion.div>
  );
}
