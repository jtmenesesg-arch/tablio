import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Loader2 } from "lucide-react";

export default function AdminGlobalPage() {
  const navigate = useNavigate();
  const [slug, setSlug] = useState("");
  const [checking, setChecking] = useState(true);

  // If already logged in, try to redirect to their tenant
  useEffect(() => {
    async function check() {
      const { data: { session } } = await supabase.auth.getSession();
      if (session) {
        const { data: member } = await supabase
          .from("tenant_members")
          .select("tenant_id")
          .eq("user_id", session.user.id)
          .eq("is_active", true)
          .limit(1)
          .maybeSingle();

        if (member) {
          const { data: tenant } = await supabase
            .from("tenants")
            .select("slug")
            .eq("id", member.tenant_id)
            .single();

          if (tenant) {
            navigate(`/admin/${tenant.slug}/mesas`, { replace: true });
            return;
          }
        }
      }
      setChecking(false);
    }
    check();
  }, [navigate]);

  const go = (e: React.FormEvent) => {
    e.preventDefault();
    if (slug.trim()) {
      navigate(`/admin/${slug.trim().toLowerCase()}/login`);
    }
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
        <CardHeader className="text-center">
          <h1 className="text-xl font-extrabold text-foreground">tablio<span className="text-primary">.</span></h1>
          <p className="text-sm text-muted-foreground">Ingresa el slug de tu restaurante</p>
        </CardHeader>
        <CardContent>
          <form onSubmit={go} className="space-y-4">
            <div className="space-y-2">
              <Label>Slug del restaurante</Label>
              <Input
                value={slug}
                onChange={e => setSlug(e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, ""))}
                placeholder="mi-restaurante"
              />
            </div>
            <Button type="submit" className="w-full" disabled={!slug.trim()}>
              Ir al panel
            </Button>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
