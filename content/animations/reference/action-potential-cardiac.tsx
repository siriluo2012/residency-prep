import React, { useEffect, useRef, useState } from "react";

// Ventricular myocyte action potential: phases 0-4, the ion currents responsible, and the
// Vaughan Williams antiarrhythmic classes that act on each.

export const meta = {
  slug: "action-potential-cardiac",
  title: "Ventricular myocyte action potential",
  durationMs: 12000,
  sceneStartsMs: [0, 2000, 4000, 6500, 9500],
  captions: [
    "Phase 0: fast voltage-gated Na+ channels open; Na+ rushes in and the membrane depolarizes to about +20 mV. Class I drugs slow this upstroke.",
    "Phase 1: Na+ channels inactivate; a transient outward K+ current (Ito) produces the small notch.",
    "Phase 2 plateau: L-type Ca2+ influx balances K+ efflux, holding the membrane near 0 mV. Class IV (Ca2+ blockers) shortens it; Ca2+ entry triggers contraction.",
    "Phase 3: Ca2+ channels close while delayed-rectifier K+ currents (IKr, IKs) repolarize the cell. Class III drugs block these and prolong the QT.",
    "Phase 4: resting potential near -90 mV, set by inward-rectifier K+ (IK1) and the Na+/K+ ATPase. The cell is refractory until Na+ channels recover.",
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
const X0 = 60;
const X1 = 420;
const Y_TOP = 40;
const Y_BOT = 250;
const V_MIN = -100;
const V_MAX = 40;

const clamp = (x: number, a: number, b: number) => Math.max(a, Math.min(b, x));
const lerp = (a: number, b: number, t: number) => a + (b - a) * clamp(t, 0, 1);
const smooth = (t: number) => {
  const x = clamp(t, 0, 1);
  return x * x * (3 - 2 * x);
};

// Phase boundaries as fractions of the plotted AP (one AP spans the full cycle)
const P0 = 0.0;
const P1 = 0.06; // end of upstroke
const P2 = 0.12; // end of notch
const P3 = 0.55; // end of plateau
const P4 = 0.75; // end of repolarization

function vm(f: number): number {
  if (f < P1) return lerp(-90, 25, smooth(f / P1));
  if (f < P2) return lerp(25, 8, smooth((f - P1) / (P2 - P1)));
  if (f < P3) return lerp(8, -5, (f - P2) / (P3 - P2));
  if (f < P4) return lerp(-5, -90, smooth((f - P3) / (P4 - P3)));
  return -90;
}
const yOf = (v: number) => Y_BOT - ((v - V_MIN) / (V_MAX - V_MIN)) * (Y_BOT - Y_TOP);
const xOf = (f: number) => X0 + (X1 - X0) * f;

function tracePath(upto: number, n = 160) {
  let d = "";
  for (let i = 0; i <= n; i++) {
    const f = (i / n) * upto;
    d += `${i ? "L" : "M"}${xOf(f).toFixed(1)},${yOf(vm(f)).toFixed(1)} `;
  }
  return d;
}

// Which phase is active for the scene / cursor
const PHASES = [
  { id: 0, label: "0", from: P0, to: P1, ion: "Na+", dir: "in", color: "#1d4ed8", drug: "Class I (Na+ blockers)" },
  { id: 1, label: "1", from: P1, to: P2, ion: "K+ (Ito)", dir: "out", color: "#d97706", drug: "" },
  { id: 2, label: "2", from: P2, to: P3, ion: "Ca2+ in / K+ out", dir: "both", color: "#0f766e", drug: "Class IV (Ca2+ blockers)" },
  { id: 3, label: "3", from: P3, to: P4, ion: "K+ (IKr, IKs)", dir: "out", color: "#b91c1c", drug: "Class III (K+ blockers)" },
  { id: 4, label: "4", from: P4, to: 1, ion: "K+ (IK1), Na+/K+ ATPase", dir: "rest", color: "#6b7280", drug: "" },
];

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

// Map scene time to cursor fraction so that each scene dwells on its phase
function cursorFraction(t: number): number {
  const s = sceneAt(t);
  const start = meta.sceneStartsMs[s];
  const end = s + 1 < meta.sceneStartsMs.length ? meta.sceneStartsMs[s + 1] : D;
  const u = clamp((t - start) / (end - start), 0, 0.999);
  const ph = PHASES[s];
  return ph.from + (ph.to - ph.from) * u;
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
  const f = cursorFraction(t);
  const ph = PHASES[scene];
  const v = vm(f);
  // ion flow animation phase (0..1) within the scene
  const pulse = ((t % 800) / 800);

  return (
    <svg viewBox={`0 0 ${meta.viewBox.width} ${meta.viewBox.height}`} width={width ?? "100%"} role="img" aria-label={meta.title} style={{ fontFamily: "ui-sans-serif, system-ui, sans-serif" }}>
      {/* axes */}
      <line x1={X0} y1={Y_TOP} x2={X0} y2={Y_BOT} stroke="#9ca3af" />
      <line x1={X0} y1={yOf(0)} x2={X1} y2={yOf(0)} stroke="#9ca3af" strokeDasharray="3 3" />
      {[-90, -50, 0, 25].map((mv) => (
        <g key={mv}>
          <line x1={X0 - 3} x2={X0} y1={yOf(mv)} y2={yOf(mv)} stroke="#9ca3af" />
          <text x={X0 - 6} y={yOf(mv) + 3} fontSize={9} textAnchor="end" fill="#6b7280">{mv}</text>
        </g>
      ))}
      <text x={X0 - 40} y={(Y_TOP + Y_BOT) / 2} fontSize={9} fill="#6b7280" transform={`rotate(-90 ${X0 - 40} ${(Y_TOP + Y_BOT) / 2})`}>Membrane potential (mV)</text>
      <text x={(X0 + X1) / 2} y={Y_BOT + 16} fontSize={9} textAnchor="middle" fill="#6b7280">time (~300 ms)</text>

      {/* phase bands */}
      {PHASES.map((p) => (
        <g key={p.id}>
          <rect x={xOf(p.from)} y={Y_TOP - 12} width={xOf(p.to) - xOf(p.from)} height={Y_BOT - Y_TOP + 12} fill={p.color} opacity={scene === p.id ? 0.12 : 0.03} />
          <text x={(xOf(p.from) + xOf(p.to)) / 2} y={Y_TOP - 16} fontSize={10} textAnchor="middle" fill={p.color} fontWeight={scene === p.id ? 700 : 400}>
            {p.label}
          </text>
        </g>
      ))}

      {/* full faint trace and drawn trace */}
      <path d={tracePath(1)} fill="none" stroke="#1f2937" strokeOpacity={0.12} strokeWidth={1.5} />
      <path d={tracePath(f)} fill="none" stroke="#1f2937" strokeWidth={2.2} />
      <circle cx={xOf(f)} cy={yOf(v)} r={4} fill={ph.color} />
      <text x={xOf(f) + 8} y={yOf(v) - 6} fontSize={10} fill={ph.color} fontWeight={600}>{Math.round(v)} mV</text>

      {/* effective refractory period bar */}
      <rect x={xOf(P0)} y={Y_BOT + 24} width={xOf(0.68) - xOf(P0)} height={6} fill="#9ca3af" opacity={0.6} />
      <text x={xOf(0.34)} y={Y_BOT + 42} fontSize={9} textAnchor="middle" fill="#6b7280">effective refractory period</text>

      {/* membrane schematic */}
      <g transform="translate(470 60)">
        <text x={60} y={-14} fontSize={10} textAnchor="middle" fill="#6b7280">Membrane</text>
        <text x={60} y={2} fontSize={9} textAnchor="middle" fill="#9ca3af">outside</text>
        <rect x={0} y={60} width={120} height={16} fill="#e5e7eb" stroke="#9ca3af" />
        <text x={60} y={150} fontSize={9} textAnchor="middle" fill="#9ca3af">inside</text>
        {/* channel */}
        <rect x={50} y={54} width={20} height={28} rx={3} fill="#ffffff" stroke={ph.color} strokeWidth={2} />
        <text x={60} y={100} fontSize={10} textAnchor="middle" fill={ph.color} fontWeight={600}>{ph.ion}</text>
        {/* ion dots */}
        {ph.dir === "in" || ph.dir === "both" ? (
          <circle cx={60} cy={lerp(20, 130, pulse)} r={5} fill={ph.dir === "both" ? "#0f766e" : "#1d4ed8"} />
        ) : null}
        {ph.dir === "out" || ph.dir === "both" ? (
          <circle cx={ph.dir === "both" ? 95 : 60} cy={lerp(130, 20, pulse)} r={5} fill={ph.dir === "both" ? "#d97706" : ph.color} />
        ) : null}
        {ph.dir === "both" && <rect x={85} y={54} width={20} height={28} rx={3} fill="#ffffff" stroke="#d97706" strokeWidth={2} />}
        {ph.dir === "rest" && (
          <>
            <text x={60} y={30} fontSize={9} textAnchor="middle" fill="#6b7280">3 Na+ out</text>
            <text x={60} y={128} fontSize={9} textAnchor="middle" fill="#6b7280">2 K+ in</text>
          </>
        )}
        {ph.drug && (
          <text x={60} y={170} fontSize={10} textAnchor="middle" fill="#b91c1c" fontWeight={600}>{ph.drug}</text>
        )}
      </g>

      {/* caption */}
      <rect x={16} y={meta.viewBox.height - 46} width={meta.viewBox.width - 32} height={36} rx={6} fill="#0f766e" fillOpacity={0.08} />
      <text x={meta.viewBox.width / 2} y={meta.viewBox.height - 30} fontSize={10.5} textAnchor="middle" fill="#1f2937">{wrap2(meta.captions[scene])[0]}</text>
      <text x={meta.viewBox.width / 2} y={meta.viewBox.height - 17} fontSize={10.5} textAnchor="middle" fill="#1f2937">{wrap2(meta.captions[scene])[1]}</text>
    </svg>
  );
}
