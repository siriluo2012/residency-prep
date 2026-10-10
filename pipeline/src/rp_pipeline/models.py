"""Pydantic mirrors of packages/schema/schemas/*.json.

The JSON Schemas remain the source of truth; `rp_pipeline.qa.validate` checks every staged
item against them, so drift between these models and the schema is caught at QA time.
"""

from __future__ import annotations

import uuid
from datetime import UTC, datetime
from typing import Literal

from pydantic import BaseModel, Field, model_validator

ExamId = Literal["usmle-step1", "usmle-step2ck", "oet-medicine", "ecfmg"]
Tier = Literal["free", "pro"]
ContentStatus = Literal["draft", "in_review", "changes_requested", "approved", "rejected", "published", "retired"]
SourceId = Literal["medqa", "cohort", "claude", "human", "official"]
LicenseId = Literal["MIT", "CC-BY-4.0", "original", "public-facts"]
Difficulty = Literal["easy", "medium", "hard"]
QuestionType = Literal[
    "diagnosis",
    "mechanism",
    "next_step",
    "pharmacology",
    "biostatistics",
    "ethics",
    "pathophysiology",
    "anatomy",
    "microbiology",
    "other",
]
Label = Literal["A", "B", "C", "D", "E", "F"]


def now_iso() -> str:
    return datetime.now(UTC).isoformat().replace("+00:00", "Z")


def new_id(prefix: str) -> str:
    return f"{prefix}-{uuid.uuid4().hex[:12]}"


class Provenance(BaseModel):
    source: SourceId
    source_ref: str | None = None
    license: LicenseId
    attribution: str | None = None
    generator_model: str | None = None
    generation_batch: str | None = None
    ai_drafted: bool = False


class Media(BaseModel):
    kind: Literal["image", "svg", "audio", "video", "animation"]
    url: str
    alt: str | None = None
    caption: str | None = None
    license: LicenseId | None = None
    attribution: str | None = None


class Evidence(BaseModel):
    title: str
    url: str | None = None
    year: int | None = None


class QaReport(BaseModel):
    schema_ok: bool | None = None
    max_similarity: float | None = None
    nearest_source_ref: str | None = None
    flags: list[str] = Field(default_factory=list)
    readability_grade: float | None = None


class Option(BaseModel):
    label: Label
    text: str
    is_correct: bool
    explanation: str
    misconception: str | None = None


class Question(BaseModel):
    id: str = Field(default_factory=lambda: new_id("q"))
    exam_id: ExamId
    topic_id: str
    topic_ids: list[str] = Field(default_factory=list)
    question_type: QuestionType | None = None
    stem: str
    options: list[Option]
    answer_label: Label
    explanation: str
    teaching_point: str | None = None
    lab_values_used: bool = False
    media: list[Media] = Field(default_factory=list)
    animation_id: str | None = None
    animation_worthiness: int = 0
    difficulty: Difficulty
    evidence: list[Evidence] = Field(default_factory=list)
    provenance: Provenance
    status: ContentStatus = "draft"
    tier: Tier = "free"
    qa: QaReport | None = None
    created_at: str = Field(default_factory=now_iso)
    updated_at: str | None = None
    published_at: str | None = None

    @model_validator(mode="after")
    def _one_correct(self) -> Question:
        correct = [o.label for o in self.options if o.is_correct]
        if len(correct) != 1:
            raise ValueError(f"exactly one correct option required, got {correct}")
        if correct[0] != self.answer_label:
            raise ValueError("answer_label does not match the is_correct option")
        return self

    def text_for_embedding(self) -> str:
        return self.stem + "\n" + "\n".join(o.text for o in self.options)


