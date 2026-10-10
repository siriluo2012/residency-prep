import { relations, sql } from "drizzle-orm";
import {
  boolean,
  index,
  integer,
  jsonb,
  pgEnum,
  pgTable,
  primaryKey,
  real,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";
import type {
  Media,
  OetPayload,
  QaReport,
  QuestionOption,
  RenderTest,
  StoryboardScene,
} from "@rp/schema";

// ---------- enums (mirror packages/schema/schemas/common.json) ----------

export const examIdEnum = pgEnum("exam_id", ["usmle-step1", "usmle-step2ck", "oet-medicine", "ecfmg"]);
export const tierEnum = pgEnum("tier", ["free", "pro"]);
export const contentStatusEnum = pgEnum("content_status", [
  "draft",
  "in_review",
  "changes_requested",
  "approved",
  "rejected",
  "published",
  "retired",
]);
export const sourceEnum = pgEnum("source_id", ["medqa", "cohort", "claude", "human", "official"]);
export const licenseEnum = pgEnum("license_id", ["MIT", "CC-BY-4.0", "original", "public-facts"]);
export const difficultyEnum = pgEnum("difficulty", ["easy", "medium", "hard"]);
export const roleEnum = pgEnum("user_role", ["student", "reviewer", "physician", "admin"]);
export const itemTypeEnum = pgEnum("item_type", ["question", "flashcard", "animation", "oet_task"]);
export const reviewStateEnum = pgEnum("review_state", ["pending", "in_progress", "approved", "changes_requested", "rejected"]);
export const decisionEnum = pgEnum("decision", ["approve", "request_changes", "reject"]);
export const blockModeEnum = pgEnum("block_mode", ["timed", "tutor"]);
export const oetSubtestEnum = pgEnum("oet_subtest", ["reading", "listening", "writing", "speaking"]);
export const fsrsStateEnum = pgEnum("fsrs_state", ["new", "learning", "review", "relearning"]);

const timestamps = {
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
};

const provenance = {
  source: sourceEnum("source").notNull(),
  sourceRef: text("source_ref"),
  license: licenseEnum("license").notNull(),
  attribution: text("attribution"),
  generatorModel: text("generator_model"),
  generationBatch: text("generation_batch"),
  aiDrafted: boolean("ai_drafted").default(false).notNull(),
};

const publishable = {
  status: contentStatusEnum("status").default("draft").notNull(),
  tier: tierEnum("tier").default("free").notNull(),
  publishedAt: timestamp("published_at", { withTimezone: true }),
  reviewedBy: text("reviewed_by"),
};

// ---------- taxonomy ----------

export const exams = pgTable("exams", {
  id: examIdEnum("id").primaryKey(),
  name: text("name").notNull(),
  description: text("description"),
  officialUrl: text("official_url"),
  verifiedAt: timestamp("verified_at", { withTimezone: true }),
  facts: jsonb("facts").$type<{ key: string; value: string; source_url: string; verified_at: string }[]>().default([]).notNull(),
});

export const topics = pgTable(
  "topics",
  {
    id: text("id").notNull(),
    examId: examIdEnum("exam_id").notNull().references(() => exams.id),
    parentId: text("parent_id"),
    name: text("name").notNull(),
    description: text("description"),
    weightMinPct: real("weight_min_pct"),
    weightMaxPct: real("weight_max_pct"),
    aliases: jsonb("aliases").$type<string[]>().default([]).notNull(),
    sortOrder: integer("sort_order").default(0).notNull(),
  },
  (t) => [primaryKey({ columns: [t.examId, t.id] }), index("topics_parent_idx").on(t.examId, t.parentId)],
);

// ---------- content ----------

export const questions = pgTable(
  "questions",
  {
    id: text("id").primaryKey(),
    examId: examIdEnum("exam_id").notNull().references(() => exams.id),
    topicId: text("topic_id").notNull(),
    topicIds: jsonb("topic_ids").$type<string[]>().default([]).notNull(),
    questionType: text("question_type"),
    stem: text("stem").notNull(),
    options: jsonb("options").$type<QuestionOption[]>().notNull(),
    answerLabel: text("answer_label").notNull(),
    explanation: text("explanation").notNull(),
    teachingPoint: text("teaching_point"),
    labValuesUsed: boolean("lab_values_used").default(false).notNull(),
    media: jsonb("media").$type<Media[]>().default([]).notNull(),
    animationId: text("animation_id"),
    animationWorthiness: integer("animation_worthiness").default(0).notNull(),
    difficulty: difficultyEnum("difficulty").notNull(),
    evidence: jsonb("evidence").$type<{ title: string; url?: string; year?: number }[]>().default([]).notNull(),
    qa: jsonb("qa").$type<QaReport>(),
    ...provenance,
    ...publishable,
    ...timestamps,
  },
  (t) => [
    index("questions_exam_topic_status_idx").on(t.examId, t.topicId, t.status),
    index("questions_status_idx").on(t.status),
  ],
);

export const flashcards = pgTable(
  "flashcards",
  {
    id: text("id").primaryKey(),
    examId: examIdEnum("exam_id").notNull().references(() => exams.id),
    topicId: text("topic_id").notNull(),
    questionId: text("question_id").references(() => questions.id, { onDelete: "set null" }),
    animationId: text("animation_id"),
    kind: text("kind").default("basic").notNull(),
    front: text("front").notNull(),
    back: text("back").notNull(),
    clozeText: text("cloze_text"),
    extra: text("extra"),
    tags: jsonb("tags").$type<string[]>().default([]).notNull(),
    media: jsonb("media").$type<Media[]>().default([]).notNull(),
    qa: jsonb("qa").$type<QaReport>(),
    ...provenance,
    ...publishable,
    ...timestamps,
  },
  (t) => [index("flashcards_exam_topic_status_idx").on(t.examId, t.topicId, t.status)],
);

export const animations = pgTable(
  "animations",
  {
    id: text("id").primaryKey(),
    slug: text("slug").notNull(),
    title: text("title").notNull(),
    concept: text("concept").notNull(),
    examId: examIdEnum("exam_id").notNull().references(() => exams.id),
    topicId: text("topic_id").notNull(),
    questionIds: jsonb("question_ids").$type<string[]>().default([]).notNull(),
    storyboard: jsonb("storyboard").$type<StoryboardScene[]>().notNull(),
    componentSource: text("component_source").notNull(),
    durationMs: integer("duration_ms").notNull(),
    loop: boolean("loop").default(true).notNull(),
    staticFallbackSvg: text("static_fallback_svg"),
    previewUrl: text("preview_url"),
    exportUrls: jsonb("export_urls").$type<{ webm?: string; gif?: string; mp4?: string }>().default({}).notNull(),
    renderTest: jsonb("render_test").$type<RenderTest>(),
    ...provenance,
    ...publishable,
    ...timestamps,
  },
  (t) => [uniqueIndex("animations_slug_idx").on(t.slug)],
);

export const oetTasks = pgTable("oet_tasks", {
  id: text("id").primaryKey(),
  subtest: oetSubtestEnum("subtest").notNull(),
  part: text("part"),
  title: text("title").notNull(),
  payload: jsonb("payload").$type<OetPayload>().notNull(),
  ...provenance,
  ...publishable,
  ...timestamps,
});

// ---------- review ----------

export const reviewQueue = pgTable(
  "review_queue",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    itemType: itemTypeEnum("item_type").notNull(),
    itemId: text("item_id").notNull(),
    state: reviewStateEnum("state").default("pending").notNull(),
    priority: integer("priority").default(0).notNull(),
    assignedTo: uuid("assigned_to"),
    autoFlags: jsonb("auto_flags").$type<string[]>().default([]).notNull(),
    ...timestamps,
  },
  (t) => [uniqueIndex("review_queue_item_idx").on(t.itemType, t.itemId), index("review_queue_state_idx").on(t.state, t.priority)],
);

