import { useEffect, useState } from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { supabase } from '@/integrations/supabase/client';
import { Plus, Phone, Mail, MapPin, Calendar, Clock, MessageSquare, Filter, X } from 'lucide-react';
import { toast } from 'sonner';
import { DndContext, closestCenter, DragEndEvent, DragOverlay, DragStartEvent, useDroppable, useDraggable, PointerSensor, useSensor, useSensors } from '@dnd-kit/core';
import { useIsMobile } from '@/hooks/use-mobile';

const STAGES = [
  { key: 'contactado', label: 'Contactado', color: 'hsl(16,80%,51%)' },
  { key: 'demo_agendada', label: 'Demo agendada', color: 'hsl(30,90%,55%)' },
  { key: 'demo_hecha', label: 'Demo hecha', color: 'hsl(45,90%,50%)' },
  { key: 'piloto_activo', label: 'Piloto activo', color: 'hsl(200,70%,50%)' },
  { key: 'cliente_pagando', label: 'Pagando', color: 'hsl(145,60%,42%)' },
  { key: 'frio', label: 'Frío', color: 'hsl(220,15%,60%)' },
];

const ZONES = ['Barrio Italia', 'Ñuñoa', 'Lastarria', 'Providencia'];
const SOURCES = ['terreno', 'instagram', 'referido', 'google', 'otro'];
const TEMPERATURES = ['caliente', 'tibio', 'frio'];

interface Lead {
  id: string;
  restaurant_name: string;
  owner_name: string | null;
  phone: string | null;
  email: string | null;
  zone: string | null;
  stage: string;
  source: string | null;
  assigned_seller_id: string | null;
  temperature: string | null;
  notes: string | null;
  next_action: string | null;
  next_action_date: string | null;
  monthly_value: number | null;
  created_at: string | null;
  updated_at: string | null;
}

interface Activity {
  id: string;
  lead_id: string;
  type: string;
  description: string | null;
  created_at: string | null;
}

interface Seller {
  id: string;
  name: string;
}

