import { eq, or } from "drizzle-orm";
import { type NextRequest, NextResponse } from "next/server";
import { buildAnimationFrameHtml } from "@rp/schema/animation-frame";
import { db } from "@/db";
import { animations, profiles } from "@/db/schema";
import { getUser } from "@/lib/supabase/server";
import { rateLimit } from "@/lib/rate-limit";

/**
 * Serves the sandboxed HTML host for one animation. Published animations are public; drafts are
 * visible only to reviewers/admins (for the review UI).
 */
export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const ip = req.headers.get("x-forwarded-for")?.split(",")[0] ?? "anon";
  const rl = rateLimit(`frame:${ip}`, { capacity: 60, refillPerSec: 1 });
  if (!rl.ok) return new NextResponse("rate limited", { status: 429, headers: { "Retry-After": String(rl.retryAfterS) } });
  const [a] = await db.select().from(animations).where(or(eq(animations.id, id), eq(animations.slug, id))).limit(1);
  if (!a) return new NextResponse("not found", { status: 404 });
  if (a.status !== "published") {
    const user = await getUser();
    if (!user) return new NextResponse("not found", { status: 404 });
    const [p] = await db.select({ role: profiles.role }).from(profiles).where(eq(profiles.userId, user.id)).limit(1);
    if (!p || p.role === "student") return new NextResponse("not found", { status: 404 });
  }
  const sp = req.nextUrl.searchParams;
  const html = buildAnimationFrameHtml(a.componentSource, {
    playing: sp.get("playing") !== "0",
    speed: Number(sp.get("speed") ?? 1) || 1,
    loop: sp.get("loop") !== "0",
    reducedMotion: sp.get("rm") === "1",
  });
  return new NextResponse(html, {
    headers: {
      "Content-Type": "text/html; charset=utf-8",
      "Cache-Control": a.status === "published" ? "public, max-age=3600, s-maxage=86400" : "no-store",
    },
  });
}
