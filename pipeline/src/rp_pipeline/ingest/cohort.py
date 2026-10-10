"""Ingest the Cohort / MD3 open USMLE Step 1 corpus (CC BY 4.0).

Source layout (todd866/cohort):
  open-content/usmle/step1/questions/<system>/<slug>.v1.json   556 items, 5 options, per-option explanation
  open-content/usmle/step1/media/*.svg                         ~70 diagrams/traces
  open-content/usmle/step1/visual-assets-v1.json               rights metadata per asset
  open-content/usmle/step1/sources.json                        evidence sources (OpenStax, CDC, NIH...)

Fail-closed: an item is skipped unless publicUsmle.itemText.licence == "CC-BY-4.0".
Media is copied into apps/web/public/figures/cohort/ only if its rights.licenceId is allowed.
"""

from __future__ import annotations

import json
import shutil
import subprocess
from pathlib import Path

from rich.console import Console

from ..config import REPO_ROOT, get_settings
from ..models import Evidence, Media, Option, Provenance, Question
from ..sink import get_sink
from ..taxonomy import classify_by_alias

console = Console()

ATTRIBUTION = "MD3 contributors, CC BY 4.0, https://github.com/todd866/cohort"
COHORT_URL = "https://github.com/todd866/cohort"
PUBLIC_FIGURES = REPO_ROOT / "apps" / "web" / "public" / "figures" / "cohort"

# Cohort folder -> our usmle-step1 taxonomy leaf
SYSTEM_MAP = {
    "biochem": "biochemistry",
    "biostats": "biostatistics",
    "cardiovascular": "cardiovascular-pathology",
    "endocrine": "endocrine",
    "epidemiology": "biostatistics",
    "gastrointestinal": "gastrointestinal",
    "genetics": "biochemistry",
    "hematology": "hematology",
    "immunology": "immunology",
    "microbiology": "microbiology",
    "musculoskeletal": "musculoskeletal",
    "neuro": "neurology",
    "pharmacology": "pharmacology-general",
    "physiology": "pathology-general",
    "psych": "behavioral-health",
    "renal": "renal",
    "reproductive": "reproductive",
    "respiratory": "respiratory",
}

QTYPE_MAP = {
    "mechanism": "mechanism",
    "interpretation": "other",
    "calculation": "biostatistics",
    "diagnosis": "diagnosis",
    "management": "next_step",
    "recall": "other",
}

ALLOWED_MEDIA_LICENSES = {"CC-BY-4.0", "MIT", "us-gov", "CC0-1.0"}


def _clone(dest: Path) -> Path:
    if dest.exists():
        return dest
    console.print(f"cloning {COHORT_URL} -> {dest}")
    subprocess.run(["git", "clone", "--depth", "1", COHORT_URL, str(dest)], check=True)
    return dest


def _load_sources(root: Path) -> dict[str, dict]:
    p = root / "open-content/usmle/step1/sources.json"
    if not p.exists():
        return {}
    return {s["id"]: s for s in json.loads(p.read_text())["sources"]}


def _load_assets(root: Path) -> dict[str, dict]:
    p = root / "open-content/usmle/step1/visual-assets-v1.json"
    if not p.exists():
        return {}
    return {a["assetId"]: a for a in json.loads(p.read_text())["assets"]}


def _copy_media(root: Path, asset: dict) -> Media | None:
    rights = asset.get("rights", {})
    lic = rights.get("licenceId")
    if lic not in ALLOWED_MEDIA_LICENSES:
        return None
    src = root / "open-content/usmle/step1" / asset["relativePath"]
    if not src.exists():
        return None
    PUBLIC_FIGURES.mkdir(parents=True, exist_ok=True)
    dst = PUBLIC_FIGURES / src.name
    if not dst.exists():
        shutil.copyfile(src, dst)
    our_lic = "CC-BY-4.0" if lic.startswith("CC-BY") else ("MIT" if lic == "MIT" else "public-facts")
    return Media(
        kind="svg",
        url=f"/figures/cohort/{src.name}",
        alt=asset.get("modality", "figure"),
        license=our_lic,  # type: ignore[arg-type]
        attribution=rights.get("attribution") or ATTRIBUTION,
    )


