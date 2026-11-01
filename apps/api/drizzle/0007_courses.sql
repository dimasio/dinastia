CREATE TYPE "public"."course_access_mode" AS ENUM('open', 'sequential', 'drip');--> statement-breakpoint
CREATE TYPE "public"."course_status" AS ENUM('draft', 'published', 'archived');--> statement-breakpoint
CREATE TYPE "public"."lesson_access_mode" AS ENUM('inherit', 'open', 'sequential', 'drip');--> statement-breakpoint
CREATE TYPE "public"."lesson_completion_rule" AS ENUM('view', 'all_blocks', 'manual');--> statement-breakpoint
CREATE TABLE "courses" (
	"id" uuid PRIMARY KEY DEFAULT uuidv7() NOT NULL,
	"school_id" uuid DEFAULT nullif(current_setting('app.school_id', true), '')::uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"title" text NOT NULL,
	"slug" text NOT NULL,
	"description" jsonb DEFAULT '{"type":"doc","content":[{"type":"paragraph"}]}'::jsonb NOT NULL,
	"status" "course_status" DEFAULT 'draft' NOT NULL,
	"default_access_mode" "course_access_mode" DEFAULT 'open' NOT NULL,
	"access_days" integer,
	"completion_threshold_pct" integer DEFAULT 100 NOT NULL,
	CONSTRAINT "courses_school_id_id_key" UNIQUE("school_id","id")
);
--> statement-breakpoint
ALTER TABLE "courses" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "lessons" (
	"id" uuid PRIMARY KEY DEFAULT uuidv7() NOT NULL,
	"school_id" uuid DEFAULT nullif(current_setting('app.school_id', true), '')::uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"course_id" uuid NOT NULL,
	"section_id" uuid NOT NULL,
	"title" text NOT NULL,
	"position" integer NOT NULL,
	"published_at" timestamp with time zone,
	"has_unpublished_changes" boolean DEFAULT false NOT NULL,
	"access_mode" "lesson_access_mode" DEFAULT 'inherit' NOT NULL,
	"drip_days" integer,
	"drip_date" date,
	"completion_rule" "lesson_completion_rule" DEFAULT 'view' NOT NULL,
	CONSTRAINT "lessons_school_id_id_key" UNIQUE("school_id","id")
);
--> statement-breakpoint
ALTER TABLE "lessons" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "sections" (
	"id" uuid PRIMARY KEY DEFAULT uuidv7() NOT NULL,
	"school_id" uuid DEFAULT nullif(current_setting('app.school_id', true), '')::uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"course_id" uuid NOT NULL,
	"title" text NOT NULL,
	"position" integer NOT NULL,
	CONSTRAINT "sections_school_id_id_key" UNIQUE("school_id","id")
);
--> statement-breakpoint
ALTER TABLE "sections" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "courses" ADD CONSTRAINT "courses_school_id_schools_id_fk" FOREIGN KEY ("school_id") REFERENCES "public"."schools"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "lessons" ADD CONSTRAINT "lessons_school_id_schools_id_fk" FOREIGN KEY ("school_id") REFERENCES "public"."schools"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "lessons" ADD CONSTRAINT "lessons_school_id_course_id_courses_school_id_id_fk" FOREIGN KEY ("school_id","course_id") REFERENCES "public"."courses"("school_id","id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "lessons" ADD CONSTRAINT "lessons_school_id_section_id_sections_school_id_id_fk" FOREIGN KEY ("school_id","section_id") REFERENCES "public"."sections"("school_id","id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sections" ADD CONSTRAINT "sections_school_id_schools_id_fk" FOREIGN KEY ("school_id") REFERENCES "public"."schools"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sections" ADD CONSTRAINT "sections_school_id_course_id_courses_school_id_id_fk" FOREIGN KEY ("school_id","course_id") REFERENCES "public"."courses"("school_id","id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "courses_school_id_slug_index" ON "courses" USING btree ("school_id","slug");--> statement-breakpoint
CREATE INDEX "courses_school_id_status_updated_at_index" ON "courses" USING btree ("school_id","status","updated_at");--> statement-breakpoint
CREATE INDEX "lessons_school_id_section_id_position_index" ON "lessons" USING btree ("school_id","section_id","position");--> statement-breakpoint
CREATE INDEX "lessons_school_id_course_id_index" ON "lessons" USING btree ("school_id","course_id");--> statement-breakpoint
CREATE INDEX "sections_school_id_course_id_position_index" ON "sections" USING btree ("school_id","course_id","position");--> statement-breakpoint
CREATE POLICY "courses_tenant_isolation" ON "courses" AS PERMISSIVE FOR ALL TO "app_user" USING ("courses"."school_id" = nullif(current_setting('app.school_id', true), '')::uuid) WITH CHECK ("courses"."school_id" = nullif(current_setting('app.school_id', true), '')::uuid);--> statement-breakpoint
CREATE POLICY "lessons_tenant_isolation" ON "lessons" AS PERMISSIVE FOR ALL TO "app_user" USING ("lessons"."school_id" = nullif(current_setting('app.school_id', true), '')::uuid) WITH CHECK ("lessons"."school_id" = nullif(current_setting('app.school_id', true), '')::uuid);--> statement-breakpoint
CREATE POLICY "sections_tenant_isolation" ON "sections" AS PERMISSIVE FOR ALL TO "app_user" USING ("sections"."school_id" = nullif(current_setting('app.school_id', true), '')::uuid) WITH CHECK ("sections"."school_id" = nullif(current_setting('app.school_id', true), '')::uuid);