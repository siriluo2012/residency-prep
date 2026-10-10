import type { MetadataRoute } from "next";
import { eq } from "drizzle-orm";
import { db } from "@/db";
import { animations, topics } from "@/db/schema";
import { listGuides } from "@/lib/guides";

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const base = process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000";
  const out: MetadataRoute.Sitemap = [
    { url: `${base}/`, changeFrequency: "weekly", priority: 1 },
    { url: `${base}/animations`, changeFrequency: "weekly", priority: 0.8 },
    { url: `${base}/guides`, changeFrequency: "monthly", priority: 0.8 },
    { url: `${base}/oet`, changeFrequency: "monthly", priority: 0.7 },
  ];
  for (const g of listGuides()) out.push({ url: `${base}/guides/${g.slug}`, lastModified: g.updated, changeFrequency: "monthly", priority: 0.8 });
  try {
    for (const a of await db.select({ slug: animations.slug, updatedAt: animations.updatedAt }).from(animations).where(eq(animations.status, "published")))
      out.push({ url: `${base}/animations/${a.slug}`, lastModified: a.updatedAt, changeFrequency: "monthly", priority: 0.7 });
    for (const t of await db.select({ id: topics.id, examId: topics.examId }).from(topics))
      if (t.examId === "usmle-step1" || t.examId === "usmle-step2ck") out.push({ url: `${base}/topics/${t.examId}/${t.id}`, changeFrequency: "weekly", priority: 0.6 });
  } catch {
    /* db unavailable */
  }
  return out;
}
