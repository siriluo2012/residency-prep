"""Extract the hierarchical topic outline from the public USMLE Content Outline PDF.

The PDF is an official, publicly released document that lists systems -> categories -> bullet topics.
We keep the heading/bullet *structure* (short labels) to enrich our taxonomy's sub-topics and the
generator's topic prompts. No explanatory prose exists in the document, so nothing else is kept.
"""

from __future__ import annotations

import re
from pathlib import Path

from rich.console import Console

console = Console(stderr=True)

OUTLINE_PDF = "https://www.usmle.org/sites/default/files/2022-01/USMLE_Content_Outline_0.pdf"
PAGE_HEADER = re.compile(r"^For Public Release: USMLE Content Outline \(\d{4}\)\s*\d+\s*$")


def download(fetcher_client, dest: Path) -> Path | None:
    if dest.exists():
        return dest
    r = fetcher_client.get(OUTLINE_PDF)
    if r.status_code != 200:
        console.log(f"[yellow]{r.status_code} {OUTLINE_PDF}")
        return None
    dest.write_bytes(r.content)
    return dest


def parse_outline(pdf_path: Path) -> list[dict]:
    """Return [{"system": str, "categories": [{"name": str, "topics": [str], "subtopics": [str]}]}]."""
    from pypdf import PdfReader

    reader = PdfReader(str(pdf_path))
    systems: list[dict] = []
    cur_sys: dict | None = None
    cur_cat: dict | None = None
    for page in reader.pages:
        text = page.extract_text() or ""
        lines = [ln.rstrip() for ln in text.splitlines()]
        for i, ln in enumerate(lines):
            s = ln.strip()
            if not s or PAGE_HEADER.match(s):
                continue
            if s.startswith("•"):
                if cur_cat is not None:
                    cur_cat["topics"].append(s.lstrip("• ").strip()[:160])
                continue
            if s.startswith("o "):
                if cur_cat is not None:
                    cur_cat["subtopics"].append(s[2:].strip()[:200])
                continue
            # Heuristic: a system heading is a short Title-Case line that directly follows a page header
            prev = lines[i - 1].strip() if i > 0 else ""
            if PAGE_HEADER.match(prev) and len(s) < 90 and not s.endswith(":"):
                if cur_sys is None or cur_sys["system"] != s:
                    # the same system continues across pages; only start a new one when the name changes
                    existing = next((x for x in systems if x["system"] == s), None)
                    if existing is None:
                        cur_sys = {"system": s, "categories": []}
                        systems.append(cur_sys)
                    else:
                        cur_sys = existing
                    cur_cat = None
                continue
            # Otherwise a category heading (non-bulleted line under a system)
            if cur_sys is not None and len(s) < 140 and not s[0].islower():
                cur_cat = {"name": s, "topics": [], "subtopics": []}
                cur_sys["categories"].append(cur_cat)
    return systems
