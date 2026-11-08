CREATE TYPE "public"."submission_status" AS ENUM('draft', 'submitted', 'needs_revision', 'accepted', 'rejected');--> statement-breakpoint
CREATE TABLE "block_assignment" (
	"block_id" uuid PRIMARY KEY NOT NULL,
	"school_id" uuid DEFAULT nullif(current_setting('app.school_id', true), '')::uuid NOT NULL,
	"prompt" jsonb DEFAULT '{"type":"doc","content":[{"type":"paragraph"}]}'::jsonb NOT NULL,
	"allow_text" boolean DEFAULT true NOT NULL,
	"allow_files" boolean DEFAULT true NOT NULL,
	"max_files" integer DEFAULT 3 NOT NULL,
	"requires_review" boolean DEFAULT true NOT NULL,
	CONSTRAINT "block_assignment_school_id_block_id_key" UNIQUE("school_id","block_id")
);
--> statement-breakpoint
ALTER TABLE "block_assignment" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "submission_comments" (
	"id" uuid PRIMARY KEY DEFAULT uuidv7() NOT NULL,
	"school_id" uuid DEFAULT nullif(current_setting('app.school_id', true), '')::uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"submission_id" uuid NOT NULL,
	"author_member_id" uuid NOT NULL,
	"body" jsonb NOT NULL,
	CONSTRAINT "submission_comments_school_id_id_key" UNIQUE("school_id","id")
);
--> statement-breakpoint
ALTER TABLE "submission_comments" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "submission_files" (
	"id" uuid PRIMARY KEY DEFAULT uuidv7() NOT NULL,
	"school_id" uuid DEFAULT nullif(current_setting('app.school_id', true), '')::uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"submission_id" uuid NOT NULL,
	"file_id" uuid NOT NULL,
	"position" integer NOT NULL,
	CONSTRAINT "submission_files_school_id_id_key" UNIQUE("school_id","id")
);
--> statement-breakpoint
ALTER TABLE "submission_files" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "submissions" (
	"id" uuid PRIMARY KEY DEFAULT uuidv7() NOT NULL,
	"school_id" uuid DEFAULT nullif(current_setting('app.school_id', true), '')::uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"enrollment_id" uuid NOT NULL,
	"lesson_id" uuid NOT NULL,
	"block_key" uuid NOT NULL,
	"status" "submission_status" DEFAULT 'draft' NOT NULL,
	"body" jsonb,
	"revision" integer DEFAULT 0 NOT NULL,
	"reviewer_member_id" uuid,
	"submitted_at" timestamp with time zone,
	"reviewed_at" timestamp with time zone,
	CONSTRAINT "submissions_school_id_id_key" UNIQUE("school_id","id")
);
--> statement-breakpoint
ALTER TABLE "submissions" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "block_assignment" ADD CONSTRAINT "block_assignment_school_id_schools_id_fk" FOREIGN KEY ("school_id") REFERENCES "public"."schools"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "block_assignment" ADD CONSTRAINT "block_assignment_school_id_block_id_lesson_blocks_school_id_id_fk" FOREIGN KEY ("school_id","block_id") REFERENCES "public"."lesson_blocks"("school_id","id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "submission_comments" ADD CONSTRAINT "submission_comments_school_id_schools_id_fk" FOREIGN KEY ("school_id") REFERENCES "public"."schools"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "submission_comments" ADD CONSTRAINT "submission_comments_school_id_submission_id_submissions_school_id_id_fk" FOREIGN KEY ("school_id","submission_id") REFERENCES "public"."submissions"("school_id","id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "submission_comments" ADD CONSTRAINT "submission_comments_school_id_author_member_id_members_school_id_id_fk" FOREIGN KEY ("school_id","author_member_id") REFERENCES "public"."members"("school_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "submission_files" ADD CONSTRAINT "submission_files_school_id_schools_id_fk" FOREIGN KEY ("school_id") REFERENCES "public"."schools"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "submission_files" ADD CONSTRAINT "submission_files_school_id_submission_id_submissions_school_id_id_fk" FOREIGN KEY ("school_id","submission_id") REFERENCES "public"."submissions"("school_id","id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "submission_files" ADD CONSTRAINT "submission_files_school_id_file_id_files_school_id_id_fk" FOREIGN KEY ("school_id","file_id") REFERENCES "public"."files"("school_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "submissions" ADD CONSTRAINT "submissions_school_id_schools_id_fk" FOREIGN KEY ("school_id") REFERENCES "public"."schools"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "submissions" ADD CONSTRAINT "submissions_school_id_enrollment_id_enrollments_school_id_id_fk" FOREIGN KEY ("school_id","enrollment_id") REFERENCES "public"."enrollments"("school_id","id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "submissions" ADD CONSTRAINT "submissions_school_id_lesson_id_lessons_school_id_id_fk" FOREIGN KEY ("school_id","lesson_id") REFERENCES "public"."lessons"("school_id","id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "submissions" ADD CONSTRAINT "submissions_school_id_reviewer_member_id_members_school_id_id_fk" FOREIGN KEY ("school_id","reviewer_member_id") REFERENCES "public"."members"("school_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "submission_comments_school_id_submission_id_created_at_index" ON "submission_comments" USING btree ("school_id","submission_id","created_at");--> statement-breakpoint
CREATE UNIQUE INDEX "submission_files_school_id_submission_id_file_id_index" ON "submission_files" USING btree ("school_id","submission_id","file_id");--> statement-breakpoint
CREATE UNIQUE INDEX "submissions_school_id_enrollment_id_lesson_id_block_key_index" ON "submissions" USING btree ("school_id","enrollment_id","lesson_id","block_key");--> statement-breakpoint
CREATE INDEX "submissions_school_id_status_submitted_at_index" ON "submissions" USING btree ("school_id","status","submitted_at");--> statement-breakpoint
CREATE POLICY "block_assignment_tenant_isolation" ON "block_assignment" AS PERMISSIVE FOR ALL TO "app_user" USING ("block_assignment"."school_id" = nullif(current_setting('app.school_id', true), '')::uuid) WITH CHECK ("block_assignment"."school_id" = nullif(current_setting('app.school_id', true), '')::uuid);--> statement-breakpoint
CREATE POLICY "submission_comments_tenant_isolation" ON "submission_comments" AS PERMISSIVE FOR ALL TO "app_user" USING ("submission_comments"."school_id" = nullif(current_setting('app.school_id', true), '')::uuid) WITH CHECK ("submission_comments"."school_id" = nullif(current_setting('app.school_id', true), '')::uuid);--> statement-breakpoint
CREATE POLICY "submission_files_tenant_isolation" ON "submission_files" AS PERMISSIVE FOR ALL TO "app_user" USING ("submission_files"."school_id" = nullif(current_setting('app.school_id', true), '')::uuid) WITH CHECK ("submission_files"."school_id" = nullif(current_setting('app.school_id', true), '')::uuid);--> statement-breakpoint
CREATE POLICY "submissions_tenant_isolation" ON "submissions" AS PERMISSIVE FOR ALL TO "app_user" USING ("submissions"."school_id" = nullif(current_setting('app.school_id', true), '')::uuid) WITH CHECK ("submissions"."school_id" = nullif(current_setting('app.school_id', true), '')::uuid);