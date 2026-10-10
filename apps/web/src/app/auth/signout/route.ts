import { NextResponse, type NextRequest } from "next/server";
import { DEV_COOKIE } from "@/lib/dev-auth";
import { createClient } from "@/lib/supabase/server";

export async function POST(request: NextRequest) {
  const res = NextResponse.redirect(new URL("/", request.url), { status: 303 });
  res.cookies.delete(DEV_COOKIE);
  if (process.env.NEXT_PUBLIC_SUPABASE_URL) {
    const supabase = await createClient();
    await supabase.auth.signOut();
  }
  return res;
}
