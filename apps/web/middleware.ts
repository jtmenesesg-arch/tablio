import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";

// Refreshes the Supabase session cookie on every matched request. Only
// touches pages — every existing `/api/*` route is excluded by the matcher
// below so this increment cannot change their behavior at all; none of them
// read Supabase cookies today. Route Handlers added later that do need a
// fresh session call `createClient()` from lib/supabase/server.ts directly.
export async function middleware(request: NextRequest) {
  let response = NextResponse.next({ request });

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet) {
          for (const { name, value } of cookiesToSet) {
            request.cookies.set(name, value);
          }
          response = NextResponse.next({ request });
          for (const { name, value, options } of cookiesToSet) {
            response.cookies.set(name, value, options);
          }
        },
      },
    },
  );

  // Deliberately no logic between createServerClient and getUser(): getUser()
  // is what actually revalidates against Supabase's auth server and triggers
  // the refresh; anything in between risks skipping it under some code path
  // and leaving stale/invalid cookies in place.
  await supabase.auth.getUser();

  return response;
}

export const config = {
  matcher: [
    "/((?!_next/static|_next/image|api/|favicon.ico|manifest.webmanifest|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico)$).*)",
  ],
};
