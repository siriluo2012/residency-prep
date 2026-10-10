"""Structure-only crawlers.

Each source defines a list of URLs and a `postprocess()` that turns `Extracted` pages into a JSON
document under content/crawl/<source>.json:

  {
    "source": "usmle",
    "crawled_at": "...",
    "pages": [{"url", "title", "headings", "weight_rows", "facts", "outline"}],
    "blueprint_diff": [...]     # for usmle: differences vs content/taxonomy/*.json weights
  }

Nothing here stores question text, explanations, or article prose. Only headings, percentage
rows, fee/eligibility facts, and the heading tree. See docs/CONTENT_POLICY.md.
"""

from __future__ import annotations

import json
from dataclasses import asdict
from datetime import UTC, datetime

from rich.console import Console

from ..config import CONTENT_DIR
from ..taxonomy import load_taxonomy
from .extract import Extracted, extract
from .fetch import Fetcher

console = Console()
CRAWL_DIR = CONTENT_DIR / "crawl"

SOURCES: dict[str, dict] = {
    "usmle": {
        "urls": [
            "https://www.usmle.org/step-exams/step-1",
            "https://www.usmle.org/step-exams/step-1/step-1-exam-content",
            "https://www.usmle.org/exam-resources/step-1-materials/step-1-content-outline-and-specifications",
            "https://www.usmle.org/step-exams/step-2-ck",
            "https://www.usmle.org/step-exams/step-2-ck/step-2-ck-exam-content",
            "https://www.usmle.org/exam-resources/step-2-ck-materials/step-2-ck-content-outline-specifications",
            "https://www.usmle.org/apply-exams",
            "https://www.usmle.org/bulletin-information/eligibility",
            "https://www.usmle.org/bulletin-information/scoring-and-score-reporting",
            "https://www.usmle.org/scores-transcripts/examination-results-and-scoring",
        ],
        "exams": ["usmle-step1", "usmle-step2ck"],
    },
    # ecfmg.org returns 403 to non-browser user agents; we do not spoof. Facts in
    # content/taxonomy/ecfmg.json are verified manually with verified_at dates.
    "ecfmg": {
        "urls": [
            "https://www.ecfmg.org/certification/",
            "https://www.ecfmg.org/certification-requirements-exams/",
            "https://www.ecfmg.org/certification-pathways/",
            "https://www.ecfmg.org/certification-requirements-exams/english-proficiency/",
            "https://www.ecfmg.org/fees/",
        ],
        "exams": ["ecfmg"],
    },
    "oet": {
        "urls": [
            "https://oet.com/test",
            "https://oet.com/ready",
            "https://oet.com/ready/sample-tests/oet-test-on-computer/medicine",
        ],
        "exams": ["oet-medicine"],
    },
    # Structure only: the chapter/section outline, never question or guide text.
    "openexamprep": {
        "urls": [
            "https://open-exam-prep.com/study-guides/usmle-step1",
            "https://open-exam-prep.com/study-guides/usmle-step2-ck",
        ],
        "exams": ["usmle-step1", "usmle-step2ck"],
        "structure_only": True,
    },
}


def _blueprint_diff(exam_id: str, pages: list[Extracted]) -> list[dict]:
    """Compare crawled percentage rows against our taxonomy weights; emit suggestions, never auto-apply."""
    tax = load_taxonomy(exam_id)  # type: ignore[arg-type]
    ours = {_norm(t.name): (t.weight_min_pct, t.weight_max_pct) for t, _ in tax.flat() if t.weight_min_pct is not None}
    page_key = "step-1" if exam_id == "usmle-step1" else "step-2"
    diffs: list[dict] = []
    for p in pages:
        if page_key not in p.url:
            continue
        for row in p.weight_rows:
            if row.get("group") and "system" not in row["group"]:
                continue  # competency / discipline tables are not topic weights
            label = _norm(row["label"])
            match = ours.get(label) and label
            if not match:
                match = next((k for k in ours if k.split(" ")[0] == label.split(" ")[0]), None)
            if match is None:
                diffs.append(
                    {
                        "exam": exam_id,
                        "topic": None,
                        "crawled_label": row["label"],
                        "crawled": (row["min"], row["max"]),
                        "url": p.url,
                    }
                )
            elif ours[match] != (float(row["min"]), float(row["max"])):
                diffs.append(
                    {
                        "exam": exam_id,
                        "topic": match,
                        "ours": ours[match],
                        "crawled": (row["min"], row["max"]),
                        "url": p.url,
                    }
                )
    return diffs


def _norm(s: str) -> str:
    return " ".join(s.lower().replace("&", "and").replace("/", " ").replace(":", "").split())


def run_one(name: str, refresh: bool = False) -> None:
    if name not in SOURCES:
        raise SystemExit(f"unknown source {name}; choose from {list(SOURCES)}")
    cfg = SOURCES[name]
    f = Fetcher(refresh=refresh)
    pages: list[Extracted] = []
    for url in cfg["urls"]:
        html = f.get(url)
        if not html:
            continue
        ex = extract(url, html)
        if cfg.get("structure_only"):
            ex.facts = []  # keep only outline/headings for third-party sites
        pages.append(ex)
        console.print(
            f"[green]{name}[/] {url}: {len(ex.headings)} headings, {len(ex.weight_rows)} weight rows, {len(ex.facts)} facts"
        )
    diffs: list[dict] = []
    if name != "openexamprep":
        for exam_id in cfg["exams"]:
            diffs += _blueprint_diff(exam_id, pages)
    out: dict = {
        "source": name,
        "crawled_at": datetime.now(UTC).isoformat(),
        "pages": [asdict(p) for p in pages],
        "blueprint_diff": diffs,
    }
    if name == "usmle":
        from .pdf_outline import download, parse_outline

        pdf = download(f.client, f.s.raw_dir / "USMLE_Content_Outline.pdf")
        if pdf:
            outline = parse_outline(pdf)
            out["content_outline"] = outline
            console.print(
                f"[green]usmle[/] content outline PDF: {len(outline)} systems, "
                f"{sum(len(s['categories']) for s in outline)} categories"
            )
    CRAWL_DIR.mkdir(parents=True, exist_ok=True)
    (CRAWL_DIR / f"{name}.json").write_text(json.dumps(out, indent=2, ensure_ascii=False))
    if diffs:
        console.print(
            f"[yellow]{len(diffs)} blueprint differences found; review content/crawl/{name}.json and update taxonomy manually"
        )


def run_all(refresh: bool = False) -> None:
    for name in SOURCES:
        run_one(name, refresh=refresh)
