import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

// Temporary diagnostic route for the real-auth increment (Incremento 2 of
// elegant-wobbling-phoenix). Confirms the server client actually reaches the
// real Supabase project. Not part of the product contract — remove once
// Incremento 5 (login) makes it redundant, or keep it clearly marked as
// internal-only if it stays.
export async function GET() {
  const supabase = await createClient();
  const { data, error } = await supabase.auth.getUser();
  return NextResponse.json({ user: data.user, error: error?.message ?? null });
}
