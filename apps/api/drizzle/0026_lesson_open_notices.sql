CREATE TABLE "lesson_open_notices" (
	"id" uuid PRIMARY KEY DEFAULT uuidv7() NOT NULL,
	"school_id" uuid DEFAULT nullif(current_setting('app.school_id', true), '')::uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"enrollment_id" uuid NOT NULL,
	"lesson_id" uuid NOT NULL,
	"sent_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "lesson_open_notices_school_id_id_key" UNIQUE("school_id","id")
);
--> statement-breakpoint
ALTER TABLE "lesson_open_notices" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "lesson_open_notices" ADD CONSTRAINT "lesson_open_notices_school_id_schools_id_fk" FOREIGN KEY ("school_id") REFERENCES "public"."schools"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "lesson_open_notices" ADD CONSTRAINT "lesson_open_notices_school_id_enrollment_id_enrollments_school_id_id_fk" FOREIGN KEY ("school_id","enrollment_id") REFERENCES "public"."enrollments"("school_id","id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "lesson_open_notices" ADD CONSTRAINT "lesson_open_notices_school_id_lesson_id_lessons_school_id_id_fk" FOREIGN KEY ("school_id","lesson_id") REFERENCES "public"."lessons"("school_id","id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "lesson_open_notices_school_id_enrollment_id_lesson_id_index" ON "lesson_open_notices" USING btree ("school_id","enrollment_id","lesson_id");--> statement-breakpoint
CREATE POLICY "lesson_open_notices_tenant_isolation" ON "lesson_open_notices" AS PERMISSIVE FOR ALL TO "app_user" USING ("lesson_open_notices"."school_id" = nullif(current_setting('app.school_id', true), '')::uuid) WITH CHECK ("lesson_open_notices"."school_id" = nullif(current_setting('app.school_id', true), '')::uuid);