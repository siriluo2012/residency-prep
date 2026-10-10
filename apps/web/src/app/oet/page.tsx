import Link from "next/link";
import { eq, sql } from "drizzle-orm";
import { db } from "@/db";
import { oetTasks } from "@/db/schema";
import { Badge, Card, CardTitle } from "@/components/ui";

export const metadata = { title: "OET Medicine", description: "Free OET Medicine practice for ECFMG: listening, reading, referral letters graded against the official criteria, and speaking role-plays." };

const SUBTESTS = [
  { id: "listening", name: "Listening", blurb: "Consultation extracts, workplace snippets, and presentations with gap-fill and MCQ items." },
  { id: "reading", name: "Reading", blurb: "Expeditious reading of guideline extracts, workplace texts, and long articles." },
  { id: "writing", name: "Writing", blurb: "Referral letters from case notes, scored against the six official criteria (rule-based locally, Claude if an API key is set)." },
  { id: "speaking", name: "Speaking", blurb: "Role-play cards with a model dialogue and a self-assessment rubric." },
] as const;

export default async function OetPage() {
  let counts = new Map<string, number>();
  try {
    const rows = await db.select({ subtest: oetTasks.subtest, n: sql<number>`count(*)::int` }).from(oetTasks).where(eq(oetTasks.status, "published")).groupBy(oetTasks.subtest);
    counts = new Map(rows.map((r) => [r.subtest, r.n]));
  } catch {
    /* no db */
  }
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold">OET Medicine</h1>
        <p className="text-sm text-muted-foreground max-w-2xl">
          ECFMG requires grade B (350) in all four sub-tests in one sitting. All tasks here are original, written for doctors, and reviewed before publishing.
          Read the <Link className="underline" href="/guides/oet-medicine-overview">format and strategy guide</Link> first.
        </p>
      </div>
      <div className="grid sm:grid-cols-2 gap-4">
        {SUBTESTS.map((s) => (
          <Link key={s.id} href={`/oet/${s.id}`}>
            <Card className="h-full hover:border-primary transition">
              <div className="flex items-center justify-between">
                <CardTitle>{s.name}</CardTitle>
                <Badge>{counts.get(s.id) ?? 0} tasks</Badge>
              </div>
              <p className="text-sm text-muted-foreground">{s.blurb}</p>
            </Card>
          </Link>
        ))}
      </div>
    </div>
  );
}

