import { useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent } from '@/components/ui/card';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { UserPlus } from 'lucide-react';

export default function BackofficeJoinPage() {
  const { token } = useParams<{ token: string }>();
  const navigate = useNavigate();
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim() || !email.trim() || !password) {
      setError('Todos los campos son obligatorios');
      return;
    }
    if (password.length < 6) {
      setError('La contraseña debe tener al menos 6 caracteres');
      return;
    }

    setLoading(true);
    setError('');

    const { data, error: fnError } = await supabase.functions.invoke('register-seller', {
      body: { email: email.trim(), password, name: name.trim(), token },
    });

    if (fnError || data?.error) {
      setError(data?.error || fnError?.message || 'Error al registrarse');
      setLoading(false);
      return;
    }

    setSuccess(true);
    toast.success('Registro exitoso');
    setLoading(false);

    // Auto login
    const { error: loginError } = await supabase.auth.signInWithPassword({ email: email.trim(), password });
    if (!loginError) {
      setTimeout(() => navigate('/vendedor'), 1000);
    }
  };

  if (success) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background px-4">
        <Card className="max-w-sm w-full">
          <CardContent className="p-6 text-center space-y-3">
            <div className="text-4xl">🎉</div>
            <h2 className="text-lg font-bold text-foreground">¡Registro exitoso!</h2>
            <p className="text-sm text-muted-foreground">Ya eres parte del equipo Tablio. Redirigiendo...</p>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-background px-4">
      <form onSubmit={handleSubmit} className="w-full max-w-sm space-y-4">
        <div className="text-center mb-6">
          <h1 className="text-2xl font-bold text-foreground tracking-tight">Tablio</h1>
          <Badge className="bg-primary text-primary-foreground mt-1">Únete al equipo</Badge>
        </div>
        <Input placeholder="Tu nombre completo" value={name} onChange={e => setName(e.target.value)} required />
        <Input placeholder="Email" type="email" value={email} onChange={e => setEmail(e.target.value)} required />
        <Input placeholder="Contraseña (mín. 6 caracteres)" type="password" value={password} onChange={e => setPassword(e.target.value)} required />
        {error && <p className="text-destructive text-sm">{error}</p>}
        <Button type="submit" className="w-full gap-2" disabled={loading}>
          <UserPlus className="w-4 h-4" />
          {loading ? 'Registrando...' : 'Unirme al equipo'}
        </Button>
      </form>
    </div>
  );
}
