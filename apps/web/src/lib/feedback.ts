"use server";
import { z } from "zod";
import { db } from "@/db";
import { itemFeedback } from "@/db/schema";
import { getUser } from "@/lib/supabase/server";

const Schema = z.object({
  itemType: z.enum(["question", "flashcard", "animation", "oet_task"]),
  itemId: z.string(),
  category: z.enum(["wrong_answer", "outdated", "typo", "unclear", "other"]),
  message: z.string().max(2000).optional(),
});

export async function reportItem(input: z.infer<typeof Schema>) {
  const user = await getUser();
  const v = Schema.parse(input);
  await db.insert(itemFeedback).values({ ...v, userId: user?.id ?? null });
  return { ok: true };
}