class Flashcard(BaseModel):
    id: str = Field(default_factory=lambda: new_id("fc"))
    exam_id: ExamId
    topic_id: str
    question_id: str | None = None
    animation_id: str | None = None
    kind: Literal["basic", "cloze", "image_occlusion"] = "basic"
    front: str
    back: str
    cloze_text: str | None = None
    extra: str | None = None
    tags: list[str] = Field(default_factory=list)
    media: list[Media] = Field(default_factory=list)
    provenance: Provenance
    status: ContentStatus = "draft"
    tier: Tier = "free"
    qa: QaReport | None = None
    created_at: str = Field(default_factory=now_iso)
    updated_at: str | None = None
    published_at: str | None = None

    def text_for_embedding(self) -> str:
        return f"{self.front}\n{self.back}"


class StoryboardScene(BaseModel):
    scene: str
    start_ms: int
    end_ms: int
    caption: str
    visual: str | None = None


class RenderTest(BaseModel):
    passed: bool
    scenes_captured: int | None = None
    errors: list[str] = Field(default_factory=list)
    tested_at: str | None = None


class Animation(BaseModel):
    id: str = Field(default_factory=lambda: new_id("anim"))
    slug: str
    title: str
    concept: str
    exam_id: ExamId
    topic_id: str
    question_ids: list[str] = Field(default_factory=list)
    storyboard: list[StoryboardScene]
    component_source: str
    duration_ms: int
    loop: bool = True
    static_fallback_svg: str | None = None
    preview_url: str | None = None
    export_urls: dict[str, str] = Field(default_factory=dict)
    render_test: RenderTest | None = None
    provenance: Provenance
    status: ContentStatus = "draft"
    tier: Tier = "free"
    created_at: str = Field(default_factory=now_iso)
    updated_at: str | None = None
    published_at: str | None = None


class OetComprehensionItem(BaseModel):
    type: Literal["mcq", "gap_fill", "short_answer", "matching"] = "mcq"
    prompt: str
    options: list[str] | None = None
    answer: str
    accepted_answers: list[str] | None = None
    explanation: str | None = None


class OetComprehensionPayload(BaseModel):
    kind: Literal["comprehension"] = "comprehension"
    passage: str
    audio_url: str | None = None
    items: list[OetComprehensionItem]


class OetWritingPayload(BaseModel):
    kind: Literal["referral_letter"] = "referral_letter"
    case_notes: str
    task_instruction: str
    recipient: str
    word_limit: int = 200
    model_answer: str | None = None
    key_content_points: list[str] = Field(default_factory=list)


class OetSpeakingPayload(BaseModel):
    kind: Literal["role_play"] = "role_play"
    setting: str
    candidate_card: str
    interlocutor_card: str
    model_dialogue: str | None = None
    assessment_focus: list[str] = Field(default_factory=list)


class OetTask(BaseModel):
    id: str = Field(default_factory=lambda: new_id("oet"))
    subtest: Literal["reading", "listening", "writing", "speaking"]
    part: str | None = None
    title: str
    payload: OetComprehensionPayload | OetWritingPayload | OetSpeakingPayload
    provenance: Provenance
    status: ContentStatus = "draft"
    tier: Tier = "free"
    created_at: str = Field(default_factory=now_iso)
    updated_at: str | None = None
    published_at: str | None = None


class Topic(BaseModel):
    id: str
    name: str
    description: str | None = None
    weight_min_pct: float | None = None
    weight_max_pct: float | None = None
    aliases: list[str] = Field(default_factory=list)
    children: list[Topic] = Field(default_factory=list)


class ExamFact(BaseModel):
    key: str
    value: str
    source_url: str
    verified_at: str


class ExamTaxonomy(BaseModel):
    exam_id: ExamId
    name: str
    description: str | None = None
    official_url: str | None = None
    verified_at: str | None = None
    facts: list[ExamFact] = Field(default_factory=list)
    topics: list[Topic]

    def flat(self) -> list[tuple[Topic, str | None]]:
        out: list[tuple[Topic, str | None]] = []

        def walk(ts: list[Topic], parent: str | None) -> None:
            for t in ts:
                out.append((t, parent))
                walk(t.children, t.id)

        walk(self.topics, None)
        return out

    def leaf_ids(self) -> list[str]:
        return [t.id for t, _ in self.flat() if not t.children]
