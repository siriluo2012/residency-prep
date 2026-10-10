/**
 * Build the sandboxed HTML document that hosts one AnimatedConcept component.
 *
 * Used by apps/web (iframe src) and by the pipeline render test (Playwright). The host page talks to
 * the frame with postMessage:
 *   host -> frame : { type: "control", playing?, speed?, step?, loop?, reducedMotion? }
 *   frame -> host : { type: "ready", meta } | { type: "scene", index } | { type: "error", message }
 *
 * Security: the iframe is created with sandbox="allow-scripts" (no same-origin), so the component
 * cannot read cookies or storage of the parent site. Dependencies load from a pinned ESM CDN; set
 * RP_ANIM_CDN to self-host.
 */
import { transform } from "sucrase";

const DEFAULT_CDN = "https://esm.sh";

export function transpileComponent(source) {
  // Strip type-only imports and compile TSX -> ESM JS with automatic JSX runtime.
  return transform(source, {
    transforms: ["typescript", "jsx"],
    jsxRuntime: "automatic",
    production: true,
  }).code;
}

/**
 * @param {string} source TSX source of the component (must satisfy the AnimatedConcept contract)
 * @param {{ cdn?: string, playing?: boolean, speed?: number, step?: number, loop?: boolean, reducedMotion?: boolean, width?: number }} [opts]
 */
export function buildAnimationFrameHtml(source, opts = {}) {
  const cdn = (opts.cdn ?? process.env.RP_ANIM_CDN ?? DEFAULT_CDN).replace(/\/$/, "");
  const js = transpileComponent(source);
  const init = JSON.stringify({
    playing: opts.playing ?? true,
    speed: opts.speed ?? 1,
    step: opts.step,
    loop: opts.loop ?? true,
    reducedMotion: opts.reducedMotion ?? false,
    width: opts.width,
  });
  // The component module is inlined as a data: URL so no extra request/route is needed.
  const moduleUrl = "data:text/javascript;base64," + Buffer.from(js, "utf8").toString("base64");
  return `<!doctype html>
<html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<meta http-equiv="Content-Security-Policy" content="default-src 'none'; script-src 'unsafe-inline' data: ${cdn}; style-src 'unsafe-inline'; img-src data:; connect-src ${cdn}; font-src ${cdn}">
<style>html,body{margin:0;background:transparent;overflow:hidden}#root{width:100%}svg{display:block;width:100%;height:auto}</style>
<script type="importmap">{"imports":{
  "react":"${cdn}/react@19.1.0",
  "react/jsx-runtime":"${cdn}/react@19.1.0/jsx-runtime",
  "react-dom/client":"${cdn}/react-dom@19.1.0/client?deps=react@19.1.0",
  "framer-motion":"${cdn}/framer-motion@12.23.0?deps=react@19.1.0,react-dom@19.1.0"
}}</script>
</head><body><div id="root"></div>
<script type="module">
const init = ${init};
const post = (m) => parent.postMessage(Object.assign({ source: "rp-anim" }, m), "*");
window.addEventListener("error", (e) => post({ type: "error", message: String(e.message || e) }));
window.addEventListener("unhandledrejection", (e) => post({ type: "error", message: String(e.reason && e.reason.message || e.reason) }));
try {
  const [{ createElement, useState, useEffect }, { createRoot }, mod] = await Promise.all([
    import("react"), import("react-dom/client"), import(${JSON.stringify(moduleUrl)})
  ]);
  const Comp = mod.default; const meta = mod.meta;
  if (typeof Comp !== "function") throw new Error("component has no default export");
  if (!meta || !Array.isArray(meta.captions)) throw new Error("component has no meta export with captions");
  const prefersReduced = matchMedia("(prefers-reduced-motion: reduce)").matches;
  function Host() {
    const [ctl, setCtl] = useState(Object.assign({}, init, { reducedMotion: init.reducedMotion || prefersReduced }));
    useEffect(() => {
      const onMsg = (e) => { if (e.data && e.data.type === "control") setCtl((c) => Object.assign({}, c, e.data)); };
      addEventListener("message", onMsg); return () => removeEventListener("message", onMsg);
    }, []);
    return createElement(Comp, Object.assign({}, ctl, { onSceneChange: (i) => post({ type: "scene", index: i }) }));
  }
  createRoot(document.getElementById("root")).render(createElement(Host));
  post({ type: "ready", meta });
  const ro = new ResizeObserver(() => post({ type: "size", height: document.documentElement.scrollHeight }));
  ro.observe(document.getElementById("root"));
} catch (err) { post({ type: "error", message: String(err && err.message || err) }); }
</script></body></html>`;
}
