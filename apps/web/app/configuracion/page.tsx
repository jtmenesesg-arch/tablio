import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { ConfiguracionDashboard } from "./configuracion-dashboard";

export default async function ConfiguracionPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/login");
  }

  return <ConfiguracionDashboard />;
}
