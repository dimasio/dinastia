CREATE TYPE "public"."block_code_language" AS ENUM('plaintext', 'python', 'javascript', 'typescript', 'html', 'css', 'sql', 'bash', 'json');--> statement-breakpoint
CREATE TYPE "public"."block_heading_level" AS ENUM('h2', 'h3');--> statement-breakpoint
CREATE TABLE "block_code" (
	"block_id" uuid PRIMARY KEY NOT NULL,
	"school_id" uuid DEFAULT nullif(current_setting('app.school_id', true), '')::uuid NOT NULL,
	"language" "block_code_language" DEFAULT 'plaintext' NOT NULL,
	"code" text DEFAULT '' NOT NULL,
	CONSTRAINT "block_code_school_id_block_id_key" UNIQUE("school_id","block_id")
);
--> statement-breakpoint
ALTER TABLE "block_code" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "block_divider" (
	"block_id" uuid PRIMARY KEY NOT NULL,
	"school_id" uuid DEFAULT nullif(current_setting('app.school_id', true), '')::uuid NOT NULL,
	CONSTRAINT "block_divider_school_id_block_id_key" UNIQUE("school_id","block_id")
);
--> statement-breakpoint
ALTER TABLE "block_divider" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "block_embed" (
	"block_id" uuid PRIMARY KEY NOT NULL,
	"school_id" uuid DEFAULT nullif(current_setting('app.school_id', true), '')::uuid NOT NULL,
	"url" text DEFAULT '' NOT NULL,
	"height" integer DEFAULT 480 NOT NULL,
	"caption" text,
	CONSTRAINT "block_embed_school_id_block_id_key" UNIQUE("school_id","block_id")
);
--> statement-breakpoint
ALTER TABLE "block_embed" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "block_heading" (
	"block_id" uuid PRIMARY KEY NOT NULL,
	"school_id" uuid DEFAULT nullif(current_setting('app.school_id', true), '')::uuid NOT NULL,
	"level" "block_heading_level" DEFAULT 'h2' NOT NULL,
	"text" text DEFAULT '' NOT NULL,
	CONSTRAINT "block_heading_school_id_block_id_key" UNIQUE("school_id","block_id")
);
--> statement-breakpoint
ALTER TABLE "block_heading" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "block_text" (
	"block_id" uuid PRIMARY KEY NOT NULL,
	"school_id" uuid DEFAULT nullif(current_setting('app.school_id', true), '')::uuid NOT NULL,
	"body" jsonb NOT NULL,
	CONSTRAINT "block_text_school_id_block_id_key" UNIQUE("school_id","block_id")
);
--> statement-breakpoint
ALTER TABLE "block_text" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "block_video" (
	"block_id" uuid PRIMARY KEY NOT NULL,
	"school_id" uuid DEFAULT nullif(current_setting('app.school_id', true), '')::uuid NOT NULL,
	"url" text DEFAULT '' NOT NULL,
	"caption" text,
	CONSTRAINT "block_video_school_id_block_id_key" UNIQUE("school_id","block_id")
);
--> statement-breakpoint
ALTER TABLE "block_video" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "block_code" ADD CONSTRAINT "block_code_school_id_schools_id_fk" FOREIGN KEY ("school_id") REFERENCES "public"."schools"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "block_code" ADD CONSTRAINT "block_code_school_id_block_id_lesson_blocks_school_id_id_fk" FOREIGN KEY ("school_id","block_id") REFERENCES "public"."lesson_blocks"("school_id","id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "block_divider" ADD CONSTRAINT "block_divider_school_id_schools_id_fk" FOREIGN KEY ("school_id") REFERENCES "public"."schools"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "block_divider" ADD CONSTRAINT "block_divider_school_id_block_id_lesson_blocks_school_id_id_fk" FOREIGN KEY ("school_id","block_id") REFERENCES "public"."lesson_blocks"("school_id","id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "block_embed" ADD CONSTRAINT "block_embed_school_id_schools_id_fk" FOREIGN KEY ("school_id") REFERENCES "public"."schools"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "block_embed" ADD CONSTRAINT "block_embed_school_id_block_id_lesson_blocks_school_id_id_fk" FOREIGN KEY ("school_id","block_id") REFERENCES "public"."lesson_blocks"("school_id","id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "block_heading" ADD CONSTRAINT "block_heading_school_id_schools_id_fk" FOREIGN KEY ("school_id") REFERENCES "public"."schools"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "block_heading" ADD CONSTRAINT "block_heading_school_id_block_id_lesson_blocks_school_id_id_fk" FOREIGN KEY ("school_id","block_id") REFERENCES "public"."lesson_blocks"("school_id","id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "block_text" ADD CONSTRAINT "block_text_school_id_schools_id_fk" FOREIGN KEY ("school_id") REFERENCES "public"."schools"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "block_text" ADD CONSTRAINT "block_text_school_id_block_id_lesson_blocks_school_id_id_fk" FOREIGN KEY ("school_id","block_id") REFERENCES "public"."lesson_blocks"("school_id","id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "block_video" ADD CONSTRAINT "block_video_school_id_schools_id_fk" FOREIGN KEY ("school_id") REFERENCES "public"."schools"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "block_video" ADD CONSTRAINT "block_video_school_id_block_id_lesson_blocks_school_id_id_fk" FOREIGN KEY ("school_id","block_id") REFERENCES "public"."lesson_blocks"("school_id","id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE POLICY "block_code_tenant_isolation" ON "block_code" AS PERMISSIVE FOR ALL TO "app_user" USING ("block_code"."school_id" = nullif(current_setting('app.school_id', true), '')::uuid) WITH CHECK ("block_code"."school_id" = nullif(current_setting('app.school_id', true), '')::uuid);--> statement-breakpoint
CREATE POLICY "block_divider_tenant_isolation" ON "block_divider" AS PERMISSIVE FOR ALL TO "app_user" USING ("block_divider"."school_id" = nullif(current_setting('app.school_id', true), '')::uuid) WITH CHECK ("block_divider"."school_id" = nullif(current_setting('app.school_id', true), '')::uuid);--> statement-breakpoint
CREATE POLICY "block_embed_tenant_isolation" ON "block_embed" AS PERMISSIVE FOR ALL TO "app_user" USING ("block_embed"."school_id" = nullif(current_setting('app.school_id', true), '')::uuid) WITH CHECK ("block_embed"."school_id" = nullif(current_setting('app.school_id', true), '')::uuid);--> statement-breakpoint
CREATE POLICY "block_heading_tenant_isolation" ON "block_heading" AS PERMISSIVE FOR ALL TO "app_user" USING ("block_heading"."school_id" = nullif(current_setting('app.school_id', true), '')::uuid) WITH CHECK ("block_heading"."school_id" = nullif(current_setting('app.school_id', true), '')::uuid);--> statement-breakpoint
CREATE POLICY "block_text_tenant_isolation" ON "block_text" AS PERMISSIVE FOR ALL TO "app_user" USING ("block_text"."school_id" = nullif(current_setting('app.school_id', true), '')::uuid) WITH CHECK ("block_text"."school_id" = nullif(current_setting('app.school_id', true), '')::uuid);--> statement-breakpoint
CREATE POLICY "block_video_tenant_isolation" ON "block_video" AS PERMISSIVE FOR ALL TO "app_user" USING ("block_video"."school_id" = nullif(current_setting('app.school_id', true), '')::uuid) WITH CHECK ("block_video"."school_id" = nullif(current_setting('app.school_id', true), '')::uuid);