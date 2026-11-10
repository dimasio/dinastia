CREATE TABLE "group_curators" (
	"id" uuid PRIMARY KEY DEFAULT uuidv7() NOT NULL,
	"school_id" uuid DEFAULT nullif(current_setting('app.school_id', true), '')::uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"group_id" uuid NOT NULL,
	"member_id" uuid NOT NULL,
	CONSTRAINT "group_curators_school_id_id_key" UNIQUE("school_id","id")
);
--> statement-breakpoint
ALTER TABLE "group_curators" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "groups" (
	"id" uuid PRIMARY KEY DEFAULT uuidv7() NOT NULL,
	"school_id" uuid DEFAULT nullif(current_setting('app.school_id', true), '')::uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"course_id" uuid NOT NULL,
	"title" text NOT NULL,
	"starts_at" timestamp with time zone,
	"ends_at" timestamp with time zone,
	"access_days" integer,
	CONSTRAINT "groups_school_id_id_key" UNIQUE("school_id","id")
);
--> statement-breakpoint
ALTER TABLE "groups" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "enrollment_invites" ADD COLUMN "group_id" uuid;--> statement-breakpoint
ALTER TABLE "enrollments" ADD COLUMN "group_id" uuid;--> statement-breakpoint
ALTER TABLE "group_curators" ADD CONSTRAINT "group_curators_school_id_schools_id_fk" FOREIGN KEY ("school_id") REFERENCES "public"."schools"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "group_curators" ADD CONSTRAINT "group_curators_school_id_group_id_groups_school_id_id_fk" FOREIGN KEY ("school_id","group_id") REFERENCES "public"."groups"("school_id","id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "group_curators" ADD CONSTRAINT "group_curators_school_id_member_id_members_school_id_id_fk" FOREIGN KEY ("school_id","member_id") REFERENCES "public"."members"("school_id","id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "groups" ADD CONSTRAINT "groups_school_id_schools_id_fk" FOREIGN KEY ("school_id") REFERENCES "public"."schools"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "groups" ADD CONSTRAINT "groups_school_id_course_id_courses_school_id_id_fk" FOREIGN KEY ("school_id","course_id") REFERENCES "public"."courses"("school_id","id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "group_curators_school_id_group_id_member_id_index" ON "group_curators" USING btree ("school_id","group_id","member_id");--> statement-breakpoint
CREATE INDEX "group_curators_school_id_member_id_index" ON "group_curators" USING btree ("school_id","member_id");--> statement-breakpoint
CREATE INDEX "groups_school_id_course_id_index" ON "groups" USING btree ("school_id","course_id");--> statement-breakpoint
ALTER TABLE "enrollment_invites" ADD CONSTRAINT "enrollment_invites_school_id_group_id_groups_school_id_id_fk" FOREIGN KEY ("school_id","group_id") REFERENCES "public"."groups"("school_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "enrollments" ADD CONSTRAINT "enrollments_school_id_group_id_groups_school_id_id_fk" FOREIGN KEY ("school_id","group_id") REFERENCES "public"."groups"("school_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "enrollments_school_id_group_id_index" ON "enrollments" USING btree ("school_id","group_id");--> statement-breakpoint
CREATE POLICY "group_curators_tenant_isolation" ON "group_curators" AS PERMISSIVE FOR ALL TO "app_user" USING ("group_curators"."school_id" = nullif(current_setting('app.school_id', true), '')::uuid) WITH CHECK ("group_curators"."school_id" = nullif(current_setting('app.school_id', true), '')::uuid);--> statement-breakpoint
CREATE POLICY "groups_tenant_isolation" ON "groups" AS PERMISSIVE FOR ALL TO "app_user" USING ("groups"."school_id" = nullif(current_setting('app.school_id', true), '')::uuid) WITH CHECK ("groups"."school_id" = nullif(current_setting('app.school_id', true), '')::uuid);