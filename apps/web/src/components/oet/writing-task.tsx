"use client";
import { useEffect, useState, useTransition } from "react";
import { submitLetter, type WritingGrade } from "@/lib/oet";
import { Badge, Button, Textarea } from "@/components/ui";
import { cn } from "@/lib/utils";

const CRITERIA_LABELS: Record<string, string> = {
  purpose: "Purpose",
  content: "Content",
  conciseness_and_clarity: "Conciseness & clarity",
  genre_and_style: "Genre & style",
  organisation_and_layout: "Organisation & layout",
  language: "Language",
};

export function WritingTask({ taskId, caseNotes, instruction, recipient, wordLimit, keyPoints, modelAnswer, graderEnabled, graderMode = "heuristic" }: {
  taskId: string; caseNotes: string; instruction: string; recipient: string; wordLimit: number; keyPoints: string[]; modelAnswer: string | null; graderEnabled: boolean; graderMode?: "claude" | "heuristic";
}) {
  const [letter, setLetter] = useState("");
  const [grade, setGrade] = useState<WritingGrade | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const [secondsLeft, setSecondsLeft] = useState(45 * 60);
  const [timerOn, setTimerOn] = useState(false);
  const [showKey, setShowKey] = useState(false);
  const words = letter.trim() ? letter.trim().split(/\s+/).length : 0;

  useEffect(() => {
    if (!timerOn || secondsLeft <= 0) return;
    const t = setInterval(() => setSecondsLeft((s) => s - 1), 1000);
    return () => clearInterval(t);
  }, [timerOn, secondsLeft]);

  return (
    <div className="space-y-6">
      <div className="grid lg:grid-cols-2 gap-6">
        <div className="space-y-3">
          <div className="rounded-lg border border-border p-4 text-sm">
            <p className="font-medium mb-1">Writing task</p>
            <p>{instruction}</p>
            <p className="mt-2"><span className="font-medium">To:</span> {recipient}</p>
          </div>
          <div className="rounded-lg border border-border p-4 text-sm leading-6 whitespace-pre-wrap font-mono max-h-[60vh] overflow-auto">{caseNotes}</div>
        </div>
        <div className="space-y-2">
          <div className="flex items-center gap-3 text-sm">
            <Button size="sm" variant="secondary" onClick={() => setTimerOn((t) => !t)}>{timerOn ? "Pause" : "Start"} 45:00 timer</Button>
            <span className={cn("font-mono", secondsLeft < 300 && "text-danger")}>{Math.floor(secondsLeft / 60).toString().padStart(2, "0")}:{(secondsLeft % 60).toString().padStart(2, "0")}</span>
            <span className={cn("ml-auto", words > wordLimit + 20 && "text-danger")}>{words} words (target ~{wordLimit - 20}–{wordLimit})</span>
          </div>
          <Textarea rows={22} value={letter} onChange={(e) => setLetter(e.target.value)} placeholder="Dear Dr ..." disabled={!!grade} className="font-serif text-[15px] leading-7" />
          {!grade && (
            <div className="flex gap-2 items-center">
              <Button disabled={pending || words < 60 || !graderEnabled} onClick={() => { setError(null); start(async () => { try { setGrade(await submitLetter(taskId, letter)); } catch (e) { setError(e instanceof Error ? e.message : String(e)); } }); }}>
                {pending ? "Grading…" : "Grade my letter"}
              </Button>
              {!graderEnabled && <span className="text-xs text-muted-foreground">Automated grading is not enabled; use the key points and model answer to self-assess.</span>}
              {graderEnabled && graderMode === "heuristic" && <span className="text-xs text-muted-foreground">Rule-based practice estimate (no API key). Not an OET result.</span>}
            </div>
          )}
          {error && <p className="text-sm text-danger">{error}</p>}
        </div>
      </div>

      {grade && (
        <section className="rounded-lg border border-border p-4 space-y-4">
          <div className="flex items-center gap-3">
            <h2 className="font-semibold">Estimated result</h2>
            <Badge tone={grade.overall_score >= 350 ? "success" : "warn"}>{grade.overall_score} / 500 · grade {grade.grade_letter}</Badge>
            <span className="text-xs text-muted-foreground">{grade.source === "heuristic" ? "Rule-based practice estimate" : "Claude practice estimate"} from the official criteria, not an OET result.</span>
          </div>
          <div className="grid sm:grid-cols-2 gap-3">
            {grade.criteria.map((c) => (
              <div key={c.criterion} className="rounded border border-border p-3 text-sm">
                <div className="flex justify-between"><span className="font-medium">{CRITERIA_LABELS[c.criterion] ?? c.criterion}</span><span className={cn("font-mono", c.band >= 5 ? "text-success" : "text-danger")}>band {c.band}/7</span></div>
                <p className="text-muted-foreground mt-1">{c.comment}</p>
                {c.evidence.length > 0 && <ul className="mt-1 text-xs italic list-disc list-inside">{c.evidence.map((e, i) => <li key={i}>“{e}”</li>)}</ul>}
              </div>
            ))}
          </div>
          {grade.missed_key_points.length > 0 && (
            <div className="text-sm"><p className="font-medium">Missed content points</p><ul className="list-disc list-inside text-muted-foreground">{grade.missed_key_points.map((k) => <li key={k}>{k}</li>)}</ul></div>
          )}
          <div className="text-sm"><p className="font-medium">Suggestions</p><ol className="list-decimal list-inside">{grade.suggestions.map((s, i) => <li key={i}>{s}</li>)}</ol></div>
        </section>
      )}

      <details className="rounded-lg border border-border p-4 text-sm" onToggle={(e) => setShowKey((e.target as HTMLDetailsElement).open)}>
        <summary className="cursor-pointer font-medium">Key content points and model answer {showKey ? "" : "(reveal after writing)"}</summary>
        <ul className="list-disc list-inside mt-2 text-muted-foreground">{keyPoints.map((k) => <li key={k}>{k}</li>)}</ul>
        {modelAnswer && <pre className="mt-3 whitespace-pre-wrap font-serif leading-7">{modelAnswer}</pre>}
      </details>
    </div>
  );
}
