"""Stage hand-authored reference animations from content/animations/reference/*.tsx.

Each reference needs a matching entry in concepts.yaml (same slug). The storyboard is derived from the
component's `meta` (sceneStartsMs + captions) so there is a single source of truth.
"""

from __future__ import annotations

import json
import re
import subprocess

from rich.console import Console

from ..config import CONTENT_DIR
from ..models import Animation, Provenance, StoryboardScene
from ..sink import FileSink
from .generate import load_concepts
from .lint import lint_component

console = Console()
REF_DIR = CONTENT_DIR / "animations" / "reference"


def _meta(src: str) -> dict:
    m = re.search(r"export const meta\s*=\s*(\{.*?\n\});", src, re.S)
    if not m:
        raise ValueError("no meta export")
    # The meta literal is plain JS data; evaluate it with Node (no imports involved) and read back JSON.
    proc = subprocess.run(
        [
            "node",
            "-e",
            "process.stdout.write(JSON.stringify(eval('(' + require('fs').readFileSync(0, 'utf8') + ')')))",
        ],
        input=m.group(1).encode("utf-8"),
        capture_output=True,
        check=True,
    )
    return json.loads(proc.stdout)


def run() -> None:
    concepts = {c["slug"]: c for c in load_concepts()}
    fs = FileSink()
    rows = fs.read("animations")
    by_slug = {r["slug"]: r for r in rows}
    n = 0
    for f in sorted(REF_DIR.glob("*.tsx")):
        src = f.read_text()
        meta = _meta(src)
        slug = meta["slug"]
        c = concepts.get(slug)
        if not c:
            console.print(f"[yellow]{slug}: no concepts.yaml entry, skipped")
            continue
        starts: list[int] = meta["sceneStartsMs"]
        ends = starts[1:] + [meta["durationMs"]]
        storyboard = [
            StoryboardScene(scene=f"scene-{i}", start_ms=a, end_ms=b, caption=cap)
            for i, (a, b, cap) in enumerate(zip(starts, ends, meta["captions"], strict=True))
        ]
        anim = Animation(
            id=by_slug.get(slug, {}).get("id") or f"anim-ref-{slug}",
            slug=slug,
            title=meta["title"],
            concept=c["concept"],
            exam_id=c["exam"],
            topic_id=c["topic"],
            storyboard=storyboard,
            component_source=src,
            duration_ms=meta["durationMs"],
            provenance=Provenance(source="human", license="original", attribution="Residency Prep contributors"),
            status="draft",
        )
        issues = lint_component(src, anim.model_dump())
        if issues:
            console.print(f"[red]{slug}: lint {issues}")
        by_slug[slug] = anim.model_dump(exclude_none=True)
        n += 1
        console.print(
            f"staged reference {slug} ({len(storyboard)} scenes, {len(src)} chars, lint={'ok' if not issues else issues})"
        )
    fs.rewrite("animations", [Animation.model_validate(v) for v in by_slug.values()])
    console.print(f"{n} reference animations staged")
