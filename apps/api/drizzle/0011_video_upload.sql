ALTER TABLE "block_video" ADD COLUMN "source" text DEFAULT 'link' NOT NULL;--> statement-breakpoint
ALTER TABLE "block_video" ADD COLUMN "provider" text;--> statement-breakpoint
ALTER TABLE "block_video" ADD COLUMN "video_id" text;--> statement-breakpoint
ALTER TABLE "block_video" ADD COLUMN "status" text;