CREATE TYPE "public"."block_result" AS ENUM('done', 'failed');--> statement-breakpoint
CREATE TABLE "block_progress" (
	"id" uuid PRIMARY KEY DEFAULT uuidv7() NOT NULL,
	"school_id" uuid DEFAULT nullif(current_setting('app.school_id', true), '')::uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"enrollment_id" uuid NOT NULL,
	"lesson_id" uuid NOT NULL,
	"block_key" uuid NOT NULL,
	"status" "block_result" NOT NULL,
	"completed_at" timestamp with time zone,
	CONSTRAINT "block_progress_school_id_id_key" UNIQUE("school_id","id")
);
--> statement-breakpoint
ALTER TABLE "block_progress" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "lessons" ALTER COLUMN "completion_rule" SET DEFAULT 'all_blocks';--> statement-breakpoint
ALTER TABLE "block_progress" ADD CONSTRAINT "block_progress_school_id_schools_id_fk" FOREIGN KEY ("school_id") REFERENCES "public"."schools"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "block_progress" ADD CONSTRAINT "block_progress_school_id_enrollment_id_enrollments_school_id_id_fk" FOREIGN KEY ("school_id","enrollment_id") REFERENCES "public"."enrollments"("school_id","id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "block_progress" ADD CONSTRAINT "block_progress_school_id_lesson_id_lessons_school_id_id_fk" FOREIGN KEY ("school_id","lesson_id") REFERENCES "public"."lessons"("school_id","id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "block_progress_school_id_enrollment_id_lesson_id_block_key_index" ON "block_progress" USING btree ("school_id","enrollment_id","lesson_id","block_key");--> statement-breakpoint
CREATE POLICY "block_progress_tenant_isolation" ON "block_progress" AS PERMISSIVE FOR ALL TO "app_user" USING ("block_progress"."school_id" = nullif(current_setting('app.school_id', true), '')::uuid) WITH CHECK ("block_progress"."school_id" = nullif(current_setting('app.school_id', true), '')::uuid);