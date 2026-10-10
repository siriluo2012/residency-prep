"""Prompt templates for generation. Kept in one place so reviewers can audit them.

Design notes
- Originality: the model is told never to reproduce or lightly paraphrase items from commercial
  QBanks or NBME materials and to invent patient details. qa/dedupe.py enforces this statistically.
- UWorld-style explanations: the *why* for the correct answer and the *why not* for each distractor,
  plus a one-line teaching point. Guideline statements must carry a year.
- Blueprint alignment: the prompt includes the official content-outline categories for the topic
  (from content/crawl/usmle.json) so questions cover the real outline, not just the topic name.
"""

from __future__ import annotations

import json
from functools import lru_cache

from ..config import CONTENT_DIR
from ..models import ExamId
from ..taxonomy import load_taxonomy, topic_label

QUESTION_SYSTEM = """You are a senior medical educator and item writer for US licensing-style exams.
You write ORIGINAL single-best-answer clinical vignettes with rigorous, UWorld-style explanations.

Hard rules
1. Originality: never reproduce, closely paraphrase, or "remember" items from any commercial question bank
   (UWorld, AMBOSS, Kaplan, NBME, USMLE-Rx, etc.) or from recalled exams. Invent all patient details
   (age, sex, history, labs) and vary scenario framing. Do not name any commercial product.
2. One defensible correct answer. Distractors must be plausible and each must map to a specific
   misconception. Options are homogeneous (all diagnoses, or all mechanisms, or all next steps).
3. Clinical accuracy: use current, widely accepted knowledge. When you state a guideline threshold or
   recommendation, include the guideline body and year in the explanation (e.g. "ADA 2025").
4. Format: 5 options labelled A-E. Stem is a complete vignette ending in a direct lead-in question.
   No "all of the above", no negatives ("EXCEPT").
5. Explanations: per option, say why it is right or wrong. Then one overall explanation (3-6 sentences)
   that teaches the underlying mechanism, and a single-sentence teaching_point.
6. Rate animation_worthiness 0-5: 5 if the concept is inherently dynamic or spatial (cycles, cascades,
   flows, pressure/volume relationships, gradients), 0 if a static fact.
7. Do not give patient-specific medical advice; this is exam education.
8. Output only via the provided tool.
"""

QUESTION_USER = """Exam: {exam_name}
Topic: {topic_name} (id: {topic_id})
Official content-outline categories to draw from:
{outline}

Difficulty target: {difficulty}
Question type preference: {qtype}

{avoid_block}

Write {n} distinct vignettes for this topic. Vary the clinical setting, patient demographics,
and the specific sub-concept tested so the set covers different outline categories.
Set exam_id="{exam_id}", topic_id="{topic_id}", difficulty as targeted, and status="draft".
"""

AVOID_BLOCK = """Do NOT write about these sub-concepts (already covered):
{avoid}
"""

EXPLANATION_SYSTEM = """You are a senior medical educator writing UWorld-style explanations for an existing
single-best-answer question. Do not change the stem, options, or the correct answer.
For every option write why it is right or wrong (one specific misconception per wrong option). Then
write an overall explanation (3-6 sentences) teaching the mechanism, a single-sentence teaching_point,
an appropriate question_type, difficulty (easy/medium/hard), the best topic_id from the provided list,
and animation_worthiness 0-5. If the stated correct answer is clinically wrong or the question is
ambiguous, set flag_for_review=true and explain why in reviewer_note. Output only via the tool."""

EXPLANATION_USER = """Exam: {exam_id}
Allowed topic_ids: {topic_ids}

Question:
{stem}

Options:
{options}

Stated correct answer: {answer}
"""

FLASHCARD_SYSTEM = """You write concise, high-yield spaced-repetition flashcards from a reviewed exam question.
Rules: each card tests ONE fact or relationship; the front is a precise question or a cloze sentence;
the back is short (<= 25 words). Prefer "mechanism -> consequence" and "finding -> diagnosis" cards.
Do not copy the vignette; distil the testable knowledge. 2-4 cards per question. Tags: 2-5 lowercase
keywords. Output only via the tool."""

