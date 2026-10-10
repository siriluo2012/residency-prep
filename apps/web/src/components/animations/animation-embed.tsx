import { eq, or } from "drizzle-orm";
import { db } from "@/db";
import { animations } from "@/db/schema";
import { flag } from "@/lib/flags";
import { AnimationPlayer } from "./animation-player";

/** Server component: look up an animation by id/slug and render the player if published (or allowDraft). */
export async function AnimationEmbed({ id, allowDraft = false }: { id: string; allowDraft?: boolean }) {
  if (!(await flag("animations"))) return null;
  const [a] = await db.select().from(animations).where(or(eq(animations.id, id), eq(animations.slug, id))).limit(1);
  if (!a || (!allowDraft && a.status !== "published")) return null;
  return (
    <div className="space-y-1">
      <AnimationPlayer id={a.id} title={a.title} storyboard={a.storyboard} durationMs={a.durationMs} staticFallbackSvg={a.staticFallbackSvg} />
      <p className="text-xs text-muted-foreground">
        {a.title}
        {a.aiDrafted && " · AI-generated animation, physician-reviewed"}
      </p>
    </div>
  );
}
