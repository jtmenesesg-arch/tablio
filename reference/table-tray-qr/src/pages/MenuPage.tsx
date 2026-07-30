import { useEffect, useRef, useState, useMemo, useCallback } from "react";
import { useParams, useNavigate, useLocation } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { AnimatePresence } from "framer-motion";
import { Search, X } from "lucide-react";
import { useCartStore } from "@/store/cartStore";
import CategoryTabs from "@/components/menu/CategoryTabs";
import MenuItemCard from "@/components/menu/MenuItemCard";
import FloatingCartBar from "@/components/menu/FloatingCartBar";
import MenuSkeleton from "@/components/menu/MenuSkeleton";

/* ---------- types ---------- */
interface MenuItem {
  id: string;
  name: string;
  description_short: string | null;
  price: number;
  image_url: string | null;
  status: string | null;
  labels: string[] | null;
  prep_time_minutes: number | null;
  total_orders: number | null;
  sort_order: number | null;
}

interface Category {
  id: string;
  name: string;
  emoji: string | null;
  sort_order: number | null;
  items: MenuItem[];
}

interface TenantMini {
  name: string;
  logo_url: string | null;
  primary_color: string;
}

/* ---------- fetchers ---------- */
async function fetchTenantMini(slug: string): Promise<TenantMini | null> {
  const { data } = await supabase
    .from("tenants")
    .select("name, logo_url, primary_color")
    .eq("slug", slug)
    .eq("is_active", true)
    .maybeSingle();
  if (!data) return null;
  return { name: data.name, logo_url: data.logo_url, primary_color: data.primary_color || "#E8531D" };
}

async function fetchMenuData(branchId: string): Promise<Category[]> {
  const { data: menu } = await supabase
    .from("menus")
    .select("id")
    .eq("branch_id", branchId)
    .eq("is_active", true)
    .limit(1)
    .maybeSingle();
  if (!menu) return [];

  const { data: cats } = await supabase
    .from("categories")
    .select("id, name, emoji, sort_order")
    .eq("menu_id", menu.id)
    .eq("is_visible", true)
    .order("sort_order");
  if (!cats || cats.length === 0) return [];

  const catIds = cats.map((c) => c.id);
  const { data: items } = await supabase
    .from("menu_items")
    .select("id, name, description_short, price, image_url, status, labels, prep_time_minutes, total_orders, sort_order, category_id")
    .in("category_id", catIds)
    .neq("status", "hidden")
    .order("sort_order");

  const itemsByCategory = new Map<string, MenuItem[]>();
  (items || []).forEach((mi: any) => {
    const list = itemsByCategory.get(mi.category_id) || [];
    list.push(mi);
    itemsByCategory.set(mi.category_id, list);
  });

  return cats
    .map((c) => ({
      id: c.id,
      name: c.name,
      emoji: c.emoji,
      sort_order: c.sort_order,
      items: itemsByCategory.get(c.id) || [],
    }))
    .filter((c) => c.items.length > 0);
}

