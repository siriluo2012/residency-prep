"""Draft original vignettes (and, for imported MedQA items, their missing explanations)."""

from __future__ import annotations

from datetime import UTC, datetime
from typing import Literal

from pydantic import BaseModel, Field
from rich.console import Console
from rich.progress import track

from ..claude import ClaudeUnavailable, estimate_cost_usd, structured
from ..config import get_settings
from ..models import Difficulty, ExamId, Label, Option, Provenance, QaReport, Question, QuestionType
from ..sink import FileSink, get_sink
from ..taxonomy import leaf_topics, load_taxonomy, topic_label
from .prompts import (
    AVOID_BLOCK,
    EXPLANATION_SYSTEM,
    EXPLANATION_USER,
    QUESTION_SYSTEM,
    QUESTION_USER,
    outline_for_topic,
    topic_ids,
)

console = Console()


# ---- structured output schemas (what Claude emits) ----


class DraftOption(BaseModel):
    label: Label
    text: str
    is_correct: bool
    explanation: str = Field(description="Why this option is right or wrong")
    misconception: str | None = Field(default=None, description="For wrong options: the misconception it exploits")


class DraftQuestion(BaseModel):
    stem: str
    options: list[DraftOption] = Field(min_length=5, max_length=5)
    answer_label: Label
    explanation: str
    teaching_point: str
    question_type: QuestionType
    difficulty: Difficulty
    lab_values_used: bool = False
    animation_worthiness: int = Field(ge=0, le=5)
    sub_concept: str = Field(description="Short label of the specific concept tested, for coverage tracking")
    evidence: list[str] = Field(default_factory=list, description="Guideline/source names with year, if any")


class DraftBatch(BaseModel):
    questions: list[DraftQuestion]


class ExplanationOut(BaseModel):
    options: list[DraftOption]
    explanation: str
    teaching_point: str
    question_type: QuestionType
    difficulty: Difficulty
    topic_id: str
    animation_worthiness: int = Field(ge=0, le=5)
    flag_for_review: bool = False
    reviewer_note: str | None = None


# ---- helpers ----


def _batch_label(batch: str | None) -> str:
    return batch or datetime.now(UTC).strftime("gen-%Y%m%d-%H%M")


def _to_question(d: DraftQuestion, exam_id: ExamId, topic_id: str, batch: str, model: str) -> Question:
    return Question(
        exam_id=exam_id,
        topic_id=topic_id,
        question_type=d.question_type,
        stem=d.stem.strip(),
        options=[Option(**o.model_dump()) for o in d.options],
        answer_label=d.answer_label,
        explanation=d.explanation.strip(),
        teaching_point=d.teaching_point.strip(),
        lab_values_used=d.lab_values_used,
        animation_worthiness=d.animation_worthiness,
        difficulty=d.difficulty,
        evidence=[{"title": e} for e in d.evidence],  # type: ignore[list-item]
        provenance=Provenance(
            source="claude",
            license="original",
            generator_model=model,
            generation_batch=batch,
            ai_drafted=True,
        ),
        status="draft",
        qa=QaReport(flags=[f"sub_concept:{d.sub_concept[:60]}"]),
    )


def _covered_subconcepts(existing: list[dict], exam_id: str, topic_id: str) -> list[str]:
    out: list[str] = []
    for r in existing:
        if r.get("exam_id") == exam_id and r.get("topic_id") == topic_id:
            for f in (r.get("qa") or {}).get("flags", []):
                if f.startswith("sub_concept:"):
                    out.append(f.split(":", 1)[1])
    return out[-40:]


# ---- commands ----


