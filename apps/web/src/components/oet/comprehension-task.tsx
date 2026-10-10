"use client";
import { useEffect, useRef, useState, useTransition } from "react";
import { submitComprehension } from "@/lib/oet";
import { Button, Input } from "@/components/ui";
import { cn } from "@/lib/utils";

interface Item { type: string; prompt: string; options: string[] | null }

export function ComprehensionTask({ taskId, subtest, passage, audioUrl, items }: { taskId: string; subtest: string; passage: string; audioUrl: string | null; items: Item[] }) {
  const [answers, setAnswers] = useState<Record<string, string>>({});
  const [result, setResult] = useState<Awaited<ReturnType<typeof submitComprehension>> | null>(null);
  const [pending, start] = useTransition();
  const [showTranscript, setShowTranscript] = useState(subtest !== "listening");
  const [speaking, setSpeaking] = useState(false);
  const utter = useRef<SpeechSynthesisUtterance | null>(null);
  const isListening = subtest === "listening";

  // Browser TTS fallback when no audio file has been produced yet.
  const speak = () => {
    if (!("speechSynthesis" in window)) return;
    if (speaking) {
      window.speechSynthesis.cancel();
      setSpeaking(false);
      return;
    }
    const u = new SpeechSynthesisUtterance(passage.replace(/^[A-Z][a-z]+:\s*/gm, ""));
    u.rate = 0.95;
    u.onend = () => setSpeaking(false);
    utter.current = u;
    window.speechSynthesis.speak(u);
    setSpeaking(true);
  };
  useEffect(() => () => window.speechSynthesis?.cancel(), []);

  return (
    <div className="grid lg:grid-cols-2 gap-6">
      <div className="space-y-3">
        {isListening && (
          <div className="rounded-lg border border-border p-3 space-y-2">
            {audioUrl ? (
              <audio controls src={audioUrl} className="w-full" />
            ) : (
              <Button variant="secondary" onClick={speak}>{speaking ? "Stop" : "Play with browser voice"}</Button>
            )}
            <button className="text-xs underline text-muted-foreground" onClick={() => setShowTranscript((s) => !s)}>{showTranscript ? "Hide" : "Show"} transcript (after attempting)</button>
          </div>
        )}
        {showTranscript && <div className="rounded-lg border border-border p-4 text-sm leading-7 whitespace-pre-wrap max-h-[70vh] overflow-auto">{passage}</div>}
      </div>
      <div className="space-y-4">
        <ol className="space-y-4">
          {items.map((it, i) => {
            const r = result?.results[i];
            return (
              <li key={i} className={cn("rounded-lg border p-3 text-sm", r ? (r.correct ? "border-success/60" : "border-danger/60") : "border-border")}>
                <p className="font-medium mb-2">{i + 1}. {it.prompt}</p>
                {it.options ? (
                  <div className="space-y-1">
                    {it.options.map((o) => (
                      <label key={o} className="flex gap-2 items-start">
                        <input type="radio" name={`q${i}`} disabled={!!result} checked={answers[String(i)] === o} onChange={() => setAnswers((a) => ({ ...a, [String(i)]: o }))} className="mt-1" />
                        <span>{o}</span>
                      </label>
                    ))}
                  </div>
                ) : (
                  <Input disabled={!!result} value={answers[String(i)] ?? ""} onChange={(e) => setAnswers((a) => ({ ...a, [String(i)]: e.target.value }))} placeholder="Your answer" />
                )}
                {r && (
                  <p className="mt-2 text-xs text-muted-foreground">
                    {r.correct ? "Correct." : <>Answer: <strong>{r.answer}</strong>.</>} {r.explanation}
                  </p>
                )}
              </li>
            );
          })}
        </ol>
        {result ? (
          <p className="font-medium">Score: {result.correct}/{result.total}</p>
        ) : (
          <Button disabled={pending} onClick={() => start(async () => setResult(await submitComprehension(taskId, answers)))}>Check answers</Button>
        )}
      </div>
    </div>
  );
}
