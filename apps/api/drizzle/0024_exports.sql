CREATE TYPE "public"."export_status" AS ENUM('pending', 'ready', 'failed');--> statement-breakpoint
CREATE TABLE "exports" (
	"id" uuid PRIMARY KEY DEFAULT uuidv7() NOT NULL,
	"school_id" uuid DEFAULT nullif(current_setting('app.school_id', true), '')::uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"key" text NOT NULL,
	"params" jsonb NOT NULL,
	"status" "export_status" DEFAULT 'pending' NOT NULL,
	"requested_by_member_id" uuid NOT NULL,
	"file_id" uuid,
	"rows" integer DEFAULT 0 NOT NULL,
	"finished_at" timestamp with time zone,
	"expires_at" timestamp with time zone NOT NULL,
	CONSTRAINT "exports_school_id_id_key" UNIQUE("school_id","id")
);
--> statement-breakpoint
ALTER TABLE "exports" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "exports" ADD CONSTRAINT "exports_school_id_schools_id_fk" FOREIGN KEY ("school_id") REFERENCES "public"."schools"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "exports_school_id_expires_at_index" ON "exports" USING btree ("school_id","expires_at");--> statement-breakpoint
CREATE POLICY "exports_tenant_isolation" ON "exports" AS PERMISSIVE FOR ALL TO "app_user" USING ("exports"."school_id" = nullif(current_setting('app.school_id', true), '')::uuid) WITH CHECK ("exports"."school_id" = nullif(current_setting('app.school_id', true), '')::uuid);