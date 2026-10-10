import { eq } from "drizzle-orm";
import { redirect } from "next/navigation";
import { db } from "@/db";
import { profiles } from "@/db/schema";
import { getUser } from "@/lib/supabase/server";

export type Role = "student" | "reviewer" | "physician" | "admin";
const ORDER: Role[] = ["student", "reviewer", "physician", "admin"];

export async function requireUser() {
  const user = await getUser();
  if (!user) redirect("/login");
  return user;
}

export async function getProfile(userId: string) {
  const [p] = await db.select().from(profiles).where(eq(profiles.userId, userId)).limit(1);
  return p ?? null;
}

export async function requireRole(min: Role) {
  const user = await requireUser();
  const profile = await getProfile(user.id);
  const role = (profile?.role ?? "student") as Role;
  if (ORDER.indexOf(role) < ORDER.indexOf(min)) redirect("/dashboard?denied=1");
  return { user, profile, role };
}

export function hasRole(role: Role, min: Role) {
  return ORDER.indexOf(role) >= ORDER.indexOf(min);
}
