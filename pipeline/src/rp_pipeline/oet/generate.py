"""Generate OET Medicine practice tasks for all four sub-tests."""

from __future__ import annotations

from datetime import UTC, datetime
from typing import Literal

from pydantic import BaseModel, Field
from rich.console import Console
from rich.progress import track

from ..claude import ClaudeUnavailable, estimate_cost_usd, structured
from ..models import (
    OetComprehensionItem,
    OetComprehensionPayload,
    OetSpeakingPayload,
    OetTask,
    OetWritingPayload,
    Provenance,
)
from ..sink import get_sink
from .prompts import COMPREHENSION_SYSTEM, SPEAKING_SYSTEM, WRITING_SYSTEM

console = Console()

TOPICS = [
    "newly diagnosed type 2 diabetes",
    "community-acquired pneumonia follow-up",
    "post-myocardial infarction discharge",
    "asthma exacerbation in a teenager",
    "chronic kidney disease referral to nephrology",
    "falls in an older adult",
    "postnatal depression",
    "paediatric otitis media recurrence",
    "hypertension poorly controlled",
    "deep vein thrombosis",
    "COPD discharge with home oxygen",
    "rheumatoid arthritis referral",
    "suspected colorectal cancer two-week referral",
    "migraine with aura",
    "iron-deficiency anaemia investigation",
    "alcohol use disorder brief intervention",
]


class WritingOut(BaseModel):
    title: str
    case_notes: str
    task_instruction: str
    recipient: str
    key_content_points: list[str] = Field(min_length=5, max_length=8)
    model_answer: str


class ItemOut(BaseModel):
    type: Literal["mcq", "gap_fill", "short_answer", "matching"]
    prompt: str
    options: list[str] | None = None
    answer: str
    accepted_answers: list[str] | None = None
    explanation: str


class ComprehensionOut(BaseModel):
    title: str
    passage: str
    items: list[ItemOut] = Field(min_length=3)


class SpeakingOut(BaseModel):
    title: str
    setting: str
    candidate_card: str
    interlocutor_card: str
    model_dialogue: str
    assessment_focus: list[str] = Field(min_length=3, max_length=5)


def _prov(usage: dict, batch: str) -> Provenance:
    return Provenance(
        source="claude",
        license="original",
        generator_model=usage["model"],
        generation_batch=batch,
        ai_drafted=True,
    )


def run(subtest: str, n: int, batch: str | None, dry_run: bool) -> None:
    if subtest not in ("reading", "listening", "writing", "speaking"):
        raise SystemExit("subtest must be reading|listening|writing|speaking")
    batch_label = batch or datetime.now(UTC).strftime("oet-%Y%m%d-%H%M")
    sink = get_sink()
    cost = 0.0
    tasks: list[OetTask] = []
    parts = ["A", "B", "C"]
    for i in track(range(n), description=f"oet {subtest}"):
        topic = TOPICS[i % len(TOPICS)]
        if dry_run:
            console.print(f"[dim]{subtest} #{i + 1}: {topic}")
            continue
        try:
            if subtest == "writing":
                out, usage = structured(
                    system=WRITING_SYSTEM,
                    user=f"Clinical scenario: {topic}. Letter type: referral.",
                    output=WritingOut,
                    max_tokens=4000,
                )
                tasks.append(
                    OetTask(
                        subtest="writing",
                        title=out.title,
                        payload=OetWritingPayload(**out.model_dump(exclude={"title"})),
                        provenance=_prov(usage, batch_label),
                    )
                )
            elif subtest == "speaking":
                out, usage = structured(
                    system=SPEAKING_SYSTEM,
                    user=f"Clinical scenario: {topic}.",
                    output=SpeakingOut,
                    max_tokens=4000,
                )
                tasks.append(
                    OetTask(
                        subtest="speaking",
                        title=out.title,
                        payload=OetSpeakingPayload(**out.model_dump(exclude={"title"})),
                        provenance=_prov(usage, batch_label),
                    )
                )
            else:
                part = parts[i % 3]
                out, usage = structured(
                    system=COMPREHENSION_SYSTEM.format(subtest=subtest.capitalize(), part=part),
                    user=f"Clinical topic: {topic}.",
                    output=ComprehensionOut,
                    max_tokens=6000,
                )
                tasks.append(
                    OetTask(
                        subtest=subtest,  # type: ignore[arg-type]
                        part=part,
                        title=out.title,
                        payload=OetComprehensionPayload(
                            passage=out.passage,
                            items=[OetComprehensionItem(**it.model_dump()) for it in out.items],
                        ),
                        provenance=_prov(usage, batch_label),
                    )
                )
        except ClaudeUnavailable as e:
            raise SystemExit(str(e)) from e
        cost += estimate_cost_usd(usage)
    if tasks:
        sink.write("oet", tasks)
    console.print(f"wrote {len(tasks)} {subtest} tasks; est. cost ${cost:.3f}")
