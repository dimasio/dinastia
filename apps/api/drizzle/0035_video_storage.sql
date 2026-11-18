-- Видео в хранилище школы (D-070): block_video.file_id → files (как block_file, 0010), индекс с school_id первым.
ALTER TABLE "block_video" ADD COLUMN "file_id" uuid;--> statement-breakpoint
CREATE INDEX "block_video_school_id_file_id_index" ON "block_video" USING btree ("school_id","file_id");--> statement-breakpoint
ALTER TABLE "block_video" ADD CONSTRAINT "block_video_school_id_file_id_files_fk" FOREIGN KEY ("school_id","file_id") REFERENCES "public"."files"("school_id","id") ON DELETE no action;
