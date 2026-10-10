import React, { useEffect, useRef, useState } from "react";

// Reference AnimatedConcept: cardiac cycle (Wiggers). Hand-authored exemplar for the generator and the
// render test. Satisfies packages/schema/src/animation-contract.ts.

export const meta = {
  slug: "cardiac-cycle-wiggers",
  title: "Cardiac cycle: pressures, volume, and valve events",
  durationMs: 12000,
  sceneStartsMs: [0, 2400, 6000, 8400],
  captions: [
    "Isovolumetric contraction: mitral valve closes (S1). Pressure rises steeply while volume stays constant.",
    "Ejection: LV pressure exceeds aortic pressure, the aortic valve opens, and volume falls to end-systolic volume.",
    "Isovolumetric relaxation: aortic valve closes (S2). Pressure falls while volume is constant again.",
    "Filling: when LV pressure drops below atrial pressure the mitral valve opens; rapid filling, then the atrial kick.",
  ],
  viewBox: { width: 640, height: 360 },
};

type Props = {
  width?: number;
  playing?: boolean;
  speed?: number;
  step?: number;
  loop?: boolean;
  onSceneChange?: (i: number) => void;
  reducedMotion?: boolean;
};

const D = meta.durationMs;
const W = 640;
const H = 360;
// chart area for the pressure tracings
const PX0 = 70;
const PX1 = 430;
const PY0 = 40;
const PY1 = 200;
// volume tracing area
const VY0 = 220;
const VY1 = 300;

// Phase boundaries as fractions of the cycle
const F_IVC = 0.2; // isovolumetric contraction ends
const F_EJ = 0.5; // ejection ends
const F_IVR = 0.7; // isovolumetric relaxation ends

function clamp(x: number, a: number, b: number) {
  return Math.max(a, Math.min(b, x));
}
function lerp(a: number, b: number, t: number) {
  return a + (b - a) * clamp(t, 0, 1);
}
function smooth(t: number) {
  const x = clamp(t, 0, 1);
  return x * x * (3 - 2 * x);
}

/** LV pressure (mmHg) at fraction f of the cycle. Piecewise but continuous at every boundary. */
function lvP(f: number): number {
  if (f < F_IVC) return lerp(8, 82, smooth(f / F_IVC)); // 8 -> 82
  if (f < F_EJ) {
    const u = (f - F_IVC) / (F_EJ - F_IVC);
    return 82 + 36 * Math.sin(Math.PI * u) + 16 * u; // 82 -> peak ~120 -> 98
  }
  if (f < F_IVR) return lerp(98, 6, smooth((f - F_EJ) / (F_IVR - F_EJ))); // 98 -> 6
  const u = (f - F_IVR) / (1 - F_IVR);
  return 6 + (u > 0.8 ? 2 * (u - 0.8) / 0.2 : 0); // 6 -> 8 with atrial kick
}
/** Aortic pressure: 80 at onset, peak ~120, ~100 at closure (dicrotic notch), decays back to 80. */
function aoP(f: number): number {
  if (f < F_IVC) return lerp(80, 80, f / F_IVC);
  if (f < F_EJ) {
    const u = (f - F_IVC) / (F_EJ - F_IVC);
    return 80 + 36 * Math.sin(Math.PI * u) + 20 * u; // 80 -> ~120 -> 100
  }
  const u = (f - F_EJ) / (1 - F_EJ);
  const notch = u < 0.06 ? -5 * Math.sin((Math.PI * u) / 0.06) : 0;
  return 100 - 20 * u + notch; // 100 -> 80
}
/** Left atrial pressure: a wave peak 16 at end-diastole, x descent in systole, v wave, y descent. */
function laP(f: number): number {
  if (f < F_IVC) return lerp(16, 12, smooth(f / F_IVC)); // after a wave
  if (f < F_EJ) {
    const u = (f - F_IVC) / (F_EJ - F_IVC);
    return u < 0.4 ? lerp(12, 7, u / 0.4) : lerp(7, 13, (u - 0.4) / 0.6); // x descent then v wave
  }
  if (f < F_IVR) return lerp(13, 12, (f - F_EJ) / (F_IVR - F_EJ));
  const u = (f - F_IVR) / (1 - F_IVR);
  if (u < 0.8) return 12 - 5 * Math.sin((Math.PI * u) / 0.8); // y descent and refill
  return lerp(12, 16, (u - 0.8) / 0.2); // a wave
}
/** LV volume (mL). */
function lvV(f: number): number {
  if (f < F_IVC) return 130;
  if (f < F_EJ) return lerp(130, 60, smooth((f - F_IVC) / (F_EJ - F_IVC)));
  if (f < F_IVR) return 60;
  const u = (f - F_IVR) / (1 - F_IVR);
  return u < 0.8 ? lerp(60, 118, smooth(u / 0.8)) : lerp(118, 130, (u - 0.8) / 0.2);
}

