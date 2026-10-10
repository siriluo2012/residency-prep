"use server";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { db } from "@/db";
import { profiles } from "@/db/schema";
import { requireUser } from "@/lib/auth";

const Schema = z.object({
  displayName: z.string().max(80).optional(),
  targetExamId: z.enum(["usmle-step1", "usmle-step2ck", "oet-medicine", "ecfmg"]).optional(),
  examDate: z.string().optional(),
  dailyGoalQuestions: z.coerce.number().int().min(5).max(200).optional(),
  dailyGoalCards: z.coerce.number().int().min(5).max(500).optional(),
});

export async function updateProfile(formData: FormData) {
  const user = await requireUser();
  const v = Schema.parse({
    displayName: formData.get("displayName") || undefined,
    targetExamId: formData.get("targetExamId") || undefined,
    examDate: formData.get("examDate") || undefined,
    dailyGoalQuestions: formData.get("dailyGoalQuestions") || undefined,
    dailyGoalCards: formData.get("dailyGoalCards") || undefined,
  });
  await db
    .insert(profiles)
    .values({ userId: user.id, displayName: v.displayName, targetExamId: v.targetExamId, examDate: v.examDate ? new Date(v.examDate) : null, dailyGoalQuestions: v.dailyGoalQuestions, dailyGoalCards: v.dailyGoalCards })
    .onConflictDoUpdate({
      target: profiles.userId,
      set: {
        displayName: v.displayName,
        targetExamId: v.targetExamId,
        examDate: v.examDate ? new Date(v.examDate) : null,
        ...(v.dailyGoalQuestions ? { dailyGoalQuestions: v.dailyGoalQuestions } : {}),
        ...(v.dailyGoalCards ? { dailyGoalCards: v.dailyGoalCards } : {}),
        updatedAt: new Date(),
      },
    });
  revalidatePath("/dashboard");
  revalidatePath("/settings");
}
