"""Polite fetcher: robots.txt, per-host rate limit, on-disk cache with TTL.

Pages are cached under data/cache/<sha1>.html only so re-runs do not re-hit the host; extracted
structure is what gets committed (content/crawl/*.json). See docs/CONTENT_POLICY.md section 6.
"""

from __future__ import annotations

import hashlib
import json
import time
from datetime import UTC, datetime, timedelta
from pathlib import Path
from urllib.parse import urlparse
from urllib.robotparser import RobotFileParser

import httpx
from rich.console import Console

from ..config import get_settings

console = Console(stderr=True)


class Fetcher:
    def __init__(self, refresh: bool = False) -> None:
        self.s = get_settings()
        self.refresh = refresh
        self.client = httpx.Client(
            headers={"User-Agent": self.s.crawler_user_agent, "Accept": "text/html,application/xhtml+xml"},
            timeout=30,
            follow_redirects=True,
        )
        self._robots: dict[str, RobotFileParser] = {}
        self._last_hit: dict[str, float] = {}

    # ---- robots ----
    def _allowed(self, url: str) -> bool:
        host = urlparse(url).netloc
        rp = self._robots.get(host)
        if rp is None:
            rp = RobotFileParser()
            try:
                r = self.client.get(f"{urlparse(url).scheme}://{host}/robots.txt")
                rp.parse(r.text.splitlines() if r.status_code == 200 else [])
            except httpx.HTTPError:
                rp.parse([])
            self._robots[host] = rp
        return rp.can_fetch(self.s.crawler_user_agent, url)

    # ---- cache ----
    def _cache_path(self, url: str) -> Path:
        return self.s.cache_dir / (hashlib.sha1(url.encode()).hexdigest() + ".json")

    def get(self, url: str) -> str | None:
        p = self._cache_path(url)
        if p.exists() and not self.refresh:
            meta = json.loads(p.read_text())
            fetched = datetime.fromisoformat(meta["fetched_at"])
            if datetime.now(UTC) - fetched < timedelta(hours=self.s.crawler_cache_ttl_h):
                return meta["body"]
        if not self._allowed(url):
            console.log(f"[red]robots.txt disallows {url}")
            return None
        host = urlparse(url).netloc
        wait = self.s.crawler_min_interval_s - (time.time() - self._last_hit.get(host, 0))
        if wait > 0:
            time.sleep(wait)
        try:
            r = self.client.get(url)
            self._last_hit[host] = time.time()
            if r.status_code != 200:
                console.log(f"[yellow]{r.status_code} {url}")
                return None
            body = r.text
        except httpx.HTTPError as e:
            console.log(f"[red]fetch failed {url}: {e}")
            return None
        p.write_text(json.dumps({"url": url, "fetched_at": datetime.now(UTC).isoformat(), "body": body}))
        return body