const pY = (p: number) => PY1 - ((PY1 - PY0) * p) / 130;
const vY = (v: number) => VY1 - ((VY1 - VY0) * (v - 40)) / 100;
const fX = (f: number) => PX0 + (PX1 - PX0) * f;

function path(fn: (f: number) => number, yMap: (v: number) => number, upto: number, n = 120) {
  let d = "";
  for (let i = 0; i <= n; i++) {
    const f = (i / n) * upto;
    d += `${i === 0 ? "M" : "L"}${fX(f).toFixed(1)},${yMap(fn(f)).toFixed(1)} `;
  }
  return d;
}

function sceneAt(t: number) {
  let i = 0;
  for (let k = 0; k < meta.sceneStartsMs.length; k++) if (t >= meta.sceneStartsMs[k]) i = k;
  return i;
}

export default function Anim({ width, playing = true, speed = 1, step, loop = true, onSceneChange, reducedMotion = false }: Props) {
  const [t, setT] = useState(reducedMotion ? D - 1 : 0);
  const last = useRef<number | null>(null);
  const sceneRef = useRef(-1);

  useEffect(() => {
    if (typeof step === "number") {
      setT(meta.sceneStartsMs[clamp(step, 0, meta.sceneStartsMs.length - 1)]);
      last.current = null;
      return;
    }
    if (!playing || reducedMotion) {
      last.current = null;
      return;
    }
    let raf = 0;
    const tick = (now: number) => {
      if (last.current == null) last.current = now;
      const dt = (now - last.current) * speed;
      last.current = now;
      setT((prev) => {
        let next = prev + dt;
        if (next >= D) next = loop ? next % D : D - 1;
        return next;
      });
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [playing, speed, step, loop, reducedMotion]);

  useEffect(() => {
    const s = sceneAt(t);
    if (s !== sceneRef.current) {
      sceneRef.current = s;
      onSceneChange?.(s);
    }
  }, [t, onSceneChange]);

  const f = clamp(t / D, 0, 0.9999);
  const scene = sceneAt(t);
  const mitralOpen = f >= F_IVR;
  const aorticOpen = f >= F_IVC && f < F_EJ;
  const vol = lvV(f);
  const heartR = 34 + (vol - 60) * 0.22; // visual LV size tracks volume
  const s1 = f < 0.06 ? 1 - f / 0.06 : 0;
  const s2 = f >= F_EJ && f < F_EJ + 0.06 ? 1 - (f - F_EJ) / 0.06 : 0;

  return (
    <svg viewBox={`0 0 ${W} ${H}`} width={width ?? "100%"} role="img" aria-label={meta.title} style={{ fontFamily: "ui-sans-serif, system-ui, sans-serif" }}>
      {/* phase bands */}
      {[
        [0, F_IVC, "IVC"],
        [F_IVC, F_EJ, "Ejection"],
        [F_EJ, F_IVR, "IVR"],
        [F_IVR, 1, "Filling"],
      ].map(([a, b, label], i) => (
        <g key={String(label)}>
          <rect x={fX(a as number)} y={PY0 - 14} width={fX(b as number) - fX(a as number)} height={VY1 - PY0 + 14} fill={scene === i ? "#0f766e" : "#9ca3af"} opacity={scene === i ? 0.1 : 0.04} />
          <text x={(fX(a as number) + fX(b as number)) / 2} y={PY0 - 18} fontSize={10} textAnchor="middle" fill={scene === i ? "#0f766e" : "#9ca3af"} fontWeight={scene === i ? 700 : 400}>
            {String(label)}
          </text>
        </g>
      ))}
      {/* axes */}
      <line x1={PX0} y1={PY0} x2={PX0} y2={PY1} stroke="#9ca3af" />
      <line x1={PX0} y1={PY1} x2={PX1} y2={PY1} stroke="#9ca3af" />
      {[0, 40, 80, 120].map((p) => (
        <g key={p}>
          <line x1={PX0 - 3} x2={PX0} y1={pY(p)} y2={pY(p)} stroke="#9ca3af" />
          <text x={PX0 - 6} y={pY(p) + 3} fontSize={9} textAnchor="end" fill="#6b7280">{p}</text>
        </g>
      ))}
      <text x={PX0 - 40} y={PY0 + 60} fontSize={9} fill="#6b7280" transform={`rotate(-90 ${PX0 - 40} ${PY0 + 60})`}>Pressure (mmHg)</text>
      <line x1={PX0} y1={VY0} x2={PX0} y2={VY1} stroke="#9ca3af" />
      <line x1={PX0} y1={VY1} x2={PX1} y2={VY1} stroke="#9ca3af" />
      {[60, 130].map((v) => (
        <text key={v} x={PX0 - 6} y={vY(v) + 3} fontSize={9} textAnchor="end" fill="#6b7280">{v}</text>
      ))}
      <text x={PX0 - 40} y={VY0 + 50} fontSize={9} fill="#6b7280" transform={`rotate(-90 ${PX0 - 40} ${VY0 + 50})`}>LV volume (mL)</text>

      {/* faint full-cycle traces */}
      <path d={path(aoP, pY, 1)} fill="none" stroke="#b91c1c" strokeOpacity={0.15} strokeWidth={1.5} />
      <path d={path(lvP, pY, 1)} fill="none" stroke="#1d4ed8" strokeOpacity={0.15} strokeWidth={1.5} />
      <path d={path(laP, pY, 1)} fill="none" stroke="#d97706" strokeOpacity={0.15} strokeWidth={1.5} />
      <path d={path(lvV, vY, 1)} fill="none" stroke="#0f766e" strokeOpacity={0.15} strokeWidth={1.5} />
      {/* drawn-so-far traces */}
      <path d={path(aoP, pY, f)} fill="none" stroke="#b91c1c" strokeWidth={2} />
      <path d={path(lvP, pY, f)} fill="none" stroke="#1d4ed8" strokeWidth={2} />
      <path d={path(laP, pY, f)} fill="none" stroke="#d97706" strokeWidth={2} />
      <path d={path(lvV, vY, f)} fill="none" stroke="#0f766e" strokeWidth={2} />
      {/* cursor */}
      <line x1={fX(f)} x2={fX(f)} y1={PY0} y2={VY1} stroke="#1f2937" strokeDasharray="3 3" />
      <circle cx={fX(f)} cy={pY(lvP(f))} r={3.5} fill="#1d4ed8" />
      <circle cx={fX(f)} cy={pY(aoP(f))} r={3.5} fill="#b91c1c" />
      <circle cx={fX(f)} cy={pY(laP(f))} r={3.5} fill="#d97706" />
      <circle cx={fX(f)} cy={vY(vol)} r={3.5} fill="#0f766e" />
      {/* legend */}
      <g fontSize={10}>
        <rect x={PX1 - 118} y={PY0 - 2} width={10} height={3} fill="#b91c1c" /><text x={PX1 - 104} y={PY0 + 2} fill="#1f2937">Aorta</text>
        <rect x={PX1 - 118} y={PY0 + 12} width={10} height={3} fill="#1d4ed8" /><text x={PX1 - 104} y={PY0 + 16} fill="#1f2937">Left ventricle</text>
        <rect x={PX1 - 118} y={PY0 + 26} width={10} height={3} fill="#d97706" /><text x={PX1 - 104} y={PY0 + 30} fill="#1f2937">Left atrium</text>
      </g>
      {/* heart sounds */}
      <text x={fX(0.03)} y={VY1 + 16} fontSize={11} fontWeight={700} fill="#1f2937" opacity={0.35 + 0.65 * s1}>S1</text>
      <text x={fX(F_EJ + 0.02)} y={VY1 + 16} fontSize={11} fontWeight={700} fill="#1f2937" opacity={0.35 + 0.65 * s2}>S2</text>

      {/* schematic LV with valves */}
      <g transform="translate(535 150)">
        <text x={0} y={-92} fontSize={10} textAnchor="middle" fill="#6b7280">Left ventricle</text>
        <circle cx={0} cy={0} r={heartR} fill="#1d4ed8" fillOpacity={0.12} stroke="#1d4ed8" strokeWidth={2} />
        <text x={0} y={4} fontSize={11} textAnchor="middle" fill="#1f2937">{Math.round(vol)} mL</text>
        {/* mitral valve (inflow, left) */}
        <g transform={`translate(${-heartR - 10} 0)`}>
          <line x1={-14} x2={14} y1={0} y2={0} stroke="#d97706" strokeWidth={2} />
          <line x1={0} y1={0} x2={mitralOpen ? -9 : 0} y2={mitralOpen ? -11 : -13} stroke="#d97706" strokeWidth={3} strokeLinecap="round" />
          <line x1={0} y1={0} x2={mitralOpen ? -9 : 0} y2={mitralOpen ? 11 : 13} stroke="#d97706" strokeWidth={3} strokeLinecap="round" />
          <text x={0} y={-22} fontSize={9} textAnchor="middle" fill="#d97706">Mitral {mitralOpen ? "open" : "closed"}</text>
          {mitralOpen && <path d="M-26,0 L-16,0 M-20,-4 L-16,0 L-20,4" stroke="#d97706" strokeWidth={1.5} fill="none" />}
        </g>
        {/* aortic valve (outflow, top) */}
        <g transform={`translate(0 ${-heartR - 10})`}>
          <line x1={0} x2={0} y1={-14} y2={14} stroke="#b91c1c" strokeWidth={2} />
          <line x1={0} y1={0} x2={aorticOpen ? -11 : -13} y2={aorticOpen ? -9 : 0} stroke="#b91c1c" strokeWidth={3} strokeLinecap="round" />
          <line x1={0} y1={0} x2={aorticOpen ? 11 : 13} y2={aorticOpen ? -9 : 0} stroke="#b91c1c" strokeWidth={3} strokeLinecap="round" />
          <text x={0} y={-22} fontSize={9} textAnchor="middle" fill="#b91c1c">Aortic {aorticOpen ? "open" : "closed"}</text>
          {aorticOpen && <path d="M0,-4 L0,-16 M-4,-12 L0,-16 L4,-12" stroke="#b91c1c" strokeWidth={1.5} fill="none" transform="translate(0 -14)" />}
        </g>
      </g>

      {/* caption */}
      <rect x={16} y={H - 40} width={W - 32} height={30} rx={6} fill="#0f766e" fillOpacity={0.08} />
      <text x={W / 2} y={H - 21} fontSize={11.5} textAnchor="middle" fill="#1f2937">{meta.captions[scene]}</text>
    </svg>
  );
}
