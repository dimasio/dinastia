CREATE TABLE "question_tag_links" (
	"id" uuid PRIMARY KEY DEFAULT uuidv7() NOT NULL,
	"school_id" uuid DEFAULT nullif(current_setting('app.school_id', true), '')::uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"question_id" uuid NOT NULL,
	"tag_id" uuid NOT NULL,
	CONSTRAINT "question_tag_links_school_id_id_key" UNIQUE("school_id","id")
);
--> statement-breakpoint
ALTER TABLE "question_tag_links" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "question_tags" (
	"id" uuid PRIMARY KEY DEFAULT uuidv7() NOT NULL,
	"school_id" uuid DEFAULT nullif(current_setting('app.school_id', true), '')::uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"course_id" uuid NOT NULL,
	"label" text NOT NULL,
	CONSTRAINT "question_tags_school_id_id_key" UNIQUE("school_id","id")
);
--> statement-breakpoint
ALTER TABLE "question_tags" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "question_tag_links" ADD CONSTRAINT "question_tag_links_school_id_schools_id_fk" FOREIGN KEY ("school_id") REFERENCES "public"."schools"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "question_tag_links" ADD CONSTRAINT "question_tag_links_school_id_question_id_questions_school_id_id_fk" FOREIGN KEY ("school_id","question_id") REFERENCES "public"."questions"("school_id","id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "question_tag_links" ADD CONSTRAINT "question_tag_links_school_id_tag_id_question_tags_school_id_id_fk" FOREIGN KEY ("school_id","tag_id") REFERENCES "public"."question_tags"("school_id","id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "question_tags" ADD CONSTRAINT "question_tags_school_id_schools_id_fk" FOREIGN KEY ("school_id") REFERENCES "public"."schools"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "question_tags" ADD CONSTRAINT "question_tags_school_id_course_id_courses_school_id_id_fk" FOREIGN KEY ("school_id","course_id") REFERENCES "public"."courses"("school_id","id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "question_tag_links_school_id_question_id_tag_id_index" ON "question_tag_links" USING btree ("school_id","question_id","tag_id");--> statement-breakpoint
CREATE INDEX "question_tag_links_school_id_tag_id_index" ON "question_tag_links" USING btree ("school_id","tag_id");--> statement-breakpoint
CREATE UNIQUE INDEX "question_tags_course_label_key" ON "question_tags" USING btree ("school_id","course_id",lower("label"));--> statement-breakpoint
CREATE POLICY "question_tag_links_tenant_isolation" ON "question_tag_links" AS PERMISSIVE FOR ALL TO "app_user" USING ("question_tag_links"."school_id" = nullif(current_setting('app.school_id', true), '')::uuid) WITH CHECK ("question_tag_links"."school_id" = nullif(current_setting('app.school_id', true), '')::uuid);--> statement-breakpoint
CREATE POLICY "question_tags_tenant_isolation" ON "question_tags" AS PERMISSIVE FOR ALL TO "app_user" USING ("question_tags"."school_id" = nullif(current_setting('app.school_id', true), '')::uuid) WITH CHECK ("question_tags"."school_id" = nullif(current_setting('app.school_id', true), '')::uuid);