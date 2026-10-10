"""Near-duplicate / originality detection.

Reference corpus = all non-Claude staged questions (MedQA, Cohort) + crawled reference headings.
For every Claude-generated item we compute max cosine similarity to the reference corpus and to the
other generated items; above `dedupe_reject` -> rejected (not_original), between `dedupe_flag` and
`dedupe_reject` -> flagged needs_originality_check for the reviewer.
"""

from __future__ import annotations

import json
from dataclasses import dataclass

import numpy as np

from ..config import CONTENT_DIR, get_settings
from .embed import Embedder


@dataclass
class RefIndex:
    ids: list[str]
    vecs: np.ndarray  # (n, d), L2-normalized

    def nearest(self, q: np.ndarray, exclude: set[str] | None = None) -> tuple[float, str]:
        if self.vecs.shape[0] == 0:
            return 0.0, ""
        sims = self.vecs @ q
        if exclude:
            for i, rid in enumerate(self.ids):
                if rid in exclude:
                    sims[i] = -1
        j = int(np.argmax(sims))
        return float(sims[j]), self.ids[j]


def build_index(rows: list[dict], embedder: Embedder, cache_name: str | None = None) -> RefIndex:
    s = get_settings()
    cache = s.cache_dir / f"index_{cache_name}.npz" if cache_name else None
    ids = [r["id"] for r in rows]
    if cache and cache.exists():
        z = np.load(cache, allow_pickle=True)
        if list(z["ids"]) == ids:
            return RefIndex(ids, z["vecs"])
    texts = [_text(r) for r in rows]
    vecs = embedder(texts) if texts else np.zeros((0, 1), dtype=np.float32)
    if cache:
        np.savez(cache, ids=np.asarray(ids, dtype=object), vecs=vecs)
    return RefIndex(ids, vecs)


def _text(r: dict) -> str:
    if "stem" in r:
        return r["stem"] + "\n" + "\n".join(o["text"] for o in r.get("options", []))
    if "front" in r:
        return f"{r['front']}\n{r['back']}"
    return json.dumps(r)[:2000]


def crawled_reference_rows() -> list[dict]:
    """Headings from third-party crawl (structure only) so we also catch items that mirror their outline verbatim."""
    out: list[dict] = []
    p = CONTENT_DIR / "crawl" / "openexamprep.json"
    if p.exists():
        for page in json.loads(p.read_text()).get("pages", []):
            for i, h in enumerate(page.get("headings", [])):
                out.append({"id": f"crawl:{page['url']}#{i}", "stem": h, "options": []})
    return out


def score_items(
    items: list[dict], reference: RefIndex, embedder: Embedder, mutual: bool = True
) -> dict[str, tuple[float, str]]:
    """Return id -> (max_similarity, nearest_ref_id). If mutual, generated items are also compared to each other."""
    if not items:
        return {}
    vecs = embedder([_text(r) for r in items])
    result: dict[str, tuple[float, str]] = {}
    for i, r in enumerate(items):
        best, ref = reference.nearest(vecs[i])
        if mutual and len(items) > 1:
            sims = vecs @ vecs[i]
            sims[i] = -1
            j = int(np.argmax(sims))
            if sims[j] > best:
                best, ref = float(sims[j]), items[j]["id"]
        result[r["id"]] = (round(best, 4), ref)
    return result
