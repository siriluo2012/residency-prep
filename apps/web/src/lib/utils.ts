import { clsx, type ClassValue } from "clsx";

export function cn(...inputs: ClassValue[]) {
  return clsx(inputs);
}

export function formatPct(n: number | null | undefined, digits = 0) {
  if (n == null || Number.isNaN(n)) return "–";
  return `${(n * 100).toFixed(digits)}%`;
}

export function formatDuration(ms: number) {
  const s = Math.round(ms / 1000);
  const m = Math.floor(s / 60);
  const r = s % 60;
  return m ? `${m}m ${r.toString().padStart(2, "0")}s` : `${r}s`;
}

export function daysUntil(date: Date | string | null | undefined) {
  if (!date) return null;
  const d = typeof date === "string" ? new Date(date) : date;
  return Math.ceil((d.getTime() - Date.now()) / 86_400_000);
}
