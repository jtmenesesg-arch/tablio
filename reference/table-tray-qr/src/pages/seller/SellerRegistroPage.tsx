import { useState, useEffect } from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { supabase } from '@/integrations/supabase/client';
import { useSeller } from '@/contexts/SellerContext';
import { toast } from 'sonner';
import { Check, MapPin } from 'lucide-react';
import { format, addDays } from 'date-fns';

const STAGES = [
  { value: 'contactado', label: 'Contactado' },
  { value: 'demo_agendada', label: 'Demo agendada' },
  { value: 'demo_hecha', label: 'Demo hecha' },
  { value: 'piloto_activo', label: 'Piloto activo' },
  { value: 'pagando', label: 'Pagando' },
  { value: 'frio', label: 'Frío' },
];

const NEXT_ACTIONS = [
  'Llamar', 'Visitar', 'Enviar propuesta', 'Agendar demo', 'Seguimiento piloto', 'Cerrar venta',
];

const ZONES = ['Barrio Italia', 'Ñuñoa', 'Lastarria', 'Providencia', 'Las Condes', 'Vitacura', 'Santiago Centro'];

export default function SellerRegistroPage() {
  const { seller } = useSeller();
  const [restaurant, setRestaurant] = useState('');
  const [owner, setOwner] = useState('');
  const [phone, setPhone] = useState('');
  const [stage, setStage] = useState('contactado');
  const [nextAction, setNextAction] = useState('');
  const [nextActionDate, setNextActionDate] = useState(format(addDays(new Date(), 2), 'yyyy-MM-dd'));
  const [zone, setZone] = useState(seller?.zone || '');
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [suggestions, setSuggestions] = useState<string[]>([]);
  const [existingLeads, setExistingLeads] = useState<{ id: string; restaurant_name: string }[]>([]);

  useEffect(() => {
    if (!seller) return;
    supabase
      .from('leads')
      .select('id, restaurant_name')
      .eq('assigned_seller_id', seller.id)
      .then(({ data }) => {
        setExistingLeads((data || []) as any);
      });
  }, [seller]);

  useEffect(() => {
    if (restaurant.length < 2) {
      setSuggestions([]);
      return;
    }
    const filtered = existingLeads
      .filter(l => l.restaurant_name.toLowerCase().includes(restaurant.toLowerCase()))
      .map(l => l.restaurant_name);
    setSuggestions(filtered.slice(0, 5));
  }, [restaurant, existingLeads]);

  const handleSave = async () => {
    if (!restaurant.trim() || !seller) {
      toast.error('El nombre del local es obligatorio');
      return;
    }
    setSaving(true);

    // Check if updating existing or creating new
    const existing = existingLeads.find(
      l => l.restaurant_name.toLowerCase() === restaurant.toLowerCase()
    );

    if (existing) {
      // Update existing lead
      await supabase
        .from('leads')
        .update({
          stage,
          next_action: nextAction || null,
          next_action_date: nextActionDate || null,
          owner_name: owner || null,
          phone: phone || null,
          zone: zone || null,
        })
        .eq('id', existing.id);

      // Log activity
      await supabase.from('lead_activities').insert({
        lead_id: existing.id,
        type: 'visita',
        description: `Visita registrada. Estado: ${stage}. ${nextAction ? `Próxima acción: ${nextAction}` : ''}`,
        user_id: seller.id,
      });
    } else {
      // Create new lead
      const { data: newLead } = await supabase
        .from('leads')
        .insert({
          restaurant_name: restaurant.trim(),
          owner_name: owner || null,
          phone: phone || null,
          stage,
          next_action: nextAction || null,
          next_action_date: nextActionDate || null,
          assigned_seller_id: seller.id,
          zone: zone || null,
          source: 'terreno',
          temperature: 'tibio',
        })
        .select('id')
        .single();

      if (newLead) {
        await supabase.from('lead_activities').insert({
          lead_id: newLead.id,
          type: 'visita',
          description: `Primera visita registrada. Contacto: ${owner || 'N/A'}`,
          user_id: seller.id,
        });
      }
    }

    setSaving(false);
    setSaved(true);
    toast.success('Visita registrada ✓');

    // Reset after 2s
    setTimeout(() => {
      setRestaurant('');
      setOwner('');
      setPhone('');
      setStage('contactado');
      setNextAction('');
      setNextActionDate(format(addDays(new Date(), 2), 'yyyy-MM-dd'));
      setSaved(false);
    }, 2000);
  };

  if (saved) {
    return (
      <div className="flex flex-col items-center justify-center h-64 gap-3">
        <div className="w-16 h-16 rounded-full bg-emerald-100 flex items-center justify-center">
          <Check className="w-8 h-8 text-emerald-600" />
        </div>
        <p className="text-lg font-semibold text-foreground">¡Visita registrada!</p>
        <p className="text-sm text-muted-foreground">Preparando siguiente registro...</p>
      </div>
    );
  }

  return (
    <div className="p-4 max-w-lg mx-auto">
      <h1 className="text-lg font-bold text-foreground mb-4">Registrar visita</h1>

      <Card>
        <CardContent className="p-4 space-y-4">
          {/* Local */}
          <div className="space-y-1 relative">
            <label className="text-xs font-medium text-muted-foreground">Local *</label>
            <Input
              placeholder="Nombre del restaurante"
              value={restaurant}
              onChange={e => setRestaurant(e.target.value)}
              autoFocus
            />
            {suggestions.length > 0 && (
              <div className="absolute z-10 top-full left-0 right-0 bg-card border border-border rounded-lg shadow-lg mt-1 overflow-hidden">
                {suggestions.map(s => (
                  <button
                    key={s}
                    onClick={() => { setRestaurant(s); setSuggestions([]); }}
                    className="w-full text-left px-3 py-2 text-sm hover:bg-muted transition-colors"
                  >
                    {s}
                  </button>
                ))}
              </div>
            )}
          </div>

          {/* Owner */}
          <div className="space-y-1">
            <label className="text-xs font-medium text-muted-foreground">Dueño / Contacto</label>
            <Input
              placeholder="Nombre del dueño"
              value={owner}
              onChange={e => setOwner(e.target.value)}
            />
          </div>

          {/* Phone */}
          <div className="space-y-1">
            <label className="text-xs font-medium text-muted-foreground">Teléfono</label>
            <Input
              placeholder="+56 9 XXXX XXXX"
              type="tel"
              value={phone}
              onChange={e => setPhone(e.target.value)}
            />
          </div>

          {/* Stage */}
          <div className="space-y-1">
            <label className="text-xs font-medium text-muted-foreground">Estado</label>
            <Select value={stage} onValueChange={setStage}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                {STAGES.map(s => (
                  <SelectItem key={s.value} value={s.value}>{s.label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* Zone */}
          <div className="space-y-1">
            <label className="text-xs font-medium text-muted-foreground flex items-center gap-1">
              <MapPin className="w-3 h-3" /> Zona
            </label>
            <Select value={zone} onValueChange={setZone}>
              <SelectTrigger><SelectValue placeholder="Seleccionar zona" /></SelectTrigger>
              <SelectContent>
                {ZONES.map(z => (
                  <SelectItem key={z} value={z}>{z}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* Next action */}
          <div className="space-y-1">
            <label className="text-xs font-medium text-muted-foreground">Próxima acción</label>
            <Select value={nextAction} onValueChange={setNextAction}>
              <SelectTrigger><SelectValue placeholder="Seleccionar" /></SelectTrigger>
              <SelectContent>
                {NEXT_ACTIONS.map(a => (
                  <SelectItem key={a} value={a}>{a}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* Next action date */}
          <div className="space-y-1">
            <label className="text-xs font-medium text-muted-foreground">Fecha próxima acción</label>
            <Input
              type="date"
              value={nextActionDate}
              onChange={e => setNextActionDate(e.target.value)}
            />
          </div>

          <Button onClick={handleSave} className="w-full" disabled={saving}>
            {saving ? 'Guardando...' : 'Guardar visita'}
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}
