CREATE TABLE "submission_comment_files" (
	"id" uuid PRIMARY KEY DEFAULT uuidv7() NOT NULL,
	"school_id" uuid DEFAULT nullif(current_setting('app.school_id', true), '')::uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"comment_id" uuid NOT NULL,
	"file_id" uuid NOT NULL,
	"position" integer NOT NULL,
	CONSTRAINT "submission_comment_files_school_id_id_key" UNIQUE("school_id","id")
);
--> statement-breakpoint
ALTER TABLE "submission_comment_files" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "submission_comment_files" ADD CONSTRAINT "submission_comment_files_school_id_schools_id_fk" FOREIGN KEY ("school_id") REFERENCES "public"."schools"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "submission_comment_files" ADD CONSTRAINT "submission_comment_files_school_id_comment_id_submission_comments_school_id_id_fk" FOREIGN KEY ("school_id","comment_id") REFERENCES "public"."submission_comments"("school_id","id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "submission_comment_files" ADD CONSTRAINT "submission_comment_files_school_id_file_id_files_school_id_id_fk" FOREIGN KEY ("school_id","file_id") REFERENCES "public"."files"("school_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "submission_comment_files_school_id_comment_id_file_id_index" ON "submission_comment_files" USING btree ("school_id","comment_id","file_id");--> statement-breakpoint
CREATE POLICY "submission_comment_files_tenant_isolation" ON "submission_comment_files" AS PERMISSIVE FOR ALL TO "app_user" USING ("submission_comment_files"."school_id" = nullif(current_setting('app.school_id', true), '')::uuid) WITH CHECK ("submission_comment_files"."school_id" = nullif(current_setting('app.school_id', true), '')::uuid);