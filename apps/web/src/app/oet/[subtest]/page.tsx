import Link from "next/link";
import { notFound } from "next/navigation";
import { and, asc, eq } from "drizzle-orm";
import { db } from "@/db";
import { oetTasks } from "@/db/schema";
import { Badge, Card, Empty } from "@/components/ui";

const SUBTESTS = ["listening", "reading", "writing", "speaking"] as const;
type Subtest = (typeof SUBTESTS)[number];

export default async function OetSubtestPage({ params }: PageProps<"/oet/[subtest]">) {
  const { subtest } = await params;
  if (!SUBTESTS.includes(subtest as Subtest)) notFound();
  const tasks = await db.select().from(oetTasks).where(and(eq(oetTasks.subtest, subtest as Subtest), eq(oetTasks.status, "published"))).orderBy(asc(oetTasks.part), asc(oetTasks.createdAt));
  return (
    <div className="space-y-6">
      <div className="flex items-center gap-2 text-sm text-muted-foreground"><Link href="/oet" className="underline">OET</Link><span>/</span><span className="capitalize text-foreground">{subtest}</span></div>
      <h1 className="text-2xl font-semibold capitalize">{subtest}</h1>
      {tasks.length === 0 ? (
        <Empty title="No published tasks yet">Tasks are generated with `rp oet generate` and go through review.</Empty>
      ) : (
        <ul className="grid sm:grid-cols-2 gap-3">
          {tasks.map((t) => (
            <li key={t.id}>
              <Link href={`/oet/practice/${t.id}`}>
                <Card className="h-full hover:border-primary transition py-3">
                  <div className="flex items-center gap-2 mb-1">{t.part && <Badge>Part {t.part}</Badge>}<span className="font-medium text-sm">{t.title}</span></div>
                  <p className="text-xs text-muted-foreground">
                    {t.payload.kind === "comprehension" && `${t.payload.items.length} items`}
                    {t.payload.kind === "referral_letter" && `Letter to ${t.payload.recipient.split(",")[0]} · ~${t.payload.word_limit ?? 200} words`}
                    {t.payload.kind === "role_play" && t.payload.setting}
                  </p>
                </Card>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
