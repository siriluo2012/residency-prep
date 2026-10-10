from __future__ import annotations

import json
from pathlib import Path

import pytest

from rp_pipeline.animate.lint import lint_component
from rp_pipeline.crawl.extract import extract, outline_from_headings
from rp_pipeline.ingest.cohort import convert as cohort_convert
from rp_pipeline.models import Option, Provenance, Question
from rp_pipeline.qa.dedupe import RefIndex, build_index, score_items
from rp_pipeline.qa.embed import Embedder
from rp_pipeline.qa.lint import lint_flashcard, lint_question
from rp_pipeline.qa.validate import schema_errors
from rp_pipeline.taxonomy import all_topic_ids, classify_by_alias, load_taxonomy, top_level_of


def make_question(**over) -> Question:
    base = dict(
        exam_id="usmle-step1",
        topic_id="cardiovascular-physiology",
        stem="A 24-year-old man undergoes cardiac catheterization. During which phase is ventricular volume constant while pressure rises steeply?",
        options=[
            Option(
                label="A",
                text="Isovolumetric contraction",
                is_correct=True,
                explanation="All valves closed, pressure rises.",
            ),
            Option(
                label="B",
                text="Rapid ejection",
                is_correct=False,
                explanation="Aortic valve open; volume falls.",
            ),
            Option(
                label="C",
                text="Isovolumetric relaxation",
                is_correct=False,
                explanation="Pressure falls at constant volume.",
            ),
            Option(label="D", text="Rapid filling", is_correct=False, explanation="Mitral open; volume rises."),
            Option(label="E", text="Atrial systole", is_correct=False, explanation="Small late volume increase."),
        ],
        answer_label="A",
        explanation="Two isovolumetric phases exist; contraction follows mitral closure and precedes aortic opening, so pressure rises at fixed volume.",
        difficulty="easy",
        provenance=Provenance(source="claude", license="original", ai_drafted=True),
    )
    base.update(over)
    return Question(**base)


# ---------------- models ----------------


def test_question_requires_exactly_one_correct():
    with pytest.raises(ValueError):
        make_question(options=[o.model_copy(update={"is_correct": True}) for o in make_question().options])


def test_question_answer_label_must_match():
    with pytest.raises(ValueError):
        make_question(answer_label="B")


def test_question_round_trips_json_schema():
    q = make_question()
    assert schema_errors("questions", q.model_dump(exclude_none=True)) == []


def test_schema_rejects_bad_license():
    d = make_question().model_dump(exclude_none=True)
    d["provenance"]["license"] = "unknown"
    assert schema_errors("questions", d)


# ---------------- taxonomy ----------------


def test_taxonomies_load_and_have_official_weights():
    s1 = load_taxonomy("usmle-step1")
    weights = {t.id: (t.weight_min_pct, t.weight_max_pct) for t in s1.topics}
    assert weights["cardiovascular"] == (7, 11)
    assert weights["reproductive-endocrine"] == (12, 16)
    s2 = load_taxonomy("usmle-step2ck")
    w2 = {t.id: (t.weight_min_pct, t.weight_max_pct) for t in s2.topics}
    assert w2["renal-reproductive"] == (7, 13)
    assert w2["social-sciences"] == (10, 15)


def test_top_level_and_alias_classifier():
    assert top_level_of("usmle-step1", "renal") == "respiratory-renal"
    assert classify_by_alias("usmle-step1", "A patient has a nephron defect with acid-base disturbance") == "renal"
    assert "renal" in all_topic_ids("usmle-step1")


# ---------------- lint ----------------


def test_lint_flags_negative_leadin_and_commercial_names():
    q = make_question(stem="Which of the following is NOT a feature of this UWorld-style case?").model_dump()
    flags = lint_question(q)
    assert "banned_phrase:negative_leadin_not" in flags
    assert "banned_phrase:commercial_name" in flags


def test_lint_does_not_flag_lowercase_not():
    q = make_question(
        stem="If aerobic respiration does not occur in this 30-year-old, why must NADH be reoxidized to NAD+ for glycolysis to proceed?"
    ).model_dump()
    assert not any(f.startswith("banned_phrase") for f in lint_question(q))


def test_lint_invalid_topic_and_guideline_year():
    q = make_question(
        topic_id="nope",
        explanation="Guidelines recommend first-line therapy with X for this indication in adults.",
    ).model_dump()
    flags = lint_question(q)
    assert "invalid_topic" in flags
    assert "guideline_without_year" in flags


def test_lint_flashcard_cloze():
    c = {
        "exam_id": "usmle-step1",
        "topic_id": "renal",
        "front": "Cloze card",
        "back": "x",
        "kind": "cloze",
        "cloze_text": "no markers",
    }
    assert "cloze_missing_markers" in lint_flashcard(c)


# ---------------- dedupe ----------------


