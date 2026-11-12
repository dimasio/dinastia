CREATE TYPE "public"."branding_font" AS ENUM('system', 'pt-sans', 'inter', 'montserrat', 'roboto', 'pt-serif');--> statement-breakpoint
CREATE TYPE "public"."branding_radius" AS ENUM('none', 'small', 'medium', 'large');--> statement-breakpoint
CREATE TYPE "public"."color_scheme" AS ENUM('light', 'dark', 'system');--> statement-breakpoint
CREATE TABLE "school_branding" (
	"school_id" uuid PRIMARY KEY DEFAULT nullif(current_setting('app.school_id', true), '')::uuid NOT NULL,
	"logo_file_id" uuid,
	"favicon_file_id" uuid,
	"primary_color" text,
	"accent_color" text,
	"font" "branding_font" DEFAULT 'system' NOT NULL,
	"radius" "branding_radius" DEFAULT 'medium' NOT NULL,
	"default_scheme" "color_scheme" DEFAULT 'system' NOT NULL,
	"version" integer DEFAULT 1 NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "school_branding" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "school_branding" ADD CONSTRAINT "school_branding_school_id_schools_id_fk" FOREIGN KEY ("school_id") REFERENCES "public"."schools"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "school_branding" ADD CONSTRAINT "school_branding_school_id_logo_file_id_files_school_id_id_fk" FOREIGN KEY ("school_id","logo_file_id") REFERENCES "public"."files"("school_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "school_branding" ADD CONSTRAINT "school_branding_school_id_favicon_file_id_files_school_id_id_fk" FOREIGN KEY ("school_id","favicon_file_id") REFERENCES "public"."files"("school_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "school_branding_school_id_logo_file_id_index" ON "school_branding" USING btree ("school_id","logo_file_id");--> statement-breakpoint
CREATE INDEX "school_branding_school_id_favicon_file_id_index" ON "school_branding" USING btree ("school_id","favicon_file_id");--> statement-breakpoint
CREATE POLICY "school_branding_tenant_isolation" ON "school_branding" AS PERMISSIVE FOR ALL TO "app_user" USING ("school_branding"."school_id" = nullif(current_setting('app.school_id', true), '')::uuid) WITH CHECK ("school_branding"."school_id" = nullif(current_setting('app.school_id', true), '')::uuid);