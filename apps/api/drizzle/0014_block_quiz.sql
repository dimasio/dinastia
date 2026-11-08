CREATE TABLE "block_quiz" (
	"block_id" uuid PRIMARY KEY NOT NULL,
	"school_id" uuid DEFAULT nullif(current_setting('app.school_id', true), '')::uuid NOT NULL,
	"selection" text DEFAULT 'fixed' NOT NULL,
	"random_count" integer DEFAULT 5 NOT NULL,
	"attempts_limit" integer DEFAULT 0 NOT NULL,
	"pass_score_pct" integer DEFAULT 60 NOT NULL,
	"time_limit_sec" integer,
	"shuffle_questions" boolean DEFAULT false NOT NULL,
	"shuffle_options" boolean DEFAULT false NOT NULL,
	"show_correct" text DEFAULT 'after_submit' NOT NULL,
	CONSTRAINT "block_quiz_school_id_block_id_key" UNIQUE("school_id","block_id")
);
--> statement-breakpoint
ALTER TABLE "block_quiz" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "block_quiz_questions" (
	"id" uuid PRIMARY KEY DEFAULT uuidv7() NOT NULL,
	"school_id" uuid DEFAULT nullif(current_setting('app.school_id', true), '')::uuid NOT NULL,
	"block_id" uuid NOT NULL,
	"position" integer NOT NULL,
	"item_key" uuid DEFAULT uuidv7() NOT NULL,
	"question_id" uuid NOT NULL
);
--> statement-breakpoint
ALTER TABLE "block_quiz_questions" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "block_quiz_tags" (
	"id" uuid PRIMARY KEY DEFAULT uuidv7() NOT NULL,
	"school_id" uuid DEFAULT nullif(current_setting('app.school_id', true), '')::uuid NOT NULL,
	"block_id" uuid NOT NULL,
	"position" integer NOT NULL,
	"item_key" uuid DEFAULT uuidv7() NOT NULL,
	"tag_id" uuid NOT NULL
);
--> statement-breakpoint
ALTER TABLE "block_quiz_tags" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "block_quiz" ADD CONSTRAINT "block_quiz_school_id_schools_id_fk" FOREIGN KEY ("school_id") REFERENCES "public"."schools"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "block_quiz" ADD CONSTRAINT "block_quiz_school_id_block_id_lesson_blocks_school_id_id_fk" FOREIGN KEY ("school_id","block_id") REFERENCES "public"."lesson_blocks"("school_id","id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "block_quiz_questions" ADD CONSTRAINT "block_quiz_questions_school_id_schools_id_fk" FOREIGN KEY ("school_id") REFERENCES "public"."schools"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "block_quiz_questions" ADD CONSTRAINT "block_quiz_questions_school_id_block_id_block_quiz_school_id_block_id_fk" FOREIGN KEY ("school_id","block_id") REFERENCES "public"."block_quiz"("school_id","block_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "block_quiz_tags" ADD CONSTRAINT "block_quiz_tags_school_id_schools_id_fk" FOREIGN KEY ("school_id") REFERENCES "public"."schools"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "block_quiz_tags" ADD CONSTRAINT "block_quiz_tags_school_id_block_id_block_quiz_school_id_block_id_fk" FOREIGN KEY ("school_id","block_id") REFERENCES "public"."block_quiz"("school_id","block_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "block_quiz_questions_school_id_block_id_position_index" ON "block_quiz_questions" USING btree ("school_id","block_id","position");--> statement-breakpoint
CREATE INDEX "block_quiz_tags_school_id_block_id_position_index" ON "block_quiz_tags" USING btree ("school_id","block_id","position");--> statement-breakpoint
CREATE POLICY "block_quiz_tenant_isolation" ON "block_quiz" AS PERMISSIVE FOR ALL TO "app_user" USING ("block_quiz"."school_id" = nullif(current_setting('app.school_id', true), '')::uuid) WITH CHECK ("block_quiz"."school_id" = nullif(current_setting('app.school_id', true), '')::uuid);--> statement-breakpoint
CREATE POLICY "block_quiz_questions_tenant_isolation" ON "block_quiz_questions" AS PERMISSIVE FOR ALL TO "app_user" USING ("block_quiz_questions"."school_id" = nullif(current_setting('app.school_id', true), '')::uuid) WITH CHECK ("block_quiz_questions"."school_id" = nullif(current_setting('app.school_id', true), '')::uuid);--> statement-breakpoint
CREATE POLICY "block_quiz_tags_tenant_isolation" ON "block_quiz_tags" AS PERMISSIVE FOR ALL TO "app_user" USING ("block_quiz_tags"."school_id" = nullif(current_setting('app.school_id', true), '')::uuid) WITH CHECK ("block_quiz_tags"."school_id" = nullif(current_setting('app.school_id', true), '')::uuid);--> statement-breakpoint
-- ключи на таблицы ядра и модуля assessments — вручную (D-054): таблицы блоков их не видят
ALTER TABLE "block_quiz_questions" ADD CONSTRAINT "block_quiz_questions_question_fk" FOREIGN KEY ("school_id","question_id") REFERENCES "public"."questions"("school_id","id") ON DELETE no action;--> statement-breakpoint
ALTER TABLE "block_quiz_tags" ADD CONSTRAINT "block_quiz_tags_tag_fk" FOREIGN KEY ("school_id","tag_id") REFERENCES "public"."question_tags"("school_id","id") ON DELETE cascade;
