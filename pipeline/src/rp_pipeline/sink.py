"""Where pipeline output goes.

- FileSink: append JSONL to content/staged/<kind>.jsonl (default; git-diffable, no credentials)
- DbSink:   upsert into Postgres and enqueue for review (same semantics as apps/web/scripts/load-staged.ts)
"""

from __future__ import annotations

import json
from collections.abc import Iterable
from pathlib import Path
from typing import Protocol

from pydantic import BaseModel

from .config import STAGED_DIR, get_settings
from .models import Animation, Flashcard, OetTask, Question

Kind = str  # "questions" | "flashcards" | "animations" | "oet"


class Sink(Protocol):
    def write(self, kind: Kind, items: Iterable[BaseModel]) -> int: ...
    def read(self, kind: Kind) -> list[dict]: ...


class FileSink:
    def __init__(self, directory: Path = STAGED_DIR) -> None:
        self.dir = directory
        self.dir.mkdir(parents=True, exist_ok=True)

    def path(self, kind: Kind) -> Path:
        return self.dir / f"{kind}.jsonl"

    def write(self, kind: Kind, items: Iterable[BaseModel]) -> int:
        n = 0
        with self.path(kind).open("a", encoding="utf-8") as f:
            for it in items:
                f.write(it.model_dump_json(exclude_none=True) + "\n")
                n += 1
        return n

    def read(self, kind: Kind) -> list[dict]:
        p = self.path(kind)
        if not p.exists():
            return []
        return [json.loads(line) for line in p.read_text(encoding="utf-8").splitlines() if line.strip()]

    def rewrite(self, kind: Kind, items: Iterable[BaseModel]) -> int:
        tmp = self.path(kind).with_suffix(".jsonl.tmp")
        n = 0
        with tmp.open("w", encoding="utf-8") as f:
            for it in items:
                f.write(it.model_dump_json(exclude_none=True) + "\n")
                n += 1
        tmp.replace(self.path(kind))
        return n


_MODEL_FOR_KIND: dict[str, type[BaseModel]] = {
    "questions": Question,
    "flashcards": Flashcard,
    "animations": Animation,
    "oet": OetTask,
}


def parse_items(kind: Kind, rows: list[dict]) -> list[BaseModel]:
    model = _MODEL_FOR_KIND[kind]
    return [model.model_validate(r) for r in rows]


