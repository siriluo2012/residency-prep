from __future__ import annotations

import json
import re
from functools import lru_cache

from .config import TAXONOMY_DIR
from .models import ExamId, ExamTaxonomy, Topic


@lru_cache
def load_taxonomy(exam_id: ExamId) -> ExamTaxonomy:
    path = TAXONOMY_DIR / f"{exam_id}.json"
    return ExamTaxonomy.model_validate(json.loads(path.read_text()))


def all_topic_ids(exam_id: ExamId) -> set[str]:
    return {t.id for t, _ in load_taxonomy(exam_id).flat()}


def parent_of(exam_id: ExamId, topic_id: str) -> str | None:
    for t, parent in load_taxonomy(exam_id).flat():
        if t.id == topic_id:
            return parent
    return None


def top_level_of(exam_id: ExamId, topic_id: str) -> str:
    cur = topic_id
    while (p := parent_of(exam_id, cur)) is not None:
        cur = p
    return cur


_word = re.compile(r"[a-z0-9/]+")


def _tokens(text: str) -> set[str]:
    return set(_word.findall(text.lower()))


def classify_by_alias(exam_id: ExamId, text: str) -> str | None:
    """Cheap heuristic classifier: pick the topic whose name/aliases overlap most with the text.

    Used as a fallback (and as a prior) before the Claude classifier in generate/classify.py.
    Prefers leaf topics over parents on ties.
    """
    toks = _tokens(text)
    best: tuple[int, int, str] | None = None
    for t, _ in load_taxonomy(exam_id).flat():
        keys: set[str] = set()
        for a in [t.name, *t.aliases]:
            keys |= _tokens(a)
        score = len(toks & keys)
        depth = 0 if t.children else 1
        if score and (best is None or (score, depth) > (best[0], best[1])):
            best = (score, depth, t.id)
    return best[2] if best else None


def topic_label(exam_id: ExamId, topic_id: str) -> str:
    for t, _ in load_taxonomy(exam_id).flat():
        if t.id == topic_id:
            return t.name
    return topic_id


def leaf_topics(exam_id: ExamId) -> list[Topic]:
    return [t for t, _ in load_taxonomy(exam_id).flat() if not t.children]
