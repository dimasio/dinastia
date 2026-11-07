CREATE TYPE "public"."enrollment_source" AS ENUM('manual', 'invite', 'link');--> statement-breakpoint
CREATE TYPE "public"."enrollment_status" AS ENUM('active', 'completed', 'expired', 'revoked');--> statement-breakpoint
CREATE TABLE "enrollments" (
	"id" uuid PRIMARY KEY DEFAULT uuidv7() NOT NULL,
	"school_id" uuid DEFAULT nullif(current_setting('app.school_id', true), '')::uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"member_id" uuid NOT NULL,
	"course_id" uuid NOT NULL,
	"status" "enrollment_status" DEFAULT 'active' NOT NULL,
	"source" "enrollment_source" DEFAULT 'manual' NOT NULL,
	"enrolled_at" timestamp with time zone DEFAULT now() NOT NULL,
	"expires_at" timestamp with time zone,
	"completed_at" timestamp with time zone,
	"progress_pct" integer DEFAULT 0 NOT NULL,
	CONSTRAINT "enrollments_school_id_id_key" UNIQUE("school_id","id")
);
--> statement-breakpoint
ALTER TABLE "enrollments" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "lesson_progress" (
	"id" uuid PRIMARY KEY DEFAULT uuidv7() NOT NULL,
	"school_id" uuid DEFAULT nullif(current_setting('app.school_id', true), '')::uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"enrollment_id" uuid NOT NULL,
	"lesson_id" uuid NOT NULL,
	"opened_at" timestamp with time zone DEFAULT now() NOT NULL,
	"completed_at" timestamp with time zone,
	CONSTRAINT "lesson_progress_school_id_id_key" UNIQUE("school_id","id")
);
--> statement-breakpoint
ALTER TABLE "lesson_progress" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "enrollments" ADD CONSTRAINT "enrollments_school_id_schools_id_fk" FOREIGN KEY ("school_id") REFERENCES "public"."schools"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "enrollments" ADD CONSTRAINT "enrollments_school_id_member_id_members_school_id_id_fk" FOREIGN KEY ("school_id","member_id") REFERENCES "public"."members"("school_id","id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "enrollments" ADD CONSTRAINT "enrollments_school_id_course_id_courses_school_id_id_fk" FOREIGN KEY ("school_id","course_id") REFERENCES "public"."courses"("school_id","id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "lesson_progress" ADD CONSTRAINT "lesson_progress_school_id_schools_id_fk" FOREIGN KEY ("school_id") REFERENCES "public"."schools"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "lesson_progress" ADD CONSTRAINT "lesson_progress_school_id_enrollment_id_enrollments_school_id_id_fk" FOREIGN KEY ("school_id","enrollment_id") REFERENCES "public"."enrollments"("school_id","id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "lesson_progress" ADD CONSTRAINT "lesson_progress_school_id_lesson_id_lessons_school_id_id_fk" FOREIGN KEY ("school_id","lesson_id") REFERENCES "public"."lessons"("school_id","id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "enrollments_school_id_member_id_course_id_index" ON "enrollments" USING btree ("school_id","member_id","course_id") WHERE "enrollments"."status" in ('active', 'completed');--> statement-breakpoint
CREATE INDEX "enrollments_school_id_course_id_index" ON "enrollments" USING btree ("school_id","course_id");--> statement-breakpoint
CREATE UNIQUE INDEX "lesson_progress_school_id_enrollment_id_lesson_id_index" ON "lesson_progress" USING btree ("school_id","enrollment_id","lesson_id");--> statement-breakpoint
CREATE POLICY "enrollments_tenant_isolation" ON "enrollments" AS PERMISSIVE FOR ALL TO "app_user" USING ("enrollments"."school_id" = nullif(current_setting('app.school_id', true), '')::uuid) WITH CHECK ("enrollments"."school_id" = nullif(current_setting('app.school_id', true), '')::uuid);--> statement-breakpoint
CREATE POLICY "lesson_progress_tenant_isolation" ON "lesson_progress" AS PERMISSIVE FOR ALL TO "app_user" USING ("lesson_progress"."school_id" = nullif(current_setting('app.school_id', true), '')::uuid) WITH CHECK ("lesson_progress"."school_id" = nullif(current_setting('app.school_id', true), '')::uuid);