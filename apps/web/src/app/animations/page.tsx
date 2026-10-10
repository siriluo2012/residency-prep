import Link from "next/link";
import { Badge, Card, CardTitle, Empty } from "@/components/ui";
import { EXAM_NAMES, isExamId, listPublishedAnimations } from "@/lib/queries/content";

export const metadata = {
  title: "Animated concept explainers",
  description: "Short, looping, physician-reviewed animations of the dynamic concepts in USMLE Step 1 and Step 2 CK: cardiac cycle, nephron, coagulation cascade, and more.",
};

export default async function AnimationsPage({ searchParams }: PageProps<"/animations">) {
  const sp = await searchParams;
  const exam = isExamId(sp.exam) ? sp.exam : undefined;
  let items: Awaited<ReturnType<typeof listPublishedAnimations>> = [];
  try {
    items = await listPublishedAnimations(exam);
  } catch {
    /* no db configured */
  }
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold">Animated concept explainers</h1>
        <p className="text-sm text-muted-foreground max-w-2xl">
          Concepts that are hard to learn from text because they move: pressures and volumes over a cycle,
          ions crossing membranes, cascades, gradients. Each animation is code, so you can pause, scrub by
          scene, slow it down, and read the caption for each step. Reviewed by a physician before publishing.
        </p>
      </div>
      {items.length === 0 ? (
        <Empty title="No published animations yet">The first batch is in physician review.</Empty>
      ) : (
        <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {items.map((a) => (
            <Link key={a.id} href={`/animations/${a.slug}`}>
              <Card className="h-full hover:border-primary transition">
                {a.staticFallbackSvg ? (
                  <div className="aspect-video overflow-hidden rounded border border-border mb-3 bg-white" dangerouslySetInnerHTML={{ __html: a.staticFallbackSvg }} />
                ) : (
                  <div className="aspect-video rounded border border-border mb-3 bg-muted" />
                )}
                <CardTitle className="text-base">{a.title}</CardTitle>
                <div className="flex gap-1 flex-wrap">
                  <Badge>{EXAM_NAMES[a.examId]}</Badge>
                  <Badge>{a.storyboard.length} scenes · {Math.round(a.durationMs / 1000)}s</Badge>
                </div>
              </Card>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
