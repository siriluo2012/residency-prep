import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { and, eq, sql } from "drizzle-orm";
import { db } from "@/db";
import { animations, questions, topics } from "@/db/schema";
import { EXAM_NAMES, isExamId } from "@/lib/queries/content";
import { flag } from "@/lib/flags";
import { Badge, Card } from "@/components/ui";
import { AnimationPlayer } from "@/components/animations/animation-player";

/**
 * Public, indexable topic page: one sample question with explanation and one animation, plus counts.
 * Gated by the public_sample_pages feature flag.
 */

export async function generateMetadata({ params }: PageProps<"/topics/[exam]/[topic]">): Promise<Metadata> {
  const { exam, topic } = await params;
  if (!isExamId(exam)) return {};
  const [t] = await db.select().from(topics).where(and(eq(topics.examId, exam), eq(topics.id, topic))).limit(1).catch(() => []);
  return t ? { title: `${t.name} · ${EXAM_NAMES[exam]} practice`, description: `Free, physician-reviewed ${EXAM_NAMES[exam]} practice questions, flashcards and animations for ${t.name}.` } : {};
}

export default async function TopicPage({ params }: PageProps<"/topics/[exam]/[topic]">) {
  const { exam, topic } = await params;
  if (!isExamId(exam) || !(await flag("public_sample_pages"))) notFound();
  const [t] = await db.select().from(topics).where(and(eq(topics.examId, exam), eq(topics.id, topic))).limit(1);
  if (!t) notFound();
  const [count] = await db.select({ n: sql<number>`count(*)::int` }).from(questions).where(and(eq(questions.examId, exam), eq(questions.topicId, topic), eq(questions.status, "published")));
  // deterministic sample: the earliest published question, so the page is stable for search engines
  const [sample] = await db.select().from(questions).where(and(eq(questions.examId, exam), eq(questions.topicId, topic), eq(questions.status, "published"))).orderBy(questions.publishedAt).limit(1);
  const [anim] = await db.select().from(animations).where(and(eq(animations.examId, exam), eq(animations.topicId, topic), eq(animations.status, "published"))).orderBy(animations.publishedAt).limit(1);

  return (
    <article className="max-w-3xl mx-auto space-y-6">
      <div>
        <div className="flex items-center gap-2 text-sm text-muted-foreground mb-1"><Badge>{EXAM_NAMES[exam]}</Badge>{t.weightMinPct != null && <span>{t.weightMinPct}–{t.weightMaxPct}% of the exam</span>}</div>
        <h1 className="text-2xl font-semibold">{t.name}</h1>
        {t.description && <p className="text-muted-foreground mt-1">{t.description}</p>}
        <p className="text-sm mt-2">{count?.n ?? 0} physician-reviewed questions available free. <Link className="underline" href={`/qbank?exam=${exam}`}>Start a block</Link>.</p>
      </div>
      {anim && (
        <section>
          <h2 className="font-semibold mb-2">Watch: {anim.title}</h2>
          <AnimationPlayer id={anim.id} title={anim.title} storyboard={anim.storyboard} durationMs={anim.durationMs} staticFallbackSvg={anim.staticFallbackSvg} />
        </section>
      )}
      {sample && (
        <section>
          <h2 className="font-semibold mb-2">Sample question</h2>
          <Card className="space-y-3 text-[15px] leading-7">
            <p>{sample.stem}</p>
            <ol className="space-y-1">
              {sample.options.map((o) => (
                <li key={o.label}><span className="font-medium">{o.label}.</span> {o.text}</li>
              ))}
            </ol>
            <details className="text-sm">
              <summary className="cursor-pointer font-medium">Show answer and explanation</summary>
              <p className="mt-2"><strong>Answer: {sample.answerLabel}.</strong> {sample.explanation}</p>
              {sample.teachingPoint && <p className="mt-2 rounded bg-accent/60 p-2"><strong>Teaching point:</strong> {sample.teachingPoint}</p>}
            </details>
            <p className="text-xs text-muted-foreground">
              {sample.aiDrafted ? "AI-drafted, " : ""}physician-reviewed{sample.attribution ? ` · ${sample.attribution}` : ""}
            </p>
          </Card>
        </section>
      )}
    </article>
  );
}
