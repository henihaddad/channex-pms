ALTER TABLE "review" ADD COLUMN "received_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "review" ADD COLUMN "ota_reservation_code" text;--> statement-breakpoint
ALTER TABLE "review" ADD COLUMN "reply_expires_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "review" ADD COLUMN "hidden" boolean DEFAULT false NOT NULL;