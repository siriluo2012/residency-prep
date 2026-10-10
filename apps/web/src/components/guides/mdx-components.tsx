import Link from "next/link";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import type { ExamTaxonomy } from "@rp/schema";

/** Components available inside content/guides/*.mdx. Data comes from content/taxonomy (same files the DB is seeded from). */

function taxonomy(exam: string): ExamTaxonomy | null {
  try {
    return JSON.parse(readFileSync(resolve(process.cwd(), `../../content/taxonomy/${exam}.json`), "utf8"));
  } catch {
    return null;
  }
}

export function Checklist({ items }: { items: { id: string; label: string }[] }) {
  return (
    <ul className="my-4 space-y-2 not-prose">
      {items.map((it) => (
        <li key={it.id} className="flex gap-3 rounded-md border border-border p-3 text-sm">
          <span className="mt-0.5 h-4 w-4 shrink-0 rounded border border-primary" aria-hidden />
          <span>{it.label}</span>
        </li>
      ))}
    </ul>
  );
}

export function Timeline({ steps }: { steps: { when: string; what: string }[] }) {
  return (
    <ol className="my-4 not-prose border-l-2 border-border pl-4 space-y-4">
      {steps.map((s, i) => (
        <li key={i} className="relative">
          <span className="absolute -left-[1.35rem] top-1.5 h-3 w-3 rounded-full bg-primary" aria-hidden />
          <div className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">{s.when}</div>
          <div className="text-sm">{s.what}</div>
        </li>
      ))}
    </ol>
  );
}

export function PathwayTable({ rows }: { rows: { pathway: string; who: string; evidence: string }[] }) {
  return (
    <div className="my-4 not-prose overflow-x-auto">
      <table className="w-full text-sm border border-border">
        <thead className="bg-muted text-left">
          <tr><th className="p-2">Pathway</th><th className="p-2">Who qualifies</th><th className="p-2">Evidence</th></tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.pathway} className="border-t border-border align-top">
              <td className="p-2 font-medium whitespace-nowrap">{r.pathway}</td>
              <td className="p-2">{r.who}</td>
              <td className="p-2 text-muted-foreground">{r.evidence}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export function ExamFacts({ exam }: { exam: string }) {
  const t = taxonomy(exam);
  if (!t?.facts?.length) return null;
  return (
    <dl className="my-4 not-prose grid sm:grid-cols-2 gap-3">
      {t.facts.map((f) => (
        <div key={f.key} className="rounded-md border border-border p-3">
          <dt className="text-xs uppercase tracking-wide text-muted-foreground">{f.key.replace(/_/g, " ")}</dt>
          <dd className="text-sm mt-1">{f.value}</dd>
          <dd className="text-xs mt-1">
            <a href={f.source_url} className="underline text-muted-foreground" target="_blank" rel="noreferrer">source</a>
            <span className="text-muted-foreground"> · verified {f.verified_at}</span>
          </dd>
        </div>
      ))}
    </dl>
  );
}

export function Blueprint({ exam }: { exam: string }) {
  const t = taxonomy(exam);
  if (!t) return null;
  const rows = t.topics.filter((x) => x.weight_min_pct != null);
  const max = Math.max(...rows.map((r) => r.weight_max_pct ?? 0));
  return (
    <div className="my-4 not-prose space-y-1.5">
      {rows.map((r) => (
        <div key={r.id} className="grid grid-cols-[1fr_200px_70px] gap-3 items-center text-sm">
          <span className="truncate">{r.name}</span>
          <div className="relative h-3 bg-muted rounded-full overflow-hidden">
            <div className="absolute inset-y-0 bg-primary/30" style={{ left: `${((r.weight_min_pct ?? 0) / max) * 100}%`, width: `${(((r.weight_max_pct ?? 0) - (r.weight_min_pct ?? 0)) / max) * 100}%` }} />
            <div className="absolute inset-y-0 w-0.5 bg-primary" style={{ left: `${((r.weight_min_pct ?? 0) / max) * 100}%` }} />
          </div>
          <span className="text-right tabular-nums text-muted-foreground">{r.weight_min_pct}–{r.weight_max_pct}%</span>
        </div>
      ))}
      <p className="text-xs text-muted-foreground pt-1">
        Source: <a className="underline" href={t.official_url} target="_blank" rel="noreferrer">official specification</a>, verified {t.verified_at}.
      </p>
    </div>
  );
}

export function VerifiedNote() {
  return (
    <p className="mt-8 rounded-md border border-border bg-muted/50 p-3 text-xs text-muted-foreground not-prose">
      Facts on this page are paraphrased from official sources listed at the top and carry a verification date. Requirements change; always confirm with ECFMG, USMLE, or OET before acting. Found something outdated? Use the report link on any page.
    </p>
  );
}

export const mdxComponents = {
  Checklist,
  Timeline,
  PathwayTable,
  ExamFacts,
  Blueprint,
  VerifiedNote,
  a: (props: React.AnchorHTMLAttributes<HTMLAnchorElement>) =>
    props.href?.startsWith("/") ? <Link href={props.href} className="underline">{props.children}</Link> : <a {...props} className="underline" target="_blank" rel="noreferrer" />,
};
