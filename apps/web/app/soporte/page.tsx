import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { SupportDashboard } from "./support-dashboard";

export default async function SoportePage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/login");
  }

  return <SupportDashboard />;
}
