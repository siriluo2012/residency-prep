"""Static lint of AnimatedConcept component source against packages/schema/src/animation-contract.ts."""

from __future__ import annotations

import re

from rich.console import Console

from ..sink import FileSink

console = Console()

ALLOWED_IMPORTS = {"react", "framer-motion"}
IMPORT_RE = re.compile(r"""^\s*import\s+(?:[^'"]+?\s+from\s+)?['"]([^'"]+)['"]""", re.M)
FORBIDDEN = [
    (re.compile(r"\bfetch\s*\("), "uses_fetch"),
    (re.compile(r"\bXMLHttpRequest\b"), "uses_xhr"),
    (re.compile(r"\bWebSocket\b"), "uses_websocket"),
    (re.compile(r"\beval\s*\("), "uses_eval"),
    (re.compile(r"\bnew\s+Function\s*\("), "uses_function_ctor"),
    (re.compile(r"\bdocument\.cookie\b"), "touches_cookie"),
    (re.compile(r"\blocalStorage\b|\bsessionStorage\b"), "touches_storage"),
    (re.compile(r"""https?://(?!www\.w3\.org/2000/svg)"""), "external_url"),
    (re.compile(r"\bdangerouslySetInnerHTML\b"), "inner_html"),
    (re.compile(r"<script\b", re.I), "script_tag"),
    (re.compile(r"<img\b", re.I), "img_tag"),
    (re.compile(r"<iframe\b", re.I), "iframe_tag"),
]


def lint_component(src: str, item: dict | None = None) -> list[str]:
    flags: list[str] = []
    imports = IMPORT_RE.findall(src)
    bad = [i for i in imports if i not in ALLOWED_IMPORTS]
    if bad:
        flags.append("disallowed_import:" + ",".join(sorted(set(bad))))
    if not re.search(r"export\s+default\s+(function|const|class)\b", src) and "export default" not in src:
        flags.append("no_default_export")
    if not re.search(r"export\s+const\s+meta\b", src):
        flags.append("no_meta_export")
    if "<svg" not in src:
        flags.append("no_svg_root")
    if "viewBox" not in src:
        flags.append("no_viewbox")
    for pat, name in FORBIDDEN:
        if pat.search(src):
            flags.append(name)
    if "prefers-reduced-motion" not in src and "reducedMotion" not in src:
        flags.append("no_reduced_motion_handling")
    if "playing" not in src:
        flags.append("ignores_playing_prop")
    if len(src) > 40_000:
        flags.append("source_too_large")
    if item is not None:
        sb = item.get("storyboard") or []
        if sb:
            if sb[0].get("start_ms") != 0:
                flags.append("storyboard_not_zero_start")
            for a, b in zip(sb, sb[1:], strict=False):
                if a["end_ms"] != b["start_ms"]:
                    flags.append("storyboard_gap")
                    break
            if sb[-1].get("end_ms") != item.get("duration_ms"):
                flags.append("storyboard_duration_mismatch")
        # captions must live in meta, not in JSX text, so they are reviewable
        n_scene = len(sb)
        if n_scene and len(re.findall(r"captions\s*:\s*\[", src)) == 0:
            flags.append("captions_not_in_meta")
    return flags


def run() -> None:
    fs = FileSink()
    rows = fs.read("animations")
    bad = 0
    for r in rows:
        flags = lint_component(r["component_source"], r)
        if flags:
            bad += 1
            console.print(f"[yellow]{r['slug']}[/]: {', '.join(flags)}")
    console.print(f"linted {len(rows)} animations, {bad} with findings")
