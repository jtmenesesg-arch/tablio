import { useEffect, useState } from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { supabase } from '@/integrations/supabase/client';
import { exportToCSV } from '@/lib/export-utils';
import { PieChart, Pie, Cell, ResponsiveContainer, Tooltip } from 'recharts';
import { Download, Plus, Trash2, DollarSign } from 'lucide-react';
import { toast } from 'sonner';

const PILOT_THRESHOLD = 5;
const PILOT_PRICE = 199000;
const COMMERCIAL_PRICE = 299000;
const CLOSE_COMMISSION = 50000;
const PILOT_ACTIVE_COMMISSION = 30000;
const COMMERCIAL_ACTIVE_COMMISSION = 40000;

// Local storage for expenses (no DB table yet)
const EXPENSES_KEY = 'tablio_expenses';

interface Expense {
  id: string;
  category: string;
  description: string;
  amount: number;
  date: string;
}

const CATEGORIES = ['Salarios', 'Marketing', 'Infraestructura', 'Software', 'Oficina', 'Comisiones', 'Otros'];
const COLORS = [
  'hsl(var(--primary))',
  'hsl(var(--destructive))',
  'hsl(220, 70%, 50%)',
  'hsl(150, 60%, 45%)',
  'hsl(45, 80%, 50%)',
  'hsl(var(--muted-foreground))',
];

