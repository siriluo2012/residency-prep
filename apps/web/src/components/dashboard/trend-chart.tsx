/** Tiny dependency-free SVG line chart of block accuracy over time. */
export function TrendChart({ points }: { points: { label: string; value: number | null; mode: string }[] }) {
  const pts = points.filter((p) => p.value != null) as { label: string; value: number; mode: string }[];
  if (pts.length < 2) return <p className="text-sm text-muted-foreground">Complete two or more blocks to see a trend.</p>;
  const w = 320;
  const h = 120;
  const pad = 20;
  const x = (i: number) => pad + (i / (pts.length - 1)) * (w - 2 * pad);
  const y = (v: number) => h - pad - v * (h - 2 * pad);
  const d = pts.map((p, i) => `${i ? "L" : "M"}${x(i).toFixed(1)},${y(p.value).toFixed(1)}`).join(" ");
  // simple moving average over last 3
  const ma = pts.map((_, i) => pts.slice(Math.max(0, i - 2), i + 1).reduce((s, p) => s + p.value, 0) / Math.min(3, i + 1));
  const dma = ma.map((v, i) => `${i ? "L" : "M"}${x(i).toFixed(1)},${y(v).toFixed(1)}`).join(" ");
  return (
    <svg viewBox={`0 0 ${w} ${h}`} className="w-full h-auto" role="img" aria-label="Accuracy per block">
      {[0.5, 0.7, 0.9].map((g) => (
        <g key={g}>
          <line x1={pad} x2={w - pad} y1={y(g)} y2={y(g)} stroke="currentColor" strokeOpacity={0.15} strokeDasharray="2 3" />
          <text x={2} y={y(g) + 3} fontSize={8} fill="currentColor" fillOpacity={0.5}>{Math.round(g * 100)}%</text>
        </g>
      ))}
      <path d={dma} fill="none" stroke="currentColor" strokeOpacity={0.3} strokeWidth={2} />
      <path d={d} fill="none" stroke="var(--primary)" strokeWidth={2} />
      {pts.map((p, i) => (
        <circle key={i} cx={x(i)} cy={y(p.value)} r={3} fill={p.mode === "timed" ? "var(--primary)" : "var(--card)"} stroke="var(--primary)" strokeWidth={1.5}>
          <title>{p.label}: {Math.round(p.value * 100)}% ({p.mode})</title>
        </circle>
      ))}
      <text x={pad} y={h - 4} fontSize={8} fill="currentColor" fillOpacity={0.6}>{pts[0].label}</text>
      <text x={w - pad} y={h - 4} fontSize={8} textAnchor="end" fill="currentColor" fillOpacity={0.6}>{pts[pts.length - 1].label}</text>
    </svg>
  );
}
