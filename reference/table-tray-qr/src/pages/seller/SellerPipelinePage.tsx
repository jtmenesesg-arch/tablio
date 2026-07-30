import { useEffect, useState } from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { supabase } from '@/integrations/supabase/client';
import { useSeller } from '@/contexts/SellerContext';
import { Phone, MapPin, Clock, ChevronRight, MessageSquare, Send } from 'lucide-react';
import { format } from 'date-fns';
import { es } from 'date-fns/locale';

interface Lead {
  id: string;
  restaurant_name: string;
  owner_name: string | null;
  phone: string | null;
  stage: string;
  temperature: string | null;
  next_action: string | null;
  next_action_date: string | null;
  zone: string | null;
  updated_at: string | null;
  notes: string | null;
}

interface Activity {
  id: string;
  type: string;
  description: string | null;
  created_at: string;
}

const STAGES = ['contactado', 'demo_agendada', 'demo_hecha', 'piloto_activo', 'pagando', 'frio', 'perdido'];
const STAGE_LABELS: Record<string, string> = {
  contactado: 'Contactado',
  demo_agendada: 'Demo agendada',
  demo_hecha: 'Demo hecha',
  piloto_activo: 'Piloto activo',
  pagando: 'Pagando ✅',
  frio: 'Frío',
  perdido: 'Perdido',
};

