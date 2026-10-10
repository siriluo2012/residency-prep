"use client";
import { useEffect, useState, useTransition } from "react";
import { recordSpeakingSelfAssessment } from "@/lib/oet";
import { Button, Textarea } from "@/components/ui";

const RUBRIC = [
  ["relationship", "Relationship building: greeting, empathy, respect"],
  ["perspective", "Understanding the patient's perspective: elicits ideas, concerns, expectations"],
  ["structure", "Providing structure: signposting, sequencing, summarising"],
  ["information", "Information giving: lay language, checks understanding, chunking"],
  ["language", "Language: intelligibility, fluency, grammar and vocabulary"],
] as const;

export function SpeakingTask({ taskId, setting, candidateCard, interlocutorCard, modelDialogue, focus }: { taskId: string; setting: string; candidateCard: string; interlocutorCard: string; modelDialogue: string | null; focus: string[] }) {
  const [phase, setPhase] = useState<"prep" | "roleplay" | "review">("prep");
  const [seconds, setSeconds] = useState(180); // 3 min preparation
  const [ratings, setRatings] = useState<Record<string, number>>({});
  const [notes, setNotes] = useState("");
  const [saved, setSaved] = useState(false);
  const [pending, start] = useTransition();

  useEffect(() => {
    if (phase === "review" || seconds <= 0) return;
    const t = setInterval(() => setSeconds((s) => s - 1), 1000);
    return () => clearInterval(t);
  }, [phase, seconds]);

  const next = () => {
    if (phase === "prep") { setPhase("roleplay"); setSeconds(300); }
    else if (phase === "roleplay") setPhase("review");
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3 text-sm">
        <span className="font-medium capitalize">{phase === "prep" ? "Preparation (3 min)" : phase === "roleplay" ? "Role-play (5 min)" : "Review"}</span>
        {phase !== "review" && <span className="font-mono">{Math.floor(seconds / 60)}:{(seconds % 60).toString().padStart(2, "0")}</span>}
        {phase !== "review" && <Button size="sm" variant="secondary" onClick={next}>{phase === "prep" ? "Start role-play" : "Finish"}</Button>}
        <span className="ml-auto text-muted-foreground">{setting}</span>
      </div>
      <div className="grid lg:grid-cols-2 gap-6">
        <div className="rounded-lg border-2 border-primary/40 p-4 text-sm whitespace-pre-wrap leading-6">
          <p className="text-xs uppercase tracking-wide text-primary font-semibold mb-2">Candidate card (you, the doctor)</p>
          {candidateCard}
        </div>
        <div className="rounded-lg border border-border p-4 text-sm whitespace-pre-wrap leading-6">
          <p className="text-xs uppercase tracking-wide text-muted-foreground font-semibold mb-2">Interlocutor card (give to a study partner)</p>
          {phase === "prep" ? <p className="text-muted-foreground italic">Hidden during preparation. Ask a partner to read this card, or reveal it after the role-play.</p> : interlocutorCard}
        </div>
      </div>
      {focus.length > 0 && <p className="text-xs text-muted-foreground">Assessment focus: {focus.join(" · ")}</p>}
      {phase === "review" && (
        <section className="space-y-4">
          <div className="rounded-lg border border-border p-4 space-y-3 text-sm">
            <p className="font-medium">Self-assessment (or ask your partner)</p>
            {RUBRIC.map(([k, label]) => (
              <div key={k} className="flex items-center gap-3">
                <span className="flex-1">{label}</span>
                <div className="flex gap-1">
                  {[1, 2, 3, 4, 5].map((n) => (
                    <button key={n} onClick={() => setRatings((r) => ({ ...r, [k]: n }))} className={`h-7 w-7 rounded border text-xs ${ratings[k] === n ? "bg-primary text-primary-foreground border-primary" : "border-border"}`}>{n}</button>
                  ))}
                </div>
              </div>
            ))}
            <Textarea rows={3} placeholder="What would you do differently?" value={notes} onChange={(e) => setNotes(e.target.value)} />
            {saved ? <p className="text-success text-xs">Saved.</p> : <Button size="sm" disabled={pending} onClick={() => start(async () => { await recordSpeakingSelfAssessment(taskId, ratings, notes); setSaved(true); })}>Save</Button>}
          </div>
          {modelDialogue && (
            <details className="rounded-lg border border-border p-4 text-sm">
              <summary className="cursor-pointer font-medium">Model dialogue</summary>
              <pre className="whitespace-pre-wrap font-sans leading-7 mt-2">{modelDialogue}</pre>
            </details>
          )}
        </section>
      )}
    </div>
  );
}
