"use client";
import { useEffect, useMemo, useRef, useState, useTransition } from "react";
import { REJECTION_REASONS, type ItemType, type QuestionOption, type StoryboardScene } from "@rp/schema";
import { decide } from "@/lib/review";
import { Button, Input, Select, Textarea } from "@/components/ui";
import { cn } from "@/lib/utils";

type AnyItem = Record<string, unknown>;

export function ReviewForm({
  queueId,
  itemType,
  item,
  topics,
  canDecide,
}: {
  queueId: string;
  itemType: ItemType;
  item: AnyItem;
  topics: { id: string; name: string; parentId: string | null }[];
  canDecide: boolean;
}) {
  const [draft, setDraft] = useState<AnyItem>(item);
  const [comment, setComment] = useState("");
  const [reasons, setReasons] = useState<string[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const started = useRef(0);
  useEffect(() => {
    started.current = Date.now();
  }, []);

  const edited = useMemo(() => {
    const diff: AnyItem = {};
    for (const k of Object.keys(draft)) if (JSON.stringify(draft[k]) !== JSON.stringify(item[k])) diff[k] = draft[k];
    return Object.keys(diff).length ? diff : null;
  }, [draft, item]);

  const set = (k: string, v: unknown) => setDraft((d) => ({ ...d, [k]: v }));

  const submit = (decision: "approve" | "request_changes" | "reject") => {
    setError(null);
    start(async () => {
      try {
        await decide({
          queueId,
          itemType,
          itemId: String(item.id),
          decision,
          reasons,
          comment: comment || undefined,
          editedPayload: edited,
          timeSpentS: Math.round((Date.now() - started.current) / 1000),
        });
      } catch (e) {
        setError(e instanceof Error ? e.message : String(e));
      }
    });
  };

  return (
    <div className="space-y-5">
      {itemType === "question" && <QuestionEditor draft={draft} set={set} topics={topics} />}
      {itemType === "flashcard" && <FlashcardEditor draft={draft} set={set} topics={topics} />}
      {itemType === "animation" && <AnimationEditor draft={draft} set={set} />}
      {itemType === "oet_task" && <OetEditor draft={draft} set={set} />}

      <div className="rounded-lg border border-border p-4 space-y-3">
        <div className="flex flex-wrap gap-2">
          {REJECTION_REASONS.map((r) => (
            <label key={r} className={cn("text-xs rounded-full border px-2 py-1 cursor-pointer", reasons.includes(r) ? "border-primary bg-primary/10" : "border-border")}>
              <input type="checkbox" className="hidden" checked={reasons.includes(r)} onChange={() => setReasons((rs) => (rs.includes(r) ? rs.filter((x) => x !== r) : [...rs, r]))} />
              {r.replace(/_/g, " ")}
            </label>
          ))}
        </div>
        <Textarea rows={3} placeholder="Comment for the author / next reviewer (required unless approving)" value={comment} onChange={(e) => setComment(e.target.value)} />
        {edited && <p className="text-xs text-muted-foreground">You edited {Object.keys(edited).join(", ")}. Edits are saved with your decision.</p>}
        {error && <p className="text-sm text-danger">{error}</p>}
        {!canDecide && <p className="text-sm text-amber-700">Your role can edit and comment but not decide on this item type; a physician will finalize.</p>}
        <div className="flex gap-2">
          <Button onClick={() => submit("approve")} disabled={pending || !canDecide}>Approve{edited ? " with edits" : ""}</Button>
          <Button variant="secondary" onClick={() => submit("request_changes")} disabled={pending || !canDecide}>Request changes</Button>
          <Button variant="danger" onClick={() => submit("reject")} disabled={pending || !canDecide}>Reject</Button>
        </div>
      </div>
    </div>
  );
}

function TopicSelect({ value, onChange, topics }: { value: string; onChange: (v: string) => void; topics: { id: string; name: string; parentId: string | null }[] }) {
  return (
    <Select value={value} onChange={(e) => onChange(e.target.value)} className="w-full">
      {topics.map((t) => (
        <option key={t.id} value={t.id}>{t.parentId ? "\u00a0\u00a0" : ""}{t.name}</option>
      ))}
    </Select>
  );
}

function QuestionEditor({ draft, set, topics }: { draft: AnyItem; set: (k: string, v: unknown) => void; topics: { id: string; name: string; parentId: string | null }[] }) {
  const options = draft.options as QuestionOption[];
  const setOpt = (i: number, patch: Partial<QuestionOption>) => {
    const next = options.map((o, j) => (j === i ? { ...o, ...patch } : patch.is_correct ? { ...o, is_correct: false } : o));
    set("options", next);
    const c = next.find((o) => o.is_correct);
    if (c) set("answerLabel", c.label);
  };
  return (
    <div className="space-y-3">
      <Field label="Stem"><Textarea rows={6} value={String(draft.stem)} onChange={(e) => set("stem", e.target.value)} /></Field>
      <div className="space-y-2">
        {options.map((o, i) => (
          <div key={o.label} className={cn("rounded border p-2 space-y-1", o.is_correct ? "border-success/60" : "border-border")}>
            <div className="flex items-center gap-2">
              <input type="radio" name="correct" checked={o.is_correct} onChange={() => setOpt(i, { is_correct: true })} title="Mark correct" />
              <span className="font-medium w-5">{o.label}.</span>
              <Input value={o.text} onChange={(e) => setOpt(i, { text: e.target.value })} />
            </div>
            <Textarea rows={2} className="text-xs" value={o.explanation} onChange={(e) => setOpt(i, { explanation: e.target.value })} placeholder="Why right/wrong" />
          </div>
        ))}
      </div>
      <Field label="Explanation"><Textarea rows={5} value={String(draft.explanation)} onChange={(e) => set("explanation", e.target.value)} /></Field>
      <Field label="Teaching point"><Input value={String(draft.teachingPoint ?? "")} onChange={(e) => set("teachingPoint", e.target.value)} /></Field>
      <div className="grid sm:grid-cols-3 gap-3">
        <Field label="Topic"><TopicSelect value={String(draft.topicId)} onChange={(v) => set("topicId", v)} topics={topics} /></Field>
        <Field label="Difficulty">
          <Select value={String(draft.difficulty)} onChange={(e) => set("difficulty", e.target.value)} className="w-full">
            {["easy", "medium", "hard"].map((d) => <option key={d}>{d}</option>)}
          </Select>
        </Field>
        <Field label="Animation worthiness (0-5)"><Input type="number" min={0} max={5} value={Number(draft.animationWorthiness ?? 0)} onChange={(e) => set("animationWorthiness", Number(e.target.value))} /></Field>
      </div>
      {Array.isArray(draft.media) && (draft.media as { url: string; alt?: string }[]).map((m) => (
        // eslint-disable-next-line @next/next/no-img-element
        <img key={m.url} src={m.url} alt={m.alt ?? ""} className="max-h-64 border border-border" />
      ))}
      {Array.isArray(draft.evidence) && (draft.evidence as { title: string; url?: string }[]).length > 0 && (
        <p className="text-xs text-muted-foreground">Evidence: {(draft.evidence as { title: string; url?: string }[]).map((e) => e.url ? <a key={e.title} className="underline mr-2" href={e.url} target="_blank" rel="noreferrer">{e.title}</a> : <span key={e.title} className="mr-2">{e.title}</span>)}</p>
      )}
    </div>
  );
}

function FlashcardEditor({ draft, set, topics }: { draft: AnyItem; set: (k: string, v: unknown) => void; topics: { id: string; name: string; parentId: string | null }[] }) {
  return (
    <div className="space-y-3">
      <Field label="Front"><Textarea rows={2} value={String(draft.front)} onChange={(e) => set("front", e.target.value)} /></Field>
      <Field label="Back"><Textarea rows={2} value={String(draft.back)} onChange={(e) => set("back", e.target.value)} /></Field>
      {draft.kind === "cloze" && <Field label="Cloze text"><Textarea rows={2} value={String(draft.clozeText ?? "")} onChange={(e) => set("clozeText", e.target.value)} /></Field>}
      <Field label="Extra"><Textarea rows={2} value={String(draft.extra ?? "")} onChange={(e) => set("extra", e.target.value)} /></Field>
      <div className="grid sm:grid-cols-2 gap-3">
        <Field label="Topic"><TopicSelect value={String(draft.topicId)} onChange={(v) => set("topicId", v)} topics={topics} /></Field>
        <Field label="Tags (comma separated)"><Input value={(draft.tags as string[]).join(", ")} onChange={(e) => set("tags", e.target.value.split(",").map((s) => s.trim()).filter(Boolean))} /></Field>
      </div>
    </div>
  );
}

function AnimationEditor({ draft, set }: { draft: AnyItem; set: (k: string, v: unknown) => void }) {
  const sb = draft.storyboard as StoryboardScene[];
  const [showSrc, setShowSrc] = useState(false);
  return (
    <div className="space-y-3">
      <Field label="Title"><Input value={String(draft.title)} onChange={(e) => set("title", e.target.value)} /></Field>
      <Field label="Concept"><Textarea rows={2} value={String(draft.concept)} onChange={(e) => set("concept", e.target.value)} /></Field>
      <div className="space-y-2">
        <span className="text-sm font-medium">Storyboard captions (shown to learners)</span>
        {sb.map((s, i) => (
          <div key={s.scene} className="flex gap-2 items-start text-sm">
            <span className="font-mono text-xs text-muted-foreground w-24 pt-2">{s.start_ms / 1000}–{s.end_ms / 1000}s</span>
            <Textarea rows={2} value={s.caption} onChange={(e) => set("storyboard", sb.map((x, j) => (j === i ? { ...x, caption: e.target.value } : x)))} />
          </div>
        ))}
      </div>
      <button className="text-xs underline" onClick={() => setShowSrc((s) => !s)}>{showSrc ? "Hide" : "Show"} component source</button>
      {showSrc && <Textarea rows={20} className="font-mono text-xs" value={String(draft.componentSource)} onChange={(e) => set("componentSource", e.target.value)} />}
      {(draft.renderTest as { passed?: boolean; errors?: string[] } | null)?.errors?.length ? (
        <p className="text-xs text-danger">Render test errors: {(draft.renderTest as { errors: string[] }).errors.join("; ")}</p>
      ) : null}
    </div>
  );
}

function OetEditor({ draft, set }: { draft: AnyItem; set: (k: string, v: unknown) => void }) {
  const payload = draft.payload as Record<string, unknown>;
  const setP = (k: string, v: unknown) => set("payload", { ...payload, [k]: v });
  return (
    <div className="space-y-3">
      <Field label="Title"><Input value={String(draft.title)} onChange={(e) => set("title", e.target.value)} /></Field>
      {payload.kind === "referral_letter" && (
        <>
          <Field label="Case notes"><Textarea rows={10} value={String(payload.case_notes)} onChange={(e) => setP("case_notes", e.target.value)} /></Field>
          <Field label="Task instruction"><Textarea rows={3} value={String(payload.task_instruction)} onChange={(e) => setP("task_instruction", e.target.value)} /></Field>
          <Field label="Recipient"><Input value={String(payload.recipient)} onChange={(e) => setP("recipient", e.target.value)} /></Field>
          <Field label="Key content points (one per line)"><Textarea rows={5} value={((payload.key_content_points as string[]) ?? []).join("\n")} onChange={(e) => setP("key_content_points", e.target.value.split("\n").filter(Boolean))} /></Field>
          <Field label="Model answer"><Textarea rows={8} value={String(payload.model_answer ?? "")} onChange={(e) => setP("model_answer", e.target.value)} /></Field>
        </>
      )}
      {payload.kind === "comprehension" && (
        <>
          <Field label="Passage / transcript"><Textarea rows={10} value={String(payload.passage)} onChange={(e) => setP("passage", e.target.value)} /></Field>
          <pre className="text-xs bg-muted p-3 rounded overflow-auto">{JSON.stringify(payload.items, null, 2)}</pre>
        </>
      )}
      {payload.kind === "role_play" && (
        <>
          <Field label="Setting"><Input value={String(payload.setting)} onChange={(e) => setP("setting", e.target.value)} /></Field>
          <Field label="Candidate card"><Textarea rows={6} value={String(payload.candidate_card)} onChange={(e) => setP("candidate_card", e.target.value)} /></Field>
          <Field label="Interlocutor card"><Textarea rows={6} value={String(payload.interlocutor_card)} onChange={(e) => setP("interlocutor_card", e.target.value)} /></Field>
        </>
      )}
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block text-sm">
      <span className="font-medium block mb-1">{label}</span>
      {children}
    </label>
  );
}
