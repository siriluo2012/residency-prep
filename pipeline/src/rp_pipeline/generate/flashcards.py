"""Derive 2-4 flashcards per question for questions that have none yet."""

from __future__ import annotations

from datetime import UTC, datetime

from pydantic import BaseModel, Field
from rich.console import Console
from rich.progress import track

from ..claude import estimate_cost_usd, structured
from ..models import Flashcard, Provenance, Question
from ..sink import FileSink, get_sink
from ..taxonomy import topic_label
from .prompts import FLASHCARD_SYSTEM, FLASHCARD_USER

console = Console()


class DraftCard(BaseModel):
    kind: str = Field(default="basic", pattern="^(basic|cloze)$")
    front: str
    back: str
    cloze_text: str | None = None
    tags: list[str] = Field(default_factory=list, max_length=5)


class DraftCards(BaseModel):
    cards: list[DraftCard] = Field(min_length=2, max_length=4)


def heuristic_cards(q: Question, batch_label: str) -> list[Flashcard]:
    """Derive cards without an LLM: question->answer, answer->why, and one card per distractor misconception.

    Used when no ANTHROPIC_API_KEY is available. Cards inherit the question's license/attribution and go
    through the same review queue; reviewers can edit or reject them like any other item.
    """
    correct = next(o for o in q.options if o.is_correct)
    prov = Provenance(
        source=q.provenance.source,
        source_ref=q.id,
        license=q.provenance.license,
        attribution=q.provenance.attribution,
        generation_batch=batch_label,
        ai_drafted=q.provenance.ai_drafted,
    )
    extra_tags = [
        f.split(":", 1)[1].lower()[:30]
        for f in (q.qa.flags if q.qa else [])
        if f.startswith("sub_concept:")
    ]
    tags = [q.topic_id, *extra_tags]
    base = dict(
        exam_id=q.exam_id,
        topic_id=q.topic_id,
        question_id=q.id,
        animation_id=q.animation_id,
        tags=tags[:5],
        provenance=prov,
    )
    cards = [
        Flashcard(front=q.stem, back=correct.text, extra=correct.explanation, **base),  # type: ignore[arg-type]
    ]
    if q.teaching_point:
        stem = q.stem[:160] + ("…" if len(q.stem) > 160 else "")
        cards.append(Flashcard(front=f"Key point: {stem}", back=q.teaching_point, **base))  # type: ignore[arg-type]
    for o in q.options:
        if o.is_correct or not o.misconception or len(o.misconception) <= 12:
            continue
        if o.misconception.lower().startswith("none"):
            continue
        stem = q.stem[:120] + ("…" if len(q.stem) > 120 else "")
        cards.append(
            Flashcard(
                front=f"Why is “{o.text}” wrong here? {stem}",
                back=o.explanation,
                extra=o.misconception,
                **base,
            ),  # type: ignore[arg-type]
        )
        if len(cards) >= 4:
            break
    return cards


def run(limit: int = 0, batch: str | None = None, only_reviewed: bool = False, mode: str = "auto") -> None:
    from ..config import get_settings

    fs = FileSink()
    questions = [Question.model_validate(r) for r in fs.read("questions")]
    have = {r.get("question_id") for r in fs.read("flashcards")}
    todo = [q for q in questions if q.id not in have and not q.explanation.startswith("Explanation pending")]
    if only_reviewed:
        todo = [q for q in todo if q.status in ("approved", "published")]
    if limit:
        todo = todo[:limit]
    batch_label = batch or datetime.now(UTC).strftime("cards-%Y%m%d-%H%M")
    sink = get_sink()
    use_llm = mode == "llm" or (mode == "auto" and bool(get_settings().anthropic_api_key))
    if not use_llm:
        n = 0
        for q in track(todo, description="flashcards (heuristic)"):
            n += sink.write("flashcards", heuristic_cards(q, batch_label))
        console.print(f"wrote {n} heuristic flashcards for {len(todo)} questions (no LLM); batch {batch_label}")
        return
    cost = 0.0
    n = 0
    for q in track(todo, description="flashcards"):
        user = FLASHCARD_USER.format(
            exam_id=q.exam_id,
            topic_name=topic_label(q.exam_id, q.topic_id),
            topic_id=q.topic_id,
            stem=q.stem,
            answer=next(o.text for o in q.options if o.is_correct),
            explanation=q.explanation,
            teaching_point=q.teaching_point or "",
        )
        out, usage = structured(system=FLASHCARD_SYSTEM, user=user, output=DraftCards, max_tokens=1500, temperature=0.4)
        cost += estimate_cost_usd(usage)
        cards = [
            Flashcard(
                exam_id=q.exam_id,
                topic_id=q.topic_id,
                question_id=q.id,
                animation_id=q.animation_id,
                kind=c.kind,  # type: ignore[arg-type]
                front=c.front.strip(),
                back=c.back.strip(),
                cloze_text=c.cloze_text,
                tags=[t.lower() for t in c.tags],
                provenance=Provenance(
                    source="claude",
                    license="original" if q.provenance.license == "original" else q.provenance.license,
                    attribution=q.provenance.attribution,
                    generator_model=usage["model"],
                    generation_batch=batch_label,
                    ai_drafted=True,
                ),
                status="draft",
            )
            for c in out.cards
        ]
        n += sink.write("flashcards", cards)
    console.print(f"wrote {n} flashcards for {len(todo)} questions; est. cost ${cost:.3f}")
