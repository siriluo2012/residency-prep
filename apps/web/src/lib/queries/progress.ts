import { and, desc, eq, gte, isNotNull, sql } from "drizzle-orm";
import { db } from "@/db";
import { attempts, fsrsCards, fsrsReviews, questions, testBlocks, topics } from "@/db/schema";
import type { ExamId } from "@rp/schema";

export interface SystemStat {
  topicId: string;
  name: string;
  weightMin: number | null;
  weightMax: number | null;
  attempted: number;
  correct: number;
  accuracy: number | null;
  avgTimeMs: number | null;
  available: number;
  /** share of the user's attempts in this system vs. blueprint midpoint share */
  coverageRatio: number | null;
}

export async function systemStats(userId: string, examId: ExamId): Promise<SystemStat[]> {
  const ts = await db.select().from(topics).where(eq(topics.examId, examId));
  const topLevel = ts.filter((t) => !t.parentId);
  const parentOf = new Map(ts.map((t) => [t.id, t.parentId]));
  const rootOf = (id: string) => {
    let cur = id;
    while (parentOf.get(cur)) cur = parentOf.get(cur)!;
    return cur;
  };

  const rows = await db
    .select({ topicId: questions.topicId, isCorrect: attempts.isCorrect, timeMs: attempts.timeMs })
    .from(attempts)
    .innerJoin(questions, eq(questions.id, attempts.questionId))
    .where(and(eq(attempts.userId, userId), eq(questions.examId, examId), isNotNull(attempts.selectedLabel)));
  const avail = await db
    .select({ topicId: questions.topicId, n: sql<number>`count(*)::int` })
    .from(questions)
    .where(and(eq(questions.examId, examId), eq(questions.status, "published")))
    .groupBy(questions.topicId);

  const agg = new Map<string, { attempted: number; correct: number; time: number; timed: number; available: number }>();
  for (const t of topLevel) agg.set(t.id, { attempted: 0, correct: 0, time: 0, timed: 0, available: 0 });
  for (const r of rows) {
    const a = agg.get(rootOf(r.topicId));
    if (!a) continue;
    a.attempted++;
    if (r.isCorrect) a.correct++;
    if (r.timeMs != null) {
      a.time += r.timeMs;
      a.timed++;
    }
  }
  for (const r of avail) {
    const a = agg.get(rootOf(r.topicId));
    if (a) a.available += r.n;
  }
  const totalAttempted = rows.length;
  const totalWeight = topLevel.reduce((s, t) => s + ((t.weightMinPct ?? 0) + (t.weightMaxPct ?? 0)) / 2, 0);

  return topLevel.map((t) => {
    const a = agg.get(t.id)!;
    const mid = ((t.weightMinPct ?? 0) + (t.weightMaxPct ?? 0)) / 2;
    const expectedShare = totalWeight ? mid / totalWeight : null;
    const actualShare = totalAttempted ? a.attempted / totalAttempted : null;
    return {
      topicId: t.id,
      name: t.name,
      weightMin: t.weightMinPct,
      weightMax: t.weightMaxPct,
      attempted: a.attempted,
      correct: a.correct,
      accuracy: a.attempted ? a.correct / a.attempted : null,
      avgTimeMs: a.timed ? a.time / a.timed : null,
      available: a.available,
      coverageRatio: expectedShare && actualShare != null ? actualShare / expectedShare : null,
    };
  });
}

/** Rolling accuracy per completed block (readiness trend). */
export async function blockTrend(userId: string, examId: ExamId, limit = 30) {
  const blocks = await db
    .select({ id: testBlocks.id, startedAt: testBlocks.startedAt, mode: testBlocks.mode, n: sql<number>`jsonb_array_length(${testBlocks.questionIds})::int` })
    .from(testBlocks)
    .where(and(eq(testBlocks.userId, userId), eq(testBlocks.examId, examId), isNotNull(testBlocks.completedAt)))
    .orderBy(desc(testBlocks.startedAt))
    .limit(limit);
  if (!blocks.length) return [];
  const stats = await db
    .select({ blockId: attempts.blockId, correct: sql<number>`count(*) filter (where ${attempts.isCorrect})::int`, answered: sql<number>`count(*) filter (where ${attempts.selectedLabel} is not null)::int`, avgMs: sql<number>`avg(${attempts.timeMs})::int` })
    .from(attempts)
    .where(eq(attempts.userId, userId))
    .groupBy(attempts.blockId);
  const byBlock = new Map(stats.map((s) => [s.blockId, s]));
  return blocks
    .reverse()
    .map((b) => {
      const s = byBlock.get(b.id);
      return { id: b.id, date: b.startedAt, mode: b.mode, n: b.n, answered: s?.answered ?? 0, accuracy: s && s.answered ? s.correct / s.answered : null, avgMs: s?.avgMs ?? null };
    });
}

