import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { TeamDashboard } from "./team-dashboard";

export default async function EquipoPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/login");
  }

  return <TeamDashboard />;
}
