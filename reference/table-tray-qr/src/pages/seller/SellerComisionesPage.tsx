import { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Slider } from '@/components/ui/slider';
import { DollarSign, TrendingUp, Calculator, Award } from 'lucide-react';

const PRICE = 299000;
const CLOSE_COMMISSION = 50000;
const ACTIVE_COMMISSION = 40000;
const BONUS_THRESHOLD = 7;
const BONUS_AMOUNT = 100000;

export default function SellerComisionesPage() {
  const [clients, setClients] = useState([3]);

  const n = clients[0];
  const closeTotal = n * CLOSE_COMMISSION;
  const activeRecurring = n * ACTIVE_COMMISSION;
  const hasBonus = n >= BONUS_THRESHOLD;
  const bonus = hasBonus ? BONUS_AMOUNT : 0;
  const total = closeTotal + activeRecurring + bonus;

  return (
    <div className="p-4 space-y-5 max-w-lg mx-auto">
      <div>
        <h1 className="text-xl font-bold text-foreground">Mis comisiones</h1>
        <p className="text-sm text-muted-foreground">Proyecta tus ingresos según cierres</p>
      </div>

      {/* Commission structure */}
      <Card>
        <CardContent className="p-4 space-y-3">
          <h3 className="text-sm font-semibold text-foreground">Estructura de comisiones</h3>
          <div className="space-y-2 text-sm">
            <div className="flex justify-between">
              <span className="text-muted-foreground">Precio por cliente</span>
              <span className="font-semibold text-foreground">${PRICE.toLocaleString('es-CL')}/mes</span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">Comisión por cierre</span>
              <span className="font-semibold text-primary">${CLOSE_COMMISSION.toLocaleString('es-CL')}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">Comisión cliente activo</span>
              <span className="font-semibold text-primary">${ACTIVE_COMMISSION.toLocaleString('es-CL')}/mes</span>
            </div>
            <div className="flex justify-between items-center">
              <span className="text-muted-foreground flex items-center gap-1"><Award className="w-3 h-3" />Bono ({BONUS_THRESHOLD}+ cierres/mes)</span>
              <span className="font-semibold text-amber-600">${BONUS_AMOUNT.toLocaleString('es-CL')}</span>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Calculator */}
      <Card>
        <CardHeader>
          <CardTitle className="text-sm flex items-center gap-2">
            <Calculator className="w-4 h-4" />
            ¿Cuántos clientes puedo cerrar?
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div>
            <div className="flex items-center justify-between mb-3">
              <p className="text-sm text-muted-foreground">Clientes</p>
              <Badge className="text-lg px-3 py-1 bg-primary/10 text-primary border-primary/20">{n}</Badge>
            </div>
            <Slider value={clients} onValueChange={setClients} min={1} max={15} step={1} />
          </div>

          <div className="space-y-3 pt-4 border-t border-border">
            <div className="flex justify-between items-center">
              <span className="text-sm text-muted-foreground flex items-center gap-2">
                <DollarSign className="w-4 h-4" />Por cierres ({n} × ${CLOSE_COMMISSION.toLocaleString('es-CL')})
              </span>
              <span className="font-semibold text-foreground">${closeTotal.toLocaleString('es-CL')}</span>
            </div>
            <div className="flex justify-between items-center">
              <span className="text-sm text-muted-foreground flex items-center gap-2">
                <TrendingUp className="w-4 h-4" />Recurrente mensual ({n} × ${ACTIVE_COMMISSION.toLocaleString('es-CL')})
              </span>
              <span className="font-semibold text-foreground">${activeRecurring.toLocaleString('es-CL')}</span>
            </div>
            {hasBonus && (
              <div className="flex justify-between items-center">
                <span className="text-sm text-amber-600 flex items-center gap-2">
                  <Award className="w-4 h-4" />🎉 Bono por {BONUS_THRESHOLD}+ cierres
                </span>
                <span className="font-semibold text-amber-600">${BONUS_AMOUNT.toLocaleString('es-CL')}</span>
              </div>
            )}
            <div className="flex justify-between items-center pt-3 border-t border-border">
              <span className="text-sm font-semibold text-foreground">Total proyectado</span>
              <span className="text-xl font-bold text-primary">${total.toLocaleString('es-CL')}</span>
            </div>
          </div>

          {!hasBonus && n >= 5 && (
            <p className="text-xs text-muted-foreground bg-muted p-2 rounded-lg">
              💡 ¡Solo te faltan {BONUS_THRESHOLD - n} cierres más para ganar el bono de ${BONUS_AMOUNT.toLocaleString('es-CL')}!
            </p>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
