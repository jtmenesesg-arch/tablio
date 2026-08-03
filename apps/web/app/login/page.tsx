import { redirect } from "next/navigation";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { createClient } from "@/lib/supabase/server";
import { LoginForm } from "./login-form";

function hasTenantClaim(accessToken: string | undefined): boolean {
  if (!accessToken) return false;
  const payload = accessToken.split(".")[1];
  if (!payload) return false;
  try {
    const claims = JSON.parse(
      Buffer.from(payload, "base64url").toString("utf8"),
    ) as { tenant_id?: string };
    return Boolean(claims.tenant_id);
  } catch {
    return false;
  }
}

export default async function LoginPage() {
  const supabase = await createClient();
  const {
    data: { session },
  } = await supabase.auth.getSession();

  if (session && hasTenantClaim(session.access_token)) {
    redirect("/dueno-real");
  }

  return (
    <div className="flex min-h-dvh items-center justify-center bg-background p-4">
      <Card className="w-full max-w-sm">
        <CardHeader>
          <CardTitle>Entrar a Tablio</CardTitle>
        </CardHeader>
        <CardContent>
          <LoginForm />
        </CardContent>
      </Card>
    </div>
  );
}