export default function SellerPipelinePage() {
  const { seller } = useSeller();
  const [leads, setLeads] = useState<Lead[]>([]);
  const [filter, setFilter] = useState<string>('todos');
  const [loading, setLoading] = useState(true);
  const [selectedLead, setSelectedLead] = useState<Lead | null>(null);
  const [activities, setActivities] = useState<Activity[]>([]);
  const [newNote, setNewNote] = useState('');
  const [savingNote, setSavingNote] = useState(false);

  const loadLeads = async () => {
    if (!seller) return;
    const { data } = await supabase
      .from('leads')
      .select('*')
      .eq('assigned_seller_id', seller.id)
      .order('updated_at', { ascending: false });
    setLeads((data || []) as Lead[]);
    setLoading(false);
  };

  useEffect(() => { loadLeads(); }, [seller]);

  const loadActivities = async (leadId: string) => {
    const { data } = await supabase
      .from('lead_activities')
      .select('*')
      .eq('lead_id', leadId)
      .order('created_at', { ascending: false })
      .limit(20);
    setActivities((data || []) as Activity[]);
  };

  const openDetail = (lead: Lead) => {
    setSelectedLead(lead);
    loadActivities(lead.id);
    setNewNote('');
  };

  const addNote = async () => {
    if (!newNote.trim() || !selectedLead || !seller) return;
    setSavingNote(true);
    await supabase.from('lead_activities').insert({
      lead_id: selectedLead.id,
      type: 'nota',
      description: newNote.trim(),
      user_id: seller.id,
    });
    setNewNote('');
    await loadActivities(selectedLead.id);
    setSavingNote(false);
  };

  const filteredLeads = filter === 'todos'
    ? leads
    : leads.filter(l => l.temperature === filter);

  // Group by stage
  const grouped = STAGES.reduce((acc, stage) => {
    acc[stage] = filteredLeads.filter(l => l.stage === stage);
    return acc;
  }, {} as Record<string, Lead[]>);

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin h-6 w-6 border-2 border-primary border-t-transparent rounded-full" />
      </div>
    );
  }

  return (
    <div className="p-4 max-w-lg mx-auto">
      <div className="flex items-center justify-between mb-4">
        <h1 className="text-lg font-bold text-foreground">Mi Pipeline</h1>
        <Badge variant="outline" className="text-xs">{leads.length} leads</Badge>
      </div>

      {/* Temperature filter */}
      <div className="flex gap-2 mb-4 overflow-x-auto">
        {[
          { value: 'todos', label: 'Todos', emoji: '' },
          { value: 'caliente', label: 'Calientes', emoji: '🔥' },
          { value: 'tibio', label: 'Tibios', emoji: '🌤' },
          { value: 'frio', label: 'Fríos', emoji: '❄️' },
        ].map(f => (
          <button
            key={f.value}
            onClick={() => setFilter(f.value)}
            className={`shrink-0 px-3 py-1.5 rounded-full text-xs font-medium transition-colors ${
              filter === f.value
                ? 'bg-primary text-primary-foreground'
                : 'bg-muted text-muted-foreground'
            }`}
          >
            {f.emoji} {f.label}
          </button>
        ))}
      </div>

      {/* Leads grouped by stage */}
      <div className="space-y-4">
        {STAGES.map(stage => {
          const stageLeads = grouped[stage];
          if (stageLeads.length === 0) return null;
          return (
            <div key={stage}>
              <h2 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2">
                {STAGE_LABELS[stage]} ({stageLeads.length})
              </h2>
              <div className="space-y-2">
                {stageLeads.map(lead => (
                  <Card
                    key={lead.id}
                    className="active:scale-[0.98] transition-transform cursor-pointer"
                    onClick={() => openDetail(lead)}
                  >
                    <CardContent className="p-3">
                      <div className="flex items-center justify-between">
                        <div className="min-w-0 flex-1">
                          <p className="font-medium text-sm text-foreground truncate">{lead.restaurant_name}</p>
                          <div className="flex items-center gap-2 mt-0.5">
                            {lead.zone && (
                              <span className="text-[11px] text-muted-foreground flex items-center gap-0.5">
                                <MapPin className="w-3 h-3" />{lead.zone}
                              </span>
                            )}
                            {lead.next_action && (
                              <span className="text-[11px] text-primary">→ {lead.next_action}</span>
                            )}
                          </div>
                        </div>
                        <div className="flex items-center gap-1">
                          <Badge variant="outline" className={`text-[10px] ${
                            lead.temperature === 'caliente' ? 'border-destructive text-destructive' :
                            lead.temperature === 'tibio' ? 'border-[#B87C10] text-[#B87C10]' :
                            'border-muted-foreground text-muted-foreground'
                          }`}>
                            {lead.temperature === 'caliente' ? '🔥' : lead.temperature === 'tibio' ? '🌤' : '❄️'}
                          </Badge>
                          <ChevronRight className="w-4 h-4 text-muted-foreground" />
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                ))}
              </div>
            </div>
          );
        })}
      </div>

      {filteredLeads.length === 0 && (
        <div className="text-center py-12 text-muted-foreground text-sm">
          No tienes leads {filter !== 'todos' ? `con temperatura "${filter}"` : ''}
        </div>
      )}

      {/* Lead detail dialog */}
      <Dialog open={!!selectedLead} onOpenChange={open => !open && setSelectedLead(null)}>
        <DialogContent className="max-w-md max-h-[85vh] overflow-y-auto">
          {selectedLead && (
            <>
              <DialogHeader>
                <DialogTitle className="text-left">{selectedLead.restaurant_name}</DialogTitle>
              </DialogHeader>

              <div className="space-y-4 mt-2">
                {/* Info */}
                <div className="grid grid-cols-2 gap-2 text-sm">
                  {selectedLead.owner_name && (
                    <div>
                      <span className="text-muted-foreground text-xs">Dueño</span>
                      <p className="font-medium text-foreground">{selectedLead.owner_name}</p>
                    </div>
                  )}
                  {selectedLead.phone && (
                    <div>
                      <span className="text-muted-foreground text-xs">Teléfono</span>
                      <a href={`tel:${selectedLead.phone}`} className="font-medium text-primary flex items-center gap-1">
                        <Phone className="w-3 h-3" />{selectedLead.phone}
                      </a>
                    </div>
                  )}
                  <div>
                    <span className="text-muted-foreground text-xs">Etapa</span>
                    <p className="font-medium text-foreground">{STAGE_LABELS[selectedLead.stage]}</p>
                  </div>
                  <div>
                    <span className="text-muted-foreground text-xs">Zona</span>
                    <p className="font-medium text-foreground">{selectedLead.zone || '—'}</p>
                  </div>
                  {selectedLead.next_action && (
                    <div className="col-span-2">
                      <span className="text-muted-foreground text-xs">Próxima acción</span>
                      <p className="font-medium text-primary">
                        {selectedLead.next_action}
                        {selectedLead.next_action_date && ` · ${selectedLead.next_action_date}`}
                      </p>
                    </div>
                  )}
                </div>

                {/* Notes */}
                {selectedLead.notes && (
                  <div>
                    <span className="text-muted-foreground text-xs">Notas</span>
                    <p className="text-sm text-foreground mt-1">{selectedLead.notes}</p>
                  </div>
                )}

                {/* Activity timeline */}
                <div>
                  <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2">
                    Historial ({activities.length})
                  </h3>
                  <div className="space-y-2 max-h-48 overflow-y-auto">
                    {activities.map(a => (
                      <div key={a.id} className="flex gap-2 text-sm">
                        <div className="w-6 h-6 rounded-full bg-muted flex items-center justify-center shrink-0 mt-0.5">
                          {a.type === 'nota' ? <MessageSquare className="w-3 h-3 text-muted-foreground" /> :
                           <Clock className="w-3 h-3 text-muted-foreground" />}
                        </div>
                        <div>
                          <p className="text-foreground">{a.description}</p>
                          <p className="text-[11px] text-muted-foreground">
                            {format(new Date(a.created_at), "d MMM HH:mm", { locale: es })}
                          </p>
                        </div>
                      </div>
                    ))}
                    {activities.length === 0 && (
                      <p className="text-xs text-muted-foreground">Sin historial</p>
                    )}
                  </div>
                </div>

                {/* Add note */}
                <div className="flex gap-2">
                  <Textarea
                    placeholder="Agregar nota..."
                    value={newNote}
                    onChange={e => setNewNote(e.target.value)}
                    className="min-h-[60px] text-sm"
                  />
                  <Button
                    size="icon"
                    onClick={addNote}
                    disabled={savingNote || !newNote.trim()}
                    className="shrink-0 self-end"
                  >
                    <Send className="w-4 h-4" />
                  </Button>
                </div>
              </div>
            </>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
