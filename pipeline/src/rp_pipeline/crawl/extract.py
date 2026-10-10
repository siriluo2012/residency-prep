"""HTML -> structure/facts extractors. No prose is retained beyond short fact values and headings."""

from __future__ import annotations

import re
from dataclasses import dataclass, field

from bs4 import BeautifulSoup

PCT_RANGE = re.compile(r"(\d{1,2})\s*[–-]\s*(\d{1,2})\s*%")
MONEY = re.compile(r"\$\s?(\d{3,4})")


@dataclass
class Extracted:
    url: str
    title: str = ""
    headings: list[str] = field(default_factory=list)
    weight_rows: list[dict] = field(default_factory=list)  # {"label", "min", "max"}
    facts: list[dict] = field(default_factory=list)  # {"key","value"}
    outline: list[dict] = field(default_factory=list)  # hierarchical headings [{"text","level","children"}]


def soup(html: str) -> BeautifulSoup:
    return BeautifulSoup(html, "lxml")


def headings(doc: BeautifulSoup, max_level: int = 3) -> list[tuple[int, str]]:
    out: list[tuple[int, str]] = []
    for tag in doc.find_all([f"h{i}" for i in range(1, max_level + 1)]):
        text = " ".join(tag.get_text(" ", strip=True).split())
        if 2 < len(text) < 160:
            out.append((int(tag.name[1]), text))
    return out


def outline_from_headings(hs: list[tuple[int, str]]) -> list[dict]:
    """Nest headings into a tree. Only heading text is kept; this is structure, not content."""
    root: list[dict] = []
    stack: list[tuple[int, list[dict]]] = [(0, root)]
    for level, text in hs:
        node = {"text": text, "level": level, "children": []}
        while stack and stack[-1][0] >= level:
            stack.pop()
        (stack[-1][1] if stack else root).append(node)
        stack.append((level, node["children"]))
    return root


RANGE_ONLY = re.compile(r"^\s*(\d{1,2})\s*[–-]\s*(\d{1,2})\s*%?\s*$")


def weight_table(doc: BeautifulSoup) -> list[dict]:
    """Find rows like 'Cardiovascular System | 7–11%' in tables or lists.

    usmle.org specification tables put the '%' only in the header ("Range, %*"), so a table whose
    header mentions '%' or 'Range' is treated as a weight table and bare 'a-b' cells are accepted.
    """
    rows: list[dict] = []
    for table in doc.find_all("table"):
        header = " ".join(th.get_text(" ", strip=True) for th in table.find_all("th")).lower()
        first_tr = table.find("tr")
        if first_tr is not None:
            header += " " + " ".join(c.get_text(" ", strip=True) for c in first_tr.find_all(["td", "th"])).lower()
        is_weight_table = "%" in header or "range" in header
        group = ""
        for tr in table.find_all("tr"):
            cells = [c.get_text(" ", strip=True) for c in tr.find_all(["td", "th"])]
            if len(cells) < 2:
                continue
            if cells[0].lower() in ("system", "competency", "discipline", "category") or "range" in cells[1].lower():
                group = cells[0].lower()
                continue
            joined = " ".join(cells)
            m = PCT_RANGE.search(joined) or (RANGE_ONLY.match(cells[-1]) if is_weight_table else None)
            if m:
                label = PCT_RANGE.sub("", cells[0]).strip(" :*")
                rows.append({"label": label, "min": int(m.group(1)), "max": int(m.group(2)), "group": group or None})
    if not rows:
        for li in doc.find_all("li"):
            text = li.get_text(" ", strip=True)
            m = PCT_RANGE.search(text)
            if m and len(text) < 140:
                rows.append(
                    {
                        "label": PCT_RANGE.sub("", text).strip(" :–-"),
                        "min": int(m.group(1)),
                        "max": int(m.group(2)),
                    }
                )
    return rows


def fee_facts(doc: BeautifulSoup) -> list[dict]:
    facts: list[dict] = []
    for tr in doc.find_all("tr"):
        cells = [c.get_text(" ", strip=True) for c in tr.find_all(["td", "th"])]
        joined = " ".join(cells)
        m = MONEY.search(joined)
        if m and len(cells) >= 2 and len(cells[0]) < 80:
            facts.append({"key": cells[0], "value": f"${m.group(1)}"})
    return facts[:40]


def extract(url: str, html: str) -> Extracted:
    doc = soup(html)
    for bad in doc(["script", "style", "nav", "footer", "noscript"]):
        bad.decompose()
    hs = headings(doc)
    return Extracted(
        url=url,
        title=(doc.title.get_text(strip=True) if doc.title else ""),
        headings=[t for _, t in hs],
        weight_rows=weight_table(doc),
        facts=fee_facts(doc),
        outline=outline_from_headings(hs),
    )
