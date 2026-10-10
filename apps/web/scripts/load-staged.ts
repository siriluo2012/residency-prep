/**
 * Load pipeline output (content/staged/*.jsonl) into Postgres and enqueue items for review.
 * Equivalent to `uv run rp push` but in TypeScript, for environments without Python.
 *
 *   npm run db:load-staged            # all files
 *   npm run db:load-staged -- questions.jsonl
 */
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { sql } from "drizzle-orm";
import { db } from "./_db";
import { animations, flashcards, oetTasks, questions, reviewQueue } from "../src/db/schema";
import type { Animation, Flashcard, OetTask, Question } from "@rp/schema";
import { isPublishableLicense } from "@rp/schema";

const stagedDir = resolve(__dirname, "../../../content/staged");

/** Only review-ready items are loaded (same rule as `rp push`); drafts stay in the pipeline. */
function readJsonl<T extends { status?: string }>(file: string): T[] {
  return readFileSync(file, "utf8")
    .split("\n")
    .filter(Boolean)
    .map((l) => JSON.parse(l) as T)
    .filter((r) => r.status === "in_review" || r.status === "approved");
}

async function enqueue(itemType: "question" | "flashcard" | "animation" | "oet_task", itemId: string, flags: string[] = []) {
  await db
    .insert(reviewQueue)
    .values({ itemType, itemId, autoFlags: flags, priority: flags.length ? 5 : 0 })
    .onConflictDoNothing();
}

async function loadQuestions(items: Question[]) {
  let n = 0;
  for (const q of items) {
    if (!isPublishableLicense(q.provenance.license)) {
      console.warn(`skip ${q.id}: license ${q.provenance.license} not allowed`);
      continue;
    }
    await db
      .insert(questions)
      .values({
        id: q.id,
        examId: q.exam_id,
        topicId: q.topic_id,
        topicIds: q.topic_ids ?? [],
        questionType: q.question_type,
        stem: q.stem,
        options: q.options,
        answerLabel: q.answer_label,
        explanation: q.explanation,
        teachingPoint: q.teaching_point,
        labValuesUsed: q.lab_values_used ?? false,
        media: q.media ?? [],
        animationId: q.animation_id ?? null,
        animationWorthiness: q.animation_worthiness ?? 0,
        difficulty: q.difficulty,
        evidence: q.evidence ?? [],
        qa: q.qa,
        source: q.provenance.source,
        sourceRef: q.provenance.source_ref,
        license: q.provenance.license,
        attribution: q.provenance.attribution,
        generatorModel: q.provenance.generator_model,
        generationBatch: q.provenance.generation_batch,
        aiDrafted: q.provenance.ai_drafted ?? false,
        status: q.status === "published" ? "approved" : q.status, // never auto-publish
        tier: q.tier ?? "free",
      })
      .onConflictDoUpdate({ target: questions.id, set: { updatedAt: sql`now()`, qa: sql`excluded.qa` } });
    if (q.status === "in_review") await enqueue("question", q.id, q.qa?.flags ?? []);
    n++;
  }
  return n;
}

async function loadFlashcards(items: Flashcard[]) {
  let n = 0;
  for (const c of items) {
    if (!isPublishableLicense(c.provenance.license)) continue;
    await db
      .insert(flashcards)
      .values({
        id: c.id,
        examId: c.exam_id,
        topicId: c.topic_id,
        questionId: c.question_id ?? null,
        animationId: c.animation_id ?? null,
        kind: c.kind ?? "basic",
        front: c.front,
        back: c.back,
        clozeText: c.cloze_text,
        extra: c.extra,
        tags: c.tags ?? [],
        media: c.media ?? [],
        qa: c.qa,
        source: c.provenance.source,
        sourceRef: c.provenance.source_ref,
        license: c.provenance.license,
        attribution: c.provenance.attribution,
        generatorModel: c.provenance.generator_model,
        generationBatch: c.provenance.generation_batch,
        aiDrafted: c.provenance.ai_drafted ?? false,
        status: c.status === "published" ? "approved" : c.status,
        tier: c.tier ?? "free",
      })
      .onConflictDoNothing();
    if (c.status === "in_review") await enqueue("flashcard", c.id, c.qa?.flags ?? []);
    n++;
  }
  return n;
}

async function loadAnimations(items: Animation[]) {
  let n = 0;
  for (const a of items) {
    if (!isPublishableLicense(a.provenance.license)) continue;
    await db
      .insert(animations)
      .values({
        id: a.id,
        slug: a.slug,
        title: a.title,
        concept: a.concept,
        examId: a.exam_id,
        topicId: a.topic_id,
        questionIds: a.question_ids ?? [],
        storyboard: a.storyboard,
        componentSource: a.component_source,
        durationMs: a.duration_ms,
        loop: a.loop ?? true,
        staticFallbackSvg: a.static_fallback_svg,
        previewUrl: a.preview_url ?? null,
        exportUrls: a.export_urls ?? {},
        renderTest: a.render_test,
        source: a.provenance.source,
        sourceRef: a.provenance.source_ref,
        license: a.provenance.license,
        attribution: a.provenance.attribution,
        generatorModel: a.provenance.generator_model,
        generationBatch: a.provenance.generation_batch,
        aiDrafted: a.provenance.ai_drafted ?? false,
        status: a.status === "published" ? "approved" : a.status,
        tier: a.tier ?? "free",
      })
      .onConflictDoUpdate({
        target: animations.id,
        set: { componentSource: sql`excluded.component_source`, storyboard: sql`excluded.storyboard`, renderTest: sql`excluded.render_test`, updatedAt: sql`now()` },
      });
    const flags = a.render_test && !a.render_test.passed ? ["render_test_failed"] : [];
    if (a.status === "in_review") await enqueue("animation", a.id, flags);
    n++;
  }
  return n;
}

async function loadOet(items: OetTask[]) {
  let n = 0;
  for (const t of items) {
    if (!isPublishableLicense(t.provenance.license)) continue;
    await db
      .insert(oetTasks)
      .values({
        id: t.id,
        subtest: t.subtest,
        part: t.part,
        title: t.title,
        payload: t.payload,
        source: t.provenance.source,
        sourceRef: t.provenance.source_ref,
        license: t.provenance.license,
        attribution: t.provenance.attribution,
        generatorModel: t.provenance.generator_model,
        generationBatch: t.provenance.generation_batch,
        aiDrafted: t.provenance.ai_drafted ?? false,
        status: t.status === "published" ? "approved" : t.status,
        tier: t.tier ?? "free",
      })
      .onConflictDoNothing();
    if (t.status === "in_review") await enqueue("oet_task", t.id);
    n++;
  }
  return n;
}

async function main() {
  const only = process.argv[2];
  const files = readdirSync(stagedDir).filter((f) => f.endsWith(".jsonl") && (!only || f === only));
  for (const f of files) {
    const path = join(stagedDir, f);
    if (!existsSync(path)) continue;
    let n = 0;
    if (f.startsWith("questions")) n = await loadQuestions(readJsonl<Question>(path));
    else if (f.startsWith("flashcards")) n = await loadFlashcards(readJsonl<Flashcard>(path));
    else if (f.startsWith("animations")) n = await loadAnimations(readJsonl<Animation>(path));
    else if (f.startsWith("oet")) n = await loadOet(readJsonl<OetTask>(path));
    else continue;
    console.log(`${f}: loaded ${n}`);
  }
  process.exit(0);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
