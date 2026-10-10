/**
 * TypeScript mirror of the JSON Schemas in ../schemas.
 * The JSON Schemas are the source of truth; keep these in sync (checked by scripts/validate-examples.mjs).
 */

export const EXAM_IDS = ["usmle-step1", "usmle-step2ck", "oet-medicine", "ecfmg"] as const;
export type ExamId = (typeof EXAM_IDS)[number];

export const TIERS = ["free", "pro"] as const;
export type Tier = (typeof TIERS)[number];

export const CONTENT_STATUSES = [
  "draft",
  "in_review",
  "changes_requested",
  "approved",
  "rejected",
  "published",
  "retired",
] as const;
export type ContentStatus = (typeof CONTENT_STATUSES)[number];

export const SOURCE_IDS = ["medqa", "cohort", "claude", "human", "official"] as const;
export type SourceId = (typeof SOURCE_IDS)[number];

/** Fail-closed allow-list. Anything else is never publishable. */
export const LICENSE_IDS = ["MIT", "CC-BY-4.0", "original", "public-facts"] as const;
export type LicenseId = (typeof LICENSE_IDS)[number];

export const DIFFICULTIES = ["easy", "medium", "hard"] as const;
export type Difficulty = (typeof DIFFICULTIES)[number];

export const QUESTION_TYPES = [
  "diagnosis",
  "mechanism",
  "next_step",
  "pharmacology",
  "biostatistics",
  "ethics",
  "pathophysiology",
  "anatomy",
  "microbiology",
  "other",
] as const;
export type QuestionType = (typeof QUESTION_TYPES)[number];

export interface Provenance {
  source: SourceId;
  source_ref?: string;
  license: LicenseId;
  attribution?: string;
  generator_model?: string;
  generation_batch?: string;
  ai_drafted?: boolean;
}

export interface Media {
  kind: "image" | "svg" | "audio" | "video" | "animation";
  url: string;
  alt?: string;
  caption?: string;
  license?: LicenseId;
  attribution?: string;
}

export interface Timestamps {
  created_at?: string;
  updated_at?: string;
  published_at?: string | null;
}

export interface QuestionOption {
  label: "A" | "B" | "C" | "D" | "E" | "F";
  text: string;
  is_correct: boolean;
  explanation: string;
  misconception?: string;
}

export interface QaReport {
  schema_ok?: boolean;
  max_similarity?: number;
  nearest_source_ref?: string;
  flags?: string[];
  readability_grade?: number;
}

export interface Question extends Timestamps {
  id: string;
  exam_id: ExamId;
  topic_id: string;
  topic_ids?: string[];
  question_type?: QuestionType;
  stem: string;
  options: QuestionOption[];
  answer_label: QuestionOption["label"];
  explanation: string;
  teaching_point?: string;
  lab_values_used?: boolean;
  media?: Media[];
  animation_id?: string | null;
  animation_worthiness?: number;
  difficulty: Difficulty;
  evidence?: { title: string; url?: string; year?: number }[];
  provenance: Provenance;
  status: ContentStatus;
  tier?: Tier;
  qa?: QaReport;
}

export interface Flashcard extends Timestamps {
  id: string;
  exam_id: ExamId;
  topic_id: string;
  question_id?: string | null;
  animation_id?: string | null;
  kind?: "basic" | "cloze" | "image_occlusion";
  front: string;
  back: string;
  cloze_text?: string;
  extra?: string;
  tags?: string[];
  media?: Media[];
  provenance: Provenance;
  status: ContentStatus;
  tier?: Tier;
  qa?: QaReport;
}

export interface StoryboardScene {
  scene: string;
  start_ms: number;
  end_ms: number;
  caption: string;
  visual?: string;
}

export interface RenderTest {
  passed: boolean;
  scenes_captured?: number;
  errors?: string[];
  tested_at?: string;
}