export const reviewVotes = pgTable("review_votes", {
  id: uuid("id").defaultRandom().primaryKey(),
  queueId: uuid("queue_id").notNull().references(() => reviewQueue.id, { onDelete: "cascade" }),
  reviewerId: uuid("reviewer_id").notNull(),
  decision: decisionEnum("decision").notNull(),
  reasons: jsonb("reasons").$type<string[]>().default([]).notNull(),
  comment: text("comment"),
  editedPayload: jsonb("edited_payload"),
  timeSpentS: integer("time_spent_s"),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
});

export const itemFeedback = pgTable("item_feedback", {
  id: uuid("id").defaultRandom().primaryKey(),
  itemType: itemTypeEnum("item_type").notNull(),
  itemId: text("item_id").notNull(),
  userId: uuid("user_id"),
  category: text("category").notNull(), // wrong_answer | outdated | typo | unclear | other
  message: text("message"),
  resolved: boolean("resolved").default(false).notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
});

// ---------- users ----------

export const profiles = pgTable("profiles", {
  userId: uuid("user_id").primaryKey(), // = auth.users.id
  displayName: text("display_name"),
  role: roleEnum("role").default("student").notNull(),
  targetExamId: examIdEnum("target_exam_id"),
  examDate: timestamp("exam_date", { withTimezone: true }),
  dailyGoalQuestions: integer("daily_goal_questions").default(40).notNull(),
  dailyGoalCards: integer("daily_goal_cards").default(50).notNull(),
  ...timestamps,
});

