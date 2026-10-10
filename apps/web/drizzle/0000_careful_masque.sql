CREATE TYPE "public"."block_mode" AS ENUM('timed', 'tutor');--> statement-breakpoint
CREATE TYPE "public"."content_status" AS ENUM('draft', 'in_review', 'changes_requested', 'approved', 'rejected', 'published', 'retired');--> statement-breakpoint
CREATE TYPE "public"."decision" AS ENUM('approve', 'request_changes', 'reject');--> statement-breakpoint
CREATE TYPE "public"."difficulty" AS ENUM('easy', 'medium', 'hard');--> statement-breakpoint
CREATE TYPE "public"."exam_id" AS ENUM('usmle-step1', 'usmle-step2ck', 'oet-medicine', 'ecfmg');--> statement-breakpoint
CREATE TYPE "public"."fsrs_state" AS ENUM('new', 'learning', 'review', 'relearning');--> statement-breakpoint
CREATE TYPE "public"."item_type" AS ENUM('question', 'flashcard', 'animation', 'oet_task');--> statement-breakpoint
CREATE TYPE "public"."license_id" AS ENUM('MIT', 'CC-BY-4.0', 'original', 'public-facts');--> statement-breakpoint
CREATE TYPE "public"."oet_subtest" AS ENUM('reading', 'listening', 'writing', 'speaking');--> statement-breakpoint
CREATE TYPE "public"."review_state" AS ENUM('pending', 'in_progress', 'approved', 'changes_requested', 'rejected');--> statement-breakpoint
CREATE TYPE "public"."user_role" AS ENUM('student', 'reviewer', 'physician', 'admin');--> statement-breakpoint
CREATE TYPE "public"."source_id" AS ENUM('medqa', 'cohort', 'claude', 'human', 'official');--> statement-breakpoint
CREATE TYPE "public"."tier" AS ENUM('free', 'pro');--> statement-breakpoint
CREATE TABLE "animations" (
	"id" text PRIMARY KEY NOT NULL,
	"slug" text NOT NULL,
	"title" text NOT NULL,
	"concept" text NOT NULL,
	"exam_id" "exam_id" NOT NULL,
	"topic_id" text NOT NULL,
	"question_ids" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"storyboard" jsonb NOT NULL,
	"component_source" text NOT NULL,
	"duration_ms" integer NOT NULL,
	"loop" boolean DEFAULT true NOT NULL,
	"static_fallback_svg" text,
	"preview_url" text,
	"export_urls" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"render_test" jsonb,
	"source" "source_id" NOT NULL,
	"source_ref" text,
	"license" "license_id" NOT NULL,
	"attribution" text,
	"generator_model" text,
	"generation_batch" text,
	"ai_drafted" boolean DEFAULT false NOT NULL,
	"status" "content_status" DEFAULT 'draft' NOT NULL,
	"tier" "tier" DEFAULT 'free' NOT NULL,
	"published_at" timestamp with time zone,
	"reviewed_by" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "attempts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"block_id" uuid,
	"question_id" text NOT NULL,
	"selected_label" text,
	"is_correct" boolean,
	"time_ms" integer,
	"flagged" boolean DEFAULT false NOT NULL,
	"struck" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "exams" (
	"id" "exam_id" PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"description" text,
	"official_url" text,
	"verified_at" timestamp with time zone,
	"facts" jsonb DEFAULT '[]'::jsonb NOT NULL
);
--> statement-breakpoint
CREATE TABLE "feature_flags" (
	"key" text PRIMARY KEY NOT NULL,
	"enabled" boolean DEFAULT false NOT NULL,
	"payload" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"description" text,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "flashcards" (
	"id" text PRIMARY KEY NOT NULL,
	"exam_id" "exam_id" NOT NULL,
	"topic_id" text NOT NULL,
	"question_id" text,
	"animation_id" text,
	"kind" text DEFAULT 'basic' NOT NULL,
	"front" text NOT NULL,
	"back" text NOT NULL,
	"cloze_text" text,
	"extra" text,
	"tags" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"media" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"qa" jsonb,
	"source" "source_id" NOT NULL,
	"source_ref" text,
	"license" "license_id" NOT NULL,
	"attribution" text,
	"generator_model" text,
	"generation_batch" text,
	"ai_drafted" boolean DEFAULT false NOT NULL,
	"status" "content_status" DEFAULT 'draft' NOT NULL,
	"tier" "tier" DEFAULT 'free' NOT NULL,
	"published_at" timestamp with time zone,
	"reviewed_by" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "fsrs_cards" (
	"user_id" uuid NOT NULL,
	"flashcard_id" text NOT NULL,
	"due" timestamp with time zone DEFAULT now() NOT NULL,
	"stability" real DEFAULT 0 NOT NULL,
	"difficulty" real DEFAULT 0 NOT NULL,
	"elapsed_days" integer DEFAULT 0 NOT NULL,
	"scheduled_days" integer DEFAULT 0 NOT NULL,
	"learning_steps" integer DEFAULT 0 NOT NULL,
	"reps" integer DEFAULT 0 NOT NULL,
	"lapses" integer DEFAULT 0 NOT NULL,
	"state" "fsrs_state" DEFAULT 'new' NOT NULL,
	"last_review" timestamp with time zone,
	"suspended" boolean DEFAULT false NOT NULL,
	"buried_until" timestamp with time zone,
	CONSTRAINT "fsrs_cards_user_id_flashcard_id_pk" PRIMARY KEY("user_id","flashcard_id")
);
--> statement-breakpoint
CREATE TABLE "fsrs_reviews" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"flashcard_id" text NOT NULL,
	"rating" integer NOT NULL,
	"state" "fsrs_state" NOT NULL,
	"due" timestamp with time zone NOT NULL,
	"stability" real NOT NULL,
	"difficulty" real NOT NULL,
	"elapsed_days" integer NOT NULL,
	"scheduled_days" integer NOT NULL,
	"reviewed_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "item_feedback" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"item_type" "item_type" NOT NULL,
	"item_id" text NOT NULL,
	"user_id" uuid,
	"category" text NOT NULL,
	"message" text,
	"resolved" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "oet_submissions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"task_id" text NOT NULL,
	"response" text,
	"answers" jsonb,
	"score" jsonb,
	"graded_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "oet_tasks" (
	"id" text PRIMARY KEY NOT NULL,
	"subtest" "oet_subtest" NOT NULL,
	"part" text,
	"title" text NOT NULL,
	"payload" jsonb NOT NULL,
	"source" "source_id" NOT NULL,
	"source_ref" text,
	"license" "license_id" NOT NULL,
	"attribution" text,
	"generator_model" text,
	"generation_batch" text,
	"ai_drafted" boolean DEFAULT false NOT NULL,
	"status" "content_status" DEFAULT 'draft' NOT NULL,
	"tier" "tier" DEFAULT 'free' NOT NULL,
	"published_at" timestamp with time zone,
	"reviewed_by" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "pipeline_runs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"stage" text NOT NULL,
	"batch" text NOT NULL,
	"stats" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"started_at" timestamp with time zone DEFAULT now() NOT NULL,
	"finished_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "profiles" (
	"user_id" uuid PRIMARY KEY NOT NULL,
	"display_name" text,
	"role" "user_role" DEFAULT 'student' NOT NULL,
	"target_exam_id" "exam_id",
	"exam_date" timestamp with time zone,
	"daily_goal_questions" integer DEFAULT 40 NOT NULL,
	"daily_goal_cards" integer DEFAULT 50 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "questions" (
	"id" text PRIMARY KEY NOT NULL,
	"exam_id" "exam_id" NOT NULL,
	"topic_id" text NOT NULL,
	"topic_ids" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"question_type" text,
	"stem" text NOT NULL,
	"options" jsonb NOT NULL,
	"answer_label" text NOT NULL,
	"explanation" text NOT NULL,
	"teaching_point" text,
	"lab_values_used" boolean DEFAULT false NOT NULL,
	"media" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"animation_id" text,
	"animation_worthiness" integer DEFAULT 0 NOT NULL,
	"difficulty" "difficulty" NOT NULL,
	"evidence" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"qa" jsonb,
	"source" "source_id" NOT NULL,
	"source_ref" text,
	"license" "license_id" NOT NULL,
	"attribution" text,
	"generator_model" text,
	"generation_batch" text,
	"ai_drafted" boolean DEFAULT false NOT NULL,
	"status" "content_status" DEFAULT 'draft' NOT NULL,
	"tier" "tier" DEFAULT 'free' NOT NULL,
	"published_at" timestamp with time zone,
	"reviewed_by" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "review_queue" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"item_type" "item_type" NOT NULL,
	"item_id" text NOT NULL,
	"state" "review_state" DEFAULT 'pending' NOT NULL,
	"priority" integer DEFAULT 0 NOT NULL,
	"assigned_to" uuid,
	"auto_flags" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "review_votes" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"queue_id" uuid NOT NULL,
	"reviewer_id" uuid NOT NULL,
	"decision" "decision" NOT NULL,
	"reasons" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"comment" text,
	"edited_payload" jsonb,
	"time_spent_s" integer,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "test_blocks" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"exam_id" "exam_id" NOT NULL,
	"mode" "block_mode" NOT NULL,
	"question_ids" jsonb NOT NULL,
	"filters" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"time_limit_s" integer,
	"started_at" timestamp with time zone DEFAULT now() NOT NULL,
	"completed_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "topics" (
	"id" text NOT NULL,
	"exam_id" "exam_id" NOT NULL,
	"parent_id" text,
	"name" text NOT NULL,
	"description" text,
	"weight_min_pct" real,
	"weight_max_pct" real,
	"aliases" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"sort_order" integer DEFAULT 0 NOT NULL,
	CONSTRAINT "topics_exam_id_id_pk" PRIMARY KEY("exam_id","id")
);
--> statement-breakpoint
ALTER TABLE "animations" ADD CONSTRAINT "animations_exam_id_exams_id_fk" FOREIGN KEY ("exam_id") REFERENCES "public"."exams"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "attempts" ADD CONSTRAINT "attempts_block_id_test_blocks_id_fk" FOREIGN KEY ("block_id") REFERENCES "public"."test_blocks"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "attempts" ADD CONSTRAINT "attempts_question_id_questions_id_fk" FOREIGN KEY ("question_id") REFERENCES "public"."questions"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "flashcards" ADD CONSTRAINT "flashcards_exam_id_exams_id_fk" FOREIGN KEY ("exam_id") REFERENCES "public"."exams"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "flashcards" ADD CONSTRAINT "flashcards_question_id_questions_id_fk" FOREIGN KEY ("question_id") REFERENCES "public"."questions"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "fsrs_cards" ADD CONSTRAINT "fsrs_cards_flashcard_id_flashcards_id_fk" FOREIGN KEY ("flashcard_id") REFERENCES "public"."flashcards"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "oet_submissions" ADD CONSTRAINT "oet_submissions_task_id_oet_tasks_id_fk" FOREIGN KEY ("task_id") REFERENCES "public"."oet_tasks"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "questions" ADD CONSTRAINT "questions_exam_id_exams_id_fk" FOREIGN KEY ("exam_id") REFERENCES "public"."exams"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "review_votes" ADD CONSTRAINT "review_votes_queue_id_review_queue_id_fk" FOREIGN KEY ("queue_id") REFERENCES "public"."review_queue"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "topics" ADD CONSTRAINT "topics_exam_id_exams_id_fk" FOREIGN KEY ("exam_id") REFERENCES "public"."exams"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "animations_slug_idx" ON "animations" USING btree ("slug");--> statement-breakpoint
CREATE INDEX "attempts_user_question_idx" ON "attempts" USING btree ("user_id","question_id");--> statement-breakpoint
CREATE INDEX "attempts_block_idx" ON "attempts" USING btree ("block_id");--> statement-breakpoint
CREATE INDEX "flashcards_exam_topic_status_idx" ON "flashcards" USING btree ("exam_id","topic_id","status");--> statement-breakpoint
CREATE INDEX "fsrs_cards_due_idx" ON "fsrs_cards" USING btree ("user_id","due");--> statement-breakpoint
CREATE INDEX "questions_exam_topic_status_idx" ON "questions" USING btree ("exam_id","topic_id","status");--> statement-breakpoint
CREATE INDEX "questions_status_idx" ON "questions" USING btree ("status");--> statement-breakpoint
CREATE UNIQUE INDEX "review_queue_item_idx" ON "review_queue" USING btree ("item_type","item_id");--> statement-breakpoint
CREATE INDEX "review_queue_state_idx" ON "review_queue" USING btree ("state","priority");--> statement-breakpoint
CREATE INDEX "test_blocks_user_idx" ON "test_blocks" USING btree ("user_id","started_at");--> statement-breakpoint
CREATE INDEX "topics_parent_idx" ON "topics" USING btree ("exam_id","parent_id");