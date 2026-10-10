"""Export an animation to WebM/GIF by screen-recording the sandbox frame with Playwright, then ffmpeg.

    rp animate export cardiac-cycle-wiggers --gif

Requires: playwright (uv sync --extra render), and ffmpeg on PATH for GIF conversion.
The resulting files are written to data/export/<slug>.webm|gif and the path recorded in export_urls
(as a relative path; upload to Supabase Storage and replace with the public URL when deploying).
"""

from __future__ import annotations

import shutil
import subprocess
from pathlib import Path

from rich.console import Console

from ..config import get_settings
from ..models import Animation
from ..sink import FileSink
from .render_test import build_html

console = Console()


def export_one(anim: Animation, out_dir: Path, gif: bool, fps: int = 24) -> dict[str, str]:
    from playwright.sync_api import sync_playwright

    out_dir.mkdir(parents=True, exist_ok=True)
    html = build_html(anim.component_source)
    with sync_playwright() as p:
        browser = p.chromium.launch()
        ctx = browser.new_context(
            viewport={"width": 640, "height": 400},
            record_video_dir=str(out_dir),
            record_video_size={"width": 640, "height": 400},
        )
        page = ctx.new_page()
        page.set_content(html, wait_until="load")
        page.wait_for_selector("#root svg", timeout=15000)
        page.wait_for_timeout(anim.duration_ms + 500)  # one full loop
        video = page.video
        ctx.close()
        browser.close()
        raw = Path(video.path()) if video else None
    if not raw or not raw.exists():
        raise RuntimeError("no video captured")
    webm = out_dir / f"{anim.slug}.webm"
    shutil.move(str(raw), webm)
    urls = {"webm": str(webm.relative_to(out_dir.parent.parent))}
    if gif:
        if not shutil.which("ffmpeg"):
            console.print("[yellow]ffmpeg not found; skipping GIF")
        else:
            gif_path = out_dir / f"{anim.slug}.gif"
            palette = out_dir / f"{anim.slug}-palette.png"
            subprocess.run(
                [
                    "ffmpeg",
                    "-y",
                    "-loglevel",
                    "error",
                    "-i",
                    str(webm),
                    "-vf",
                    f"fps={fps},scale=640:-1:flags=lanczos,palettegen",
                    str(palette),
                ],
                check=True,
            )
            subprocess.run(
                [
                    "ffmpeg",
                    "-y",
                    "-loglevel",
                    "error",
                    "-i",
                    str(webm),
                    "-i",
                    str(palette),
                    "-lavfi",
                    f"fps={fps},scale=640:-1:flags=lanczos[x];[x][1:v]paletteuse",
                    str(gif_path),
                ],
                check=True,
            )
            palette.unlink(missing_ok=True)
            urls["gif"] = str(gif_path.relative_to(out_dir.parent.parent))
    return urls


def run(slug: str, gif: bool = False) -> None:
    s = get_settings()
    fs = FileSink()
    rows = fs.read("animations")
    out: list[Animation] = []
    done = False
    for r in rows:
        a = Animation.model_validate(r)
        if a.slug == slug:
            a.export_urls = {**a.export_urls, **export_one(a, s.rp_data_dir / "export", gif)}
            console.print(f"exported {slug}: {a.export_urls}")
            done = True
        out.append(a)
    if not done:
        raise SystemExit(f"no staged animation with slug {slug}")
    fs.rewrite("animations", out)