export const testBlocks = pgTable(
  "test_blocks",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    userId: uuid("user_id").notNull(),
    examId: examIdEnum("exam_id").notNull(),
    mode: blockModeEnum("mode").notNull(),
    questionIds: jsonb("question_ids").$type<string[]>().notNull(),
    filters: jsonb("filters").$type<Record<string, unknown>>().default({}).notNull(),
    timeLimitS: integer("time_limit_s"),
    startedAt: timestamp("started_at", { withTimezone: true }).defaultNow().notNull(),
    completedAt: timestamp("completed_at", { withTimezone: true }),
  },
  (t) => [index("test_blocks_user_idx").on(t.userId, t.startedAt)],
);

export const attempts = pgTable(
  "attempts",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    userId: uuid("user_id").notNull(),
    blockId: uuid("block_id").references(() => testBlocks.id, { onDelete: "cascade" }),
    questionId: text("question_id").notNull().references(() => questions.id),
    selectedLabel: text("selected_label"),
    isCorrect: boolean("is_correct"),
    timeMs: integer("time_ms"),
    flagged: boolean("flagged").default(false).notNull(),
    struck: jsonb("struck").$type<string[]>().default([]).notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => [index("attempts_user_question_idx").on(t.userId, t.questionId), index("attempts_block_idx").on(t.blockId)],
);

export const fsrsCards = pgTable(
  "fsrs_cards",
  {
    userId: uuid("user_id").notNull(),
    flashcardId: text("flashcard_id").notNull().references(() => flashcards.id, { onDelete: "cascade" }),
    due: timestamp("due", { withTimezone: true }).defaultNow().notNull(),
    stability: real("stability").default(0).notNull(),
    difficulty: real("difficulty").default(0).notNull(),
    elapsedDays: integer("elapsed_days").default(0).notNull(),
    scheduledDays: integer("scheduled_days").default(0).notNull(),
    learningSteps: integer("learning_steps").default(0).notNull(),
    reps: integer("reps").default(0).notNull(),
    lapses: integer("lapses").default(0).notNull(),
    state: fsrsStateEnum("state").default("new").notNull(),
    lastReview: timestamp("last_review", { withTimezone: true }),
    suspended: boolean("suspended").default(false).notNull(),
    buriedUntil: timestamp("buried_until", { withTimezone: true }),
  },
  (t) => [primaryKey({ columns: [t.userId, t.flashcardId] }), index("fsrs_cards_due_idx").on(t.userId, t.due)],
);

export const fsrsReviews = pgTable("fsrs_reviews", {
  id: uuid("id").defaultRandom().primaryKey(),
  userId: uuid("user_id").notNull(),
  flashcardId: text("flashcard_id").notNull(),
  rating: integer("rating").notNull(), // 1 again, 2 hard, 3 good, 4 easy
  state: fsrsStateEnum("state").notNull(),
  due: timestamp("due", { withTimezone: true }).notNull(),
  stability: real("stability").notNull(),
  difficulty: real("difficulty").notNull(),
  elapsedDays: integer("elapsed_days").notNull(),
  scheduledDays: integer("scheduled_days").notNull(),
  reviewedAt: timestamp("reviewed_at", { withTimezone: true }).defaultNow().notNull(),
});

export const oetSubmissions = pgTable("oet_submissions", {
  id: uuid("id").defaultRandom().primaryKey(),
  userId: uuid("user_id").notNull(),
  taskId: text("task_id").notNull().references(() => oetTasks.id),
  response: text("response"),
  answers: jsonb("answers").$type<Record<string, string>>(),
  score: jsonb("score").$type<Record<string, unknown>>(),
  gradedAt: timestamp("graded_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
});

// ---------- ops ----------

export const featureFlags = pgTable("feature_flags", {
  key: text("key").primaryKey(),
  enabled: boolean("enabled").default(false).notNull(),
  payload: jsonb("payload").$type<Record<string, unknown>>().default({}).notNull(),
  description: text("description"),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
});

export const pipelineRuns = pgTable("pipeline_runs", {
  id: uuid("id").defaultRandom().primaryKey(),
  stage: text("stage").notNull(), // ingest | crawl | generate | qa | animate | oet | push
  batch: text("batch").notNull(),
  stats: jsonb("stats").$type<Record<string, unknown>>().default({}).notNull(),
  startedAt: timestamp("started_at", { withTimezone: true }).defaultNow().notNull(),
  finishedAt: timestamp("finished_at", { withTimezone: true }),
});

// ---------- relations ----------

export const questionsRelations = relations(questions, ({ many }) => ({
  flashcards: many(flashcards),
  attempts: many(attempts),
}));

export const flashcardsRelations = relations(flashcards, ({ one }) => ({
  question: one(questions, { fields: [flashcards.questionId], references: [questions.id] }),
}));

export const reviewQueueRelations = relations(reviewQueue, ({ many }) => ({
  votes: many(reviewVotes),
}));

export const reviewVotesRelations = relations(reviewVotes, ({ one }) => ({
  queue: one(reviewQueue, { fields: [reviewVotes.queueId], references: [reviewQueue.id] }),
}));

export const sqlNow = sql`now()`;
