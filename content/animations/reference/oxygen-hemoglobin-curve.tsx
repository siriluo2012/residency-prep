import React, { useEffect, useRef, useState } from "react";

// Oxygen-hemoglobin dissociation curve: sigmoid shape, P50, right and left shifts, and the
// change in shape with carbon monoxide poisoning.

export const meta = {
  slug: "oxygen-hemoglobin-curve",
  title: "Oxygen-hemoglobin dissociation curve shifts",
  durationMs: 12000,
  sceneStartsMs: [0, 3000, 6000, 9000],
  captions: [
    "Cooperative binding gives a sigmoid curve. P50, the PO2 at 50% saturation, is about 26 mm Hg. Arterial blood (~100 mm Hg) is ~98% saturated; mixed venous (~40 mm Hg) ~75%.",
    "Right shift: higher P50, lower affinity, more O2 unloaded to tissue. Causes: increased CO2, H+ (acidosis), temperature, 2,3-BPG, exercise, altitude.",
    "Left shift: lower P50, higher affinity, less unloading. Causes: decreased CO2, alkalosis, hypothermia, low 2,3-BPG, fetal hemoglobin, methemoglobin.",
    "Carbon monoxide: binds heme ~250x more avidly than O2, lowering O2 content, and shifts the remaining curve left so even bound O2 is released poorly.",
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
const X0 = 70;
const X1 = 430;
const Y0 = 40;
const Y1 = 270;
const PMAX = 120;

const clamp = (x: number, a: number, b: number) => Math.max(a, Math.min(b, x));
const lerp = (a: number, b: number, t: number) => a + (b - a) * clamp(t, 0, 1);
const smooth = (t: number) => {
  const x = clamp(t, 0, 1);
  return x * x * (3 - 2 * x);
};

/** Hill equation saturation (fraction) for a given P50 and max saturation. */
function sat(po2: number, p50: number, n = 2.7, max = 1): number {
  const a = Math.pow(po2, n);
  return (max * a) / (a + Math.pow(p50, n));
}
const xOf = (p: number) => X0 + (X1 - X0) * (p / PMAX);
const yOf = (s: number) => Y1 - (Y1 - Y0) * s;

function curvePath(p50: number, max = 1, n = 2.7) {
  let d = "";
  for (let i = 0; i <= 120; i++) {
    const p = (i / 120) * PMAX;
    d += `${i ? "L" : "M"}${xOf(p).toFixed(1)},${yOf(sat(p, p50, n, max)).toFixed(1)} `;
  }
  return d;
}

/** Split a caption into two lines at a word boundary. */
function wrap2(s: string, max = 105): [string, string] {
  if (s.length <= max) return [s, ""];
  const cut = s.lastIndexOf(" ", max);
  const i = cut > 40 ? cut : max;
  return [s.slice(0, i), s.slice(i + 1, i + 1 + max + 20)];
}

function sceneAt(t: number) {
  let i = 0;
  for (let k = 0; k < meta.sceneStartsMs.length; k++) if (t >= meta.sceneStartsMs[k]) i = k;
  return i;
}
function sceneProgress(t: number) {
  const s = sceneAt(t);
  const a = meta.sceneStartsMs[s];
  const b = s + 1 < meta.sceneStartsMs.length ? meta.sceneStartsMs[s + 1] : D;
  return clamp((t - a) / (b - a), 0, 1);
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

  const scene = sceneAt(t);
  const u = smooth(sceneProgress(t));
  // Scene-dependent curve parameters
  let p50 = 26;
  let max = 1;
  let shiftLabel = "";
  let color = "#1d4ed8";
  if (scene === 1) {
    p50 = lerp(26, 36, u);
    shiftLabel = "right shift (↑P50)";
    color = "#b91c1c";
  } else if (scene === 2) {
    p50 = lerp(26, 18, u);
    shiftLabel = "left shift (↓P50)";
    color = "#0f766e";
  } else if (scene === 3) {
    p50 = lerp(26, 16, u);
    max = lerp(1, 0.55, u);
    shiftLabel = "CO poisoning";
    color = "#7c3aed";
  }
  const drawFrac = scene === 0 ? u : 1;
  const s50 = sat(p50, p50, 2.7, max);
  const sArt = sat(100, p50, 2.7, max);
  const sVen = sat(40, p50, 2.7, max);

  const causesRight = ["↑ CO2", "↑ H+ (acidosis)", "↑ temperature", "↑ 2,3-BPG", "exercise, altitude"];
  const causesLeft = ["↓ CO2", "alkalosis", "↓ temperature", "↓ 2,3-BPG", "HbF, methemoglobin"];

  return (
    <svg viewBox={`0 0 ${meta.viewBox.width} ${meta.viewBox.height}`} width={width ?? "100%"} role="img" aria-label={meta.title} style={{ fontFamily: "ui-sans-serif, system-ui, sans-serif" }}>
      {/* axes */}
      <line x1={X0} y1={Y0} x2={X0} y2={Y1} stroke="#9ca3af" />
      <line x1={X0} y1={Y1} x2={X1} y2={Y1} stroke="#9ca3af" />
      {[0, 25, 50, 75, 100].map((p) => (
        <g key={p}>
          <line x1={X0 - 3} x2={X0} y1={yOf(p / 100)} y2={yOf(p / 100)} stroke="#9ca3af" />
          <text x={X0 - 6} y={yOf(p / 100) + 3} fontSize={9} textAnchor="end" fill="#6b7280">{p}</text>
        </g>
      ))}
      {[0, 20, 40, 60, 80, 100, 120].map((p) => (
        <g key={p}>
          <line x1={xOf(p)} x2={xOf(p)} y1={Y1} y2={Y1 + 3} stroke="#9ca3af" />
          <text x={xOf(p)} y={Y1 + 13} fontSize={9} textAnchor="middle" fill="#6b7280">{p}</text>
        </g>
      ))}
      <text x={X0 - 42} y={(Y0 + Y1) / 2} fontSize={9} fill="#6b7280" transform={`rotate(-90 ${X0 - 42} ${(Y0 + Y1) / 2})`}>Hb saturation (%)</text>
      <text x={(X0 + X1) / 2} y={Y1 + 26} fontSize={9} textAnchor="middle" fill="#6b7280">PO2 (mm Hg)</text>

      {/* 50% guide */}
      <line x1={X0} x2={X1} y1={yOf(0.5)} y2={yOf(0.5)} stroke="#9ca3af" strokeDasharray="2 4" />

      {/* reference normal curve (faint) when shifted */}
      {scene > 0 && <path d={curvePath(26)} fill="none" stroke="#1d4ed8" strokeOpacity={0.3} strokeWidth={1.5} strokeDasharray="4 3" />}
      {/* active curve, drawn progressively in scene 0 */}
      <path d={curvePath(p50, max)} fill="none" stroke={color} strokeWidth={2.4} pathLength={1} strokeDasharray={`${drawFrac} 1`} />

      {/* P50 marker */}
      <line x1={xOf(p50)} x2={xOf(p50)} y1={yOf(s50)} y2={Y1} stroke={color} strokeDasharray="3 3" />
      <circle cx={xOf(p50)} cy={yOf(s50)} r={4} fill={color} />
      <text x={xOf(p50) + 6} y={Y1 - 6} fontSize={10} fill={color} fontWeight={600}>P50 ≈ {Math.round(p50)}</text>

      {/* arterial and venous points */}
      {(scene === 0 ? u > 0.85 : true) && (
        <g fontSize={9}>
          <circle cx={xOf(100)} cy={yOf(sArt)} r={3.5} fill="#1f2937" />
          <text x={xOf(100) - 6} y={yOf(sArt) - 8} textAnchor="end" fill="#1f2937">arterial {Math.round(sArt * 100)}%</text>
          <circle cx={xOf(40)} cy={yOf(sVen)} r={3.5} fill="#1f2937" />
          <text x={xOf(40) + 8} y={yOf(sVen) + 4} fill="#1f2937">venous {Math.round(sVen * 100)}%</text>
          {scene >= 1 && (
            <text x={xOf(40) + 8} y={yOf(sVen) + 16} fill={color} fontWeight={600}>
              unloads {Math.round((sArt - sVen) * 100)}% (normal {Math.round((sat(100, 26) - sat(40, 26)) * 100)}%)
            </text>
          )}
        </g>
      )}

      {/* side panel */}
      <g transform="translate(455 50)" fontSize={10}>
        <text x={0} y={0} fontWeight={700} fill={color}>{shiftLabel || "normal curve"}</text>
        {scene === 1 && causesRight.map((c, i) => <text key={c} x={0} y={18 + i * 15} fill="#1f2937">• {c}</text>)}
        {scene === 2 && causesLeft.map((c, i) => <text key={c} x={0} y={18 + i * 15} fill="#1f2937">• {c}</text>)}
        {scene === 0 && (
          <>
            <text x={0} y={18} fill="#1f2937">• sigmoid = cooperativity</text>
            <text x={0} y={33} fill="#1f2937">• flat top: loading is safe</text>
            <text x={0} y={48} fill="#1f2937">• steep middle: unloading</text>
            <text x={0} y={63} fill="#1f2937">• P50 ≈ 26 mm Hg</text>
          </>
        )}
        {scene === 3 && (
          <>
            <text x={0} y={18} fill="#1f2937">• COHb lowers O2 content</text>
            <text x={0} y={33} fill="#1f2937">• remaining curve shifts left</text>
            <text x={0} y={48} fill="#1f2937">• PaO2 and pulse-ox look normal</text>
            <text x={0} y={63} fill="#1f2937">• treat with 100% or hyperbaric O2</text>
          </>
        )}
        {(scene === 1 || scene === 2) && (
          <text x={0} y={100} fill="#6b7280">dashed = normal (P50 26)</text>
        )}
      </g>

      {/* caption */}
      <rect x={16} y={meta.viewBox.height - 46} width={meta.viewBox.width - 32} height={36} rx={6} fill="#0f766e" fillOpacity={0.08} />
      <text x={meta.viewBox.width / 2} y={meta.viewBox.height - 30} fontSize={10.5} textAnchor="middle" fill="#1f2937">{wrap2(meta.captions[scene])[0]}</text>
      <text x={meta.viewBox.width / 2} y={meta.viewBox.height - 17} fontSize={10.5} textAnchor="middle" fill="#1f2937">{wrap2(meta.captions[scene])[1]}</text>
    </svg>
  );
}
