ALTER TABLE "session" ADD COLUMN "prev_refresh_hash" text;--> statement-breakpoint
ALTER TABLE "session" ADD COLUMN "rotated_at" timestamp with time zone;