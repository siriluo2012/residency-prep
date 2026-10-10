"""JSON Schema validation against packages/schema/schemas (the source of truth)."""

from __future__ import annotations

import json
from functools import lru_cache

from jsonschema import Draft202012Validator
from referencing import Registry, Resource

from ..config import SCHEMA_DIR

KIND_SCHEMA = {
    "questions": "question.json",
    "flashcards": "flashcard.json",
    "animations": "animation.json",
    "oet": "oet.json",
}


@lru_cache
def _registry() -> Registry:
    reg = Registry()
    for p in SCHEMA_DIR.glob("*.json"):
        doc = json.loads(p.read_text())
        res = Resource.from_contents(doc)
        reg = reg.with_resource(doc["$id"], res).with_resource(p.name, res)
    return reg


@lru_cache
def validator(kind: str) -> Draft202012Validator:
    doc = json.loads((SCHEMA_DIR / KIND_SCHEMA[kind]).read_text())
    return Draft202012Validator(doc, registry=_registry())


def schema_errors(kind: str, item: dict) -> list[str]:
    v = validator(kind)
    return [f"{'/'.join(str(x) for x in e.absolute_path) or '$'}: {e.message}" for e in v.iter_errors(item)]
