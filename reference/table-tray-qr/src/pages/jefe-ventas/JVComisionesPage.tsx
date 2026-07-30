import { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Slider } from '@/components/ui/slider';
import { supabase } from '@/integrations/supabase/client';
import { DollarSign, TrendingUp, Calculator, Loader2 } from 'lucide-react';

const PILOT_THRESHOLD = 5;
const PILOT_PRICE = 199000;
const COMMERCIAL_PRICE = 299000;
const CLOSE_COMMISSION = 50000;
const PILOT_ACTIVE_COMMISSION = 30000;
const COMMERCIAL_ACTIVE_COMMISSION = 40000;

export default function JVComisionesPage() {
  const [loading, setLoading] = useState(true);
  const [totalClients, setTotalClients] = useState(0);
  const [projectedClients, setProjectedClients] = useState([5]);

  useEffect(() => {
    const load = async () => {
      const { data } = await supabase.from('tenants').select('id, plan_status').eq('is_active', true);
      const paying = (data || []).filter(t => ['active', 'paying', 'pilot', 'trial'].includes(t.plan_status || ''));
      setTotalClients(paying.length);
      setProjectedClients([Math.max(paying.length, 5)]);
      setLoading(false);
    };
    load();
  }, []);

  if (loading) return <div className="flex items-center justify-center h-64"><Loader2 className="w-6 h-6 animate-spin text-muted-foreground" /></div>;

  const n = projectedClients[0];

  // Calculate commissions with phase logic
  const pilotClients = Math.min(n, PILOT_THRESHOLD);
  const commercialClients = Math.max(0, n - PILOT_THRESHOLD);

  // Close commissions (all at 50k)
  const closeTotal = n * CLOSE_COMMISSION;

  // Active recurring (first 5 at 30k, rest at 40k)
  const activeRecurring = pilotClients * PILOT_ACTIVE_COMMISSION + commercialClients * COMMERCIAL_ACTIVE_COMMISSION;

  // Revenue for the business
  const pilotRevenue = pilotClients * PILOT_PRICE;
  const commercialRevenue = commercialClients * COMMERCIAL_PRICE;
  const totalRevenue = pilotRevenue + commercialRevenue;

  // Build month-by-month accumulation table
  const monthData = Array.from({ length: Math.min(n, 12) }, (_, i) => {
    const clientsAtMonth = i + 1;
    const pilotAtMonth = Math.min(clientsAtMonth, PILOT_THRESHOLD);
    const commAtMonth = Math.max(0, clientsAtMonth - PILOT_THRESHOLD);
    const closeComm = CLOSE_COMMISSION; // per month, 1 close
    const activeComm = pilotAtMonth * PILOT_ACTIVE_COMMISSION + commAtMonth * COMMERCIAL_ACTIVE_COMMISSION;
    return {
      mes: `Mes ${i + 1}`,
      clientes: clientsAtMonth,
      cierre: CLOSE_COMMISSION,
      recurrente: activeComm,
      total: CLOSE_COMMISSION + activeComm,
      fase: clientsAtMonth <= PILOT_THRESHOLD ? 'Piloto' : 'Comercial',
    };
  });

  return (
    <div className="p-6 space-y-6 max-w-5xl">
      <div>
        <h1 className="text-2xl font-bold text-foreground">Proyección de comisiones</h1>
        <p className="text-sm text-muted-foreground">Calcula tus ingresos según la cantidad de clientes</p>
      </div>

      {/* Current phase */}
      <Card className="border-primary/20">
        <CardContent className="p-4">
          <div className="grid grid-cols-2 gap-4">
            <div>
              <h3 className="text-sm font-semibold text-foreground mb-2">🧪 Fase Piloto (primeros 5)</h3>
              <ul className="text-sm text-muted-foreground space-y-1">
                <li>• Precio: <span className="font-semibold text-foreground">${PILOT_PRICE.toLocaleString('es-CL')}</span>/cliente</li>
                <li>• Comisión cierre: <span className="font-semibold text-foreground">${CLOSE_COMMISSION.toLocaleString('es-CL')}</span></li>
                <li>• Comisión activo: <span className="font-semibold text-foreground">${PILOT_ACTIVE_COMMISSION.toLocaleString('es-CL')}</span>/mes</li>
              </ul>
            </div>
            <div>
              <h3 className="text-sm font-semibold text-foreground mb-2">🚀 Fase Comercial (post-5)</h3>
              <ul className="text-sm text-muted-foreground space-y-1">
                <li>• Precio: <span className="font-semibold text-foreground">${COMMERCIAL_PRICE.toLocaleString('es-CL')}</span>/cliente</li>
                <li>• Comisión cierre: <span className="font-semibold text-foreground">${CLOSE_COMMISSION.toLocaleString('es-CL')}</span></li>
                <li>• Comisión activo: <span className="font-semibold text-foreground">${COMMERCIAL_ACTIVE_COMMISSION.toLocaleString('es-CL')}</span>/mes</li>
              </ul>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Slider */}
      <Card>
        <CardHeader>
          <CardTitle className="text-sm flex items-center gap-2">
            <Calculator className="w-4 h-4" />
            Calculadora de proyección
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div>
            <div className="flex items-center justify-between mb-2">
              <p className="text-sm text-muted-foreground">¿Cuántos clientes?</p>
              <Badge className="text-lg px-3 py-1 bg-primary/10 text-primary border-primary/20">{n}</Badge>
            </div>
            <Slider
              value={projectedClients}
              onValueChange={setProjectedClients}
              min={1}
              max={30}
              step={1}
              className="w-full"
            />
          </div>

          {/* Results */}
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 pt-4 border-t border-border">
            <div className="text-center">
              <DollarSign className="w-5 h-5 text-primary mx-auto mb-1" />
              <p className="text-2xl font-bold text-foreground">${closeTotal.toLocaleString('es-CL')}</p>
              <p className="text-xs text-muted-foreground">Total por cierres</p>
            </div>
            <div className="text-center">
              <TrendingUp className="w-5 h-5 text-primary mx-auto mb-1" />
              <p className="text-2xl font-bold text-foreground">${activeRecurring.toLocaleString('es-CL')}</p>
              <p className="text-xs text-muted-foreground">Recurrente mensual</p>
            </div>
            <div className="text-center">
              <p className="text-2xl font-bold text-primary">${(closeTotal + activeRecurring).toLocaleString('es-CL')}</p>
              <p className="text-xs text-muted-foreground">Total proyectado</p>
            </div>
            <div className="text-center">
              <p className="text-2xl font-bold text-foreground">${totalRevenue.toLocaleString('es-CL')}</p>
              <p className="text-xs text-muted-foreground">Revenue negocio</p>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Month-by-month table */}
      <Card>
        <CardHeader><CardTitle className="text-sm">Proyección mes a mes (1 cierre/mes)</CardTitle></CardHeader>
        <CardContent>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border text-left">
                  <th className="pb-2 font-medium text-muted-foreground">Mes</th>
                  <th className="pb-2 font-medium text-muted-foreground text-center">Clientes acum.</th>
                  <th className="pb-2 font-medium text-muted-foreground text-center">Fase</th>
                  <th className="pb-2 font-medium text-muted-foreground text-right">Cierre</th>
                  <th className="pb-2 font-medium text-muted-foreground text-right">Recurrente</th>
                  <th className="pb-2 font-medium text-muted-foreground text-right">Total mes</th>
                </tr>
              </thead>
              <tbody>
                {monthData.map(m => (
                  <tr key={m.mes} className="border-b border-border/50">
                    <td className="py-2 text-foreground font-medium">{m.mes}</td>
                    <td className="py-2 text-center">{m.clientes}</td>
                    <td className="py-2 text-center">
                      <Badge variant="outline" className={`text-[10px] ${m.fase === 'Piloto' ? 'border-amber-500/30 text-amber-600' : 'border-primary/30 text-primary'}`}>
                        {m.fase}
                      </Badge>
                    </td>
                    <td className="py-2 text-right text-foreground">${m.cierre.toLocaleString('es-CL')}</td>
                    <td className="py-2 text-right text-foreground">${m.recurrente.toLocaleString('es-CL')}</td>
                    <td className="py-2 text-right font-semibold text-primary">${m.total.toLocaleString('es-CL')}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
