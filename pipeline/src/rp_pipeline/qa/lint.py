"""Content lint: item-writing rules, readability, clinical-safety phrasing, taxonomy validity."""

from __future__ import annotations

import re

from ..taxonomy import all_topic_ids

BANNED_PHRASES: list[tuple[re.Pattern[str], str]] = [
    (re.compile(r"\ball of the above\b", re.I), "all_of_the_above"),
    (re.compile(r"\bnone of the above\b", re.I), "none_of_the_above"),
    (re.compile(r"\bEXCEPT\b"), "negative_leadin_except"),  # uppercase only, as item writers use it
    (re.compile(r"\bNOT\b(?=[^.]*\?)"), "negative_leadin_not"),
    (
        re.compile(r"\b(uworld|amboss|nbme|first aid|kaplan|sketchy|pathoma|anking|usmle-rx)\b", re.I),
        "commercial_name",
    ),
]
ADVICE_PHRASES = [r"\byou should take\b", r"\bconsult your doctor\b", r"\bask your physician\b"]
GUIDELINE_WORDS = re.compile(r"\b(guideline|recommend(s|ed)?|first[- ]line|threshold|target)\b", re.I)
YEAR = re.compile(r"\b(19|20)\d{2}\b")


def readability_grade(text: str) -> float | None:
    try:
        import textstat

        return float(textstat.flesch_kincaid_grade(text))
    except Exception:  # noqa: BLE001
        return None


def lint_question(q: dict) -> list[str]:
    flags: list[str] = []
    stem: str = q["stem"]
    opts = q["options"]
    low = stem.lower()
    for pat, name in BANNED_PHRASES:
        if pat.search(stem) or any(pat.search(o["text"]) for o in opts):
            flags.append(f"banned_phrase:{name}")
    for pat in ADVICE_PHRASES:
        if re.search(pat, q.get("explanation", ""), re.I):
            flags.append("patient_advice_phrasing")
    if len(stem) < 120 and q.get("provenance", {}).get("source") == "claude":
        flags.append("stem_too_short")
    if len(stem) > 1800:
        flags.append("stem_too_long")
    if not stem.rstrip().endswith("?"):
        flags.append("no_leadin_question")
    texts = [o["text"].strip().lower() for o in opts]
    if len(set(texts)) != len(texts):
        flags.append("duplicate_options")
    lengths = [len(o["text"]) for o in opts]
    correct = next((o for o in opts if o["is_correct"]), None)
    if correct and len(opts) >= 4 and len(correct["text"]) > 1.6 * (sum(lengths) / len(lengths)):
        flags.append("longest_option_is_correct")
    if q.get("topic_id") not in all_topic_ids(q["exam_id"]):
        flags.append("invalid_topic")
    expl = q.get("explanation", "")
    if GUIDELINE_WORDS.search(expl) and not YEAR.search(expl):
        flags.append("guideline_without_year")
    if expl.startswith("Explanation pending"):
        flags.append("needs_explanation")
    if "pending" in low:
        flags.append("placeholder_text")
    return flags


def lint_flashcard(c: dict) -> list[str]:
    flags: list[str] = []
    if len(c["back"].split()) > 40:
        flags.append("back_too_long")
    if len(c["front"]) < 8:
        flags.append("front_too_short")
    if c.get("kind") == "cloze" and not re.search(r"\{\{c\d+::", c.get("cloze_text") or ""):
        flags.append("cloze_missing_markers")
    if c.get("topic_id") not in all_topic_ids(c["exam_id"]):
        flags.append("invalid_topic")
    return flags


def lint_oet(t: dict) -> list[str]:
    flags: list[str] = []
    p = t["payload"]
    if p.get("kind") == "referral_letter":
        if len(p["case_notes"]) < 200:
            flags.append("case_notes_too_short")
        if not p.get("key_content_points"):
            flags.append("missing_key_points")
    if p.get("kind") == "comprehension" and len(p.get("items", [])) < 3:
        flags.append("too_few_items")
    return flags
