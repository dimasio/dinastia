CREATE TYPE "public"."quiz_attempt_status" AS ENUM('in_progress', 'submitted', 'graded');--> statement-breakpoint
CREATE TABLE "attempt_question_items" (
	"id" uuid PRIMARY KEY DEFAULT uuidv7() NOT NULL,
	"school_id" uuid DEFAULT nullif(current_setting('app.school_id', true), '')::uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"attempt_question_id" uuid NOT NULL,
	"item_id" uuid NOT NULL,
	"position" integer NOT NULL,
	CONSTRAINT "attempt_question_items_school_id_id_key" UNIQUE("school_id","id")
);
--> statement-breakpoint
ALTER TABLE "attempt_question_items" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "attempt_questions" (
	"id" uuid PRIMARY KEY DEFAULT uuidv7() NOT NULL,
	"school_id" uuid DEFAULT nullif(current_setting('app.school_id', true), '')::uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"attempt_id" uuid NOT NULL,
	"question_id" uuid NOT NULL,
	"position" integer NOT NULL,
	"points" integer NOT NULL,
	CONSTRAINT "attempt_questions_school_id_id_key" UNIQUE("school_id","id")
);
--> statement-breakpoint
ALTER TABLE "attempt_questions" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "quiz_answer_items" (
	"id" uuid PRIMARY KEY DEFAULT uuidv7() NOT NULL,
	"school_id" uuid DEFAULT nullif(current_setting('app.school_id', true), '')::uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"answer_id" uuid NOT NULL,
	"item_id" uuid NOT NULL,
	"position" integer,
	"matched_item_id" uuid,
	CONSTRAINT "quiz_answer_items_school_id_id_key" UNIQUE("school_id","id")
);
--> statement-breakpoint
ALTER TABLE "quiz_answer_items" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "quiz_answers" (
	"id" uuid PRIMARY KEY DEFAULT uuidv7() NOT NULL,
	"school_id" uuid DEFAULT nullif(current_setting('app.school_id', true), '')::uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"attempt_question_id" uuid NOT NULL,
	"text_value" text,
	"number_value" double precision,
	"score" double precision,
	"is_correct" boolean,
	"answered_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "quiz_answers_school_id_id_key" UNIQUE("school_id","id")
);
--> statement-breakpoint
ALTER TABLE "quiz_answers" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "quiz_attempts" (
	"id" uuid PRIMARY KEY DEFAULT uuidv7() NOT NULL,
	"school_id" uuid DEFAULT nullif(current_setting('app.school_id', true), '')::uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"enrollment_id" uuid NOT NULL,
	"lesson_id" uuid NOT NULL,
	"block_key" uuid NOT NULL,
	"status" "quiz_attempt_status" DEFAULT 'in_progress' NOT NULL,
	"score" double precision DEFAULT 0 NOT NULL,
	"max_score" integer DEFAULT 0 NOT NULL,
	"passed" boolean,
	"started_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deadline_at" timestamp with time zone,
	"submitted_at" timestamp with time zone,
	"graded_at" timestamp with time zone,
	CONSTRAINT "quiz_attempts_school_id_id_key" UNIQUE("school_id","id")
);
--> statement-breakpoint
ALTER TABLE "quiz_attempts" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "attempt_question_items" ADD CONSTRAINT "attempt_question_items_school_id_schools_id_fk" FOREIGN KEY ("school_id") REFERENCES "public"."schools"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "attempt_question_items" ADD CONSTRAINT "attempt_question_items_school_id_attempt_question_id_attempt_questions_school_id_id_fk" FOREIGN KEY ("school_id","attempt_question_id") REFERENCES "public"."attempt_questions"("school_id","id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "attempt_question_items" ADD CONSTRAINT "attempt_question_items_school_id_item_id_question_items_school_id_id_fk" FOREIGN KEY ("school_id","item_id") REFERENCES "public"."question_items"("school_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "attempt_questions" ADD CONSTRAINT "attempt_questions_school_id_schools_id_fk" FOREIGN KEY ("school_id") REFERENCES "public"."schools"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "attempt_questions" ADD CONSTRAINT "attempt_questions_school_id_attempt_id_quiz_attempts_school_id_id_fk" FOREIGN KEY ("school_id","attempt_id") REFERENCES "public"."quiz_attempts"("school_id","id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "attempt_questions" ADD CONSTRAINT "attempt_questions_school_id_question_id_questions_school_id_id_fk" FOREIGN KEY ("school_id","question_id") REFERENCES "public"."questions"("school_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "quiz_answer_items" ADD CONSTRAINT "quiz_answer_items_school_id_schools_id_fk" FOREIGN KEY ("school_id") REFERENCES "public"."schools"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "quiz_answer_items" ADD CONSTRAINT "quiz_answer_items_school_id_answer_id_quiz_answers_school_id_id_fk" FOREIGN KEY ("school_id","answer_id") REFERENCES "public"."quiz_answers"("school_id","id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "quiz_answer_items" ADD CONSTRAINT "quiz_answer_items_school_id_item_id_question_items_school_id_id_fk" FOREIGN KEY ("school_id","item_id") REFERENCES "public"."question_items"("school_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "quiz_answers" ADD CONSTRAINT "quiz_answers_school_id_schools_id_fk" FOREIGN KEY ("school_id") REFERENCES "public"."schools"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "quiz_answers" ADD CONSTRAINT "quiz_answers_school_id_attempt_question_id_attempt_questions_school_id_id_fk" FOREIGN KEY ("school_id","attempt_question_id") REFERENCES "public"."attempt_questions"("school_id","id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "quiz_attempts" ADD CONSTRAINT "quiz_attempts_school_id_schools_id_fk" FOREIGN KEY ("school_id") REFERENCES "public"."schools"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "quiz_attempts" ADD CONSTRAINT "quiz_attempts_school_id_enrollment_id_enrollments_school_id_id_fk" FOREIGN KEY ("school_id","enrollment_id") REFERENCES "public"."enrollments"("school_id","id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "quiz_attempts" ADD CONSTRAINT "quiz_attempts_school_id_lesson_id_lessons_school_id_id_fk" FOREIGN KEY ("school_id","lesson_id") REFERENCES "public"."lessons"("school_id","id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "attempt_question_items_school_id_attempt_question_id_item_id_index" ON "attempt_question_items" USING btree ("school_id","attempt_question_id","item_id");--> statement-breakpoint
CREATE UNIQUE INDEX "attempt_questions_school_id_attempt_id_position_index" ON "attempt_questions" USING btree ("school_id","attempt_id","position");--> statement-breakpoint
CREATE INDEX "attempt_questions_school_id_question_id_index" ON "attempt_questions" USING btree ("school_id","question_id");--> statement-breakpoint
CREATE INDEX "quiz_answer_items_school_id_answer_id_index" ON "quiz_answer_items" USING btree ("school_id","answer_id");--> statement-breakpoint
CREATE UNIQUE INDEX "quiz_answers_school_id_attempt_question_id_index" ON "quiz_answers" USING btree ("school_id","attempt_question_id");--> statement-breakpoint
CREATE INDEX "quiz_attempts_school_id_enrollment_id_lesson_id_block_key_index" ON "quiz_attempts" USING btree ("school_id","enrollment_id","lesson_id","block_key");--> statement-breakpoint
CREATE INDEX "quiz_attempts_school_id_status_deadline_at_index" ON "quiz_attempts" USING btree ("school_id","status","deadline_at");--> statement-breakpoint
CREATE POLICY "attempt_question_items_tenant_isolation" ON "attempt_question_items" AS PERMISSIVE FOR ALL TO "app_user" USING ("attempt_question_items"."school_id" = nullif(current_setting('app.school_id', true), '')::uuid) WITH CHECK ("attempt_question_items"."school_id" = nullif(current_setting('app.school_id', true), '')::uuid);--> statement-breakpoint
CREATE POLICY "attempt_questions_tenant_isolation" ON "attempt_questions" AS PERMISSIVE FOR ALL TO "app_user" USING ("attempt_questions"."school_id" = nullif(current_setting('app.school_id', true), '')::uuid) WITH CHECK ("attempt_questions"."school_id" = nullif(current_setting('app.school_id', true), '')::uuid);--> statement-breakpoint
CREATE POLICY "quiz_answer_items_tenant_isolation" ON "quiz_answer_items" AS PERMISSIVE FOR ALL TO "app_user" USING ("quiz_answer_items"."school_id" = nullif(current_setting('app.school_id', true), '')::uuid) WITH CHECK ("quiz_answer_items"."school_id" = nullif(current_setting('app.school_id', true), '')::uuid);--> statement-breakpoint
CREATE POLICY "quiz_answers_tenant_isolation" ON "quiz_answers" AS PERMISSIVE FOR ALL TO "app_user" USING ("quiz_answers"."school_id" = nullif(current_setting('app.school_id', true), '')::uuid) WITH CHECK ("quiz_answers"."school_id" = nullif(current_setting('app.school_id', true), '')::uuid);--> statement-breakpoint
CREATE POLICY "quiz_attempts_tenant_isolation" ON "quiz_attempts" AS PERMISSIVE FOR ALL TO "app_user" USING ("quiz_attempts"."school_id" = nullif(current_setting('app.school_id', true), '')::uuid) WITH CHECK ("quiz_attempts"."school_id" = nullif(current_setting('app.school_id', true), '')::uuid);