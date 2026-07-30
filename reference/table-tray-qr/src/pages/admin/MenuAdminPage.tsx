import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAdmin } from "@/contexts/AdminContext";
import { useToast } from "@/hooks/use-toast";
import { formatCLP } from "@/lib/format";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Checkbox } from "@/components/ui/checkbox";
import { Plus, ArrowUp, ArrowDown, Pencil, Trash2, Upload, X, Image as ImageIcon } from "lucide-react";
import { cn } from "@/lib/utils";

interface Category {
  id: string;
  name: string;
  emoji: string | null;
  is_visible: boolean | null;
  sort_order: number | null;
  menu_id: string;
}

interface MenuItem {
  id: string;
  name: string;
  description_short: string | null;
  description_long: string | null;
  price: number;
  image_url: string | null;
  status: string | null;
  labels: string[] | null;
  allergens: string[] | null;
  prep_time_minutes: number | null;
  category_id: string;
  sort_order: number | null;
}

const LABEL_OPTIONS = ["vegano", "sin_gluten", "picante", "nuevo", "recomendado"];
const ALLERGEN_OPTIONS = ["gluten", "lactosa", "frutos_secos", "mariscos", "huevo", "soja", "pescado", "mostaza", "sesamo", "sulfitos"];
const STATUS_COLORS: Record<string, string> = {
  available: "bg-green-100 text-green-800",
  out_of_stock: "bg-red-100 text-red-800",
  hidden: "bg-muted text-muted-foreground",
};