def run(
    *,
    exam: ExamId,
    topic: str | None,
    n: int,
    difficulty: str | None,
    batch: str | None,
    all_topics: bool,
    dry_run: bool,
) -> None:
    s = get_settings()
    tax = load_taxonomy(exam)
    if all_topics:
        targets = [t.id for t in leaf_topics(exam)]
    elif topic:
        if topic not in {t.id for t, _ in tax.flat()}:
            raise SystemExit(f"unknown topic {topic}; see content/taxonomy/{exam}.json")
        targets = [topic]
    else:
        raise SystemExit("pass --topic <id> or --all-topics")

    batch_label = _batch_label(batch)
    sink = get_sink()
    existing = FileSink().read("questions")
    total_cost = 0.0
    written = 0
    for topic_id in track(targets, description="generating"):
        avoid = _covered_subconcepts(existing, exam, topic_id)
        user = QUESTION_USER.format(
            exam_name=tax.name,
            topic_name=topic_label(exam, topic_id),
            topic_id=topic_id,
            exam_id=exam,
            outline=outline_for_topic(exam, topic_id),
            difficulty=difficulty or "mixed (1 easy, rest medium/hard)",
            qtype="mixed; favour mechanism and next_step"
            if exam == "usmle-step1"
            else "mixed; favour next_step and diagnosis",
            n=n,
            avoid_block=AVOID_BLOCK.format(avoid="\n".join(f"- {a}" for a in avoid)) if avoid else "",
        )
        if dry_run:
            console.print(f"[dim]--- {topic_id} prompt ---\n{user[:1200]}")
            continue
        try:
            out, usage = structured(system=QUESTION_SYSTEM, user=user, output=DraftBatch, max_tokens=8000)
        except ClaudeUnavailable as e:
            raise SystemExit(str(e)) from e
        total_cost += estimate_cost_usd(usage)
        items = []
        for d in out.questions[:n]:
            try:
                items.append(_to_question(d, exam, topic_id, batch_label, usage["model"]))
            except ValueError as e:
                console.log(f"[yellow]dropped invalid draft in {topic_id}: {e}")
        written += sink.write("questions", items)
        existing += [i.model_dump() for i in items]
    console.print(
        f"wrote {written} drafts to batch {batch_label}; est. cost ${total_cost:.3f} "
        f"(${total_cost / max(written, 1):.4f}/question)  sink={s.rp_sink}"
    )


def explain_missing(limit: int = 0, batch: str | None = None) -> None:
    """Fill explanations for imported items flagged needs_explanation (MedQA)."""
    fs = FileSink()
    rows = fs.read("questions")
    todo = [r for r in rows if "needs_explanation" in ((r.get("qa") or {}).get("flags") or [])]
    if limit:
        todo = todo[:limit]
    console.print(f"{len(todo)} questions need explanations")
    batch_label = _batch_label(batch)
    by_id = {r["id"]: r for r in rows}
    cost = 0.0
    for r in track(todo, description="explaining"):
        q = Question.model_validate(r)
        user = EXPLANATION_USER.format(
            exam_id=q.exam_id,
            topic_ids=", ".join(topic_ids(q.exam_id)),
            stem=q.stem,
            options="\n".join(f"{o.label}. {o.text}" for o in q.options),
            answer=q.answer_label,
        )
        out, usage = structured(
            system=EXPLANATION_SYSTEM, user=user, output=ExplanationOut, max_tokens=3000, temperature=0.3
        )
        cost += estimate_cost_usd(usage)
        opt_by_label = {o.label: o for o in out.options}
        q.options = [
            Option(
                label=o.label,
                text=o.text,
                is_correct=o.is_correct,
                explanation=opt_by_label[o.label].explanation if o.label in opt_by_label else o.explanation,
                misconception=opt_by_label[o.label].misconception if o.label in opt_by_label else None,
            )
            for o in q.options
        ]
        q.explanation = out.explanation
        q.teaching_point = out.teaching_point
        q.question_type = out.question_type
        q.difficulty = out.difficulty
        q.animation_worthiness = out.animation_worthiness
        if out.topic_id in topic_ids(q.exam_id):
            q.topic_id = out.topic_id
        flags = [f for f in (q.qa.flags if q.qa else []) if f not in ("needs_explanation", "needs_topic_check")]
        if out.flag_for_review:
            flags.append("generator_flagged:" + (out.reviewer_note or "")[:120])
        q.qa = QaReport(flags=flags)
        q.provenance.generator_model = usage["model"]
        q.provenance.generation_batch = batch_label
        q.provenance.ai_drafted = True  # explanation is AI-drafted even though the stem is MedQA
        by_id[q.id] = q.model_dump(exclude_none=True)
    fs.rewrite("questions", [Question.model_validate(v) for v in by_id.values()])
    console.print(f"explained {len(todo)}; est. cost ${cost:.3f}")


Mode = Literal["draft", "explain"]
