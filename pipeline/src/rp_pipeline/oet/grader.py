"""OET writing grader (shared logic; the web app has a TypeScript twin in apps/web/src/lib/oet-grader.ts)."""

from __future__ import annotations

import json
from pathlib import Path

from pydantic import BaseModel, Field
from rich.console import Console

from ..claude import structured
from ..sink import FileSink
from .prompts import GRADER_SYSTEM, GRADER_USER

console = Console()

CRITERIA = [
    "purpose",
    "content",
    "conciseness_and_clarity",
    "genre_and_style",
    "organisation_and_layout",
    "language",
]


class CriterionScore(BaseModel):
    criterion: str
    band: int = Field(ge=0, le=7)
    evidence: list[str] = Field(max_length=3)
    comment: str


class GradeOut(BaseModel):
    criteria: list[CriterionScore] = Field(min_length=6, max_length=6)
    overall_score: int = Field(ge=0, le=500)
    grade_letter: str
    missed_key_points: list[str]
    suggestions: list[str] = Field(min_length=3, max_length=5)


def grade_letter(task_payload: dict, letter: str) -> GradeOut:
    user = GRADER_USER.format(
        task_instruction=task_payload["task_instruction"],
        recipient=task_payload["recipient"],
        case_notes=task_payload["case_notes"],
        key_points="\n".join(f"- {k}" for k in task_payload.get("key_content_points", [])),
        word_count=len(letter.split()),
        letter=letter,
    )
    out, _usage = structured(system=GRADER_SYSTEM, user=user, output=GradeOut, max_tokens=3000, temperature=0.2)
    return out


def grade_letter_cli(task_id: str, letter_file: Path) -> None:
    rows = FileSink().read("oet")
    task = next((r for r in rows if r["id"] == task_id), None)
    if not task:
        raise SystemExit(f"task {task_id} not staged")
    out = grade_letter(task["payload"], letter_file.read_text())
    console.print_json(json.dumps(out.model_dump()))
