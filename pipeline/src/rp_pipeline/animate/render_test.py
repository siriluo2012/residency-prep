"""Headless render test: load each staged animation in Chromium, step through scenes, screenshot each one.

Uses the same HTML host as the web app (packages/schema/src/animation-frame.mjs) via a small Node shim, so
what passes here is exactly what the site will serve. Requires:  uv sync --extra render && playwright install chromium
"""

from __future__ import annotations

import json
import subprocess
from datetime import UTC, datetime
from pathlib import Path

from rich.console import Console

from ..config import REPO_ROOT, get_settings
from ..models import Animation, RenderTest
from ..sink import FileSink

console = Console()
NODE_SHIM = REPO_ROOT / "packages" / "schema" / "scripts" / "render-frame.mjs"


def build_html(source: str, reduced_motion: bool = False) -> str:
    proc = subprocess.run(
        ["node", str(NODE_SHIM), "--rm" if reduced_motion else "--motion"],
        input=source.encode("utf-8"),
        capture_output=True,
        check=True,
        cwd=REPO_ROOT,
    )
    return proc.stdout.decode("utf-8")


def test_one(anim: Animation, out_dir: Path) -> RenderTest:
    try:
        from playwright.sync_api import sync_playwright
    except ImportError as e:  # pragma: no cover
        raise SystemExit(
            "playwright not installed: uv sync --extra render && uv run playwright install chromium"
        ) from e

    errors: list[str] = []
    captured = 0
    html = build_html(anim.component_source)
    out_dir.mkdir(parents=True, exist_ok=True)
    with sync_playwright() as p:
        browser = p.chromium.launch()
        page = browser.new_page(viewport={"width": 640, "height": 420})
        messages: list[dict] = []
        page.expose_function("__rpMsg", lambda m: messages.append(m))
        page.add_init_script(
            "window.addEventListener('message', e => { if (e.data && e.data.source === 'rp-anim') window.__rpMsg(e.data); });"
        )
        page.on("pageerror", lambda e: errors.append(f"pageerror: {e}"))
        page.set_content(html, wait_until="load")
        try:
            page.wait_for_function("() => document.querySelector('#root svg') !== null", timeout=15000)
            page.wait_for_timeout(300)  # let the ready/scene messages arrive
        except Exception:  # noqa: BLE001
            errors.append("component did not render an <svg> within 15s")
        for m in messages:
            if m.get("type") == "error":
                errors.append(m.get("message", "unknown error"))
        if not errors:
            for i, _scene in enumerate(anim.storyboard):
                page.evaluate("(i) => window.postMessage({ type: 'control', step: i, playing: false }, '*')", i)
                page.wait_for_timeout(250)
                page.screenshot(path=str(out_dir / f"{anim.slug}-scene{i}.png"))
                captured += 1
            # play for a second to catch runtime errors in the rAF loop
            page.evaluate("() => window.postMessage({ type: 'control', step: undefined, playing: true }, '*')")
            page.wait_for_timeout(1200)
            for m in messages:
                if m.get("type") == "error" and m.get("message") not in errors:
                    errors.append(m["message"])
        browser.close()
    return RenderTest(
        passed=not errors and captured == len(anim.storyboard),
        scenes_captured=captured,
        errors=errors,
        tested_at=datetime.now(UTC).isoformat(),
    )


def run(slug: str | None = None) -> None:
    s = get_settings()
    fs = FileSink()
    rows = fs.read("animations")
    out_dir = s.rp_data_dir / "render"
    updated: list[Animation] = []
    n_pass = 0
    for r in rows:
        anim = Animation.model_validate(r)
        if slug and anim.slug != slug:
            updated.append(anim)
            continue
        rt = test_one(anim, out_dir)
        anim.render_test = rt
        if rt.passed:
            n_pass += 1
            console.print(f"[green]PASS[/] {anim.slug} ({rt.scenes_captured} scenes)")
        else:
            console.print(f"[red]FAIL[/] {anim.slug}: {'; '.join(rt.errors)[:200]}")
        updated.append(anim)
    fs.rewrite("animations", updated)
    console.print(f"{n_pass}/{len(rows) if not slug else 1} passed; screenshots in {out_dir}")
    console.print(json.dumps({"passed": n_pass}))
