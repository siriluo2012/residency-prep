"use client";
import { useCallback, useEffect, useMemo, useRef, useState, useTransition } from "react";
import type { Media, QuestionOption } from "@rp/schema";
import { completeBlock, submitAnswer, toggleFlag } from "@/lib/qbank";
import { Button } from "@/components/ui";
import { cn } from "@/lib/utils";
import { LabValuesPanel } from "./lab-values-panel";
import { Explanation, type AnimationData } from "./explanation";

export interface ClientQuestion {
  id: string;
  stem: string;
  options: { label: string; text: string }[];
  media: Media[];
  labValuesUsed: boolean;
}

interface AttemptState {
  questionId: string;
  selected: string | null;
  isCorrect: boolean | null;
  flagged: boolean;
  struck: string[];
  revealed?: { answer: string; options: QuestionOption[]; explanation: string; teachingPoint: string | null; animation: AnimationData | null };
}

export function BlockRunner({
  blockId,
  mode,
  questions,
  initialAttempts,
  timeLimitS,
  startedAtMs,
}: {
  blockId: string;
  mode: "timed" | "tutor";
  questions: ClientQuestion[];
  initialAttempts: Omit<AttemptState, "revealed">[];
  timeLimitS: number | null;
  startedAtMs: number;
}) {
  const [idx, setIdx] = useState(() => {
    const firstUnanswered = questions.findIndex((q) => !initialAttempts.find((a) => a.questionId === q.id && a.selected));
    return firstUnanswered === -1 ? 0 : firstUnanswered;
  });
  const [attempts, setAttempts] = useState<Record<string, AttemptState>>(() =>
    Object.fromEntries(questions.map((q) => [q.id, initialAttempts.find((a) => a.questionId === q.id) ?? { questionId: q.id, selected: null, isCorrect: null, flagged: false, struck: [] }])),
  );
  const [selected, setSelected] = useState<string | null>(null);
  const [showLabs, setShowLabs] = useState(false);
  const [pending, startTransition] = useTransition();
  const [remaining, setRemaining] = useState<number | null>(null);
  const questionStart = useRef(0);
  const stemRef = useRef<HTMLDivElement>(null);

  const q = questions[idx];
  const a = attempts[q.id];
  const answered = !!a.selected;

  useEffect(() => {
    questionStart.current = Date.now();
  }, []);

  const goTo = useCallback(
    (i: number) => {
      setIdx(Math.max(0, Math.min(questions.length - 1, i)));
      setSelected(null);
      questionStart.current = Date.now();
    },
    [questions.length],
  );

  // countdown: derived from wall clock each tick so reloads keep the correct remaining time
  useEffect(() => {
    if (timeLimitS == null) return;
    const tick = () => {
      const r = timeLimitS - Math.floor((Date.now() - startedAtMs) / 1000);
      setRemaining(Math.max(0, r));
      if (r <= 0) startTransition(() => completeBlock(blockId));
    };
    const t0 = setTimeout(tick, 0);
    const t = setInterval(tick, 1000);
    return () => {
      clearTimeout(t0);
      clearInterval(t);
    };
  }, [timeLimitS, startedAtMs, blockId]);

  const submit = useCallback(() => {
    if (!selected || answered) return;
    const timeMs = Date.now() - questionStart.current;
    startTransition(async () => {
      const res = await submitAnswer({ blockId, questionId: q.id, selected: selected as "A", timeMs, struck: a.struck });
      setAttempts((prev) => ({
        ...prev,
        [q.id]: {
          ...prev[q.id],
          selected,
          isCorrect: res.isCorrect,
          revealed: mode === "tutor" ? { answer: res.answer, options: res.options, explanation: res.explanation, teachingPoint: res.teachingPoint, animation: res.animation } : undefined,
        },
      }));
      if (mode === "timed") goTo(idx + 1);
    });
  }, [selected, answered, blockId, q.id, a.struck, mode, goTo, idx]);

  const strike = (label: string) => {
    if (answered) return;
    setAttempts((prev) => {
      const s = new Set(prev[q.id].struck);
      if (s.has(label)) s.delete(label);
      else s.add(label);
      return { ...prev, [q.id]: { ...prev[q.id], struck: [...s] } };
    });
  };

  const flag = () => {
    const next = !a.flagged;
    setAttempts((prev) => ({ ...prev, [q.id]: { ...prev[q.id], flagged: next } }));
    startTransition(() => toggleFlag(blockId, q.id, next));
  };

  // highlight selected text inside the stem
  const highlight = () => {
    const sel = window.getSelection();
    if (!sel || sel.isCollapsed || !stemRef.current) return;
    const range = sel.getRangeAt(0);
    if (!stemRef.current.contains(range.commonAncestorContainer)) return;
    const mark = document.createElement("mark");
    mark.className = "qb-highlight";
    try {
      range.surroundContents(mark);
    } catch {
      /* selection crosses elements; ignore */
    }
    sel.removeAllRanges();
  };

  // keyboard: 1-5 select, Enter submit, arrows navigate
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.target as HTMLElement)?.tagName === "TEXTAREA" || (e.target as HTMLElement)?.tagName === "INPUT") return;
      const n = Number(e.key);
      if (n >= 1 && n <= q.options.length && !answered) setSelected(q.options[n - 1].label);
      if (e.key === "Enter") submit();
      if (e.key === "ArrowRight") goTo(idx + 1);
      if (e.key === "ArrowLeft") goTo(idx - 1);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [q.options, answered, submit, goTo, idx]);

  const answeredCount = useMemo(() => Object.values(attempts).filter((x) => x.selected).length, [attempts]);
  const allAnswered = answeredCount === questions.length;

  return (
    <div className="-mx-4 -my-6 min-h-[calc(100vh-3.5rem)] flex flex-col bg-[#0b1f3a] text-white">
      {/* top bar */}
      <div className="flex items-center gap-4 px-4 h-11 bg-[#0d2a4f] text-sm">
        <span className="font-medium">Item {idx + 1} of {questions.length}</span>
        <span className="text-white/60">{answeredCount} answered</span>
        <button onClick={flag} className={cn("ml-2 rounded px-2 py-0.5 border", a.flagged ? "bg-amber-400 text-black border-amber-400" : "border-white/30")}>
          {a.flagged ? "Flagged" : "Flag"}
        </button>
        <div className="ml-auto flex items-center gap-3">
          {remaining != null && (
            <span className={cn("font-mono", remaining < 120 && "text-red-300")}>
              {Math.floor(remaining / 60).toString().padStart(2, "0")}:{(remaining % 60).toString().padStart(2, "0")}
            </span>
          )}
          <span className="text-white/60 capitalize">{mode}</span>
        </div>
      </div>

      {/* body */}
      <div className="flex-1 grid lg:grid-cols-[1fr_320px] gap-0">
        <div className="bg-white text-black p-6 overflow-auto">
          <div ref={stemRef} onMouseUp={highlight} className="prose max-w-none text-[15px] leading-7 select-text">
            <p>{q.stem}</p>
            {q.media.map((m) => (
              <figure key={m.url} className="my-3">
                {m.kind === "svg" || m.kind === "image" ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={m.url} alt={m.alt ?? ""} className="max-h-80 border border-border" />
                ) : null}
                {m.caption && <figcaption className="text-xs text-muted-foreground">{m.caption}</figcaption>}
              </figure>
            ))}
          </div>
          <ol className="mt-5 space-y-1.5">
            {q.options.map((o) => {
              const struck = a.struck.includes(o.label);
              const isSel = (answered ? a.selected : selected) === o.label;
              const revealed = a.revealed;
              const isAnswer = revealed?.answer === o.label;
              return (
                <li key={o.label} className={cn("flex items-start gap-2 rounded px-2 py-1.5", isSel && !revealed && "bg-sky-100", revealed && isAnswer && "bg-green-100", revealed && isSel && !isAnswer && "bg-red-100")}>
                  <input
                    type="radio"
                    name={`q-${q.id}`}
                    checked={isSel}
                    disabled={answered}
                    onChange={() => setSelected(o.label)}
                    className="mt-1.5"
                    aria-label={`Option ${o.label}`}
                  />
                  <button
                    type="button"
                    onClick={() => (answered ? undefined : setSelected(o.label))}
                    onContextMenu={(e) => {
                      e.preventDefault();
                      strike(o.label);
                    }}
                    className={cn("text-left flex-1", struck && "qb-struck")}
                    title="Right-click to strike through"
                  >
                    <span className="font-medium mr-2">{o.label}.</span>
                    {o.text}
                  </button>
                </li>
              );
            })}
          </ol>

          {!answered && (
            <div className="mt-4 flex gap-2">
              <Button onClick={submit} disabled={!selected || pending}>
                {mode === "tutor" ? "Submit" : "Next"}
              </Button>
              <span className="text-xs text-muted-foreground self-center">Keys: 1-{q.options.length} select, Enter submit, ←/→ navigate, right-click strike</span>
            </div>
          )}

          {a.revealed && (
            <div className="mt-6">
              <Explanation
                questionId={q.id}
                isCorrect={a.isCorrect}
                selected={a.selected}
                answer={a.revealed.answer}
                options={a.revealed.options}
                explanation={a.revealed.explanation}
                teachingPoint={a.revealed.teachingPoint}
                animation={a.revealed.animation}
              />
            </div>
          )}
        </div>

        <aside className="bg-[#0d2a4f] p-4 text-sm space-y-4">
          <div className="grid grid-cols-5 gap-1">
            {questions.map((qq, i) => {
              const st = attempts[qq.id];
              return (
                <button
                  key={qq.id}
                  onClick={() => goTo(i)}
                  className={cn(
                    "h-8 rounded text-xs border",
                    i === idx ? "border-white" : "border-white/20",
                    st.selected ? (mode === "tutor" ? (st.isCorrect ? "bg-green-600" : "bg-red-600") : "bg-white/20") : "bg-transparent",
                    st.flagged && "ring-2 ring-amber-400",
                  )}
                >
                  {i + 1}
                </button>
              );
            })}
          </div>
          <button onClick={() => setShowLabs((s) => !s)} className="w-full rounded border border-white/30 py-1.5">
            {showLabs ? "Hide" : "Show"} lab values
          </button>
          {showLabs && <LabValuesPanel />}
          <div className="flex gap-2">
            <Button variant="secondary" size="sm" className="text-black flex-1" onClick={() => goTo(idx - 1)} disabled={idx === 0}>
              Previous
            </Button>
            <Button variant="secondary" size="sm" className="text-black flex-1" onClick={() => goTo(idx + 1)} disabled={idx === questions.length - 1}>
              Next
            </Button>
          </div>
          <Button
            className="w-full"
            variant={allAnswered ? "primary" : "danger"}
            disabled={pending}
            onClick={() => {
              if (allAnswered || confirm("End block with unanswered items?")) startTransition(() => completeBlock(blockId));
            }}
          >
            End block
          </Button>
        </aside>
      </div>
    </div>
  );
}
