"use server";
import { and, asc, eq, gt, inArray, isNull, lte, notInArray, or, sql } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { db } from "@/db";
import { flashcards, fsrsCards, fsrsReviews, topics } from "@/db/schema";
import { requireUser } from "@/lib/auth";
import { applyRating, newCardRow, previewIntervals, type FsrsRating } from "@/lib/fsrs";
import { descendantIds, isExamId } from "@/lib/queries/content";

export interface StudyCard {
  flashcardId: string;
  front: string;
  back: string;
  kind: string;
  clozeText: string | null;
  extra: string | null;
  tags: string[];
  questionId: string | null;
  animationId: string | null;
  isNew: boolean;
  intervals: Record<FsrsRating, string>;
}

/** Build today's queue: due reviews first, then up to `newLimit` new cards. */
export async function getStudyQueue(opts: { exam: string; topic?: string; newLimit?: number; reviewLimit?: number }): Promise<StudyCard[]> {
  const user = await requireUser();
  if (!isExamId(opts.exam)) throw new Error("bad exam");
  const now = new Date();
  const newLimit = opts.newLimit ?? 20;
  const reviewLimit = opts.reviewLimit ?? 200;

  let topicIds: string[] | null = null;
  if (opts.topic) {
    const all = await db.select({ id: topics.id, parentId: topics.parentId }).from(topics).where(eq(topics.examId, opts.exam));
    topicIds = descendantIds(all, opts.topic);
  }
  const cardWhere = [eq(flashcards.examId, opts.exam), eq(flashcards.status, "published")];
  if (topicIds) cardWhere.push(inArray(flashcards.topicId, topicIds));

  // due reviews
  const due = await db
    .select({ card: flashcards, state: fsrsCards })
    .from(fsrsCards)
    .innerJoin(flashcards, eq(flashcards.id, fsrsCards.flashcardId))
    .where(
      and(
        eq(fsrsCards.userId, user.id),
        eq(fsrsCards.suspended, false),
        or(isNull(fsrsCards.buriedUntil), lte(fsrsCards.buriedUntil, now)),
        lte(fsrsCards.due, now),
        ...cardWhere,
      ),
    )
    .orderBy(asc(fsrsCards.due))
    .limit(reviewLimit);

  // new cards (no fsrs row yet)
  const seen = await db.select({ id: fsrsCards.flashcardId }).from(fsrsCards).where(eq(fsrsCards.userId, user.id));
  const seenIds = seen.map((s) => s.id);
  const fresh = await db
    .select()
    .from(flashcards)
    .where(and(...cardWhere, seenIds.length ? notInArray(flashcards.id, seenIds) : sql`true`))
    .orderBy(sql`random()`)
    .limit(newLimit);

  const toStudy = (c: typeof flashcards.$inferSelect, state: typeof fsrsCards.$inferSelect | null): StudyCard => {
    const row = state ?? { ...newCardRow(now), userId: user.id, flashcardId: c.id, suspended: false, buriedUntil: null };
    const iv = previewIntervals(row, now);
    return {
      flashcardId: c.id,
      front: c.front,
      back: c.back,
      kind: c.kind,
      clozeText: c.clozeText,
      extra: c.extra,
      tags: c.tags,
      questionId: c.questionId,
      animationId: c.animationId,
      isNew: !state,
      intervals: { 1: iv[1].label, 2: iv[2].label, 3: iv[3].label, 4: iv[4].label },
    };
  };
  return [...due.map((d) => toStudy(d.card, d.state)), ...fresh.map((c) => toStudy(c, null))];
}

const RateSchema = z.object({ flashcardId: z.string(), rating: z.union([z.literal(1), z.literal(2), z.literal(3), z.literal(4)]) });

export async function rateCard(input: z.infer<typeof RateSchema>) {
  const user = await requireUser();
  const { flashcardId, rating } = RateSchema.parse(input);
  const now = new Date();
  const [existing] = await db.select().from(fsrsCards).where(and(eq(fsrsCards.userId, user.id), eq(fsrsCards.flashcardId, flashcardId))).limit(1);
  const base = existing ?? { ...newCardRow(now), userId: user.id, flashcardId, suspended: false, buriedUntil: null };
  const { card, log } = applyRating(base, rating, now);
  if (existing) {
    await db.update(fsrsCards).set(card).where(and(eq(fsrsCards.userId, user.id), eq(fsrsCards.flashcardId, flashcardId)));
  } else {
    await db.insert(fsrsCards).values({ userId: user.id, flashcardId, ...card });
  }
  await db.insert(fsrsReviews).values({ userId: user.id, flashcardId, ...log });
  // next-interval preview for the UI
  const iv = previewIntervals({ ...base, ...card }, now);
  return { due: card.due.toISOString(), next: { 1: iv[1].label, 2: iv[2].label, 3: iv[3].label, 4: iv[4].label } };
}

export async function suspendCard(flashcardId: string, suspended: boolean) {
  const user = await requireUser();
  const [existing] = await db.select({ id: fsrsCards.flashcardId }).from(fsrsCards).where(and(eq(fsrsCards.userId, user.id), eq(fsrsCards.flashcardId, flashcardId))).limit(1);
  if (existing) await db.update(fsrsCards).set({ suspended }).where(and(eq(fsrsCards.userId, user.id), eq(fsrsCards.flashcardId, flashcardId)));
  else await db.insert(fsrsCards).values({ userId: user.id, flashcardId, ...newCardRow(), suspended });
  revalidatePath("/flashcards");
}

export async function buryCard(flashcardId: string) {
  const user = await requireUser();
  const tomorrow = new Date();
  tomorrow.setHours(24, 0, 0, 0);
  const [existing] = await db.select({ id: fsrsCards.flashcardId }).from(fsrsCards).where(and(eq(fsrsCards.userId, user.id), eq(fsrsCards.flashcardId, flashcardId))).limit(1);
  if (existing) await db.update(fsrsCards).set({ buriedUntil: tomorrow }).where(and(eq(fsrsCards.userId, user.id), eq(fsrsCards.flashcardId, flashcardId)));
  else await db.insert(fsrsCards).values({ userId: user.id, flashcardId, ...newCardRow(), buriedUntil: tomorrow });
}

export async function deckSummary(exam: string) {
  const user = await requireUser();
  if (!isExamId(exam)) throw new Error("bad exam");
  const now = new Date();
  const [published] = await db.select({ n: sql<number>`count(*)::int` }).from(flashcards).where(and(eq(flashcards.examId, exam), eq(flashcards.status, "published")));
  const [dueN] = await db
    .select({ n: sql<number>`count(*)::int` })
    .from(fsrsCards)
    .innerJoin(flashcards, eq(flashcards.id, fsrsCards.flashcardId))
    .where(and(eq(fsrsCards.userId, user.id), eq(flashcards.examId, exam), eq(fsrsCards.suspended, false), lte(fsrsCards.due, now)));
  const [learned] = await db
    .select({ n: sql<number>`count(*)::int` })
    .from(fsrsCards)
    .innerJoin(flashcards, eq(flashcards.id, fsrsCards.flashcardId))
    .where(and(eq(fsrsCards.userId, user.id), eq(flashcards.examId, exam), gt(fsrsCards.reps, 0)));
  const byTopic = await db
    .select({ topicId: flashcards.topicId, n: sql<number>`count(*)::int` })
    .from(flashcards)
    .where(and(eq(flashcards.examId, exam), eq(flashcards.status, "published")))
    .groupBy(flashcards.topicId);
  return { published: published?.n ?? 0, due: dueN?.n ?? 0, learned: learned?.n ?? 0, byTopic };
}
