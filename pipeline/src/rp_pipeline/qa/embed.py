"""Embeddings for originality checks.

Backends:
  local  - sentence-transformers (all-MiniLM-L6-v2 by default); good enough for near-duplicate detection
  voyage - Voyage AI API (voyage-3-lite), if VOYAGE_API_KEY is set
  hash   - deterministic hashed bag-of-words; no dependencies, used in tests and as a fallback
"""

from __future__ import annotations

import hashlib
import re

import numpy as np

from ..config import get_settings

_tok = re.compile(r"[a-z0-9]+")


def _hash_embed(texts: list[str], dim: int = 512) -> np.ndarray:
    out = np.zeros((len(texts), dim), dtype=np.float32)
    for i, t in enumerate(texts):
        toks = _tok.findall(t.lower())
        for a, b in zip(toks, toks[1:] + [""], strict=False):  # unigrams + bigrams
            for g in (a, a + " " + b if b else None):
                if g is None:
                    continue
                h = int(hashlib.blake2b(g.encode(), digest_size=8).hexdigest(), 16)
                out[i, h % dim] += 1.0 if (h >> 63) == 0 else -1.0
    norms = np.linalg.norm(out, axis=1, keepdims=True)
    norms[norms == 0] = 1
    return out / norms


class Embedder:
    def __init__(self, backend: str | None = None) -> None:
        self.backend = backend or get_settings().rp_embed_backend
        self._model = None
        if self.backend == "local":
            try:
                from sentence_transformers import SentenceTransformer

                self._model = SentenceTransformer("sentence-transformers/all-MiniLM-L6-v2")
            except Exception:  # noqa: BLE001 - optional dependency
                self.backend = "hash"

    def __call__(self, texts: list[str]) -> np.ndarray:
        if not texts:
            return np.zeros((0, 1), dtype=np.float32)
        if self.backend == "local" and self._model is not None:
            return np.asarray(self._model.encode(texts, normalize_embeddings=True, batch_size=64), dtype=np.float32)
        if self.backend == "voyage":
            import httpx

            s = get_settings()
            r = httpx.post(
                "https://api.voyageai.com/v1/embeddings",
                headers={"Authorization": f"Bearer {s.voyage_api_key}"},
                json={"input": texts, "model": "voyage-3-lite"},
                timeout=60,
            )
            r.raise_for_status()
            arr = np.asarray([d["embedding"] for d in r.json()["data"]], dtype=np.float32)
            return arr / np.linalg.norm(arr, axis=1, keepdims=True)
        return _hash_embed(texts)
