CREATE TYPE "public"."deadline_reminder_kind" AS ENUM('soon', 'overdue');--> statement-breakpoint
CREATE TABLE "deadline_reminders" (
	"id" uuid PRIMARY KEY DEFAULT uuidv7() NOT NULL,
	"school_id" uuid DEFAULT nullif(current_setting('app.school_id', true), '')::uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"enrollment_id" uuid NOT NULL,
	"lesson_id" uuid NOT NULL,
	"kind" "deadline_reminder_kind" NOT NULL,
	"sent_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "deadline_reminders_school_id_id_key" UNIQUE("school_id","id")
);
--> statement-breakpoint
ALTER TABLE "deadline_reminders" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "lessons" ADD COLUMN "deadline_days" integer;--> statement-breakpoint
ALTER TABLE "lessons" ADD COLUMN "deadline_date" date;--> statement-breakpoint
ALTER TABLE "deadline_reminders" ADD CONSTRAINT "deadline_reminders_school_id_schools_id_fk" FOREIGN KEY ("school_id") REFERENCES "public"."schools"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "deadline_reminders" ADD CONSTRAINT "deadline_reminders_school_id_enrollment_id_enrollments_school_id_id_fk" FOREIGN KEY ("school_id","enrollment_id") REFERENCES "public"."enrollments"("school_id","id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "deadline_reminders" ADD CONSTRAINT "deadline_reminders_school_id_lesson_id_lessons_school_id_id_fk" FOREIGN KEY ("school_id","lesson_id") REFERENCES "public"."lessons"("school_id","id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "deadline_reminders_school_id_enrollment_id_lesson_id_kind_index" ON "deadline_reminders" USING btree ("school_id","enrollment_id","lesson_id","kind");--> statement-breakpoint
CREATE POLICY "deadline_reminders_tenant_isolation" ON "deadline_reminders" AS PERMISSIVE FOR ALL TO "app_user" USING ("deadline_reminders"."school_id" = nullif(current_setting('app.school_id', true), '')::uuid) WITH CHECK ("deadline_reminders"."school_id" = nullif(current_setting('app.school_id', true), '')::uuid);