// Draggable card
function DraggableLeadCard({ lead, stageColor, getSellerName, tempColor, onClick }: any) {
  const { attributes, listeners, setNodeRef, transform, isDragging } = useDraggable({ id: lead.id });
  const style = transform ? { transform: `translate3d(${transform.x}px, ${transform.y}px, 0)`, opacity: isDragging ? 0.5 : 1 } : undefined;

  return (
    <div ref={setNodeRef} style={style} {...listeners} {...attributes}>
      <Card
        className="cursor-grab active:cursor-grabbing hover:shadow-md transition-shadow border-l-[3px]"
        style={{ borderLeftColor: stageColor }}
        onClick={onClick}
      >
        <CardContent className="p-3 space-y-1.5">
          <p className="text-sm font-semibold text-foreground leading-tight">{lead.restaurant_name}</p>
          {lead.owner_name && <p className="text-xs text-muted-foreground">{lead.owner_name}</p>}
          <div className="flex items-center gap-1.5 flex-wrap">
            {lead.zone && (
              <Badge variant="outline" className="text-[10px] gap-0.5">
                <MapPin className="w-2.5 h-2.5" />{lead.zone}
              </Badge>
            )}
            <Badge className={`text-[10px] ${tempColor(lead.temperature)}`}>
              {lead.temperature === 'caliente' ? '🔥' : lead.temperature === 'frio' ? '❄️' : '🌤️'}
            </Badge>
          </div>
          {lead.assigned_seller_id && (
            <p className="text-[10px] text-muted-foreground">📌 {getSellerName(lead.assigned_seller_id)}</p>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

// Droppable column
function DroppableColumn({ stage, children }: { stage: string; children: React.ReactNode }) {
  const { isOver, setNodeRef } = useDroppable({ id: stage });
  return (
    <div
      ref={setNodeRef}
      className={`space-y-2 min-h-[100px] rounded-lg p-1 transition-colors ${isOver ? 'bg-primary/5 ring-2 ring-primary/20' : ''}`}
    >
      {children}
    </div>
  );
}

export default function BackofficePipeline() {
  const [leads, setLeads] = useState<Lead[]>([]);
  const [sellers, setSellers] = useState<Seller[]>([]);
  const [activities, setActivities] = useState<Activity[]>([]);
  const [loading, setLoading] = useState(true);
  const [detailLead, setDetailLead] = useState<Lead | null>(null);
  const [createOpen, setCreateOpen] = useState(false);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [newNote, setNewNote] = useState('');
  const isMobile = useIsMobile();

  // Filters
  const [filterSeller, setFilterSeller] = useState<string>('all');
  const [filterZone, setFilterZone] = useState<string>('all');
  const [filterTemp, setFilterTemp] = useState<string>('all');

  const [newLead, setNewLead] = useState({
    restaurant_name: '', owner_name: '', phone: '', email: '', zone: '', stage: 'contactado',
    source: 'terreno', assigned_seller_id: '', temperature: 'tibio', notes: '', monthly_value: 299,
  });

  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 8 } }));

  const load = async () => {
    const [leadsRes, sellersRes, actRes] = await Promise.all([
      supabase.from('leads').select('*').order('created_at', { ascending: false }),
      supabase.from('backoffice_members').select('id, name').eq('role', 'vendedor'),
      supabase.from('lead_activities').select('*').order('created_at', { ascending: false }).limit(500),
    ]);
    setLeads((leadsRes.data as Lead[]) || []);
    setSellers((sellersRes.data as Seller[]) || []);
    setActivities((actRes.data as Activity[]) || []);
    setLoading(false);
  };

  useEffect(() => { load(); }, []);

  const filteredLeads = leads.filter(l => {
    if (filterSeller !== 'all' && l.assigned_seller_id !== filterSeller) return false;
    if (filterZone !== 'all' && l.zone !== filterZone) return false;
    if (filterTemp !== 'all' && l.temperature !== filterTemp) return false;
    return true;
  });

  const moveStage = async (leadId: string, newStage: string) => {
    const lead = leads.find(l => l.id === leadId);
    const oldStage = lead?.stage;
    await supabase.from('leads').update({ stage: newStage, updated_at: new Date().toISOString() }).eq('id', leadId);
    // Log activity
    await supabase.from('lead_activities').insert({
      lead_id: leadId,
      type: 'stage_change',
      description: `Movido de ${STAGES.find(s => s.key === oldStage)?.label || oldStage} a ${STAGES.find(s => s.key === newStage)?.label}`,
    });
    setLeads(prev => prev.map(l => l.id === leadId ? { ...l, stage: newStage, updated_at: new Date().toISOString() } : l));
    if (detailLead?.id === leadId) setDetailLead(prev => prev ? { ...prev, stage: newStage } : null);
    toast.success(`Movido a ${STAGES.find(s => s.key === newStage)?.label}`);
    // Reload activities
    const { data } = await supabase.from('lead_activities').select('*').eq('lead_id', leadId).order('created_at', { ascending: false });
    setActivities(prev => [...(data || []), ...prev.filter(a => a.lead_id !== leadId)]);
  };

  const handleDragStart = (event: DragStartEvent) => {
    setActiveId(event.active.id as string);
  };

  const handleDragEnd = (event: DragEndEvent) => {
    setActiveId(null);
    const { active, over } = event;
    if (!over) return;
    const leadId = active.id as string;
    const newStage = over.id as string;
    const lead = leads.find(l => l.id === leadId);
    if (lead && lead.stage !== newStage && STAGES.some(s => s.key === newStage)) {
      moveStage(leadId, newStage);
    }
  };

  const addNote = async () => {
    if (!detailLead || !newNote.trim()) return;
    await supabase.from('lead_activities').insert({
      lead_id: detailLead.id,
      type: 'note',
      description: newNote.trim(),
    });
    toast.success('Nota agregada');
    setNewNote('');
    const { data } = await supabase.from('lead_activities').select('*').eq('lead_id', detailLead.id).order('created_at', { ascending: false });
    setActivities(prev => [...(data || []), ...prev.filter(a => a.lead_id !== detailLead.id)]);
  };

  const handleCreate = async () => {
    if (!newLead.restaurant_name) return toast.error('Nombre del local es requerido');
    const { error } = await supabase.from('leads').insert({
      restaurant_name: newLead.restaurant_name,
      owner_name: newLead.owner_name || null,
      phone: newLead.phone || null,
      email: newLead.email || null,
      zone: newLead.zone || null,
      stage: newLead.stage,
      source: newLead.source,
      assigned_seller_id: newLead.assigned_seller_id || null,
      temperature: newLead.temperature,
      notes: newLead.notes || null,
      monthly_value: newLead.monthly_value,
    });
    if (error) return toast.error(error.message);
    toast.success('Lead creado');
    setCreateOpen(false);
    setNewLead({ restaurant_name: '', owner_name: '', phone: '', email: '', zone: '', stage: 'contactado', source: 'terreno', assigned_seller_id: '', temperature: 'tibio', notes: '', monthly_value: 299 });
    load();
  };

  const getSellerName = (id: string | null) => sellers.find(s => s.id === id)?.name || '';

  const tempColor = (t: string | null) => {
    if (t === 'caliente') return 'bg-[#FDE8E8] text-[#C0280F] dark:bg-[#C0280F]/10 dark:text-[#C0280F]';
    if (t === 'frio') return 'bg-muted text-muted-foreground dark:bg-muted dark:text-muted-foreground';
    return 'bg-[#FEF0E8] text-[#B87C10] dark:bg-[#B87C10]/10 dark:text-[#B87C10]';
  };

  const leadActivities = detailLead ? activities.filter(a => a.lead_id === detailLead.id) : [];
  const activeLead = activeId ? leads.find(l => l.id === activeId) : null;
  const hasFilters = filterSeller !== 'all' || filterZone !== 'all' || filterTemp !== 'all';

  if (loading) {
    return <div className="flex items-center justify-center h-64"><div className="animate-spin h-8 w-8 border-4 border-primary border-t-transparent rounded-full" /></div>;
  }

  return (
    <div className="p-4 md:p-6 space-y-4">
      <div className="flex items-center justify-between flex-wrap gap-2">
        <div>
          <h1 className="text-2xl font-bold text-foreground tracking-tight">Pipeline</h1>
          <p className="text-sm text-muted-foreground">{filteredLeads.length} leads {hasFilters ? '(filtrados)' : 'totales'}</p>
        </div>
        <Button onClick={() => setCreateOpen(true)} className="gap-2"><Plus className="w-4 h-4" />Nuevo lead</Button>
      </div>

      {/* Filters */}
      <div className="flex items-center gap-2 flex-wrap">
        <Filter className="w-4 h-4 text-muted-foreground" />
        <Select value={filterSeller} onValueChange={setFilterSeller}>
          <SelectTrigger className="w-[160px] h-8 text-xs"><SelectValue placeholder="Vendedor" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Todos los vendedores</SelectItem>
            {sellers.map(s => <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>)}
          </SelectContent>
        </Select>
        <Select value={filterZone} onValueChange={setFilterZone}>
          <SelectTrigger className="w-[140px] h-8 text-xs"><SelectValue placeholder="Zona" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Todas las zonas</SelectItem>
            {ZONES.map(z => <SelectItem key={z} value={z}>{z}</SelectItem>)}
          </SelectContent>
        </Select>
        <Select value={filterTemp} onValueChange={setFilterTemp}>
          <SelectTrigger className="w-[130px] h-8 text-xs"><SelectValue placeholder="Temperatura" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Todas</SelectItem>
            {TEMPERATURES.map(t => <SelectItem key={t} value={t} className="capitalize">{t === 'caliente' ? '🔥 Caliente' : t === 'frio' ? '❄️ Frío' : '🌤️ Tibio'}</SelectItem>)}
          </SelectContent>
        </Select>
        {hasFilters && (
          <Button variant="ghost" size="sm" className="h-8 text-xs gap-1" onClick={() => { setFilterSeller('all'); setFilterZone('all'); setFilterTemp('all'); }}>
            <X className="w-3 h-3" />Limpiar
          </Button>
        )}
      </div>

      {/* Kanban Board with DnD */}
      <DndContext sensors={sensors} collisionDetection={closestCenter} onDragStart={handleDragStart} onDragEnd={handleDragEnd}>
        <div className="flex gap-3 overflow-x-auto pb-4">
          {STAGES.map(stage => {
            const stageLeads = filteredLeads.filter(l => l.stage === stage.key);
            return (
              <div key={stage.key} className="min-w-[260px] w-[260px] flex-shrink-0">
                <div className="flex items-center gap-2 mb-2 px-1">
                  <span className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: stage.color }} />
                  <span className="text-sm font-semibold text-foreground">{stage.label}</span>
                  <Badge variant="secondary" className="text-[10px] ml-auto">{stageLeads.length}</Badge>
                </div>
                <DroppableColumn stage={stage.key}>
                  {stageLeads.map(lead => (
                    isMobile ? (
                      <Card
                        key={lead.id}
                        className="cursor-pointer hover:shadow-md transition-shadow border-l-[3px]"
                        style={{ borderLeftColor: stage.color }}
                        onClick={() => setDetailLead(lead)}
                      >
                        <CardContent className="p-3 space-y-1.5">
                          <p className="text-sm font-semibold text-foreground leading-tight">{lead.restaurant_name}</p>
                          {lead.owner_name && <p className="text-xs text-muted-foreground">{lead.owner_name}</p>}
                          <div className="flex items-center gap-1.5 flex-wrap">
                            {lead.zone && <Badge variant="outline" className="text-[10px] gap-0.5"><MapPin className="w-2.5 h-2.5" />{lead.zone}</Badge>}
                            <Badge className={`text-[10px] ${tempColor(lead.temperature)}`}>
                              {lead.temperature === 'caliente' ? '🔥' : lead.temperature === 'frio' ? '❄️' : '🌤️'}
                            </Badge>
                          </div>
                          {lead.assigned_seller_id && <p className="text-[10px] text-muted-foreground">📌 {getSellerName(lead.assigned_seller_id)}</p>}
                        </CardContent>
                      </Card>
                    ) : (
                      <DraggableLeadCard
                        key={lead.id}
                        lead={lead}
                        stageColor={stage.color}
                        getSellerName={getSellerName}
                        tempColor={tempColor}
                        onClick={() => setDetailLead(lead)}
                      />
                    )
                  ))}
                </DroppableColumn>
              </div>
            );
          })}
        </div>

        <DragOverlay>
          {activeLead && (
            <Card className="shadow-lg border-l-[3px] w-[250px] rotate-2" style={{ borderLeftColor: STAGES.find(s => s.key === activeLead.stage)?.color }}>
              <CardContent className="p-3">
                <p className="text-sm font-semibold text-foreground">{activeLead.restaurant_name}</p>
              </CardContent>
            </Card>
          )}
        </DragOverlay>
      </DndContext>

      {/* Lead Detail Dialog with Activity History */}
      <Dialog open={!!detailLead} onOpenChange={() => setDetailLead(null)}>
        <DialogContent className="max-w-lg max-h-[85vh] overflow-hidden flex flex-col">
          {detailLead && (
            <>
              <DialogHeader>
                <DialogTitle className="flex items-center gap-2">
                  {detailLead.restaurant_name}
                  <Badge variant="outline" className="text-[10px]">{STAGES.find(s => s.key === detailLead.stage)?.label}</Badge>
                </DialogTitle>
              </DialogHeader>
              <ScrollArea className="flex-1">
                <div className="space-y-4 pr-2">
                  {/* Contact info */}
                  <div className="space-y-1">
                    {detailLead.owner_name && <p className="text-sm text-muted-foreground">👤 {detailLead.owner_name}</p>}
                    <div className="flex flex-wrap gap-2">
                      {detailLead.phone && <a href={`tel:${detailLead.phone}`} className="flex items-center gap-1 text-xs text-primary"><Phone className="w-3 h-3" />{detailLead.phone}</a>}
                      {detailLead.email && <a href={`mailto:${detailLead.email}`} className="flex items-center gap-1 text-xs text-primary"><Mail className="w-3 h-3" />{detailLead.email}</a>}
                    </div>
                    {detailLead.zone && <p className="text-xs text-muted-foreground flex items-center gap-1"><MapPin className="w-3 h-3" />{detailLead.zone}</p>}
                  </div>

                  <div className="flex items-center gap-2 flex-wrap">
                    <Badge className={tempColor(detailLead.temperature)}>{detailLead.temperature}</Badge>
                    <Badge variant="outline" className="text-xs capitalize">{detailLead.source}</Badge>
                    {detailLead.monthly_value && <Badge variant="secondary">${detailLead.monthly_value}/mes</Badge>}
                  </div>

                  {detailLead.notes && <p className="text-sm text-muted-foreground bg-muted p-2 rounded-lg">{detailLead.notes}</p>}

                  {detailLead.next_action && (
                    <div className="flex items-center gap-1 text-xs text-foreground">
                      <Calendar className="w-3 h-3" />
                      {detailLead.next_action} {detailLead.next_action_date && `— ${detailLead.next_action_date}`}
                    </div>
                  )}

                  {detailLead.assigned_seller_id && (
                    <p className="text-xs text-muted-foreground">Asignado: {getSellerName(detailLead.assigned_seller_id)}</p>
                  )}

                  {/* Move to stage */}
                  <div className="pt-2 border-t border-border">
                    <p className="text-xs font-semibold text-muted-foreground mb-2">Mover a:</p>
                    <div className="flex flex-wrap gap-1.5">
                      {STAGES.filter(s => s.key !== detailLead.stage).map(s => (
                        <Button key={s.key} variant="outline" size="sm" className="text-xs gap-1" onClick={() => moveStage(detailLead.id, s.key)}>
                          <span className="w-2 h-2 rounded-full" style={{ backgroundColor: s.color }} />
                          {s.label}
                        </Button>
                      ))}
                    </div>
                  </div>

                  {/* Add note */}
                  <div className="pt-2 border-t border-border">
                    <p className="text-xs font-semibold text-muted-foreground mb-2">Agregar nota</p>
                    <div className="flex gap-2">
                      <Input placeholder="Escribe una nota..." value={newNote} onChange={e => setNewNote(e.target.value)} className="h-8 text-xs" onKeyDown={e => e.key === 'Enter' && addNote()} />
                      <Button size="sm" onClick={addNote} disabled={!newNote.trim()} className="h-8 text-xs">Agregar</Button>
                    </div>
                  </div>

                  {/* Activity Timeline */}
                  <div className="pt-2 border-t border-border">
                    <p className="text-xs font-semibold text-muted-foreground mb-2">
                      <Clock className="w-3 h-3 inline mr-1" />Historial ({leadActivities.length})
                    </p>
                    {leadActivities.length === 0 ? (
                      <p className="text-xs text-muted-foreground italic">Sin actividad registrada</p>
                    ) : (
                      <div className="space-y-2">
                        {leadActivities.map(a => (
                          <div key={a.id} className="flex gap-2 items-start">
                            <div className={`w-1.5 h-1.5 rounded-full mt-1.5 shrink-0 ${a.type === 'stage_change' ? 'bg-primary' : a.type === 'note' ? 'bg-amber-500' : 'bg-muted-foreground'}`} />
                            <div className="flex-1 min-w-0">
                              <p className="text-xs text-foreground">{a.description}</p>
                              <p className="text-[10px] text-muted-foreground">{a.created_at ? new Date(a.created_at).toLocaleString('es-CL', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' }) : ''}</p>
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                </div>
              </ScrollArea>
            </>
          )}
        </DialogContent>
      </Dialog>

      {/* Create Lead Dialog */}
      <Dialog open={createOpen} onOpenChange={setCreateOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader><DialogTitle>Nuevo lead</DialogTitle></DialogHeader>
          <ScrollArea className="max-h-[70vh]">
            <div className="space-y-3 pr-2">
              <Input placeholder="Nombre del local *" value={newLead.restaurant_name} onChange={e => setNewLead(f => ({ ...f, restaurant_name: e.target.value }))} />
              <Input placeholder="Dueño / contacto" value={newLead.owner_name} onChange={e => setNewLead(f => ({ ...f, owner_name: e.target.value }))} />
              <div className="grid grid-cols-2 gap-2">
                <Input placeholder="Teléfono" value={newLead.phone} onChange={e => setNewLead(f => ({ ...f, phone: e.target.value }))} />
                <Input placeholder="Email" type="email" value={newLead.email} onChange={e => setNewLead(f => ({ ...f, email: e.target.value }))} />
              </div>
              <Select value={newLead.zone} onValueChange={v => setNewLead(f => ({ ...f, zone: v }))}>
                <SelectTrigger><SelectValue placeholder="Zona" /></SelectTrigger>
                <SelectContent>{ZONES.map(z => <SelectItem key={z} value={z}>{z}</SelectItem>)}</SelectContent>
              </Select>
              <Select value={newLead.source} onValueChange={v => setNewLead(f => ({ ...f, source: v }))}>
                <SelectTrigger><SelectValue placeholder="Fuente" /></SelectTrigger>
                <SelectContent>{SOURCES.map(s => <SelectItem key={s} value={s} className="capitalize">{s}</SelectItem>)}</SelectContent>
              </Select>
              <Select value={newLead.assigned_seller_id} onValueChange={v => setNewLead(f => ({ ...f, assigned_seller_id: v }))}>
                <SelectTrigger><SelectValue placeholder="Asignar vendedor" /></SelectTrigger>
                <SelectContent>{sellers.map(s => <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>)}</SelectContent>
              </Select>
              <Select value={newLead.temperature} onValueChange={v => setNewLead(f => ({ ...f, temperature: v }))}>
                <SelectTrigger><SelectValue placeholder="Temperatura" /></SelectTrigger>
                <SelectContent>{TEMPERATURES.map(t => <SelectItem key={t} value={t} className="capitalize">{t === 'caliente' ? '🔥 Caliente' : t === 'frio' ? '❄️ Frío' : '🌤️ Tibio'}</SelectItem>)}</SelectContent>
              </Select>
              <Textarea placeholder="Notas" value={newLead.notes} onChange={e => setNewLead(f => ({ ...f, notes: e.target.value }))} rows={2} />
              <Button onClick={handleCreate} className="w-full">Crear lead</Button>
            </div>
          </ScrollArea>
        </DialogContent>
      </Dialog>
    </div>
  );
}
