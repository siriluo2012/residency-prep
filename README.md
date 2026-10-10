# Residency Prep

Public repo: [github.com/siriluo2012/residency-prep](https://github.com/siriluo2012/residency-prep)

Ad-free exam preparation for students aiming at US residency: USMLE Step 1, USMLE Step 2 CK, OET Medicine, and the ECFMG Certification / Pathways process.

The live QBank needs Postgres, so GitHub Pages / a static Cloudflare Pages upload cannot run it. Reviewers should clone this repo and follow **Quick start** below (no Anthropic or Supabase keys). For a hosted demo later, point `DATABASE_URL` at any Postgres and deploy `apps/web` to Cloudflare Workers (OpenNext) or Vercel.

Three things make it different from a UWorld clone or an ad-supported free site:

1. **Free, ad-free core.** Accounts exist for progress tracking; nothing is gated behind payment today. The schema carries a `tier` field and a feature-flag layer so a paid tier can be introduced later without migrations.
2. **Physician-reviewed, license-tracked content.** Every question, flashcard, and animation carries `source`, `license`, and `attribution`, and must pass a physician review queue before it is published. Nothing is recalled exam content and nothing is republished from copyrighted sites.
3. **Code-based concept animations.** Small React + SVG components that loop in-browser like GIFs (cardiac cycle, nephron handling, coagulation cascade ...). They are reviewed like any other content.

## What you do *not* need

| Service | What it is for | Needed to study locally? |
|---|---|---|
| **Anthropic API key** | Claude drafts *new* vignettes, explanations, animation components, and can LLM-grade OET letters | **No.** Hand-authored animations, heuristic flashcards, and a rule-based OET grader cover the local path. |
| **Supabase project** | Hosted Auth (magic link / Google) + hosted Postgres + storage | **No.** Local Postgres stores content; `/login` → **Continue locally** creates a physician or student session. |

Use those only when you want cloud accounts or to generate more original items.

## Layout

```
apps/web/          Next.js 16 (App Router) + Tailwind + Drizzle
packages/schema/   JSON Schema (source of truth) + TypeScript types shared by web and pipeline
pipeline/          Python 3.12 (uv) content pipeline: ingest, crawl, generate, qa, animate, oet
content/           Taxonomies, guides (MDX), animation concept list, staged JSONL output
docs/              Content policy, architecture decisions, operations runbook
```

## Quick start (local, no cloud keys)

```bash
cp .env.example .env            # DATABASE_URL is enough; leave Anthropic/Supabase blank
npm install

# starts Postgres 16 on 127.0.0.1:55432 if needed, migrates, seeds, loads staged content, publishes a demo set
bash scripts/dev-local.sh       # or: npm run local:up

npm run dev                     # http://localhost:3000
```

Open `/login` and click **Continue locally** as physician. That unlocks QBank, flashcards, the review queue, dashboard, and OET practice.

If you already have Postgres:

```bash
export DATABASE_URL=postgresql://postgres:postgres@127.0.0.1:55432/postgres
node apps/web/scripts/apply-sql.mjs apps/web/scripts/local-auth-shim.sql
npm run db:migrate && npm run db:seed
cd pipeline && uv sync
uv run rp ingest cohort && uv run rp generate flashcards --mode heuristic
uv run rp animate reference && uv run rp oet reference
RP_EMBED_BACKEND=hash uv run rp qa run
npm run db:load-staged && npm run db:publish-demo
```

`db:publish-demo` marks `in_review` / `approved` items published so you can study without sitting the physician queue. It refuses to run when `NODE_ENV=production`.

### Optional cloud pieces

- **Supabase:** set `NEXT_PUBLIC_SUPABASE_URL` and `NEXT_PUBLIC_SUPABASE_ANON_KEY` for real email/Google accounts. You can point `DATABASE_URL` at the Supabase session pooler instead of local Postgres.
- **Anthropic:** set `ANTHROPIC_API_KEY` then `uv run rp generate …`, `uv run rp animate concepts`, `uv run rp oet generate`. The in-app letter grader switches from the rule-based estimate to Claude automatically.

## Content flow

```
open datasets (MedQA MIT, Cohort CC BY 4.0)  --ingest-->  staged
hand-authored animations + OET               --reference-> staged
heuristic flashcards from question stems     --generate--> staged
Claude drafts (optional)                     --generate--> staged
                      staged --qa--> review_queue --physician approve--> published
```

See `docs/CONTENT_POLICY.md` before adding any source.

## Verification status

- `npm run typecheck`, `npm run lint`, `npm test`, `npm run build`: web app.
- `uv run pytest`, `uv run ruff check`: pipeline.
- Local path: Postgres 16, Cohort QBank, heuristic flashcards, hand-authored animations, OET reference tasks, cookie/env local login. No Anthropic or Supabase required.
