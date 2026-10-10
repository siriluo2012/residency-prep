import { and, eq } from "drizzle-orm";
import { notFound, redirect } from "next/navigation";
import { db } from "@/db";
import { attempts, testBlocks } from "@/db/schema";
import { requireUser } from "@/lib/auth";
import { getQuestionsByIds } from "@/lib/queries/content";
import { BlockRunner, type ClientQuestion } from "@/components/qbank/block-runner";

export const metadata = { title: "Test block" };

export default async function BlockPage({ params }: PageProps<"/qbank/block/[id]">) {
  const user = await requireUser();
  const { id } = await params;
  const [block] = await db.select().from(testBlocks).where(and(eq(testBlocks.id, id), eq(testBlocks.userId, user.id))).limit(1);
  if (!block) notFound();
  if (block.completedAt) redirect(`/qbank/block/${id}/review`);

  const qs = await getQuestionsByIds(block.questionIds);
  const prior = await db.select().from(attempts).where(and(eq(attempts.blockId, id), eq(attempts.userId, user.id)));

  // Never ship answers/explanations to the client; submitAnswer returns them after a response.
  const clientQuestions: ClientQuestion[] = qs.map((q) => ({
    id: q.id,
    stem: q.stem,
    options: q.options.map((o) => ({ label: o.label, text: o.text })),
    media: q.media,
    labValuesUsed: q.labValuesUsed,
  }));

  return (
    <BlockRunner
      blockId={block.id}
      mode={block.mode}
      questions={clientQuestions}
      initialAttempts={prior.map((a) => ({ questionId: a.questionId, selected: a.selectedLabel, isCorrect: a.isCorrect, flagged: a.flagged, struck: a.struck }))}
      timeLimitS={block.timeLimitS}
      startedAtMs={block.startedAt.getTime()}
    />
  );
}
