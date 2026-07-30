import { useState, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import { Switch } from '@/components/ui/switch';
import { Loader2, AlertTriangle, Copy, UserPlus, MapPin, Target, DollarSign, Bell, Plus, Trash2, Save } from 'lucide-react';

// ─── Zones Config ───
function ZonesSection() {
  const { toast } = useToast();
  const [zones, setZones] = useState<string[]>(() => {
    const saved = localStorage.getItem('tablio_zones');
    return saved ? JSON.parse(saved) : ['Barrio Italia', 'Ñuñoa', 'Lastarria', 'Providencia', 'Las Condes', 'Vitacura', 'Santiago Centro'];
  });
  const [newZone, setNewZone] = useState('');

  const save = (z: string[]) => { setZones(z); localStorage.setItem('tablio_zones', JSON.stringify(z)); };
  const add = () => { if (newZone.trim() && !zones.includes(newZone.trim())) { save([...zones, newZone.trim()]); setNewZone(''); toast({ title: 'Zona agregada' }); } };
  const remove = (z: string) => { save(zones.filter(x => x !== z)); toast({ title: 'Zona eliminada' }); };

  return (
    <Card>
      <CardHeader><CardTitle className="text-base flex items-center gap-2"><MapPin className="w-4 h-4" />Zonas y territorios</CardTitle></CardHeader>
      <CardContent className="space-y-3">
        <div className="flex flex-wrap gap-2">
          {zones.map(z => (
            <Badge key={z} variant="outline" className="gap-1">
              {z}
              <button onClick={() => remove(z)} className="ml-1 hover:text-destructive"><Trash2 className="w-3 h-3" /></button>
            </Badge>
          ))}
        </div>
        <div className="flex gap-2">
          <Input value={newZone} onChange={e => setNewZone(e.target.value)} placeholder="Nueva zona" className="max-w-xs" onKeyDown={e => e.key === 'Enter' && add()} />
          <Button size="sm" variant="outline" onClick={add}><Plus className="w-4 h-4" /></Button>
        </div>
      </CardContent>
    </Card>
  );
}

// ─── Goals Config ───
function GoalsSection() {
  const { toast } = useToast();
  const [sellers, setSellers] = useState<{ id: string; name: string }[]>([]);
  const [selectedSeller, setSelectedSeller] = useState('');
  const [period, setPeriod] = useState(() => new Date().toISOString().slice(0, 7));
  const [visits, setVisits] = useState(30);
  const [demos, setDemos] = useState(10);
  const [pilots, setPilots] = useState(5);
  const [closes, setCloses] = useState(3);
  const [commission, setCommission] = useState(50);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    supabase.from('backoffice_members').select('id, name').eq('role', 'vendedor').then(({ data }) => setSellers(data ?? []));
  }, []);

  const save = async () => {
    if (!selectedSeller) return;
    setSaving(true);
    const { error } = await supabase.from('seller_goals').upsert({
      seller_id: selectedSeller, period,
      visits_goal: visits, demos_goal: demos, pilots_goal: pilots, closes_goal: closes, commission_per_close: commission,
    }, { onConflict: 'seller_id,period' });
    if (error) toast({ title: 'Error', description: error.message, variant: 'destructive' });
    else toast({ title: 'Metas guardadas' });
    setSaving(false);
  };

  return (
    <Card>
      <CardHeader><CardTitle className="text-base flex items-center gap-2"><Target className="w-4 h-4" />Metas por período</CardTitle></CardHeader>
      <CardContent className="space-y-4">
        <div className="grid grid-cols-2 gap-4">
          <div>
            <Label>Vendedor</Label>
            <Select value={selectedSeller} onValueChange={setSelectedSeller}>
              <SelectTrigger><SelectValue placeholder="Seleccionar..." /></SelectTrigger>
              <SelectContent>{sellers.map(s => <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>)}</SelectContent>
            </Select>
          </div>
          <div><Label>Período</Label><Input type="month" value={period} onChange={e => setPeriod(e.target.value)} /></div>
        </div>
        <div className="grid grid-cols-5 gap-3">
          <div><Label className="text-xs">Visitas</Label><Input type="number" value={visits} onChange={e => setVisits(+e.target.value)} /></div>
          <div><Label className="text-xs">Demos</Label><Input type="number" value={demos} onChange={e => setDemos(+e.target.value)} /></div>
          <div><Label className="text-xs">Pilotos</Label><Input type="number" value={pilots} onChange={e => setPilots(+e.target.value)} /></div>
          <div><Label className="text-xs">Cierres</Label><Input type="number" value={closes} onChange={e => setCloses(+e.target.value)} /></div>
          <div><Label className="text-xs">Comisión $</Label><Input type="number" value={commission} onChange={e => setCommission(+e.target.value)} /></div>
        </div>
        <Button onClick={save} disabled={saving || !selectedSeller} size="sm">
          {saving && <Loader2 className="w-4 h-4 animate-spin mr-1" />}<Save className="w-4 h-4 mr-1" />Guardar metas
        </Button>
      </CardContent>
    </Card>
  );
}