FLASHCARD_USER = """Exam: {exam_id}   Topic: {topic_name} (id {topic_id})
Question stem: {stem}
Correct answer: {answer}
Explanation: {explanation}
Teaching point: {teaching_point}
"""

CLASSIFY_SYSTEM = """You assign a medical exam question to exactly one topic id from a provided list.
Choose the most specific (leaf) id that fits. Output only via the tool."""

CLASSIFY_USER = """Exam: {exam_id}
Topic ids and names:
{topics}

Question:
{stem}
Options: {options}
"""


@lru_cache
def _outline_index() -> dict[str, list[str]]:
    """system name (normalized) -> category names, from the crawled USMLE content outline."""
    p = CONTENT_DIR / "crawl" / "usmle.json"
    if not p.exists():
        return {}
    data = json.loads(p.read_text())
    idx: dict[str, list[str]] = {}
    for s in data.get("content_outline", []):
        idx[_n(s["system"])] = [c["name"] for c in s["categories"]][:40]
    return idx


def _n(s: str) -> str:
    return " ".join(s.lower().replace("&", "and").replace("/", " ").split())


_STOP = {
    "system",
    "systems",
    "and",
    "the",
    "disorders",
    "processes",
    "general",
    "special",
    "health",
    "tissue",
    "subcutaneous",
}

# topic_id -> phrase whose words match a PDF system heading
_OUTLINE_OVERRIDES: dict[str, str] = {
    "cardiovascular-physiology": "Cardiovascular",
    "cardiovascular-pathology": "Cardiovascular",
    "cardiovascular-pharmacology": "Cardiovascular",
    "biochemistry": "Multisystem Nutrition",
    "microbiology": "Multisystem",
    "pharmacology-general": "Multisystem",
    "pathology-general": "Multisystem Shock",
    "hematology": "Blood Lymphoreticular",
    "immunology": "Immune",
    "neurology": "Nervous Senses",
    "dermatology": "Skin",
    "reproductive": "Female Male Reproductive Pregnancy",
    "renal": "Renal Urinary",
    "respiratory": "Respiratory",
    "biostatistics": "Biostatistics Epidemiology",
    "social-sciences": "Social Sciences",
    "renal-reproductive": "Renal Urinary Female Male Reproductive",
    "msk-skin": "Musculoskeletal Skin",
    "blood-immune": "Blood Lymphoreticular Immune",
    "nervous": "Nervous Senses",
}


def outline_for_topic(exam_id: ExamId, topic_id: str) -> str:
    """Return bullet list of official outline categories relevant to a topic.

    Matches on the top-level system name (e.g. "Cardiovascular System") and on the leaf name, using
    content words only, so "renal" matches "Renal & Urinary System" and not every "... System".
    """
    from ..taxonomy import top_level_of

    idx = _outline_index()
    if not idx:
        return "- (content outline not crawled yet; use standard exam blueprint for this topic)"

    def hits_for(name: str) -> list[str]:
        tokens = {t.strip(",") for t in _n(name).split() if len(t) > 3 and t.strip(",") not in _STOP}
        out: list[str] = []
        for sys_name, cats in idx.items():
            sys_tokens = {t.strip(",") for t in sys_name.split() if t not in _STOP}
            if tokens & sys_tokens:
                out += [c for c in cats if len(c) > 6 and not c.startswith(("(", "▪"))]
        return out

    # explicit overrides where our leaf names do not share words with the PDF system headings
    override = _OUTLINE_OVERRIDES.get(topic_id)
    hits: list[str] = hits_for(override) if override else []
    if not hits:
        hits = hits_for(topic_label(exam_id, topic_id))
    if not hits:
        hits = hits_for(topic_label(exam_id, top_level_of(exam_id, topic_id)))
    if not hits:
        return "- (no direct outline match; cover the standard high-yield subtopics for this area)"
    return "\n".join(f"- {h}" for h in hits[:30])


def topic_list(exam_id: ExamId) -> str:
    tax = load_taxonomy(exam_id)
    return "\n".join(f"- {t.id}: {t.name}" for t, _ in tax.flat())


def topic_ids(exam_id: ExamId) -> list[str]:
    return [t.id for t, _ in load_taxonomy(exam_id).flat()]