class DbSink:
    """Minimal psycopg writer. Mirrors apps/web/scripts/load-staged.ts."""

    def __init__(self, dsn: str | None = None) -> None:
        import psycopg

        self.dsn = dsn or get_settings().database_url
        if not self.dsn:
            raise RuntimeError("DATABASE_URL not set; use RP_SINK=file or set DATABASE_URL")
        self.conn = psycopg.connect(self.dsn, autocommit=True)

    def read(self, kind: Kind) -> list[dict]:
        raise NotImplementedError("DbSink is write-only; use FileSink to read staged items")

    def write(self, kind: Kind, items: Iterable[BaseModel]) -> int:
        n = 0
        with self.conn.cursor() as cur:
            for it in items:
                d = it.model_dump(mode="json", exclude_none=True)
                prov = d.pop("provenance")
                status = "approved" if d.get("status") == "published" else d.get("status", "draft")
                if kind == "questions":
                    cur.execute(
                        """
                        insert into questions (id, exam_id, topic_id, topic_ids, question_type, stem, options,
                          answer_label, explanation, teaching_point, lab_values_used, media, animation_id,
                          animation_worthiness, difficulty, evidence, qa, source, source_ref, license, attribution,
                          generator_model, generation_batch, ai_drafted, status, tier)
                        values (%(id)s, %(exam_id)s, %(topic_id)s, %(topic_ids)s, %(question_type)s, %(stem)s,
                          %(options)s, %(answer_label)s, %(explanation)s, %(teaching_point)s, %(lab_values_used)s,
                          %(media)s, %(animation_id)s, %(animation_worthiness)s, %(difficulty)s, %(evidence)s,
                          %(qa)s, %(source)s, %(source_ref)s, %(license)s, %(attribution)s, %(generator_model)s,
                          %(generation_batch)s, %(ai_drafted)s, %(status)s, %(tier)s)
                        on conflict (id) do update set qa = excluded.qa, updated_at = now()
                        """,
                        self._params(d, prov, status, json_fields={"topic_ids", "options", "media", "evidence", "qa"}),
                    )
                    self._enqueue(cur, "question", d["id"], (d.get("qa") or {}).get("flags", []))
                elif kind == "flashcards":
                    cur.execute(
                        """
                        insert into flashcards (id, exam_id, topic_id, question_id, animation_id, kind, front, back,
                          cloze_text, extra, tags, media, qa, source, source_ref, license, attribution,
                          generator_model, generation_batch, ai_drafted, status, tier)
                        values (%(id)s, %(exam_id)s, %(topic_id)s, %(question_id)s, %(animation_id)s, %(kind)s,
                          %(front)s, %(back)s, %(cloze_text)s, %(extra)s, %(tags)s, %(media)s, %(qa)s, %(source)s,
                          %(source_ref)s, %(license)s, %(attribution)s, %(generator_model)s, %(generation_batch)s,
                          %(ai_drafted)s, %(status)s, %(tier)s)
                        on conflict (id) do nothing
                        """,
                        self._params(d, prov, status, json_fields={"tags", "media", "qa"}),
                    )
                    self._enqueue(cur, "flashcard", d["id"], (d.get("qa") or {}).get("flags", []))
                elif kind == "animations":
                    cur.execute(
                        """
                        insert into animations (id, slug, title, concept, exam_id, topic_id, question_ids, storyboard,
                          component_source, duration_ms, loop, static_fallback_svg, preview_url, export_urls,
                          render_test, source, source_ref, license, attribution, generator_model, generation_batch,
                          ai_drafted, status, tier)
                        values (%(id)s, %(slug)s, %(title)s, %(concept)s, %(exam_id)s, %(topic_id)s, %(question_ids)s,
                          %(storyboard)s, %(component_source)s, %(duration_ms)s, %(loop)s, %(static_fallback_svg)s,
                          %(preview_url)s, %(export_urls)s, %(render_test)s, %(source)s, %(source_ref)s, %(license)s,
                          %(attribution)s, %(generator_model)s, %(generation_batch)s, %(ai_drafted)s, %(status)s,
                          %(tier)s)
                        on conflict (id) do update set component_source = excluded.component_source,
                          storyboard = excluded.storyboard, render_test = excluded.render_test, updated_at = now()
                        """,
                        self._params(
                            d,
                            prov,
                            status,
                            json_fields={"question_ids", "storyboard", "export_urls", "render_test"},
                        ),
                    )
                    rt = d.get("render_test") or {}
                    self._enqueue(cur, "animation", d["id"], [] if rt.get("passed", True) else ["render_test_failed"])
                elif kind == "oet":
                    cur.execute(
                        """
                        insert into oet_tasks (id, subtest, part, title, payload, source, source_ref, license,
                          attribution, generator_model, generation_batch, ai_drafted, status, tier)
                        values (%(id)s, %(subtest)s, %(part)s, %(title)s, %(payload)s, %(source)s, %(source_ref)s,
                          %(license)s, %(attribution)s, %(generator_model)s, %(generation_batch)s, %(ai_drafted)s,
                          %(status)s, %(tier)s)
                        on conflict (id) do nothing
                        """,
                        self._params(d, prov, status, json_fields={"payload"}),
                    )
                    self._enqueue(cur, "oet_task", d["id"], [])
                n += 1
        return n

    @staticmethod
    def _params(d: dict, prov: dict, status: str, json_fields: set[str]) -> dict:
        from psycopg.types.json import Jsonb

        out = {k: (Jsonb(v) if k in json_fields and v is not None else v) for k, v in d.items()}
        for k in json_fields:
            out.setdefault(k, None)
            if out[k] is None and k in {
                "topic_ids",
                "media",
                "evidence",
                "tags",
                "question_ids",
                "export_urls",
            }:
                out[k] = Jsonb([] if k != "export_urls" else {})
        out.update(
            source=prov["source"],
            source_ref=prov.get("source_ref"),
            license=prov["license"],
            attribution=prov.get("attribution"),
            generator_model=prov.get("generator_model"),
            generation_batch=prov.get("generation_batch"),
            ai_drafted=prov.get("ai_drafted", False),
            status=status,
        )
        for k in (
            "question_type",
            "teaching_point",
            "animation_id",
            "question_id",
            "cloze_text",
            "extra",
            "static_fallback_svg",
            "preview_url",
            "part",
        ):
            out.setdefault(k, None)
        out.setdefault("tier", "free")
        out.setdefault("lab_values_used", False)
        out.setdefault("animation_worthiness", 0)
        out.setdefault("kind", "basic")
        out.setdefault("loop", True)
        return out

    @staticmethod
    def _enqueue(cur, item_type: str, item_id: str, flags: list[str]) -> None:
        from psycopg.types.json import Jsonb

        cur.execute(
            """
            insert into review_queue (item_type, item_id, auto_flags, priority)
            values (%s, %s, %s, %s) on conflict (item_type, item_id) do nothing
            """,
            (item_type, item_id, Jsonb(flags), 5 if flags else 0),
        )


def get_sink() -> FileSink | DbSink:
    s = get_settings()
    return DbSink() if s.rp_sink == "db" else FileSink()
