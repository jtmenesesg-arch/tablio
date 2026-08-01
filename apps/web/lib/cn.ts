import { clsx, type ClassValue } from "clsx";
import { extendTailwindMerge } from "tailwind-merge";

// `clsx` alone only concatenates class names — it never resolves conflicts
// between them. When a base component class and a caller's override class
// land in the same CSS property (e.g. `border-transparent` from a `cva`
// base plus `border-border` from a variant, or `text-card-foreground` from
// `Card` plus `text-background` from a consumer), the winner is whichever
// rule Tailwind happened to generate later in the stylesheet — not whichever
// came later in the JSX. That produced three real, hard-to-spot bugs this
// sprint (invisible button borders, invisible KDS tab text, invisible
// verification code text). `twMerge` resolves same-group conflicts by
// keeping only the last class in a group, so composition always behaves the
// way it visually reads. See docs/DESIGN_SYSTEM.md for the full writeup.
//
// Our semantic tokens live outside Tailwind's default theme (defined via
// `@theme inline` in globals.css), so tailwind-merge can't infer which
// custom class names share a CSS property unless told. Each list below
// mirrors the matching `--color-*` / `--text-*` / `--radius-*` /
// `--spacing-*` keys in globals.css — keep them in sync when the theme
// changes.
const twMerge = extendTailwindMerge({
  extend: {
    theme: {
      color: [
        "background",
        "foreground",
        "card",
        "card-foreground",
        "popover",
        "popover-foreground",
        "primary",
        "primary-hover",
        "primary-foreground",
        "secondary",
        "secondary-foreground",
        "muted",
        "muted-foreground",
        "placeholder",
        "accent",
        "accent-foreground",
        "brand",
        "brand-soft",
        "destructive",
        "destructive-soft",
        "destructive-foreground",
        "success",
        "success-soft",
        "success-foreground",
        "warning",
        "warning-soft",
        "border",
        "input",
        "ring",
        "sidebar",
        "sidebar-foreground",
        "sidebar-primary",
        "sidebar-primary-foreground",
        "sidebar-accent",
        "sidebar-accent-foreground",
        "sidebar-border",
        "sidebar-ring",
      ],
      text: ["display", "h1", "h1-lg", "h2", "h3", "body", "small", "label"],
      radius: [
        "button",
        "button-sm",
        "input",
        "surface-sm",
        "surface-md",
        "surface-lg",
        "surface-xl",
        "surface-2xl",
      ],
      spacing: [
        "touch",
        "sidebar",
        "icon",
        "loading-card",
        "chart",
        "skeleton-label",
        "table-card",
      ],
    },
  },
});

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}
