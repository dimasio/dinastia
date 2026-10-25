CREATE TYPE "public"."file_status" AS ENUM('pending', 'ready');--> statement-breakpoint
CREATE TABLE "files" (
	"id" uuid PRIMARY KEY DEFAULT uuidv7() NOT NULL,
	"school_id" uuid DEFAULT nullif(current_setting('app.school_id', true), '')::uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"key" text NOT NULL,
	"purpose" text NOT NULL,
	"name" text NOT NULL,
	"mime" text NOT NULL,
	"size" integer NOT NULL,
	"owner_member_id" uuid,
	"status" "file_status" DEFAULT 'pending' NOT NULL,
	CONSTRAINT "files_key_unique" UNIQUE("key"),
	CONSTRAINT "files_school_id_id_key" UNIQUE("school_id","id")
);
--> statement-breakpoint
ALTER TABLE "files" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "members" ADD COLUMN "avatar_file_id" uuid;--> statement-breakpoint
ALTER TABLE "files" ADD CONSTRAINT "files_school_id_schools_id_fk" FOREIGN KEY ("school_id") REFERENCES "public"."schools"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "files_school_id_status_created_at_index" ON "files" USING btree ("school_id","status","created_at");--> statement-breakpoint
ALTER TABLE "members" ADD CONSTRAINT "members_school_id_avatar_file_id_files_school_id_id_fk" FOREIGN KEY ("school_id","avatar_file_id") REFERENCES "public"."files"("school_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE POLICY "files_tenant_isolation" ON "files" AS PERMISSIVE FOR ALL TO "app_user" USING ("files"."school_id" = nullif(current_setting('app.school_id', true), '')::uuid) WITH CHECK ("files"."school_id" = nullif(current_setting('app.school_id', true), '')::uuid);