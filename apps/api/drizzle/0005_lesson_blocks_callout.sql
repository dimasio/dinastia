CREATE TYPE "public"."block_state" AS ENUM('draft', 'published');--> statement-breakpoint
CREATE TYPE "public"."block_callout_tone" AS ENUM('info', 'warning', 'success');--> statement-breakpoint
CREATE TABLE "lesson_blocks" (
	"id" uuid PRIMARY KEY DEFAULT uuidv7() NOT NULL,
	"school_id" uuid DEFAULT nullif(current_setting('app.school_id', true), '')::uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"lesson_id" uuid NOT NULL,
	"block_key" uuid DEFAULT uuidv7() NOT NULL,
	"state" "block_state" DEFAULT 'draft' NOT NULL,
	"type" text NOT NULL,
	"position" integer NOT NULL,
	"is_required" boolean DEFAULT false NOT NULL,
	CONSTRAINT "lesson_blocks_school_id_id_key" UNIQUE("school_id","id")
);
--> statement-breakpoint
ALTER TABLE "lesson_blocks" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "block_callout" (
	"block_id" uuid PRIMARY KEY NOT NULL,
	"school_id" uuid DEFAULT nullif(current_setting('app.school_id', true), '')::uuid NOT NULL,
	"tone" "block_callout_tone" DEFAULT 'info' NOT NULL,
	"body" jsonb NOT NULL,
	CONSTRAINT "block_callout_school_id_block_id_key" UNIQUE("school_id","block_id")
);
--> statement-breakpoint
ALTER TABLE "block_callout" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "lesson_blocks" ADD CONSTRAINT "lesson_blocks_school_id_schools_id_fk" FOREIGN KEY ("school_id") REFERENCES "public"."schools"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "block_callout" ADD CONSTRAINT "block_callout_school_id_schools_id_fk" FOREIGN KEY ("school_id") REFERENCES "public"."schools"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "block_callout" ADD CONSTRAINT "block_callout_school_id_block_id_lesson_blocks_school_id_id_fk" FOREIGN KEY ("school_id","block_id") REFERENCES "public"."lesson_blocks"("school_id","id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "lesson_blocks_school_id_lesson_id_state_block_key_index" ON "lesson_blocks" USING btree ("school_id","lesson_id","state","block_key");--> statement-breakpoint
CREATE INDEX "lesson_blocks_school_id_lesson_id_state_position_index" ON "lesson_blocks" USING btree ("school_id","lesson_id","state","position");--> statement-breakpoint
CREATE POLICY "lesson_blocks_tenant_isolation" ON "lesson_blocks" AS PERMISSIVE FOR ALL TO "app_user" USING ("lesson_blocks"."school_id" = nullif(current_setting('app.school_id', true), '')::uuid) WITH CHECK ("lesson_blocks"."school_id" = nullif(current_setting('app.school_id', true), '')::uuid);--> statement-breakpoint
CREATE POLICY "block_callout_tenant_isolation" ON "block_callout" AS PERMISSIVE FOR ALL TO "app_user" USING ("block_callout"."school_id" = nullif(current_setting('app.school_id', true), '')::uuid) WITH CHECK ("block_callout"."school_id" = nullif(current_setting('app.school_id', true), '')::uuid);