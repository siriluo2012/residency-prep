/**
 * AnimatedConcept contract.
 *
 * Every generated animation is a single TSX module that default-exports a React component
 * accepting exactly these props. The generator prompt, the sandbox render test, and the in-app
 * player all depend on this contract.
 *
 * Rules enforced by pipeline/animate/lint:
 *  - imports limited to "react" and "framer-motion"
 *  - no network, no window.fetch, no external URLs (data: URIs allowed)
 *  - must export `default` component and a `meta: AnimatedConceptMeta` const
 *  - must render an <svg> root sized with viewBox and width=100%
 *  - all text content must come from `meta.captions` so it is reviewable and translatable
 *  - must respect `playing=false` (freeze) and `step` (jump to scene index)
 */

export interface AnimatedConceptProps {
  /** Rendered width in CSS px; height derives from viewBox aspect. */
  width?: number;
  /** When false, freeze at current frame. */
  playing?: boolean;
  /** Playback rate multiplier (0.25 - 2). */
  speed?: number;
  /** Jump to a storyboard scene index (0-based). Undefined = free running. */
  step?: number;
  /** Loop when reaching the end. */
  loop?: boolean;
  /** Called whenever the active scene changes. */
  onSceneChange?: (sceneIndex: number) => void;
  /** Render static final frame (prefers-reduced-motion). */
  reducedMotion?: boolean;
}

export interface AnimatedConceptMeta {
  slug: string;
  title: string;
  durationMs: number;
  /** Scene boundaries in ms, ascending, length = number of scenes. */
  sceneStartsMs: number[];
  /** One caption per scene; shown under the canvas and read by screen readers. */
  captions: string[];
  viewBox: { width: number; height: number };
}

export const ANIMATION_ALLOWED_IMPORTS = ["react", "framer-motion"] as const;
export const ANIMATION_MIN_DURATION_MS = 3000;
export const ANIMATION_MAX_DURATION_MS = 30000;
export const ANIMATION_MAX_SCENES = 8;
