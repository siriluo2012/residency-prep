import { sql } from "drizzle-orm";
import { type NextRequest, NextResponse } from "next/server";
import { db } from "@/db";

/**
 * Daily ops job (Vercel cron): summarize open error reports and queue depth. The DB trigger already
 * re-queues items after two reports; this job surfaces counts for the ops log and Sentry breadcrumbs.
 * Protected by CRON_SECRET (Vercel sets the Authorization header automatically).
 */
export async function GET(req: NextRequest) {
  const auth = req.headers.get("authorization");
  if (process.env.CRON_SECRET && auth !== `Bearer ${process.env.CRON_SECRET}`) return new NextResponse("unauthorized", { status: 401 });
  const [feedback] = await db.execute<{ open: number }>(sql`select count(*)::int as open from item_feedback where resolved = false`);
  const queue = await db.execute<{ item_type: string; state: string; n: number }>(sql`select item_type, state, count(*)::int as n from review_queue group by 1,2 order by 1,2`);
  const [published] = await db.execute<{ questions: number; flashcards: number; animations: number; oet: number }>(sql`
    select (select count(*) from questions where status = 'published')::int as questions,
           (select count(*) from flashcards where status = 'published')::int as flashcards,
           (select count(*) from animations where status = 'published')::int as animations,
           (select count(*) from oet_tasks where status = 'published')::int as oet`);
  const summary = { at: new Date().toISOString(), openFeedback: feedback?.open ?? 0, queue: Array.from(queue), published };
  console.log("[ops]", JSON.stringify(summary));
  return NextResponse.json(summary);
}
