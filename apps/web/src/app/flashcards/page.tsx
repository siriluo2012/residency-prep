import Link from "next/link";
import { Badge, Card, Empty } from "@/components/ui";
import { requireUser } from "@/lib/auth";
import { deckSummary } from "@/lib/flashcards";
import { EXAM_NAMES, isExamId, listTopics } from "@/lib/queries/content";

export const metadata = { title: "Flashcards" };

export default async function FlashcardsPage({ searchParams }: PageProps<"/flashcards">) {
  await requireUser();
  const sp = await searchParams;
  const exam = isExamId(sp.exam) && (sp.exam === "usmle-step1" || sp.exam === "usmle-step2ck") ? sp.exam : "usmle-step1";
  const [summary, topics] = await Promise.all([deckSummary(exam), listTopics(exam)]);
  const topLevel = topics.filter((t) => !t.parentId);
  const countFor = (id: string) => {
    const ids = new Set([id, ...topics.filter((t) => t.parentId === id).map((t) => t.id)]);
    return summary.byTopic.filter((b) => ids.has(b.topicId)).reduce((s, b) => s + b.n, 0);
  };

  return (
    <div className="space-y-6">
      <div className="flex items-end justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-2xl font-semibold">Flashcards</h1>
          <p className="text-sm text-muted-foreground">{EXAM_NAMES[exam]} · FSRS spaced repetition</p>
        </div>
        <nav className="flex gap-2 text-sm">
          {(["usmle-step1", "usmle-step2ck"] as const).map((e) => (
            <Link key={e} href={`/flashcards?exam=${e}`} className={`rounded-md px-3 py-1.5 border ${e === exam ? "border-primary text-primary" : "border-border"}`}>
              {EXAM_NAMES[e]}
            </Link>
          ))}
        </nav>
      </div>

      <div className="grid sm:grid-cols-3 gap-4">
        <Card><div className="text-3xl font-semibold">{summary.due}</div><div className="text-sm text-muted-foreground">due now</div></Card>
        <Card><div className="text-3xl font-semibold">{summary.learned}</div><div className="text-sm text-muted-foreground">cards learned</div></Card>
        <Card><div className="text-3xl font-semibold">{summary.published}</div><div className="text-sm text-muted-foreground">cards available</div></Card>
      </div>

      {summary.published === 0 ? (
        <Empty title="No published flashcards yet for this exam">Cards are derived from reviewed questions and go through the same review queue.</Empty>
      ) : (
        <>
          <Link href={`/flashcards/study?exam=${exam}`} className="inline-flex rounded-md bg-primary text-primary-foreground px-5 py-2.5 font-medium">
            Study all due + new
          </Link>
          <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-3">
            {topLevel.map((t) => {
              const n = countFor(t.id);
              return (
                <Link key={t.id} href={n ? `/flashcards/study?exam=${exam}&topic=${t.id}` : "#"} className={n ? "" : "pointer-events-none opacity-50"}>
                  <Card className="h-full flex items-center justify-between gap-2 py-3">
                    <span className="text-sm">{t.name}</span>
                    <Badge>{n}</Badge>
                  </Card>
                </Link>
              );
            })}
          </div>
        </>
      )}
    </div>
  );
}
