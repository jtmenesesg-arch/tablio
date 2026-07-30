import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAdmin } from "@/contexts/AdminContext";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Plus, Pencil, Loader2, Users, Link2, Copy, Check, Mail } from "lucide-react";

interface StaffRow {
  id: string;
  name: string;
  role: string;
  is_active: boolean | null;
  auth_user_id: string | null;
}

const ROLE_LABELS: Record<string, string> = {
  waiter: "Mozo",
  cashier: "Cajero",
  host: "Host",
};

export default function EquipoPage() {
  const { branchId, tenantId } = useAdmin();
  const { toast } = useToast();
  const [staff, setStaff] = useState<StaffRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [modalOpen, setModalOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [role, setRole] = useState("waiter");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [generatingLink, setGeneratingLink] = useState(false);
  const [copiedLink, setCopiedLink] = useState(false);

  const fetchStaff = async () => {
    const { data } = await supabase
      .from("staff_users")
      .select("id, name, role, is_active, auth_user_id")
      .eq("branch_id", branchId)
      .eq("tenant_id", tenantId)
      .order("created_at", { ascending: false });
    setStaff(data ?? []);
    setLoading(false);
  };

  useEffect(() => { fetchStaff(); }, [branchId, tenantId]);

  const openCreate = () => {
    setEditingId(null);
    setName("");
    setEmail("");
    setPassword("");
    setRole("waiter");
    setError("");
    setModalOpen(true);
  };

  const openEdit = (s: StaffRow) => {
    setEditingId(s.id);
    setName(s.name);
    setEmail("");
    setPassword("");
    setRole(s.role);
    setError("");
    setModalOpen(true);
  };

  const save = async () => {
    setError("");
    if (!name.trim()) { setError("Nombre obligatorio"); return; }

    setSaving(true);

    if (editingId) {
      const { error: updateError } = await supabase
        .from("staff_users")
        .update({ name: name.trim(), role })
        .eq("id", editingId);

      if (updateError) {
        setError("Error al actualizar");
        setSaving(false);
        return;
      }
      toast({ title: "Mozo actualizado" });
    } else {
      if (!email.trim()) { setError("Email obligatorio"); setSaving(false); return; }
      if (password.length < 6) { setError("La contraseña debe tener al menos 6 caracteres"); setSaving(false); return; }

      // Create auth user via edge function
      const { data: userData, error: fnError } = await supabase.functions.invoke("create-tenant-user", {
        body: { email: email.trim(), password, tenant_id: tenantId, branch_id: branchId },
      });

      if (fnError || userData?.error) {
        setError(userData?.error || fnError?.message || "Error al crear usuario");
        setSaving(false);
        return;
      }

      // Create staff_users record
      const { error: staffError } = await supabase
        .from("staff_users")
        .insert({
          name: name.trim(),
          role,
          branch_id: branchId,
          tenant_id: tenantId,
          is_active: true,
          auth_user_id: userData.user_id,
        });

      if (staffError) {
        setError("Error al crear el mozo");
        setSaving(false);
        return;
      }
      toast({ title: "Mozo creado con email y contraseña" });
    }

    setModalOpen(false);
    setSaving(false);
    fetchStaff();
  };

  const toggleActive = async (s: StaffRow) => {
    await supabase.from("staff_users").update({ is_active: !s.is_active }).eq("id", s.id);
    toast({ title: `${s.name} ${!s.is_active ? "activado" : "desactivado"}` });
    fetchStaff();
  };

  const generateInviteLink = async () => {
    setGeneratingLink(true);
    const { data, error: err } = await supabase
      .from("staff_invitations")
      .insert({ tenant_id: tenantId, branch_id: branchId, role: "waiter" })
      .select("token")
      .single();

    if (err || !data) {
      toast({ title: "Error al generar link", variant: "destructive" });
      setGeneratingLink(false);
      return;
    }

    const link = `${window.location.origin}/mozo/join/${data.token}`;
    await navigator.clipboard.writeText(link);
    setCopiedLink(true);
    toast({ title: "Link copiado al portapapeles", description: "El mozo deberá registrarse con email y contraseña" });
    setGeneratingLink(false);
    setTimeout(() => setCopiedLink(false), 3000);
  };

  if (loading) {
    return <div className="flex items-center justify-center h-64"><Loader2 className="w-6 h-6 animate-spin text-muted-foreground" /></div>;
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-2">
          <Users className="h-5 w-5 text-muted-foreground" />
          <h1 className="text-xl font-bold text-foreground">Equipo</h1>
        </div>
        <div className="flex items-center gap-2">
          <Button onClick={generateInviteLink} variant="outline" size="sm" disabled={generatingLink}>
            {copiedLink ? <Check className="w-4 h-4 mr-1" /> : <Link2 className="w-4 h-4 mr-1" />}
            {copiedLink ? "Copiado" : "Invitar mozo"}
          </Button>
          <Button onClick={openCreate} size="sm"><Plus className="w-4 h-4 mr-1" />Agregar mozo</Button>
        </div>
      </div>

      {staff.length === 0 ? (
        <div className="text-center py-12 text-muted-foreground">
          <p>No hay mozos registrados</p>
          <p className="text-sm mt-1">Agrega tu primer mozo o envía un link de invitación</p>
        </div>
      ) : (
        <div className="border border-border rounded-lg overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-muted/50">
              <tr>
                <th className="text-left px-4 py-3 font-medium text-muted-foreground">Nombre</th>
                <th className="text-left px-4 py-3 font-medium text-muted-foreground">Rol</th>
                <th className="text-left px-4 py-3 font-medium text-muted-foreground">Auth</th>
                <th className="text-left px-4 py-3 font-medium text-muted-foreground">Activo</th>
                <th className="text-right px-4 py-3 font-medium text-muted-foreground">Acciones</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {staff.map(s => (
                <tr key={s.id} className="hover:bg-muted/30 transition-colors">
                  <td className="px-4 py-3 font-medium text-foreground">{s.name}</td>
                  <td className="px-4 py-3">
                    <Badge variant="outline" className="text-[10px]">
                      {ROLE_LABELS[s.role] ?? s.role}
                    </Badge>
                  </td>
                  <td className="px-4 py-3">
                    {s.auth_user_id ? (
                      <Badge variant="secondary" className="text-[10px] gap-1">
                        <Mail className="h-3 w-3" /> Vinculado
                      </Badge>
                    ) : (
                      <Badge variant="outline" className="text-[10px] text-muted-foreground">Sin cuenta</Badge>
                    )}
                  </td>
                  <td className="px-4 py-3">
                    <Switch checked={!!s.is_active} onCheckedChange={() => toggleActive(s)} />
                  </td>
                  <td className="px-4 py-3 text-right">
                    <Button variant="ghost" size="icon" onClick={() => openEdit(s)}>
                      <Pencil className="w-4 h-4" />
                    </Button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <Dialog open={modalOpen} onOpenChange={setModalOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{editingId ? "Editar mozo" : "Agregar mozo"}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div>
              <Label>Nombre</Label>
              <Input value={name} onChange={e => setName(e.target.value)} placeholder="Juan Pérez" />
            </div>
            {!editingId && (
              <>
                <div>
                  <Label>Email</Label>
                  <Input type="email" value={email} onChange={e => setEmail(e.target.value)} placeholder="juan@email.com" />
                </div>
                <div>
                  <Label>Contraseña</Label>
                  <Input type="password" value={password} onChange={e => setPassword(e.target.value)} placeholder="Mínimo 6 caracteres" />
                </div>
              </>
            )}
            <div>
              <Label>Rol</Label>
              <Select value={role} onValueChange={setRole}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="waiter">Mozo</SelectItem>
                  <SelectItem value="cashier">Cajero</SelectItem>
                  <SelectItem value="host">Host</SelectItem>
                </SelectContent>
              </Select>
            </div>
            {error && <p className="text-sm text-destructive">{error}</p>}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setModalOpen(false)}>Cancelar</Button>
            <Button onClick={save} disabled={saving}>
              {saving ? <Loader2 className="w-4 h-4 animate-spin mr-1" /> : null}
              {editingId ? "Guardar" : "Crear"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
