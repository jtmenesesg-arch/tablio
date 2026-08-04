import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { ReportsDashboard } from "./reports-dashboard";

export default async function ReportesPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/login");
  }

  return <ReportsDashboard />;
}
