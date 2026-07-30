import { useEffect, useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Loader2, CheckCircle2, Mail, Lock, User } from "lucide-react";

export default function MozoJoinPage() {
  const { token } = useParams<{ token: string }>();
  const navigate = useNavigate();
  const [loading, setLoading] = useState(true);
  const [invitation, setInvitation] = useState<{
    id: string;
    tenant_id: string;
    branch_id: string;
    role: string;
    tenantName: string;
  } | null>(null);
  const [expired, setExpired] = useState(false);
  const [used, setUsed] = useState(false);
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);
  const [success, setSuccess] = useState(false);

  useEffect(() => {
    async function load() {
      if (!token) return;
      const { data } = await supabase
        .from("staff_invitations")
        .select("id, tenant_id, branch_id, role, expires_at, used_at")
        .eq("token", token)
        .maybeSingle();

      if (!data) {
        setExpired(true);
        setLoading(false);
        return;
      }

      if (data.used_at) {
        setUsed(true);
        setLoading(false);
        return;
      }

      if (new Date(data.expires_at) < new Date()) {
        setExpired(true);
        setLoading(false);
        return;
      }

      const { data: tenant } = await supabase
        .from("tenants")
        .select("name")
        .eq("id", data.tenant_id)
        .single();

      setInvitation({
        id: data.id,
        tenant_id: data.tenant_id,
        branch_id: data.branch_id,
        role: data.role,
        tenantName: tenant?.name ?? "Restaurante",
      });
      setLoading(false);
    }
    load();
  }, [token]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!invitation || !token) return;
    setError("");

    if (!name.trim()) { setError("Nombre obligatorio"); return; }
    if (!email.trim()) { setError("Email obligatorio"); return; }
    if (password.length < 6) { setError("La contraseña debe tener al menos 6 caracteres"); return; }

    setSaving(true);

    try {
      const { data, error: fnError } = await supabase.functions.invoke("register-waiter", {
        body: { email: email.trim(), password, name: name.trim(), token },
      });

      if (fnError || data?.error) {
        setError(data?.error || fnError?.message || "Error al registrarse");
        setSaving(false);
        return;
      }

      setSuccess(true);
      setSaving(false);
    } catch {
      setError("Error de conexión. Intenta de nuevo.");
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <div className="flex h-screen items-center justify-center bg-background">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (expired || used) {
    return (
      <div className="flex h-screen items-center justify-center bg-background px-4">
        <Card className="w-full max-w-sm">
          <CardContent className="pt-6 text-center">
            <p className="text-lg font-semibold text-foreground">
              {used ? "Invitación ya utilizada" : "Invitación expirada"}
            </p>
            <p className="text-sm text-muted-foreground mt-2">
              {used ? "Este enlace ya fue usado." : "Este enlace ha expirado. Pide uno nuevo a tu administrador."}
            </p>
          </CardContent>
        </Card>
      </div>
    );
  }

  if (success) {
    return (
      <div className="flex h-screen items-center justify-center bg-background px-4">
        <Card className="w-full max-w-sm">
          <CardContent className="pt-6 text-center space-y-4">
            <CheckCircle2 className="h-12 w-12 text-primary mx-auto" />
            <p className="text-lg font-semibold text-foreground">¡Registro exitoso!</p>
            <p className="text-sm text-muted-foreground">Ya puedes ingresar con tu email y contraseña.</p>
            <Button onClick={() => navigate("/mozo/login")} className="w-full">
              Ir al login de mozo
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="flex h-screen items-center justify-center bg-background px-4">
      <Card className="w-full max-w-sm">
        <CardHeader className="text-center space-y-2 pb-2">
          <h1 className="text-xl font-bold text-foreground">{invitation?.tenantName}</h1>
          <p className="text-sm text-muted-foreground">Te han invitado a unirte al equipo</p>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="space-y-2">
              <Label>Tu nombre</Label>
              <div className="relative">
                <User className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input value={name} onChange={e => setName(e.target.value)} placeholder="Juan Pérez" className="pl-9" />
              </div>
            </div>
            <div className="space-y-2">
              <Label>Email</Label>
              <div className="relative">
                <Mail className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input type="email" value={email} onChange={e => setEmail(e.target.value)} placeholder="juan@email.com" className="pl-9" />
              </div>
            </div>
            <div className="space-y-2">
              <Label>Contraseña</Label>
              <div className="relative">
                <Lock className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input type="password" value={password} onChange={e => setPassword(e.target.value)} placeholder="Mínimo 6 caracteres" className="pl-9" />
              </div>
            </div>
            {error && <p className="text-sm text-destructive">{error}</p>}
            <Button type="submit" className="w-full" disabled={saving}>
              {saving ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : null}
              Unirme al equipo
            </Button>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
