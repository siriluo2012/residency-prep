from __future__ import annotations

from functools import lru_cache
from pathlib import Path
from typing import Literal

from pydantic_settings import BaseSettings, SettingsConfigDict

PIPELINE_ROOT = Path(__file__).resolve().parents[2]
REPO_ROOT = PIPELINE_ROOT.parent
CONTENT_DIR = REPO_ROOT / "content"
STAGED_DIR = CONTENT_DIR / "staged"
TAXONOMY_DIR = CONTENT_DIR / "taxonomy"
SCHEMA_DIR = REPO_ROOT / "packages" / "schema" / "schemas"


class Settings(BaseSettings):
    model_config = SettingsConfigDict(
        env_file=(REPO_ROOT / ".env", PIPELINE_ROOT / ".env"),
        env_file_encoding="utf-8",
        extra="ignore",
    )

    anthropic_api_key: str | None = None
    rp_claude_model: str = "claude-sonnet-4-5"
    rp_claude_fast_model: str = "claude-haiku-4-5"
    rp_sink: Literal["file", "db"] = "file"
    rp_data_dir: Path = PIPELINE_ROOT / "data"
    rp_embed_backend: Literal["local", "voyage", "hash"] = "local"
    voyage_api_key: str | None = None
    database_url: str | None = None

    # Dedupe thresholds (cosine similarity)
    dedupe_reject: float = 0.92
    dedupe_flag: float = 0.85

    # Crawler
    crawler_user_agent: str = "ResidencyPrepBot/0.1 (+https://github.com/residency-prep; structure-only crawler)"
    crawler_min_interval_s: float = 1.0
    crawler_cache_ttl_h: int = 24

    @property
    def raw_dir(self) -> Path:
        return self.rp_data_dir / "raw"

    @property
    def cache_dir(self) -> Path:
        return self.rp_data_dir / "cache"


@lru_cache
def get_settings() -> Settings:
    s = Settings()
    s.raw_dir.mkdir(parents=True, exist_ok=True)
    s.cache_dir.mkdir(parents=True, exist_ok=True)
    STAGED_DIR.mkdir(parents=True, exist_ok=True)
    return s
