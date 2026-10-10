"use client";
import { useEffect, useRef, useState } from "react";
import type { StoryboardScene } from "@rp/schema";
import { cn } from "@/lib/utils";

/**
 * Hosts an AnimatedConcept in a sandboxed iframe and exposes play/pause, speed, and scene scrubbing.
 * Captions come from the storyboard (reviewed data), not from the component.
 */
export function AnimationPlayer({
  id,
  title,
  storyboard,
  durationMs,
  staticFallbackSvg,
  className,
}: {
  id: string;
  title: string;
  storyboard: StoryboardScene[];
  durationMs: number;
  staticFallbackSvg?: string | null;
  className?: string;
}) {
  const frame = useRef<HTMLIFrameElement>(null);
  const [playing, setPlaying] = useState(true);
  const [speed, setSpeed] = useState(1);
  const [scene, setScene] = useState(0);
  const [height, setHeight] = useState(360);
  const [status, setStatus] = useState<"loading" | "ready" | "error">("loading");
  const [error, setError] = useState<string | null>(null);
  const reduced = typeof window !== "undefined" && window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;

  useEffect(() => {
    const onMsg = (e: MessageEvent) => {
      if (e.source !== frame.current?.contentWindow || e.data?.source !== "rp-anim") return;
      if (e.data.type === "ready") setStatus("ready");
      if (e.data.type === "scene") setScene(e.data.index);
      if (e.data.type === "size" && e.data.height > 50) setHeight(Math.min(e.data.height, 720));
      if (e.data.type === "error") {
        setStatus("error");
        setError(e.data.message);
      }
    };
    window.addEventListener("message", onMsg);
    return () => window.removeEventListener("message", onMsg);
  }, []);

  const control = (msg: Record<string, unknown>) => frame.current?.contentWindow?.postMessage({ type: "control", ...msg }, "*");

  const togglePlay = () => {
    setPlaying((p) => {
      control({ playing: !p, step: undefined });
      return !p;
    });
  };
  const changeSpeed = (s: number) => {
    setSpeed(s);
    control({ speed: s });
  };
  const jump = (i: number) => {
    setScene(i);
    setPlaying(false);
    control({ step: i, playing: false });
  };

  if (reduced && staticFallbackSvg) {
    return (
      <figure className={cn("rounded-lg border border-border overflow-hidden bg-card", className)}>
        <div dangerouslySetInnerHTML={{ __html: staticFallbackSvg }} />
        <figcaption className="p-3 text-sm text-muted-foreground">{storyboard.map((s) => s.caption).join(" ")}</figcaption>
      </figure>
    );
  }

  return (
    <figure className={cn("rounded-lg border border-border overflow-hidden bg-card", className)} aria-label={title}>
      <div className="relative" style={{ height }}>
        <iframe
          ref={frame}
          title={title}
          src={`/api/public/animations/${id}/frame${reduced ? "?rm=1" : ""}`}
          sandbox="allow-scripts"
          loading="lazy"
          className="w-full h-full border-0"
        />
        {status === "loading" && <div className="absolute inset-0 grid place-items-center text-sm text-muted-foreground">Loading animation…</div>}
        {status === "error" && (
          <div className="absolute inset-0 grid place-items-center text-sm text-danger p-4 text-center">
            Animation failed to load{error ? `: ${error}` : ""}.
          </div>
        )}
      </div>
      <div className="flex items-center gap-2 px-3 py-2 border-t border-border text-sm">
        <button onClick={togglePlay} className="rounded border border-border px-2 py-0.5 w-16" aria-label={playing ? "Pause" : "Play"}>
          {playing ? "Pause" : "Play"}
        </button>
        <select value={speed} onChange={(e) => changeSpeed(Number(e.target.value))} className="rounded border border-border bg-card px-1 py-0.5 text-xs" aria-label="Speed">
          {[0.5, 0.75, 1, 1.5, 2].map((s) => (
            <option key={s} value={s}>{s}x</option>
          ))}
        </select>
        <div className="flex-1 flex gap-1" role="tablist" aria-label="Scenes">
          {storyboard.map((s, i) => (
            <button
              key={s.scene}
              role="tab"
              aria-selected={i === scene}
              onClick={() => jump(i)}
              title={s.caption}
              className={cn("h-2 flex-1 rounded-full", i === scene ? "bg-primary" : "bg-muted")}
              style={{ flexGrow: Math.max(1, s.end_ms - s.start_ms) / Math.max(1, durationMs) * storyboard.length }}
            />
          ))}
        </div>
        <span className="text-xs text-muted-foreground tabular-nums">{scene + 1}/{storyboard.length}</span>
      </div>
      <figcaption className="px-3 pb-3 text-sm leading-6 min-h-[2.5rem]" aria-live="polite">
        {storyboard[scene]?.caption}
      </figcaption>
    </figure>
  );
}
