import React, { useEffect, useRef, useState } from "react";

// Coagulation cascade: extrinsic, intrinsic and common pathways, which lab test measures which arm,
// and where warfarin, heparin and the direct oral anticoagulants act.

export const meta = {
  slug: "coagulation-cascade",
  title: "Coagulation cascade: intrinsic, extrinsic, common pathways",
  durationMs: 14000,
  sceneStartsMs: [0, 3500, 7000, 10500],
  captions: [
    "Extrinsic pathway: vessel injury exposes tissue factor, which binds factor VIIa. TF-VIIa activates X (and some IX). Measured by the PT / INR.",
    "Intrinsic pathway: contact activation of XII leads to XIa, then IXa, which with its cofactor VIIIa activates X. Measured by the aPTT.",
    "Common pathway: Xa with Va converts prothrombin (II) to thrombin (IIa); thrombin cleaves fibrinogen (I) to fibrin, and XIIIa cross-links the clot.",
    "Drug targets: warfarin blocks synthesis of II, VII, IX, X (PT rises first because VII is shortest-lived); heparin potentiates antithrombin against IIa and Xa; DOACs inhibit Xa (rivaroxaban, apixaban) or IIa (dabigatran).",
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

type Node = { id: string; label: string; x: number; y: number; arm: "ext" | "int" | "common"; order: number };
const NODES: Node[] = [
  // intrinsic (left column)
  { id: "XII", label: "XII → XIIa", x: 90, y: 50, arm: "int", order: 0 },
  { id: "XI", label: "XI → XIa", x: 90, y: 95, arm: "int", order: 1 },
  { id: "IX", label: "IX → IXa", x: 90, y: 140, arm: "int", order: 2 },
  { id: "VIII", label: "+ VIIIa", x: 170, y: 160, arm: "int", order: 3 },
  // extrinsic (right column)
  { id: "TF", label: "Tissue factor", x: 420, y: 50, arm: "ext", order: 0 },
  { id: "VII", label: "VII → VIIa", x: 420, y: 95, arm: "ext", order: 1 },
  // common (center)
  { id: "X", label: "X → Xa", x: 255, y: 185, arm: "common", order: 0 },
  { id: "V", label: "+ Va", x: 335, y: 205, arm: "common", order: 1 },
  { id: "II", label: "Prothrombin (II) → Thrombin (IIa)", x: 255, y: 235, arm: "common", order: 2 },
  { id: "I", label: "Fibrinogen (I) → Fibrin", x: 255, y: 280, arm: "common", order: 3 },
  { id: "XIII", label: "XIIIa cross-links", x: 420, y: 280, arm: "common", order: 4 },
];
type Edge = { from: string; to: string; arm: "ext" | "int" | "common"; order: number };
const EDGES: Edge[] = [
  { from: "XII", to: "XI", arm: "int", order: 1 },
  { from: "XI", to: "IX", arm: "int", order: 2 },
  { from: "IX", to: "X", arm: "int", order: 3 },
  { from: "TF", to: "VII", arm: "ext", order: 1 },
  { from: "VII", to: "X", arm: "ext", order: 2 },
  { from: "X", to: "II", arm: "common", order: 1 },
  { from: "II", to: "I", arm: "common", order: 2 },
  { from: "I", to: "XIII", arm: "common", order: 3 },
];
const COLOR = { ext: "#b91c1c", int: "#1d4ed8", common: "#0f766e" } as const;
const ARM_FOR_SCENE: ("ext" | "int" | "common")[] = ["ext", "int", "common"];

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
const byId = (id: string) => NODES.find((n) => n.id === id)!;

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
  const drugs = scene === 3;
  const activeArm = drugs ? null : ARM_FOR_SCENE[scene];
  // arms completed in earlier scenes stay lit
  const armDone = (arm: "ext" | "int" | "common") => drugs || ARM_FOR_SCENE.indexOf(arm) < scene;
  const maxOrder = (arm: "ext" | "int" | "common") => Math.max(...NODES.filter((n) => n.arm === arm).map((n) => n.order));

  const nodeOn = (n: Node) => armDone(n.arm) || (activeArm === n.arm && u * (maxOrder(n.arm) + 1.2) >= n.order);
  const edgeFrac = (e: Edge) => {
    if (armDone(e.arm)) return 1;
    if (activeArm !== e.arm) return 0;
    const start = (e.order - 0.5) / (maxOrder(e.arm) + 1.2);
    const end = e.order / (maxOrder(e.arm) + 1.2);
    return clamp((u - start) / (end - start), 0, 1);
  };

  return (
    <svg viewBox={`0 0 ${meta.viewBox.width} ${meta.viewBox.height}`} width={width ?? "100%"} role="img" aria-label={meta.title} style={{ fontFamily: "ui-sans-serif, system-ui, sans-serif" }}>
      {/* pathway labels and lab tests */}
      <text x={90} y={28} fontSize={11} textAnchor="middle" fontWeight={700} fill={COLOR.int} opacity={nodeOn(byId("XII")) ? 1 : 0.35}>Intrinsic · aPTT</text>
      <text x={420} y={28} fontSize={11} textAnchor="middle" fontWeight={700} fill={COLOR.ext} opacity={nodeOn(byId("TF")) ? 1 : 0.35}>Extrinsic · PT / INR</text>
      <text x={255} y={170} fontSize={11} textAnchor="middle" fontWeight={700} fill={COLOR.common} opacity={nodeOn(byId("X")) ? 1 : 0.35}>Common · PT and aPTT</text>

      {/* edges */}
      {EDGES.map((e) => {
        const a = byId(e.from);
        const b = byId(e.to);
        const f = edgeFrac(e);
        const x2 = a.x + (b.x - a.x) * f;
        const y2 = a.y + 10 + (b.y - 10 - (a.y + 10)) * f;
        return (
          <g key={`${e.from}-${e.to}`}>
            <line x1={a.x} y1={a.y + 10} x2={b.x} y2={b.y - 10} stroke="#9ca3af" strokeOpacity={0.3} />
            {f > 0 && <line x1={a.x} y1={a.y + 10} x2={x2} y2={y2} stroke={COLOR[e.arm]} strokeWidth={2.5} />}
            {f >= 1 && <polygon points={`${b.x},${b.y - 10} ${b.x - 4},${b.y - 17} ${b.x + 4},${b.y - 17}`} fill={COLOR[e.arm]} />}
          </g>
        );
      })}
      {/* cofactor connectors */}
      <line x1={170} y1={160} x2={110} y2={150} stroke={COLOR.int} strokeOpacity={nodeOn(byId("VIII")) ? 0.8 : 0.15} strokeDasharray="3 3" />
      <line x1={335} y1={205} x2={275} y2={190} stroke={COLOR.common} strokeOpacity={nodeOn(byId("V")) ? 0.8 : 0.15} strokeDasharray="3 3" />

      {/* nodes */}
      {NODES.map((n) => {
        const on = nodeOn(n);
        const w = n.label.length * 5.6 + 16;
        return (
          <g key={n.id} transform={`translate(${n.x} ${n.y})`}>
            <rect x={-w / 2} y={-11} width={w} height={22} rx={5} fill={on ? COLOR[n.arm] : "#f3f4f6"} fillOpacity={on ? 0.15 : 1} stroke={on ? COLOR[n.arm] : "#d1d5db"} strokeWidth={on ? 2 : 1} />
            <text x={0} y={4} fontSize={10} textAnchor="middle" fill={on ? "#1f2937" : "#9ca3af"} fontWeight={on ? 600 : 400}>{n.label}</text>
          </g>
        );
      })}

      {/* drug overlays */}
      {drugs && (
        <g fontSize={10} fontWeight={600}>
          {/* warfarin: II, VII, IX, X */}
          {["II", "VII", "IX", "X"].map((id) => {
            const n = byId(id);
            return <circle key={id} cx={n.x - n.label.length * 2.8 - 14} cy={n.y} r={6} fill="#7c3aed" opacity={0.9} />;
          })}
          <circle cx={520} cy={120} r={6} fill="#7c3aed" /><text x={532} y={124} fill="#1f2937">Warfarin: ↓ II, VII, IX, X (vit K)</text>
          {/* heparin / antithrombin: IIa and Xa */}
          <rect x={byId("X").x + 34} y={byId("X").y - 6} width={12} height={12} fill="#d97706" />
          <rect x={byId("II").x + 98} y={byId("II").y - 6} width={12} height={12} fill="#d97706" />
          <rect x={514} y={144} width={12} height={12} fill="#d97706" /><text x={532} y={154} fill="#1f2937">Heparin via antithrombin: IIa, Xa</text>
          {/* DOACs */}
          <polygon points={`${byId("X").x + 56},${byId("X").y - 7} ${byId("X").x + 63},${byId("X").y + 6} ${byId("X").x + 49},${byId("X").y + 6}`} fill="#0f766e" />
          <polygon points={`${byId("II").x + 120},${byId("II").y - 7} ${byId("II").x + 127},${byId("II").y + 6} ${byId("II").x + 113},${byId("II").y + 6}`} fill="#0f766e" />
          <polygon points="520,174 527,187 513,187" fill="#0f766e" /><text x={532} y={184} fill="#1f2937">DOACs: Xa (-xabans), IIa (dabigatran)</text>
          <text x={520} y={214} fontSize={9} fill="#6b7280" fontWeight={400}>LMWH favours Xa; protamine reverses heparin</text>
        </g>
      )}

      {/* caption */}
      <rect x={16} y={meta.viewBox.height - 46} width={meta.viewBox.width - 32} height={36} rx={6} fill="#0f766e" fillOpacity={0.08} />
      <text x={meta.viewBox.width / 2} y={meta.viewBox.height - 30} fontSize={10.5} textAnchor="middle" fill="#1f2937">{wrap2(meta.captions[scene])[0]}</text>
      <text x={meta.viewBox.width / 2} y={meta.viewBox.height - 17} fontSize={10.5} textAnchor="middle" fill="#1f2937">{wrap2(meta.captions[scene])[1]}</text>
    </svg>
  );
}
