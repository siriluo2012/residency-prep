import Link from "next/link";
import { Badge, Card, Empty } from "@/components/ui";
import { requireRole } from "@/lib/auth";
import { listQueue, queueStats, reviewerThroughput } from "@/lib/queries/review";
import type { ItemType } from "@rp/schema";

export const metadata = { title: "Review queue" };

const TYPES: ItemType[] = ["question", "flashcard", "animation", "oet_task"];

export default async function ReviewPage({ searchParams }: PageProps<"/review">) {
  const { role } = await requireRole("reviewer");
  const sp = await searchParams;
  const itemType = TYPES.includes(sp.type as ItemType) ? (sp.type as ItemType) : undefined;
  const [stats, rows, throughput] = await Promise.all([queueStats(), listQueue({ itemType }), reviewerThroughput()]);
  const pendingBy = (t: ItemType) => stats.filter((s) => s.itemType === t && (s.state === "pending" || s.state === "in_progress")).reduce((a, s) => a + s.n, 0);
  const last14 = throughput.reduce((a, t) => a + t.n, 0);

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end gap-4">
        <div>
          <h1 className="text-2xl font-semibold">Review queue</h1>
          <p className="text-sm text-muted-foreground">
            Signed in as {role}. {last14} decisions in the last 14 days.
            {role === "reviewer" && " Reviewers can decide flashcards and OET tasks; questions and animations need a physician."}
          </p>
        </div>
        <nav className="ml-auto flex gap-2 text-sm">
          <Link href="/review" className={`rounded-md border px-3 py-1.5 ${!itemType ? "border-primary text-primary" : "border-border"}`}>All</Link>
          {TYPES.map((t) => (
            <Link key={t} href={`/review?type=${t}`} className={`rounded-md border px-3 py-1.5 ${itemType === t ? "border-primary text-primary" : "border-border"}`}>
              {t.replace("_", " ")} <span className="text-muted-foreground">{pendingBy(t)}</span>
            </Link>
          ))}
        </nav>
      </div>

      {sp.next && <p className="text-sm text-success">Decision saved.</p>}

      {rows.length === 0 ? (
        <Empty title="Queue is empty">Run the pipeline (`rp push`) to enqueue new items.</Empty>
      ) : (
        <ul className="space-y-2">
          {rows.map((r) => (
            <li key={r.id}>
              <Link href={`/review/${r.id}`}>
                <Card className="py-3 hover:border-primary transition flex items-start gap-3">
                  <Badge tone={r.itemType === "question" ? "info" : r.itemType === "animation" ? "warn" : "neutral"}>{r.itemType.replace("_", " ")}</Badge>
                  <div className="flex-1 min-w-0">
                    <p className="truncate text-sm">{r.preview?.title ?? r.itemId}</p>
                    <p className="text-xs text-muted-foreground">{r.preview?.meta}</p>
                  </div>
                  <div className="flex flex-wrap gap-1 justify-end max-w-xs">
                    {r.priority > 0 && <Badge tone="danger">priority {r.priority}</Badge>}
                    {[...r.autoFlags, ...(r.preview?.flags ?? [])].filter((f) => !f.startsWith("sub_concept")).slice(0, 4).map((f) => (
                      <Badge key={f} tone="warn">{f.split(":")[0]}</Badge>
                    ))}
                    {r.state === "in_progress" && <Badge>in progress</Badge>}
                  </div>
                </Card>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
