import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import { DEV_COOKIE, envDevUser, parseDevCookie } from "@/lib/dev-auth";

export async function createClient() {
  const cookieStore = await cookies();
  return createServerClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!, {
    cookies: {
      getAll() {
        return cookieStore.getAll();
      },
      setAll(cookiesToSet) {
        try {
          cookiesToSet.forEach(({ name, value, options }) => cookieStore.set(name, value, options));
        } catch {
          // Called from a Server Component; middleware refreshes the session instead.
        }
      },
    },
  });
}

export async function getUser(): Promise<{ id: string; email?: string } | null> {
  const cookieStore = await cookies();
  const env = envDevUser();
  if (env) return env;
  const fromCookie = parseDevCookie(cookieStore.get(DEV_COOKIE)?.value);
  if (fromCookie) return fromCookie;
  if (!process.env.NEXT_PUBLIC_SUPABASE_URL) return null;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  return user;
}
