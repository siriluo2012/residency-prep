/**
 * Local/demo only: publish every in_review/approved item so QBank, flashcards, animations and OET
 * work without a physician sitting the review queue. Does not touch drafts (e.g. MedQA waiting on
 * explanations). Never run this against a production database.
 *
 *   npm run db:publish-demo
 */
import { inArray } from "drizzle-orm";
import { db, client } from "./_db";
import { animations, flashcards, oetTasks, questions, reviewQueue } from "../src/db/schema";

if (process.env.NODE_ENV === "production") {
  console.error("refusing to auto-publish in NODE_ENV=production");
  process.exit(1);
}

async function main() {
  const now = new Date();
  const ready = ["in_review", "approved"] as const;
  const q = await db
    .update(questions)
    .set({ status: "published", publishedAt: now, updatedAt: now })
    .where(inArray(questions.status, ready))
    .returning({ id: questions.id });
  const f = await db
    .update(flashcards)
    .set({ status: "published", publishedAt: now, updatedAt: now })
    .where(inArray(flashcards.status, ready))
    .returning({ id: flashcards.id });
  const a = await db
    .update(animations)
    .set({ status: "published", publishedAt: now, updatedAt: now })
    .where(inArray(animations.status, ready))
    .returning({ id: animations.id });
  const o = await db
    .update(oetTasks)
    .set({ status: "published", publishedAt: now, updatedAt: now })
    .where(inArray(oetTasks.status, ready))
    .returning({ id: oetTasks.id });
  const ids = [...q, ...f, ...a, ...o].map((r) => r.id);
  if (ids.length) {
    await db.update(reviewQueue).set({ state: "approved", updatedAt: now }).where(inArray(reviewQueue.itemId, ids));
  }
  console.log(
    `published questions=${q.length} flashcards=${f.length} animations=${a.length} oet=${o.length}`,
  );
  await client.end({ timeout: 2 });
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
