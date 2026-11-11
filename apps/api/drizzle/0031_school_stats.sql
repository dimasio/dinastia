CREATE TABLE "school_stats" (
	"school_id" uuid PRIMARY KEY NOT NULL,
	"students" integer DEFAULT 0 NOT NULL,
	"active_students_30d" integer DEFAULT 0 NOT NULL,
	"courses" integer DEFAULT 0 NOT NULL,
	"storage_bytes" bigint DEFAULT 0 NOT NULL,
	"owner_email" text,
	"last_activity_at" timestamp with time zone,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "school_stats" ADD CONSTRAINT "school_stats_school_id_schools_id_fk" FOREIGN KEY ("school_id") REFERENCES "public"."schools"("id") ON DELETE cascade ON UPDATE no action;