// ─── Commissions Config ───
function CommissionsSection() {
  const { toast } = useToast();
  const [base, setBase] = useState(() => Number(localStorage.getItem('tablio_commission_base') || '50'));
  const [bonus, setBonus] = useState(() => Number(localStorage.getItem('tablio_commission_bonus') || '25'));
  const [threshold, setThreshold] = useState(() => Number(localStorage.getItem('tablio_commission_threshold') || '5'));

  const save = () => {
    localStorage.setItem('tablio_commission_base', String(base));
    localStorage.setItem('tablio_commission_bonus', String(bonus));
    localStorage.setItem('tablio_commission_threshold', String(threshold));
    toast({ title: 'Estructura de comisiones guardada' });
  };

  return (
    <Card>
      <CardHeader><CardTitle className="text-base flex items-center gap-2"><DollarSign className="w-4 h-4" />Estructura de comisiones</CardTitle></CardHeader>
      <CardContent className="space-y-4">
        <div className="grid grid-cols-3 gap-4">
          <div><Label>Comisión por cierre (USD)</Label><Input type="number" value={base} onChange={e => setBase(+e.target.value)} /></div>
          <div><Label>Bonus extra (USD)</Label><Input type="number" value={bonus} onChange={e => setBonus(+e.target.value)} /></div>
          <div><Label>Umbral bonus (cierres)</Label><Input type="number" value={threshold} onChange={e => setThreshold(+e.target.value)} /></div>
        </div>
        <p className="text-xs text-muted-foreground">Si un vendedor supera {threshold} cierres en el mes, recibe ${bonus} extra por cierre adicional.</p>
        <Button onClick={save} size="sm"><Save className="w-4 h-4 mr-1" />Guardar</Button>
      </CardContent>
    </Card>
  );
}

// ─── Alerts Config ───
function AlertsSection() {
  const { toast } = useToast();
  const [alerts, setAlerts] = useState(() => {
    const saved = localStorage.getItem('tablio_alerts');
    return saved ? JSON.parse(saved) : {
      stale_leads_days: 7,
      inactive_tenant_days: 14,
      onboarding_max_days: 7,
      email_daily_summary: true,
    };
  });

  const save = () => {
    localStorage.setItem('tablio_alerts', JSON.stringify(alerts));
    toast({ title: 'Alertas configuradas' });
  };

  return (
    <Card>
      <CardHeader><CardTitle className="text-base flex items-center gap-2"><Bell className="w-4 h-4" />Alertas automáticas</CardTitle></CardHeader>
      <CardContent className="space-y-4">
        <div className="grid grid-cols-2 gap-4">
          <div><Label>Lead estancado (días)</Label><Input type="number" value={alerts.stale_leads_days} onChange={e => setAlerts({ ...alerts, stale_leads_days: +e.target.value })} /></div>
          <div><Label>Tenant inactivo (días)</Label><Input type="number" value={alerts.inactive_tenant_days} onChange={e => setAlerts({ ...alerts, inactive_tenant_days: +e.target.value })} /></div>
          <div><Label>Onboarding máximo (días)</Label><Input type="number" value={alerts.onboarding_max_days} onChange={e => setAlerts({ ...alerts, onboarding_max_days: +e.target.value })} /></div>
          <div className="flex items-center gap-3 pt-6">
            <Switch checked={alerts.email_daily_summary} onCheckedChange={v => setAlerts({ ...alerts, email_daily_summary: v })} />
            <Label>Resumen diario por email</Label>
          </div>
        </div>
        <Button onClick={save} size="sm"><Save className="w-4 h-4 mr-1" />Guardar alertas</Button>
      </CardContent>
    </Card>
  );
}