def convert(raw: dict, folder: str, sources: dict[str, dict], assets: dict[str, dict], root: Path) -> Question | None:
    pub = raw.get("publicUsmle", {})
    if pub.get("itemText", {}).get("licence") != "CC-BY-4.0":
        return None

    options = []
    for o in raw["options"]:
        options.append(
            Option(
                label=o["label"],
                text=o["text"],
                is_correct=bool(o["isCorrect"]),
                explanation=o.get("explanation") or o.get("misconception") or "See overall explanation.",
                misconception=o.get("misconception"),
            )
        )
    correct = [o.label for o in options if o.is_correct]
    if len(correct) != 1:
        return None

    topic_id = SYSTEM_MAP.get(folder)
    if topic_id is None:
        topic_id = (
            classify_by_alias("usmle-step1", raw["stem"] + " " + " ".join(raw.get("topics", []))) or "multisystem"
        )

    evidence: list[Evidence] = []
    ev = pub.get("evidence") or {}
    src = sources.get(ev.get("sourceId", ""))
    if src:
        evidence.append(Evidence(title=src.get("title", ev["sourceId"]), url=src.get("canonicalUrl")))

    media: list[Media] = []
    m = pub.get("media")
    if m and m.get("kind") == "asset" and m.get("assetId") in assets:
        conv = _copy_media(root, assets[m["assetId"]])
        if conv:
            if raw.get("imageCaption"):
                conv.caption = raw["imageCaption"]
            media.append(conv)
        else:
            # media not redistributable -> item would be incomplete; skip it
            return None

    context = raw.get("context", "")
    explanation = (
        context
        if len(context) >= 40
        else (context + " " + next(o.explanation for o in options if o.is_correct)).strip()
    )
    if len(explanation) < 40:
        explanation = explanation + " " + " ".join(o.explanation for o in options)

    slug = raw["id"].split(":")[-2] if raw["id"].count(":") >= 3 else raw["id"].replace(":", "-")
    return Question(
        id=f"cohort-{slug}",
        exam_id="usmle-step1",
        topic_id=topic_id,
        topic_ids=[],
        question_type=QTYPE_MAP.get(raw.get("questionType", ""), "other"),  # type: ignore[arg-type]
        stem=raw["stem"],
        options=options,
        answer_label=correct[0],
        explanation=explanation,
        teaching_point=None,
        media=media,
        difficulty=raw.get("difficulty", "medium") if raw.get("difficulty") in ("easy", "medium", "hard") else "medium",
        evidence=evidence,
        provenance=Provenance(
            source="cohort",
            source_ref=raw["id"],
            license="CC-BY-4.0",
            attribution=ATTRIBUTION,
            ai_drafted=pub.get("origin") == "generated",
        ),
        status="draft",
    )


def run(repo: Path | None) -> None:
    s = get_settings()
    root = _clone(repo or (s.raw_dir / "cohort"))
    qdir = root / "open-content/usmle/step1/questions"
    sources = _load_sources(root)
    assets = _load_assets(root)
    items: list[Question] = []
    skipped = 0
    for f in sorted(qdir.glob("**/*.json")):
        raw = json.loads(f.read_text())
        q = convert(raw, f.parent.name, sources, assets, root)
        if q is None:
            skipped += 1
            continue
        items.append(q)
    sink = get_sink()
    existing = {r["id"] for r in sink.read("questions")} if hasattr(sink, "read") and s.rp_sink == "file" else set()
    new = [q for q in items if q.id not in existing]
    n = sink.write("questions", new)
    console.print(f"cohort: converted {len(items)}, skipped {skipped}, wrote {n} new (dup {len(items) - len(new)})")
    by_topic: dict[str, int] = {}
    for q in items:
        by_topic[q.topic_id] = by_topic.get(q.topic_id, 0) + 1
    console.print(dict(sorted(by_topic.items())))
