ALTER TABLE "review" ADD COLUMN "guest_review" jsonb;--> statement-breakpoint
ALTER TABLE "review" ADD COLUMN "guest_review_state" text;--> statement-breakpoint
ALTER TABLE "review" ADD COLUMN "guest_reviewed_at" timestamp with time zone;