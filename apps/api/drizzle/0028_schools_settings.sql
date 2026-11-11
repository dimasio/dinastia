CREATE TABLE "schools_settings" (
	"school_id" uuid PRIMARY KEY DEFAULT nullif(current_setting('app.school_id', true), '')::uuid NOT NULL,
	"pd_operator" text DEFAULT '' NOT NULL,
	"pd_contact" text DEFAULT '' NOT NULL,
	"privacy_url" text DEFAULT '' NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "schools_settings" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "schools_settings" ADD CONSTRAINT "schools_settings_school_id_schools_id_fk" FOREIGN KEY ("school_id") REFERENCES "public"."schools"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE POLICY "schools_settings_tenant_isolation" ON "schools_settings" AS PERMISSIVE FOR ALL TO "app_user" USING ("schools_settings"."school_id" = nullif(current_setting('app.school_id', true), '')::uuid) WITH CHECK ("schools_settings"."school_id" = nullif(current_setting('app.school_id', true), '')::uuid);