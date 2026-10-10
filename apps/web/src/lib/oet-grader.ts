/**
 * Rule-based OET Writing practice grader.
 *
 * Used when ANTHROPIC_API_KEY is not set. It scores the six official criteria from
 * observable letter features (purpose language, coverage of key content points, length,
 * layout, register) so students can still practise without a paid API. This is a study
 * aid, not an OET result.
 */
import { OET_WRITING_CRITERIA } from "@rp/schema";

export type CriterionId = (typeof OET_WRITING_CRITERIA)[number];

export interface HeuristicGrade {
  criteria: { criterion: CriterionId; band: number; evidence: string[]; comment: string }[];
  overall_score: number;
  grade_letter: string;
  missed_key_points: string[];
  suggestions: string[];
  source: "heuristic";
}

const PURPOSE_RE = /\b(i am writing|i write|please (see|accept|review)|referr(?:ing|al)|would you (please )?(see|review|accept))\b/i;
const GREETING_RE = /^\s*(dear|to)\b/im;
const CLOSE_RE = /\b(yours (sincerely|faithfully)|kind regards|best regards)\b/i;
const SLANG_RE = /\b(gonna|wanna|yeah|ok\b|okay|cheers|btw|lol)\b/i;
const FIRST_NAME_OPEN_RE = /^\s*dear\s+[A-Z][a-z]+(\s|,)/m;

function tokens(s: string): Set<string> {
  return new Set(
    s
      .toLowerCase()
      .replace(/[^a-z0-9\s]/g, " ")
      .split(/\s+/)
      .filter((w) => w.length > 3),
  );
}

function coverage(letter: string, point: string): number {
  const lt = tokens(letter);
  const pt = [...tokens(point)].filter((w) => !STOP.has(w));
  if (pt.length === 0) return 1;
  const hit = pt.filter((w) => lt.has(w)).length;
  return hit / pt.length;
}

const STOP = new Set([
  "that", "this", "with", "from", "have", "been", "were", "they", "their", "which",
  "about", "after", "before", "into", "your", "please", "would", "could", "should",
  "patient", "history", "referral",
]);

function clampBand(n: number): number {
  return Math.max(0, Math.min(7, Math.round(n)));
}

function letterFromScore(score: number): string {
  if (score >= 450) return "A";
  if (score >= 350) return "B";
  if (score >= 300) return "C+";
  if (score >= 200) return "C";
  return "D";
}

