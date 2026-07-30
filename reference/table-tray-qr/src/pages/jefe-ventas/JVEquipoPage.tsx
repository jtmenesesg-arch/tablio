import { useEffect, useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Switch } from '@/components/ui/switch';
import { Sheet, SheetContent, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { supabase } from '@/integrations/supabase/client';
import { Plus, Users, Loader2, Copy, Check, Trophy, Target } from 'lucide-react';
import { toast } from 'sonner';

interface Member {
  id: string;
  name: string;
  email: string;
  phone: string | null;
  zone: string | null;
  is_active: boolean | null;
  role: string;
  created_at: string | null;
  user_id: string | null;
}

export default function JVEquipoPage() {
  const [members, setMembers] = useState<Member[]>([]);
  const [leads, setLeads] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedSeller, setSelectedSeller] = useState<Member | null>(null);
  const [inviteLink, setInviteLink] = useState('');
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    const load = async () => {
      try {
        const [membersRes, leadsRes] = await Promise.all([
          supabase.from('backoffice_members').select('*').eq('role', 'vendedor').order('created_at', { ascending: false }),
          supabase.from('leads').select('id, stage, assigned_seller_id, monthly_value, updated_at, restaurant_name'),
        ]);
        setMembers((membersRes.data || []) as Member[]);
        setLeads(leadsRes.data || []);
      } catch (err) {
        console.error('JVEquipo: load error', err);
      }
      setLoading(false);
    };
    load();
  }, []);

  const getStats = (sellerId: string) => {
    const myLeads = leads.filter(l => l.assigned_seller_id === sellerId);
    const closed = myLeads.filter(l => l.stage === 'cliente_pagando').length;
    const pipeline = myLeads.filter(l => !['cliente_pagando', 'frio'].includes(l.stage)).length;
    const demos = myLeads.filter(l => ['demo_agendada', 'demo_hecha'].includes(l.stage)).length;
    const commission = closed * 50000 + closed * 40000;
    const conversion = myLeads.length > 0 ? ((closed / myLeads.length) * 100).toFixed(0) : '0';
    // Stale: no update in 48h
    const stale = myLeads.filter(l => {
      if (l.stage === 'cliente_pagando' || l.stage === 'frio') return false;
      if (!l.updated_at) return true;
      return (Date.now() - new Date(l.updated_at).getTime()) / 86400000 > 2;
    }).length;
    return { totalLeads: myLeads.length, closedLeads: closed, pipelineLeads: pipeline, demos, projectedCommission: commission, conversion, stale };
  };

  const toggleActive = async (member: Member) => {
    await supabase.from('backoffice_members').update({ is_active: !member.is_active }).eq('id', member.id);
    setMembers(prev => prev.map(m => m.id === member.id ? { ...m, is_active: !m.is_active } : m));
    toast.success(`${member.name} ${!member.is_active ? 'activado' : 'desactivado'}`);
  };

  const createInvite = async () => {
    const { data, error } = await supabase.from('backoffice_invitations').insert({
      role: 'vendedor',
    }).select('token').maybeSingle();

    if (error || !data) { toast.error(error?.message || 'Error al crear invitación'); return; }
    const link = `${window.location.origin}/backoffice/join/${data.token}`;
    setInviteLink(link);
  };

  const copyLink = () => {
    navigator.clipboard.writeText(inviteLink);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
    toast.success('Link copiado');
  };

  // Ranking
  const ranking = members
    .filter(m => !!m.is_active)
    .map(m => ({ ...m, stats: getStats(m.id) }))
    .sort((a, b) => b.stats.closedLeads - a.stats.closedLeads || Number(b.stats.conversion) - Number(a.stats.conversion));

  if (loading) return <div className="flex items-center justify-center h-64"><Loader2 className="w-6 h-6 animate-spin text-muted-foreground" /></div>;

  return (
    <div className="p-6 space-y-6 max-w-6xl">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-foreground">Equipo de ventas</h1>
          <p className="text-sm text-muted-foreground">{members.length} vendedores</p>
        </div>
        <Button onClick={createInvite} className="gap-2"><Plus className="w-4 h-4" />Invitar vendedor</Button>
      </div>

      {/* Invite link */}
      {inviteLink && (
        <Card className="border-primary/20">
          <CardContent className="p-4">
            <p className="text-sm font-medium text-foreground mb-2">Link de invitación generado:</p>
            <div className="flex items-center gap-2">
              <code className="flex-1 bg-muted px-3 py-2 rounded-lg text-xs text-foreground break-all">{inviteLink}</code>
              <Button variant="outline" size="sm" onClick={copyLink}>
                {copied ? <Check className="w-4 h-4" /> : <Copy className="w-4 h-4" />}
              </Button>
            </div>
            <p className="text-xs text-muted-foreground mt-2">Expira en 7 días. El vendedor debe registrarse con este link.</p>
          </CardContent>
        </Card>
      )}

      <Tabs defaultValue="team">
        <TabsList>
          <TabsTrigger value="team">Equipo</TabsTrigger>
          <TabsTrigger value="ranking">🏆 Ranking</TabsTrigger>
        </TabsList>

        <TabsContent value="team">
          <Card>
            <CardContent className="p-0">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Vendedor</TableHead>
                    <TableHead>Zona</TableHead>
                    <TableHead className="text-center">Leads</TableHead>
                    <TableHead className="text-center">Demos</TableHead>
                    <TableHead className="text-center">Cierres</TableHead>
                    <TableHead className="text-center">Conv.</TableHead>
                    <TableHead className="text-center">⚠️</TableHead>
                    <TableHead className="text-right">Comisión proj.</TableHead>
                    <TableHead className="text-center">Activo</TableHead>
                    <TableHead></TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {members.map(m => {
                    const stats = getStats(m.id);
                    return (
                      <TableRow key={m.id} className={!m.is_active ? 'opacity-50' : ''}>
                        <TableCell>
                          <p className="font-medium text-foreground">{m.name}</p>
                          <p className="text-xs text-muted-foreground">{m.email}</p>
                        </TableCell>
                        <TableCell>
                          <Badge variant="outline" className="text-xs">{m.zone || 'Sin zona'}</Badge>
                        </TableCell>
                        <TableCell className="text-center text-foreground">{stats.totalLeads}</TableCell>
                        <TableCell className="text-center text-foreground">{stats.demos}</TableCell>
                        <TableCell className="text-center font-semibold text-primary">{stats.closedLeads}</TableCell>
                        <TableCell className="text-center text-foreground">{stats.conversion}%</TableCell>
                        <TableCell className="text-center">
                          {stats.stale > 0 && <Badge variant="destructive" className="text-[10px]">{stats.stale}</Badge>}
                        </TableCell>
                        <TableCell className="text-right font-medium text-foreground">${stats.projectedCommission.toLocaleString('es-CL')}</TableCell>
                        <TableCell className="text-center">
                          <Switch checked={!!m.is_active} onCheckedChange={() => toggleActive(m)} />
                        </TableCell>
                        <TableCell>
                          <Button variant="ghost" size="sm" onClick={() => setSelectedSeller(m)}>Ver</Button>
                        </TableCell>
                      </TableRow>
                    );
                  })}
                  {members.length === 0 && (
                    <TableRow><TableCell colSpan={10} className="py-8 text-center text-muted-foreground">Sin vendedores. Invita al primero.</TableCell></TableRow>
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
                    <div><p className="text-lg font-bold text-foreground">{s.stats.closedLeads}</p><p className="text-[10px] text-muted-foreground">cierres</p></div>
                    <div><p className="text-lg font-bold text-foreground">{s.stats.totalLeads}</p><p className="text-[10px] text-muted-foreground">leads</p></div>
                    <div><p className="text-lg font-bold text-primary">{s.stats.conversion}%</p><p className="text-[10px] text-muted-foreground">conv.</p></div>
                  </div>
                </CardContent>
              </Card>
            ))}
            {ranking.length === 0 && <p className="text-center text-muted-foreground py-8">No hay vendedores activos</p>}
          </div>
        </TabsContent>
      </Tabs>

      {/* Seller detail sheet */}
      <Sheet open={!!selectedSeller} onOpenChange={() => setSelectedSeller(null)}>
        <SheetContent>
          {selectedSeller && (() => {
            const stats = getStats(selectedSeller.id);
            const sellerLeads = leads.filter(l => l.assigned_seller_id === selectedSeller.id);
            return (
              <>
                <SheetHeader>
                  <SheetTitle>{selectedSeller.name}</SheetTitle>
                </SheetHeader>
                <div className="space-y-4 mt-4">
                  <div className="space-y-1 text-sm">
                    <p className="text-muted-foreground">{selectedSeller.email}</p>
                    {selectedSeller.phone && <p className="text-muted-foreground">{selectedSeller.phone}</p>}
                    <Badge variant="outline">{selectedSeller.zone || 'Sin zona'}</Badge>
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <Card><CardContent className="p-3"><p className="text-xs text-muted-foreground">Leads</p><p className="text-xl font-bold">{stats.totalLeads}</p></CardContent></Card>
                    <Card><CardContent className="p-3"><p className="text-xs text-muted-foreground">Cierres</p><p className="text-xl font-bold text-primary">{stats.closedLeads}</p></CardContent></Card>
                    <Card><CardContent className="p-3"><p className="text-xs text-muted-foreground">Pipeline</p><p className="text-xl font-bold">{stats.pipelineLeads}</p></CardContent></Card>
                    <Card><CardContent className="p-3"><p className="text-xs text-muted-foreground">Comisión</p><p className="text-xl font-bold">${stats.projectedCommission.toLocaleString('es-CL')}</p></CardContent></Card>
                  </div>
                  <div>
                    <h3 className="text-sm font-semibold mb-2">Leads recientes</h3>
                    <div className="space-y-1 max-h-60 overflow-auto">
                      {sellerLeads.slice(0, 15).map((l: any) => (
                        <div key={l.id} className="flex justify-between text-sm py-1 border-b border-border/30">
                          <span className="text-foreground">{l.restaurant_name || l.id.slice(0, 8)}</span>
                          <Badge variant="outline" className="text-[10px]">{l.stage}</Badge>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              </>
            );
          })()}
        </SheetContent>
      </Sheet>
    </div>
  );
}
