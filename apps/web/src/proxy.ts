import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";
import { DEV_COOKIE, envDevUser, parseDevCookie } from "@/lib/dev-auth";

const PROTECTED = ["/dashboard", "/qbank", "/flashcards", "/oet/practice", "/review", "/settings"];

export async function proxy(request: NextRequest) {
  let response = NextResponse.next({ request });
  // local login (env RP_DEV_USER_ID or cookie); never active in production
  if (envDevUser() || parseDevCookie(request.cookies.get(DEV_COOKIE)?.value)) return response;
  if (!process.env.NEXT_PUBLIC_SUPABASE_URL) {
    const path = request.nextUrl.pathname;
    if (PROTECTED.some((p) => path.startsWith(p))) {
      const url = request.nextUrl.clone();
      url.pathname = "/login";
      url.searchParams.set("next", path);
      return NextResponse.redirect(url);
    }
    return response;
  }

  const supabase = createServerClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!, {
    cookies: {
      getAll: () => request.cookies.getAll(),
      setAll(cookiesToSet) {
        cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value));
        response = NextResponse.next({ request });
        cookiesToSet.forEach(({ name, value, options }) => response.cookies.set(name, value, options));
      },
    },
  });

  const {
    data: { user },
  } = await supabase.auth.getUser();

  const path = request.nextUrl.pathname;
  if (!user && PROTECTED.some((p) => path.startsWith(p))) {
    const url = request.nextUrl.clone();
    url.pathname = "/login";
    url.searchParams.set("next", path);
    return NextResponse.redirect(url);
  }
  return response;
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico|api/public|.*\\.(?:svg|png|jpg|jpeg|gif|webp|webm|mp4)$).*)"],
};
