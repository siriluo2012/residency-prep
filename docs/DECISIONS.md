# Architecture Decisions

## ADR-001: Do not fork Cohort; use `ts-fsrs` and import Cohort's open corpus

**Date:** 2026-10-08

**Context.** The plan asked whether to fork Cohort (`todd866/cohort`, MIT code, CC BY 4.0 content) as the spaced-repetition and QBank base.

**Findings from a shallow clone:**

- Scheduler: `src/lib/knowledge/unified-scheduler-*.ts` is ~6,400 lines across 10+ phase files, coupled to Prisma 7 (Neon adapter), a "manifold" embedding layer (`src/lib/manifold`), Auth.js, and a custom content-lake build (`scripts/content/*`). `package.json` has ~30 build/seed scripts that must run in sequence before `next dev`.
- There is no isolated FSRS module; card grading lives in `src/lib/cohort/card-grade.server.ts` and depends on their session model.
- The open corpus is clean and well structured: 556 question JSON files under `open-content/usmle/step1/questions/<system>/`, each with per-option `explanation` and `misconception`, a `publicUsmle.itemText.licence` field (`CC-BY-4.0`), and an evidence citation into `sources.json` (OpenStax, CDC, NIH, other open sources). ~60 SVG diagrams under `media/` with `.kernel.json` descriptors.

**Decision.**

1. Build our own thin app on Next.js + Drizzle + Supabase. Scheduling uses the `ts-fsrs` package (FSRS v5/v6 reference implementation) wrapped in `apps/web/src/lib/fsrs.ts`.
2. Import Cohort's corpus via `pipeline/ingest/cohort.py`, preserving its license and evidence metadata, attributing "MD3 contributors, CC BY 4.0".
3. Borrow Cohort's *fail-closed rights boundary* idea: an item is publishable only if its license is in our allow-list.

**Consequences.** We lose Cohort's offline PWA and anatomy figure tooling, which were not in scope. We gain a codebase small enough to maintain alone and a schema shared verbatim with the Python pipeline.

## ADR-002: Code-based animations instead of video generation

Claude Motion (launched 2026-10-08) is a Claude app artifact on Team/Enterprise with MP4 export and no API. We generate `AnimatedConcept` React components (Framer Motion + SVG) through the Claude API so animations are editable, reviewable, tiny, accessible (captions as data, reduced-motion fallback), and can be regenerated per concept. Claude Motion is reserved for a handful of hand-made hero explainers exported as MP4.

## ADR-003: Pipeline writes to staged JSONL by default

`RP_SINK=file` writes to `content/staged/*.jsonl`; `rp push` loads into Postgres. This lets contributors run ingest/generate/qa without database credentials and makes every batch diffable in git before it hits the review queue.
