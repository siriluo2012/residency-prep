"""Generate AnimatedConcept components from content/animations/concepts.yaml with Claude."""

from __future__ import annotations

from datetime import UTC, datetime

import yaml
from pydantic import BaseModel, Field
from rich.console import Console
from rich.progress import track

from ..claude import ClaudeUnavailable, estimate_cost_usd, structured
from ..config import CONTENT_DIR, get_settings
from ..models import Animation, Provenance, StoryboardScene
from ..sink import FileSink, get_sink
from .lint import lint_component
from .prompts import ANIMATION_SYSTEM, ANIMATION_USER, FEEDBACK_BLOCK

console = Console()
CONCEPTS = CONTENT_DIR / "animations" / "concepts.yaml"


class SceneOut(BaseModel):
    scene: str
    start_ms: int
    end_ms: int
    caption: str
    visual: str


class AnimationOut(BaseModel):
    component_source: str = Field(description="Full TSX module source")
    storyboard: list[SceneOut] = Field(min_length=2, max_length=8)
    duration_ms: int = Field(ge=3000, le=30000)
    static_fallback_svg: str


def load_concepts() -> list[dict]:
    return yaml.safe_load(CONCEPTS.read_text())


def _validate(out: AnimationOut, item: dict) -> list[str]:
    issues = lint_component(
        out.component_source,
        {**item, "storyboard": [s.model_dump() for s in out.storyboard], "duration_ms": out.duration_ms},
    )
    if not out.static_fallback_svg.lstrip().startswith("<svg"):
        issues.append("static_fallback_not_svg")
    if (
        "export const meta" in out.component_source
        and f"slug: '{item['slug']}'" not in out.component_source
        and f'slug: "{item["slug"]}"' not in out.component_source
    ):
        issues.append("meta_slug_mismatch")
    return issues


def run(limit: int = 0, slug: str | None = None, batch: str | None = None, dry_run: bool = False) -> None:
    s = get_settings()
    concepts = load_concepts()
    if slug:
        concepts = [c for c in concepts if c["slug"] == slug]
    fs = FileSink()
    existing = {r["slug"] for r in fs.read("animations")}
    todo = [c for c in concepts if c["slug"] not in existing]
    if limit:
        todo = todo[:limit]
    console.print(f"{len(todo)} concepts to animate ({len(existing)} already staged)")
    batch_label = batch or datetime.now(UTC).strftime("anim-%Y%m%d-%H%M")
    sink = get_sink()
    cost = 0.0
    for c in track(todo, description="animating"):
        user = ANIMATION_USER.format(
            slug=c["slug"],
            title=c["title"],
            exam=c["exam"],
            topic=c["topic"],
            concept=c["concept"],
            scenes="; ".join(c.get("scenes", [])),
            duration_ms=c.get("duration_ms", 12000),
            tags=", ".join(c.get("tags", [])),
            feedback_block="",
        )
        if dry_run:
            console.print(f"[dim]--- {c['slug']} ---\n{user[:600]}")
            continue
        issues: list[str] = []
        out: AnimationOut | None = None
        for attempt in range(3):
            prompt = (
                user
                if not issues
                else user.replace(
                    "\n\nProduce the component",
                    "\n"
                    + FEEDBACK_BLOCK.format(issues="\n".join(f"- {i}" for i in issues))
                    + "\nProduce the component",
                )
            )
            try:
                out, usage = structured(
                    system=ANIMATION_SYSTEM,
                    user=prompt,
                    output=AnimationOut,
                    max_tokens=16000,
                    temperature=0.5,
                )
            except ClaudeUnavailable as e:
                raise SystemExit(str(e)) from e
            cost += estimate_cost_usd(usage)
            issues = _validate(out, c)
            if not issues:
                break
            console.log(f"[yellow]{c['slug']} attempt {attempt + 1}: {', '.join(issues)}")
        if out is None:
            continue
        anim = Animation(
            slug=c["slug"],
            title=c["title"],
            concept=c["concept"],
            exam_id=c["exam"],
            topic_id=c["topic"],
            storyboard=[StoryboardScene(**sc.model_dump()) for sc in out.storyboard],
            component_source=out.component_source,
            duration_ms=out.duration_ms,
            static_fallback_svg=out.static_fallback_svg,
            provenance=Provenance(
                source="claude",
                license="original",
                generator_model=usage["model"],
                generation_batch=batch_label,
                ai_drafted=True,
            ),
            status="draft",
        )
        if issues:
            anim.render_test = {"passed": False, "errors": [f"lint:{i}" for i in issues]}  # type: ignore[assignment]
        sink.write("animations", [anim])
    console.print(f"done; est. cost ${cost:.3f}  ({len(todo)} concepts)  sink={s.rp_sink}")
