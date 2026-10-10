# Operations Runbook

## 0. Local development (no cloud)

You do **not** need an Anthropic key or a Supabase project to run the site on this machine.

- **Anthropic** is only the optional writer: new vignettes, LLM flashcards, generated animation source, LLM OET drafts, LLM letter grades.
- **Supabase** is optional hosted Auth + hosted Postgres. Locally, Postgres on `:55432` plus `/login` → Continue locally (or `RP_DEV_USER_ID`) is enough.

```bash
cp .env.example .env
bash scripts/dev-local.sh
npm run dev
```

`scripts/dev-local.sh` starts Postgres if nothing is listening on `127.0.0.1:55432` (Docker Compose, otherwise Podman, otherwise Apptainer), applies `local-auth-shim.sql`, migrates, seeds a physician and a student profile, loads `content/staged/*.jsonl`, and runs `db:publish-demo`.

OET writing without a key uses the rule-based grader in `apps/web/src/lib/oet-grader.ts`.

## 1. First deploy

### Supabase
1. Create a project. Copy `Project URL`, `anon` key, `service_role` key, and the Postgres connection string (Settings > Database, "Session" pooler URI) into `.env` as `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`, `DATABASE_URL`.
2. Authentication > Providers: enable Email (magic link) and Google. Add `https://<domain>/auth/callback` and `http://localhost:3000/auth/callback` as redirect URLs.
3. Apply schema and policies:
   ```bash
   npm run db:migrate          # drizzle migrations + drizzle/0001_rls.sql (RLS, profile trigger, feedback re-queue trigger)
   npm run db:seed             # exams, taxonomy (official 2026 weights), feature flags
   ```
4. Promote yourself and the physicians: `update profiles set role = 'physician' where user_id = '<uuid>';` (`admin` for yourself). Roles: `student` < `reviewer` < `physician` < `admin`.
5. Storage (optional, for GIF/WebM exports and TTS audio): create a public bucket `media`; upload `pipeline/data/export/*` and set `export_urls` / `audio_url` accordingly.

### Vercel
1. Import the repo; root `vercel.json` sets the build to `apps/web`. Node 22.
2. Environment variables: everything in `.env.example` under "Web app", plus `ANTHROPIC_API_KEY` (OET grader), `CRON_SECRET`, optional `SENTRY_DSN`, `NEXT_PUBLIC_SENTRY_DSN`, `NEXT_PUBLIC_PLAUSIBLE_DOMAIN`, `RP_ANIM_CDN` (default `https://esm.sh`; self-host React/framer-motion ESM bundles for full independence).
3. Set `NEXT_PUBLIC_SITE_URL` to the production URL so the sitemap and OAuth redirects are correct.
4. The daily cron `/api/cron/requeue-reported` logs queue depth and open reports.

### Monitoring
- Sentry is active only when a DSN is set (server via `src/instrumentation.ts`, client via `src/instrumentation-client.ts`). No PII, no session replay.
- Plausible (cookie-free) is injected only when `NEXT_PUBLIC_PLAUSIBLE_DOMAIN` is set.
- Rate limits: animation frame route 60 req/min per IP; OET grading 5 per user per hour and one per task per 2 minutes.
- Backups: Supabase daily backups on paid tiers; additionally `pg_dump "$DATABASE_URL" > backup.sql` weekly from the ops machine. Content itself is reproducible from `content/staged/*.jsonl`, which the weekly workflow commits.

## 2. Content operations cadence

Weekly loop (automated by `.github/workflows/content-weekly.yml`, or run by hand):

```bash
cd pipeline
uv run rp crawl all                                   # refresh blueprints; diff reported in content/crawl/usmle.json
uv run rp generate questions --exam usmle-step1 --all-topics --n 2
uv run rp generate explanations --limit 100           # MedQA items waiting for rationales
uv run rp generate flashcards --limit 200
uv run rp animate concepts --limit 5 && uv run rp animate render-test
uv run rp qa run && uv run rp qa report
uv run rp push                                        # in_review/approved -> Postgres + review_queue
```

Then physicians work `/review`. Rules of thumb:
- A physician reviews ~20-30 questions/hour. Size `--n` so the queue stays under one week of reviewer capacity.
- Rejections with reason `not_original` or `clinically_incorrect` should be looked at weekly; if a pattern appears, tighten the prompt in `pipeline/src/rp_pipeline/generate/prompts.py` and record the change in `docs/DECISIONS.md`.
- Items re-queued by two user reports show with `priority 10` and the `user_reports` flag; triage these first.
- Cost: Sonnet-class generation is roughly $0.03-0.06 per question including flashcards and QA; `rp` prints an estimate per run.

### First animation batch
`content/animations/concepts.yaml` lists 49 concepts in priority order; `content/animations/reference/cardiac-cycle-wiggers.tsx` is a hand-authored exemplar that passes lint and the sandbox render test. To produce the batch:

```bash
cd pipeline
uv run rp animate reference                 # stage the hand-authored exemplar(s)
uv run rp animate concepts --limit 10       # generate with Claude (ANTHROPIC_API_KEY required)
uv run rp animate render-test               # Chromium screenshots per scene in pipeline/data/render/
uv run rp qa run --kind animations && uv run rp push --kind animations
```
Physicians approve on `/review?type=animation`, where the sandboxed player renders drafts. Export a GIF for social sharing with `uv run rp animate export <slug> --gif` (needs ffmpeg).

For long-form hero explainers (3-5 minutes), use Claude Motion manually in the Claude app (Team/Enterprise), export MP4, upload to the `media` bucket, and link it from the relevant guide.

## 3. Feature flags

Stored in `feature_flags`; defaults and env overrides in `apps/web/src/lib/flags.ts` (`FLAG_<KEY>=true`).

| key | default | purpose |
|---|---|---|
| `paid_tier` | off | When on, `tier=pro` items require a subscription (Stripe integration TODO: `profiles.subscription_status`, webhook route, gate in `createBlock` and flashcard queue). |
| `animations` | on | Show players in explanations and the gallery. |
| `oet_writing_grader` | on | Letter grading (Claude when `ANTHROPIC_API_KEY` is set, otherwise the rule-based practice grader). |
| `oet_speaking_voice` | off | Voice role-play (stretch). |
| `public_sample_pages` | on | Indexable `/topics/<exam>/<topic>` pages with one sample item. |

## 4. Incident checklist
- Wrong answer reported: the trigger re-queues after 2 reports; a physician can also `unpublish` from the review item page with a reason.
- CDN outage for animations: set `RP_ANIM_CDN` to a self-hosted mirror of `react@19`, `react-dom@19`, `framer-motion@12` ESM builds; the frame HTML uses an import map so no code change is needed.
- Claude API down / no key: OET writing falls back to the rule-based grader; QBank, flashcards and animations are unaffected (all content is pre-generated).
