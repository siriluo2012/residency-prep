"use client";
import { useState, useTransition } from "react";
import { reportItem } from "@/lib/feedback";
import { Button, Select, Textarea } from "@/components/ui";

export function ReportButton({ itemType, itemId }: { itemType: "question" | "flashcard" | "animation" | "oet_task"; itemId: string }) {
  const [open, setOpen] = useState(false);
  const [done, setDone] = useState(false);
  const [category, setCategory] = useState<"wrong_answer" | "outdated" | "typo" | "unclear" | "other">("wrong_answer");
  const [message, setMessage] = useState("");
  const [pending, start] = useTransition();

  if (done) return <span className="text-xs text-muted-foreground">Thanks, a reviewer will look at this.</span>;
  if (!open)
    return (
      <button onClick={() => setOpen(true)} className="text-xs text-muted-foreground underline">
        Report an error
      </button>
    );
  return (
    <form
      className="flex flex-col gap-2 w-72 text-xs"
      onSubmit={(e) => {
        e.preventDefault();
        start(async () => {
          await reportItem({ itemType, itemId, category, message: message || undefined });
          setDone(true);
        });
      }}
    >
      <Select value={category} onChange={(e) => setCategory(e.target.value as typeof category)} className="h-8">
        <option value="wrong_answer">Answer is wrong</option>
        <option value="outdated">Outdated guideline</option>
        <option value="typo">Typo / formatting</option>
        <option value="unclear">Unclear / ambiguous</option>
        <option value="other">Other</option>
      </Select>
      <Textarea rows={2} placeholder="Optional details" value={message} onChange={(e) => setMessage(e.target.value)} />
      <div className="flex gap-2">
        <Button type="submit" size="sm" disabled={pending}>Send</Button>
        <Button type="button" size="sm" variant="ghost" onClick={() => setOpen(false)}>Cancel</Button>
      </div>
    </form>
  );
}
