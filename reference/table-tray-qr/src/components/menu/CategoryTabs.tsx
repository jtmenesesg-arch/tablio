import { useRef, useCallback } from "react";
import { motion } from "framer-motion";

interface CategoryTabsProps {
  categories: { id: string; name: string; emoji: string | null }[];
  activeId: string;
  onSelect: (id: string) => void;
  primaryColor: string;
}

export default function CategoryTabs({ categories, activeId, onSelect, primaryColor }: CategoryTabsProps) {
  const scrollRef = useRef<HTMLDivElement>(null);

  const handleClick = useCallback(
    (id: string) => {
      onSelect(id);
      // scroll the tab itself into view
      const el = document.getElementById(`tab-${id}`);
      el?.scrollIntoView({ behavior: "smooth", inline: "center", block: "nearest" });
    },
    [onSelect],
  );

  return (
    <div
      ref={scrollRef}
      className="flex gap-1 overflow-x-auto px-4 py-2 scrollbar-hide border-b border-border bg-background"
      style={{ WebkitOverflowScrolling: "touch" }}
    >
      {categories.map((cat) => {
        const isActive = cat.id === activeId;
        return (
          <button
            id={`tab-${cat.id}`}
            key={cat.id}
            onClick={() => handleClick(cat.id)}
            className="relative flex shrink-0 items-center gap-1.5 rounded-full px-3.5 py-2 text-sm font-medium transition-colors whitespace-nowrap"
            style={{ color: isActive ? primaryColor : undefined }}
          >
            <span>{cat.emoji || "🍽"}</span>
            <span>{cat.name}</span>
            {isActive && (
              <motion.div
                layoutId="category-underline"
                className="absolute bottom-0 left-2 right-2 h-0.5 rounded-full"
                style={{ backgroundColor: primaryColor }}
                transition={{ type: "spring", stiffness: 500, damping: 35 }}
              />
            )}
          </button>
        );
      })}
    </div>
  );
}
