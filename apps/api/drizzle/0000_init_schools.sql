CREATE TYPE "public"."school_status" AS ENUM('active', 'suspended', 'deleted');--> statement-breakpoint
CREATE TABLE "schools" (
	"id" uuid PRIMARY KEY DEFAULT uuidv7() NOT NULL,
	"slug" text NOT NULL,
	"name" text NOT NULL,
	"status" "school_status" DEFAULT 'active' NOT NULL,
	"timezone" text DEFAULT 'Europe/Moscow' NOT NULL,
	"locale" text DEFAULT 'ru' NOT NULL,
	"deletion_requested_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "schools_slug_unique" UNIQUE("slug")
);
