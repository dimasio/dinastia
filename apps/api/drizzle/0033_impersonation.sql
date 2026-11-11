ALTER TABLE "schools" ADD COLUMN "support_access_until" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "audit_log" ADD COLUMN "actor_operator_id" uuid;--> statement-breakpoint
ALTER TABLE "sessions" ADD COLUMN "impersonated_by" uuid;--> statement-breakpoint
ALTER TABLE "sessions" ADD COLUMN "impersonation_school_id" uuid;