// ─── Admin Access ───
function AdminAccessSection() {
  const { toast } = useToast();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [tenants, setTenants] = useState<{ id: string; name: string; slug: string }[]>([]);
  const [branches, setBranches] = useState<{ id: string; name: string }[]>([]);
  const [selectedTenant, setSelectedTenant] = useState('');
  const [selectedBranch, setSelectedBranch] = useState('');
  const [role, setRole] = useState('owner');
  const [creating, setCreating] = useState(false);
  const [sqlOutput, setSqlOutput] = useState('');

  useEffect(() => { supabase.from('tenants').select('id, name, slug').order('name').then(({ data }) => setTenants(data ?? [])); }, []);
  useEffect(() => {
    if (!selectedTenant) { setBranches([]); return; }
    supabase.from('branches').select('id, name').eq('tenant_id', selectedTenant).then(({ data }) => {
      setBranches(data ?? []); if (data?.[0]) setSelectedBranch(data[0].id);
    });
  }, [selectedTenant]);

  const handleCreate = async () => {
    if (!email || !password || !selectedTenant || !selectedBranch) return;
    setCreating(true); setSqlOutput('');
    const { data, error } = await supabase.auth.signUp({ email, password });
    if (error || !data.user) { toast({ title: 'Error', description: error?.message, variant: 'destructive' }); setCreating(false); return; }
    const { error: memberErr } = await supabase.from('tenant_members').insert({ user_id: data.user.id, tenant_id: selectedTenant, branch_id: selectedBranch, role, is_active: true });
    if (memberErr) {
      setSqlOutput(`INSERT INTO public.tenant_members (user_id, tenant_id, branch_id, role) SELECT '${data.user.id}', '${selectedTenant}', '${selectedBranch}', '${role}';`);
      toast({ title: 'Usuario creado, membership manual', variant: 'destructive' });
    } else {
      const tenant = tenants.find(t => t.id === selectedTenant);
      toast({ title: 'Acceso creado', description: `${email} → /admin/${tenant?.slug}` });
    }
    setCreating(false);
  };

  return (
    <Card>
      <CardHeader><CardTitle className="text-base flex items-center gap-2"><UserPlus className="w-4 h-4" />Crear acceso admin</CardTitle></CardHeader>
      <CardContent className="space-y-4">
        <div className="grid grid-cols-2 gap-4">
          <div><Label>Email</Label><Input type="email" value={email} onChange={e => setEmail(e.target.value)} placeholder="admin@restaurante.cl" /></div>
          <div><Label>Contraseña</Label><Input type="text" value={password} onChange={e => setPassword(e.target.value)} placeholder="min 6 chars" /></div>
        </div>
        <div className="grid grid-cols-3 gap-4">
          <div><Label>Tenant</Label><Select value={selectedTenant} onValueChange={setSelectedTenant}><SelectTrigger><SelectValue placeholder="Seleccionar..." /></SelectTrigger><SelectContent>{tenants.map(t => <SelectItem key={t.id} value={t.id}>{t.name}</SelectItem>)}</SelectContent></Select></div>
          <div><Label>Sucursal</Label><Select value={selectedBranch} onValueChange={setSelectedBranch}><SelectTrigger><SelectValue placeholder="Seleccionar..." /></SelectTrigger><SelectContent>{branches.map(b => <SelectItem key={b.id} value={b.id}>{b.name}</SelectItem>)}</SelectContent></Select></div>
          <div><Label>Rol</Label><Select value={role} onValueChange={setRole}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent><SelectItem value="owner">Owner</SelectItem><SelectItem value="manager">Manager</SelectItem></SelectContent></Select></div>
        </div>
        <Button onClick={handleCreate} disabled={creating || !email || !password || !selectedTenant || !selectedBranch}>
          {creating ? <Loader2 className="w-4 h-4 animate-spin mr-1" /> : null}Crear acceso
        </Button>
        {sqlOutput && (
          <div className="bg-muted rounded-lg p-3 mt-3">
            <div className="flex items-center justify-between mb-2">
              <p className="text-xs font-medium text-muted-foreground">SQL fallback:</p>
              <Button variant="ghost" size="sm" onClick={() => { navigator.clipboard.writeText(sqlOutput); toast({ title: 'Copiado' }); }}><Copy className="w-3 h-3 mr-1" />Copiar</Button>
            </div>
            <pre className="text-xs font-mono whitespace-pre-wrap">{sqlOutput}</pre>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

// ─── Main ───
export default function SAConfigPage() {
  const { toast } = useToast();
  const [platformName, setPlatformName] = useState('Tablio');
  const [baseUrl, setBaseUrl] = useState('tablio.cl');
  const [supportEmail, setSupportEmail] = useState('soporte@tablio.cl');
  const [creatingDemo, setCreatingDemo] = useState(false);

  const saveConfig = () => toast({ title: 'Configuración guardada' });

  const createDemo = async () => {
    setCreatingDemo(true);
    try {
      const { data: existing } = await supabase.from('tenants').select('id').eq('slug', 'demo-restaurant').maybeSingle();
      if (existing) { toast({ title: 'Ya existe', variant: 'destructive' }); setCreatingDemo(false); return; }
      const { data: tenant } = await supabase.from('tenants').insert({ name: 'Demo Restaurant', slug: 'demo-restaurant', email: 'demo@tablio.cl', is_active: true, welcome_message: '¡Bienvenido al Demo! 🍽' }).select('id').single();
      if (!tenant) throw new Error('Failed');
      const { data: restaurant } = await supabase.from('restaurants').insert({ name: 'Demo Restaurant', tenant_id: tenant.id }).select('id').single();
      if (!restaurant) throw new Error('Failed');
      const { data: branch } = await supabase.from('branches').insert({ name: 'Sede Principal', restaurant_id: restaurant.id, tenant_id: tenant.id }).select('id').single();
      if (!branch) throw new Error('Failed');
      const { data: menu } = await supabase.from('menus').insert({ name: 'Menú Principal', branch_id: branch.id, tenant_id: tenant.id, is_active: true }).select('id').single();
      if (!menu) throw new Error('Failed');
      const cats = [{ name: 'Entradas', emoji: '🥗', sort_order: 0 }, { name: 'Platos Fuertes', emoji: '🥩', sort_order: 1 }, { name: 'Bebidas', emoji: '🥤', sort_order: 2 }];
      for (const cat of cats) {
        const { data: category } = await supabase.from('categories').insert({ name: cat.name, emoji: cat.emoji, sort_order: cat.sort_order, menu_id: menu.id, tenant_id: tenant.id, is_visible: true }).select('id').single();
        if (!category) continue;
        const items = cat.sort_order === 0 ? [{ name: 'Empanadas', price: 3500 }, { name: 'Ensalada César', price: 5900 }] : cat.sort_order === 1 ? [{ name: 'Lomito', price: 8900 }, { name: 'Pasta alfredo', price: 7500 }] : [{ name: 'Coca-Cola', price: 1500 }, { name: 'Limonada', price: 2500 }];
        await supabase.from('menu_items').insert(items.map((it, i) => ({ name: it.name, price: it.price, category_id: category.id, tenant_id: tenant.id, sort_order: i, status: 'available' })));
      }
      toast({ title: 'Demo creado' });
    } catch (e: any) { toast({ title: 'Error', description: e?.message, variant: 'destructive' }); } finally { setCreatingDemo(false); }
  };

  return (
    <div className="p-6 space-y-6 max-w-3xl">
      <h1 className="text-xl font-bold text-foreground">Configuración</h1>

      <Card>
        <CardHeader><CardTitle className="text-base">Plataforma</CardTitle></CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-3 gap-4">
            <div><Label>Nombre</Label><Input value={platformName} onChange={e => setPlatformName(e.target.value)} /></div>
            <div><Label>URL base</Label><Input value={baseUrl} onChange={e => setBaseUrl(e.target.value)} /></div>
            <div><Label>Email soporte</Label><Input type="email" value={supportEmail} onChange={e => setSupportEmail(e.target.value)} /></div>
          </div>
          <Button onClick={saveConfig} size="sm">Guardar</Button>
        </CardContent>
      </Card>

      <ZonesSection />
      <GoalsSection />
      <CommissionsSection />
      <AlertsSection />
      <AdminAccessSection />

      <Card>
        <CardHeader><CardTitle className="text-base">Seed de prueba</CardTitle></CardHeader>
        <CardContent>
          <p className="text-sm text-muted-foreground mb-3">Crea un tenant demo con datos de ejemplo.</p>
          <Button variant="outline" onClick={createDemo} disabled={creatingDemo}>
            {creatingDemo ? <Loader2 className="w-4 h-4 animate-spin mr-1" /> : null}Crear tenant demo
          </Button>
        </CardContent>
      </Card>

      <Card className="border-destructive/30">
        <CardHeader><CardTitle className="text-base flex items-center gap-2 text-destructive"><AlertTriangle className="w-4 h-4" />Zona de peligro</CardTitle></CardHeader>
        <CardContent className="space-y-3">
          <Button variant="outline" disabled className="w-full justify-start text-muted-foreground">Limpiar sesiones antiguas — próximamente</Button>
          <Button variant="outline" disabled className="w-full justify-start text-muted-foreground">Exportar todos los pedidos CSV — próximamente</Button>
          <Button variant="outline" disabled className="w-full justify-start text-muted-foreground">Integraciones externas — próximamente</Button>
        </CardContent>
      </Card>
    </div>
  );
}
