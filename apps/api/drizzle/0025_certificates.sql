CREATE TYPE "public"."certificate_orientation" AS ENUM('landscape', 'portrait');--> statement-breakpoint
CREATE TYPE "public"."certificate_status" AS ENUM('pending', 'ready', 'failed');--> statement-breakpoint
CREATE TABLE "certificate_counters" (
	"id" uuid PRIMARY KEY DEFAULT uuidv7() NOT NULL,
	"school_id" uuid DEFAULT nullif(current_setting('app.school_id', true), '')::uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"year" integer NOT NULL,
	"last_number" integer DEFAULT 0 NOT NULL,
	CONSTRAINT "certificate_counters_school_id_id_key" UNIQUE("school_id","id")
);
--> statement-breakpoint
ALTER TABLE "certificate_counters" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "certificate_templates" (
	"id" uuid PRIMARY KEY DEFAULT uuidv7() NOT NULL,
	"school_id" uuid DEFAULT nullif(current_setting('app.school_id', true), '')::uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"course_id" uuid NOT NULL,
	"enabled" boolean DEFAULT false NOT NULL,
	"orientation" "certificate_orientation" DEFAULT 'landscape' NOT NULL,
	"heading" text NOT NULL,
	"body" jsonb NOT NULL,
	"signer_name" text,
	"signer_title" text,
	"signature_file_id" uuid,
	"background_file_id" uuid,
	"show_number" boolean DEFAULT true NOT NULL,
	"show_date" boolean DEFAULT true NOT NULL,
	CONSTRAINT "certificate_templates_school_id_id_key" UNIQUE("school_id","id")
);
--> statement-breakpoint
ALTER TABLE "certificate_templates" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "certificates" (
	"id" uuid PRIMARY KEY DEFAULT uuidv7() NOT NULL,
	"school_id" uuid DEFAULT nullif(current_setting('app.school_id', true), '')::uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"enrollment_id" uuid NOT NULL,
	"course_id" uuid NOT NULL,
	"member_id" uuid NOT NULL,
	"number" text NOT NULL,
	"verify_code" text NOT NULL,
	"student_name" text NOT NULL,
	"course_title" text NOT NULL,
	"issued_at" timestamp with time zone DEFAULT now() NOT NULL,
	"layout" jsonb NOT NULL,
	"status" "certificate_status" DEFAULT 'pending' NOT NULL,
	"file_id" uuid,
	"revoked_at" timestamp with time zone,
	CONSTRAINT "certificates_school_id_id_key" UNIQUE("school_id","id")
);
--> statement-breakpoint
ALTER TABLE "certificates" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "certificate_counters" ADD CONSTRAINT "certificate_counters_school_id_schools_id_fk" FOREIGN KEY ("school_id") REFERENCES "public"."schools"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "certificate_templates" ADD CONSTRAINT "certificate_templates_school_id_schools_id_fk" FOREIGN KEY ("school_id") REFERENCES "public"."schools"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "certificate_templates" ADD CONSTRAINT "certificate_templates_school_id_course_id_courses_school_id_id_fk" FOREIGN KEY ("school_id","course_id") REFERENCES "public"."courses"("school_id","id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "certificates" ADD CONSTRAINT "certificates_school_id_schools_id_fk" FOREIGN KEY ("school_id") REFERENCES "public"."schools"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "certificates" ADD CONSTRAINT "certificates_school_id_enrollment_id_enrollments_school_id_id_fk" FOREIGN KEY ("school_id","enrollment_id") REFERENCES "public"."enrollments"("school_id","id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "certificates" ADD CONSTRAINT "certificates_school_id_course_id_courses_school_id_id_fk" FOREIGN KEY ("school_id","course_id") REFERENCES "public"."courses"("school_id","id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "certificates" ADD CONSTRAINT "certificates_school_id_member_id_members_school_id_id_fk" FOREIGN KEY ("school_id","member_id") REFERENCES "public"."members"("school_id","id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "certificate_counters_school_id_year_index" ON "certificate_counters" USING btree ("school_id","year");--> statement-breakpoint
CREATE UNIQUE INDEX "certificate_templates_school_id_course_id_index" ON "certificate_templates" USING btree ("school_id","course_id");--> statement-breakpoint
CREATE UNIQUE INDEX "certificates_school_id_enrollment_id_index" ON "certificates" USING btree ("school_id","enrollment_id");--> statement-breakpoint
CREATE UNIQUE INDEX "certificates_school_id_number_index" ON "certificates" USING btree ("school_id","number");--> statement-breakpoint
CREATE INDEX "certificates_school_id_course_id_index" ON "certificates" USING btree ("school_id","course_id");--> statement-breakpoint
CREATE INDEX "certificates_school_id_member_id_index" ON "certificates" USING btree ("school_id","member_id");--> statement-breakpoint
CREATE POLICY "certificate_counters_tenant_isolation" ON "certificate_counters" AS PERMISSIVE FOR ALL TO "app_user" USING ("certificate_counters"."school_id" = nullif(current_setting('app.school_id', true), '')::uuid) WITH CHECK ("certificate_counters"."school_id" = nullif(current_setting('app.school_id', true), '')::uuid);--> statement-breakpoint
CREATE POLICY "certificate_templates_tenant_isolation" ON "certificate_templates" AS PERMISSIVE FOR ALL TO "app_user" USING ("certificate_templates"."school_id" = nullif(current_setting('app.school_id', true), '')::uuid) WITH CHECK ("certificate_templates"."school_id" = nullif(current_setting('app.school_id', true), '')::uuid);--> statement-breakpoint
CREATE POLICY "certificates_tenant_isolation" ON "certificates" AS PERMISSIVE FOR ALL TO "app_user" USING ("certificates"."school_id" = nullif(current_setting('app.school_id', true), '')::uuid) WITH CHECK ("certificates"."school_id" = nullif(current_setting('app.school_id', true), '')::uuid);