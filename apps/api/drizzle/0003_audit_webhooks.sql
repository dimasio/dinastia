CREATE TYPE "public"."webhook_event_status" AS ENUM('received', 'processed', 'ignored');--> statement-breakpoint
CREATE TABLE "audit_log" (
	"id" uuid PRIMARY KEY DEFAULT uuidv7() NOT NULL,
	"school_id" uuid DEFAULT nullif(current_setting('app.school_id', true), '')::uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"actor_member_id" uuid,
	"action" text NOT NULL,
	"entity" text NOT NULL,
	"entity_id" uuid NOT NULL,
	"diff" jsonb,
	"request_id" text,
	"ip" text,
	CONSTRAINT "audit_log_school_id_id_key" UNIQUE("school_id","id")
);
--> statement-breakpoint
ALTER TABLE "audit_log" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "webhook_events" (
	"id" uuid PRIMARY KEY DEFAULT uuidv7() NOT NULL,
	"school_id" uuid DEFAULT nullif(current_setting('app.school_id', true), '')::uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"provider" text NOT NULL,
	"external_id" text NOT NULL,
	"type" text NOT NULL,
	"payload" jsonb NOT NULL,
	"status" "webhook_event_status" DEFAULT 'received' NOT NULL,
	"processed_at" timestamp with time zone,
	CONSTRAINT "webhook_events_school_id_id_key" UNIQUE("school_id","id")
);
--> statement-breakpoint
ALTER TABLE "webhook_events" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "audit_log" ADD CONSTRAINT "audit_log_school_id_schools_id_fk" FOREIGN KEY ("school_id") REFERENCES "public"."schools"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "audit_log" ADD CONSTRAINT "audit_log_school_id_actor_member_id_members_school_id_id_fk" FOREIGN KEY ("school_id","actor_member_id") REFERENCES "public"."members"("school_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "webhook_events" ADD CONSTRAINT "webhook_events_school_id_schools_id_fk" FOREIGN KEY ("school_id") REFERENCES "public"."schools"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "audit_log_school_id_created_at_index" ON "audit_log" USING btree ("school_id","created_at");--> statement-breakpoint
CREATE INDEX "audit_log_school_id_entity_entity_id_index" ON "audit_log" USING btree ("school_id","entity","entity_id");--> statement-breakpoint
CREATE UNIQUE INDEX "webhook_events_school_id_provider_external_id_index" ON "webhook_events" USING btree ("school_id","provider","external_id");--> statement-breakpoint
CREATE POLICY "audit_log_tenant_isolation" ON "audit_log" AS PERMISSIVE FOR ALL TO "app_user" USING ("audit_log"."school_id" = nullif(current_setting('app.school_id', true), '')::uuid) WITH CHECK ("audit_log"."school_id" = nullif(current_setting('app.school_id', true), '')::uuid);--> statement-breakpoint
CREATE POLICY "webhook_events_tenant_isolation" ON "webhook_events" AS PERMISSIVE FOR ALL TO "app_user" USING ("webhook_events"."school_id" = nullif(current_setting('app.school_id', true), '')::uuid) WITH CHECK ("webhook_events"."school_id" = nullif(current_setting('app.school_id', true), '')::uuid);--> statement-breakpoint
-- Журнал только дополняется (D-021): у роли приложения нет UPDATE и DELETE; строки уходят только каскадом со школой.
REVOKE UPDATE, DELETE, TRUNCATE ON "audit_log" FROM "app_user";
