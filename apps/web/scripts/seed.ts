/**
 * Seed exams, taxonomy, and feature flags from content/taxonomy/*.json.
 * Idempotent: upserts by primary key.
 *
 *   npm run db:seed
 */
import { readdirSync, readFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { sql } from "drizzle-orm";
import { db } from "./_db";
import { exams, featureFlags, profiles, topics } from "../src/db/schema";
import type { ExamTaxonomy, Topic } from "@rp/schema";
import { LOCAL_PHYSICIAN_ID, LOCAL_STUDENT_ID } from "../src/lib/dev-auth";

const taxonomyDir = resolve(__dirname, "../../../content/taxonomy");

function flatten(examId: ExamTaxonomy["exam_id"], list: Topic[], parentId: string | null, acc: (typeof topics.$inferInsert)[], order = { n: 0 }) {
  for (const t of list) {
    acc.push({
      id: t.id,
      examId,
      parentId,
      name: t.name,
      description: t.description,
      weightMinPct: t.weight_min_pct,
      weightMaxPct: t.weight_max_pct,
      aliases: t.aliases ?? [],
      sortOrder: order.n++,
    });
    if (t.children?.length) flatten(examId, t.children, t.id, acc, order);
  }
  return acc;
}

async function main() {
  for (const f of readdirSync(taxonomyDir).filter((f) => f.endsWith(".json"))) {
    const tax: ExamTaxonomy = JSON.parse(readFileSync(join(taxonomyDir, f), "utf8"));
    await db
      .insert(exams)
      .values({
        id: tax.exam_id,
        name: tax.name,
        description: tax.description,
        officialUrl: tax.official_url,
        verifiedAt: tax.verified_at ? new Date(tax.verified_at) : null,
        facts: tax.facts ?? [],
      })
      .onConflictDoUpdate({
        target: exams.id,
        set: { name: sql`excluded.name`, description: sql`excluded.description`, officialUrl: sql`excluded.official_url`, verifiedAt: sql`excluded.verified_at`, facts: sql`excluded.facts` },
      });
    const rows = flatten(tax.exam_id, tax.topics, null, []);
    for (const r of rows) {
      await db
        .insert(topics)
        .values(r)
        .onConflictDoUpdate({
          target: [topics.examId, topics.id],
          set: { name: sql`excluded.name`, parentId: sql`excluded.parent_id`, weightMinPct: sql`excluded.weight_min_pct`, weightMaxPct: sql`excluded.weight_max_pct`, aliases: sql`excluded.aliases`, sortOrder: sql`excluded.sort_order` },
        });
    }
    console.log(`seeded ${tax.exam_id}: ${rows.length} topics`);
  }

  const flags: (typeof featureFlags.$inferInsert)[] = [
    { key: "paid_tier", enabled: false, description: "Gate tier=pro content behind a subscription (not launched)" },
    { key: "animations", enabled: true, description: "Show AnimatedConcept players in explanations" },
    { key: "oet_writing_grader", enabled: true, description: "OET referral-letter grader (Claude if keyed, else rule-based)" },
    { key: "oet_speaking_voice", enabled: false, description: "Voice role-play (stretch)" },
    { key: "public_sample_pages", enabled: true, description: "SEO topic pages with one sample item" },
  ];
  for (const fl of flags) {
    await db.insert(featureFlags).values(fl).onConflictDoNothing();
  }
  console.log(`seeded ${flags.length} feature flags`);

  const localUsers = [
    { id: LOCAL_PHYSICIAN_ID, email: "physician@localhost", name: "Local physician", role: "physician" as const },
    { id: LOCAL_STUDENT_ID, email: "student@localhost", name: "Local student", role: "student" as const },
  ];
  const extra = process.env.RP_DEV_USER_ID;
  if (extra && extra !== LOCAL_PHYSICIAN_ID && extra !== LOCAL_STUDENT_ID) {
    localUsers.push({
      id: extra,
      email: process.env.RP_DEV_USER_EMAIL ?? "dev@localhost",
      name: "Dev user",
      role: "physician",
    });
  }
  for (const u of localUsers) {
    await db.execute(sql`
      insert into auth.users (id, email) values (${u.id}::uuid, ${u.email})
      on conflict (id) do update set email = excluded.email
    `);
    await db
      .insert(profiles)
      .values({ userId: u.id, displayName: u.name, role: u.role })
      .onConflictDoUpdate({ target: profiles.userId, set: { displayName: u.name, role: u.role, updatedAt: new Date() } });
  }
  console.log(`seeded ${localUsers.length} local profiles (physician + student)`);
  process.exit(0);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
