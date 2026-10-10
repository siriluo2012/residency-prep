"""Assign taxonomy topics to staged items whose topic_id is missing/invalid or flagged needs_topic_check."""

from __future__ import annotations

from pydantic import BaseModel
from rich.console import Console
from rich.progress import track

from ..claude import estimate_cost_usd, structured
from ..config import get_settings
from ..models import Question
from ..sink import FileSink
from ..taxonomy import all_topic_ids, classify_by_alias
from .prompts import CLASSIFY_SYSTEM, CLASSIFY_USER, topic_list

console = Console()


class TopicOut(BaseModel):
    topic_id: str
    confidence: float


def run(kind: str = "questions", limit: int = 0) -> None:
    if kind != "questions":
        raise SystemExit("only questions are classified for now")
    fs = FileSink()
    rows = fs.read("questions")
    todo = [
        r
        for r in rows
        if r.get("topic_id") not in all_topic_ids(r["exam_id"])
        or "needs_topic_check" in ((r.get("qa") or {}).get("flags") or [])
    ]
    if limit:
        todo = todo[:limit]
    console.print(f"{len(todo)} questions to classify")
    s = get_settings()
    by_id = {r["id"]: r for r in rows}
    cost = 0.0
    for r in track(todo, description="classifying"):
        q = Question.model_validate(r)
        valid = all_topic_ids(q.exam_id)
        chosen: str | None = None
        if s.anthropic_api_key:
            out, usage = structured(
                system=CLASSIFY_SYSTEM,
                user=CLASSIFY_USER.format(
                    exam_id=q.exam_id,
                    topics=topic_list(q.exam_id),
                    stem=q.stem,
                    options="; ".join(o.text for o in q.options),
                ),
                output=TopicOut,
                model=s.rp_claude_fast_model,
                max_tokens=200,
                temperature=0.0,
            )
            cost += estimate_cost_usd(usage)
            if out.topic_id in valid and out.confidence >= 0.5:
                chosen = out.topic_id
        if chosen is None:
            chosen = classify_by_alias(q.exam_id, q.text_for_embedding()) or (
                "multisystem" if "multisystem" in valid else next(iter(valid))
            )
        q.topic_id = chosen
        if q.qa:
            q.qa.flags = [f for f in q.qa.flags if f != "needs_topic_check"]
        by_id[q.id] = q.model_dump(exclude_none=True)
    fs.rewrite("questions", [Question.model_validate(v) for v in by_id.values()])
    console.print(f"classified {len(todo)}; est. cost ${cost:.3f}")
