"""`rp` command-line entry point.

rp ingest medqa --limit 500
rp ingest cohort /path/to/cohort
rp crawl all
rp generate questions --exam usmle-step1 --topic cardiovascular-physiology --n 5
rp generate flashcards
rp qa run
rp animate concepts --limit 10
rp animate render-test
rp oet generate --subtest writing --n 3
rp push
"""

from __future__ import annotations

from pathlib import Path
from typing import Annotated

import typer
from rich.console import Console
from rich.table import Table

from .config import STAGED_DIR, get_settings

app = typer.Typer(no_args_is_help=True, add_completion=False, help="Residency Prep content pipeline")
ingest_app = typer.Typer(no_args_is_help=True, help="Load open datasets into the staged schema")
crawl_app = typer.Typer(no_args_is_help=True, help="Structure-only crawlers for official sources")
generate_app = typer.Typer(no_args_is_help=True, help="Claude-drafted original content")
qa_app = typer.Typer(no_args_is_help=True, help="Automated QA on staged content")
animate_app = typer.Typer(no_args_is_help=True, help="AnimatedConcept generation and render tests")
oet_app = typer.Typer(no_args_is_help=True, help="OET Medicine tasks")
app.add_typer(ingest_app, name="ingest")
app.add_typer(crawl_app, name="crawl")
app.add_typer(generate_app, name="generate")
app.add_typer(qa_app, name="qa")
app.add_typer(animate_app, name="animate")
app.add_typer(oet_app, name="oet")

console = Console()

ExamOpt = Annotated[str, typer.Option("--exam", "-e", help="usmle-step1 | usmle-step2ck | oet-medicine | ecfmg")]


@app.command()
def status() -> None:
    """Show staged item counts and settings."""
    s = get_settings()
    t = Table(title="Residency Prep pipeline")
    t.add_column("kind")
    t.add_column("staged", justify="right")
    t.add_column("by status")
    from .sink import FileSink

    fs = FileSink()
    for kind in ("questions", "flashcards", "animations", "oet"):
        rows = fs.read(kind)
        by: dict[str, int] = {}
        for r in rows:
            by[r.get("status", "?")] = by.get(r.get("status", "?"), 0) + 1
        t.add_row(kind, str(len(rows)), ", ".join(f"{k}={v}" for k, v in sorted(by.items())) or "-")
    console.print(t)
    console.print(f"sink={s.rp_sink}  model={s.rp_claude_model}  staged_dir={STAGED_DIR}")
    console.print(
        f"anthropic_key={'set' if s.anthropic_api_key else 'MISSING'}  database_url={'set' if s.database_url else 'unset'}"
    )


# ---------------- ingest ----------------


@ingest_app.command("medqa")
def ingest_medqa(
    limit: Annotated[int, typer.Option(help="Max rows (0 = all)")] = 0,
    split: Annotated[str, typer.Option(help="train|validation|test|all")] = "all",
) -> None:
    """Load MedQA USMLE 4-option subset (MIT) from Hugging Face."""
    from .ingest.medqa import run

    run(limit=limit, split=split)


@ingest_app.command("cohort")
def ingest_cohort(
    repo: Annotated[Path, typer.Argument(help="Path to a clone of todd866/cohort (or omit to git clone)")] = None,  # type: ignore[assignment]
) -> None:
    """Load Cohort / MD3 open Step 1 corpus (CC BY 4.0) with diagrams."""
    from .ingest.cohort import run

    run(repo)


# ---------------- crawl ----------------


@crawl_app.command("all")
def crawl_all(refresh: bool = False) -> None:
    """Refresh blueprints and public facts for all exams (structure only)."""
    from .crawl import run_all

    run_all(refresh=refresh)


@crawl_app.command("source")
def crawl_source(name: str, refresh: bool = False) -> None:
    """Crawl one source: usmle | ecfmg | oet | openexamprep."""
    from .crawl import run_one

    run_one(name, refresh=refresh)


# ---------------- generate ----------------


@generate_app.command("questions")
def generate_questions(
    exam: ExamOpt = "usmle-step1",
    topic: Annotated[str | None, typer.Option("--topic", "-t")] = None,
    n: Annotated[int, typer.Option(help="Questions per topic")] = 3,
    difficulty: Annotated[str | None, typer.Option()] = None,
    batch: Annotated[str | None, typer.Option(help="Batch label; default = timestamp")] = None,
    all_topics: Annotated[bool, typer.Option("--all-topics", help="Iterate all leaf topics")] = False,
    dry_run: bool = False,
) -> None:
    """Draft original vignettes with per-option explanations and flashcards."""
    from .generate.questions import run

    run(
        exam=exam,
        topic=topic,
        n=n,
        difficulty=difficulty,
        batch=batch,
        all_topics=all_topics,
        dry_run=dry_run,
    )  # type: ignore[arg-type]


