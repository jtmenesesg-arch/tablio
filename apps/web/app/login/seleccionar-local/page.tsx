import { redirect } from "next/navigation";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { createClient } from "@/lib/supabase/server";
import { SelectTenantForm } from "./select-tenant-form";

export default async function SelectTenantPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/login");
  }

  const { data: memberships } = await supabase
    .from("tenant_memberships")
    .select("tenant_id, tenants(display_name)")
    .eq("status", "active");

  if (!memberships || memberships.length === 0) {
    redirect("/login");
  }

  const tenants = memberships.map((m) => ({
    id: m.tenant_id,
    name: (m.tenants as unknown as { display_name: string } | null)
      ?.display_name ?? "Local sin nombre",
  }));

  return (
    <div className="flex min-h-dvh items-center justify-center bg-background p-4">
      <Card className="w-full max-w-sm">
        <CardHeader>
          <CardTitle>¿A qué local quieres entrar?</CardTitle>
        </CardHeader>
        <CardContent>
          <SelectTenantForm tenants={tenants} />
        </CardContent>
      </Card>
    </div>
  );
}
