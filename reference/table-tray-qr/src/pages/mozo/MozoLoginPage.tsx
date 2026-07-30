import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useWaiters } from "@/contexts/WaitersContext";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Loader2, Mail, Lock } from "lucide-react";

export default function MozoLoginPage() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const navigate = useNavigate();
  const { login } = useWaiters();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");

    if (!email.trim() || !password) {
      setError("Email y contraseña son obligatorios");
      return;
    }

    setLoading(true);

    try {
      // 1. Sign in with Supabase Auth
      const { data: authData, error: authError } = await supabase.auth.signInWithPassword({
        email: email.trim(),
        password,
      });

      if (authError || !authData.user) {
        setError("Email o contraseña incorrectos");
        setLoading(false);
        return;
      }

      // 2. Find staff_users record linked to this auth user
      const { data: staffData, error: staffError } = await supabase
        .from("staff_users")
        .select("id, name, role, branch_id, tenant_id, is_active")
        .eq("auth_user_id", authData.user.id)
        .eq("is_active", true)
        .maybeSingle();

      if (staffError || !staffData) {
        await supabase.auth.signOut();
        setError("No tienes una cuenta de mozo activa. Contacta a tu administrador.");
        setLoading(false);
        return;
      }

      // 3. Login in context
      login({
        staffId: staffData.id,
        staffName: staffData.name,
        role: staffData.role,
        branchId: staffData.branch_id!,
        tenantId: staffData.tenant_id,
      });

      navigate("/mozo/mesas", { replace: true });
    } catch {
      setError("Error de conexión. Intenta de nuevo.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-background flex items-center justify-center px-4">
      <Card className="w-full max-w-sm">
        <CardHeader className="text-center space-y-2 pb-2">
          <h1 className="text-2xl font-extrabold text-foreground">tablio<span className="text-primary">.</span> Mozo</h1>
          <p className="text-sm text-muted-foreground">Ingresa con tu email y contraseña</p>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="space-y-2">
              <Label>Email</Label>
              <div className="relative">
                <Mail className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="tu@email.com"
                  className="pl-9"
                  autoComplete="email"
                />
              </div>
            </div>
            <div className="space-y-2">
              <Label>Contraseña</Label>
              <div className="relative">
                <Lock className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="••••••"
                  className="pl-9"
                  autoComplete="current-password"
                />
              </div>
            </div>
            {error && <p className="text-sm text-destructive">{error}</p>}
            <Button type="submit" className="w-full" disabled={loading}>
              {loading && <Loader2 className="w-4 h-4 animate-spin mr-2" />}
              Iniciar sesión
            </Button>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
