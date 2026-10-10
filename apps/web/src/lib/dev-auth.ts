/**
 * Local development login without Supabase.
 *
 * Two ways this fires (never in production):
 *   1. RP_DEV_USER_ID=<uuid> in the environment — every request is that user (handy for scripts).
 *   2. Cookie `rp_dev_user` set by the local Continue button on /login.
 *
 * The row in `profiles` decides the role. Seed creates:
 *   00000000-0000-4000-8000-000000000001  Local physician  (can review and publish)
 *   00000000-0000-4000-8000-000000000002  Local student
 */
export const DEV_COOKIE = "rp_dev_user";

export const LOCAL_PHYSICIAN_ID = "00000000-0000-4000-8000-000000000001";
export const LOCAL_STUDENT_ID = "00000000-0000-4000-8000-000000000002";

export const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export interface DevUser {
  id: string;
  email: string;
}

export function localAuthAllowed(): boolean {
  return process.env.NODE_ENV !== "production";
}

export function envDevUser(): DevUser | null {
  if (!localAuthAllowed()) return null;
  const id = process.env.RP_DEV_USER_ID;
  if (!id) return null;
  if (!UUID_RE.test(id)) throw new Error("RP_DEV_USER_ID must be a UUID");
  return { id, email: process.env.RP_DEV_USER_EMAIL ?? "dev@localhost" };
}

/** @deprecated use envDevUser(); kept so existing imports keep compiling */
export function devUser(): DevUser | null {
  return envDevUser();
}

export function parseDevCookie(value: string | undefined): DevUser | null {
  if (!localAuthAllowed() || !value || !UUID_RE.test(value)) return null;
  const email =
    value === LOCAL_PHYSICIAN_ID
      ? "physician@localhost"
      : value === LOCAL_STUDENT_ID
        ? "student@localhost"
        : (process.env.RP_DEV_USER_EMAIL ?? "dev@localhost");
  return { id: value, email };
}
