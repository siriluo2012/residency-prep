import React, { useEffect, useRef, useState } from "react";

// Moving a diagnostic cutoff: two overlapping distributions (healthy vs diseased), the resulting
// TP/FP/TN/FN regions, sensitivity and specificity, and the ROC curve traced out by the threshold.

export const meta = {
  slug: "sensitivity-specificity-cutoff",
  title: "Moving the test cutoff: sensitivity vs specificity",
  durationMs: 12000,
  sceneStartsMs: [0, 3000, 6000, 9000],
  captions: [
    "Test values overlap between healthy (blue) and diseased (red) people. A cutoff splits each group into true/false positives and negatives.",
    "Lowering the cutoff catches more disease (sensitivity rises, fewer false negatives) at the cost of more false positives (specificity falls). Use for screening and rule-out.",
    "Raising the cutoff does the opposite: specificity rises, sensitivity falls. Use for confirmation and rule-in. Sensitivity and specificity do not depend on prevalence.",
    "Sweeping the cutoff traces the ROC curve (sensitivity vs 1 - specificity). Area under the curve summarizes discrimination; 0.5 is chance, 1.0 is perfect.",
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
const clamp = (x: number, a: number, b: number) => Math.max(a, Math.min(b, x));
const lerp = (a: number, b: number, t: number) => a + (b - a) * clamp(t, 0, 1);
const smooth = (t: number) => {
  const x = clamp(t, 0, 1);
  return x * x * (3 - 2 * x);
};

// Distributions on an arbitrary test-value axis 0..100
const MU_H = 40;
const MU_D = 62;
const SD = 9;
const X0 = 50;
const X1 = 360;
const Y_BASE = 230;
const H = 150;
const pdf = (x: number, mu: number) => Math.exp(-0.5 * ((x - mu) / SD) ** 2);
// standard normal CDF approximation
function cdf(z: number) {
  const s = z < 0 ? -1 : 1;
  const a = Math.abs(z) / Math.SQRT2;
  const tt = 1 / (1 + 0.3275911 * a);
  const y = 1 - ((((1.061405429 * tt - 1.453152027) * tt + 1.421413741) * tt - 0.284496736) * tt + 0.254829592) * tt * Math.exp(-a * a);
  return 0.5 * (1 + s * y);
}
const xOf = (v: number) => X0 + ((X1 - X0) * v) / 100;
const yOf = (p: number) => Y_BASE - H * p;

function areaPath(mu: number, from: number, to: number) {
  if (to <= from) return "";
  let d = `M${xOf(from).toFixed(1)},${Y_BASE} `;
  for (let i = 0; i <= 40; i++) {
    const v = from + ((to - from) * i) / 40;
    d += `L${xOf(v).toFixed(1)},${yOf(pdf(v, mu)).toFixed(1)} `;
  }
  return d + `L${xOf(to).toFixed(1)},${Y_BASE} Z`;
}
function curvePath(mu: number) {
  let d = "";
  for (let i = 0; i <= 100; i++) d += `${i ? "L" : "M"}${xOf(i).toFixed(1)},${yOf(pdf(i, mu)).toFixed(1)} `;
  return d;
}

// ROC panel
const RX0 = 430;
const RY0 = 60;
const RS = 150;
const sensAt = (c: number) => 1 - cdf((c - MU_D) / SD);
const specAt = (c: number) => cdf((c - MU_H) / SD);
function rocPath(upToCut: number) {
  // cutoff from high (sens 0, 1-spec 0) to low
  let d = "";
  for (let i = 0; i <= 100; i++) {
    const c = 100 - i;
    if (c < upToCut) break;
    const x = RX0 + RS * (1 - specAt(c));
    const y = RY0 + RS * (1 - sensAt(c));
    d += `${i ? "L" : "M"}${x.toFixed(1)},${y.toFixed(1)} `;
  }
  return d;
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
function wrap2(s: string, max = 105): [string, string] {
  if (s.length <= max) return [s, ""];
  const cut = s.lastIndexOf(" ", max);
  const i = cut > 40 ? cut : max;
  return [s.slice(0, i), s.slice(i + 1, i + 1 + max + 25)];
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
  const MID = (MU_H + MU_D) / 2;
  let cut = MID;
  if (scene === 1) cut = lerp(MID, MID - 12, u);
  else if (scene === 2) cut = lerp(MID - 12, MID + 14, u);
  else if (scene === 3) cut = lerp(90, 10, u);
  const sens = sensAt(cut);
  const spec = specAt(cut);
  const showRoc = scene === 3;

  return (
    <svg viewBox={`0 0 ${meta.viewBox.width} ${meta.viewBox.height}`} width={width ?? "100%"} role="img" aria-label={meta.title} style={{ fontFamily: "ui-sans-serif, system-ui, sans-serif" }}>
      {/* distributions */}
      <line x1={X0} y1={Y_BASE} x2={X1} y2={Y_BASE} stroke="#9ca3af" />
      <text x={(X0 + X1) / 2} y={Y_BASE + 16} fontSize={9} textAnchor="middle" fill="#6b7280">test value →</text>
      {/* regions */}
      <path d={areaPath(MU_H, 0, cut)} fill="#1d4ed8" fillOpacity={0.18} />
      <path d={areaPath(MU_H, cut, 100)} fill="#1d4ed8" fillOpacity={0.45} />
      <path d={areaPath(MU_D, cut, 100)} fill="#b91c1c" fillOpacity={0.18} />
      <path d={areaPath(MU_D, 0, cut)} fill="#b91c1c" fillOpacity={0.45} />
      <path d={curvePath(MU_H)} fill="none" stroke="#1d4ed8" strokeWidth={2} />
      <path d={curvePath(MU_D)} fill="none" stroke="#b91c1c" strokeWidth={2} />
      <text x={xOf(MU_H)} y={yOf(1) - 8} fontSize={10} textAnchor="middle" fill="#1d4ed8" fontWeight={600}>healthy</text>
      <text x={xOf(MU_D)} y={yOf(1) - 8} fontSize={10} textAnchor="middle" fill="#b91c1c" fontWeight={600}>diseased</text>
      {/* cutoff */}
      <line x1={xOf(cut)} x2={xOf(cut)} y1={yOf(1) - 20} y2={Y_BASE} stroke="#1f2937" strokeWidth={2} />
      <text x={xOf(cut)} y={yOf(1) - 24} fontSize={10} textAnchor="middle" fill="#1f2937" fontWeight={700}>cutoff</text>
      <text x={xOf(cut) - 6} y={Y_BASE - 6} fontSize={9} textAnchor="end" fill="#1f2937">negative ←</text>
      <text x={xOf(cut) + 6} y={Y_BASE - 6} fontSize={9} fill="#1f2937">→ positive</text>
      {/* region labels */}
      <text x={xOf(MU_H) - 22} y={Y_BASE - 40} fontSize={10} fill="#1d4ed8">TN</text>
      <text x={xOf(cut) + 10} y={Y_BASE - 20} fontSize={10} fill="#1d4ed8" fontWeight={700}>FP</text>
      <text x={xOf(MU_D) + 14} y={Y_BASE - 40} fontSize={10} fill="#b91c1c">TP</text>
      <text x={xOf(cut) - 24} y={Y_BASE - 20} fontSize={10} fill="#b91c1c" fontWeight={700}>FN</text>

      {/* metrics */}
      <g transform="translate(50 255)" fontSize={11}>
        <text x={0} y={0} fill="#b91c1c" fontWeight={700}>Sensitivity = TP / (TP + FN) = {Math.round(sens * 100)}%</text>
        <text x={0} y={18} fill="#1d4ed8" fontWeight={700}>Specificity = TN / (TN + FP) = {Math.round(spec * 100)}%</text>
        <rect x={0} y={28} width={300 * sens} height={6} fill="#b91c1c" opacity={0.7} />
        <rect x={0} y={37} width={300 * spec} height={6} fill="#1d4ed8" opacity={0.7} />
      </g>

      {/* ROC panel */}
      <g opacity={showRoc ? 1 : 0.25}>
        <rect x={RX0} y={RY0} width={RS} height={RS} fill="none" stroke="#9ca3af" />
        <line x1={RX0} y1={RY0 + RS} x2={RX0 + RS} y2={RY0} stroke="#9ca3af" strokeDasharray="3 3" />
        <text x={RX0 + RS / 2} y={RY0 + RS + 14} fontSize={9} textAnchor="middle" fill="#6b7280">1 - specificity (FPR)</text>
        <text x={RX0 - 8} y={RY0 + RS / 2} fontSize={9} textAnchor="middle" fill="#6b7280" transform={`rotate(-90 ${RX0 - 8} ${RY0 + RS / 2})`}>sensitivity (TPR)</text>
        <text x={RX0 + RS / 2} y={RY0 - 8} fontSize={10} textAnchor="middle" fill="#1f2937" fontWeight={600}>ROC curve</text>
        <path d={rocPath(showRoc ? cut : 101)} fill="none" stroke="#0f766e" strokeWidth={2.2} />
        <path d={rocPath(-1)} fill="none" stroke="#0f766e" strokeOpacity={0.15} strokeWidth={1.5} />
        <circle cx={RX0 + RS * (1 - spec)} cy={RY0 + RS * (1 - sens)} r={4} fill="#1f2937" />
        {showRoc && <text x={RX0 + 8} y={RY0 + RS - 8} fontSize={9} fill="#0f766e">AUC ≈ {(cdf((MU_D - MU_H) / (SD * Math.SQRT2))).toFixed(2)}</text>}
      </g>

      {/* caption */}
      <rect x={16} y={meta.viewBox.height - 46} width={meta.viewBox.width - 32} height={36} rx={6} fill="#0f766e" fillOpacity={0.08} />
      <text x={meta.viewBox.width / 2} y={meta.viewBox.height - 30} fontSize={10.5} textAnchor="middle" fill="#1f2937">{wrap2(meta.captions[scene])[0]}</text>
      <text x={meta.viewBox.width / 2} y={meta.viewBox.height - 17} fontSize={10.5} textAnchor="middle" fill="#1f2937">{wrap2(meta.captions[scene])[1]}</text>
    </svg>
  );
}