def test_dedupe_detects_near_duplicate_with_hash_backend():
    emb = Embedder(backend="hash")
    ref_rows = [make_question(id="ref-1", provenance=Provenance(source="medqa", license="MIT")).model_dump()]
    index = build_index(ref_rows, emb)
    dup = make_question(id="gen-1").model_dump()
    novel = make_question(
        id="gen-2",
        stem="A 60-year-old woman presents with a 3-day history of fever and dysuria. Urinalysis shows nitrites and leukocyte esterase. Which organism is most likely?",
        options=[
            Option(label="A", text="Escherichia coli", is_correct=True, explanation="Most common uropathogen."),
            Option(label="B", text="Staphylococcus aureus", is_correct=False, explanation="Uncommon in UTI."),
            Option(
                label="C",
                text="Candida albicans",
                is_correct=False,
                explanation="Usually catheter-associated.",
            ),
            Option(label="D", text="Pseudomonas aeruginosa", is_correct=False, explanation="Nosocomial setting."),
            Option(label="E", text="Enterococcus faecalis", is_correct=False, explanation="Less common."),
        ],
    ).model_dump()
    scores = score_items([dup, novel], index, emb, mutual=False)
    assert scores["gen-1"][0] > 0.99
    assert scores["gen-2"][0] < 0.5


def test_refindex_empty():
    import numpy as np

    assert RefIndex([], np.zeros((0, 1))).nearest(np.zeros(1)) == (0.0, "")


# ---------------- crawl ----------------


def test_extract_weight_table_without_percent_sign():
    html = """<html><body><table>
    <tr><th>System**</th><th>Range, %*</th></tr>
    <tr><td>Cardiovascular System</td><td>7-11</td></tr>
    <tr><td>Gastrointestinal System</td><td>6–10</td></tr>
    </table><h2>Overview</h2><h3>Fees</h3></body></html>"""
    ex = extract("https://example.org/x", html)
    assert {(r["label"], r["min"], r["max"]) for r in ex.weight_rows} == {
        ("Cardiovascular System", 7, 11),
        ("Gastrointestinal System", 6, 10),
    }
    assert ex.outline[0]["text"] == "Overview" and ex.outline[0]["children"][0]["text"] == "Fees"


def test_outline_nesting():
    tree = outline_from_headings([(1, "A"), (2, "B"), (3, "C"), (2, "D")])
    assert [n["text"] for n in tree[0]["children"]] == ["B", "D"]


# ---------------- cohort ingest ----------------


def test_cohort_convert_fail_closed(tmp_path: Path):
    raw = {
        "id": "bank:usmle-step1:x-y:v1",
        "stem": "What is the product of pyruvate dehydrogenase?",
        "questionType": "mechanism",
        "difficulty": "easy",
        "context": "Learning objective: identify acetyl-CoA as the entry unit into the citric acid cycle after PDH.",
        "options": [
            {"label": "A", "text": "Acetyl CoA", "isCorrect": True, "explanation": "Correct product."},
            {"label": "B", "text": "Oxaloacetate", "isCorrect": False, "explanation": "Cycle partner."},
            {"label": "C", "text": "Citrate", "isCorrect": False, "explanation": "Downstream."},
            {"label": "D", "text": "Lactate", "isCorrect": False, "explanation": "Anaerobic product."},
            {"label": "E", "text": "PEP", "isCorrect": False, "explanation": "Upstream."},
        ],
        "publicUsmle": {"itemText": {"licence": "CC-BY-4.0"}, "origin": "generated"},
    }
    q = cohort_convert(raw, "biochem", {}, {}, tmp_path)
    assert q is not None and q.provenance.license == "CC-BY-4.0" and q.topic_id == "biochemistry"
    raw["publicUsmle"]["itemText"]["licence"] = "unknown"
    assert cohort_convert(raw, "biochem", {}, {}, tmp_path) is None


# ---------------- animation lint ----------------


GOOD_COMPONENT = """import React from 'react';
import { motion } from 'framer-motion';
export const meta = { slug: 'x', title: 'X', durationMs: 4000, sceneStartsMs: [0, 2000], captions: ['a', 'b'], viewBox: { width: 640, height: 360 } };
export default function X({ playing = true, reducedMotion = false }) {
  return <svg viewBox="0 0 640 360" width="100%"><motion.circle r="10" animate={{ cx: playing && !reducedMotion ? 100 : 0 }} /></svg>;
}
"""


def test_animation_lint_good_and_bad():
    item = {
        "storyboard": [{"start_ms": 0, "end_ms": 2000}, {"start_ms": 2000, "end_ms": 4000}],
        "duration_ms": 4000,
    }
    assert lint_component(GOOD_COMPONENT, item) == []
    bad = GOOD_COMPONENT.replace(
        "import { motion } from 'framer-motion';",
        "import axios from 'axios';\nfetch('https://evil.example');",
    )
    flags = lint_component(bad, item)
    assert "disallowed_import:axios" in flags and "uses_fetch" in flags and "external_url" in flags


def test_oet_reference_schema():
    from rp_pipeline.oet.reference import _tasks
    from rp_pipeline.qa.lint import lint_oet

    for t in _tasks():
        d = t.model_dump(exclude_none=True)
        assert schema_errors("oet", d) == [], t.id
        assert lint_oet(d) == [], t.id


def test_reference_animations_lint():
    root = Path(__file__).resolve().parents[2]
    for f in (root / "content/animations/reference").glob("*.tsx"):
        src = f.read_text()
        flags = lint_component(src)
        assert not flags, f"{f.name}: {flags}"


def test_staged_examples_validate():
    root = Path(__file__).resolve().parents[2]
    for f in (root / "packages/schema/examples").glob("*.json"):
        d = json.loads(f.read_text())
        kind = {
            "question.json": "questions",
            "flashcard.json": "flashcards",
            "animation.json": "animations",
            "oet.json": "oet",
        }[d.pop("$schema_name")]
        assert schema_errors(kind, d) == [], f.name
