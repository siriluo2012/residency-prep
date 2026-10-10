import { and, asc, desc, eq, inArray, sql } from "drizzle-orm";
import { db } from "@/db";
import { animations, flashcards, oetTasks, questions, reviewQueue, reviewVotes } from "@/db/schema";
import type { ItemType } from "@rp/schema";

export async function queueStats() {
  const rows = await db
    .select({ itemType: reviewQueue.itemType, state: reviewQueue.state, n: sql<number>`count(*)::int` })
    .from(reviewQueue)
    .groupBy(reviewQueue.itemType, reviewQueue.state);
  return rows;
}

export async function listQueue(opts: { itemType?: ItemType; state?: "pending" | "in_progress" | "changes_requested"; limit?: number }) {
  const conds = [];
  if (opts.itemType) conds.push(eq(reviewQueue.itemType, opts.itemType));
  conds.push(opts.state ? eq(reviewQueue.state, opts.state) : inArray(reviewQueue.state, ["pending", "in_progress"]));
  const rows = await db
    .select()
    .from(reviewQueue)
    .where(and(...conds))
    .orderBy(desc(reviewQueue.priority), asc(reviewQueue.createdAt))
    .limit(opts.limit ?? 50);

  // attach a short preview per item
  const byType: Record<string, string[]> = {};
  for (const r of rows) (byType[r.itemType] ??= []).push(r.itemId);
  const preview = new Map<string, { title: string; meta: string; flags: string[] }>();
  if (byType.question?.length) {
    for (const q of await db.select().from(questions).where(inArray(questions.id, byType.question)))
      preview.set(`question:${q.id}`, { title: q.stem.slice(0, 140), meta: `${q.examId} · ${q.topicId} · ${q.source}`, flags: q.qa?.flags ?? [] });
  }
  if (byType.flashcard?.length) {
    for (const c of await db.select().from(flashcards).where(inArray(flashcards.id, byType.flashcard)))
      preview.set(`flashcard:${c.id}`, { title: c.front.slice(0, 140), meta: `${c.examId} · ${c.topicId}`, flags: c.qa?.flags ?? [] });
  }
  if (byType.animation?.length) {
    for (const a of await db.select().from(animations).where(inArray(animations.id, byType.animation)))
      preview.set(`animation:${a.id}`, { title: a.title, meta: `${a.examId} · ${a.topicId} · ${a.durationMs / 1000}s`, flags: a.renderTest && !a.renderTest.passed ? ["render_test_failed"] : [] });
  }
  if (byType.oet_task?.length) {
    for (const t of await db.select().from(oetTasks).where(inArray(oetTasks.id, byType.oet_task)))
      preview.set(`oet_task:${t.id}`, { title: t.title, meta: `${t.subtest}${t.part ? ` · part ${t.part}` : ""}`, flags: [] });
  }
  return rows.map((r) => ({ ...r, preview: preview.get(`${r.itemType}:${r.itemId}`) }));
}

export async function getQueueItem(queueId: string) {
  const [q] = await db.select().from(reviewQueue).where(eq(reviewQueue.id, queueId)).limit(1);
  if (!q) return null;
  const votes = await db.select().from(reviewVotes).where(eq(reviewVotes.queueId, queueId)).orderBy(asc(reviewVotes.createdAt));
  let item: unknown = null;
  if (q.itemType === "question") [item] = await db.select().from(questions).where(eq(questions.id, q.itemId));
  if (q.itemType === "flashcard") [item] = await db.select().from(flashcards).where(eq(flashcards.id, q.itemId));
  if (q.itemType === "animation") [item] = await db.select().from(animations).where(eq(animations.id, q.itemId));
  if (q.itemType === "oet_task") [item] = await db.select().from(oetTasks).where(eq(oetTasks.id, q.itemId));
  return { queue: q, votes, item };
}

/** Next pending item of the same type, for the "save and next" flow. */
export async function nextQueueId(itemType?: ItemType) {
  const conds = [eq(reviewQueue.state, "pending")];
  if (itemType) conds.push(eq(reviewQueue.itemType, itemType));
  const [r] = await db.select({ id: reviewQueue.id }).from(reviewQueue).where(and(...conds)).orderBy(desc(reviewQueue.priority), asc(reviewQueue.createdAt)).limit(1);
  return r?.id ?? null;
}

export async function reviewerThroughput(days = 14) {
  return db
    .select({ day: sql<string>`date_trunc('day', ${reviewVotes.createdAt})::date::text`, decision: reviewVotes.decision, n: sql<number>`count(*)::int` })
    .from(reviewVotes)
    .where(sql`${reviewVotes.createdAt} > now() - make_interval(days => ${days})`)
    .groupBy(sql`1`, reviewVotes.decision)
    .orderBy(sql`1`);
}
