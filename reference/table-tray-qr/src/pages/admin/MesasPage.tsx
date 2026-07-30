import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAdmin } from "@/contexts/AdminContext";
import { useToast } from "@/hooks/use-toast";
import { formatCLP } from "@/lib/format";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";
import { Plus, Users } from "lucide-react";

interface TableRow {
  id: string;
  number: number;
  name: string | null;
  status: string | null;
  capacity: number | null;
  session_total?: number;
  session_opened_at?: string;
}

const STATUS_MAP: Record<string, { label: string; bg: string; text: string }> = {
  free: { label: "Libre", bg: "bg-[#E8F5EE]", text: "text-[#1A6B45]" },
  occupied: { label: "Ocupada", bg: "bg-accent", text: "text-accent-foreground" },
  waiting_bill: { label: "Esperando cuenta", bg: "bg-[#FDE8E8]", text: "text-[#C0280F]" },
  reserved: { label: "Reservada", bg: "bg-muted", text: "text-muted-foreground" },
};

function minutesSince(dateStr: string) {
  return Math.floor((Date.now() - new Date(dateStr).getTime()) / 60000);
}

export default function MesasPage() {
  const { branchId, tenantId } = useAdmin();
  const { toast } = useToast();
  const [tables, setTables] = useState<TableRow[]>([]);
  const [loading, setLoading] = useState(true);

  // Create table state
  const [showCreate, setShowCreate] = useState(false);
  const [creating, setCreating] = useState(false);
  const [newName, setNewName] = useState("");
  const [newCapacity, setNewCapacity] = useState("4");

  const fetchTables = async () => {
    const { data, error } = await supabase
      .from("tables")
      .select("id, number, name, status, capacity")
      .eq("branch_id", branchId)
      .order("number");

    if (error || !data) return;

    const occupiedIds = data.filter((t) => t.status === "occupied" || t.status === "waiting_bill").map((t) => t.id);
    let sessionMap: Record<string, { total: number; opened: string }> = {};
    if (occupiedIds.length) {
      const { data: sessions } = await supabase
        .from("table_sessions")
        .select("table_id, total_amount, opened_at")
        .in("table_id", occupiedIds)
        .eq("is_active", true);
      if (sessions) {
        sessions.forEach((s) => {
          sessionMap[s.table_id] = { total: s.total_amount ?? 0, opened: s.opened_at ?? "" };
        });
      }
    }

    setTables(
      data.map((t) => ({
        ...t,
        session_total: sessionMap[t.id]?.total,
        session_opened_at: sessionMap[t.id]?.opened,
      }))
    );
    setLoading(false);
  };

  useEffect(() => {
    fetchTables();

    const channel = supabase
      .channel("admin-tables")
      .on("postgres_changes", { event: "*", schema: "public", table: "tables", filter: `branch_id=eq.${branchId}` }, () => {
        fetchTables();
      })
      .subscribe();

    return () => { supabase.removeChannel(channel); };
  }, [branchId]);


  const handleCreateTable = async () => {
    setCreating(true);
    try {
      const nextNumber = tables.length > 0 ? Math.max(...tables.map((t) => t.number)) + 1 : 1;
      const qrToken = crypto.randomUUID();

      const { error } = await supabase.from("tables").insert({
        number: nextNumber,
        name: newName.trim() || null,
        capacity: parseInt(newCapacity) || 4,
        branch_id: branchId,
        tenant_id: tenantId,
        qr_token: qrToken,
      });

      if (error) throw error;

      toast({ title: "Mesa creada", description: `Mesa ${nextNumber} agregada correctamente` });
      setShowCreate(false);
      setNewName("");
      setNewCapacity("4");
      fetchTables();
    } catch (e: any) {
      toast({ title: "Error", description: e.message || "No se pudo crear la mesa", variant: "destructive" });
    } finally {
      setCreating(false);
    }
  };

  if (loading) return <div className="flex justify-center py-12"><div className="animate-spin h-8 w-8 border-4 border-primary border-t-transparent rounded-full" /></div>;

  const freeCount = tables.filter((t) => t.status === "free").length;
  const occupiedCount = tables.filter((t) => t.status === "occupied" || t.status === "waiting_bill").length;

  return (
    <div>
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h2 className="text-2xl font-bold text-foreground">Mesas</h2>
          <p className="text-sm text-muted-foreground mt-1">
            {freeCount} libres · {occupiedCount} ocupadas · {tables.length} total
          </p>
        </div>
        <Button
          onClick={() => setShowCreate(true)}
          className="gap-2 rounded-xl shadow-lg hover:shadow-xl transition-all hover:scale-105 active:scale-95"
          size="lg"
        >
          <Plus className="h-5 w-5" />
          Nueva mesa
        </Button>
      </div>

      {/* Grid */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-4">
        {tables.map((t) => {
          const s = STATUS_MAP[t.status ?? "free"] ?? STATUS_MAP.free;
          const isOccupied = t.status === "occupied" || t.status === "waiting_bill";
          return (
            <div
              key={t.id}
              className={cn(
                "rounded-xl p-5 text-left transition-all border border-border",
                s.bg,
                isOccupied && "ring-1 ring-orange-300 dark:ring-orange-700"
              )}
            >
              <div className="flex items-start justify-between">
                <div className="text-3xl font-bold text-foreground">{t.number}</div>
                {t.capacity && (
                  <div className="flex items-center gap-1 text-xs text-muted-foreground">
                    <Users className="h-3 w-3" />
                    {t.capacity}
                  </div>
                )}
              </div>
              {t.name && <div className="text-sm text-muted-foreground mt-0.5">{t.name}</div>}
              <Badge variant="outline" className={cn("mt-3", s.text)}>{s.label}</Badge>
              {isOccupied && t.session_total !== undefined && (
                <div className="mt-2 text-sm font-semibold text-foreground">{formatCLP(t.session_total)}</div>
              )}
              {isOccupied && t.session_opened_at && (
                <div className="text-xs text-muted-foreground mt-1">{minutesSince(t.session_opened_at)} min</div>
              )}
            </div>
          );
        })}

        {/* Ghost add button inside grid */}
        <button
          onClick={() => setShowCreate(true)}
          className="rounded-xl p-5 border-2 border-dashed border-muted-foreground/25 hover:border-primary/50 hover:bg-primary/5 transition-all flex flex-col items-center justify-center gap-2 min-h-[140px] group"
        >
          <div className="h-10 w-10 rounded-full bg-primary/10 group-hover:bg-primary/20 transition-colors flex items-center justify-center">
            <Plus className="h-5 w-5 text-primary" />
          </div>
          <span className="text-sm font-medium text-muted-foreground group-hover:text-primary transition-colors">Agregar</span>
        </button>
      </div>


      {/* Create table dialog */}
      <Dialog open={showCreate} onOpenChange={setShowCreate}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Crear nueva mesa</DialogTitle>
            <DialogDescription>
              Se asignará automáticamente el número {tables.length > 0 ? Math.max(...tables.map((t) => t.number)) + 1 : 1}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="space-y-2">
              <Label htmlFor="table-name">Nombre (opcional)</Label>
              <Input
                id="table-name"
                placeholder="Ej: Terraza 1, VIP..."
                value={newName}
                onChange={(e) => setNewName(e.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="table-capacity">Capacidad</Label>
              <Input
                id="table-capacity"
                type="number"
                min={1}
                max={20}
                value={newCapacity}
                onChange={(e) => setNewCapacity(e.target.value)}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowCreate(false)}>Cancelar</Button>
            <Button onClick={handleCreateTable} disabled={creating}>
              {creating ? "Creando..." : "Crear mesa"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}