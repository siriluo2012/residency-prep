import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { AnimationPlayer } from "@/components/animations/animation-player";
import { ReportButton } from "@/components/report-button";
import { Badge } from "@/components/ui";
import { EXAM_NAMES, getAnimation, getQuestionsByIds } from "@/lib/queries/content";

export async function generateMetadata({ params }: PageProps<"/animations/[slug]">): Promise<Metadata> {
  const { slug } = await params;
  const a = await getAnimation(slug).catch(() => null);
  return a ? { title: a.title, description: a.concept } : {};
}

export default async function AnimationPage({ params }: PageProps<"/animations/[slug]">) {
  const { slug } = await params;
  const a = await getAnimation(slug).catch(() => null);
  if (!a) notFound();
  const related = a.questionIds.length ? await getQuestionsByIds(a.questionIds) : [];
  return (
    <article className="max-w-3xl mx-auto space-y-6">
      <div>
        <div className="flex gap-2 items-center text-sm text-muted-foreground mb-2">
          <Link href="/animations" className="underline">Animations</Link>
          <span>/</span>
          <Badge>{EXAM_NAMES[a.examId]}</Badge>
        </div>
        <h1 className="text-2xl font-semibold">{a.title}</h1>
        <p className="text-muted-foreground mt-1">{a.concept}</p>
      </div>
      <AnimationPlayer id={a.id} title={a.title} storyboard={a.storyboard} durationMs={a.durationMs} staticFallbackSvg={a.staticFallbackSvg} />
      <ol className="space-y-2">
        {a.storyboard.map((s, i) => (
          <li key={s.scene} className="flex gap-3 text-sm">
            <span className="font-mono text-xs text-muted-foreground w-16 pt-0.5">{(s.start_ms / 1000).toFixed(1)}–{(s.end_ms / 1000).toFixed(1)}s</span>
            <span><span className="font-medium">Scene {i + 1}.</span> {s.caption}</span>
          </li>
        ))}
      </ol>
      <div className="flex items-center justify-between text-xs text-muted-foreground border-t border-border pt-3">
        <span>
          {a.aiDrafted ? "AI-generated animation" : "Hand-authored animation"}, physician-reviewed{a.reviewedBy ? ` by ${a.reviewedBy}` : ""}.
          {a.exportUrls?.gif && <> <a className="underline" href={a.exportUrls.gif}>Download GIF</a></>}
          {a.exportUrls?.webm && <> · <a className="underline" href={a.exportUrls.webm}>WebM</a></>}
        </span>
        <ReportButton itemType="animation" itemId={a.id} />
      </div>
      {related.filter((q) => q.status === "published").length > 0 && (
        <div>
          <h2 className="font-semibold mb-2">Practice this concept</h2>
          <p className="text-sm text-muted-foreground">{related.length} question(s) in the QBank use this animation. <Link className="underline" href={`/qbank?exam=${a.examId}`}>Create a block</Link>.</p>
        </div>
      )}
    </article>
  );
}
