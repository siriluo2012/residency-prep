"use server";
/**
 * OET server actions: submit comprehension answers (auto-marked), submit a letter (Claude if an
 * API key is set, otherwise the rule-based practice grader), and record speaking self-assessment.
 */
import Anthropic from "@anthropic-ai/sdk";
import { and, desc, eq } from "drizzle-orm";
import { z } from "zod";
import { OET_WRITING_CRITERIA } from "@rp/schema";
import { db } from "@/db";
import { oetSubmissions, oetTasks } from "@/db/schema";
import { requireUser } from "@/lib/auth";
import { flag } from "@/lib/flags";
import { rateLimit } from "@/lib/rate-limit";
import { heuristicGrade } from "@/lib/oet-grader";

function normalize(s: string) {
  return s.toLowerCase().replace(/[^a-z0-9 ]/g, "").replace(/\s+/g, " ").trim();
}

export async function submitComprehension(taskId: string, answers: Record<string, string>) {
  const user = await requireUser();
  const [task] = await db.select().from(oetTasks).where(and(eq(oetTasks.id, taskId), eq(oetTasks.status, "published"))).limit(1);
  if (!task || task.payload.kind !== "comprehension") throw new Error("task not found");
  const results = task.payload.items.map((it, i) => {
    const given = normalize(answers[String(i)] ?? "");
    const accepted = [it.answer, ...(it.accepted_answers ?? [])].map(normalize);
    return { index: i, correct: !!given && accepted.includes(given), answer: it.answer, explanation: it.explanation ?? null };
  });
  const correct = results.filter((r) => r.correct).length;
  const score = { correct, total: results.length, results };
  await db.insert(oetSubmissions).values({ userId: user.id, taskId, answers, score, gradedAt: new Date() });
  return score;
}

const GradeSchema = z.object({
  criteria: z.array(z.object({ criterion: z.enum(OET_WRITING_CRITERIA), band: z.number().int().min(0).max(7), evidence: z.array(z.string()).max(3), comment: z.string() })).length(6),
  overall_score: z.number().int().min(0).max(500),
  grade_letter: z.string(),
  missed_key_points: z.array(z.string()),
  suggestions: z.array(z.string()).min(3).max(5),
  source: z.enum(["claude", "heuristic"]).optional(),
});
export type WritingGrade = z.infer<typeof GradeSchema>;

const GRADER_SYSTEM = `You are an experienced OET Writing assessor for the Medicine profession. Score the candidate's
letter against the six official criteria. Use the band scale 0-7 for each (7 = expert, 5 = grade B
threshold, 3 = grade C). Be rigorous: note form, missing purpose, irrelevant content, and wrong register
are penalised. Quote 1-3 short excerpts from the letter as evidence for each criterion.
Criteria ids (use exactly): purpose, content, conciseness_and_clarity, genre_and_style, organisation_and_layout, language.
Then give an overall 0-500 score (grade B >= 350, A >= 450) consistent with the criterion bands, list the key
content points that were missed, and write 3-5 actionable suggestions. This is a practice estimate, not an
official OET result. Respond only by calling the tool.`;

export async function submitLetter(taskId: string, letter: string): Promise<WritingGrade> {
  const user = await requireUser();
  if (!(await flag("oet_writing_grader"))) throw new Error("grader disabled");
  const rl = rateLimit(`oet-grade:${user.id}`, { capacity: 5, refillPerSec: 5 / 3600 }); // 5 per hour
  if (!rl.ok) throw new Error(`grading limit reached; try again in ${Math.ceil(rl.retryAfterS / 60)} min`);
  const [task] = await db.select().from(oetTasks).where(and(eq(oetTasks.id, taskId), eq(oetTasks.status, "published"))).limit(1);
  if (!task || task.payload.kind !== "referral_letter") throw new Error("task not found");
  const text = letter.trim();
  if (text.split(/\s+/).length < 60) throw new Error("letter is too short to grade");
  if (text.length > 6000) throw new Error("letter is too long");

  // one grading per task per user per 2 minutes (bounds Claude cost; also keeps the heuristic from being spammed)
  const [recent] = await db.select({ at: oetSubmissions.createdAt }).from(oetSubmissions).where(and(eq(oetSubmissions.userId, user.id), eq(oetSubmissions.taskId, taskId))).orderBy(desc(oetSubmissions.createdAt)).limit(1);
  if (recent && Date.now() - recent.at.getTime() < 120_000) throw new Error("please wait a couple of minutes before re-grading");

  const p = task.payload;
  if (!process.env.ANTHROPIC_API_KEY) {
    const grade = GradeSchema.parse(
      heuristicGrade(text, {
        keyPoints: p.key_content_points ?? [],
        recipient: p.recipient,
        instruction: p.task_instruction,
        wordLimit: p.word_limit ?? 200,
      }),
    );
    await db.insert(oetSubmissions).values({ userId: user.id, taskId, response: text, score: grade, gradedAt: new Date() });
    return grade;
  }
  const client = new Anthropic();
  const resp = await client.messages.create({
    model: process.env.RP_CLAUDE_MODEL ?? "claude-sonnet-4-5",
    max_tokens: 3000,
    temperature: 0.2,
    system: GRADER_SYSTEM,
    tools: [{ name: "emit", description: "Emit the grade", input_schema: { type: "object", properties: {
      criteria: { type: "array", items: { type: "object", properties: { criterion: { type: "string" }, band: { type: "integer" }, evidence: { type: "array", items: { type: "string" } }, comment: { type: "string" } }, required: ["criterion", "band", "evidence", "comment"] } },
      overall_score: { type: "integer" }, grade_letter: { type: "string" }, missed_key_points: { type: "array", items: { type: "string" } }, suggestions: { type: "array", items: { type: "string" } } },
      required: ["criteria", "overall_score", "grade_letter", "missed_key_points", "suggestions"] } }],
    tool_choice: { type: "tool", name: "emit" },
    messages: [{ role: "user", content: `Task instruction:\n${p.task_instruction}\n\nRecipient: ${p.recipient}\n\nCase notes:\n${p.case_notes}\n\nKey content points:\n${(p.key_content_points ?? []).map((k) => `- ${k}`).join("\n")}\n\nCandidate letter (${text.split(/\s+/).length} words):\n${text}` }],
  });
  const block = resp.content.find((b) => b.type === "tool_use");
  if (!block || block.type !== "tool_use") throw new Error("grader returned no result");
  const grade = GradeSchema.parse({ ...(block.input as object), source: "claude" });
  await db.insert(oetSubmissions).values({ userId: user.id, taskId, response: text, score: grade, gradedAt: new Date() });
  return grade;
}

export async function recordSpeakingSelfAssessment(taskId: string, ratings: Record<string, number>, notes: string) {
  const user = await requireUser();
  await db.insert(oetSubmissions).values({ userId: user.id, taskId, response: notes, score: { self: ratings }, gradedAt: new Date() });
}
