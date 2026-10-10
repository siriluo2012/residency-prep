import { readdirSync, readFileSync } from "node:fs";
import { join, resolve } from "node:path";
import matter from "gray-matter";

const GUIDES_DIR = resolve(process.cwd(), "../../content/guides");

export interface GuideMeta {
  slug: string;
  title: string;
  description: string;
  exam: string;
  updated: string;
  verified_at: string;
  sources: { title: string; url: string }[];
}

/** YAML parses bare dates as Date objects; normalize to YYYY-MM-DD strings for rendering. */
function normalize(slug: string, data: Record<string, unknown>): GuideMeta {
  const d = (v: unknown) => (v instanceof Date ? v.toISOString().slice(0, 10) : String(v ?? ""));
  return {
    slug,
    title: String(data.title ?? slug),
    description: String(data.description ?? ""),
    exam: String(data.exam ?? ""),
    updated: d(data.updated),
    verified_at: d(data.verified_at),
    sources: Array.isArray(data.sources) ? (data.sources as GuideMeta["sources"]) : [],
  };
}

export function listGuides(): GuideMeta[] {
  return readdirSync(GUIDES_DIR)
    .filter((f) => f.endsWith(".mdx"))
    .map((f) => normalize(f.replace(/\.mdx$/, ""), matter(readFileSync(join(GUIDES_DIR, f), "utf8")).data))
    .sort((a, b) => a.title.localeCompare(b.title));
}

export function getGuide(slug: string): { meta: GuideMeta; content: string } | null {
  if (!/^[a-z0-9-]+$/.test(slug)) return null;
  try {
    const raw = readFileSync(join(GUIDES_DIR, `${slug}.mdx`), "utf8");
    const { data, content } = matter(raw);
    return { meta: normalize(slug, data), content };
  } catch {
    return null;
  }
}