export default function FinanzasCostosPage() {
  const [expenses, setExpenses] = useState<Expense[]>(() => {
    try { return JSON.parse(localStorage.getItem(EXPENSES_KEY) || '[]'); } catch { return []; }
  });
  const [newCat, setNewCat] = useState(CATEGORIES[0]);
  const [newDesc, setNewDesc] = useState('');
  const [newAmt, setNewAmt] = useState('');
  const [tenantCount, setTenantCount] = useState(0);
  const [mrr, setMrr] = useState(0);
  const [leadCount, setLeadCount] = useState(0);

  useEffect(() => {
    const load = async () => {
      const [t, l] = await Promise.all([
        supabase.from('tenants').select('plan_id, plan_status, is_active, created_at'),
        supabase.from('leads').select('id, source, stage'),
      ]);
      const tenants = (t.data || []).sort((a: any, b: any) => new Date(a.created_at || '').getTime() - new Date(b.created_at || '').getTime());
      const paying = tenants.filter((x: any) => (x.plan_status === 'active' || x.plan_status === 'paying') && x.is_active !== false);
      setTenantCount(paying.length);
      setMrr(paying.reduce((s: number, _: any, i: number) => s + (i < PILOT_THRESHOLD ? PILOT_PRICE : COMMERCIAL_PRICE), 0));
      setLeadCount((l.data || []).length);

      // Calculate commission costs
      const closedLeads = (l.data || []).filter((x: any) => x.stage === 'cliente_pagando').length;
      const commissionCosts = closedLeads * CLOSE_COMMISSION + paying.reduce((s: number, _: any, i: number) =>
        s + (i < PILOT_THRESHOLD ? PILOT_ACTIVE_COMMISSION : COMMERCIAL_ACTIVE_COMMISSION), 0);

      // Auto-add commission as expense category if not present
      setExpenses(prev => {
        const hasComm = prev.some(e => e.category === 'Comisiones');
        if (!hasComm && commissionCosts > 0) {
          return [...prev, { id: 'auto-comisiones', category: 'Comisiones', description: 'Comisiones vendedores (auto)', amount: commissionCosts, date: new Date().toISOString() }];
        }
        return prev.map(e => e.id === 'auto-comisiones' ? { ...e, amount: commissionCosts } : e);
      });
    };
    load();
  }, []);

  useEffect(() => {
    localStorage.setItem(EXPENSES_KEY, JSON.stringify(expenses));
  }, [expenses]);

  const addExpense = () => {
    const amount = parseFloat(newAmt);
    if (!amount || amount <= 0) { toast.error('Monto inválido'); return; }
    setExpenses(prev => [...prev, {
      id: crypto.randomUUID(),
      category: newCat,
      description: newDesc || newCat,
      amount,
      date: new Date().toISOString(),
    }]);
    setNewDesc('');
    setNewAmt('');
    toast.success('Gasto agregado');
  };

  const removeExpense = (id: string) => setExpenses(prev => prev.filter(e => e.id !== id));

  const totalExpenses = expenses.reduce((s, e) => s + e.amount, 0);
  const grossMargin = mrr > 0 ? Math.round(((mrr - totalExpenses) / mrr) * 100) : 0;

  // CAC
  const marketingSpend = expenses.filter(e => e.category === 'Marketing').reduce((s, e) => s + e.amount, 0);
  const cac = tenantCount > 0 ? Math.round(marketingSpend / tenantCount) : 0;

  // LTV (simplified: avg MRR per client * 12 months avg lifespan)
  const avgMRRPerClient = tenantCount > 0 ? mrr / tenantCount : 299;
  const ltv = Math.round(avgMRRPerClient * 12);
  const ltvCacRatio = cac > 0 ? (ltv / cac).toFixed(1) : '∞';
  const paybackMonths = cac > 0 && avgMRRPerClient > 0 ? (cac / avgMRRPerClient).toFixed(1) : '0';

  // Pie data
  const byCategory = CATEGORIES.map(cat => ({
    name: cat,
    value: expenses.filter(e => e.category === cat).reduce((s, e) => s + e.amount, 0),
  })).filter(c => c.value > 0);

  return (
    <div className="p-6 space-y-6 max-w-6xl">
      <h1 className="text-2xl font-bold text-foreground">Costos y Margen</h1>

      {/* KPIs */}
      <div className="grid grid-cols-1 md:grid-cols-5 gap-4">
        <Card>
          <CardContent className="p-4">
            <p className="text-xs text-muted-foreground font-medium">Margen bruto</p>
            <p className={`text-2xl font-bold mt-1 ${grossMargin >= 50 ? 'text-primary' : 'text-destructive'}`}>{grossMargin}%</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <p className="text-xs text-muted-foreground font-medium">CAC</p>
            <p className="text-2xl font-bold text-foreground mt-1">${cac}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <p className="text-xs text-muted-foreground font-medium">LTV</p>
            <p className="text-2xl font-bold text-foreground mt-1">${ltv.toLocaleString()}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <p className="text-xs text-muted-foreground font-medium">LTV / CAC</p>
            <p className={`text-2xl font-bold mt-1 ${Number(ltvCacRatio) >= 3 ? 'text-primary' : 'text-destructive'}`}>{ltvCacRatio}x</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <p className="text-xs text-muted-foreground font-medium">Payback</p>
            <p className="text-2xl font-bold text-foreground mt-1">{paybackMonths} meses</p>
          </CardContent>
        </Card>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {/* Expense form */}
        <Card>
          <CardContent className="p-4">
            <h2 className="text-sm font-semibold text-foreground mb-3">Registrar gasto</h2>
            <div className="space-y-3">
              <select
                value={newCat}
                onChange={e => setNewCat(e.target.value)}
                className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
              >
                {CATEGORIES.map(c => <option key={c} value={c}>{c}</option>)}
              </select>
              <Input placeholder="Descripción" value={newDesc} onChange={e => setNewDesc(e.target.value)} />
              <Input placeholder="Monto USD" type="number" value={newAmt} onChange={e => setNewAmt(e.target.value)} />
              <Button onClick={addExpense} className="w-full gap-2" size="sm">
                <Plus className="w-3 h-3" /> Agregar gasto
              </Button>
            </div>
          </CardContent>
        </Card>

        {/* Pie chart */}
        <Card>
          <CardContent className="p-4">
            <h2 className="text-sm font-semibold text-foreground mb-3">Gastos por categoría</h2>
            {byCategory.length > 0 ? (
              <div className="h-48">
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart>
                    <Pie data={byCategory} dataKey="value" nameKey="name" cx="50%" cy="50%" outerRadius={70} label={({ name, value }) => `${name}: $${value}`}>
                      {byCategory.map((_, i) => (
                        <Cell key={i} fill={COLORS[i % COLORS.length]} />
                      ))}
                    </Pie>
                    <Tooltip formatter={(v: number) => `$${v.toLocaleString()}`} />
                  </PieChart>
                </ResponsiveContainer>
              </div>
            ) : (
              <p className="text-sm text-muted-foreground text-center py-12">Sin gastos registrados</p>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Expenses table */}
      <Card>
        <CardContent className="p-4">
          <div className="flex items-center justify-between mb-3">
            <h2 className="text-sm font-semibold text-foreground">
              Gastos operacionales ({expenses.length}) — Total: ${totalExpenses.toLocaleString()}
            </h2>
            <Button variant="outline" size="sm" onClick={() => exportToCSV(
              expenses.map(e => ({ Categoría: e.category, Descripción: e.description, Monto: e.amount, Fecha: e.date })),
              'gastos_operacionales'
            )}>
              <Download className="w-3 h-3 mr-1" /> CSV
            </Button>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border text-left">
                  <th className="pb-2 font-medium text-muted-foreground">Categoría</th>
                  <th className="pb-2 font-medium text-muted-foreground">Descripción</th>
                  <th className="pb-2 font-medium text-muted-foreground">Monto</th>
                  <th className="pb-2 font-medium text-muted-foreground"></th>
                </tr>
              </thead>
              <tbody>
                {expenses.map(e => (
                  <tr key={e.id} className="border-b border-border/50">
                    <td className="py-2"><Badge variant="outline" className="text-xs">{e.category}</Badge></td>
                    <td className="py-2 text-foreground">{e.description}</td>
                    <td className="py-2 text-foreground font-medium">${e.amount.toLocaleString()}</td>
                    <td className="py-2">
                      <button onClick={() => removeExpense(e.id)} className="text-muted-foreground hover:text-destructive">
                        <Trash2 className="w-3 h-3" />
                      </button>
                    </td>
                  </tr>
                ))}
                {expenses.length === 0 && (
                  <tr><td colSpan={4} className="py-6 text-center text-muted-foreground">Sin gastos registrados</td></tr>
                )}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
