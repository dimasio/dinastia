CREATE TABLE "enrollment_invites" (
	"id" uuid PRIMARY KEY DEFAULT uuidv7() NOT NULL,
	"school_id" uuid DEFAULT nullif(current_setting('app.school_id', true), '')::uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"course_id" uuid NOT NULL,
	"email" text,
	"token_hash" text NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"max_uses" integer,
	"uses" integer DEFAULT 0 NOT NULL,
	"created_by_member_id" uuid NOT NULL,
	"revoked_at" timestamp with time zone,
	CONSTRAINT "enrollment_invites_token_hash_unique" UNIQUE("token_hash"),
	CONSTRAINT "enrollment_invites_school_id_id_key" UNIQUE("school_id","id")
);
--> statement-breakpoint
ALTER TABLE "enrollment_invites" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "enrollments" ADD COLUMN "invite_id" uuid;--> statement-breakpoint
ALTER TABLE "enrollment_invites" ADD CONSTRAINT "enrollment_invites_school_id_schools_id_fk" FOREIGN KEY ("school_id") REFERENCES "public"."schools"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "enrollment_invites" ADD CONSTRAINT "enrollment_invites_school_id_course_id_courses_school_id_id_fk" FOREIGN KEY ("school_id","course_id") REFERENCES "public"."courses"("school_id","id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "enrollment_invites" ADD CONSTRAINT "enrollment_invites_school_id_created_by_member_id_members_school_id_id_fk" FOREIGN KEY ("school_id","created_by_member_id") REFERENCES "public"."members"("school_id","id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "enrollment_invites_school_id_course_id_index" ON "enrollment_invites" USING btree ("school_id","course_id");--> statement-breakpoint
CREATE POLICY "enrollment_invites_tenant_isolation" ON "enrollment_invites" AS PERMISSIVE FOR ALL TO "app_user" USING ("enrollment_invites"."school_id" = nullif(current_setting('app.school_id', true), '')::uuid) WITH CHECK ("enrollment_invites"."school_id" = nullif(current_setting('app.school_id', true), '')::uuid);