export interface Animation extends Timestamps {
  id: string;
  slug: string;
  title: string;
  concept: string;
  exam_id: ExamId;
  topic_id: string;
  question_ids?: string[];
  storyboard: StoryboardScene[];
  component_source: string;
  duration_ms: number;
  loop?: boolean;
  static_fallback_svg?: string;
  preview_url?: string | null;
  export_urls?: { webm?: string; gif?: string; mp4?: string };
  render_test?: RenderTest;
  provenance: Provenance;
  status: ContentStatus;
  tier?: Tier;
}

export interface Topic {
  id: string;
  name: string;
  description?: string;
  weight_min_pct?: number;
  weight_max_pct?: number;
  aliases?: string[];
  children?: Topic[];
}

export interface ExamFact {
  key: string;
  value: string;
  source_url: string;
  verified_at: string;
}

export interface ExamTaxonomy {
  exam_id: ExamId;
  name: string;
  description?: string;
  official_url?: string;
  verified_at?: string;
  facts?: ExamFact[];
  topics: Topic[];
}

export const ITEM_TYPES = ["question", "flashcard", "animation", "oet_task"] as const;
export type ItemType = (typeof ITEM_TYPES)[number];

export const REVIEW_STATES = ["pending", "in_progress", "approved", "changes_requested", "rejected"] as const;
export type ReviewState = (typeof REVIEW_STATES)[number];

export const DECISIONS = ["approve", "request_changes", "reject"] as const;
export type Decision = (typeof DECISIONS)[number];

export const REJECTION_REASONS = [
  "clinically_incorrect",
  "outdated_guideline",
  "ambiguous_stem",
  "multiple_correct",
  "not_original",
  "off_blueprint",
  "poor_distractors",
  "formatting",
  "other",
] as const;
export type RejectionReason = (typeof REJECTION_REASONS)[number];

export type OetSubtest = "reading" | "listening" | "writing" | "speaking";

export interface OetComprehensionItem {
  type?: "mcq" | "gap_fill" | "short_answer" | "matching";
  prompt: string;
  options?: string[];
  answer: string;
  accepted_answers?: string[];
  explanation?: string;
}

export type OetPayload =
  | { kind: "comprehension"; passage: string; audio_url?: string | null; items: OetComprehensionItem[] }
  | {
      kind: "referral_letter";
      case_notes: string;
      task_instruction: string;
      recipient: string;
      word_limit?: number;
      model_answer?: string;
      key_content_points?: string[];
    }
  | {
      kind: "role_play";
      setting: string;
      candidate_card: string;
      interlocutor_card: string;
      model_dialogue?: string;
      assessment_focus?: string[];
    };

export interface OetTask extends Timestamps {
  id: string;
  subtest: OetSubtest;
  part?: string;
  title: string;
  payload: OetPayload;
  provenance: Provenance;
  status: ContentStatus;
  tier?: Tier;
}

/** OET writing criteria (public assessment criteria, used by the letter grader). */
export const OET_WRITING_CRITERIA = [
  "purpose",
  "content",
  "conciseness_and_clarity",
  "genre_and_style",
  "organisation_and_layout",
  "language",
] as const;
export type OetWritingCriterion = (typeof OET_WRITING_CRITERIA)[number];

export function isPublishableLicense(license: string | null | undefined): license is LicenseId {
  return !!license && (LICENSE_IDS as readonly string[]).includes(license);
}

/** Legal content transitions. Publishing requires approved; retiring requires published. */
export const STATUS_TRANSITIONS: Record<ContentStatus, ContentStatus[]> = {
  draft: ["in_review", "rejected"],
  in_review: ["approved", "changes_requested", "rejected"],
  changes_requested: ["in_review", "rejected"],
  approved: ["published", "in_review"],
  rejected: ["in_review"],
  published: ["retired", "in_review"],
  retired: ["in_review"],
};

export function canTransition(from: ContentStatus, to: ContentStatus): boolean {
  return STATUS_TRANSITIONS[from]?.includes(to) ?? false;
}

export * from "./animation-contract";
