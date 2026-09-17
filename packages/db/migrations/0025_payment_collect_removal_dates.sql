ALTER TABLE "property" ADD COLUMN "expected_removal_date" date;--> statement-breakpoint
ALTER TABLE "booking" ADD COLUMN "payment_collect" text;--> statement-breakpoint
ALTER TABLE "booking" ADD COLUMN "payment_type" text;--> statement-breakpoint
ALTER TABLE "channel_connection" ADD COLUMN "expected_removal_date" date;