export function heuristicGrade(letter: string, opts: {
  keyPoints: string[];
  recipient: string;
  instruction: string;
  wordLimit: number;
}): HeuristicGrade {
  const text = letter.trim();
  const words = text ? text.split(/\s+/).length : 0;
  const paras = text.split(/\n\s*\n/).filter((p) => p.trim().length > 40);
  const limit = opts.wordLimit || 200;

  const cover = opts.keyPoints.map((k) => ({ k, c: coverage(text, k) }));
  const missed = cover.filter((x) => x.c < 0.35).map((x) => x.k);
  const meanCover = cover.length ? cover.reduce((s, x) => s + x.c, 0) / cover.length : 0;

  const purposeHit = PURPOSE_RE.test(text) || /refer/i.test(opts.instruction) && /refer/i.test(text);
  const greetingOk = GREETING_RE.test(text);
  const closeOk = CLOSE_RE.test(text);
  const slang = SLANG_RE.test(text);
  const firstName = FIRST_NAME_OPEN_RE.test(text) && !/\bdr\b/i.test(text.slice(0, 40));
  const recipientHit = opts.recipient.split(/\s+/).filter((w) => w.length > 3).some((w) => text.toLowerCase().includes(w.toLowerCase()));

  const over = words > limit + 40;
  const under = words < Math.max(80, limit - 60);
  const lengthBand = over || under ? (over ? 3.5 : 3) : words >= limit - 20 && words <= limit + 20 ? 6 : 5;

  const purpose = clampBand(purposeHit && greetingOk ? 6 : purposeHit ? 4.5 : 2.5);
  const content = clampBand(2 + meanCover * 5 - (missed.length > 3 ? 1 : 0));
  const concision = clampBand(lengthBand - (paras.length > 8 ? 1 : 0));
  const genre = clampBand((greetingOk ? 2 : 0) + (closeOk ? 2 : 0) + (recipientHit ? 1 : 0) + (slang || firstName ? 0 : 2));
  const organisation = clampBand(paras.length >= 3 ? 6 : paras.length === 2 ? 4.5 : 3);
  const language = clampBand(slang ? 3 : text.split(/[.!?]/).length > 8 ? 5.5 : 4.5);

  const bands: Record<CriterionId, number> = {
    purpose,
    content,
    conciseness_and_clarity: concision,
    genre_and_style: genre,
    organisation_and_layout: organisation,
    language,
  };

  const comments: Record<CriterionId, string> = {
    purpose: purposeHit
      ? "The letter states a clinical purpose."
      : "Open with a clear purpose (why you are writing and what you want the reader to do).",
    content: missed.length
      ? `Covered about ${Math.round(meanCover * 100)}% of the key points; some required information is missing.`
      : "The required case information appears to be present.",
    conciseness_and_clarity: over
      ? `Over the ~${limit}-word target (${words} words). Trim background that the reader does not need.`
      : under
        ? `Under the ~${limit}-word target (${words} words). Expand the request and relevant history.`
        : `${words} words, within the usual OET range.`,
    genre_and_style: slang || firstName
      ? "Register is too informal for a professional referral. Use a title and surname, not first names or slang."
      : greetingOk && closeOk
        ? "Letter genre is in place (salutation and closing)."
        : "Add a formal greeting (Dear Dr …) and a closing (Yours sincerely).",
    organisation_and_layout: paras.length >= 3
      ? "The letter is broken into paragraphs."
      : "Use short paragraphs: purpose, history, current status, request.",
    language: slang
      ? "Informal wording will cost marks on language."
      : "No slang detected. This is a surface check, not a grammar assessment.",
  };

  const evidence: Record<CriterionId, string[]> = {
    purpose: purposeHit ? [text.slice(0, 120)] : [],
    content: missed.slice(0, 2),
    conciseness_and_clarity: [`${words} words (target ~${limit})`],
    genre_and_style: greetingOk ? [text.split("\n")[0].slice(0, 80)] : [],
    organisation_and_layout: [`${paras.length} paragraph(s)`],
    language: slang ? ["informal wording present"] : [],
  };

  const mean = Object.values(bands).reduce((s, n) => s + n, 0) / 6;
  const overall = Math.max(0, Math.min(500, Math.round(mean * (500 / 7))));

  const suggestions: string[] = [];
  if (!purposeHit) suggestions.push("State the purpose in the first sentence: who you are writing about and what you want.");
  if (missed.length) suggestions.push(`Include: ${missed[0]}`);
  if (over) suggestions.push("Cut information the specialist already has or that does not affect the request.");
  if (under) suggestions.push("Add current medications, relevant history, and a specific request.");
  if (!greetingOk || !closeOk) suggestions.push("Use a standard letter frame: Dear Dr … / Yours sincerely, followed by your name and position.");
  if (slang) suggestions.push("Replace informal wording with clinical register.");
  if (suggestions.length < 3) suggestions.push("Name the receiving clinician and finish with a specific, polite request.");
  if (suggestions.length < 3) suggestions.push("Keep to one idea per paragraph so the reader can scan the letter.");

  return {
    criteria: OET_WRITING_CRITERIA.map((criterion) => ({
      criterion,
      band: bands[criterion],
      evidence: evidence[criterion].slice(0, 3),
      comment: comments[criterion],
    })),
    overall_score: overall,
    grade_letter: letterFromScore(overall),
    missed_key_points: missed,
    suggestions: suggestions.slice(0, 5),
    source: "heuristic",
  };
}