@generate_app.command("explanations")
def generate_explanations(limit: int = 0, batch: str | None = None) -> None:
    """Write per-option explanations for imported items flagged needs_explanation (MedQA)."""
    from .generate.questions import explain_missing

    explain_missing(limit=limit, batch=batch)


@generate_app.command("flashcards")
def generate_flashcards(
    limit: int = 0,
    batch: str | None = None,
    mode: Annotated[str, typer.Option(help="auto | llm | heuristic (no API key needed)")] = "auto",
) -> None:
    """Derive flashcards for staged questions that have none yet."""
    from .generate.flashcards import run

    run(limit=limit, batch=batch, mode=mode)


@generate_app.command("classify")
def generate_classify(kind: str = "questions", limit: int = 0) -> None:
    """Assign taxonomy topics to staged items that lack one (e.g. MedQA imports)."""
    from .generate.classify import run

    run(kind=kind, limit=limit)


# ---------------- qa ----------------


@qa_app.command("run")
def qa_run(
    kind: Annotated[str, typer.Option(help="questions|flashcards|animations|oet|all")] = "all",
    rebuild_index: bool = False,
) -> None:
    """Schema validation, dedupe against sources, lint; sets status draft -> in_review or rejected."""
    from .qa.run import run

    run(kind=kind, rebuild_index=rebuild_index)


@qa_app.command("report")
def qa_report() -> None:
    """Summarize QA flags across staged items."""
    from .qa.run import report

    report()


# ---------------- animate ----------------


@animate_app.command("concepts")
def animate_concepts(
    limit: int = 0,
    slug: str | None = None,
    batch: str | None = None,
    dry_run: bool = False,
) -> None:
    """Generate AnimatedConcept components for content/animations/concepts.yaml."""
    from .animate.generate import run

    run(limit=limit, slug=slug, batch=batch, dry_run=dry_run)


@animate_app.command("reference")
def animate_reference() -> None:
    """Stage hand-authored reference animations from content/animations/reference/*.tsx."""
    from .animate.reference import run

    run()


@animate_app.command("lint")
def animate_lint() -> None:
    """Static lint of staged animation components against the contract."""
    from .animate.lint import run

    run()


@animate_app.command("render-test")
def animate_render_test(slug: str | None = None) -> None:
    """Render each animation in a headless browser and screenshot each scene."""
    from .animate.render_test import run

    run(slug=slug)


@animate_app.command("export")
def animate_export(slug: str, gif: bool = False) -> None:
    """Record one loop of an animation to WebM (and optionally GIF via ffmpeg)."""
    from .animate.export import run

    run(slug=slug, gif=gif)


# ---------------- oet ----------------


@oet_app.command("reference")
def oet_reference() -> None:
    """Stage hand-authored OET tasks from pipeline/src/rp_pipeline/oet/reference.py (no API key)."""
    from .oet.reference import run

    run()


@oet_app.command("generate")
def oet_generate(
    subtest: Annotated[str, typer.Option(help="reading|listening|writing|speaking")] = "writing",
    n: int = 2,
    batch: str | None = None,
    dry_run: bool = False,
) -> None:
    """Draft OET Medicine tasks with Claude (ANTHROPIC_API_KEY)."""
    from .oet.generate import run

    run(subtest=subtest, n=n, batch=batch, dry_run=dry_run)


@oet_app.command("grade")
def oet_grade(task_id: str, letter_file: Path) -> None:
    """Grade a referral letter against the OET writing criteria (local test of the grader)."""
    from .oet.grader import grade_letter_cli

    grade_letter_cli(task_id, letter_file)


# ---------------- push ----------------


@app.command()
def push(kind: str = "all") -> None:
    """Load staged JSONL into Postgres (DATABASE_URL) and enqueue for review."""
    from .sink import DbSink, FileSink, parse_items

    fs = FileSink()
    db = DbSink()
    kinds = ["questions", "flashcards", "animations", "oet"] if kind == "all" else [kind]
    for k in kinds:
        rows = fs.read(k)
        if not rows:
            continue
        items = parse_items(k, rows)
        pushable = [i for i in items if getattr(i, "status", "draft") in ("in_review", "approved")]
        n = db.write(k, pushable)
        console.print(f"{k}: pushed {n}/{len(items)} (only in_review/approved are pushed)")


if __name__ == "__main__":
    app()
