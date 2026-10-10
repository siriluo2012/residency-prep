import Link from "next/link";
import { notFound } from "next/navigation";
import { requireRole } from "@/lib/auth";
import { getQueueItem } from "@/lib/queries/review";
import { claim } from "@/lib/review";
import { listTopics } from "@/lib/queries/content";
import { ReviewForm } from "@/components/review/review-form";
import { AnimationEmbed } from "@/components/animations/animation-embed";
import { Badge } from "@/components/ui";
import type { animations, flashcards, oetTasks, questions } from "@/db/schema";

export const metadata = { title: "Review item" };

export default async function ReviewItemPage({ params }: PageProps<"/review/[queueId]">) {
  const { role } = await requireRole("reviewer");
  const { queueId } = await params;
  const data = await getQueueItem(queueId);
  if (!data || !data.item) notFound();
  const { queue, votes, item } = data;
  if (queue.state === "pending") await claim(queueId);

  const examId = (item as { examId?: string }).examId as "usmle-step1" | "usmle-step2ck" | undefined;
  const topics = examId ? await listTopics(examId) : [];
  const canDecide = queue.itemType === "flashcard" || queue.itemType === "oet_task" ? true : role === "physician" || role === "admin";

  return (
    <div className="grid lg:grid-cols-[1fr_360px] gap-6">
      <div className="space-y-4">
        <div className="flex items-center gap-2 text-sm">
          <Link href="/review" className="underline">Queue</Link>
          <span>/</span>
          <Badge>{queue.itemType}</Badge>
          <span className="text-muted-foreground font-mono text-xs">{queue.itemId}</span>
          <Badge tone="info">{(item as { status: string }).status}</Badge>
          {(item as { aiDrafted?: boolean }).aiDrafted && <Badge tone="warn">AI-drafted</Badge>}
          <span className="text-xs text-muted-foreground ml-auto">
            {(item as { source: string; license: string }).source} · {(item as { license: string }).license}
          </span>
        </div>
        {[...queue.autoFlags, ...(((item as { qa?: { flags?: string[] } }).qa?.flags) ?? [])].length > 0 && (
          <div className="flex flex-wrap gap-1">
            {[...queue.autoFlags, ...(((item as { qa?: { flags?: string[] } }).qa?.flags) ?? [])].map((f) => (
              <Badge key={f} tone={f.startsWith("sub_concept") ? "neutral" : "warn"}>{f}</Badge>
            ))}
          </div>
        )}
        {queue.itemType === "animation" && <AnimationEmbed id={queue.itemId} allowDraft />}
        <ReviewForm
          queueId={queue.id}
          itemType={queue.itemType}
          item={JSON.parse(JSON.stringify(item)) as typeof questions.$inferSelect | typeof flashcards.$inferSelect | typeof animations.$inferSelect | typeof oetTasks.$inferSelect}
          topics={topics.map((t) => ({ id: t.id, name: t.name, parentId: t.parentId }))}
          canDecide={canDecide}
        />
      </div>
      <aside className="space-y-4">
        <div className="rounded-lg border border-border p-4 text-sm">
          <h3 className="font-semibold mb-2">History</h3>
          {votes.length === 0 && <p className="text-muted-foreground">No decisions yet.</p>}
          <ul className="space-y-2">
            {votes.map((v) => (
              <li key={v.id} className="border-l-2 border-border pl-2">
                <div className="flex gap-2 items-center">
                  <Badge tone={v.decision === "approve" ? "success" : v.decision === "reject" ? "danger" : "warn"}>{v.decision.replace("_", " ")}</Badge>
                  <span className="text-xs text-muted-foreground">{new Date(v.createdAt).toLocaleString()}</span>
                </div>
                {v.reasons.length > 0 && <p className="text-xs">{v.reasons.join(", ")}</p>}
                {v.comment && <p className="text-xs text-muted-foreground">{v.comment}</p>}
                {v.editedPayload != null && <p className="text-xs italic">edited content</p>}
              </li>
            ))}
          </ul>
        </div>
        <div className="rounded-lg border border-border p-4 text-xs text-muted-foreground space-y-1">
          <p><strong>Checklist</strong></p>
          <p>One defensible answer; distractors plausible and homogeneous.</p>
          <p>No recalled or copyrighted content; stem is original.</p>
          <p>Guideline claims cite body and year.</p>
          <p>Explanation teaches the mechanism, not just the fact.</p>
          <p>For animations: each scene caption is accurate; timing is readable.</p>
        </div>
      </aside>
    </div>
  );
}
