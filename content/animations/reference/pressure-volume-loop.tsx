import React, { useEffect, useRef, useState } from "react";

// Left-ventricular PV loop: baseline EDV/ESV/SV, then preload, afterload and contractility.

export const meta = {
  slug: "pressure-volume-loop",
  title: "Left ventricular pressure-volume loop",
  durationMs: 14000,
  sceneStartsMs: [0, 3500, 7000, 10500],
  captions: [
    "Trace the loop counter-clockwise: filling (bottom), isovolumetric contraction (right), ejection (top), isovolumetric relaxation (left). Width is stroke volume (EDV − ESV).",
    "Increased preload: the loop widens to the right. EDV rises, stroke volume rises (Frank–Starling) if afterload and contractility are unchanged.",
    "Increased afterload: the loop grows taller and narrower. ESV rises, stroke volume falls. Hypertension is the clinical example.",
    "Increased contractility: the end-systolic pressure–volume relationship (ESPVR) steepens, ESV falls, stroke volume rises. Inotropes and exercise.",
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
const VMAX = 180;
const PMAX = 160;

const clamp = (x: number, a: number, b: number) => Math.max(a, Math.min(b, x));
const lerp = (a: number, b: number, t: number) => a + (b - a) * clamp(t, 0, 1);
const smooth = (t: number) => {
  const x = clamp(t, 0, 1);
  return x * x * (3 - 2 * x);
};

type Loop = { edv: number; esv: number; peak: number; fill: number };
const BASE: Loop = { edv: 120, esv: 50, peak: 120, fill: 8 };
const PRELOAD: Loop = { edv: 150, esv: 52, peak: 125, fill: 8 };
const AFTERLOAD: Loop = { edv: 120, esv: 78, peak: 155, fill: 10 };
const INO: Loop = { edv: 120, esv: 28, peak: 140, fill: 7 };

const SCENES: { loop: Loop; label: string; color: string }[] = [
  { loop: BASE, label: "Baseline", color: "#1d4ed8" },
  { loop: PRELOAD, label: "↑ Preload", color: "#0f766e" },
  { loop: AFTERLOAD, label: "↑ Afterload", color: "#b45309" },
  { loop: INO, label: "↑ Contractility", color: "#7c3aed" },
];

const xOf = (v: number) => X0 + (X1 - X0) * (v / VMAX);
const yOf = (p: number) => Y1 - (Y1 - Y0) * (p / PMAX);

function corners(L: Loop): [number, number][] {
  // counter-clockwise from SW: mitral open (EDV, fill) wait — standard:
  // 1. bottom-left ESV, fill  2. bottom-right EDV, fill  3. top-right EDV, peak  4. top-left ESV, peak
  return [
    [L.esv, L.fill],
    [L.edv, L.fill],
    [L.edv, L.peak],
    [L.esv, L.peak],
  ];
}

function pathOf(L: Loop) {
  const c = corners(L);
  return `M${xOf(c[0][0])},${yOf(c[0][1])} L${xOf(c[1][0])},${yOf(c[1][1])} L${xOf(c[2][0])},${yOf(c[2][1])} L${xOf(c[3][0])},${yOf(c[3][1])} Z`;
}

function interpLoop(a: Loop, b: Loop, t: number): Loop {
  const u = smooth(t);
  return {
    edv: lerp(a.edv, b.edv, u),
    esv: lerp(a.esv, b.esv, u),
    peak: lerp(a.peak, b.peak, u),
    fill: lerp(a.fill, b.fill, u),
  };
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
  return [s.slice(0, i), s.slice(i + 1, i + 1 + max + 20)];
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
  const u = sceneProgress(t);
  const from = scene === 0 ? BASE : SCENES[scene - 1].loop;
  const to = SCENES[scene].loop;
  const L = interpLoop(from, to, scene === 0 ? 1 : u);
  const sv = L.edv - L.esv;
  const color = SCENES[scene].color;
  const cap = wrap2(meta.captions[scene]);
  const c = corners(L);
  const cursorI = Math.min(3, Math.floor(u * 4));
  const cursor = c[cursorI];

  return (
    <svg viewBox={`0 0 ${meta.viewBox.width} ${meta.viewBox.height}`} width={width ?? "100%"} role="img" aria-label={meta.title} style={{ fontFamily: "ui-sans-serif, system-ui, sans-serif" }}>
      <line x1={X0} y1={Y0} x2={X0} y2={Y1} stroke="#9ca3af" />
      <line x1={X0} y1={Y1} x2={X1} y2={Y1} stroke="#9ca3af" />
      <text x={X0 - 36} y={(Y0 + Y1) / 2} fontSize={9} fill="#6b7280" transform={`rotate(-90 ${X0 - 36} ${(Y0 + Y1) / 2})`}>LV pressure (mm Hg)</text>
      <text x={(X0 + X1) / 2} y={Y1 + 18} fontSize={9} textAnchor="middle" fill="#6b7280">LV volume (mL)</text>
      {[0, 50, 100, 150].map((v) => (
        <g key={v}>
          <line x1={xOf(v)} y1={Y1} x2={xOf(v)} y2={Y1 + 4} stroke="#9ca3af" />
          <text x={xOf(v)} y={Y1 + 14} fontSize={8} textAnchor="middle" fill="#6b7280">{v}</text>
        </g>
      ))}

      <path d={pathOf(BASE)} fill="none" stroke="#1f2937" strokeOpacity={0.15} strokeWidth={1.5} />
      <path d={pathOf(L)} fill={color} fillOpacity={0.08} stroke={color} strokeWidth={2.4} />
      <circle cx={xOf(cursor[0])} cy={yOf(cursor[1])} r={5} fill={color} />

      <text x={xOf(L.edv) + 6} y={yOf(L.fill) + 12} fontSize={10} fill={color}>EDV {Math.round(L.edv)}</text>
      <text x={xOf(L.esv) - 6} y={yOf(L.fill) + 12} fontSize={10} fill={color} textAnchor="end">ESV {Math.round(L.esv)}</text>
      <text x={xOf((L.edv + L.esv) / 2)} y={yOf(L.peak) - 8} fontSize={10} fill={color} textAnchor="middle">SV {Math.round(sv)} mL</text>

      <g transform="translate(460 50)">
        {SCENES.map((s, i) => (
          <g key={s.label} transform={`translate(0 ${i * 28})`}>
            <rect x={0} y={0} width={150} height={22} rx={4} fill={s.color} opacity={scene === i ? 0.18 : 0.05} />
            <circle cx={12} cy={11} r={5} fill={s.color} />
            <text x={24} y={15} fontSize={11} fill="#111827" fontWeight={scene === i ? 700 : 400}>{s.label}</text>
          </g>
        ))}
      </g>

      <rect x={16} y={300} width={608} height={48} rx={6} fill="#f3f4f6" />
      <text x={28} y={320} fontSize={11} fill="#111827">{cap[0]}</text>
      {cap[1] ? <text x={28} y={336} fontSize={11} fill="#111827">{cap[1]}</text> : null}
    </svg>
  );
}
