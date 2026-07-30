import { useEffect, useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { supabase } from '@/integrations/supabase/client';
import { Plus, Pencil, UserCheck, UserX, Link2, Copy, Trophy, Target, Eye } from 'lucide-react';
import { toast } from 'sonner';

interface Seller {
  id: string;
  name: string;
  email: string;
  phone: string | null;
  role: string;
  zone: string | null;
  is_active: boolean;
  created_at: string | null;
  last_access_at: string | null;
  user_id: string | null;
}

interface LeadCount {
  assigned_seller_id: string;
  stage: string;
  updated_at: string | null;
}

interface Invitation {
  id: string;
  token: string;
  role: string;
  zone: string | null;
  created_at: string | null;
  expires_at: string | null;
  used_at: string | null;
}

interface Goal {
  id: string;
  seller_id: string;
  period: string;
  visits_goal: number;
  demos_goal: number;
  pilots_goal: number;
  closes_goal: number;
  commission_per_close: number;
}

const ZONES = ['Barrio Italia', 'Ñuñoa', 'Lastarria', 'Providencia'];
const ROLES = [
  { value: 'vendedor', label: 'Vendedor' },
  { value: 'jefe_ventas', label: 'Jefe de Ventas' },
  { value: 'marketing', label: 'Marketing' },
  { value: 'finanzas', label: 'Finanzas' },
  { value: 'customer_success', label: 'Customer Success' },
];

export default function BackofficeVendedores() {
  const [sellers, setSellers] = useState<Seller[]>([]);
  const [leads, setLeads] = useState<LeadCount[]>([]);
  const [invitations, setInvitations] = useState<Invitation[]>([]);
  const [goals, setGoals] = useState<Goal[]>([]);
  const [loading, setLoading] = useState(true);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState<Seller | null>(null);
  const [inviteOpen, setInviteOpen] = useState(false);
  const [goalOpen, setGoalOpen] = useState(false);
  const [goalSeller, setGoalSeller] = useState<Seller | null>(null);
  const [detailSeller, setDetailSeller] = useState<Seller | null>(null);
  const [form, setForm] = useState({ name: '', email: '', phone: '', role: 'vendedor', zone: '' });
  const [inviteForm, setInviteForm] = useState({ role: 'vendedor', zone: '' });
  const [goalForm, setGoalForm] = useState({ visits_goal: 20, demos_goal: 8, pilots_goal: 3, closes_goal: 2, commission_per_close: 50 });

  const currentPeriod = new Date().toISOString().slice(0, 7); // YYYY-MM

  const load = async () => {
    const [sellersRes, leadsRes, invRes, goalsRes] = await Promise.all([
      supabase.from('backoffice_members').select('*').order('created_at', { ascending: false }),
      supabase.from('leads').select('assigned_seller_id, stage, updated_at'),
      supabase.from('backoffice_invitations').select('*').order('created_at', { ascending: false }).limit(20),
      supabase.from('seller_goals').select('*').eq('period', currentPeriod),
    ]);
    setSellers((sellersRes.data as Seller[]) || []);
    setLeads((leadsRes.data as LeadCount[]) || []);
    setInvitations((invRes.data as Invitation[]) || []);
    setGoals((goalsRes.data as Goal[]) || []);
    setLoading(false);
  };

  useEffect(() => { load(); }, []);

  const openCreate = () => {
    setEditing(null);
    setForm({ name: '', email: '', phone: '', role: 'vendedor', zone: '' });
    setDialogOpen(true);
  };

  const openEdit = (s: Seller) => {
    setEditing(s);
    setForm({ name: s.name, email: s.email, phone: s.phone || '', role: s.role, zone: s.zone || '' });
    setDialogOpen(true);
  };

  const handleSave = async () => {
    if (!form.name || !form.email) return toast.error('Nombre y email son requeridos');
    if (editing) {
      const { error } = await supabase.from('backoffice_members').update({
        name: form.name, email: form.email, phone: form.phone || null, role: form.role, zone: form.zone || null,
      }).eq('id', editing.id);
      if (error) return toast.error(error.message);
      toast.success('Miembro actualizado');
    } else {
      const { error } = await supabase.from('backoffice_members').insert({
        name: form.name, email: form.email, phone: form.phone || null, role: form.role, zone: form.zone || null,
      });
      if (error) return toast.error(error.message);
      toast.success('Miembro creado');
    }
    setDialogOpen(false);
    load();
  };

  const toggleActive = async (s: Seller) => {
    await supabase.from('backoffice_members').update({ is_active: !s.is_active }).eq('id', s.id);
    toast.success(s.is_active ? 'Desactivado' : 'Activado');
    load();
  };

  const createInvitation = async () => {
    const { data, error } = await supabase.from('backoffice_invitations').insert({
      role: inviteForm.role,
      zone: inviteForm.zone || null,
    }).select().single();
    if (error) return toast.error(error.message);
    toast.success('Invitación creada');
    setInvitations(prev => [data as Invitation, ...prev]);
    setInviteOpen(false);
  };

  const copyInviteLink = (token: string) => {
    const url = `${window.location.origin}/backoffice/join/${token}`;
    navigator.clipboard.writeText(url);
    toast.success('Link copiado al portapapeles');
  };

  const saveGoal = async () => {
    if (!goalSeller) return;
    const existing = goals.find(g => g.seller_id === goalSeller.id);
    if (existing) {
      await supabase.from('seller_goals').update(goalForm).eq('id', existing.id);
    } else {
      await supabase.from('seller_goals').insert({ ...goalForm, seller_id: goalSeller.id, period: currentPeriod });
    }
    toast.success('Meta guardada');
    setGoalOpen(false);
    load();
  };

  const openGoal = (s: Seller) => {
    setGoalSeller(s);
    const existing = goals.find(g => g.seller_id === s.id);
    if (existing) {
      setGoalForm({ visits_goal: existing.visits_goal, demos_goal: existing.demos_goal, pilots_goal: existing.pilots_goal, closes_goal: existing.closes_goal, commission_per_close: existing.commission_per_close });
    } else {
      setGoalForm({ visits_goal: 20, demos_goal: 8, pilots_goal: 3, closes_goal: 2, commission_per_close: 50 });
    }
    setGoalOpen(true);
  };

  const getSellerStats = (id: string) => {
    const sl = leads.filter(l => l.assigned_seller_id === id);
    const pagando = sl.filter(l => l.stage === 'cliente_pagando').length;
    return {
      total: sl.length,
      demos: sl.filter(l => ['demo_agendada', 'demo_hecha'].includes(l.stage)).length,
      pilotos: sl.filter(l => l.stage === 'piloto_activo').length,
      pagando,
      conversion: sl.length > 0 ? ((pagando / sl.length) * 100).toFixed(0) : '0',
      stale: sl.filter(l => {
        if (l.stage === 'cliente_pagando' || l.stage === 'frio') return false;
        if (!l.updated_at) return true;
        return (Date.now() - new Date(l.updated_at).getTime()) / 86400000 > 7;
      }).length,
    };
  };

  // Ranking: sorted by pagando desc, then conversion desc
  const ranking = sellers
    .filter(s => s.role === 'vendedor' && s.is_active)
    .map(s => ({ ...s, stats: getSellerStats(s.id) }))
    .sort((a, b) => b.stats.pagando - a.stats.pagando || Number(b.stats.conversion) - Number(a.stats.conversion));

  if (loading) {
    return <div className="flex items-center justify-center h-64"><div className="animate-spin h-8 w-8 border-4 border-primary border-t-transparent rounded-full" /></div>;
  }

  return (
    <div className="p-4 md:p-6 space-y-4 max-w-6xl mx-auto">
      <div className="flex items-center justify-between flex-wrap gap-2">
        <div>
          <h1 className="text-2xl font-bold text-foreground tracking-tight">Equipo</h1>
          <p className="text-sm text-muted-foreground">{sellers.length} miembros</p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" onClick={() => setInviteOpen(true)} className="gap-2"><Link2 className="w-4 h-4" />Invitar</Button>
          <Button onClick={openCreate} className="gap-2"><Plus className="w-4 h-4" />Agregar</Button>
        </div>
      </div>

      <Tabs defaultValue="team">
        <TabsList>
          <TabsTrigger value="team">Equipo</TabsTrigger>
          <TabsTrigger value="ranking">🏆 Ranking</TabsTrigger>
          <TabsTrigger value="invites">Invitaciones</TabsTrigger>
        </TabsList>

        <TabsContent value="team">
          <Card>
            <CardContent className="p-0">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Nombre</TableHead>
                    <TableHead>Rol</TableHead>
                    <TableHead>Zona</TableHead>
                    <TableHead className="text-center">Leads</TableHead>
                    <TableHead className="text-center">Demos</TableHead>
                    <TableHead className="text-center">Pilotos</TableHead>
                    <TableHead className="text-center">Pagando</TableHead>
                    <TableHead className="text-center">Conv.</TableHead>
                    <TableHead className="text-center">⚠️</TableHead>
                    <TableHead className="text-right">Acciones</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {sellers.map(s => {
                    const stats = getSellerStats(s.id);
                    const goal = goals.find(g => g.seller_id === s.id);
                    return (
                      <TableRow key={s.id} className={!s.is_active ? 'opacity-50' : ''}>
                        <TableCell>
                          <div>
                            <p className="font-medium text-foreground text-sm">{s.name}</p>
                            <p className="text-xs text-muted-foreground">{s.email}</p>
                            {s.user_id && <Badge variant="outline" className="text-[9px] mt-0.5 border-primary/30 text-primary">con acceso</Badge>}
                          </div>
                        </TableCell>
                        <TableCell><Badge variant="outline" className="text-xs capitalize">{s.role.replace('_', ' ')}</Badge></TableCell>
                        <TableCell className="text-sm text-muted-foreground">{s.zone || '—'}</TableCell>
                        <TableCell className="text-center font-semibold text-sm">{stats.total}{goal ? <span className="text-muted-foreground font-normal">/{goal.closes_goal * 5}</span> : ''}</TableCell>
                        <TableCell className="text-center text-sm">{stats.demos}{goal ? <span className="text-muted-foreground">/{goal.demos_goal}</span> : ''}</TableCell>
                        <TableCell className="text-center text-sm">{stats.pilotos}{goal ? <span className="text-muted-foreground">/{goal.pilots_goal}</span> : ''}</TableCell>
                        <TableCell className="text-center text-sm font-semibold text-primary">{stats.pagando}{goal ? <span className="text-muted-foreground font-normal">/{goal.closes_goal}</span> : ''}</TableCell>
                        <TableCell className="text-center text-sm">{stats.conversion}%</TableCell>
                        <TableCell className="text-center">{stats.stale > 0 && <Badge variant="destructive" className="text-[10px]">{stats.stale}</Badge>}</TableCell>
                        <TableCell className="text-right">
                          <div className="flex items-center gap-0.5 justify-end">
                            <Button variant="ghost" size="icon" onClick={() => openGoal(s)} title="Metas"><Target className="w-3.5 h-3.5" /></Button>
                            <Button variant="ghost" size="icon" onClick={() => openEdit(s)} title="Editar"><Pencil className="w-3.5 h-3.5" /></Button>
                            <Button variant="ghost" size="icon" onClick={() => toggleActive(s)} title={s.is_active ? 'Desactivar' : 'Activar'}>
                              {s.is_active ? <UserX className="w-3.5 h-3.5 text-destructive" /> : <UserCheck className="w-3.5 h-3.5 text-primary" />}
                            </Button>
                          </div>
                        </TableCell>
                      </TableRow>
                    );
                  })}
                  {sellers.length === 0 && (
                    <TableRow><TableCell colSpan={10} className="text-center text-muted-foreground py-8">No hay miembros registrados</TableCell></TableRow>
                  )}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="ranking">
          <div className="space-y-3">
            {ranking.map((s, i) => (
              <Card key={s.id} className={i === 0 ? 'border-primary/30 bg-primary/5' : ''}>
                <CardContent className="p-4 flex items-center gap-4">
                  <div className="flex items-center justify-center w-10 h-10 rounded-full bg-muted text-foreground font-bold text-lg shrink-0">
                    {i === 0 ? '🥇' : i === 1 ? '🥈' : i === 2 ? '🥉' : `#${i + 1}`}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="font-semibold text-foreground text-sm">{s.name}</p>
                    <p className="text-xs text-muted-foreground">{s.zone || 'Sin zona'}</p>
                  </div>
                  <div className="flex items-center gap-4 text-center">
                    <div><p className="text-lg font-bold text-foreground">{s.stats.pagando}</p><p className="text-[10px] text-muted-foreground">cierres</p></div>
                    <div><p className="text-lg font-bold text-foreground">{s.stats.total}</p><p className="text-[10px] text-muted-foreground">leads</p></div>
                    <div><p className="text-lg font-bold text-primary">{s.stats.conversion}%</p><p className="text-[10px] text-muted-foreground">conv.</p></div>
                  </div>
                </CardContent>
              </Card>
            ))}
            {ranking.length === 0 && <p className="text-center text-muted-foreground py-8">No hay vendedores activos</p>}
          </div>
        </TabsContent>

        <TabsContent value="invites">
          <div className="space-y-3">
            {invitations.map(inv => (
              <Card key={inv.id}>
                <CardContent className="p-3 flex items-center justify-between gap-2">
                  <div className="min-w-0">
                    <div className="flex items-center gap-2">
                      <Badge variant="outline" className="text-xs capitalize">{inv.role.replace('_', ' ')}</Badge>
                      {inv.zone && <Badge variant="secondary" className="text-xs">{inv.zone}</Badge>}
                      {inv.used_at ? <Badge className="bg-muted text-muted-foreground text-[10px]">Usada</Badge> : <Badge className="bg-primary/10 text-primary text-[10px]">Activa</Badge>}
                    </div>
                    <p className="text-[10px] text-muted-foreground mt-1 truncate font-mono">{inv.token}</p>
                  </div>
                  {!inv.used_at && (
                    <Button variant="outline" size="sm" onClick={() => copyInviteLink(inv.token)} className="gap-1 shrink-0">
                      <Copy className="w-3 h-3" />Copiar
                    </Button>
                  )}
                </CardContent>
              </Card>
            ))}
            {invitations.length === 0 && <p className="text-center text-muted-foreground py-8">No hay invitaciones</p>}
          </div>
        </TabsContent>
      </Tabs>

      {/* Edit/Create Dialog */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent>
          <DialogHeader><DialogTitle>{editing ? 'Editar miembro' : 'Nuevo miembro'}</DialogTitle></DialogHeader>
          <div className="space-y-3">
            <Input placeholder="Nombre completo" value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} />
            <Input placeholder="Email" type="email" value={form.email} onChange={e => setForm(f => ({ ...f, email: e.target.value }))} />
            <Input placeholder="Teléfono" value={form.phone} onChange={e => setForm(f => ({ ...f, phone: e.target.value }))} />
            <Select value={form.role} onValueChange={v => setForm(f => ({ ...f, role: v }))}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>{ROLES.map(r => <SelectItem key={r.value} value={r.value}>{r.label}</SelectItem>)}</SelectContent>
            </Select>
            <Select value={form.zone} onValueChange={v => setForm(f => ({ ...f, zone: v }))}>
              <SelectTrigger><SelectValue placeholder="Zona" /></SelectTrigger>
              <SelectContent>{ZONES.map(z => <SelectItem key={z} value={z}>{z}</SelectItem>)}</SelectContent>
            </Select>
            <Button onClick={handleSave} className="w-full">{editing ? 'Guardar cambios' : 'Crear miembro'}</Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Invite Dialog */}
      <Dialog open={inviteOpen} onOpenChange={setInviteOpen}>
        <DialogContent>
          <DialogHeader><DialogTitle>Crear invitación</DialogTitle></DialogHeader>
          <p className="text-sm text-muted-foreground">Genera un link de invitación que el vendedor usará para registrarse con su propio email y contraseña.</p>
          <div className="space-y-3">
            <Select value={inviteForm.role} onValueChange={v => setInviteForm(f => ({ ...f, role: v }))}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>{ROLES.map(r => <SelectItem key={r.value} value={r.value}>{r.label}</SelectItem>)}</SelectContent>
            </Select>
            <Select value={inviteForm.zone} onValueChange={v => setInviteForm(f => ({ ...f, zone: v }))}>
              <SelectTrigger><SelectValue placeholder="Zona (opcional)" /></SelectTrigger>
              <SelectContent>{ZONES.map(z => <SelectItem key={z} value={z}>{z}</SelectItem>)}</SelectContent>
            </Select>
            <Button onClick={createInvitation} className="w-full">Generar invitación</Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Goal Dialog */}
      <Dialog open={goalOpen} onOpenChange={setGoalOpen}>
        <DialogContent>
          <DialogHeader><DialogTitle>Meta mensual — {goalSeller?.name}</DialogTitle></DialogHeader>
          <p className="text-xs text-muted-foreground">Período: {currentPeriod}</p>
          <div className="space-y-3">
            <div className="grid grid-cols-2 gap-2">
              <div><label className="text-xs text-muted-foreground">Visitas</label><Input type="number" value={goalForm.visits_goal} onChange={e => setGoalForm(f => ({ ...f, visits_goal: Number(e.target.value) }))} /></div>
              <div><label className="text-xs text-muted-foreground">Demos</label><Input type="number" value={goalForm.demos_goal} onChange={e => setGoalForm(f => ({ ...f, demos_goal: Number(e.target.value) }))} /></div>
              <div><label className="text-xs text-muted-foreground">Pilotos</label><Input type="number" value={goalForm.pilots_goal} onChange={e => setGoalForm(f => ({ ...f, pilots_goal: Number(e.target.value) }))} /></div>
              <div><label className="text-xs text-muted-foreground">Cierres</label><Input type="number" value={goalForm.closes_goal} onChange={e => setGoalForm(f => ({ ...f, closes_goal: Number(e.target.value) }))} /></div>
            </div>
            <div><label className="text-xs text-muted-foreground">Comisión por cierre (USD)</label><Input type="number" value={goalForm.commission_per_close} onChange={e => setGoalForm(f => ({ ...f, commission_per_close: Number(e.target.value) }))} /></div>
            <Button onClick={saveGoal} className="w-full">Guardar meta</Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
