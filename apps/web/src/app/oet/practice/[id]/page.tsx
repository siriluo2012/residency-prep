import Link from "next/link";
import { notFound } from "next/navigation";
import { and, eq } from "drizzle-orm";
import { db } from "@/db";
import { oetTasks } from "@/db/schema";
import { requireUser } from "@/lib/auth";
import { flag } from "@/lib/flags";
import { Badge } from "@/components/ui";
import { ReportButton } from "@/components/report-button";
import { ComprehensionTask } from "@/components/oet/comprehension-task";
import { WritingTask } from "@/components/oet/writing-task";
import { SpeakingTask } from "@/components/oet/speaking-task";

export default async function OetPracticePage({ params }: PageProps<"/oet/practice/[id]">) {
  await requireUser();
  const { id } = await params;
  const [task] = await db.select().from(oetTasks).where(and(eq(oetTasks.id, id), eq(oetTasks.status, "published"))).limit(1);
  if (!task) notFound();
  const graderOn = await flag("oet_writing_grader");
  const p = task.payload;
  // never send answers to the client for comprehension tasks
  const clientItems = p.kind === "comprehension" ? p.items.map((it) => ({ type: it.type ?? "mcq", prompt: it.prompt, options: it.options ?? null })) : [];
  return (
    <div className="max-w-3xl mx-auto space-y-6">
      <div className="flex items-center gap-2 text-sm text-muted-foreground">
        <Link href="/oet" className="underline">OET</Link><span>/</span>
        <Link href={`/oet/${task.subtest}`} className="underline capitalize">{task.subtest}</Link>
        {task.part && <Badge>Part {task.part}</Badge>}
        <span className="ml-auto"><ReportButton itemType="oet_task" itemId={task.id} /></span>
      </div>
      <h1 className="text-2xl font-semibold">{task.title}</h1>
      {p.kind === "comprehension" && <ComprehensionTask taskId={task.id} subtest={task.subtest} passage={p.passage} audioUrl={p.audio_url ?? null} items={clientItems} />}
      {p.kind === "referral_letter" && <WritingTask taskId={task.id} caseNotes={p.case_notes} instruction={p.task_instruction} recipient={p.recipient} wordLimit={p.word_limit ?? 200} keyPoints={p.key_content_points ?? []} modelAnswer={p.model_answer ?? null} graderEnabled={graderOn} graderMode={process.env.ANTHROPIC_API_KEY ? "claude" : "heuristic"} />}
      {p.kind === "role_play" && <SpeakingTask taskId={task.id} setting={p.setting} candidateCard={p.candidate_card} interlocutorCard={p.interlocutor_card} modelDialogue={p.model_dialogue ?? null} focus={p.assessment_focus ?? []} />}
      <p className="text-xs text-muted-foreground">{task.aiDrafted ? "AI-drafted, " : ""}reviewed{task.reviewedBy ? ` by ${task.reviewedBy}` : ""}. Original practice material, not an official OET paper.</p>
    </div>
  );
}