export default function MenuAdminPage() {
  const { tenantId, branchId, slug } = useAdmin();
  const { toast } = useToast();

  const [menuId, setMenuId] = useState<string | null>(null);
  const [categories, setCategories] = useState<Category[]>([]);
  const [selectedCatId, setSelectedCatId] = useState<string | null>(null);
  const [items, setItems] = useState<MenuItem[]>([]);
  const [loadingCats, setLoadingCats] = useState(true);
  const [loadingItems, setLoadingItems] = useState(false);

  // Category modal
  const [catModal, setCatModal] = useState(false);
  const [editCat, setEditCat] = useState<Category | null>(null);
  const [catForm, setCatForm] = useState({ name: "", emoji: "🍽", is_visible: true });

  // Item sheet
  const [itemSheet, setItemSheet] = useState(false);
  const [editItem, setEditItem] = useState<MenuItem | null>(null);
  const [itemForm, setItemForm] = useState({
    name: "", description_short: "", description_long: "", price: 0,
    image_url: "", status: "available", labels: [] as string[],
    allergens: [] as string[], prep_time_minutes: 0,
  });
  const [saving, setSaving] = useState(false);
  const [deleteConfirm, setDeleteConfirm] = useState<{ type: "cat" | "item"; id: string; name: string } | null>(null);
  const [uploading, setUploading] = useState(false);
  const [imagePreview, setImagePreview] = useState<string | null>(null);

  // Load menu & categories
  useEffect(() => {
    async function load() {
      let { data: menu } = await supabase
        .from("menus")
        .select("id")
        .eq("branch_id", branchId)
        .eq("is_active", true)
        .single();

      // Auto-create menu if none exists
      if (!menu) {
        const { data: newMenu, error } = await supabase.from("menus").insert({
          branch_id: branchId, tenant_id: tenantId, name: "Menú Principal", is_active: true,
        }).select("id").single();
        if (error || !newMenu) { setLoadingCats(false); return; }
        menu = newMenu;
      }

      setMenuId(menu.id);

      const { data: cats } = await supabase
        .from("categories")
        .select("id, name, emoji, is_visible, sort_order, menu_id")
        .eq("menu_id", menu.id)
        .order("sort_order");
      setCategories(cats ?? []);
      if (cats?.length && !selectedCatId) setSelectedCatId(cats[0].id);
      setLoadingCats(false);
    }
    load();
  }, [branchId, tenantId]);

  // Load items when category selected
  useEffect(() => {
    if (!selectedCatId) { setItems([]); return; }
    setLoadingItems(true);
    supabase
      .from("menu_items")
      .select("id, name, description_short, description_long, price, image_url, status, labels, allergens, prep_time_minutes, category_id, sort_order")
      .eq("category_id", selectedCatId)
      .order("sort_order")
      .then(({ data }) => {
        setItems(data ?? []);
        setLoadingItems(false);
      });
  }, [selectedCatId]);

  // Category CRUD
  const openCatModal = (cat?: Category) => {
    if (cat) {
      setEditCat(cat);
      setCatForm({ name: cat.name, emoji: cat.emoji ?? "🍽", is_visible: cat.is_visible ?? true });
    } else {
      setEditCat(null);
      setCatForm({ name: "", emoji: "🍽", is_visible: true });
    }
    setCatModal(true);
  };

  const saveCat = async () => {
    setSaving(true);
    if (editCat) {
      const { error } = await supabase.from("categories").update({
        name: catForm.name, emoji: catForm.emoji, is_visible: catForm.is_visible,
      }).eq("id", editCat.id);
      if (error) { toast({ title: "Error", description: error.message, variant: "destructive" }); setSaving(false); return; }
    } else if (menuId) {
      const { error } = await supabase.from("categories").insert({
        name: catForm.name, emoji: catForm.emoji, is_visible: catForm.is_visible,
        menu_id: menuId, tenant_id: tenantId, sort_order: categories.length,
      });
      if (error) { toast({ title: "Error", description: error.message, variant: "destructive" }); setSaving(false); return; }
    }
    setCatModal(false);
    setSaving(false);
    toast({ title: editCat ? "Categoría actualizada" : "Categoría creada" });
    await refreshCats();
  };

  const refreshCats = async () => {
    if (!menuId) return;
    const { data } = await supabase.from("categories").select("id, name, emoji, is_visible, sort_order, menu_id").eq("menu_id", menuId).order("sort_order");
    setCategories(data ?? []);
  };

  const moveCat = async (idx: number, dir: -1 | 1) => {
    const newIdx = idx + dir;
    if (newIdx < 0 || newIdx >= categories.length) return;
    const a = categories[idx], b = categories[newIdx];
    await Promise.all([
      supabase.from("categories").update({ sort_order: newIdx }).eq("id", a.id),
      supabase.from("categories").update({ sort_order: idx }).eq("id", b.id),
    ]);
    refreshCats();
  };

  // Item CRUD
  const openItemSheet = (item?: MenuItem) => {
    if (item) {
      setEditItem(item);
      setItemForm({
        name: item.name, description_short: item.description_short ?? "",
        description_long: item.description_long ?? "", price: item.price,
        image_url: item.image_url ?? "", status: item.status ?? "available",
        labels: item.labels ?? [], allergens: item.allergens ?? [],
        prep_time_minutes: item.prep_time_minutes ?? 0,
      });
      setImagePreview(item.image_url ?? null);
    } else {
      setEditItem(null);
      setItemForm({
        name: "", description_short: "", description_long: "", price: 0,
        image_url: "", status: "available", labels: [], allergens: [], prep_time_minutes: 0,
      });
      setImagePreview(null);
    }
    setItemSheet(true);
  };

  // Image upload handler
  const handleImageUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    // Validate file type
    if (!['image/jpeg', 'image/png', 'image/webp', 'image/gif'].includes(file.type)) {
      toast({ title: "Formato no válido", description: "Solo JPG, PNG, WEBP o GIF", variant: "destructive" });
      return;
    }

    // Validate file size (5MB)
    if (file.size > 5 * 1024 * 1024) {
      toast({ title: "Archivo muy grande", description: "Máximo 5MB", variant: "destructive" });
      return;
    }

    setUploading(true);

    // Generate unique filename
    const ext = file.name.split('.').pop();
    const filename = `${tenantId}/${Date.now()}-${Math.random().toString(36).substring(7)}.${ext}`;

    const { data, error } = await supabase.storage
      .from('menu-images')
      .upload(filename, file, { cacheControl: '3600', upsert: false });

    if (error) {
      toast({ title: "Error al subir imagen", description: error.message, variant: "destructive" });
      setUploading(false);
      return;
    }

    // Get public URL
    const { data: { publicUrl } } = supabase.storage
      .from('menu-images')
      .getPublicUrl(data.path);

    setItemForm((p) => ({ ...p, image_url: publicUrl }));
    setImagePreview(publicUrl);
    setUploading(false);
    toast({ title: "Imagen subida correctamente" });
  };

  const removeImage = () => {
    setItemForm((p) => ({ ...p, image_url: "" }));
    setImagePreview(null);
  };

  const saveItem = async () => {
    if (!selectedCatId) return;
    setSaving(true);
    const payload = {
      name: itemForm.name,
      description_short: itemForm.description_short || null,
      description_long: itemForm.description_long || null,
      price: itemForm.price,
      image_url: itemForm.image_url || null,
      status: itemForm.status,
      labels: itemForm.labels,
      allergens: itemForm.allergens,
      prep_time_minutes: itemForm.prep_time_minutes || null,
      category_id: selectedCatId,
      tenant_id: tenantId,
    };
    if (editItem) {
      const { error } = await supabase.from("menu_items").update(payload).eq("id", editItem.id);
      if (error) { toast({ title: "Error", description: error.message, variant: "destructive" }); setSaving(false); return; }
    } else {
      const { error } = await supabase.from("menu_items").insert({ ...payload, sort_order: items.length });
      if (error) { toast({ title: "Error", description: error.message, variant: "destructive" }); setSaving(false); return; }
    }
    setItemSheet(false);
    setSaving(false);
    toast({ title: editItem ? "Plato actualizado" : "Plato creado" });
    refreshItems();
  };

  const refreshItems = async () => {
    if (!selectedCatId) return;
    const { data } = await supabase
      .from("menu_items")
      .select("id, name, description_short, description_long, price, image_url, status, labels, allergens, prep_time_minutes, category_id, sort_order")
      .eq("category_id", selectedCatId)
      .order("sort_order");
    setItems(data ?? []);
  };

  const toggleItemStatus = async (item: MenuItem) => {
    const next = item.status === "available" ? "out_of_stock" : "available";
    await supabase.from("menu_items").update({ status: next }).eq("id", item.id);
    refreshItems();
  };

  const handleToggleStock = async (item: MenuItem) => {
    const newStatus = item.status === 'out_of_stock' ? 'available' : 'out_of_stock';
    await supabase.from('menu_items').update({ status: newStatus }).eq('id', item.id);
    setItems(prev => prev.map(i => i.id === item.id ? { ...i, status: newStatus } : i));
    toast({ title: newStatus === 'out_of_stock' ? `"${item.name}" marcado como agotado` : `"${item.name}" disponible nuevamente` });
  };

  const moveItem = async (idx: number, dir: -1 | 1) => {
    const newIdx = idx + dir;
    if (newIdx < 0 || newIdx >= items.length) return;
    const a = items[idx], b = items[newIdx];
    await Promise.all([
      supabase.from("menu_items").update({ sort_order: newIdx }).eq("id", a.id),
      supabase.from("menu_items").update({ sort_order: idx }).eq("id", b.id),
    ]);
    refreshItems();
  };

  const handleDelete = async () => {
    if (!deleteConfirm) return;
    setSaving(true);
    if (deleteConfirm.type === "cat") {
      await supabase.from("categories").delete().eq("id", deleteConfirm.id);
      refreshCats();
      if (selectedCatId === deleteConfirm.id) setSelectedCatId(null);
    } else {
      await supabase.from("menu_items").delete().eq("id", deleteConfirm.id);
      refreshItems();
    }
    setDeleteConfirm(null);
    setSaving(false);
    toast({ title: "Eliminado" });
  };

  const toggleArrayField = (field: "labels" | "allergens", val: string) => {
    setItemForm((prev) => ({
      ...prev,
      [field]: prev[field].includes(val) ? prev[field].filter((v) => v !== val) : [...prev[field], val],
    }));
  };

  if (loadingCats) return <div className="flex justify-center py-12"><div className="animate-spin h-8 w-8 border-4 border-primary border-t-transparent rounded-full" /></div>;

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <h2 className="text-2xl font-bold text-foreground">Menú</h2>
        <a
          href={`/${slug}`}
          target="_blank"
          rel="noopener noreferrer"
          className="text-xs text-muted-foreground underline hover:text-foreground transition-colors"
        >
          Ver menú del cliente →
        </a>
      </div>

      <div className="flex flex-col md:flex-row gap-6">
        {/* Categories column */}
        <div className="md:w-64 shrink-0">
          <div className="flex items-center justify-between mb-3">
            <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider">Categorías</h3>
            <Button size="sm" variant="outline" onClick={() => openCatModal()}><Plus className="h-4 w-4 mr-1" />Nueva</Button>
          </div>
          <div className="space-y-1">
            {categories.map((cat, i) => (
              <div key={cat.id} className={cn(
                "flex items-center gap-2 rounded-lg px-3 py-2 cursor-pointer transition-colors group",
                selectedCatId === cat.id ? "bg-primary/10 text-primary" : "hover:bg-accent"
              )} onClick={() => setSelectedCatId(cat.id)}>
                <span className="text-lg">{cat.emoji}</span>
                <span className="flex-1 text-sm font-medium truncate">{cat.name}</span>
                <div className="opacity-0 group-hover:opacity-100 flex gap-0.5">
                  <button onClick={(e) => { e.stopPropagation(); moveCat(i, -1); }} className="p-0.5"><ArrowUp className="h-3 w-3" /></button>
                  <button onClick={(e) => { e.stopPropagation(); moveCat(i, 1); }} className="p-0.5"><ArrowDown className="h-3 w-3" /></button>
                  <button onClick={(e) => { e.stopPropagation(); openCatModal(cat); }} className="p-0.5"><Pencil className="h-3 w-3" /></button>
                  <button onClick={(e) => { e.stopPropagation(); setDeleteConfirm({ type: "cat", id: cat.id, name: cat.name }); }} className="p-0.5 text-destructive"><Trash2 className="h-3 w-3" /></button>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Items column */}
        <div className="flex-1">
          {selectedCatId && (
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-lg font-semibold text-foreground">Platos</h3>
              <Button size="sm" onClick={() => openItemSheet()}><Plus className="h-4 w-4 mr-1" />Nuevo plato</Button>
            </div>
          )}
          {loadingItems ? (
            <div className="flex justify-center py-8"><div className="animate-spin h-6 w-6 border-4 border-primary border-t-transparent rounded-full" /></div>
          ) : !selectedCatId ? (
            <p className="text-muted-foreground text-sm py-8 text-center">Selecciona una categoría</p>
          ) : items.length === 0 ? (
            <p className="text-muted-foreground text-sm py-8 text-center">Sin platos en esta categoría</p>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
              {items.map((item, i) => (
                <div key={item.id} className="border border-border rounded-xl overflow-hidden bg-card hover:shadow-md transition-shadow group">
                  {item.image_url && (
                    <div className="h-32 bg-muted">
                      <img src={item.image_url} alt={item.name} className="w-full h-full object-cover" />
                    </div>
                  )}
                  <div className="p-3">
                    <div className="flex items-start justify-between">
                      <h4 className="font-semibold text-foreground text-sm">{item.name}</h4>
                      <Badge className={cn("text-xs shrink-0 ml-2 cursor-pointer", STATUS_COLORS[item.status ?? "available"])} onClick={(e) => { e.stopPropagation(); toggleItemStatus(item); }}>
                        {item.status === "available" ? "Disponible" : item.status === "out_of_stock" ? "Agotado" : "Oculto"}
                      </Badge>
                    </div>
                    <p className="text-primary font-bold text-sm mt-1">{formatCLP(item.price)}</p>
                    <div className="flex gap-1 mt-2 opacity-0 group-hover:opacity-100 transition-opacity">
                      <Button size="sm" variant="ghost" onClick={() => moveItem(i, -1)}><ArrowUp className="h-3 w-3" /></Button>
                      <Button size="sm" variant="ghost" onClick={() => moveItem(i, 1)}><ArrowDown className="h-3 w-3" /></Button>
                      <Button size="sm" variant="ghost" onClick={() => openItemSheet(item)}><Pencil className="h-3 w-3" /></Button>
                      <button
                        onClick={() => handleToggleStock(item)}
                        className={`rounded-lg px-2 py-1 text-xs font-semibold transition-colors ${
                          item.status === 'out_of_stock'
                            ? 'bg-destructive/10 text-destructive hover:bg-destructive/20'
                            : 'bg-muted text-muted-foreground hover:bg-muted/80'
                        }`}
                        title={item.status === 'out_of_stock' ? 'Marcar disponible' : 'Marcar agotado'}
                      >
                        {item.status === 'out_of_stock' ? '✓ Agotado' : '86'}
                      </button>
                      <Button size="sm" variant="ghost" className="text-destructive" onClick={() => setDeleteConfirm({ type: "item", id: item.id, name: item.name })}><Trash2 className="h-3 w-3" /></Button>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Category modal */}
      <Dialog open={catModal} onOpenChange={setCatModal}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{editCat ? "Editar categoría" : "Nueva categoría"}</DialogTitle>
            <DialogDescription>Completa los datos de la categoría</DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div><Label>Nombre</Label><Input value={catForm.name} onChange={(e) => setCatForm((p) => ({ ...p, name: e.target.value }))} /></div>
            <div><Label>Emoji</Label><Input value={catForm.emoji} onChange={(e) => setCatForm((p) => ({ ...p, emoji: e.target.value }))} maxLength={2} className="w-20" /></div>
            <div className="flex items-center gap-2"><Switch checked={catForm.is_visible} onCheckedChange={(v) => setCatForm((p) => ({ ...p, is_visible: v }))} /><Label>Visible</Label></div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setCatModal(false)}>Cancelar</Button>
            <Button onClick={saveCat} disabled={!catForm.name || saving}>{saving ? "Guardando..." : "Guardar"}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Item sheet */}
      <Sheet open={itemSheet} onOpenChange={setItemSheet}>
        <SheetContent className="overflow-y-auto w-full sm:max-w-lg">
          <SheetHeader><SheetTitle>{editItem ? "Editar plato" : "Nuevo plato"}</SheetTitle></SheetHeader>
          <div className="space-y-4 mt-4">
            <div><Label>Nombre *</Label><Input value={itemForm.name} onChange={(e) => setItemForm((p) => ({ ...p, name: e.target.value }))} /></div>
            <div><Label>Descripción corta</Label><Input value={itemForm.description_short} onChange={(e) => setItemForm((p) => ({ ...p, description_short: e.target.value }))} maxLength={120} /></div>
            <div><Label>Descripción larga</Label><Textarea value={itemForm.description_long} onChange={(e) => setItemForm((p) => ({ ...p, description_long: e.target.value }))} maxLength={500} /></div>
            <div><Label>Precio (CLP)</Label><Input type="number" value={itemForm.price} onChange={(e) => setItemForm((p) => ({ ...p, price: parseInt(e.target.value) || 0 }))} /></div>
            {/* Image upload section */}
            <div>
              <Label className="mb-2 block">Imagen</Label>
              {imagePreview ? (
                <div className="relative w-full h-40 rounded-lg overflow-hidden bg-muted">
                  <img src={imagePreview} alt="Preview" className="w-full h-full object-cover" />
                  <button
                    type="button"
                    onClick={removeImage}
                    className="absolute top-2 right-2 bg-destructive text-destructive-foreground rounded-full p-1 hover:bg-destructive/90"
                  >
                    <X className="h-4 w-4" />
                  </button>
                </div>
              ) : (
                <label className="flex flex-col items-center justify-center w-full h-32 border-2 border-dashed border-border rounded-lg cursor-pointer hover:bg-accent/50 transition-colors">
                  <input
                    type="file"
                    accept="image/jpeg,image/png,image/webp,image/gif"
                    onChange={handleImageUpload}
                    className="hidden"
                    disabled={uploading}
                  />
                  {uploading ? (
                    <div className="flex items-center gap-2 text-muted-foreground">
                      <div className="animate-spin h-5 w-5 border-2 border-primary border-t-transparent rounded-full" />
                      <span className="text-sm">Subiendo...</span>
                    </div>
                  ) : (
                    <>
                      <Upload className="h-8 w-8 text-muted-foreground mb-2" />
                      <span className="text-sm text-muted-foreground">Click para subir imagen</span>
                      <span className="text-xs text-muted-foreground">JPG, PNG, WEBP, GIF (máx. 5MB)</span>
                    </>
                  )}
                </label>
              )}
              {/* URL fallback */}
              <div className="mt-2">
                <Input
                  placeholder="O pegar URL de imagen..."
                  value={itemForm.image_url}
                  onChange={(e) => {
                    setItemForm((p) => ({ ...p, image_url: e.target.value }));
                    setImagePreview(e.target.value || null);
                  }}
                  className="text-xs"
                />
              </div>
            </div>
            <div>
              <Label>Estado</Label>
              <Select value={itemForm.status} onValueChange={(v) => setItemForm((p) => ({ ...p, status: v }))}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="available">Disponible</SelectItem>
                  <SelectItem value="out_of_stock">Agotado</SelectItem>
                  <SelectItem value="hidden">Oculto</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div><Label>Tiempo prep. (min)</Label><Input type="number" value={itemForm.prep_time_minutes} onChange={(e) => setItemForm((p) => ({ ...p, prep_time_minutes: parseInt(e.target.value) || 0 }))} /></div>
            <div>
              <Label className="mb-2 block">Etiquetas</Label>
              <div className="flex flex-wrap gap-2">
                {LABEL_OPTIONS.map((l) => (
                  <label key={l} className="flex items-center gap-1.5 text-sm">
                    <Checkbox checked={itemForm.labels.includes(l)} onCheckedChange={() => toggleArrayField("labels", l)} />{l}
                  </label>
                ))}
              </div>
            </div>
            <div>
              <Label className="mb-2 block">Alérgenos</Label>
              <div className="flex flex-wrap gap-2">
                {ALLERGEN_OPTIONS.map((a) => (
                  <label key={a} className="flex items-center gap-1.5 text-sm">
                    <Checkbox checked={itemForm.allergens.includes(a)} onCheckedChange={() => toggleArrayField("allergens", a)} />{a}
                  </label>
                ))}
              </div>
            </div>
          </div>
          <div className="flex gap-2 mt-6">
            <Button className="flex-1" onClick={saveItem} disabled={!itemForm.name || saving}>{saving ? "Guardando..." : "Guardar"}</Button>
          </div>
        </SheetContent>
      </Sheet>

      {/* Delete confirmation */}
      <Dialog open={!!deleteConfirm} onOpenChange={() => setDeleteConfirm(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Eliminar {deleteConfirm?.type === "cat" ? "categoría" : "plato"}</DialogTitle>
            <DialogDescription>¿Seguro que deseas eliminar "{deleteConfirm?.name}"? Esta acción no se puede deshacer.</DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDeleteConfirm(null)}>Cancelar</Button>
            <Button variant="destructive" onClick={handleDelete} disabled={saving}>{saving ? "Eliminando..." : "Eliminar"}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
