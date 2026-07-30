import { useEffect, useState, useMemo } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useSuperAdmin } from '@/contexts/SuperAdminContext';
import { useNavigate } from 'react-router-dom';
import { useToast } from '@/hooks/use-toast';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Switch } from '@/components/ui/switch';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Sheet, SheetContent, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from '@/components/ui/dialog';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from '@/components/ui/alert-dialog';
import { Loader2, Plus, Eye, UserCheck, ChevronRight, ChevronLeft, Check, Trash2, Download, Search, Filter } from 'lucide-react';
import { exportToCSV } from '@/lib/export-utils';

interface TenantRow {
  id: string;
  name: string;
  slug: string;
  is_active: boolean | null;
  created_at: string | null;
  email: string;
  phone: string | null;
  plan_status: string | null;
  tablesCount: number;
  ordersToday: number;
  ordersWeek: number;
  lastOrderDate: string | null;
  health: 'healthy' | 'at_risk' | 'critical';
  zone: string | null;
}

interface TenantDetail {
  branches: { id: string; name: string; is_open: boolean | null }[];
  totalOrders: number;
  lastOrder: string | null;
}

const HEALTH_CONFIG = {
  healthy: { emoji: '🟢', label: 'Saludable', color: 'text-emerald-600' },
  at_risk: { emoji: '🟡', label: 'En riesgo', color: 'text-amber-500' },
  critical: { emoji: '🔴', label: 'Crítico', color: 'text-destructive' },
};

function computeHealth(ordersWeek: number, lastOrderDate: string | null): 'healthy' | 'at_risk' | 'critical' {
  if (!lastOrderDate) return 'critical';
  const daysSince = Math.floor((Date.now() - new Date(lastOrderDate).getTime()) / 86400000);
  if (daysSince > 14 || ordersWeek === 0) return 'critical';
  if (daysSince > 7 || ordersWeek < 3) return 'at_risk';
  return 'healthy';
}

