import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAdmin } from "@/contexts/AdminContext";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import { Plus, Pencil, Trash2 } from "lucide-react";
import ImageUploadField from "@/components/admin/ImageUploadField";

interface TableData {
  id: string;
  number: number;
  name: string | null;
  capacity: number | null;
}

export default function SucursalPage() {
  const { tenantId, branchId } = useAdmin();
  const { toast } = useToast();

  const [tenantForm, setTenantForm] = useState({ name: "", primary_color: "#E8531D", logo_url: "", cover_image_url: "", welcome_message: "" });
  const [branchForm, setBranchForm] = useState({ name: "", is_open: true });
  const [tables, setTables] = useState<TableData[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  // Table modal
  const [tableModal, setTableModal] = useState(false);
  const [editTable, setEditTable] = useState<TableData | null>(null);
  const [tableForm, setTableForm] = useState({ number: 0, name: "", capacity: 4 });

  useEffect(() => {
    async function load() {
      const [{ data: tenant }, { data: branch }, { data: tabs }] = await Promise.all([
        supabase.from("tenants").select("name, primary_color, logo_url, cover_image_url, welcome_message").eq("id", tenantId).single(),
        supabase.from("branches").select("name, is_open").eq("id", branchId).single(),
        supabase.from("tables").select("id, number, name, capacity").eq("branch_id", branchId).order("number"),
      ]);
      if (tenant) setTenantForm({
        name: tenant.name ?? "", primary_color: tenant.primary_color ?? "#E8531D",
        logo_url: tenant.logo_url ?? "", cover_image_url: tenant.cover_image_url ?? "",
        welcome_message: tenant.welcome_message ?? "",
      });
      if (branch) setBranchForm({ name: branch.name ?? "", is_open: branch.is_open ?? true });
      setTables(tabs ?? []);
      setLoading(false);
    }
    load();
  }, [tenantId, branchId]);

  const saveSettings = async () => {
    setSaving(true);
    await Promise.all([
      supabase.from("tenants").update({
        name: tenantForm.name, primary_color: tenantForm.primary_color,
        logo_url: tenantForm.logo_url || null, cover_image_url: tenantForm.cover_image_url || null,
        welcome_message: tenantForm.welcome_message || null,
      }).eq("id", tenantId),
      supabase.from("branches").update({
        name: branchForm.name, is_open: branchForm.is_open,
      }).eq("id", branchId),
    ]);
    setSaving(false);
    toast({ title: "Cambios guardados" });
  };

  const openTableModal = (t?: TableData) => {
    if (t) {
      setEditTable(t);
      setTableForm({ number: t.number, name: t.name ?? "", capacity: t.capacity ?? 4 });
    } else {
      setEditTable(null);
      setTableForm({ number: (tables.length ? Math.max(...tables.map((x) => x.number)) + 1 : 1), name: "", capacity: 4 });
    }
    setTableModal(true);
  };

  const saveTable = async () => {
    setSaving(true);
    if (editTable) {
      await supabase.from("tables").update({
        number: tableForm.number, name: tableForm.name || null, capacity: tableForm.capacity,
      }).eq("id", editTable.id);
    } else {
      await supabase.from("tables").insert({
        number: tableForm.number, name: tableForm.name || null, capacity: tableForm.capacity,
        branch_id: branchId, tenant_id: tenantId, qr_token: crypto.randomUUID(),
      });
    }
    setTableModal(false);
    setSaving(false);
    toast({ title: editTable ? "Mesa actualizada" : "Mesa creada" });
    refreshTables();
  };

  const deleteTable = async (id: string) => {
    await supabase.from("tables").delete().eq("id", id);
    toast({ title: "Mesa eliminada" });
    refreshTables();
  };

  const refreshTables = async () => {
    const { data } = await supabase.from("tables").select("id, number, name, capacity").eq("branch_id", branchId).order("number");
    setTables(data ?? []);
  };

  if (loading) return <div className="flex justify-center py-12"><div className="animate-spin h-8 w-8 border-4 border-primary border-t-transparent rounded-full" /></div>;

  return (
    <div className="max-w-2xl">
      <h2 className="text-2xl font-bold text-foreground mb-6">Sucursal</h2>

      <Card className="mb-6">
        <CardHeader><CardTitle>Datos del negocio</CardTitle></CardHeader>
        <CardContent className="space-y-4">
          <div><Label>Nombre</Label><Input value={tenantForm.name} onChange={(e) => setTenantForm((p) => ({ ...p, name: e.target.value }))} /></div>
          <div>
            <Label>Color principal</Label>
            <div className="flex gap-2 items-center">
              <input type="color" value={tenantForm.primary_color} onChange={(e) => setTenantForm((p) => ({ ...p, primary_color: e.target.value }))} className="h-10 w-14 rounded border border-input cursor-pointer" />
              <Input value={tenantForm.primary_color} onChange={(e) => setTenantForm((p) => ({ ...p, primary_color: e.target.value }))} className="w-32" />
            </div>
          </div>
          <ImageUploadField label="Logo" value={tenantForm.logo_url} tenantId={tenantId} folder="logo" onChange={(url) => setTenantForm((p) => ({ ...p, logo_url: url }))} />
          <ImageUploadField label="Imagen de portada" value={tenantForm.cover_image_url} tenantId={tenantId} folder="cover" onChange={(url) => setTenantForm((p) => ({ ...p, cover_image_url: url }))} />
          <div><Label>Mensaje de bienvenida</Label><Textarea value={tenantForm.welcome_message} onChange={(e) => setTenantForm((p) => ({ ...p, welcome_message: e.target.value }))} /></div>
        </CardContent>
      </Card>

      <Card className="mb-6">
        <CardHeader><CardTitle>Sucursal</CardTitle></CardHeader>
        <CardContent className="space-y-4">
          <div><Label>Nombre</Label><Input value={branchForm.name} onChange={(e) => setBranchForm((p) => ({ ...p, name: e.target.value }))} /></div>
          <div className="flex items-center gap-3">
            <Switch checked={branchForm.is_open} onCheckedChange={(v) => setBranchForm((p) => ({ ...p, is_open: v }))} />
            <Label className="text-base font-semibold">{branchForm.is_open ? "Abierto" : "Cerrado"}</Label>
          </div>
        </CardContent>
      </Card>

      <Button onClick={saveSettings} disabled={saving} className="mb-8 w-full md:w-auto">
        {saving ? "Guardando..." : "Guardar cambios"}
      </Button>

      <Separator className="mb-6" />

      <div className="flex items-center justify-between mb-4">
        <h3 className="text-lg font-semibold text-foreground">Mesas</h3>
        <Button size="sm" variant="outline" onClick={() => openTableModal()}><Plus className="h-4 w-4 mr-1" />Agregar mesa</Button>
      </div>

      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>N°</TableHead>
            <TableHead>Nombre</TableHead>
            <TableHead>Capacidad</TableHead>
            <TableHead></TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {tables.map((t) => (
            <TableRow key={t.id}>
              <TableCell className="font-bold">{t.number}</TableCell>
              <TableCell>{t.name ?? "—"}</TableCell>
              <TableCell>{t.capacity}</TableCell>
              <TableCell className="flex gap-1">
                <Button size="sm" variant="ghost" onClick={() => openTableModal(t)}><Pencil className="h-4 w-4" /></Button>
                <Button size="sm" variant="ghost" className="text-destructive" onClick={() => deleteTable(t.id)}><Trash2 className="h-4 w-4" /></Button>
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>

      <Dialog open={tableModal} onOpenChange={setTableModal}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{editTable ? "Editar mesa" : "Nueva mesa"}</DialogTitle>
            <DialogDescription>Configura los datos de la mesa</DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div><Label>Número</Label><Input type="number" value={tableForm.number} onChange={(e) => setTableForm((p) => ({ ...p, number: parseInt(e.target.value) || 0 }))} /></div>
            <div><Label>Nombre (opcional)</Label><Input value={tableForm.name} onChange={(e) => setTableForm((p) => ({ ...p, name: e.target.value }))} placeholder="Ej: Terraza 2" /></div>
            <div><Label>Capacidad</Label><Input type="number" value={tableForm.capacity} onChange={(e) => setTableForm((p) => ({ ...p, capacity: parseInt(e.target.value) || 4 }))} /></div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setTableModal(false)}>Cancelar</Button>
            <Button onClick={saveTable} disabled={saving}>{saving ? "Guardando..." : "Guardar"}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