/* ---------- component ---------- */
export default function MenuPage() {
  const { slug } = useParams<{ slug: string }>();
  const navigate = useNavigate();
  const location = useLocation();

  const locState = location.state as { tenantId?: string; branchId?: string } | null;
  const tenantIdFromState = locState?.tenantId;
  const branchIdFromState = locState?.branchId;

  // Cart store
  const setTableContext = useCartStore((s) => s.setTableContext);
  const setTableNumber = useCartStore((s) => s.setTableNumber);
  const totalItems = useCartStore((s) => s.getTotalItems());
  const totalPrice = useCartStore((s) => s.getTotalPrice());

  // Read ?mesa= query param and store table number
  useEffect(() => {
    const params = new URLSearchParams(location.search);
    const mesa = params.get("mesa");
    if (mesa) {
      const num = parseInt(mesa, 10);
      if (!isNaN(num)) setTableNumber(num);
    }
  }, [location.search, setTableNumber]);

  // Resolve branchId if not in state
  const { data: resolvedIds } = useQuery({
    queryKey: ["resolve-ids", slug],
    queryFn: async () => {
      const { data } = await supabase
        .from("tenants")
        .select("id, restaurants!inner(branches!inner(id))")
        .eq("slug", slug!)
        .eq("is_active", true)
        .maybeSingle();
      if (!data) return null;
      const branch = (data.restaurants as any[])?.[0]?.branches?.[0];
      return { tenantId: data.id, branchId: branch?.id as string };
    },
    enabled: !!slug && (!tenantIdFromState || !branchIdFromState),
    staleTime: Infinity,
  });

  const tenantId = tenantIdFromState || resolvedIds?.tenantId;
  const branchId = branchIdFromState || resolvedIds?.branchId;

  // Set cart context once
  useEffect(() => {
    if (tenantId && branchId) {
      setTableContext(tenantId, branchId);
    }
  }, [tenantId, branchId, setTableContext]);

  // Tenant info
  const { data: tenant } = useQuery({
    queryKey: ["tenant-mini", slug],
    queryFn: () => fetchTenantMini(slug!),
    enabled: !!slug,
    staleTime: 5 * 60 * 1000,
  });

  // Menu data
  const { data: categories, isLoading } = useQuery({
    queryKey: ["menu-data", branchId],
    queryFn: () => fetchMenuData(branchId!),
    enabled: !!branchId,
    staleTime: 2 * 60 * 1000,
  });

  // Compute top 3 hot items
  const hotItemIds = useMemo(() => {
    if (!categories) return new Set<string>();
    const all = categories.flatMap((c) => c.items);
    const sorted = [...all].sort((a, b) => (b.total_orders || 0) - (a.total_orders || 0));
    return new Set(sorted.slice(0, 3).filter((i) => (i.total_orders || 0) > 0).map((i) => i.id));
  }, [categories]);

  // Active category tracking
  const [activeCatId, setActiveCatId] = useState<string>("");
  const sectionRefs = useRef<Map<string, HTMLElement>>(new Map());
  const isManualScroll = useRef(false);

  useEffect(() => {
    if (!categories || categories.length === 0) return;
    if (!activeCatId) setActiveCatId(categories[0].id);
  }, [categories, activeCatId]);

  // IntersectionObserver for active tab
  useEffect(() => {
    if (!categories || categories.length === 0) return;
    const observer = new IntersectionObserver(
      (entries) => {
        if (isManualScroll.current) return;
        for (const entry of entries) {
          if (entry.isIntersecting) {
            setActiveCatId(entry.target.getAttribute("data-cat-id") || "");
            break;
          }
        }
      },
      { rootMargin: "-120px 0px -60% 0px", threshold: 0 },
    );
    sectionRefs.current.forEach((el) => observer.observe(el));
    return () => observer.disconnect();
  }, [categories]);

  const handleTabSelect = useCallback((id: string) => {
    setActiveCatId(id);
    isManualScroll.current = true;
    const el = sectionRefs.current.get(id);
    if (el) {
      const top = el.getBoundingClientRect().top + window.scrollY - 120;
      window.scrollTo({ top, behavior: "smooth" });
    }
    setTimeout(() => {
      isManualScroll.current = false;
    }, 800);
  }, []);

  // Search
  const [searchOpen, setSearchOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const searchInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (searchOpen) searchInputRef.current?.focus();
  }, [searchOpen]);

  const filteredItems = useMemo(() => {
    if (!searchQuery.trim() || !categories) return null;
    const q = searchQuery.toLowerCase();
    return categories
      .flatMap((c) => c.items)
      .filter((i) => i.name.toLowerCase().includes(q) || i.description_short?.toLowerCase().includes(q));
  }, [searchQuery, categories]);

  const primaryColor = tenant?.primary_color || "#E8531D";

  if (isLoading || !tenant) return <MenuSkeleton />;

  return (
    <div className="min-h-screen bg-background pb-24">
      {/* Header */}
      <header className="sticky top-0 z-40 flex h-14 items-center justify-between border-b border-border bg-background px-4">
        {searchOpen ? (
          <div className="flex flex-1 items-center gap-2">
            <Search className="h-4 w-4 shrink-0 text-muted-foreground" />
            <input
              ref={searchInputRef}
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Buscar plato..."
              className="flex-1 bg-transparent text-sm outline-none placeholder:text-muted-foreground text-foreground"
            />
            <button
              onClick={() => { setSearchOpen(false); setSearchQuery(""); }}
              className="flex h-8 w-8 items-center justify-center rounded-full text-muted-foreground"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
        ) : (
          <>
            {tenant.logo_url ? (
              <img src={tenant.logo_url} alt="" className="h-8 w-8 rounded-full object-cover" />
            ) : (
              <div
                className="flex h-8 w-8 items-center justify-center rounded-full text-xs font-bold text-white"
                style={{ backgroundColor: primaryColor }}
              >
                {tenant.name.charAt(0)}
              </div>
            )}
            <span className="text-sm font-bold text-foreground truncate max-w-[160px]">{tenant.name}</span>
            <div className="flex items-center gap-1">
              <button onClick={() => setSearchOpen(true)} className="relative flex h-9 w-9 items-center justify-center rounded-full text-foreground">
                <Search className="h-5 w-5" />
                {totalItems > 0 && (
                  <span className="absolute -top-0.5 -right-0.5 flex h-4 w-4 items-center justify-center rounded-full bg-destructive text-[10px] font-bold text-destructive-foreground">
                    {totalItems}
                  </span>
                )}
              </button>
            </div>
          </>
        )}
      </header>

      {/* Category tabs */}
      {!searchOpen && categories && categories.length > 0 && (
        <div className="sticky top-14 z-30">
          <CategoryTabs
            categories={categories}
            activeId={activeCatId}
            onSelect={handleTabSelect}
            primaryColor={primaryColor}
          />
        </div>
      )}

      {/* Content */}
      <main className="px-4 pt-4">
        {filteredItems !== null ? (
          filteredItems.length > 0 ? (
            <div className="grid grid-cols-2 gap-3">
              {filteredItems.map((item) => (
                <MenuItemCard
                  key={item.id}
                  item={item}
                  isHot={hotItemIds.has(item.id)}
                  primaryColor={primaryColor}
                  onTap={() => navigate(`/${slug}/item/${item.id}`)}
                />
              ))}
            </div>
          ) : (
            <p className="py-20 text-center text-sm text-muted-foreground">No se encontraron platos</p>
          )
        ) : (
          categories?.map((cat) => (
            <section
              key={cat.id}
              ref={(el) => { if (el) sectionRefs.current.set(cat.id, el); }}
              data-cat-id={cat.id}
              className="mb-6"
            >
              <h2 className="mb-3 text-lg font-bold text-foreground">
                {cat.emoji} {cat.name}
              </h2>
              <div className="grid grid-cols-2 gap-3">
                {cat.items.map((item) => (
                  <MenuItemCard
                    key={item.id}
                    item={item}
                    isHot={hotItemIds.has(item.id)}
                    primaryColor={primaryColor}
                    onTap={() => navigate(`/${slug}/item/${item.id}`)}
                  />
                ))}
              </div>
            </section>
          ))
        )}
      </main>

      {/* Floating cart bar */}
      <AnimatePresence>
        <FloatingCartBar
          totalItems={totalItems}
          totalPrice={totalPrice}
          primaryColor={primaryColor}
          onTap={() => navigate(`/${slug}/cart`)}
        />
      </AnimatePresence>
    </div>
  );
}