export default function SATenantsPage() {
  const { setImpersonating } = useSuperAdmin();
  const navigate = useNavigate();
  const { toast } = useToast();
  const [tenants, setTenants] = useState<TenantRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedTenant, setSelectedTenant] = useState<TenantRow | null>(null);
  const [detail, setDetail] = useState<TenantDetail | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [sheetOpen, setSheetOpen] = useState(false);

  // Filters
  const [searchQuery, setSearchQuery] = useState('');
  const [filterHealth, setFilterHealth] = useState<string>('all');
  const [filterStatus, setFilterStatus] = useState<string>('all');

  // Delete state
  const [deleteTarget, setDeleteTarget] = useState<TenantRow | null>(null);
  const [deleting, setDeleting] = useState(false);

  // Wizard state
  const [createOpen, setCreateOpen] = useState(false);
  const [wizardStep, setWizardStep] = useState(1);
  const [creating, setCreating] = useState(false);
  const [wizardError, setWizardError] = useState('');
  const [newName, setNewName] = useState('');
  const [newSlug, setNewSlug] = useState('');
  const [newPhone, setNewPhone] = useState('');
  const [newColor, setNewColor] = useState('#E8531D');
  const [newEmail, setNewEmail] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [newPasswordConfirm, setNewPasswordConfirm] = useState('');

  const resetWizard = () => {
    setWizardStep(1); setNewName(''); setNewSlug(''); setNewPhone(''); setNewColor('#E8531D');
    setNewEmail(''); setNewPassword(''); setNewPasswordConfirm(''); setWizardError('');
  };

  const fetchTenants = async () => {
    const weekAgo = new Date(); weekAgo.setDate(weekAgo.getDate() - 7);

    const { data: tenantsData } = await supabase
      .from('tenants')
      .select('id, name, slug, is_active, created_at, email, phone, plan_status')
      .order('created_at', { ascending: false });

    if (!tenantsData) { setLoading(false); return; }

    const enriched = await Promise.all(tenantsData.map(async (t) => {
      const [tablesRes, ordersTodayRes, ordersWeekRes, lastOrderRes] = await Promise.all([
        supabase.from('tables').select('id', { count: 'exact', head: true }).eq('tenant_id', t.id),
        supabase.from('orders').select('id', { count: 'exact', head: true }).eq('tenant_id', t.id).gte('confirmed_at', new Date().toISOString().split('T')[0]),
        supabase.from('orders').select('id', { count: 'exact', head: true }).eq('tenant_id', t.id).gte('confirmed_at', weekAgo.toISOString()),
        supabase.from('orders').select('confirmed_at').eq('tenant_id', t.id).order('confirmed_at', { ascending: false }).limit(1),
      ]);
      const lastOrderDate = lastOrderRes.data?.[0]?.confirmed_at ?? null;
      const ordersWeek = ordersWeekRes.count ?? 0;
      return {
        ...t,
        tablesCount: tablesRes.count ?? 0,
        ordersToday: ordersTodayRes.count ?? 0,
        ordersWeek,
        lastOrderDate,
        health: computeHealth(ordersWeek, lastOrderDate),
        zone: null, // Could be enriched from branches
      };
    }));

    setTenants(enriched);
    setLoading(false);
  };

  useEffect(() => { fetchTenants(); }, []);

  const filteredTenants = useMemo(() => {
    return tenants.filter(t => {
      if (searchQuery && !t.name.toLowerCase().includes(searchQuery.toLowerCase()) && !t.slug.toLowerCase().includes(searchQuery.toLowerCase())) return false;
      if (filterHealth !== 'all' && t.health !== filterHealth) return false;
      if (filterStatus === 'active' && !t.is_active) return false;
      if (filterStatus === 'inactive' && t.is_active) return false;
      if (filterStatus === 'trial' && t.plan_status !== 'trial') return false;
      if (filterStatus === 'paying' && t.plan_status !== 'active') return false;
      return true;
    });
  }, [tenants, searchQuery, filterHealth, filterStatus]);

  const handleExportCSV = () => {
    exportToCSV(filteredTenants.map(t => ({
      Nombre: t.name, Slug: t.slug, Email: t.email, Teléfono: t.phone || '',
      Estado: t.is_active ? 'Activo' : 'Inactivo', Plan: t.plan_status || 'trial',
      Salud: HEALTH_CONFIG[t.health].label, Mesas: t.tablesCount, 'Pedidos hoy': t.ordersToday,
      'Pedidos semana': t.ordersWeek, 'Último pedido': t.lastOrderDate ? new Date(t.lastOrderDate).toLocaleDateString('es-CL') : '-',
      Creado: t.created_at ? new Date(t.created_at).toLocaleDateString('es-CL') : '-',
    })), 'clientes-tablio');
    toast({ title: 'CSV exportado' });
  };

  const toggleActive = async (tenant: TenantRow) => {
    await supabase.from('tenants').update({ is_active: !tenant.is_active }).eq('id', tenant.id);
    setTenants(prev => prev.map(t => t.id === tenant.id ? { ...t, is_active: !t.is_active } : t));
    toast({ title: `${tenant.name} ${!tenant.is_active ? 'activado' : 'desactivado'}` });
  };

  const openDetail = async (tenant: TenantRow) => {
    setSelectedTenant(tenant); setSheetOpen(true); setDetailLoading(true);
    const [branchesRes, ordersRes, lastRes] = await Promise.all([
      supabase.from('branches').select('id, name, is_open').eq('tenant_id', tenant.id),
      supabase.from('orders').select('id', { count: 'exact', head: true }).eq('tenant_id', tenant.id),
      supabase.from('orders').select('confirmed_at').eq('tenant_id', tenant.id).order('confirmed_at', { ascending: false }).limit(1),
    ]);
    setDetail({ branches: branchesRes.data ?? [], totalOrders: ordersRes.count ?? 0, lastOrder: lastRes.data?.[0]?.confirmed_at ?? null });
    setDetailLoading(false);
  };

  const impersonate = async (tenantId: string) => {
    const { data: t } = await supabase.from('tenants').select('slug').eq('id', tenantId).single();
    setImpersonating(tenantId);
    sessionStorage.setItem('superadmin_impersonating_slug', t?.slug ?? '');
    navigate(`/admin/${t?.slug ?? ''}/mesas`);
  };

  const deleteTenant = async (tenant: TenantRow) => {
    setDeleting(true);
    try {
      const tenantId = tenant.id;
      const { data: menuItems } = await supabase.from('menu_items').select('id').eq('tenant_id', tenantId);
      if (menuItems?.length) {
        const itemIds = menuItems.map(i => i.id);
        const { data: groups } = await supabase.from('modifier_groups').select('id').in('menu_item_id', itemIds);
        if (groups?.length) {
          await supabase.from('modifiers').delete().in('group_id', groups.map(g => g.id));
          await supabase.from('modifier_groups').delete().in('id', groups.map(g => g.id));
        }
        await supabase.from('menu_items').delete().eq('tenant_id', tenantId);
      }
      await supabase.from('categories').delete().eq('tenant_id', tenantId);
      await supabase.from('menus').delete().eq('tenant_id', tenantId);
      const { data: orders } = await supabase.from('orders').select('id').eq('tenant_id', tenantId);
      if (orders?.length) {
        await supabase.from('order_items').delete().in('order_id', orders.map(o => o.id));
        await supabase.from('orders').delete().eq('tenant_id', tenantId);
      }
      await Promise.all([
        supabase.from('bill_requests').delete().eq('tenant_id', tenantId),
        supabase.from('waiter_calls').delete().eq('tenant_id', tenantId),
        supabase.from('table_sessions').delete().eq('tenant_id', tenantId),
        supabase.from('staff_invitations').delete().eq('tenant_id', tenantId),
        supabase.from('audit_logs').delete().eq('tenant_id', tenantId),
        supabase.from('tenant_feature_flags').delete().eq('tenant_id', tenantId),
        supabase.from('staff_users').delete().eq('tenant_id', tenantId),
      ]);
      await supabase.from('tables').delete().eq('tenant_id', tenantId);
      await supabase.from('branches').delete().eq('tenant_id', tenantId);
      await supabase.from('restaurants').delete().eq('tenant_id', tenantId);
      await supabase.from('tenant_members').delete().eq('tenant_id', tenantId);
      await supabase.from('tenants').delete().eq('id', tenantId);
      toast({ title: `${tenant.name} eliminado` });
      setTenants(prev => prev.filter(t => t.id !== tenantId));
    } catch (e: any) {
      toast({ title: 'Error eliminando', description: e?.message, variant: 'destructive' });
    } finally { setDeleting(false); setDeleteTarget(null); }
  };

  const validateStep1 = (): boolean => {
    if (!newName.trim()) { setWizardError('Nombre obligatorio'); return false; }
    if (!newSlug.trim() || newSlug.trim().length < 3) { setWizardError('Slug inválido (min 3 chars)'); return false; }
    setWizardError(''); return true;
  };
  const validateStep2 = (): boolean => {
    if (!newEmail.trim() || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(newEmail)) { setWizardError('Email inválido'); return false; }
    if (newPassword.length < 6) { setWizardError('Contraseña min 6 chars'); return false; }
    if (newPassword !== newPasswordConfirm) { setWizardError('Las contraseñas no coinciden'); return false; }
    setWizardError(''); return true;
  };
  const goToStep2 = async () => {
    if (!validateStep1()) return;
    const { data: existing } = await supabase.from('tenants').select('id').eq('slug', newSlug.toLowerCase().trim()).maybeSingle();
    if (existing) { setWizardError('Slug ya en uso'); return; }
    setWizardStep(2);
  };
  const createTenant = async () => {
    if (!validateStep2()) return;
    setCreating(true); setWizardError('');
    try {
      const { data: fnData, error: fnError } = await supabase.functions.invoke('create-tenant-user', {
        body: { email: newEmail.trim(), password: newPassword },
      });
      if (fnError || fnData?.error) { setWizardError(fnData?.error || fnError?.message || 'Error'); setCreating(false); return; }
      const userId = fnData.user_id;
      const { data: tenant, error: tErr } = await supabase.from('tenants').insert({
        name: newName.trim(), slug: newSlug.toLowerCase().trim(), email: newEmail.trim(),
        phone: newPhone.trim() || null, primary_color: newColor, is_active: true,
      }).select('id').single();
      if (tErr || !tenant) throw tErr;
      const { data: restaurant } = await supabase.from('restaurants').insert({ name: newName.trim(), tenant_id: tenant.id }).select('id').single();
      if (!restaurant) throw new Error('Error creando restaurante');
      const { data: branch } = await supabase.from('branches').insert({ name: 'Principal', restaurant_id: restaurant.id, tenant_id: tenant.id }).select('id').single();
      if (!branch) throw new Error('Error creando sucursal');
      await Promise.all([
        supabase.from('menus').insert({ name: 'Menú Principal', branch_id: branch.id, tenant_id: tenant.id, is_active: true }),
        supabase.from('tenant_members').insert({ user_id: userId, tenant_id: tenant.id, branch_id: branch.id, role: 'owner', is_active: true }),
      ]);
      toast({ title: 'Restaurante creado', description: `${newName.trim()} listo` });
      setCreateOpen(false); resetWizard(); fetchTenants();
    } catch (e: any) { setWizardError(e?.message ?? 'Error'); } finally { setCreating(false); }
  };

  if (loading) return <div className="flex items-center justify-center h-64"><Loader2 className="w-6 h-6 animate-spin text-muted-foreground" /></div>;

  const healthCounts = { healthy: tenants.filter(t => t.health === 'healthy').length, at_risk: tenants.filter(t => t.health === 'at_risk').length, critical: tenants.filter(t => t.health === 'critical').length };

  return (
    <div className="p-6">
      <div className="flex items-center justify-between mb-4">
        <h1 className="text-xl font-bold text-foreground">Clientes</h1>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" onClick={handleExportCSV}><Download className="w-4 h-4 mr-1" />CSV</Button>
          <Button onClick={() => { resetWizard(); setCreateOpen(true); }} size="sm"><Plus className="w-4 h-4 mr-1" />Nuevo</Button>
        </div>
      </div>

      {/* Health summary */}
      <div className="flex gap-3 mb-4">
        {Object.entries(HEALTH_CONFIG).map(([k, v]) => (
          <button key={k} onClick={() => setFilterHealth(filterHealth === k ? 'all' : k)}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm border transition-colors ${filterHealth === k ? 'border-primary bg-primary/10' : 'border-border bg-card'}`}>
            <span>{v.emoji}</span>
            <span className="font-medium">{healthCounts[k as keyof typeof healthCounts]}</span>
            <span className="text-muted-foreground text-xs hidden sm:inline">{v.label}</span>
          </button>
        ))}
      </div>

      {/* Filters */}
      <div className="flex items-center gap-3 mb-4">
        <div className="relative flex-1 max-w-xs">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <Input placeholder="Buscar cliente..." value={searchQuery} onChange={e => setSearchQuery(e.target.value)} className="pl-9" />
        </div>
        <Select value={filterStatus} onValueChange={setFilterStatus}>
          <SelectTrigger className="w-36"><SelectValue placeholder="Estado" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Todos</SelectItem>
            <SelectItem value="active">Activos</SelectItem>
            <SelectItem value="inactive">Inactivos</SelectItem>
            <SelectItem value="trial">En prueba</SelectItem>
            <SelectItem value="paying">Pagando</SelectItem>
          </SelectContent>
        </Select>
      </div>

      <div className="border border-border rounded-lg overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-muted/50">
              <tr>
                <th className="text-left px-4 py-3 font-medium text-muted-foreground">Salud</th>
                <th className="text-left px-4 py-3 font-medium text-muted-foreground">Nombre</th>
                <th className="text-left px-4 py-3 font-medium text-muted-foreground">Plan</th>
                <th className="text-left px-4 py-3 font-medium text-muted-foreground">Activo</th>
                <th className="text-right px-4 py-3 font-medium text-muted-foreground">Mesas</th>
                <th className="text-right px-4 py-3 font-medium text-muted-foreground">Hoy</th>
                <th className="text-right px-4 py-3 font-medium text-muted-foreground">Semana</th>
                <th className="text-left px-4 py-3 font-medium text-muted-foreground">Inicio</th>
                <th className="text-right px-4 py-3 font-medium text-muted-foreground">Acciones</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {filteredTenants.map(t => (
                <tr key={t.id} className="hover:bg-muted/30 transition-colors">
                  <td className="px-4 py-3">
                    <span title={HEALTH_CONFIG[t.health].label}>{HEALTH_CONFIG[t.health].emoji}</span>
                  </td>
                  <td className="px-4 py-3">
                    <p className="font-medium text-foreground">{t.name}</p>
                    <p className="text-xs text-muted-foreground font-mono">/{t.slug}</p>
                  </td>
                  <td className="px-4 py-3">
                    <Badge variant={t.plan_status === 'active' ? 'default' : 'secondary'} className="text-[10px]">
                      {t.plan_status === 'active' ? 'Pagando' : t.plan_status === 'trial' ? 'Trial' : t.plan_status || 'trial'}
                    </Badge>
                  </td>
                  <td className="px-4 py-3"><Switch checked={!!t.is_active} onCheckedChange={() => toggleActive(t)} /></td>
                  <td className="px-4 py-3 text-right">{t.tablesCount}</td>
                  <td className="px-4 py-3 text-right font-semibold">{t.ordersToday}</td>
                  <td className="px-4 py-3 text-right">{t.ordersWeek}</td>
                  <td className="px-4 py-3 text-muted-foreground text-xs">
                    {t.created_at ? new Date(t.created_at).toLocaleDateString('es-CL') : '-'}
                  </td>
                  <td className="px-4 py-3 text-right">
                    <div className="flex items-center justify-end gap-1">
                      <Button variant="ghost" size="icon" onClick={() => openDetail(t)} title="Ver detalle"><Eye className="w-4 h-4" /></Button>
                      <Button variant="ghost" size="icon" onClick={() => impersonate(t.id)} title="Impersonar"><UserCheck className="w-4 h-4" /></Button>
                      <Button variant="ghost" size="icon" onClick={() => setDeleteTarget(t)} title="Eliminar" className="text-destructive hover:text-destructive"><Trash2 className="w-4 h-4" /></Button>
                    </div>
                  </td>
                </tr>
              ))}
              {filteredTenants.length === 0 && (
                <tr><td colSpan={9} className="px-4 py-8 text-center text-muted-foreground">Sin resultados</td></tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Detail sheet */}
      <Sheet open={sheetOpen} onOpenChange={setSheetOpen}>
        <SheetContent>
          <SheetHeader><SheetTitle>{selectedTenant?.name}</SheetTitle></SheetHeader>
          {detailLoading ? (
            <div className="flex justify-center py-12"><Loader2 className="w-5 h-5 animate-spin" /></div>
          ) : selectedTenant && detail ? (
            <div className="mt-4 space-y-4">
              <div className="space-y-2 text-sm">
                <p><span className="text-muted-foreground">Slug:</span> <span className="font-mono">/{selectedTenant.slug}</span></p>
                <p><span className="text-muted-foreground">Email:</span> {selectedTenant.email}</p>
                <p><span className="text-muted-foreground">Teléfono:</span> {selectedTenant.phone ?? '-'}</p>
                <p><span className="text-muted-foreground">Plan:</span> <Badge variant="outline" className="text-xs ml-1">{selectedTenant.plan_status || 'trial'}</Badge></p>
                <p><span className="text-muted-foreground">Salud:</span> {HEALTH_CONFIG[selectedTenant.health].emoji} {HEALTH_CONFIG[selectedTenant.health].label}</p>
              </div>
              <div>
                <h4 className="text-sm font-semibold mb-2">Sucursales</h4>
                {detail.branches.map(b => (
                  <div key={b.id} className="flex items-center justify-between py-1.5 text-sm">
                    <span>{b.name}</span>
                    <Badge variant={b.is_open ? 'default' : 'secondary'} className="text-[10px]">{b.is_open ? 'Abierta' : 'Cerrada'}</Badge>
                  </div>
                ))}
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div className="bg-muted/50 rounded-lg p-3 text-center">
                  <p className="text-2xl font-bold text-foreground">{detail.totalOrders}</p>
                  <p className="text-xs text-muted-foreground">Pedidos totales</p>
                </div>
                <div className="bg-muted/50 rounded-lg p-3 text-center">
                  <p className="text-sm font-medium text-foreground">{detail.lastOrder ? new Date(detail.lastOrder).toLocaleDateString('es-CL') : '-'}</p>
                  <p className="text-xs text-muted-foreground">Último pedido</p>
                </div>
              </div>
            </div>
          ) : null}
        </SheetContent>
      </Sheet>

      {/* Create wizard */}
      <Dialog open={createOpen} onOpenChange={(open) => { setCreateOpen(open); if (!open) resetWizard(); }}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader><DialogTitle>Nuevo restaurante — Paso {wizardStep} de 2</DialogTitle></DialogHeader>
          <div className="flex items-center gap-2 mb-2">
            <div className={`flex items-center justify-center w-7 h-7 rounded-full text-xs font-bold ${wizardStep >= 1 ? 'bg-primary text-primary-foreground' : 'bg-muted text-muted-foreground'}`}>
              {wizardStep > 1 ? <Check className="w-4 h-4" /> : '1'}
            </div>
            <div className="flex-1 h-0.5 bg-border"><div className={`h-full transition-all ${wizardStep >= 2 ? 'bg-primary w-full' : 'w-0'}`} /></div>
            <div className={`flex items-center justify-center w-7 h-7 rounded-full text-xs font-bold ${wizardStep >= 2 ? 'bg-primary text-primary-foreground' : 'bg-muted text-muted-foreground'}`}>2</div>
          </div>
          {wizardStep === 1 && (
            <div className="space-y-4 py-2">
              <div><Label>Nombre *</Label><Input value={newName} onChange={e => { setNewName(e.target.value); if (!newSlug || newSlug === newName.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '')) setNewSlug(e.target.value.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '')); }} placeholder="La Parrilla de Juan" /></div>
              <div><Label>Slug *</Label><Input value={newSlug} onChange={e => setNewSlug(e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, ''))} /><p className="text-xs text-muted-foreground mt-1">tablio.cl/{newSlug || '...'}</p></div>
              <div><Label>Teléfono</Label><Input value={newPhone} onChange={e => setNewPhone(e.target.value)} placeholder="+56 9 1234 5678" /></div>
              <div><Label>Color</Label><div className="flex items-center gap-3"><input type="color" value={newColor} onChange={e => setNewColor(e.target.value)} className="w-10 h-10 rounded cursor-pointer border border-border" /><Input value={newColor} onChange={e => setNewColor(e.target.value)} className="font-mono text-sm w-28" maxLength={7} /></div></div>
            </div>
          )}
          {wizardStep === 2 && (
            <div className="space-y-4 py-2">
              <div className="bg-muted/50 rounded-lg p-3 text-sm"><p className="font-medium text-foreground">{newName}</p><p className="text-muted-foreground text-xs">/{newSlug}</p></div>
              <div><Label>Email admin *</Label><Input type="email" value={newEmail} onChange={e => setNewEmail(e.target.value)} placeholder="admin@restaurante.cl" /></div>
              <div><Label>Contraseña *</Label><Input type="password" value={newPassword} onChange={e => setNewPassword(e.target.value)} placeholder="Min 6 chars" /></div>
              <div><Label>Confirmar contraseña *</Label><Input type="password" value={newPasswordConfirm} onChange={e => setNewPasswordConfirm(e.target.value)} /></div>
            </div>
          )}
          {wizardError && <p className="text-sm text-destructive">{wizardError}</p>}
          <DialogFooter className="flex gap-2 sm:gap-0">
            {wizardStep === 1 ? (
              <><Button variant="outline" onClick={() => setCreateOpen(false)}>Cancelar</Button><Button onClick={goToStep2}>Siguiente <ChevronRight className="w-4 h-4 ml-1" /></Button></>
            ) : (
              <><Button variant="outline" onClick={() => { setWizardStep(1); setWizardError(''); }}><ChevronLeft className="w-4 h-4 mr-1" />Atrás</Button><Button onClick={createTenant} disabled={creating}>{creating ? <Loader2 className="w-4 h-4 animate-spin mr-1" /> : null}Crear</Button></>
            )}
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete confirmation */}
      <AlertDialog open={!!deleteTarget} onOpenChange={(open) => { if (!open) setDeleteTarget(null); }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>¿Eliminar {deleteTarget?.name}?</AlertDialogTitle>
            <AlertDialogDescription>Se eliminarán todos los datos asociados. Acción irreversible.</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={deleting}>Cancelar</AlertDialogCancel>
            <AlertDialogAction onClick={() => deleteTarget && deleteTenant(deleteTarget)} disabled={deleting} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">
              {deleting ? <Loader2 className="w-4 h-4 animate-spin mr-1" /> : null}Eliminar
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
