CREATE TABLE "two_factors" (
	"id" uuid PRIMARY KEY DEFAULT uuidv7() NOT NULL,
	"secret" text NOT NULL,
	"backup_codes" text NOT NULL,
	"user_id" uuid NOT NULL,
	"verified" boolean DEFAULT true NOT NULL,
	"failed_verification_count" integer DEFAULT 0 NOT NULL,
	"locked_until" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "ops_audit" (
	"id" uuid PRIMARY KEY DEFAULT uuidv7() NOT NULL,
	"operator_id" uuid NOT NULL,
	"action" text NOT NULL,
	"school_id" uuid,
	"target" text,
	"diff" jsonb,
	"ip" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "invitations" ALTER COLUMN "invited_by" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "schools" ADD COLUMN "created_by_operator_id" uuid;--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "two_factor_enabled" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "two_factors" ADD CONSTRAINT "two_factors_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "two_factors_user_id_index" ON "two_factors" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "two_factors_secret_index" ON "two_factors" USING btree ("secret");--> statement-breakpoint
CREATE INDEX "ops_audit_created_at_index" ON "ops_audit" USING btree ("created_at");--> statement-breakpoint
CREATE INDEX "ops_audit_operator_id_index" ON "ops_audit" USING btree ("operator_id");--> statement-breakpoint
CREATE INDEX "ops_audit_school_id_index" ON "ops_audit" USING btree ("school_id");--> statement-breakpoint
-- журнал консоли — только добавление, как audit_log (D-048)
REVOKE UPDATE, DELETE, TRUNCATE ON "ops_audit" FROM "app_user";
