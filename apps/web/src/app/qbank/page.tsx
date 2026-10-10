import Link from "next/link";
import { Button, Card, Empty, Select } from "@/components/ui";
import { createBlock } from "@/lib/qbank";
import { EXAM_NAMES, isExamId, topicsWithCounts } from "@/lib/queries/content";
import { requireUser } from "@/lib/auth";

export const metadata = { title: "QBank" };

export default async function QBankPage({ searchParams }: PageProps<"/qbank">) {
  await requireUser();
  const sp = await searchParams;
  const exam = isExamId(sp.exam) ? sp.exam : "usmle-step1";
  if (exam === "oet-medicine" || exam === "ecfmg") {
    return (
      <Empty title="This exam has no question bank">
        <Link className="underline" href={exam === "oet-medicine" ? "/oet" : "/guides/ecfmg-certification"}>
          Go to the {EXAM_NAMES[exam]} module
        </Link>
      </Empty>
    );
  }
  const topics = await topicsWithCounts(exam);
  const topLevel = topics.filter((t) => !t.parentId);
  const total = topLevel.reduce((s, t) => s + t.questionCount, 0);

  return (
    <div className="space-y-6">
      <div className="flex items-end justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-2xl font-semibold">Create a test</h1>
          <p className="text-sm text-muted-foreground">
            {EXAM_NAMES[exam]} · {total} published questions
          </p>
        </div>
        <nav className="flex gap-2 text-sm">
          {(["usmle-step1", "usmle-step2ck"] as const).map((e) => (
            <Link key={e} href={`/qbank?exam=${e}`} className={`rounded-md px-3 py-1.5 border ${e === exam ? "border-primary text-primary" : "border-border"}`}>
              {EXAM_NAMES[e]}
            </Link>
          ))}
        </nav>
      </div>

      {sp.empty && (
        <p className="rounded-md border border-amber-300 bg-amber-50 dark:bg-amber-950/30 p-3 text-sm">
          No questions matched those filters. Try a different pool or more systems.
        </p>
      )}

      {total === 0 ? (
        <Empty title="No published questions yet for this exam">
          Items are in the physician review queue. Check back soon, or try the sample topics on the public pages.
        </Empty>
      ) : (
        <form action={createBlock} className="grid lg:grid-cols-3 gap-6">
          <input type="hidden" name="exam" value={exam} />
          <Card className="lg:col-span-2">
            <h2 className="font-semibold mb-3">Systems</h2>
            <div className="grid sm:grid-cols-2 gap-2 text-sm">
              {topLevel.map((t) => (
                <label key={t.id} className={`flex items-center gap-2 rounded-md border border-border p-2 ${t.questionCount === 0 ? "opacity-50" : ""}`}>
                  <input type="checkbox" name="topics" value={t.id} disabled={t.questionCount === 0} className="accent-[var(--primary)]" />
                  <span className="flex-1">{t.name}</span>
                  <span className="text-xs text-muted-foreground">
                    {t.questionCount}
                    {t.weightMinPct != null && ` · ${t.weightMinPct}–${t.weightMaxPct}%`}
                  </span>
                </label>
              ))}
            </div>
            <p className="text-xs text-muted-foreground mt-2">Leave all unchecked to draw from every system in blueprint proportion.</p>
          </Card>
          <Card className="space-y-4">
            <div>
              <label className="text-sm font-medium block mb-1">Mode</label>
              <div className="flex gap-2">
                <label className="flex items-center gap-1 text-sm"><input type="radio" name="mode" value="tutor" defaultChecked /> Tutor</label>
                <label className="flex items-center gap-1 text-sm"><input type="radio" name="mode" value="timed" /> Timed (90 s/question)</label>
              </div>
            </div>
            <div>
              <label className="text-sm font-medium block mb-1">Question pool</label>
              <Select name="pool" defaultValue="unused" className="w-full">
                <option value="unused">Unused</option>
                <option value="incorrect">Incorrect</option>
                <option value="flagged">Flagged</option>
                <option value="all">All</option>
              </Select>
            </div>
            <div>
              <label className="text-sm font-medium block mb-1">Difficulty</label>
              <div className="flex gap-3 text-sm">
                {(["easy", "medium", "hard"] as const).map((d) => (
                  <label key={d} className="flex items-center gap-1 capitalize"><input type="checkbox" name="difficulty" value={d} /> {d}</label>
                ))}
              </div>
            </div>
            <div>
              <label className="text-sm font-medium block mb-1">Number of questions</label>
              <Select name="count" defaultValue="20" className="w-full">
                {[5, 10, 20, 30, 40].map((n) => (
                  <option key={n} value={n}>{n}</option>
                ))}
              </Select>
            </div>
            <Button type="submit" className="w-full">Start block</Button>
          </Card>
        </form>
      )}
    </div>
  );
}
