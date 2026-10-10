/**
 * Thin wrapper over ts-fsrs so the rest of the app only deals with our DB row shape.
 * See docs/DECISIONS.md ADR-001.
 */
import { createEmptyCard, fsrs, generatorParameters, Rating, State, type Card, type Grade } from "ts-fsrs";
import type { fsrsCards } from "@/db/schema";

export type FsrsRow = typeof fsrsCards.$inferSelect;
export type FsrsRating = 1 | 2 | 3 | 4;

const params = generatorParameters({
  request_retention: 0.9,
  maximum_interval: 365,
  enable_fuzz: true,
  enable_short_term: true,
});
const scheduler = fsrs(params);

const STATE_TO_DB: Record<State, FsrsRow["state"]> = {
  [State.New]: "new",
  [State.Learning]: "learning",
  [State.Review]: "review",
  [State.Relearning]: "relearning",
};
const DB_TO_STATE: Record<FsrsRow["state"], State> = {
  new: State.New,
  learning: State.Learning,
  review: State.Review,
  relearning: State.Relearning,
};

export function rowToCard(row: Pick<FsrsRow, "due" | "stability" | "difficulty" | "elapsedDays" | "scheduledDays" | "reps" | "lapses" | "state" | "lastReview" | "learningSteps">): Card {
  return {
    due: row.due,
    stability: row.stability,
    difficulty: row.difficulty,
    elapsed_days: row.elapsedDays,
    scheduled_days: row.scheduledDays,
    learning_steps: row.learningSteps,
    reps: row.reps,
    lapses: row.lapses,
    state: DB_TO_STATE[row.state],
    last_review: row.lastReview ?? undefined,
  };
}

export function cardToRow(card: Card) {
  return {
    due: card.due,
    stability: card.stability,
    difficulty: card.difficulty,
    elapsedDays: card.elapsed_days,
    scheduledDays: card.scheduled_days,
    learningSteps: card.learning_steps,
    reps: card.reps,
    lapses: card.lapses,
    state: STATE_TO_DB[card.state],
    lastReview: card.last_review ?? null,
  };
}

export function newCardRow(now = new Date()) {
  return cardToRow(createEmptyCard(now));
}

/** Preview next intervals for all four ratings (for the "Again 1m / Good 3d" buttons). */
export function previewIntervals(row: Parameters<typeof rowToCard>[0], now = new Date()) {
  const card = rowToCard(row);
  const preview = scheduler.repeat(card, now);
  const out: Record<FsrsRating, { due: Date; label: string }> = {} as never;
  for (const r of [Rating.Again, Rating.Hard, Rating.Good, Rating.Easy] as Grade[]) {
    const item = preview[r];
    out[r as FsrsRating] = { due: item.card.due, label: humanInterval(item.card.due.getTime() - now.getTime()) };
  }
  return out;
}

/** Apply a rating and return the updated row fields plus a review-log row. */
export function applyRating(row: Parameters<typeof rowToCard>[0], rating: FsrsRating, now = new Date()) {
  const card = rowToCard(row);
  const result = scheduler.next(card, now, rating as Grade);
  return {
    card: cardToRow(result.card),
    log: {
      rating,
      state: STATE_TO_DB[result.log.state],
      due: result.log.due,
      stability: result.log.stability,
      difficulty: result.log.difficulty,
      elapsedDays: result.log.elapsed_days,
      scheduledDays: result.log.scheduled_days,
      reviewedAt: now,
    },
  };
}

export function humanInterval(ms: number): string {
  const m = Math.round(ms / 60000);
  if (m < 60) return `${Math.max(m, 1)}m`;
  const h = Math.round(m / 60);
  if (h < 24) return `${h}h`;
  const d = Math.round(h / 24);
  if (d < 30) return `${d}d`;
  const mo = Math.round(d / 30);
  if (mo < 12) return `${mo}mo`;
  return `${(d / 365).toFixed(1)}y`;
}
