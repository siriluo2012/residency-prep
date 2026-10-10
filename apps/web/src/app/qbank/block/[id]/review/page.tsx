import { and, eq } from "drizzle-orm";
import Link from "next/link";
import { notFound } from "next/navigation";
import { db } from "@/db";
import { attempts, testBlocks, topics } from "@/db/schema";
import { requireUser } from "@/lib/auth";
import { getAnimationDataMap, getQuestionsByIds } from "@/lib/queries/content";
import { Explanation } from "@/components/qbank/explanation";
import { Badge, Card } from "@/components/ui";
import { formatDuration } from "@/lib/utils";

export const metadata = { title: "Block review" };

export default async function BlockReviewPage({ params }: PageProps<"/qbank/block/[id]/review">) {
  const user = await requireUser();
  const { id } = await params;
  const [block] = await db.select().from(testBlocks).where(and(eq(testBlocks.id, id), eq(testBlocks.userId, user.id))).limit(1);
  if (!block) notFound();
  const qs = await getQuestionsByIds(block.questionIds);
  const anims = await getAnimationDataMap(qs.map((q) => q.animationId));
  const atts = await db.select().from(attempts).where(and(eq(attempts.blockId, id), eq(attempts.userId, user.id)));
  const topicRows = await db.select().from(topics).where(eq(topics.examId, block.examId));
  const topicName = (tid: string) => topicRows.find((t) => t.id === tid)?.name ?? tid;
  const byQ = new Map(atts.map((a) => [a.questionId, a]));
  const answered = atts.filter((a) => a.selectedLabel);
  const correct = answered.filter((a) => a.isCorrect).length;
  const totalMs = answered.reduce((s, a) => s + (a.timeMs ?? 0), 0);

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center gap-4">
        <h1 className="text-2xl font-semibold">Block review</h1>
        <Badge tone={correct / Math.max(answered.length, 1) >= 0.7 ? "success" : "warn"}>
          {correct}/{qs.length} correct ({Math.round((correct / Math.max(qs.length, 1)) * 100)}%)
        </Badge>
        <span className="text-sm text-muted-foreground">
          {formatDuration(totalMs)} total · {answered.length ? formatDuration(totalMs / answered.length) : "–"} per question
        </span>
        <Link href="/qbank" className="ml-auto text-sm underline">New block</Link>
        <Link href="/dashboard" className="text-sm underline">Dashboard</Link>
      </div>

      <ol className="space-y-6">
        {qs.map((q, i) => {
          const a = byQ.get(q.id);
          return (
            <li key={q.id}>
              <Card className="space-y-3">
                <div className="flex items-center gap-2 text-xs text-muted-foreground">
                  <span className="font-medium text-foreground">Question {i + 1}</span>
                  <span>· {topicName(q.topicId)}</span>
                  <span>· {q.difficulty}</span>
                  {a?.flagged && <Badge tone="warn">Flagged</Badge>}
                  {a?.timeMs != null && <span>· {formatDuration(a.timeMs)}</span>}
                  {q.aiDrafted && <span>· AI-drafted, physician-reviewed{q.reviewedBy ? ` by ${q.reviewedBy}` : ""}</span>}
                  {q.attribution && <span>· {q.attribution}</span>}
                </div>
                <p className="text-[15px] leading-7">{q.stem}</p>
                <Explanation
                  questionId={q.id}
                  isCorrect={a?.isCorrect ?? null}
                  selected={a?.selectedLabel ?? null}
                  answer={q.answerLabel}
                  options={q.options}
                  explanation={q.explanation}
                  teachingPoint={q.teachingPoint}
                  animation={(q.animationId && anims.get(q.animationId)) || null}
                />
              </Card>
            </li>
          );
        })}
      </ol>
    </div>
  );
}
