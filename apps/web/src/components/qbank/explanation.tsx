import type { QuestionOption, StoryboardScene } from "@rp/schema";
import { AnimationPlayer } from "@/components/animations/animation-player";
import { ReportButton } from "@/components/report-button";
import { cn } from "@/lib/utils";

export interface AnimationData {
  id: string;
  title: string;
  storyboard: StoryboardScene[];
  durationMs: number;
  staticFallbackSvg: string | null;
  aiDrafted: boolean;
}

export function Explanation({
  questionId,
  isCorrect,
  selected,
  answer,
  options,
  explanation,
  teachingPoint,
  animation,
}: {
  questionId: string;
  isCorrect: boolean | null;
  selected: string | null;
  answer: string;
  options: QuestionOption[];
  explanation: string;
  teachingPoint: string | null;
  animation: AnimationData | null;
}) {
  return (
    <section className="rounded-lg border border-border bg-muted/40 text-foreground p-4 space-y-4 text-[15px] leading-7">
      <header className="flex items-center justify-between gap-2">
        <h3 className={cn("font-semibold", isCorrect ? "text-success" : "text-danger")}>
          {isCorrect ? "Correct" : `Incorrect`} · Answer {answer}
          {selected && !isCorrect && <span className="text-muted-foreground font-normal"> (you chose {selected})</span>}
        </h3>
        <ReportButton itemType="question" itemId={questionId} />
      </header>
      {animation && (
        <div className="space-y-1">
          <AnimationPlayer id={animation.id} title={animation.title} storyboard={animation.storyboard} durationMs={animation.durationMs} staticFallbackSvg={animation.staticFallbackSvg} />
          <p className="text-xs text-muted-foreground">
            {animation.title}
            {animation.aiDrafted && " · AI-generated animation, physician-reviewed"}
          </p>
        </div>
      )}
      <div>
        <p>{explanation}</p>
      </div>
      <ul className="space-y-2">
        {options.map((o) => (
          <li key={o.label} className={cn("rounded border p-2", o.is_correct ? "border-success/50 bg-green-50 dark:bg-green-950/20" : "border-border")}>
            <span className="font-medium">{o.label}. {o.text}</span>
            <span className={cn("ml-2 text-xs", o.is_correct ? "text-success" : "text-danger")}>{o.is_correct ? "Correct" : "Incorrect"}</span>
            <p className="text-sm text-muted-foreground mt-1">{o.explanation}</p>
          </li>
        ))}
      </ul>
      {teachingPoint && (
        <p className="rounded-md bg-accent/60 p-3 text-sm">
          <span className="font-semibold">Teaching point: </span>
          {teachingPoint}
        </p>
      )}
    </section>
  );
}
