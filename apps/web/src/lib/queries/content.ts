import { and, asc, eq, inArray, sql } from "drizzle-orm";
import { db } from "@/db";
import { animations, exams, flashcards, questions, topics } from "@/db/schema";
import type { ExamId } from "@rp/schema";

export const EXAM_NAMES: Record<ExamId, string> = {
  "usmle-step1": "USMLE Step 1",
  "usmle-step2ck": "USMLE Step 2 CK",
  "oet-medicine": "OET Medicine",
  ecfmg: "ECFMG Certification",
};

export function isExamId(x: unknown): x is ExamId {
  return typeof x === "string" && x in EXAM_NAMES;
}

export async function listExams() {
  return db.select().from(exams);
}

export async function listTopics(examId: ExamId) {
  return db.select().from(topics).where(eq(topics.examId, examId)).orderBy(asc(topics.sortOrder));
}

/** Top-level topics with published-question counts; used by the test builder and analytics. */
export async function topicsWithCounts(examId: ExamId) {
  const ts = await listTopics(examId);
  const counts = await db
    .select({ topicId: questions.topicId, n: sql<number>`count(*)::int` })
    .from(questions)
    .where(and(eq(questions.examId, examId), eq(questions.status, "published")))
    .groupBy(questions.topicId);
  const byTopic = new Map(counts.map((c) => [c.topicId, c.n]));
  // roll leaf counts up to parents
  const total = new Map<string, number>();
  for (const t of ts) {
    let cur: typeof t | undefined = t;
    const n = byTopic.get(t.id) ?? 0;
    while (cur) {
      total.set(cur.id, (total.get(cur.id) ?? 0) + n);
      cur = ts.find((x) => x.id === cur!.parentId);
    }
  }
  return ts.map((t) => ({ ...t, questionCount: total.get(t.id) ?? 0 }));
}

export async function getPublishedQuestion(id: string) {
  const [q] = await db.select().from(questions).where(and(eq(questions.id, id), eq(questions.status, "published"))).limit(1);
  return q ?? null;
}

export async function getQuestionsByIds(ids: string[]) {
  if (!ids.length) return [];
  const rows = await db.select().from(questions).where(inArray(questions.id, ids));
  const byId = new Map(rows.map((r) => [r.id, r]));
  return ids.map((id) => byId.get(id)).filter((x): x is NonNullable<typeof x> => !!x);
}

export async function getAnimation(idOrSlug: string) {
  const [a] = await db
    .select()
    .from(animations)
    .where(and(sql`(${animations.id} = ${idOrSlug} or ${animations.slug} = ${idOrSlug})`, eq(animations.status, "published")))
    .limit(1);
  return a ?? null;
}

export async function listPublishedAnimations(examId?: ExamId) {
  const where = examId ? and(eq(animations.status, "published"), eq(animations.examId, examId)) : eq(animations.status, "published");
  return db.select().from(animations).where(where).orderBy(asc(animations.title));
}

/** Minimal published-animation payload for the explanation panel (safe to send to the client). */
export async function getAnimationData(id: string | null | undefined) {
  if (!id) return null;
  const [a] = await db
    .select({ id: animations.id, title: animations.title, storyboard: animations.storyboard, durationMs: animations.durationMs, staticFallbackSvg: animations.staticFallbackSvg, aiDrafted: animations.aiDrafted })
    .from(animations)
    .where(and(sql`(${animations.id} = ${id} or ${animations.slug} = ${id})`, eq(animations.status, "published")))
    .limit(1);
  return a ?? null;
}

export async function getAnimationDataMap(ids: (string | null)[]) {
  const wanted = [...new Set(ids.filter((x): x is string => !!x))];
  if (!wanted.length) return new Map<string, Awaited<ReturnType<typeof getAnimationData>>>();
  const rows = await db
    .select({ id: animations.id, slug: animations.slug, title: animations.title, storyboard: animations.storyboard, durationMs: animations.durationMs, staticFallbackSvg: animations.staticFallbackSvg, aiDrafted: animations.aiDrafted })
    .from(animations)
    .where(and(eq(animations.status, "published"), sql`(${animations.id} in ${wanted} or ${animations.slug} in ${wanted})`));
  const m = new Map<string, Awaited<ReturnType<typeof getAnimationData>>>();
  for (const r of rows) {
    const { slug, ...data } = r;
    m.set(r.id, data);
    m.set(slug, data);
  }
  return m;
}

export async function getFlashcardsForQuestion(questionId: string) {
  return db.select().from(flashcards).where(and(eq(flashcards.questionId, questionId), eq(flashcards.status, "published")));
}

/** Descendant ids (inclusive) for a topic, so filtering by a parent includes its leaves. */
export function descendantIds(all: { id: string; parentId: string | null }[], rootId: string): string[] {
  const out = [rootId];
  const stack = [rootId];
  while (stack.length) {
    const cur = stack.pop()!;
    for (const t of all) {
      if (t.parentId === cur) {
        out.push(t.id);
        stack.push(t.id);
      }
    }
  }
  return out;
}
