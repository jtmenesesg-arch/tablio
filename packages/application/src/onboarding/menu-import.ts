export type MenuImportSource = "text" | "link" | "pdf" | "image";

export type MenuDraftItem = Readonly<{
  id: string;
  category: string;
  name: string;
  description: string;
  priceClp: number;
  imageUrl?: string;
  confirmed: boolean;
}>;

export type MenuImportDraft = Readonly<{
  id: string;
  source: MenuImportSource;
  sourceLabel: string;
  status: "extracted" | "reviewed" | "published";
  items: readonly MenuDraftItem[];
}>;

export interface MenuExtractionProvider {
  extract(input: {
    source: MenuImportSource;
    sourceLabel: string;
    content?: string;
  }): Promise<MenuImportDraft>;
}

export function canPublishMenu(draft: MenuImportDraft): boolean {
  return (
    draft.status === "reviewed" &&
    draft.items.length > 0 &&
    draft.items.every(
      (item) =>
        item.confirmed &&
        item.name.trim().length > 0 &&
        Number.isInteger(item.priceClp) &&
        item.priceClp >= 0,
    )
  );
}
