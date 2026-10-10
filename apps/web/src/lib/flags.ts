/**
 * Feature flags. DB-backed with env fallback so the app runs with no database.
 * Keys are stable strings; add new ones here so they are discoverable.
 */
import { db } from "@/db";
import { featureFlags } from "@/db/schema";

export const FLAGS = {
  PAID_TIER: "paid_tier", // when enabled, items with tier=pro require a subscription
  ANIMATIONS: "animations",
  OET_WRITING_GRADER: "oet_writing_grader",
  OET_SPEAKING_VOICE: "oet_speaking_voice",
  PUBLIC_SAMPLE_PAGES: "public_sample_pages",
} as const;
export type FlagKey = (typeof FLAGS)[keyof typeof FLAGS];

const DEFAULTS: Record<FlagKey, boolean> = {
  paid_tier: false,
  animations: true,
  oet_writing_grader: true,
  oet_speaking_voice: false,
  public_sample_pages: true,
};

let cache: { at: number; flags: Record<string, boolean> } | null = null;
const TTL_MS = 60_000;

export async function getFlags(): Promise<Record<FlagKey, boolean>> {
  if (cache && Date.now() - cache.at < TTL_MS) return cache.flags as Record<FlagKey, boolean>;
  const flags: Record<string, boolean> = { ...DEFAULTS };
  // env override: FLAG_PAID_TIER=true
  for (const k of Object.values(FLAGS)) {
    const v = process.env[`FLAG_${k.toUpperCase()}`];
    if (v !== undefined) flags[k] = v === "1" || v === "true";
  }
  if (process.env.DATABASE_URL) {
    try {
      const rows = await db.select().from(featureFlags);
      for (const r of rows) flags[r.key] = r.enabled;
    } catch {
      // DB unavailable; fall back to defaults/env
    }
  }
  cache = { at: Date.now(), flags };
  return flags as Record<FlagKey, boolean>;
}

export async function flag(key: FlagKey): Promise<boolean> {
  return (await getFlags())[key];
}
