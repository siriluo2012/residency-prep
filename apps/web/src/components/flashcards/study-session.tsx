"use client";
import Link from "next/link";
import { useCallback, useEffect, useState, useTransition } from "react";
import { buryCard, rateCard, suspendCard, type StudyCard } from "@/lib/flashcards";
import type { FsrsRating } from "@/lib/fsrs";
import { Badge, Button } from "@/components/ui";
import { ReportButton } from "@/components/report-button";
import { cn } from "@/lib/utils";

const RATINGS: { r: FsrsRating; label: string; tone: string; key: string }[] = [
  { r: 1, label: "Again", tone: "bg-red-600", key: "1" },
  { r: 2, label: "Hard", tone: "bg-amber-600", key: "2" },
  { r: 3, label: "Good", tone: "bg-green-600", key: "3" },
  { r: 4, label: "Easy", tone: "bg-sky-600", key: "4" },
];

function renderCloze(text: string, reveal: boolean) {
  // {{c1::answer}} or {{c1::answer::hint}}
  return text.split(/(\{\{c\d+::[^}]+\}\})/g).map((part, i) => {
    const m = part.match(/^\{\{c\d+::([^:}]+)(?:::([^}]+))?\}\}$/);
    if (!m) return <span key={i}>{part}</span>;
    return (
      <span key={i} className={cn("rounded px-1 font-medium", reveal ? "bg-green-100 dark:bg-green-900/40" : "bg-sky-100 dark:bg-sky-900/40")}>
        {reveal ? m[1] : m[2] ? `[${m[2]}]` : "[...]"}
      </span>
    );
  });
}

export function StudySession({ initial, exam }: { initial: StudyCard[]; exam: string }) {
  const [queue, setQueue] = useState(initial);
  const [again, setAgain] = useState<StudyCard[]>([]); // relearn pile within the session
  const [revealed, setRevealed] = useState(false);
  const [done, setDone] = useState(0);
  const [pending, start] = useTransition();
  const card: StudyCard | undefined = queue[0] ?? again[0];

  const advance = useCallback(
    (c: StudyCard, requeue: boolean) => {
      setRevealed(false);
      setDone((d) => d + 1);
      if (queue.length) setQueue((q) => q.slice(1));
      else setAgain((a) => a.slice(1));
      if (requeue) setAgain((a) => [...a, { ...c, isNew: false }]);
    },
    [queue.length],
  );

  const rate = useCallback(
    (r: FsrsRating) => {
      if (!card) return;
      const c = card;
      start(async () => {
        await rateCard({ flashcardId: c.flashcardId, rating: r });
      });
      advance(c, r === 1);
    },
    [card, advance],
  );

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === " " || e.key === "Enter") {
        e.preventDefault();
        if (!revealed) setRevealed(true);
      }
      const r = RATINGS.find((x) => x.key === e.key);
      if (r && revealed) rate(r.r);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [revealed, rate]);

  if (!card) {
    return (
      <div className="max-w-lg mx-auto text-center mt-16 space-y-3">
        <h1 className="text-2xl font-semibold">Session complete</h1>
        <p className="text-muted-foreground">{done} cards reviewed.</p>
        <Link href={`/flashcards?exam=${exam}`} className="underline">Back to decks</Link>
      </div>
    );
  }

  const remaining = queue.length + again.length;
  return (
    <div className="max-w-2xl mx-auto space-y-4">
      <div className="flex items-center gap-2 text-sm text-muted-foreground">
        <span>{remaining} left</span>
        {card.isNew && <Badge tone="info">New</Badge>}
        {again.includes(card) && <Badge tone="warn">Relearning</Badge>}
        <div className="ml-auto flex gap-3">
          <button className="underline" onClick={() => { start(() => buryCard(card.flashcardId)); advance(card, false); }}>Bury</button>
          <button className="underline" onClick={() => { start(() => suspendCard(card.flashcardId, true)); advance(card, false); }}>Suspend</button>
          <ReportButton itemType="flashcard" itemId={card.flashcardId} />
        </div>
      </div>

      <div onClick={() => setRevealed(true)} className="rounded-xl border border-border bg-card p-8 min-h-[18rem] flex flex-col justify-center text-center cursor-pointer select-text">
        {card.kind === "cloze" && card.clozeText ? (
          <p className="text-xl leading-9">{renderCloze(card.clozeText, revealed)}</p>
        ) : (
          <>
            <p className="text-xl leading-9">{card.front}</p>
            {revealed && (
              <>
                <hr className="my-5 border-border" />
                <p className="text-lg leading-8">{card.back}</p>
              </>
            )}
          </>
        )}
        {revealed && card.extra && <p className="mt-4 text-sm text-muted-foreground">{card.extra}</p>}
        {revealed && card.questionId && (
          <p className="mt-3 text-xs text-muted-foreground">From question {card.questionId}</p>
        )}
        {!revealed && <p className="mt-6 text-xs text-muted-foreground">Space / Enter to reveal</p>}
      </div>

      {revealed ? (
        <div className="grid grid-cols-4 gap-2">
          {RATINGS.map(({ r, label, tone, key }) => (
            <button key={r} onClick={() => rate(r)} disabled={pending} className={cn("rounded-md text-white py-3 flex flex-col items-center", tone)}>
              <span className="font-medium">{label}</span>
              <span className="text-xs opacity-80">{card.intervals[r]} · {key}</span>
            </button>
          ))}
        </div>
      ) : (
        <Button className="w-full" size="lg" onClick={() => setRevealed(true)}>Show answer</Button>
      )}
      <div className="flex flex-wrap gap-1">
        {card.tags.map((t) => <Badge key={t}>{t}</Badge>)}
      </div>
    </div>
  );
}
