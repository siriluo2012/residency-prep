"use client";
import { useState } from "react";
import { LAB_VALUES } from "@/lib/lab-values";

export function LabValuesPanel() {
  const [filter, setFilter] = useState("");
  const f = filter.toLowerCase();
  return (
    <div className="rounded bg-white text-black p-2 max-h-[60vh] overflow-auto text-xs">
      <input
        placeholder="Filter…"
        value={filter}
        onChange={(e) => setFilter(e.target.value)}
        className="w-full mb-2 rounded border border-border px-2 py-1"
      />
      {LAB_VALUES.map((g) => {
        const rows = g.rows.filter(([k]) => !f || k.toLowerCase().includes(f));
        if (!rows.length) return null;
        return (
          <div key={g.group} className="mb-2">
            <div className="font-semibold text-[11px] uppercase tracking-wide text-muted-foreground">{g.group}</div>
            <table className="w-full">
              <tbody>
                {rows.map(([k, v]) => (
                  <tr key={k} className="border-b border-border/60">
                    <td className="py-0.5 pr-2">{k}</td>
                    <td className="py-0.5 text-right font-mono whitespace-nowrap">{v}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        );
      })}
    </div>
  );
}
