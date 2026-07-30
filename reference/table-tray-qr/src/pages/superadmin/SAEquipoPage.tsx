import { useEffect, useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Sheet, SheetContent, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import { supabase } from '@/integrations/supabase/client';
import { useSuperAdmin } from '@/contexts/SuperAdminContext';
import { useNavigate } from 'react-router-dom';
import { useToast } from '@/hooks/use-toast';
import { Users, Eye, Shield, DollarSign, HeartPulse, Megaphone, UserCheck, Plus, Pencil, History, Loader2, Trophy, Copy } from 'lucide-react';

interface Member {
  id: string;
  name: string;
  email: string;
  role: string;
  zone: string | null;
  is_active: boolean | null;
  last_access_at: string | null;
  user_id: string | null;
  phone: string | null;
  created_at: string | null;
}

interface AuditEntry {
  id: string;
  action: string;
  entity_type: string | null;
  created_at: string | null;
  metadata: any;
}

const ROLE_CONFIG: Record<string, { label: string; icon: any; color: string; panel: string }> = {
  superadmin: { label: 'Superadmin', icon: Shield, color: 'bg-secondary text-secondary-foreground', panel: '/superadmin' },
  jefe_ventas: { label: 'Jefe de Ventas', icon: Users, color: 'bg-primary text-primary-foreground', panel: '/jefe-ventas/dashboard' },
  vendedor: { label: 'Vendedor', icon: UserCheck, color: 'bg-primary/20 text-primary', panel: '/vendedor/mi-dia' },
  finanzas: { label: 'Finanzas', icon: DollarSign, color: 'bg-muted text-muted-foreground', panel: '/finanzas/revenue' },
  marketing: { label: 'Marketing', icon: Megaphone, color: 'bg-muted text-muted-foreground', panel: '/jefe-ventas/dashboard' },
  customer_success: { label: 'Customer Success', icon: HeartPulse, color: 'bg-muted text-muted-foreground', panel: '/jefe-ventas/dashboard' },
};

const ZONES = ['Barrio Italia', 'Ñuñoa', 'Lastarria', 'Providencia', 'Las Condes', 'Vitacura', 'Santiago Centro'];

export default function SAEquipoPage() {
  const [members, setMembers] = useState<Member[]>([]);
  const [loading, setLoading] = useState(true);
  const { setImpersonating } = useSuperAdmin();
  const navigate = useNavigate();
  const { toast } = useToast();

  // Edit state
  const [editMember, setEditMember] = useState<Member | null>(null);
  const [editName, setEditName] = useState('');
  const [editRole, setEditRole] = useState('');
  const [editZone, setEditZone] = useState('');
  const [editPhone, setEditPhone] = useState('');
  const [saving, setSaving] = useState(false);

  // Create state
  const [createOpen, setCreateOpen] = useState(false);
  const [newName, setNewName] = useState('');
  const [newEmail, setNewEmail] = useState('');
  const [newRole, setNewRole] = useState('vendedor');
  const [newZone, setNewZone] = useState('');
  const [creating, setCreating] = useState(false);

  // Invite state
  const [inviteLink, setInviteLink] = useState('');

  // Audit state
  const [auditOpen, setAuditOpen] = useState(false);
  const [auditMember, setAuditMember] = useState<Member | null>(null);
  const [auditLogs, setAuditLogs] = useState<AuditEntry[]>([]);
  const [auditLoading, setAuditLoading] = useState(false);

  // Seller stats
  const [sellerStats, setSellerStats] = useState<Record<string, { leads: number; closes: number; visits: number }>>({});

  const fetchMembers = async () => {
    const { data, error } = await supabase.from('backoffice_members').select('*').order('role');
    if (error) {
      console.error('Error fetching members:', error.message);
      toast({ title: 'Error cargando equipo', description: error.message, variant: 'destructive' });
    }
    setMembers((data || []) as Member[]);
    setLoading(false);
  };

  const fetchSellerStats = async () => {
    const [leadsRes, activitiesRes] = await Promise.all([
      supabase.from('leads').select('id, assigned_seller_id, stage'),
      supabase.from('lead_activities').select('id, lead_id, type'),
    ]);
    const leads = leadsRes.data ?? [];
    const activities = activitiesRes.data ?? [];
    const stats: Record<string, { leads: number; closes: number; visits: number }> = {};
    leads.forEach(l => {
      if (!l.assigned_seller_id) return;
      if (!stats[l.assigned_seller_id]) stats[l.assigned_seller_id] = { leads: 0, closes: 0, visits: 0 };
      stats[l.assigned_seller_id].leads++;
      if (l.stage === 'cerrado' || l.stage === 'cliente_pagando') stats[l.assigned_seller_id].closes++;
    });
    activities.forEach(a => {
      if (a.type !== 'visita') return;
      const lead = leads.find(l => l.id === a.lead_id);
      if (lead?.assigned_seller_id && stats[lead.assigned_seller_id]) {
        stats[lead.assigned_seller_id].visits++;
      }
    });
    setSellerStats(stats);
  };

  useEffect(() => { fetchMembers(); fetchSellerStats(); }, []);

  const impersonate = (member: Member) => {
    const config = ROLE_CONFIG[member.role] || ROLE_CONFIG.vendedor;
    // Store in sessionStorage for the target panel's context to pick up
    sessionStorage.setItem('superadmin_impersonating', member.id);
    setImpersonating(member.user_id);
    navigate(config.panel);
  };

  const toggleActive = async (member: Member) => {
    await supabase.from('backoffice_members').update({ is_active: !member.is_active }).eq('id', member.id);
    setMembers(prev => prev.map(m => m.id === member.id ? { ...m, is_active: !m.is_active } : m));
    toast({ title: `${member.name} ${!member.is_active ? 'activado' : 'desactivado'}` });
  };

  const openEdit = (m: Member) => {
    setEditMember(m);
    setEditName(m.name);
    setEditRole(m.role);
    setEditZone(m.zone || '');
    setEditPhone(m.phone || '');
  };

  const saveEdit = async () => {
    if (!editMember) return;
    setSaving(true);
    await supabase.from('backoffice_members').update({
      name: editName, role: editRole, zone: editZone || null, phone: editPhone || null,
    }).eq('id', editMember.id);
    setMembers(prev => prev.map(m => m.id === editMember.id ? { ...m, name: editName, role: editRole, zone: editZone || null, phone: editPhone || null } : m));
    toast({ title: 'Miembro actualizado' });
    setSaving(false);
    setEditMember(null);
  };

  const openAudit = async (m: Member) => {
    setAuditMember(m);
    setAuditOpen(true);
    setAuditLoading(true);
    const { data } = await supabase.from('audit_logs').select('*').eq('user_id', m.user_id).order('created_at', { ascending: false }).limit(50);
    setAuditLogs((data || []) as AuditEntry[]);
    setAuditLoading(false);
  };

  const createMember = async () => {
    if (!newName.trim() || !newEmail.trim()) return;
    setCreating(true);

    try {
      // Create invitation first
      const { data: inv, error: invError } = await supabase.from('backoffice_invitations').insert({
        role: newRole, zone: newZone || null,
      }).select('token').maybeSingle();

      if (invError || !inv) {
        toast({ title: 'Error al crear invitación', description: invError?.message, variant: 'destructive' });
        setCreating(false);
        return;
      }

      // Also create the member record
      const { error: memberError } = await supabase.from('backoffice_members').insert({
        name: newName.trim(), email: newEmail.trim(), role: newRole, zone: newZone || null, is_active: true,
      });

      if (memberError) {
        toast({ title: 'Error al crear miembro', description: memberError.message, variant: 'destructive' });
        setCreating(false);
        return;
      }

      const link = `${window.location.origin}/backoffice/join/${inv.token}`;
      setInviteLink(link);
      toast({ title: 'Miembro creado e invitación generada' });
      setCreating(false);
      setCreateOpen(false);
      setNewName(''); setNewEmail(''); setNewRole('vendedor'); setNewZone('');
      fetchMembers();
    } catch (err) {
      toast({ title: 'Error inesperado', variant: 'destructive' });
      setCreating(false);
    }
  };

  if (loading) {
    return <div className="flex items-center justify-center h-64"><div className="animate-spin h-6 w-6 border-2 border-primary border-t-transparent rounded-full" /></div>;
  }

  const grouped = Object.keys(ROLE_CONFIG).map(role => ({
    role, config: ROLE_CONFIG[role],
    members: members.filter(m => m.role === role),
  })).filter(g => g.members.length > 0 || ['jefe_ventas', 'vendedor', 'finanzas'].includes(g.role));

  // Ranking for vendedores
  const vendedores = members.filter(m => m.role === 'vendedor').map(m => ({
    ...m, stats: sellerStats[m.id] || { leads: 0, closes: 0, visits: 0 },
  })).sort((a, b) => b.stats.closes - a.stats.closes || b.stats.visits - a.stats.visits);

  return (
    <div className="p-6 space-y-6 max-w-5xl">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-foreground">Equipo</h1>
        <div className="flex items-center gap-2">
          <Badge variant="outline">{members.length} miembros</Badge>
          <Button size="sm" onClick={() => setCreateOpen(true)}><Plus className="w-4 h-4 mr-1" />Nuevo miembro</Button>
        </div>
      </div>

      {/* Invite link banner */}
      {inviteLink && (
        <Card className="border-primary/30">
          <CardContent className="p-3 flex items-center justify-between gap-2">
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium text-foreground">Link de invitación generado</p>
              <p className="text-xs text-muted-foreground truncate">{inviteLink}</p>
            </div>
            <Button size="sm" variant="outline" onClick={() => { navigator.clipboard.writeText(inviteLink); toast({ title: 'Copiado' }); }}>
              <Copy className="w-4 h-4 mr-1" />Copiar
            </Button>
          </CardContent>
        </Card>
      )}

      {/* Seller ranking */}
      {vendedores.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="text-sm flex items-center gap-2"><Trophy className="w-4 h-4 text-amber-500" />Ranking semanal vendedores</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead><tr className="border-b border-border">
                  <th className="text-left py-2 text-muted-foreground font-medium">#</th>
                  <th className="text-left py-2 text-muted-foreground font-medium">Vendedor</th>
                  <th className="text-left py-2 text-muted-foreground font-medium">Zona</th>
                  <th className="text-right py-2 text-muted-foreground font-medium">Visitas</th>
                  <th className="text-right py-2 text-muted-foreground font-medium">Leads</th>
                  <th className="text-right py-2 text-muted-foreground font-medium">Cierres</th>
                </tr></thead>
                <tbody className="divide-y divide-border">
                  {vendedores.map((v, i) => (
                    <tr key={v.id} className={i === 0 ? 'bg-primary/5' : ''}>
                      <td className="py-2 font-bold text-muted-foreground">{i === 0 ? '🥇' : i === 1 ? '🥈' : i === 2 ? '🥉' : i + 1}</td>
                      <td className="py-2 font-medium text-foreground">{v.name}</td>
                      <td className="py-2 text-muted-foreground text-xs">{v.zone || '-'}</td>
                      <td className="py-2 text-right">{v.stats.visits}</td>
                      <td className="py-2 text-right">{v.stats.leads}</td>
                      <td className="py-2 text-right font-semibold">{v.stats.closes}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Members by role */}
      {grouped.map(g => {
        const Icon = g.config.icon;
        return (
          <div key={g.role}>
            <div className="flex items-center gap-2 mb-3">
              <Icon className="w-4 h-4 text-muted-foreground" />
              <h2 className="text-sm font-semibold text-foreground">{g.config.label}</h2>
              <Badge variant="outline" className="text-xs">{g.members.length}</Badge>
            </div>
            {g.members.length === 0 ? (
              <Card>
                <CardContent className="p-4 text-center text-sm text-muted-foreground">Sin miembros con este rol</CardContent>
              </Card>
            ) : (
              <div className="grid gap-2">
                {g.members.map(m => (
                  <Card key={m.id}>
                    <CardContent className="p-4 flex items-center justify-between">
                      <div className="flex items-center gap-3">
                        <div className={`w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold ${g.config.color}`}>
                          {m.name.charAt(0).toUpperCase()}
                        </div>
                        <div>
                          <p className="text-sm font-medium text-foreground">{m.name}</p>
                          <p className="text-xs text-muted-foreground">{m.email} {m.zone ? `· ${m.zone}` : ''}</p>
                          <p className="text-[10px] text-muted-foreground">
                            Último acceso: {m.last_access_at ? new Date(m.last_access_at).toLocaleDateString('es-CL') : 'Nunca'}
                            {m.created_at && ` · Creado: ${new Date(m.created_at).toLocaleDateString('es-CL')}`}
                          </p>
                        </div>
                      </div>
                      <div className="flex items-center gap-1">
                        <Switch checked={!!m.is_active} onCheckedChange={() => toggleActive(m)} />
                        <Button variant="ghost" size="icon" onClick={() => openEdit(m)} title="Editar"><Pencil className="w-4 h-4" /></Button>
                        <Button variant="ghost" size="icon" onClick={() => openAudit(m)} title="Auditoría"><History className="w-4 h-4" /></Button>
                        {m.user_id && (
                          <Button variant="ghost" size="icon" onClick={() => impersonate(m)} title="Ver como este usuario"><Eye className="w-4 h-4" /></Button>
                        )}
                      </div>
                    </CardContent>
                  </Card>
                ))}
              </div>
            )}
          </div>
        );
      })}

      {/* Edit dialog */}
      <Dialog open={!!editMember} onOpenChange={(o) => { if (!o) setEditMember(null); }}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader><DialogTitle>Editar miembro</DialogTitle></DialogHeader>
          <div className="space-y-4">
            <div><Label>Nombre</Label><Input value={editName} onChange={e => setEditName(e.target.value)} /></div>
            <div>
              <Label>Rol</Label>
              <Select value={editRole} onValueChange={setEditRole}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {Object.entries(ROLE_CONFIG).map(([k, v]) => (
                    <SelectItem key={k} value={k}>{v.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>Zona</Label>
              <Select value={editZone} onValueChange={setEditZone}>
                <SelectTrigger><SelectValue placeholder="Sin zona" /></SelectTrigger>
                <SelectContent>
                  {ZONES.map(z => <SelectItem key={z} value={z}>{z}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div><Label>Teléfono</Label><Input value={editPhone} onChange={e => setEditPhone(e.target.value)} /></div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditMember(null)}>Cancelar</Button>
            <Button onClick={saveEdit} disabled={saving}>
              {saving && <Loader2 className="w-4 h-4 animate-spin mr-1" />}Guardar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Create dialog */}
      <Dialog open={createOpen} onOpenChange={setCreateOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader><DialogTitle>Nuevo miembro</DialogTitle></DialogHeader>
          <div className="space-y-4">
            <div><Label>Nombre</Label><Input value={newName} onChange={e => setNewName(e.target.value)} placeholder="Nombre completo" /></div>
            <div><Label>Email</Label><Input type="email" value={newEmail} onChange={e => setNewEmail(e.target.value)} placeholder="email@ejemplo.cl" /></div>
            <div>
              <Label>Rol</Label>
              <Select value={newRole} onValueChange={setNewRole}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {Object.entries(ROLE_CONFIG).map(([k, v]) => (
                    <SelectItem key={k} value={k}>{v.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>Zona</Label>
              <Select value={newZone} onValueChange={setNewZone}>
                <SelectTrigger><SelectValue placeholder="Sin zona" /></SelectTrigger>
                <SelectContent>
                  {ZONES.map(z => <SelectItem key={z} value={z}>{z}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setCreateOpen(false)}>Cancelar</Button>
            <Button onClick={createMember} disabled={creating || !newName.trim() || !newEmail.trim()}>
              {creating && <Loader2 className="w-4 h-4 animate-spin mr-1" />}Crear e invitar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Audit sheet */}
      <Sheet open={auditOpen} onOpenChange={setAuditOpen}>
        <SheetContent>
          <SheetHeader>
            <SheetTitle>Auditoría — {auditMember?.name}</SheetTitle>
          </SheetHeader>
          {auditLoading ? (
            <div className="flex justify-center py-12"><Loader2 className="w-5 h-5 animate-spin" /></div>
          ) : auditLogs.length === 0 ? (
            <p className="text-sm text-muted-foreground py-8 text-center">Sin registros de auditoría</p>
          ) : (
            <div className="space-y-3 mt-4">
              {auditLogs.map(log => (
                <div key={log.id} className="border-b border-border pb-2">
                  <p className="text-sm font-medium text-foreground">{log.action}</p>
                  <p className="text-xs text-muted-foreground">{log.entity_type} — {log.created_at ? new Date(log.created_at).toLocaleString('es-CL') : ''}</p>
                </div>
              ))}
            </div>
          )}
        </SheetContent>
      </Sheet>
    </div>
  );
}