export async function overallStats(userId: string, examId: ExamId) {
  const [r] = await db
    .select({
      attempted: sql<number>`count(*) filter (where ${attempts.selectedLabel} is not null)::int`,
      correct: sql<number>`count(*) filter (where ${attempts.isCorrect})::int`,
      avgMs: sql<number>`avg(${attempts.timeMs})::int`,
      distinct: sql<number>`count(distinct ${attempts.questionId})::int`,
    })
    .from(attempts)
    .innerJoin(questions, eq(questions.id, attempts.questionId))
    .where(and(eq(attempts.userId, userId), eq(questions.examId, examId)));
  const [total] = await db.select({ n: sql<number>`count(*)::int` }).from(questions).where(and(eq(questions.examId, examId), eq(questions.status, "published")));
  const since = new Date(Date.now() - 7 * 86_400_000);
  const [week] = await db
    .select({ n: sql<number>`count(*)::int` })
    .from(attempts)
    .innerJoin(questions, eq(questions.id, attempts.questionId))
    .where(and(eq(attempts.userId, userId), eq(questions.examId, examId), gte(attempts.createdAt, since), isNotNull(attempts.selectedLabel)));
  const [cardsWeek] = await db.select({ n: sql<number>`count(*)::int` }).from(fsrsReviews).where(and(eq(fsrsReviews.userId, userId), gte(fsrsReviews.reviewedAt, since)));
  const [due] = await db.select({ n: sql<number>`count(*)::int` }).from(fsrsCards).where(and(eq(fsrsCards.userId, userId), eq(fsrsCards.suspended, false), sql`${fsrsCards.due} <= now()`));
  return {
    attempted: r?.attempted ?? 0,
    correct: r?.correct ?? 0,
    accuracy: r && r.attempted ? r.correct / r.attempted : null,
    avgMs: r?.avgMs ?? null,
    distinct: r?.distinct ?? 0,
    total: total?.n ?? 0,
    questionsThisWeek: week?.n ?? 0,
    cardsThisWeek: cardsWeek?.n ?? 0,
    cardsDue: due?.n ?? 0,
  };
}

/**
 * Study planner: given exam date and remaining unseen questions, propose a daily question target and
 * a blueprint-weighted system order (weakest high-weight systems first).
 */
export function buildPlan(opts: { examDate: Date | null; remainingQuestions: number; systems: SystemStat[]; dailyGoal: number }) {
  const daysLeft = opts.examDate ? Math.max(1, Math.ceil((opts.examDate.getTime() - Date.now()) / 86_400_000)) : null;
  const reviewBufferDays = daysLeft ? Math.min(7, Math.floor(daysLeft * 0.15)) : 0;
  const studyDays = daysLeft ? Math.max(1, daysLeft - reviewBufferDays) : null;
  const dailyNeeded = studyDays ? Math.ceil(opts.remainingQuestions / studyDays) : opts.dailyGoal;
  const focus = [...opts.systems]
    .filter((s) => s.available > 0)
    .map((s) => {
      const mid = ((s.weightMin ?? 0) + (s.weightMax ?? 0)) / 2;
      const weakness = s.accuracy == null ? 0.5 : 1 - s.accuracy; // unseen systems count as medium weakness
      const underCovered = s.coverageRatio == null ? 1 : Math.max(0, 1 - s.coverageRatio);
      return { ...s, priority: mid * (0.6 * weakness + 0.4 * underCovered + 0.2) };
    })
    .sort((a, b) => b.priority - a.priority);
  return { daysLeft, studyDays, reviewBufferDays, dailyNeeded: Math.max(dailyNeeded, 10), focus: focus.slice(0, 5) };
}
