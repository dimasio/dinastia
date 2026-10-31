CREATE TYPE "public"."question_item_kind" AS ENUM('option', 'order_item', 'match_left', 'match_right', 'accepted_text');--> statement-breakpoint
CREATE TYPE "public"."question_scoring" AS ENUM('all_or_nothing', 'partial');--> statement-breakpoint
CREATE TABLE "question_items" (
	"id" uuid PRIMARY KEY DEFAULT uuidv7() NOT NULL,
	"school_id" uuid DEFAULT nullif(current_setting('app.school_id', true), '')::uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"question_id" uuid NOT NULL,
	"kind" "question_item_kind" NOT NULL,
	"body" jsonb,
	"text" text,
	"position" integer NOT NULL,
	"is_correct" boolean DEFAULT false NOT NULL,
	"correct_position" integer,
	"match_key" text,
	CONSTRAINT "question_items_school_id_id_key" UNIQUE("school_id","id")
);
--> statement-breakpoint
ALTER TABLE "question_items" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "questions" (
	"id" uuid PRIMARY KEY DEFAULT uuidv7() NOT NULL,
	"school_id" uuid DEFAULT nullif(current_setting('app.school_id', true), '')::uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"course_id" uuid NOT NULL,
	"type" text NOT NULL,
	"prompt" jsonb NOT NULL,
	"explanation" jsonb,
	"points" integer DEFAULT 1 NOT NULL,
	"scoring" "question_scoring" DEFAULT 'all_or_nothing' NOT NULL,
	"case_sensitive" boolean DEFAULT false NOT NULL,
	"number_answer" double precision,
	"number_tolerance" double precision DEFAULT 0 NOT NULL,
	"revision_of" uuid,
	"is_current" boolean DEFAULT true NOT NULL,
	"archived_at" timestamp with time zone,
	CONSTRAINT "questions_school_id_id_key" UNIQUE("school_id","id")
);
--> statement-breakpoint
ALTER TABLE "questions" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "question_items" ADD CONSTRAINT "question_items_school_id_schools_id_fk" FOREIGN KEY ("school_id") REFERENCES "public"."schools"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "question_items" ADD CONSTRAINT "question_items_school_id_question_id_questions_school_id_id_fk" FOREIGN KEY ("school_id","question_id") REFERENCES "public"."questions"("school_id","id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "questions" ADD CONSTRAINT "questions_school_id_schools_id_fk" FOREIGN KEY ("school_id") REFERENCES "public"."schools"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "questions" ADD CONSTRAINT "questions_school_id_revision_of_questions_school_id_id_fk" FOREIGN KEY ("school_id","revision_of") REFERENCES "public"."questions"("school_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "question_items_school_id_question_id_kind_position_index" ON "question_items" USING btree ("school_id","question_id","kind","position");--> statement-breakpoint
CREATE INDEX "questions_school_id_course_id_is_current_index" ON "questions" USING btree ("school_id","course_id","is_current");--> statement-breakpoint
CREATE INDEX "questions_school_id_revision_of_index" ON "questions" USING btree ("school_id","revision_of");--> statement-breakpoint
CREATE POLICY "question_items_tenant_isolation" ON "question_items" AS PERMISSIVE FOR ALL TO "app_user" USING ("question_items"."school_id" = nullif(current_setting('app.school_id', true), '')::uuid) WITH CHECK ("question_items"."school_id" = nullif(current_setting('app.school_id', true), '')::uuid);--> statement-breakpoint
CREATE POLICY "questions_tenant_isolation" ON "questions" AS PERMISSIVE FOR ALL TO "app_user" USING ("questions"."school_id" = nullif(current_setting('app.school_id', true), '')::uuid) WITH CHECK ("questions"."school_id" = nullif(current_setting('app.school_id', true), '')::uuid);