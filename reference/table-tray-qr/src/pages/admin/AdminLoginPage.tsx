import { useEffect, useState } from "react";
import { useNavigate, Link } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Loader2 } from "lucide-react";

export default function AdminLoginPage() {
  const navigate = useNavigate();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [checking, setChecking] = useState(true);

  // If already logged in, redirect to their tenant
  useEffect(() => {
    async function check() {
      const { data: { session } } = await supabase.auth.getSession();
      if (session) {
        const slug = await resolveSlug(session.user.id);
        if (slug) {
          navigate(`/admin/${slug}/mesas`, { replace: true });
          return;
        }
      }
      setChecking(false);
    }
    check();
  }, [navigate]);

  const resolveSlug = async (userId: string): Promise<string | null> => {
    const { data: members } = await supabase
      .from("tenant_members")
      .select("tenant_id")
      .eq("user_id", userId)
      .eq("is_active", true);

    if (!members || members.length === 0) return null;

    // Use first tenant (could show selector for multi-tenant later)
    const { data: tenant } = await supabase
      .from("tenants")
      .select("slug")
      .eq("id", members[0].tenant_id)
      .eq("is_active", true)
      .single();

    return tenant?.slug ?? null;
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setSubmitting(true);

    const { data: authData, error: authError } = await supabase.auth.signInWithPassword({ email, password });

    if (authError || !authData.user) {
      setError(authError?.message ?? "Error al iniciar sesión");
      setSubmitting(false);
      return;
    }

    const slug = await resolveSlug(authData.user.id);

    if (!slug) {
      await supabase.auth.signOut();
      setError("No tienes acceso a ningún restaurante");
      setSubmitting(false);
      return;
    }

    navigate(`/admin/${slug}/mesas`, { replace: true });
  };

  if (checking) {
    return (
      <div className="flex h-screen items-center justify-center bg-background">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="flex h-screen items-center justify-center bg-background px-4">
      <Card className="w-full max-w-sm">
        <CardHeader className="text-center space-y-2 pb-2">
          <h1 className="text-xl font-extrabold text-foreground">tablio<span className="text-primary">.</span></h1>
          <p className="text-sm text-muted-foreground">Ingresa con tu cuenta</p>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="email">Email</Label>
              <Input
                id="email"
                type="email"
                value={email}
                onChange={e => setEmail(e.target.value)}
                placeholder="admin@restaurante.cl"
                required
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="password">Contraseña</Label>
              <Input
                id="password"
                type="password"
                value={password}
                onChange={e => setPassword(e.target.value)}
                placeholder="••••••"
                required
              />
            </div>
            {error && <p className="text-sm text-destructive">{error}</p>}
            <Button type="submit" className="w-full" disabled={submitting}>
              {submitting ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : null}
              Entrar
            </Button>
            <div className="text-center">
              <Link to="/admin/forgot-password" className="text-sm text-muted-foreground hover:text-primary">
                ¿Olvidaste tu contraseña?
              </Link>
            </div>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
