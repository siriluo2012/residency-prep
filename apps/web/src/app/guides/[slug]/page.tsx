import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { MDXRemote } from "next-mdx-remote/rsc";
import { mdxComponents } from "@/components/guides/mdx-components";
import { getGuide, listGuides } from "@/lib/guides";



export async function generateMetadata({ params }: PageProps<"/guides/[slug]">): Promise<Metadata> {
  const { slug } = await params;
  const g = getGuide(slug);
  return g ? { title: g.meta.title, description: g.meta.description } : {};
}

export default async function GuidePage({ params }: PageProps<"/guides/[slug]">) {
  const { slug } = await params;
  const g = getGuide(slug);
  if (!g) notFound();
  const others = listGuides().filter((x) => x.slug !== slug);
  return (
    <article className="grid lg:grid-cols-[1fr_280px] gap-10">
      <div className="prose dark:prose-invert max-w-none prose-headings:font-semibold prose-p:leading-7">
        <h1>{g.meta.title}</h1>
        <p className="lead text-muted-foreground">{g.meta.description}</p>
        {/* Guides are first-party files in content/guides, so JSX attribute expressions are allowed. */}
        <MDXRemote source={g.content} components={mdxComponents} options={{ blockJS: false }} />
      </div>
      <aside className="space-y-6 text-sm">
        <div className="rounded-lg border border-border p-4">
          <p className="text-xs uppercase tracking-wide text-muted-foreground">Verified</p>
          <p>{g.meta.verified_at}</p>
          <p className="text-xs uppercase tracking-wide text-muted-foreground mt-3">Official sources</p>
          <ul className="space-y-1 mt-1">
            {g.meta.sources?.map((s) => (
              <li key={s.url}><a className="underline" href={s.url} target="_blank" rel="noreferrer">{s.title}</a></li>
            ))}
          </ul>
        </div>
        <div className="rounded-lg border border-border p-4">
          <p className="text-xs uppercase tracking-wide text-muted-foreground mb-2">More guides</p>
          <ul className="space-y-1">
            {others.map((o) => (
              <li key={o.slug}><Link className="underline" href={`/guides/${o.slug}`}>{o.title}</Link></li>
            ))}
          </ul>
        </div>
      </aside>
    </article>
  );
}
