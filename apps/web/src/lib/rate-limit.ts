/**
 * Small in-memory token bucket. Per serverless instance, so it bounds abuse per region rather than
 * globally; swap for Upstash Redis (`@upstash/ratelimit`) when traffic justifies it.
 */
const buckets = new Map<string, { tokens: number; updated: number }>();

export function rateLimit(key: string, opts: { capacity: number; refillPerSec: number }): { ok: boolean; retryAfterS: number } {
  const now = Date.now();
  const b = buckets.get(key) ?? { tokens: opts.capacity, updated: now };
  const elapsed = (now - b.updated) / 1000;
  b.tokens = Math.min(opts.capacity, b.tokens + elapsed * opts.refillPerSec);
  b.updated = now;
  if (b.tokens >= 1) {
    b.tokens -= 1;
    buckets.set(key, b);
    return { ok: true, retryAfterS: 0 };
  }
  buckets.set(key, b);
  return { ok: false, retryAfterS: Math.ceil((1 - b.tokens) / opts.refillPerSec) };
  }

/** Periodic cleanup so the map does not grow without bound. */
setInterval(() => {
  const cutoff = Date.now() - 10 * 60_000;
  for (const [k, v] of buckets) if (v.updated < cutoff) buckets.delete(k);
}, 60_000).unref?.();
