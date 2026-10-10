"use server";

import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { eq, sql } from "drizzle-orm";
import { db } from "@/db";
import { profiles } from "@/db/schema";
import {
  DEV_COOKIE,
  LOCAL_PHYSICIAN_ID,
  LOCAL_STUDENT_ID,
  localAuthAllowed,
  type DevUser,
} from "@/lib/dev-auth";

export type LocalRole = "student" | "physician";

const COOKIE_OPTS = {
  httpOnly: true,
  sameSite: "lax" as const,
  path: "/",
  maxAge: 60 * 60 * 24 * 30,
};

function userFor(role: LocalRole): DevUser {
  if (role === "physician") return { id: LOCAL_PHYSICIAN_ID, email: "physician@localhost" };
  return { id: LOCAL_STUDENT_ID, email: "student@localhost" };
}

export async function ensureLocalProfile(user: DevUser, role: LocalRole) {
  if (!process.env.DATABASE_URL) return;
  await db.execute(sql`
    insert into auth.users (id, email)
    values (${user.id}::uuid, ${user.email})
    on conflict (id) do update set email = excluded.email
  `);
  const display = role === "physician" ? "Local physician" : "Local student";
  await db
    .insert(profiles)
    .values({ userId: user.id, displayName: display, role })
    .onConflictDoUpdate({
      target: profiles.userId,
      set: { displayName: display, role, updatedAt: new Date() },
    });
  // in case the auth.users trigger created a student row first
  await db.update(profiles).set({ role, displayName: display }).where(eq(profiles.userId, user.id));
}

export async function startLocalSession(formData: FormData) {
  if (!localAuthAllowed()) throw new Error("local login is disabled in production");
  const role = formData.get("role") === "physician" ? "physician" : "student";
  const nextRaw = formData.get("next");
  const next = typeof nextRaw === "string" && nextRaw.startsWith("/") && !nextRaw.startsWith("//") ? nextRaw : "/dashboard";
  const user = userFor(role);
  await ensureLocalProfile(user, role);
  const store = await cookies();
  store.set(DEV_COOKIE, user.id, COOKIE_OPTS);
  redirect(next);
}

export async function clearLocalSession() {
  const store = await cookies();
  store.delete(DEV_COOKIE);
}
