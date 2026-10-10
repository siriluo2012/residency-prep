"""Ingest MedQA (Jin et al. 2020), USMLE 4-option English subset, MIT license.

Hugging Face dataset: awinml/medqa  (re-upload of jind11/MedQA).
Rows look like: {question, answer, options: {A:..., B:..., C:..., D:...}, answer_idx, meta_info}

MedQA items have no explanations. They are imported as `draft` with a placeholder explanation and the
`needs_explanation` QA flag; `rp generate explanations` (in generate/questions.py) writes per-option
explanations with Claude before the item can reach review. Items are also used as the *reference
corpus* for originality dedupe of Claude-generated questions (see qa/dedupe.py).
"""

from __future__ import annotations

import hashlib
import json
from typing import Any

from rich.console import Console
from rich.progress import track

from ..config import get_settings
from ..models import Option, Provenance, QaReport, Question
from ..sink import get_sink
from ..taxonomy import classify_by_alias

console = Console()

HF_DATASET = "awinml/medqa"
ATTRIBUTION = "MedQA, Jin et al. 2020 (MIT), https://github.com/jind11/MedQA"

# meta_info is "step1" | "step2&3" in the original release
EXAM_FOR_META = {
    "step1": "usmle-step1",
    "step2&3": "usmle-step2ck",
    "step2": "usmle-step2ck",
    "step3": "usmle-step2ck",
}


def _stable_id(question: str) -> str:
    return "medqa-" + hashlib.sha1(question.encode("utf-8")).hexdigest()[:12]


def _load_rows(split: str, limit: int) -> list[dict[str, Any]]:
    s = get_settings()
    cache = s.raw_dir / f"medqa_{split}.jsonl"
    if cache.exists():
        rows = [json.loads(line) for line in cache.read_text().splitlines() if line.strip()]
    else:
        from datasets import load_dataset  # heavy import

        console.print(f"downloading {HF_DATASET} ({split})")
        ds = load_dataset(HF_DATASET, split=None)
        names = list(ds.keys()) if split == "all" else [split]
        rows = []
        for name in names:
            # the re-upload may name configs differently; be forgiving
            if name not in ds:
                continue
            for r in ds[name]:
                rr = dict(r)
                rr["_split"] = name
                rows.append(rr)
        with cache.open("w") as f:
            for r in rows:
                f.write(json.dumps(r, ensure_ascii=False) + "\n")
    return rows[:limit] if limit else rows


def _options(r: dict[str, Any]) -> dict[str, str]:
    opts = r.get("options")
    if isinstance(opts, dict):
        return {k: str(v) for k, v in opts.items()}
    if isinstance(opts, list):  # [{key, value}] form
        return {o["key"]: str(o["value"]) for o in opts}
    if isinstance(opts, str):
        try:
            return {k: str(v) for k, v in json.loads(opts).items()}
        except json.JSONDecodeError:
            pass
    raise ValueError("unrecognized options format")


def convert(r: dict[str, Any]) -> Question | None:
    try:
        opts = _options(r)
    except ValueError:
        return None
    answer_idx = r.get("answer_idx") or r.get("answer_key")
    if not answer_idx or answer_idx not in opts:
        return None
    if not (4 <= len(opts) <= 6):
        return None
    meta = str(r.get("meta_info", "step1")).lower()
    exam_id = EXAM_FOR_META.get(meta, "usmle-step1")
    stem = str(r["question"]).strip()
    topic_id = classify_by_alias(exam_id, stem + " " + " ".join(opts.values())) or (
        "multisystem" if exam_id == "usmle-step1" else "multisystem"
    )
    options = [
        Option(
            label=k,  # type: ignore[arg-type]
            text=v,
            is_correct=(k == answer_idx),
            explanation="Explanation pending (MedQA source has no rationale).",
        )
        for k, v in sorted(opts.items())
    ]
    return Question(
        id=_stable_id(stem),
        exam_id=exam_id,  # type: ignore[arg-type]
        topic_id=topic_id,
        question_type=None,
        stem=stem,
        options=options,
        answer_label=answer_idx,
        explanation="Explanation pending: this item was imported from MedQA and needs a generated, physician-reviewed rationale.",
        difficulty="medium",
        provenance=Provenance(
            source="medqa",
            source_ref=f"{HF_DATASET}:{r.get('_split', 'unknown')}",
            license="MIT",
            attribution=ATTRIBUTION,
        ),
        status="draft",
        qa=QaReport(flags=["needs_explanation", "needs_topic_check"]),
    )


def run(limit: int = 0, split: str = "all") -> None:
    rows = _load_rows(split, limit)
    console.print(f"medqa: {len(rows)} rows")
    items: list[Question] = []
    for r in track(rows, description="converting"):
        q = convert(r)
        if q:
            items.append(q)
    sink = get_sink()
    s = get_settings()
    existing = {x["id"] for x in sink.read("questions")} if s.rp_sink == "file" else set()
    new = [q for q in items if q.id not in existing]
    n = sink.write("questions", new)
    by_exam: dict[str, int] = {}
    for q in items:
        by_exam[q.exam_id] = by_exam.get(q.exam_id, 0) + 1
    console.print(f"medqa: converted {len(items)}, wrote {n} new; by exam {by_exam}")
