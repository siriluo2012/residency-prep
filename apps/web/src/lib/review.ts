"use server";
/**
 * Review workflow server actions.
 *
 * Gating rules (docs/CONTENT_POLICY.md section 4):
 *  - questions and animations need a decision from role >= physician
 *  - flashcards and oet tasks need role >= reviewer
 *  - publish requires status=approved, an allow-listed license, and role >= physician (or admin)
 */
import { and, eq, sql } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { canTransition, isPublishableLicense, type ContentStatus, type ItemType } from "@rp/schema";
import { db } from "@/db";
import { animations, flashcards, oetTasks, questions, reviewQueue, reviewVotes } from "@/db/schema";
import { hasRole, requireRole, type Role } from "@/lib/auth";

const TABLE = { question: questions, flashcard: flashcards, animation: animations, oet_task: oetTasks } as const;
const MIN_ROLE: Record<ItemType, Role> = { question: "physician", animation: "physician", flashcard: "reviewer", oet_task: "reviewer" };

const DecideSchema = z.object({
  queueId: z.string().uuid(),
  itemType: z.enum(["question", "flashcard", "animation", "oet_task"]),
  itemId: z.string(),
  decision: z.enum(["approve", "request_changes", "reject"]),
  reasons: z.array(z.string()).default([]),
  comment: z.string().max(4000).optional(),
  editedPayload: z.record(z.string(), z.unknown()).nullable().optional(),
  timeSpentS: z.number().int().min(0).optional(),
});

async function setStatus(itemType: ItemType, itemId: string, to: ContentStatus, reviewedBy?: string) {
  const table = TABLE[itemType];
  const [row] = await db.select({ status: table.status }).from(table).where(eq(table.id, itemId)).limit(1);
  if (!row) throw new Error("item not found");
  if (!canTransition(row.status, to)) throw new Error(`illegal transition ${row.status} -> ${to}`);
  await db
    .update(table)
    .set({ status: to, updatedAt: new Date(), ...(reviewedBy ? { reviewedBy } : {}), ...(to === "published" ? { publishedAt: new Date() } : {}) })
    .where(eq(table.id, itemId));
}

/** Apply reviewer edits to the content row. Only whitelisted fields can be edited. */
async function applyEdits(itemType: ItemType, itemId: string, edited: Record<string, unknown>) {
  const allowed: Record<ItemType, string[]> = {
    question: ["stem", "options", "answerLabel", "explanation", "teachingPoint", "difficulty", "topicId", "questionType", "animationWorthiness"],
    flashcard: ["front", "back", "clozeText", "extra", "tags", "topicId"],
    animation: ["title", "concept", "storyboard", "componentSource", "durationMs", "topicId"],
    oet_task: ["title", "payload", "part"],
  };
  const set: Record<string, unknown> = {};
  for (const k of allowed[itemType]) if (k in edited) set[k] = edited[k];
  if (itemType === "question" && Array.isArray(set.options)) {
    const opts = set.options as { label: string; is_correct: boolean }[];
    const correct = opts.filter((o) => o.is_correct);
    if (correct.length !== 1) throw new Error("exactly one correct option required");
    set.answerLabel = correct[0].label;
  }
  if (Object.keys(set).length) {
    const table = TABLE[itemType];
    await db.update(table).set({ ...set, updatedAt: new Date() }).where(eq(table.id, itemId));
  }
}

export async function decide(input: z.infer<typeof DecideSchema>) {
  const v = DecideSchema.parse(input);
  const { user, role, profile } = await requireRole(MIN_ROLE[v.itemType]);
  if (v.decision !== "approve" && !v.comment && !v.reasons.length) throw new Error("a reason or comment is required");

  if (v.editedPayload) await applyEdits(v.itemType, v.itemId, v.editedPayload);

  await db.insert(reviewVotes).values({
    queueId: v.queueId,
    reviewerId: user.id,
    decision: v.decision,
    reasons: v.reasons,
    comment: v.comment,
    editedPayload: v.editedPayload ?? null,
    timeSpentS: v.timeSpentS,
  });

  const initials = (profile?.displayName ?? user.email ?? "")
    .split(/[\s@.]+/)
    .filter(Boolean)
    .map((s) => s[0]?.toUpperCase())
    .slice(0, 3)
    .join("");

  const nextItem: ContentStatus = v.decision === "approve" ? "approved" : v.decision === "request_changes" ? "changes_requested" : "rejected";
  const nextQueue = v.decision === "approve" ? "approved" : v.decision === "request_changes" ? "changes_requested" : "rejected";
  await setStatus(v.itemType, v.itemId, nextItem, initials);
  await db.update(reviewQueue).set({ state: nextQueue, updatedAt: new Date() }).where(eq(reviewQueue.id, v.queueId));

  // physicians/admins may publish immediately on approve (one-click), others leave it for publish()
  if (v.decision === "approve" && hasRole(role, "physician")) {
    const table = TABLE[v.itemType];
    const [row] = await db.select({ license: table.license }).from(table).where(eq(table.id, v.itemId)).limit(1);
    if (row && isPublishableLicense(row.license)) await setStatus(v.itemType, v.itemId, "published");
  }
  revalidatePath("/review");
  redirect("/review?next=1");
}

export async function publish(itemType: ItemType, itemId: string) {
  await requireRole("physician");
  const table = TABLE[itemType];
  const [row] = await db.select({ license: table.license, status: table.status }).from(table).where(eq(table.id, itemId)).limit(1);
  if (!row) throw new Error("not found");
  if (!isPublishableLicense(row.license)) throw new Error(`license ${row.license} is not publishable`);
  await setStatus(itemType, itemId, "published");
  revalidatePath("/review");
}

export async function unpublish(itemType: ItemType, itemId: string, reason: string) {
  const { user } = await requireRole("physician");
  await setStatus(itemType, itemId, "in_review");
  await db
    .insert(reviewQueue)
    .values({ itemType, itemId, state: "pending", priority: 8, autoFlags: ["unpublished:" + reason.slice(0, 80)] })
    .onConflictDoUpdate({ target: [reviewQueue.itemType, reviewQueue.itemId], set: { state: "pending", priority: 8, updatedAt: new Date() } });
  await db.insert(reviewVotes).values({
    queueId: sql`(select id from review_queue where item_type = ${itemType} and item_id = ${itemId})`,
    reviewerId: user.id,
    decision: "request_changes",
    comment: reason,
  });
  revalidatePath("/review");
}

export async function claim(queueId: string) {
  const { user } = await requireRole("reviewer");
  await db
    .update(reviewQueue)
    .set({ state: "in_progress", assignedTo: user.id, updatedAt: new Date() })
    .where(and(eq(reviewQueue.id, queueId), eq(reviewQueue.state, "pending")));
}
