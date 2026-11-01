-- Медиа (карточка 2.7): обложка курса, блоки «Картинка» и «Файл». Внешние ключи file_id таблиц блоков на files —
-- вручную (D-054: @dinastia/blocks не импортирует таблицы ядра api); составные — на файл другой школы сослаться нельзя.
CREATE TABLE "block_file" (
	"block_id" uuid PRIMARY KEY NOT NULL,
	"school_id" uuid DEFAULT nullif(current_setting('app.school_id', true), '')::uuid NOT NULL,
	"file_id" uuid,
	"title" text,
	CONSTRAINT "block_file_school_id_block_id_key" UNIQUE("school_id","block_id")
);
--> statement-breakpoint
ALTER TABLE "block_file" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "block_image" (
	"block_id" uuid PRIMARY KEY NOT NULL,
	"school_id" uuid DEFAULT nullif(current_setting('app.school_id', true), '')::uuid NOT NULL,
	"file_id" uuid,
	"alt" text,
	"caption" text,
	CONSTRAINT "block_image_school_id_block_id_key" UNIQUE("school_id","block_id")
);
--> statement-breakpoint
ALTER TABLE "block_image" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "courses" ADD COLUMN "cover_file_id" uuid;--> statement-breakpoint
ALTER TABLE "block_file" ADD CONSTRAINT "block_file_school_id_schools_id_fk" FOREIGN KEY ("school_id") REFERENCES "public"."schools"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "block_file" ADD CONSTRAINT "block_file_school_id_block_id_lesson_blocks_school_id_id_fk" FOREIGN KEY ("school_id","block_id") REFERENCES "public"."lesson_blocks"("school_id","id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "block_image" ADD CONSTRAINT "block_image_school_id_schools_id_fk" FOREIGN KEY ("school_id") REFERENCES "public"."schools"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "block_image" ADD CONSTRAINT "block_image_school_id_block_id_lesson_blocks_school_id_id_fk" FOREIGN KEY ("school_id","block_id") REFERENCES "public"."lesson_blocks"("school_id","id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "courses" ADD CONSTRAINT "courses_school_id_cover_file_id_files_school_id_id_fk" FOREIGN KEY ("school_id","cover_file_id") REFERENCES "public"."files"("school_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE POLICY "block_file_tenant_isolation" ON "block_file" AS PERMISSIVE FOR ALL TO "app_user" USING ("block_file"."school_id" = nullif(current_setting('app.school_id', true), '')::uuid) WITH CHECK ("block_file"."school_id" = nullif(current_setting('app.school_id', true), '')::uuid);--> statement-breakpoint
CREATE POLICY "block_image_tenant_isolation" ON "block_image" AS PERMISSIVE FOR ALL TO "app_user" USING ("block_image"."school_id" = nullif(current_setting('app.school_id', true), '')::uuid) WITH CHECK ("block_image"."school_id" = nullif(current_setting('app.school_id', true), '')::uuid);--> statement-breakpoint
ALTER TABLE "block_image" ADD CONSTRAINT "block_image_school_id_file_id_files_fk" FOREIGN KEY ("school_id","file_id") REFERENCES "public"."files"("school_id","id") ON DELETE no action;--> statement-breakpoint
ALTER TABLE "block_file" ADD CONSTRAINT "block_file_school_id_file_id_files_fk" FOREIGN KEY ("school_id","file_id") REFERENCES "public"."files"("school_id","id") ON DELETE no action;
