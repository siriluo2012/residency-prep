import React, { useEffect, useRef, useState } from "react";

// Filtrate along the nephron: transporters per segment and the diuretic that blocks each.

export const meta = {
  slug: "nephron-segment-handling",
  title: "Nephron: where sodium, water, and solutes are handled",
  durationMs: 16000,
  sceneStartsMs: [0, 4000, 8000, 12000],
  captions: [
    "Proximal tubule reabsorbs ~65% of filtered Na+ and water isosmotically (SGLT2, NHE3, carbonic anhydrase). Acetazolamide acts here. Glucose, amino acids and bicarbonate are largely reclaimed.",
    "Loop of Henle: thin descending limb is water-permeable; thick ascending limb is water-impermeable and reabsorbs Na/K/2Cl via NKCC2. Loop diuretics (furosemide) block NKCC2 — the 'diluting segment'.",
    "Distal convoluted tubule: NCC (Na-Cl cotransporter) reabsorbs ~5–10% of Na+. Thiazides block NCC. This is also where PTH-regulated calcium reabsorption occurs.",
    "Collecting duct: principal cells use ENaC (blocked by amiloride; aldosterone increases ENaC) and AQP2 water channels (ADH). Intercalated cells secrete H+. Spironolactone antagonises aldosterone.",
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

type Seg = { id: string; label: string; d: string; drug: string; transporter: string };
const SEGS: Seg[] = [
  { id: "PT", label: "Proximal tubule", d: "M 180 60 C 240 40, 300 40, 340 80", drug: "acetazolamide", transporter: "NHE3 / CA / SGLT2" },
  { id: "Loop", label: "Loop of Henle", d: "M 340 80 L 340 200 C 340 250, 250 260, 250 200 L 250 90", drug: "furosemide (NKCC2)", transporter: "NKCC2 (TAL)" },
  { id: "DCT", label: "Distal tubule", d: "M 250 90 C 250 50, 200 40, 160 70", drug: "thiazide (NCC)", transporter: "NCC" },
  { id: "CD", label: "Collecting duct", d: "M 160 70 L 160 250", drug: "spironolactone / amiloride", transporter: "ENaC + AQP2" },
];

function sceneAt(t: number) {
  let i = 0;
  for (let k = 0; k < meta.sceneStartsMs.length; k++) if (t >= meta.sceneStartsMs[k]) i = k;
  return i;
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
  const cap = wrap2(meta.captions[scene]);
  const pulse = (t % 900) / 900;

  return (
    <svg viewBox={`0 0 ${meta.viewBox.width} ${meta.viewBox.height}`} width={width ?? "100%"} role="img" aria-label={meta.title} style={{ fontFamily: "ui-sans-serif, system-ui, sans-serif" }}>
      <ellipse cx={250} cy={140} rx={160} ry={110} fill="#fef3c7" stroke="#d97706" strokeOpacity={0.4} />
      <text x={250} y={36} fontSize={11} textAnchor="middle" fill="#92400e">Cortex</text>
      <text x={250} y={248} fontSize={11} textAnchor="middle" fill="#9a3412">Medulla</text>

      <circle cx={175} cy={62} r={16} fill="#fee2e2" stroke="#b91c1c" />
      <text x={175} y={66} fontSize={9} textAnchor="middle" fill="#7f1d1d">glom.</text>

      {SEGS.map((s, i) => (
        <path key={s.id} d={s.d} fill="none" stroke={scene === i ? "#1d4ed8" : "#6b7280"} strokeWidth={scene === i ? 6 : 3} strokeLinecap="round" opacity={scene === i ? 1 : 0.45} />
      ))}

      <circle cx={180 + pulse * 160} cy={60} r={4} fill="#1d4ed8" opacity={scene === 0 ? 1 : 0} />

      <g transform="translate(430 48)">
        {SEGS.map((s, i) => (
          <g key={s.id} transform={`translate(0 ${i * 58})`}>
            <rect x={0} y={0} width={190} height={52} rx={6} fill={scene === i ? "#dbeafe" : "#f3f4f6"} stroke={scene === i ? "#1d4ed8" : "#e5e7eb"} />
            <text x={10} y={18} fontSize={12} fontWeight={600} fill="#111827">{s.label}</text>
            <text x={10} y={34} fontSize={10} fill="#1d4ed8">{s.transporter}</text>
            <text x={10} y={46} fontSize={10} fill="#6b7280">blocked by {s.drug}</text>
          </g>
        ))}
      </g>

      <rect x={16} y={300} width={608} height={48} rx={6} fill="#f3f4f6" />
      <text x={28} y={320} fontSize={11} fill="#111827">{cap[0]}</text>
      {cap[1] ? <text x={28} y={336} fontSize={11} fill="#111827">{cap[1]}</text> : null}
    </svg>
  );
}
