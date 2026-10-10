import Link from "next/link";
import { Badge, Card, CardTitle, Progress } from "@/components/ui";
import { getProfile, requireUser } from "@/lib/auth";
import { EXAM_NAMES } from "@/lib/queries/content";
import { blockTrend, buildPlan, overallStats, systemStats } from "@/lib/queries/progress";
import { formatDuration, formatPct } from "@/lib/utils";
import { TrendChart } from "@/components/dashboard/trend-chart";

export const metadata = { title: "Dashboard" };

export default async function DashboardPage() {
  const user = await requireUser();
  const profile = await getProfile(user.id);
  const exam = (profile?.targetExamId === "usmle-step2ck" ? "usmle-step2ck" : "usmle-step1") as "usmle-step1" | "usmle-step2ck";
  const [overall, systems, trend] = await Promise.all([overallStats(user.id, exam), systemStats(user.id, exam), blockTrend(user.id, exam)]);
  const plan = buildPlan({ examDate: profile?.examDate ?? null, remainingQuestions: Math.max(0, overall.total - overall.distinct), systems, dailyGoal: profile?.dailyGoalQuestions ?? 40 });

  return (
    <div className="space-y-8">
      <div className="flex flex-wrap items-end gap-4">
        <div>
          <h1 className="text-2xl font-semibold">{profile?.displayName ? `Hi, ${profile.displayName}` : "Dashboard"}</h1>
          <p className="text-sm text-muted-foreground">
            {EXAM_NAMES[exam]}
            {plan.daysLeft != null ? ` · ${plan.daysLeft} days to exam` : " · set an exam date in settings for a plan"}
          </p>
        </div>
        <div className="ml-auto flex gap-2 text-sm">
          <Link href={`/qbank?exam=${exam}`} className="rounded-md bg-primary text-primary-foreground px-4 py-2 font-medium">New block</Link>
          <Link href={`/flashcards/study?exam=${exam}`} className="rounded-md border border-border px-4 py-2">Review {overall.cardsDue} cards</Link>
          <Link href="/settings" className="rounded-md border border-border px-4 py-2">Settings</Link>
        </div>
      </div>

      <section className="grid sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <Card><div className="text-3xl font-semibold">{formatPct(overall.accuracy)}</div><div className="text-sm text-muted-foreground">overall accuracy · {overall.attempted} answered</div></Card>
        <Card><div className="text-3xl font-semibold">{overall.distinct}<span className="text-base text-muted-foreground">/{overall.total}</span></div><div className="text-sm text-muted-foreground">questions used</div><Progress value={overall.total ? overall.distinct / overall.total : 0} className="mt-2" /></Card>
        <Card><div className="text-3xl font-semibold">{overall.avgMs ? formatDuration(overall.avgMs) : "–"}</div><div className="text-sm text-muted-foreground">avg time per question (exam pace ~90s)</div></Card>
        <Card><div className="text-3xl font-semibold">{overall.questionsThisWeek}<span className="text-base text-muted-foreground"> q</span> · {overall.cardsThisWeek}<span className="text-base text-muted-foreground"> cards</span></div><div className="text-sm text-muted-foreground">this week</div></Card>
      </section>

      <section className="grid lg:grid-cols-[1fr_360px] gap-6">
        <Card>
          <CardTitle>Performance by system vs. blueprint weight</CardTitle>
          <p className="text-xs text-muted-foreground mb-3">Bars show your accuracy; the grey band shows the official blueprint range. Coverage compares your attempt share to the blueprint midpoint.</p>
          <ul className="space-y-2">
            {systems.map((s) => (
              <li key={s.topicId} className="grid grid-cols-[1fr_120px_60px_80px] gap-2 items-center text-sm">
                <span className="truncate" title={s.name}>{s.name}</span>
                <div className="relative h-3 rounded-full bg-muted overflow-hidden">
                  <div className="absolute inset-y-0 bg-primary/80" style={{ width: `${Math.round((s.accuracy ?? 0) * 100)}%` }} />
                </div>
                <span className="text-right tabular-nums">{s.accuracy == null ? "–" : formatPct(s.accuracy)}</span>
                <span className="text-right text-xs text-muted-foreground tabular-nums">
                  {s.weightMin != null ? `${s.weightMin}–${s.weightMax}%` : ""}
                  {s.coverageRatio != null && (
                    <Badge tone={s.coverageRatio < 0.6 ? "warn" : "neutral"} className="ml-1">{s.coverageRatio.toFixed(1)}x</Badge>
                  )}
                </span>
              </li>
            ))}
          </ul>
        </Card>

        <div className="space-y-6">
          <Card>
            <CardTitle>Study plan</CardTitle>
            {plan.daysLeft == null ? (
              <p className="text-sm text-muted-foreground">Add your exam date in <Link className="underline" href="/settings">settings</Link> to get a daily target.</p>
            ) : (
              <p className="text-sm">
                <strong>{plan.dailyNeeded} questions/day</strong> over {plan.studyDays} study days, leaving {plan.reviewBufferDays} days for review of incorrects and flagged items.
              </p>
            )}
            <p className="text-sm font-medium mt-3 mb-1">Focus next</p>
            <ol className="text-sm space-y-1 list-decimal list-inside">
              {plan.focus.map((f) => (
                <li key={f.topicId}>
                  <Link className="underline" href={`/qbank?exam=${exam}`}>{f.name}</Link>
                  <span className="text-muted-foreground"> · {f.accuracy == null ? "unseen" : formatPct(f.accuracy)}</span>
                </li>
              ))}
              {plan.focus.length === 0 && <li className="text-muted-foreground list-none">No published questions yet.</li>}
            </ol>
          </Card>
          <Card>
            <CardTitle>Readiness trend</CardTitle>
            <TrendChart points={trend.map((t) => ({ label: new Date(t.date).toLocaleDateString(undefined, { month: "short", day: "numeric" }), value: t.accuracy, mode: t.mode }))} />
          </Card>
        </div>
      </section>
    </div>
  );
}
