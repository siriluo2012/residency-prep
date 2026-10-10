"use server";
/**
 * QBank server actions: build a block, record answers, flag, complete.
 */
import { and, eq, inArray, notInArray, sql } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { db } from "@/db";
import { attempts, questions, testBlocks, topics } from "@/db/schema";
import { requireUser } from "@/lib/auth";
import { descendantIds, getAnimationData, isExamId } from "@/lib/queries/content";
import { flag as featureFlag } from "@/lib/flags";

const BuildSchema = z.object({
  exam: z.string(),
  topics: z.array(z.string()).default([]),
  count: z.coerce.number().int().min(1).max(40).default(20),
  mode: z.enum(["timed", "tutor"]).default("tutor"),
  pool: z.enum(["unused", "incorrect", "flagged", "all"]).default("unused"),
  difficulty: z.array(z.enum(["easy", "medium", "hard"])).default([]),
});

export type BuildInput = z.infer<typeof BuildSchema>;

export async function createBlock(formData: FormData) {
  const user = await requireUser();
  const input = BuildSchema.parse({
    exam: formData.get("exam"),
    topics: formData.getAll("topics").map(String),
    count: formData.get("count"),
    mode: formData.get("mode"),
    pool: formData.get("pool"),
    difficulty: formData.getAll("difficulty").map(String),
  });
  if (!isExamId(input.exam)) throw new Error("bad exam");

  const allTopics = await db.select({ id: topics.id, parentId: topics.parentId }).from(topics).where(eq(topics.examId, input.exam));
  const topicIds = input.topics.flatMap((t) => descendantIds(allTopics, t));

  const paidTier = await featureFlag("paid_tier");
  const conds = [eq(questions.examId, input.exam), eq(questions.status, "published")];
  if (!paidTier) {
    /* all tiers visible while paid tier is off */
  } else {
    conds.push(eq(questions.tier, "free")); // TODO: check subscription when paid tier launches
  }
  if (topicIds.length) conds.push(inArray(questions.topicId, topicIds));
  if (input.difficulty.length) conds.push(inArray(questions.difficulty, input.difficulty));

  // pool filters based on the user's history
  const history = await db
    .select({ questionId: attempts.questionId, isCorrect: attempts.isCorrect, flagged: attempts.flagged })
    .from(attempts)
    .where(eq(attempts.userId, user.id));
  const seen = new Set(history.map((h) => h.questionId));
  const incorrect = new Set(history.filter((h) => h.isCorrect === false).map((h) => h.questionId));
  const flagged = new Set(history.filter((h) => h.flagged).map((h) => h.questionId));
  if (input.pool === "unused" && seen.size) conds.push(notInArray(questions.id, [...seen]));
  if (input.pool === "incorrect") conds.push(incorrect.size ? inArray(questions.id, [...incorrect]) : sql`false`);
  if (input.pool === "flagged") conds.push(flagged.size ? inArray(questions.id, [...flagged]) : sql`false`);

  const pick = await db
    .select({ id: questions.id })
    .from(questions)
    .where(and(...conds))
    .orderBy(sql`random()`)
    .limit(input.count);
  if (!pick.length) redirect(`/qbank?exam=${input.exam}&empty=1`);

  const [block] = await db
    .insert(testBlocks)
    .values({
      userId: user.id,
      examId: input.exam,
      mode: input.mode,
      questionIds: pick.map((p) => p.id),
      filters: { topics: input.topics, pool: input.pool, difficulty: input.difficulty },
      timeLimitS: input.mode === "timed" ? pick.length * 90 : null, // 90 s/question ~ exam pacing
    })
    .returning({ id: testBlocks.id });
  redirect(`/qbank/block/${block.id}`);
}

const AnswerSchema = z.object({
  blockId: z.string().uuid(),
  questionId: z.string(),
  selected: z.enum(["A", "B", "C", "D", "E", "F"]),
  timeMs: z.number().int().min(0).max(3_600_000),
  struck: z.array(z.string()).default([]),
});

export async function submitAnswer(input: z.infer<typeof AnswerSchema>) {
  const user = await requireUser();
  const a = AnswerSchema.parse(input);
  const [q] = await db.select({ answer: questions.answerLabel, options: questions.options, explanation: questions.explanation, teachingPoint: questions.teachingPoint, animationId: questions.animationId }).from(questions).where(eq(questions.id, a.questionId));
  if (!q) throw new Error("question not found");
  const isCorrect = q.answer === a.selected;
  const existing = await db
    .select({ id: attempts.id })
    .from(attempts)
    .where(and(eq(attempts.userId, user.id), eq(attempts.blockId, a.blockId), eq(attempts.questionId, a.questionId)))
    .limit(1);
  if (existing.length) {
    await db.update(attempts).set({ selectedLabel: a.selected, isCorrect, timeMs: a.timeMs, struck: a.struck }).where(eq(attempts.id, existing[0].id));
  } else {
    await db.insert(attempts).values({ userId: user.id, blockId: a.blockId, questionId: a.questionId, selectedLabel: a.selected, isCorrect, timeMs: a.timeMs, struck: a.struck });
  }
  const animation = (await featureFlag("animations")) ? await getAnimationData(q.animationId) : null;
  return { isCorrect, answer: q.answer, options: q.options, explanation: q.explanation, teachingPoint: q.teachingPoint, animation };
}

export async function toggleFlag(blockId: string, questionId: string, flagged: boolean) {
  const user = await requireUser();
  const existing = await db
    .select({ id: attempts.id })
    .from(attempts)
    .where(and(eq(attempts.userId, user.id), eq(attempts.blockId, blockId), eq(attempts.questionId, questionId)))
    .limit(1);
  if (existing.length) await db.update(attempts).set({ flagged }).where(eq(attempts.id, existing[0].id));
  else await db.insert(attempts).values({ userId: user.id, blockId, questionId, flagged });
}

export async function completeBlock(blockId: string) {
  const user = await requireUser();
  await db.update(testBlocks).set({ completedAt: new Date() }).where(and(eq(testBlocks.id, blockId), eq(testBlocks.userId, user.id)));
  revalidatePath("/dashboard");
  redirect(`/qbank/block/${blockId}/review`);
}
