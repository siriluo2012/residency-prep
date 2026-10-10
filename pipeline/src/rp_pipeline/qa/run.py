"""QA orchestrator: validate -> lint -> dedupe -> set status.

Status transitions applied here (see packages/schema STATUS_TRANSITIONS):
  draft -> in_review   when schema ok and no fatal flags
  draft -> rejected    on schema failure, not_original, or placeholder content
Items already in_review/approved/published are re-linted but their status is left alone.
"""

from __future__ import annotations

from collections import Counter

from rich.console import Console
from rich.table import Table

from ..config import get_settings
from ..models import Animation, Flashcard, OetTask, Question
from ..sink import FileSink
from .dedupe import build_index, crawled_reference_rows, score_items
from .embed import Embedder
from .lint import lint_flashcard, lint_oet, lint_question, readability_grade
from .validate import schema_errors

console = Console()

FATAL = {"placeholder_text", "duplicate_options", "schema_error"}
# fixable by another pipeline stage; item stays draft instead of being rejected
PENDING_FIX = {"needs_explanation", "invalid_topic"}
MODELS = {"questions": Question, "flashcards": Flashcard, "animations": Animation, "oet": OetTask}


def _animation_lint(a: dict) -> list[str]:
    from ..animate.lint import lint_component

    return lint_component(a["component_source"], a)


def run(kind: str = "all", rebuild_index: bool = False) -> None:
    s = get_settings()
    fs = FileSink()
    kinds = ["questions", "flashcards", "animations", "oet"] if kind == "all" else [kind]
    embedder = Embedder()
    for k in kinds:
        rows = fs.read(k)
        if not rows:
            continue
        counts: Counter[str] = Counter()
        # ---- dedupe setup (questions + flashcards) ----
        sims: dict[str, tuple[float, str]] = {}
        if k in ("questions", "flashcards"):
            ref_rows = [r for r in rows if r["provenance"]["source"] != "claude"]
            if k == "questions":
                ref_rows += crawled_reference_rows()
            if rebuild_index:
                for p in s.cache_dir.glob(f"index_{k}*.npz"):
                    p.unlink()
            index = build_index(ref_rows, embedder, cache_name=k)
            gen_rows = [r for r in rows if r["provenance"]["source"] == "claude"]
            sims = score_items(gen_rows, index, embedder, mutual=True)
        # ---- per item ----
        out = []
        for r in rows:
            flags = set(
                f
                for f in (r.get("qa") or {}).get("flags", [])
                if f.startswith("sub_concept:") or f.startswith("generator_flagged:")
            )
            errs = schema_errors(k, r)
            schema_ok = not errs
            if not schema_ok:
                flags.add("schema_error")
                counts["schema_error"] += 1
            if k == "questions":
                flags |= set(lint_question(r))
            elif k == "flashcards":
                flags |= set(lint_flashcard(r))
            elif k == "oet":
                flags |= set(lint_oet(r))
            elif k == "animations":
                flags |= set(_animation_lint(r))
            qa = dict(r.get("qa") or {})
            qa["schema_ok"] = schema_ok
            if r["id"] in sims:
                sim, ref = sims[r["id"]]
                qa["max_similarity"] = sim
                qa["nearest_source_ref"] = ref
                if sim >= s.dedupe_reject:
                    flags.add("not_original")
                elif sim >= s.dedupe_flag:
                    flags.add("needs_originality_check")
            if k == "questions":
                qa["readability_grade"] = readability_grade(r["stem"])
            qa["flags"] = sorted(flags)
            r["qa"] = qa
            # ---- status ----
            status = r.get("status", "draft")
            if status == "draft":
                if flags & PENDING_FIX and not (flags & (FATAL - {"placeholder_text"})) and "not_original" not in flags:
                    r["status"] = "draft"  # wait for generate explanations / classify
                elif not schema_ok or "not_original" in flags or (flags & FATAL):
                    r["status"] = "rejected"
                else:
                    r["status"] = "in_review"
            counts[r["status"]] += 1
            for f in flags:
                counts[f"flag:{f.split(':')[0]}"] += 1
            if errs:
                console.log(f"[red]{r['id']}[/]: " + "; ".join(errs[:3]))
            out.append(MODELS[k].model_validate(r))
        fs.rewrite(k, out)
        console.print(f"[bold]{k}[/]: " + ", ".join(f"{a}={b}" for a, b in sorted(counts.items())))


def report() -> None:
    fs = FileSink()
    t = Table(title="QA flags")
    t.add_column("kind")
    t.add_column("flag")
    t.add_column("count", justify="right")
    for k in ("questions", "flashcards", "animations", "oet"):
        c: Counter[str] = Counter()
        for r in fs.read(k):
            for f in (r.get("qa") or {}).get("flags", []):
                c[f.split(":")[0]] += 1
        for f, n in c.most_common():
            t.add_row(k, f, str(n))
    console.print(t)
